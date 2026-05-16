#!/usr/bin/env node
// =============================================
// JADOMI — Clip brossage V3 — Vidéo CONTINUE
// 12 clips × 8s = 96s de vidéo pure (pas de freeze)
// Famille de licornes cohérente partout
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
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'studio', 'assets', 'brossage', 'v3');
const BASE_URL = 'https://jadomi.fr/studio/assets/brossage/v3';

// ══════════════════════════════════════════
// PERSONNAGES FIXES (dans CHAQUE prompt)
// ══════════════════════════════════════════
const CHARACTERS = `Three cartoon unicorn characters in Pixar 3D style:
- BABY: a small cute pink unicorn child with big sparkly blue eyes, tiny golden horn, fluffy pink-purple mane, wearing a small blue pajama top
- MAMA: a graceful purple unicorn mother with gentle kind eyes, silver horn, flowing lavender mane, slightly taller
- PAPA: a strong blue unicorn father with warm brown eyes, golden horn, short dark blue mane, slightly bigger and taller than mama`;

// ══════════════════════════════════════════
// 12 SCÈNES × 8s = 96s de vidéo continue
// ══════════════════════════════════════════
const SCENES = [
  // ── INTRO INSTRUMENTALE (0-11s) ──
  {
    id: 'v3-01-reveil',
    time: '0s-8s',
    imagePrompt: `${CHARACTERS}. Scene: cozy colorful children's bedroom at morning. Baby unicorn is sleeping peacefully in a small bed with star-patterned blanket. Soft golden morning sunlight streaming through a round window. Stuffed animals around. Warm dreamy atmosphere. Premium Pixar 3D cartoon, 16:9 wide.`,
    viduPrompt: 'The baby unicorn slowly wakes up, yawns adorably, stretches arms, then sits up in bed with a big excited smile as sunlight fills the room. Soft gentle morning animation, smooth natural movements, Pixar quality.',
  },
  {
    id: 'v3-02-rejoint-parents',
    time: '8s-16s',
    imagePrompt: `${CHARACTERS}. Scene: colorful hallway of a family home. Baby unicorn is running happily toward mama unicorn and papa unicorn who stand together at the bathroom door, arms open, smiling warmly. Papa has a big toothbrush, mama holds a small toothbrush ready for baby. Pastel colored walls with family photos. Warm morning light. Premium Pixar 3D cartoon, 16:9 wide.`,
    viduPrompt: 'The baby unicorn runs joyfully down the hallway toward mama and papa unicorn. Papa and mama open their arms, baby jumps into their embrace. Papa shows the toothbrush excitedly, mama picks up baby and carries her to the bathroom. Happy bouncy family animation, warm loving movements, Pixar quality.',
  },

  // ── COUPLET 1 "EN HAUT" (11s-31s) → 2 clips ──
  {
    id: 'v3-03-debut-brossage',
    time: '16s-24s',
    imagePrompt: `${CHARACTERS}. Scene: bright cheerful pastel bathroom. Baby unicorn stands on a rainbow step stool at a child-height sink, holding a small colorful toothbrush with sparkly toothpaste. Mama unicorn stands right beside baby, holding her own toothbrush, demonstrating how to brush. Papa unicorn behind them, watching proudly with a big smile. Round mirror on the wall reflects them. Foamy bubbles starting to appear. Premium Pixar 3D cartoon, 16:9 wide.`,
    viduPrompt: 'Baby unicorn puts the toothbrush in her mouth and starts brushing the top teeth. Mama unicorn beside her brushes in the same motion, showing how. Papa watches and nods approvingly. Toothpaste foam bubbles appear. Happy synchronized brushing, gentle rhythmic movements, Pixar quality.',
  },
  {
    id: 'v3-04-brosse-haut',
    time: '24s-32s',
    imagePrompt: `${CHARACTERS}. Scene: same pastel bathroom, closer view. Baby unicorn is actively brushing her top teeth with circular motions, eyes squinting with concentration but smiling. Mama unicorn brushes alongside, they look at each other in the mirror and smile. Small golden sparkles appear on baby's teeth. Toothpaste foam bubbles floating. Papa gives two thumbs up behind them. Premium Pixar 3D cartoon, 16:9 wide.`,
    viduPrompt: 'Baby unicorn brushes her top teeth with more confidence, foam bubbling. She looks at mama in the mirror and they smile at each other. Small sparkles appear on the teeth. Papa behind them gives thumbs up and does a little happy dance. Fun energetic brushing animation, Pixar quality.',
  },

  // ── COUPLET 2 "EN BAS" (31s-51s) → 2 clips ──
  {
    id: 'v3-05-brosse-bas',
    time: '32s-40s',
    imagePrompt: `${CHARACTERS}. Scene: same pastel bathroom. Baby unicorn now brushing her bottom teeth, tilting her head slightly down. Papa unicorn has taken mama's place beside baby, kneeling down to baby's height, showing the circular motion on his own teeth. Mama watches from behind, clapping softly. More sparkles on the already-clean top teeth. Premium Pixar 3D cartoon, 16:9 wide.`,
    viduPrompt: 'Baby unicorn carefully brushes her bottom teeth with circular motions. Papa kneels beside her, demonstrating the technique on his own teeth. They brush together in rhythm. Mama behind them claps gently, encouraging. Sparkles appear on cleaned teeth. Focused happy animation, Pixar quality.',
  },
  {
    id: 'v3-06-dents-brillent',
    time: '40s-48s',
    imagePrompt: `${CHARACTERS}. Scene: same pastel bathroom. Baby unicorn pauses brushing and opens her mouth wide to show the mirror. Her top AND bottom teeth are now sparkling clean white with golden star sparkles. Her reflection in the mirror shows the sparkling teeth. Mama and papa lean in from each side, looking impressed and amazed. Little stars and sparkle effects everywhere. Premium Pixar 3D cartoon, 16:9 wide.`,
    viduPrompt: 'Baby unicorn opens her mouth to check in the mirror, and her teeth sparkle with bright white light and golden stars. Mama and papa lean in amazed, their eyes wide with wonder. They look at each other and nod impressed. Magical sparkle transformation, wow moment animation, Pixar quality.',
  },

  // ── PONT "DROITE GAUCHE LANGUE" (51s-66s) → 2 clips ──
  {
    id: 'v3-07-droite-gauche',
    time: '48s-56s',
    imagePrompt: `${CHARACTERS}. Scene: same pastel bathroom, fun dynamic angle. Baby unicorn brushing the RIGHT side of her teeth, cheek puffed out adorably on one side. Papa and mama are on each side of baby, all three brushing their right side together like a fun dance. Musical notes and small stars floating in the air. Energetic fun atmosphere. Premium Pixar 3D cartoon, 16:9 wide.`,
    viduPrompt: 'All three unicorns brush the right side together, then switch to the left side in sync like a choreographed dance. They sway side to side with the rhythm. Musical notes float around them. Baby puffs her cheek adorably. Fun synchronized family dance-brushing, energetic playful animation, Pixar quality.',
  },
  {
    id: 'v3-08-langue-bla',
    time: '56s-64s',
    imagePrompt: `${CHARACTERS}. Scene: same pastel bathroom. Baby unicorn sticking her tongue out with a big silly funny expression, eyes crossed playfully, brushing her tongue. Papa and mama are laughing hard, papa holding his belly from laughing, mama covering her mouth giggling. The word BLAAAA appears in colorful bubbly letters above baby's head. Fun silly atmosphere. Premium Pixar 3D cartoon, 16:9 wide.`,
    viduPrompt: 'Baby unicorn sticks out her tongue with a hilarious silly face and brushes it. Papa laughs so hard he almost falls over, mama giggles uncontrollably. Baby makes more funny faces while brushing her tongue. The funniest most adorable silly moment, exaggerated comedy animation, Pixar quality.',
  },

  // ── REFRAIN "BROSSE BROSSE" (66s-83s) → 2 clips ──
  {
    id: 'v3-09-danse-refrain',
    time: '64s-72s',
    imagePrompt: `${CHARACTERS}. Scene: the bathroom has magically transformed with rainbow lights and disco sparkles. All three unicorns are DANCING together joyfully, baby in the middle holding her toothbrush like a microphone, mama and papa dancing on each side with their arms up. Colorful confetti and stars raining down. Rainbow light effects. Dance party celebration atmosphere. Premium Pixar 3D cartoon, 16:9 wide.`,
    viduPrompt: 'All three unicorns dance together in the sparkly bathroom, baby holds her toothbrush like a microphone and sings. Mama and papa dance on each side with arms up, spinning and bouncing to the music. Confetti and stars rain down. Joyful dance party celebration, energetic rhythmic movements, Pixar quality.',
  },
  {
    id: 'v3-10-sourire-star',
    time: '72s-80s',
    imagePrompt: `${CHARACTERS}. Scene: baby unicorn center frame showing the BIGGEST most beautiful sparkling smile with perfect white teeth glowing with light. She holds up her toothbrush triumphantly like a trophy. Mama and papa on each side with hands on their hearts, tears of joy and pride in their eyes. Massive golden star behind baby like a halo. Rainbow sparkles everywhere. The most heartwarming proud moment. Premium Pixar 3D cartoon, 16:9 wide.`,
    viduPrompt: 'Baby unicorn shows her perfect sparkling smile to the camera, teeth glowing. She raises her toothbrush triumphantly. Mama and papa place their hands on their hearts, moved with pride, a small tear of joy. The golden star behind baby glows brighter. Heartwarming emotional triumph moment, beautiful lighting, Pixar quality.',
  },

  // ── OUTRO "BRAVO CHAMPION" (83s-90s) → 2 clips ──
  {
    id: 'v3-11-calin-famille',
    time: '80s-88s',
    imagePrompt: `${CHARACTERS}. Scene: warm golden-lit bathroom. The three unicorns in a big warm GROUP HUG, baby in the middle being squeezed lovingly by mama and papa. Baby has a golden star medal around her neck. Their eyes are closed with the most peaceful happy expressions. Hearts floating up from the hug. Soft warm golden glow surrounding them. The most loving tender family moment. Premium Pixar 3D cartoon, 16:9 wide.`,
    viduPrompt: 'The three unicorns share a big warm group hug, gently swaying together. Baby nuzzles into mama and papa, who kiss baby on each cheek. Hearts float up from the embrace. They slowly pull apart and baby waves goodbye to the camera with the sweetest smile. Tender loving family moment, gentle warm movements, Pixar quality.',
  },
  {
    id: 'v3-12-au-revoir',
    time: '88s-96s',
    imagePrompt: `${CHARACTERS}. Scene: baby unicorn waving goodbye to the viewer with both hands, the biggest cutest smile, standing between mama and papa who also wave. They are at the bathroom door. Above them in colorful bubbly fun letters: BRAVO CHAMPION! A DEMAIN! Golden stars, confetti, and sparkles all around. The warmest happiest goodbye. Premium Pixar 3D cartoon, 16:9 wide.`,
    viduPrompt: 'Baby unicorn waves goodbye with both hands enthusiastically, bouncing up and down. Mama and papa wave too. Confetti and golden stars fall all around. Baby blows a kiss to the camera. The happiest most adorable farewell, joyful bouncy animation, Pixar quality.',
  },
];

// ══════════════════════════════════════════
// GPT-Image helper
// ══════════════════════════════════════════
async function generateImage(scene) {
  console.log(`\n🖼️  [${scene.id}] ${scene.time}`);
  const start = Date.now();

  const response = await openai.images.generate({
    model: 'gpt-image-1',
    prompt: scene.imagePrompt,
    n: 1,
    size: '1536x1024',
    quality: 'high',
  });

  const b64 = response.data[0].b64_json;
  const buffer = Buffer.from(b64, 'base64');
  const filePath = path.join(OUTPUT_DIR, `${scene.id}.png`);
  fs.writeFileSync(filePath, buffer);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`   ✅ ${scene.id}.png — ${(buffer.length / 1024).toFixed(0)} KB en ${elapsed}s`);
  return filePath;
}

// ══════════════════════════════════════════
// Vidu API v2 helpers
// ══════════════════════════════════════════
function viduRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.vidu.com', path: '/ent/v2' + endpoint, method,
      headers: { 'Authorization': `Token ${VIDU_KEY}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(data);
          res.statusCode >= 400 ? reject(new Error(`Vidu ${res.statusCode}: ${JSON.stringify(p).substring(0, 500)}`)) : resolve(p);
        } catch { reject(new Error(`Parse: ${data.substring(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (payload) req.end(payload); else req.end();
  });
}

async function pollTask(taskId) {
  for (let i = 0; i < 180; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const resp = await viduRequest('GET', `/tasks?task_ids=${taskId}`);
    const task = resp.tasks?.[0] || resp;
    const state = task.state || task.status;
    if (state === 'success' || state === 'completed') {
      return (task.creations?.[0] || {}).url || task.video_url;
    }
    if (state === 'failed') throw new Error(`Failed: ${task.err_msg || task.error || 'unknown'}`);
    if (i % 12 === 0) process.stdout.write('.');
  }
  throw new Error('Timeout 15min');
}

function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const get = (u) => {
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) return get(res.headers.location);
        const ws = fs.createWriteStream(outputPath);
        res.pipe(ws);
        ws.on('finish', () => { ws.close(); resolve(); });
        ws.on('error', reject);
      }).on('error', reject);
    };
    get(url);
  });
}

async function generateClip(scene) {
  console.log(`\n🎬 [${scene.id}] ${scene.time} — 8s`);

  const imageUrl = `${BASE_URL}/${scene.id}.png`;

  const body = {
    model: 'viduq3-turbo',
    prompt: scene.viduPrompt,
    images: [imageUrl],
    duration: 8,
    resolution: '720p',
    audio: false, // Pas de son Vidu — seulement la chanson par-dessus
  };

  const cost = 8 * 0.03;
  fs.appendFileSync('/tmp/vidu-spending.log',
    `[${new Date().toISOString()}] ${scene.id} | 8s 720p | $${cost}\n`);

  console.log('   📤 Envoi Vidu...');
  const resp = await viduRequest('POST', '/img2video', body);
  const taskId = resp.task_id || resp.id;
  if (!taskId) throw new Error('Pas de task_id: ' + JSON.stringify(resp).substring(0, 200));

  console.log(`   ⏳ Task ${taskId}`);
  const videoUrl = await pollTask(taskId);

  const outPath = path.join(OUTPUT_DIR, `${scene.id}.mp4`);
  await downloadFile(videoUrl, outPath);
  const size = fs.statSync(outPath).size;
  console.log(`   ✅ ${scene.id}.mp4 — ${(size / 1024 / 1024).toFixed(1)} MB`);
  return outPath;
}

// ══════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════
async function main() {
  console.log('🎬 ═══════════════════════════════════════════════════');
  console.log('   JADOMI — Clip Brossage V3 — VIDÉO CONTINUE');
  console.log('   12 clips × 8s = 96s | Famille licornes cohérente');
  console.log('═══════════════════════════════════════════════════════\n');

  // Créer dossier v3
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Crédits
  try {
    const credits = await viduRequest('GET', '/credits');
    console.log(`💳 Crédits Vidu : ${JSON.stringify(credits)}`);
  } catch (e) {
    console.log(`⚠️ ${e.message}`);
  }

  const costImages = SCENES.length * 0.167;
  const costVidu = SCENES.length * 8 * 0.03;
  console.log(`\n💰 Budget total : ~$${(costImages + costVidu).toFixed(2)}`);
  console.log(`   Images GPT : $${costImages.toFixed(2)} (${SCENES.length} × $0.167)`);
  console.log(`   Clips Vidu 8s : $${costVidu.toFixed(2)} (${SCENES.length} × 8s × $0.03)`);
  console.log(`\n🦄 Personnages : bébé licorne rose + maman violette + papa bleu`);

  const results = [];

  for (const scene of SCENES) {
    // 1. Image de base
    try {
      await generateImage(scene);
    } catch (err) {
      console.error(`   ❌ Image ${scene.id}: ${err.message}`);
      // Retry une fois avec prompt simplifié
      try {
        console.log('   🔄 Retry avec prompt simplifié...');
        scene.imagePrompt = scene.imagePrompt
          .replace(/sticking.*out/gi, 'making a silly face')
          .replace(/mouth open/gi, 'smiling')
          .replace(/tongue/gi, 'funny face');
        await generateImage(scene);
      } catch (err2) {
        console.error(`   ❌❌ Retry échoué: ${err2.message}`);
        results.push({ id: scene.id, status: 'error', error: err2.message });
        continue;
      }
    }

    // Pause CDN
    await new Promise(r => setTimeout(r, 3000));

    // 2. Clip Vidu 8s
    try {
      const p = await generateClip(scene);
      results.push({ id: scene.id, path: p, status: 'ok' });
    } catch (err) {
      console.error(`   ❌ Clip ${scene.id}: ${err.message}`);
      results.push({ id: scene.id, status: 'error', error: err.message });
    }
  }

  // Résumé
  console.log('\n\n🎬 ═══════════════════════════════════════════════════');
  console.log('              RÉSULTATS FINAUX V3');
  console.log('═══════════════════════════════════════════════════════\n');

  for (const scene of SCENES) {
    const r = results.find(x => x.id === scene.id);
    const icon = r?.status === 'ok' ? '✅' : '❌';
    console.log(`  ${icon} ${scene.time.padEnd(10)} ${scene.id}`);
    if (r?.status === 'ok') {
      console.log(`     📹 ${BASE_URL}/${scene.id}.mp4`);
    } else if (r) {
      console.log(`     💥 ${r.error}`);
    }
  }

  const ok = results.filter(r => r.status === 'ok').length;
  console.log(`\n📊 ${ok}/${SCENES.length} clips réussis`);
  console.log(`💰 Coût réel : ~$${(ok * (0.167 + 8 * 0.03)).toFixed(2)}`);

  if (ok === SCENES.length) {
    console.log('\n🎉 TOUS LES CLIPS SONT PRÊTS !');
    console.log('➡️  Prochaine étape : Remotion assemblage final');
  }
}

main().catch(err => { console.error('💥 Fatal:', err.message); process.exit(1); });
