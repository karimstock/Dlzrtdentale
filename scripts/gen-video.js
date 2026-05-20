#!/usr/bin/env node
/**
 * Génère UNE vidéo walkthrough via Vidu et la télécharge
 * Usage : node scripts/gen-video.js <id> "<prompt>"
 * Ex : node scripts/gen-video.js avocat "Slow tracking shot entering law firm..."
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const VIDU_KEY = process.env.VIDU_API_KEY;
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'studio', 'generated');
const id = process.argv[2];
const prompt = process.argv[3];

if (!id || !prompt) { console.error('Usage: node gen-video.js <id> "<prompt>"'); process.exit(1); }

const dest = path.join(OUTPUT_DIR, 'video-cabinet-' + id + '.mp4');
if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
  console.log('SKIP — ' + dest + ' exists (' + Math.round(fs.statSync(dest).size/1024) + 'KB)');
  process.exit(0);
}

function viduPost(apiPath, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request({ hostname: 'api.vidu.com', path: '/ent/v2' + apiPath, method: 'POST',
      headers: { 'Authorization': 'Token ' + VIDU_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: 30000
    }, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve(JSON.parse(d))}catch(e){reject(new Error(d.substring(0,200)))} }); });
    req.on('error', reject); req.end(payload);
  });
}

function viduGet(apiPath) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: 'api.vidu.com', path: '/ent/v2' + apiPath, method: 'GET',
      headers: { 'Authorization': 'Token ' + VIDU_KEY }, timeout: 15000
    }, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve(JSON.parse(d))}catch(e){reject(new Error(d.substring(0,200)))} }); });
    req.on('error', reject); req.end();
  });
}

async function main() {
  console.log('=== Generating: ' + id + ' ===');

  // 1. Créer la tâche
  const result = await viduPost('/text2video', {
    model: 'viduq3-turbo', prompt, duration: 8,
    aspect_ratio: '16:9', resolution: '720p', style: 'general', movement_amplitude: 'medium'
  });
  const taskId = result.task_id;
  if (!taskId) { console.error('No task_id:', JSON.stringify(result).substring(0,300)); process.exit(1); }
  console.log('Task:', taskId);

  // 2. Poller le statut
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const status = await viduGet('/tasks/' + taskId + '/creations');
    console.log('  [' + (i+1) + '] state:', status.state);
    if (status.state === 'success' && status.creations && status.creations[0]) {
      const url = status.creations[0].url;
      console.log('  Video URL:', url.substring(0, 80) + '...');
      // 3. Télécharger avec curl (gère les redirects CF)
      execSync('curl -sL -o "' + dest + '" "' + url + '"', { timeout: 120000 });
      const size = fs.statSync(dest).size;
      if (size < 1000) { console.error('Download failed (' + size + ' bytes)'); fs.unlinkSync(dest); process.exit(1); }
      console.log('DONE: ' + Math.round(size/1024) + 'KB → ' + dest);
      return;
    }
    if (status.state === 'failed') { console.error('FAILED:', JSON.stringify(status).substring(0,300)); process.exit(1); }
  }
  console.error('TIMEOUT after 10 minutes');
  process.exit(1);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
