#!/usr/bin/env node
// =============================================
// JADOMI — Génération vidéos brossage enfant
// Vidu AI v2 (api.vidu.com/ent/v2/img2video)
// =============================================

require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.VIDU_API_KEY;
if (!API_KEY) { console.error('❌ VIDU_API_KEY manquante'); process.exit(1); }

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'studio', 'assets', 'brossage');
const BASE_URL = 'https://jadomi.fr/studio/assets';

// ── Clips à générer ──
const CLIPS = [
  {
    name: 'licorne-danse',
    image_url: `${BASE_URL}/mascottes/mascotte-licorne.png`,
    prompt: 'A cute cartoon unicorn mascot dancing happily, bouncing up and down with sparkles around, cheerful colorful animation for children, Pixar kids style, bright pastel background, smooth joyful movements',
    duration: 4,
  },
  {
    name: 'dents-brossage',
    image_url: `${BASE_URL}/brossage/brosse-a-dents.png`,
    prompt: 'A colorful cartoon toothbrush brushing back and forth with foamy toothpaste bubbles, sparkling clean animation, fun bouncy movement, children dental hygiene, Pixar kids style',
    duration: 4,
  },
  {
    name: 'dents-transformation',
    image_url: `${BASE_URL}/brossage/dents-sales.png`,
    prompt: 'Cute cartoon dirty teeth with adorable microbes gradually becoming sparkling clean white teeth, transformation animation, sparkles appearing, happy faces on teeth, Pixar kids style for children',
    duration: 4,
  },
  {
    name: 'etoile-bravo',
    image_url: `${BASE_URL}/brossage/etoile-recompense.png`,
    prompt: 'A golden star reward spinning and glowing with sparkles and confetti, celebration animation, joyful mood, children reward animation, Pixar kids style, bright background',
    duration: 4,
  },
];

// ── Vidu API v2 helpers ──
function viduRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.vidu.com',
      path: '/ent/v2' + endpoint,
      method,
      headers: {
        'Authorization': `Token ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`Vidu ${res.statusCode}: ${JSON.stringify(parsed).substring(0, 500)}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Vidu parse error (${res.statusCode}): ${data.substring(0, 300)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Vidu timeout')); });
    if (payload) req.end(payload);
    else req.end();
  });
}

async function pollTask(taskId) {
  const maxAttempts = 120;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const resp = await viduRequest('GET', `/tasks?task_ids=${taskId}`);
    const task = resp.tasks?.[0] || resp;
    const state = task.state || task.status;

    if (state === 'success' || state === 'completed') {
      const creation = task.creations?.[0] || {};
      return {
        videoUrl: creation.url || task.video_url,
        coverUrl: creation.cover_url || task.thumbnail_url,
      };
    }
    if (state === 'failed') {
      throw new Error(`Failed: ${task.err_msg || task.error || 'unknown'}`);
    }
    if (i % 6 === 0) process.stdout.write('.');
  }
  throw new Error('Timeout 10min');
}

async function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const get = (u) => {
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return get(res.headers.location);
        }
        const ws = fs.createWriteStream(outputPath);
        res.pipe(ws);
        ws.on('finish', () => { ws.close(); resolve(outputPath); });
        ws.on('error', reject);
      }).on('error', reject);
    };
    get(url);
  });
}

async function generateClip(clip) {
  console.log(`\n🎬 ${clip.name} — img2video ${clip.duration}s`);

  const cost = clip.duration * 0.03;
  console.log(`💰 Coût estimé : $${cost.toFixed(3)}`);
  fs.appendFileSync('/tmp/vidu-spending.log',
    `[${new Date().toISOString()}] brossage-${clip.name} | ${clip.duration}s 720p | $${cost}\n`);

  const body = {
    model: 'viduq3-turbo',
    prompt: clip.prompt,
    images: [clip.image_url],
    duration: clip.duration,
    resolution: '720p',
  };

  console.log('📤 Envoi à Vidu API v2...');
  const createResp = await viduRequest('POST', '/img2video', body);
  console.log('📋 Réponse:', JSON.stringify(createResp).substring(0, 200));

  const taskId = createResp.task_id || createResp.id;
  if (!taskId) throw new Error('Pas de task_id dans la réponse');

  console.log(`⏳ Task ${taskId} — polling...`);
  const result = await pollTask(taskId);

  if (result.videoUrl) {
    const outputPath = path.join(OUTPUT_DIR, `${clip.name}.mp4`);
    console.log(`📥 Download: ${result.videoUrl.substring(0, 80)}...`);
    await downloadFile(result.videoUrl, outputPath);
    const size = fs.statSync(outputPath).size;
    console.log(`✅ ${clip.name}.mp4 — ${(size / 1024).toFixed(0)} KB`);
    return outputPath;
  } else {
    throw new Error('Pas de videoUrl dans le résultat');
  }
}

// ── Vérifier crédits d'abord ──
async function checkCredits() {
  try {
    const resp = await viduRequest('GET', '/credits');
    console.log(`💳 Crédits Vidu : ${JSON.stringify(resp)}`);
    return resp;
  } catch (err) {
    console.log(`⚠️ Impossible de vérifier les crédits: ${err.message}`);
    return null;
  }
}

// ── Exécution séquentielle ──
async function main() {
  console.log('🎬 Génération des clips vidéo brossage via Vidu AI v2');
  console.log(`📊 ${CLIPS.length} clips × ${CLIPS[0].duration}s`);
  console.log(`💰 Coût total estimé : $${(CLIPS.reduce((s, c) => s + c.duration * 0.03, 0)).toFixed(2)}\n`);

  await checkCredits();

  const results = [];
  for (const clip of CLIPS) {
    try {
      const p = await generateClip(clip);
      results.push({ name: clip.name, path: p, status: 'ok' });
    } catch (err) {
      console.error(`\n❌ ${clip.name} échoué :`, err.message);
      results.push({ name: clip.name, status: 'error', error: err.message });
    }
  }

  console.log('\n\n══════ RÉSULTATS ══════');
  for (const r of results) {
    const icon = r.status === 'ok' ? '✅' : '❌';
    console.log(`${icon} ${r.name} — ${r.path || r.error}`);
  }
}

main().catch(err => { console.error('💥 Fatal:', err.message); process.exit(1); });
