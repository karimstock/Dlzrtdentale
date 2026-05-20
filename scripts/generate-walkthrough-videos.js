#!/usr/bin/env node
/**
 * Génère les vidéos walkthrough pour chaque métier via Vidu text2video
 * Usage : node scripts/generate-walkthrough-videos.js
 *
 * Chaque vidéo est un travelling fluide dans l'univers professionnel du métier.
 * Durée : 8s chacune, résolution 720p, modèle q3-turbo
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const https = require('https');
const fs = require('fs');
const path = require('path');

const VIDU_KEY = process.env.VIDU_API_KEY;
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'studio', 'generated');

const VIDEOS = [
  {
    id: 'avocat',
    filename: 'video-cabinet-avocat.mp4',
    prompt: 'Slow cinematic tracking shot entering a prestigious French law firm. Dark wood paneling, leather chairs, floor-to-ceiling bookshelves filled with law books, warm amber lighting, mahogany desk with brass lamp, French tricolor flag, diplomas on wall, marble floor, elegant staircase visible in background. Professional, sophisticated, prestigious atmosphere. Steady smooth camera movement forward through the space. 4K cinematic quality, shallow depth of field, warm color grading.'
  },
  {
    id: 'kine',
    filename: 'video-cabinet-kine.mp4',
    prompt: 'Slow cinematic tracking shot entering a modern physiotherapy clinic. Clean white and green interior, treatment tables with fresh linens, exercise equipment, foam rollers, resistance bands on hooks, large windows with natural light, potted plants, zen atmosphere, wooden accents, soft lighting. A calm healing environment. Steady smooth camera movement forward through the space. 4K cinematic quality, warm natural light, shallow depth of field.'
  },
  {
    id: 'btp',
    filename: 'video-cabinet-btp.mp4',
    prompt: 'Slow cinematic tracking shot through a modern construction company office and workshop. Start in a professional office with architectural plans on desk, hard hats on shelf, then transition to a bright workshop with power tools organized on pegboard, lumber stacks, concrete samples, a worker examining blueprints, construction safety equipment. Orange and grey industrial aesthetic. Steady smooth camera movement. 4K cinematic quality, natural workshop lighting.'
  },
  {
    id: 'beaute',
    filename: 'video-cabinet-beaute.mp4',
    prompt: 'Slow cinematic tracking shot entering a luxurious French hair salon and beauty parlor. Rose gold mirrors, marble countertops, styling chairs in black leather, professional hair products on sleek shelves, soft ambient lighting, fresh flowers, elegant reception desk, crystal chandelier reflection, plush waiting area. Chic Parisian aesthetic. Steady smooth camera movement forward. 4K cinematic quality, warm golden light, shallow depth of field.'
  },
  {
    id: 'immo',
    filename: 'video-cabinet-immo.mp4',
    prompt: 'Slow cinematic tracking shot entering a high-end French real estate agency. Modern glass-front office, city view through floor-to-ceiling windows, property display screens on walls showing luxury apartments, sleek white desk with laptop, architectural models, elegant furniture, navy blue and gold accents, marble reception. Premium investment atmosphere. Steady smooth camera movement forward. 4K cinematic quality, cool blue tones with warm accents.'
  },
  {
    id: 'ortho',
    filename: 'video-cabinet-ortho.mp4',
    prompt: 'Slow cinematic tracking shot entering a modern orthodontics office. Clean bright interior with dental chairs, intraoral scanners, 3D printed dental models on display, teenager smiling showing clear aligners, digital screens showing before-after teeth alignments, colorful accent walls, friendly atmosphere, modern equipment. Steady smooth camera movement forward. 4K cinematic quality, bright clean lighting.'
  },
  {
    id: 'prothesiste',
    filename: 'video-cabinet-prothesiste.mp4',
    prompt: 'Slow cinematic tracking shot through a dental prosthetics laboratory. Start at entrance, move past workbenches with microscopes, dental articulator machines, porcelain furnace glowing orange, technician sculpting a dental crown under magnification, 3D printer producing dental models, CAD/CAM computer screen showing crown design, organized material shelves with zirconia blocks and ceramic powders. Technical precision atmosphere. Steady smooth camera. 4K cinematic, warm workshop light.'
  }
];

function viduRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.vidu.com',
      path: '/ent/v2' + apiPath,
      method,
      headers: { 'Authorization': 'Bearer ' + VIDU_KEY, 'Content-Type': 'application/json' },
      timeout: 30000,
    };
    if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload);
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Parse error: ' + data.substring(0, 300))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (payload) req.end(payload); else req.end();
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : require('http');
    mod.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

async function pollTask(taskId, maxWait = 300000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const result = await viduRequest('GET', '/tasks/' + taskId, null);
    const status = result.status || result.state;
    console.log(`  [${taskId}] status: ${status}`);

    if (status === 'success' || status === 'completed') {
      const videoUrl = result.video_url || (result.output && result.output.video_url) ||
                       (result.result && result.result.video_url) ||
                       (result.output && result.output[0] && result.output[0].video_url);
      return videoUrl;
    }
    if (status === 'failed' || status === 'error') {
      throw new Error('Vidu task failed: ' + JSON.stringify(result).substring(0, 300));
    }

    await new Promise(r => setTimeout(r, 10000)); // poll toutes les 10s
  }
  throw new Error('Timeout waiting for Vidu task ' + taskId);
}

async function generateVideo(video) {
  console.log(`\n=== Generating: ${video.id} ===`);
  console.log(`Prompt: ${video.prompt.substring(0, 80)}...`);

  const dest = path.join(OUTPUT_DIR, video.filename);
  if (fs.existsSync(dest)) {
    console.log(`  SKIP — ${video.filename} exists already (${Math.round(fs.statSync(dest).size / 1024)}KB)`);
    return { id: video.id, status: 'skipped', file: dest };
  }

  const body = {
    type: 'text2video',
    model_version: 'q3-turbo',
    input: { prompts: [{ type: 'text', content: video.prompt }] },
    output_params: { duration: 8, resolution: '720', aspect_ratio: '16:9' },
  };

  const result = await viduRequest('POST', '/tasks', body);
  const taskId = result.task_id || result.id || result.generation_id;
  if (!taskId) throw new Error('No task_id: ' + JSON.stringify(result).substring(0, 300));

  console.log(`  Task created: ${taskId}`);
  const videoUrl = await pollTask(taskId);

  if (!videoUrl) throw new Error('No video URL returned for ' + video.id);

  console.log(`  Downloading: ${videoUrl.substring(0, 80)}...`);
  await downloadFile(videoUrl, dest);
  const size = Math.round(fs.statSync(dest).size / 1024);
  console.log(`  DONE — ${video.filename} (${size}KB)`);

  return { id: video.id, status: 'done', file: dest, size };
}

async function main() {
  console.log('=== JADOMI Walkthrough Video Generator ===');
  console.log(`${VIDEOS.length} videos to generate`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results = [];
  for (const v of VIDEOS) {
    try {
      const r = await generateVideo(v);
      results.push(r);
    } catch (e) {
      console.error(`  ERROR ${v.id}: ${e.message}`);
      results.push({ id: v.id, status: 'error', error: e.message });
    }
  }

  console.log('\n=== RESULTS ===');
  results.forEach(r => console.log(`${r.id}: ${r.status}${r.size ? ' (' + r.size + 'KB)' : ''}`));
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
