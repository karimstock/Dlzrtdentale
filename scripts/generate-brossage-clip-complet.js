#!/usr/bin/env node
// =============================================
// JADOMI — Clip brossage complet 1min30
// 8 scènes synchronisées avec la chanson
// GPT-Image-1 (base) + Vidu AI v2 (animation)
// =============================================

require('dotenv').config({ path: '/home/ubuntu/jadomi/.env' });
const OpenAI = require('openai');
const https = require('https');
const fs = require('fs');
const path = require('path');

const VIDU_KEY = process.env.VIDU_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!VIDU_KEY) { console.error('VIDU_API_KEY manquante'); process.exit(1); }
if (!OPENAI_KEY) { console.error('OPENAI_API_KEY manquante'); process.exit(1); }

const openai = new OpenAI({ apiKey: OPENAI_KEY });
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'studio', 'assets', 'brossage');
const BASE_URL = 'https://jadomi.fr/studio/assets/brossage';

// ══════════════════════════════════════════════════════════
// 8 SCÈNES — Timeline synchronisée chanson 90s
// ══════════════════════════════════════════════════════════

const SCENES = [
  // ── INTRO INSTRUMENTALE (0s-11s) ──
  {
    id: 'scene1-reveil',
    time: '0s-5s',
    imagePrompt: `A cute cartoon unicorn character (purple/pink fur, big sparkly blue eyes, small golden horn, fluffy mane) waking up in a cozy colorful children's bedroom, stretching and yawning adorably. Morning sunlight through the window. Stuffed animals on the bed. Pixar/Disney 3D cartoon style, warm soft lighting, premium kids movie quality illustration, 16:9 wide format.`,
    viduPrompt: 'The cute cartoon unicorn stretches and yawns adorably in bed, then sits up with a big smile, eyes lighting up with excitement. Morning sunlight fills the room. Smooth gentle waking up animation, warm cozy atmosphere, Pixar kids movie quality.',
  },
  {
    id: 'scene2-marche-sdb',
    time: '5s-11s',
    imagePrompt: `A cute cartoon unicorn character (purple/pink fur, big sparkly blue eyes, golden horn) walking cheerfully down a colorful hallway toward a bathroom door, seen from behind at a slight angle. The bathroom door is open with warm light glowing from inside. Cartoon mom and dad peek from behind, smiling. Pastel colored walls with children's drawings. Pixar/Disney 3D cartoon style, warm lighting, premium kids movie quality, 16:9 wide format.`,
    viduPrompt: 'The cute cartoon unicorn walks happily down the hallway toward the bathroom, bouncing slightly with each step, tail swaying. Mom and dad follow behind smiling. The unicorn reaches the bathroom door and steps inside. Smooth walking animation, cheerful atmosphere, Pixar quality.',
  },

  // ── COUPLET 1 "EN HAUT" (11s-31s) ──
  {
    id: 'scene3-brosse-haut',
    time: '11s-21s',
    imagePrompt: `A cute cartoon unicorn character (purple/pink fur, big sparkly eyes) standing on a small step stool at a children's bathroom sink, holding a colorful toothbrush and brushing her TOP teeth with her mouth open. Cartoon mom stands beside her, also holding a toothbrush and demonstrating the brushing motion, smiling warmly. Foamy toothpaste bubbles. Pastel bathroom tiles, round mirror on wall. Pixar/Disney 3D cartoon style, bright cheerful lighting, premium quality, 16:9 wide format.`,
    viduPrompt: 'The cartoon unicorn brushes her top teeth with gentle back-and-forth strokes, toothpaste foam bubbling. Mom beside her demonstrates the same motion in sync, both looking at each other and smiling. Small sparkles appear on the teeth being cleaned. Fun bouncy cheerful animation, Pixar quality.',
  },
  {
    id: 'scene4-etoiles-haut',
    time: '21s-31s',
    imagePrompt: `Close-up of the cute cartoon unicorn's face showing her TOP teeth being brushed, with the teeth transforming from slightly yellow to sparkling white. Tiny golden stars and sparkle effects around the clean teeth. The unicorn has a proud happy expression. Foamy toothpaste bubbles floating. Soft pastel bathroom background blurred. Pixar/Disney 3D cartoon style, bright sparkly lighting, premium quality, 16:9 wide format.`,
    viduPrompt: 'Close-up of the unicorn brushing top teeth, with sparkles and golden stars appearing on each tooth as it becomes clean and white. The unicorn smiles proudly as the teeth transform from dull to sparkling. Magical sparkle effects, smooth satisfying animation, Pixar quality.',
  },

  // ── COUPLET 2 "EN BAS" (31s-51s) ──
  {
    id: 'scene5-brosse-bas',
    time: '31s-41s',
    imagePrompt: `A cute cartoon unicorn character (purple/pink fur, sparkly eyes) brushing her BOTTOM teeth with circular motions, looking at herself in a round bathroom mirror with a focused determined cute expression. Cartoon dad is kneeling beside her, giving an enthusiastic thumbs up with a big proud smile. More toothpaste foam. Small sparkles on clean bottom teeth. Pastel bathroom, step stool at sink. Pixar/Disney 3D cartoon style, warm encouraging lighting, premium quality, 16:9 wide format.`,
    viduPrompt: 'The cartoon unicorn carefully brushes her bottom teeth with circular motions while looking in the mirror. Dad kneels beside her giving thumbs up and nodding approvingly. Sparkles appear on clean teeth. Focused but happy atmosphere, smooth brushing animation, Pixar quality.',
  },
  {
    id: 'scene6-droite-gauche',
    time: '41s-56s',
    imagePrompt: `A cute cartoon unicorn character (purple/pink fur, sparkly eyes) brushing the SIDES of her teeth, moving the toothbrush to the right side then the left side. Her cheek is puffed out adorably on one side. Both cartoon mom and dad are behind her clapping gently and encouraging. The bathroom mirror shows her reflection. Small musical notes floating in the air. Pastel bathroom. Pixar/Disney 3D cartoon style, fun dynamic lighting, premium quality, 16:9 wide format.`,
    viduPrompt: 'The cartoon unicorn brushes the right side, then switches to the left side of her teeth, cheeks puffing adorably. She sticks out her tongue with a funny "blaaaa" expression. Mom and dad behind her laugh and clap. Musical notes float around. Playful energetic animation, Pixar quality.',
  },

  // ── REFRAIN (56s-76s) ──
  {
    id: 'scene7-dents-brillent',
    time: '56s-76s',
    imagePrompt: `A cute cartoon unicorn character (purple/pink fur, sparkly eyes) showing off her perfectly clean SPARKLING white teeth with the biggest happiest smile, arms spread wide in triumph. Her teeth are literally glowing with white light and sparkles. Cartoon mom and dad on each side are dancing and celebrating, also showing their clean teeth. Rainbow sparkles, golden stars, and small hearts floating everywhere. Pastel bathroom background. Pixar/Disney 3D cartoon style, magical glowing lighting, celebration mood, premium quality, 16:9 wide format.`,
    viduPrompt: 'The cartoon unicorn shows off her perfectly sparkling white teeth with a huge proud smile, arms spread wide. Mom and dad dance on each side, everyone celebrating together. Rainbow sparkles, golden stars and hearts float around them. Joyful dancing celebration, magical sparkle effects, Pixar quality.',
  },

  // ── OUTRO "BRAVO CHAMPION" (76s-90s) ──
  {
    id: 'scene8-bravo-calin',
    time: '76s-90s',
    imagePrompt: `A cute cartoon unicorn character (purple/pink fur, sparkly eyes) receiving a big warm GROUP HUG from cartoon mom and dad, all three embracing lovingly. The unicorn wears a golden star medal/badge that says "BRAVO". Colorful confetti and golden stars raining down from above. Hearts floating around the family. The background is a warm golden glow. Pixar/Disney 3D cartoon style, heartwarming emotional lighting, celebration and love, premium quality, 16:9 wide format.`,
    viduPrompt: 'The cartoon unicorn gets a big warm family hug from mom and dad, all three embracing with love. Confetti and golden stars rain down, hearts float up. The unicorn looks up at the viewer with the proudest happiest expression. Heartwarming emotional celebration, gentle movements, Pixar quality.',
  },
];

// ══════════════════════════════════════════
// GPT-Image helper
// ══════════════════════════════════════════
async function generateImage(scene) {
  console.log(`\n🖼️  [${scene.id}] (${scene.time})`);
  const start = Date.now();

  const response = await openai.images.generate({
    model: 'gpt-image-1',
    prompt: scene.imagePrompt,
    n: 1,
    size: '1536x1024', // Paysage 16:9-ish
    quality: 'high',
  });

  const b64 = response.data[0].b64_json;
  const buffer = Buffer.from(b64, 'base64');
  const filePath = path.join(OUTPUT_DIR, `${scene.id}.png`);
  fs.writeFileSync(filePath, buffer);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const sizeKB = (buffer.length / 1024).toFixed(0);
  console.log(`   ✅ ${scene.id}.png — ${sizeKB} KB en ${elapsed}s`);
  return filePath;
}

// ══════════════════════════════════════════
// Vidu API v2 helpers
// ══════════════════════════════════════════
function viduRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.vidu.com',
      path: '/ent/v2' + endpoint,
      method,
      headers: {
        'Authorization': `Token ${VIDU_KEY}`,
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
          reject(new Error(`Parse error (${res.statusCode}): ${data.substring(0, 300)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
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
      return { videoUrl: creation.url || task.video_url };
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

async function generateClip(scene) {
  console.log(`\n🎬 [${scene.id}] (${scene.time})`);

  const cost = 4 * 0.03;
  fs.appendFileSync('/tmp/vidu-spending.log',
    `[${new Date().toISOString()}] clip-${scene.id} | 4s 720p | $${cost}\n`);

  const imageUrl = `${BASE_URL}/${scene.id}.png`;

  const body = {
    model: 'viduq3-turbo',
    prompt: scene.viduPrompt,
    images: [imageUrl],
    duration: 4,
    resolution: '720p',
  };

  console.log('   📤 Envoi Vidu...');
  const createResp = await viduRequest('POST', '/img2video', body);
  const taskId = createResp.task_id || createResp.id;
  if (!taskId) throw new Error('Pas de task_id: ' + JSON.stringify(createResp).substring(0, 200));

  console.log(`   ⏳ Task ${taskId}`);
  const result = await pollTask(taskId);

  if (result.videoUrl) {
    const outputPath = path.join(OUTPUT_DIR, `${scene.id}.mp4`);
    await downloadFile(result.videoUrl, outputPath);
    const size = fs.statSync(outputPath).size;
    console.log(`   ✅ ${scene.id}.mp4 — ${(size / 1024 / 1024).toFixed(1)} MB`);
    return outputPath;
  }
  throw new Error('Pas de videoUrl');
}

// ══════════════════════════════════════════
// MAIN — Séquentiel (image → clip pour chaque scène)
// ══════════════════════════════════════════
async function main() {
  console.log('🎬 ═══════════════════════════════════════════════');
  console.log('   JADOMI — Clip brossage complet 1min30');
  console.log('   Licorne + Maman + Papa — 8 scènes');
  console.log('═══════════════════════════════════════════════════\n');

  // Crédits
  try {
    const credits = await viduRequest('GET', '/credits');
    console.log(`💳 Crédits Vidu : ${JSON.stringify(credits)}`);
  } catch (e) {
    console.log(`⚠️ Crédits: ${e.message}`);
  }

  const totalCostImages = SCENES.length * 0.167;
  const totalCostVidu = SCENES.length * 4 * 0.03;
  console.log(`\n💰 Budget total estimé : $${(totalCostImages + totalCostVidu).toFixed(2)}`);
  console.log(`   Images GPT : $${totalCostImages.toFixed(2)} (${SCENES.length} × $0.167)`);
  console.log(`   Clips Vidu : $${totalCostVidu.toFixed(2)} (${SCENES.length} × 4s × $0.03)`);

  const imageResults = [];
  const clipResults = [];

  for (const scene of SCENES) {
    // 1. Générer l'image de base
    try {
      await generateImage(scene);
      imageResults.push({ id: scene.id, status: 'ok' });
    } catch (err) {
      console.error(`   ❌ Image ${scene.id}: ${err.message}`);
      imageResults.push({ id: scene.id, status: 'error', error: err.message });
      continue; // Pas de clip sans image
    }

    // Petite pause pour le CDN
    await new Promise(r => setTimeout(r, 3000));

    // 2. Générer le clip Vidu
    try {
      const p = await generateClip(scene);
      clipResults.push({ id: scene.id, path: p, status: 'ok' });
    } catch (err) {
      console.error(`   ❌ Clip ${scene.id}: ${err.message}`);
      clipResults.push({ id: scene.id, status: 'error', error: err.message });
    }
  }

  // ── Résumé final ──
  console.log('\n\n🎬 ═══════════════════════════════════════════════');
  console.log('              RÉSULTATS FINAUX');
  console.log('═══════════════════════════════════════════════════\n');

  console.log('📋 Timeline du clip :');
  for (const scene of SCENES) {
    const imgOk = imageResults.find(r => r.id === scene.id)?.status === 'ok';
    const clipOk = clipResults.find(r => r.id === scene.id)?.status === 'ok';
    const icon = clipOk ? '✅' : imgOk ? '🖼️' : '❌';
    console.log(`  ${icon} ${scene.time.padEnd(10)} ${scene.id}`);
    if (clipOk) {
      console.log(`     📹 ${BASE_URL}/${scene.id}.mp4`);
    }
  }

  const imagesOk = imageResults.filter(r => r.status === 'ok').length;
  const clipsOk = clipResults.filter(r => r.status === 'ok').length;
  console.log(`\n📊 Images: ${imagesOk}/${SCENES.length} | Clips: ${clipsOk}/${SCENES.length}`);
  console.log(`💰 Coût réel : ~$${(imagesOk * 0.167 + clipsOk * 4 * 0.03).toFixed(2)}`);

  if (clipsOk === SCENES.length) {
    console.log('\n🎉 TOUTES LES SCÈNES SONT PRÊTES !');
    console.log('➡️  Prochaine étape : montage Remotion pour assembler le clip final 1min30');
  }
}

main().catch(err => { console.error('💥 Fatal:', err.message); process.exit(1); });
