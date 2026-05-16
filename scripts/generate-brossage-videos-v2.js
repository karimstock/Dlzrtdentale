#!/usr/bin/env node
// =============================================
// JADOMI — Génération vidéos brossage enfant V2
// Étape 1 : Images de base (GPT-Image-1)
// Étape 2 : Clips vidéo (Vidu AI v2)
// Scénario : Licorne se brosse les dents,
//   maman et papa contents qui regardent
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

// ══════════════════════════════════════════
// ÉTAPE 1 : Générer les images de base
// ══════════════════════════════════════════
const IMAGES = [
  {
    name: 'scene-licorne-parents-intro',
    prompt: `A cute cartoon unicorn character (purple/pink, big sparkly eyes) standing in a colorful children's bathroom, holding a toothbrush excitedly. Behind her, a loving cartoon mom and dad are smiling and watching proudly, encouraging her. The bathroom has pastel tiles, a small sink at child height, and a round mirror. Pixar/Disney kids movie style, warm lighting, vibrant pastel colors, premium 3D cartoon illustration, adorable and heartwarming family scene.`,
  },
  {
    name: 'scene-licorne-brosse-haut',
    prompt: `A cute cartoon unicorn character (purple/pink, big sparkly eyes) brushing her top teeth with a colorful toothbrush, mouth open showing the top row of teeth being brushed. Foamy toothpaste bubbles around. A cartoon mom is behind her, demonstrating the brushing motion with her own toothbrush, smiling. Children's bathroom with pastel tiles. Pixar/Disney kids style, warm cheerful lighting, premium 3D cartoon illustration, dental hygiene for children.`,
  },
  {
    name: 'scene-licorne-brosse-bas',
    prompt: `A cute cartoon unicorn character (purple/pink, big sparkly eyes) now brushing her bottom teeth carefully, looking at herself in a round bathroom mirror with a focused cute expression. A cartoon dad is kneeling beside her, giving a thumbs up with a big proud smile. Sparkles and small stars appearing around the clean teeth. Children's bathroom with pastel tiles. Pixar/Disney kids style, warm lighting, premium 3D cartoon illustration, dental hygiene theme.`,
  },
  {
    name: 'scene-licorne-bravo-famille',
    prompt: `A cute cartoon unicorn character (purple/pink, big sparkly eyes) showing off her perfectly clean sparkling white teeth with a huge proud smile. Cartoon mom and dad are on each side, clapping and cheering with hearts above their heads. Golden stars and confetti falling around them. The unicorn has a golden star reward badge. Children's bathroom background with pastel tiles. Pixar/Disney kids style, celebration scene, warm joyful lighting, premium 3D cartoon illustration, family love and dental hygiene.`,
  },
];

// ══════════════════════════════════════════
// ÉTAPE 2 : Clips vidéo Vidu depuis images
// ══════════════════════════════════════════
const CLIPS = [
  {
    name: 'licorne-intro-parents',
    imageBase: 'scene-licorne-parents-intro',
    prompt: 'The cute cartoon unicorn waves hello excitedly, bouncing up and down. Mom and dad behind her smile and wave encouragingly. The unicorn picks up her toothbrush with enthusiasm. Sparkles appear around her. Warm playful animation, smooth gentle movements, Pixar kids movie quality.',
    duration: 4,
  },
  {
    name: 'licorne-brosse-haut',
    imageBase: 'scene-licorne-brosse-haut',
    prompt: 'The cartoon unicorn brushes her top teeth with gentle back-and-forth motion, toothpaste foam bubbling. Mom behind demonstrates the same motion, both in sync. Small sparkles appear on the clean teeth. Happy bouncy cheerful animation, smooth natural movements, Pixar kids quality.',
    duration: 4,
  },
  {
    name: 'licorne-brosse-bas',
    imageBase: 'scene-licorne-brosse-bas',
    prompt: 'The cartoon unicorn brushes her bottom teeth while looking in the mirror, making circular motions. Dad beside her gives a thumbs up and nods approvingly. Stars twinkle on the clean teeth. Gentle natural animation, warm family moment, smooth movements, Pixar kids quality.',
    duration: 4,
  },
  {
    name: 'licorne-bravo-famille',
    imageBase: 'scene-licorne-bravo-famille',
    prompt: 'The cartoon unicorn opens her mouth wide showing sparkling clean teeth, beaming with pride. Mom and dad clap and cheer, hearts float up. Golden confetti falls, stars spin around them. Big celebration moment, joyful energetic animation, Pixar kids movie quality.',
    duration: 4,
  },
];

// ══════════════════════════════════════════
// Helpers GPT-Image
// ══════════════════════════════════════════
async function generateImage(img) {
  console.log(`\n🖼️  Image: ${img.name}`);
  const start = Date.now();

  const response = await openai.images.generate({
    model: 'gpt-image-1',
    prompt: img.prompt,
    n: 1,
    size: '1024x1024',
    quality: 'high',
  });

  const b64 = response.data[0].b64_json;
  const buffer = Buffer.from(b64, 'base64');
  const filePath = path.join(OUTPUT_DIR, `${img.name}.png`);
  fs.writeFileSync(filePath, buffer);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const sizeKB = (buffer.length / 1024).toFixed(0);
  console.log(`   ✅ ${img.name}.png — ${sizeKB} KB en ${elapsed}s`);
  return filePath;
}

// ══════════════════════════════════════════
// Helpers Vidu API v2
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
  console.log(`\n🎬 Clip: ${clip.name} — img2video ${clip.duration}s`);

  const cost = clip.duration * 0.03;
  console.log(`   💰 ~$${cost.toFixed(3)}`);
  fs.appendFileSync('/tmp/vidu-spending.log',
    `[${new Date().toISOString()}] brossage-v2-${clip.name} | ${clip.duration}s 720p | $${cost}\n`);

  const imageUrl = `${BASE_URL}/${clip.imageBase}.png`;
  console.log(`   🖼️  Image source: ${imageUrl}`);

  const body = {
    model: 'viduq3-turbo',
    prompt: clip.prompt,
    images: [imageUrl],
    duration: clip.duration,
    resolution: '720p',
  };

  console.log('   📤 Envoi Vidu...');
  const createResp = await viduRequest('POST', '/img2video', body);
  console.log('   📋 Réponse:', JSON.stringify(createResp).substring(0, 200));

  const taskId = createResp.task_id || createResp.id;
  if (!taskId) throw new Error('Pas de task_id');

  console.log(`   ⏳ Task ${taskId} — polling`);
  const result = await pollTask(taskId);

  if (result.videoUrl) {
    const outputPath = path.join(OUTPUT_DIR, `${clip.name}.mp4`);
    console.log(`   📥 Download...`);
    await downloadFile(result.videoUrl, outputPath);
    const size = fs.statSync(outputPath).size;
    console.log(`   ✅ ${clip.name}.mp4 — ${(size / 1024 / 1024).toFixed(1)} MB`);
    return outputPath;
  } else {
    throw new Error('Pas de videoUrl');
  }
}

// ══════════════════════════════════════════
// Main
// ══════════════════════════════════════════
async function main() {
  console.log('🎬 JADOMI — Vidéos brossage V2');
  console.log('📖 Scénario : Licorne + Maman/Papa dans la salle de bain');
  console.log('═══════════════════════════════════════════════\n');

  // Vérifier crédits Vidu
  try {
    const credits = await viduRequest('GET', '/credits');
    console.log(`💳 Crédits Vidu : ${JSON.stringify(credits)}`);
  } catch (e) {
    console.log(`⚠️ Crédits Vidu non vérifiables: ${e.message}`);
  }

  // ── ÉTAPE 1 : Génération des images de base ──
  console.log('\n\n══ ÉTAPE 1 : Images de base (GPT-Image-1) ══');
  console.log(`📊 ${IMAGES.length} images × 1024×1024 high quality`);
  console.log(`💰 Coût estimé : ~$${(IMAGES.length * 0.167).toFixed(2)}\n`);

  for (const img of IMAGES) {
    try {
      await generateImage(img);
    } catch (err) {
      console.error(`   ❌ ${img.name} : ${err.message}`);
      console.log('   ⚠️ On continue quand même...');
    }
  }

  // Pause pour que le CDN serve les images
  console.log('\n⏳ Pause 10s pour propagation CDN...');
  await new Promise(r => setTimeout(r, 10000));

  // ── ÉTAPE 2 : Génération des clips Vidu ──
  console.log('\n\n══ ÉTAPE 2 : Clips vidéo (Vidu AI v2) ══');
  console.log(`📊 ${CLIPS.length} clips × 4s × 720p`);
  console.log(`💰 Coût estimé : ~$${(CLIPS.length * 4 * 0.03).toFixed(2)}\n`);

  const results = [];
  for (const clip of CLIPS) {
    try {
      const p = await generateClip(clip);
      results.push({ name: clip.name, path: p, status: 'ok' });
    } catch (err) {
      console.error(`   ❌ ${clip.name} : ${err.message}`);
      results.push({ name: clip.name, status: 'error', error: err.message });
    }
  }

  // ── Résultats ──
  console.log('\n\n══════════════════════════════════════');
  console.log('         RÉSULTATS FINAUX');
  console.log('══════════════════════════════════════');

  console.log('\n🖼️  Images générées :');
  for (const img of IMAGES) {
    const fp = path.join(OUTPUT_DIR, `${img.name}.png`);
    if (fs.existsSync(fp)) {
      const size = (fs.statSync(fp).size / 1024).toFixed(0);
      console.log(`  ✅ ${img.name}.png — ${size} KB — ${BASE_URL}/${img.name}.png`);
    } else {
      console.log(`  ❌ ${img.name}.png — manquant`);
    }
  }

  console.log('\n🎬 Clips vidéo :');
  for (const r of results) {
    if (r.status === 'ok') {
      const size = (fs.statSync(r.path).size / 1024 / 1024).toFixed(1);
      console.log(`  ✅ ${r.name}.mp4 — ${size} MB — ${BASE_URL}/${r.name}.mp4`);
    } else {
      console.log(`  ❌ ${r.name} — ${r.error}`);
    }
  }

  const ok = results.filter(r => r.status === 'ok').length;
  console.log(`\n📊 ${ok}/${results.length} clips réussis`);
  console.log(`💰 Coût total : ~$${(IMAGES.length * 0.167 + CLIPS.length * 4 * 0.03).toFixed(2)} (images $${(IMAGES.length * 0.167).toFixed(2)} + vidéos $${(CLIPS.length * 4 * 0.03).toFixed(2)})`);
}

main().catch(err => { console.error('💥 Fatal:', err.message); process.exit(1); });
