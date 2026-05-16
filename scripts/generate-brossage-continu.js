#!/usr/bin/env node
// =============================================
// JADOMI — Clip brossage CONTINU
// Utilise /extend pour chaîner une vidéo unique
// Même personnages du début à la fin
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
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'studio', 'assets', 'brossage', 'continu');
const BASE_URL = 'https://jadomi.fr/studio/assets/brossage/continu';

// ══════════════════════════════════════════════════════
// ÉTAPES DE LA VIDÉO CONTINUE
// Chaque étape = un /extend de 4s à partir de la précédente
// Total : 1 clip initial 8s + extensions 4s
// ══════════════════════════════════════════════════════

const INITIAL_IMAGE_PROMPT = `Three cartoon unicorn characters in a cozy colorful children's bedroom, Pixar 3D style:
- A small cute PINK baby unicorn sleeping peacefully in a small bed with star blanket, tiny golden horn, fluffy pink-purple mane
- The bedroom has stuffed animals, star decorations, and soft golden morning sunlight through a round window
Premium Pixar Disney 3D cartoon movie quality, warm dreamy lighting, 16:9 wide format.`;

const INITIAL_VIDEO_PROMPT = `The cute pink baby unicorn slowly wakes up, yawns adorably and stretches. She opens her sparkly blue eyes, looks around the sunny bedroom, smiles widely and sits up excitedly in bed. Smooth gentle Pixar quality animation, warm morning light.`;

// Chaque extend = 4 secondes de plus
const EXTENDS = [
  // 8s-12s : sort du lit
  `The baby unicorn jumps out of bed happily, lands on the floor, and starts walking toward the bedroom door. She grabs a small colorful toothbrush from her nightstand. Bouncy excited animation, Pixar quality.`,

  // 12s-16s : couloir vers la salle de bain
  `The baby unicorn walks through a colorful pastel hallway, bouncing with each step. At the end of the hallway, mama unicorn (purple, gentle eyes, silver horn) and papa unicorn (blue, warm eyes, golden horn) are waiting at the bathroom door, smiling and waving. Smooth walking animation, Pixar quality.`,

  // 16s-20s : rejoint les parents, câlin
  `The baby unicorn runs into mama and papa unicorn's arms for a quick hug. Papa shows his big toothbrush, mama shows a small colorful one for baby. They all enter the bright pastel bathroom together. Warm family moment, Pixar quality.`,

  // 20s-24s : devant le lavabo, début brossage en haut
  `In the cheerful pastel bathroom, baby unicorn stands on a rainbow step stool at the sink. Mama unicorn stands beside her, both holding toothbrushes. Baby puts toothpaste on her brush and starts brushing the top teeth. Foamy bubbles appear. Fun brushing animation, Pixar quality.`,

  // 24s-28s : brossage haut avec maman
  `Baby unicorn and mama unicorn brush their top teeth together in sync, looking at each other in the round mirror and smiling. Small golden sparkles appear on baby's top teeth as they get clean. Papa watches proudly behind them, nodding. Rhythmic synchronized brushing, Pixar quality.`,

  // 28s-32s : dents du haut brillent
  `Baby unicorn opens her mouth to check the mirror - her top teeth are sparkling white with little star effects! She does a happy dance on her step stool. Mama claps. Papa gives a big thumbs up. Celebration moment, Pixar quality.`,

  // 32s-36s : maintenant en bas
  `Now papa unicorn takes his turn beside baby, kneeling to her height. Baby starts brushing her bottom teeth with careful circular motions. Papa demonstrates the same technique. Mama watches and encourages from behind. Focused fun brushing, Pixar quality.`,

  // 36s-40s : brossage bas avec papa
  `Baby and papa unicorn brush the bottom teeth together, papa makes funny faces while brushing to make baby laugh. Baby giggles but keeps brushing. More sparkles appear on the bottom teeth. Funny loving father-daughter moment, Pixar quality.`,

  // 40s-44s : droite et gauche
  `Baby unicorn now brushes the right side, puffing her cheek adorably. Mama and papa are on each side, all three brushing in rhythm like a dance. They sway left and right together. Musical notes float around them. Fun family dance-brushing, Pixar quality.`,

  // 44s-48s : la langue - BLAAA
  `Baby unicorn sticks out her tongue with a hilarious silly expression and brushes it gently. Papa laughs so hard he leans back. Mama giggles covering her mouth. Baby makes more funny faces. The silliest funniest moment, exaggerated comedy, Pixar quality.`,

  // 48s-52s : inspection finale
  `Baby unicorn opens her mouth wide and shows all her teeth to mama and papa. Every single tooth is sparkling clean with bright white light and golden star effects. Mama and papa lean in and look amazed and impressed. Magical sparkle moment, Pixar quality.`,

  // 52s-56s : danse de victoire
  `The bathroom fills with rainbow lights and sparkles. All three unicorns start dancing together joyfully. Baby holds her toothbrush like a microphone. Papa does a silly dad-dance. Mama twirls gracefully. Confetti starts falling. Dance party celebration, Pixar quality.`,

  // 56s-60s : refrain danse
  `The unicorn family keeps dancing, baby jumps up and down with excitement, sparkles trail behind her movements. Papa lifts baby onto his shoulders. Mama dances beside them with arms up. Stars and hearts float everywhere. Peak celebration energy, Pixar quality.`,

  // 60s-64s : sourire champion
  `Papa puts baby back down. Baby unicorn faces the camera and shows the BIGGEST most beautiful sparkling smile with perfect white teeth. Her teeth literally glow with golden light. Mama and papa stand behind her, hands on their hearts, eyes full of pride. Triumphant hero moment, Pixar quality.`,

  // 64s-68s : médaille étoile
  `Mama unicorn places a big golden star medal around baby unicorn's neck. Baby looks down at it with wonder, then looks up with the proudest expression. Papa starts clapping, then mama joins in. Golden confetti falls. Award ceremony moment, Pixar quality.`,

  // 68s-72s : câlin familial
  `All three unicorns come together in a big warm group hug. Baby in the middle, mama and papa wrapping their arms around her. Their eyes close peacefully. Hearts float up from the embrace. Soft golden glow surrounds them. Most tender loving family moment, Pixar quality.`,

  // 72s-76s : waving goodbye
  `The unicorn family slowly parts from the hug. Baby unicorn turns to face the camera and starts waving goodbye with both hands, bouncing up and down. Mama and papa wave too from behind. The biggest warmest smiles. Happy farewell, Pixar quality.`,

  // 76s-80s : à demain
  `Baby unicorn blows a kiss to the camera, then mama and papa each kiss baby on a cheek. More golden stars and confetti around them. Baby holds up her toothbrush one last time victoriously. The warmest goodbye scene, Pixar quality.`,

  // 80s-84s : fin
  `The camera slowly zooms out showing the whole unicorn family standing together in the sparkly bathroom, waving. Stars twinkle around them. The scene gets a warm golden glow as it gently fades. Beautiful emotional ending, Pixar quality.`,
];

// ══════════════════════════════════════════
// Vidu API helpers
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
      const creation = task.creations?.[0] || {};
      return {
        videoUrl: creation.url || task.video_url,
        creationId: creation.id,
      };
    }
    if (state === 'failed') throw new Error(`Failed: ${task.err_msg || task.error || 'unknown'}`);
    if (i % 6 === 0) process.stdout.write('.');
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

// ══════════════════════════════════════════
// MAIN — Chaîne continue : img2video → extend → extend → ...
// ══════════════════════════════════════════
async function main() {
  console.log('🎬 ═══════════════════════════════════════════════════');
  console.log('   JADOMI — Clip brossage CONTINU (extend chain)');
  console.log('   1 clip initial 8s + ' + EXTENDS.length + ' extensions 4s');
  console.log('   = ' + (8 + EXTENDS.length * 4) + 's de vidéo continue');
  console.log('═══════════════════════════════════════════════════════\n');

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Crédits
  try {
    const credits = await viduRequest('GET', '/credits');
    const remain = credits.remains?.[0]?.credit_remain || '?';
    console.log(`💳 Crédits Vidu : ${remain}`);
  } catch (e) {
    console.log(`⚠️ ${e.message}`);
  }

  const initialCredits = 88; // 8s clip
  const extendCredits = 30 * EXTENDS.length; // 4s extend each
  console.log(`💰 Crédits estimés : ${initialCredits + extendCredits} (initial ${initialCredits} + ${EXTENDS.length} extends × 30)`);

  // ── ÉTAPE 1 : Image de base ──
  console.log('\n\n══ ÉTAPE 1 : Image de base (GPT-Image-1) ══\n');
  const imgPath = path.join(OUTPUT_DIR, 'base.png');

  if (fs.existsSync(imgPath)) {
    console.log('   🖼️  base.png existe déjà, on la réutilise');
  } else {
    console.log('   🖼️  Génération base.png...');
    const start = Date.now();
    const response = await openai.images.generate({
      model: 'gpt-image-1',
      prompt: INITIAL_IMAGE_PROMPT,
      n: 1,
      size: '1536x1024',
      quality: 'high',
    });
    const buffer = Buffer.from(response.data[0].b64_json, 'base64');
    fs.writeFileSync(imgPath, buffer);
    console.log(`   ✅ base.png — ${(buffer.length/1024).toFixed(0)} KB en ${((Date.now()-start)/1000).toFixed(1)}s`);
  }

  // ── ÉTAPE 2 : Clip initial 8s ──
  console.log('\n\n══ ÉTAPE 2 : Clip initial 8s (img2video) ══\n');

  const clip0Path = path.join(OUTPUT_DIR, 'clip-00-initial.mp4');
  let currentVideoUrl;

  if (fs.existsSync(clip0Path)) {
    console.log('   🎬 clip-00-initial.mp4 existe déjà');
    currentVideoUrl = `${BASE_URL}/clip-00-initial.mp4`;
  } else {
    // Attendre que l'image soit accessible sur le CDN
    await new Promise(r => setTimeout(r, 5000));

    console.log('   🎬 Génération clip initial 8s...');
    const resp = await viduRequest('POST', '/img2video', {
      model: 'viduq3-turbo',
      prompt: INITIAL_VIDEO_PROMPT,
      images: [`${BASE_URL}/base.png`],
      duration: 8,
      resolution: '720p',
      audio: false,
    });

    const taskId = resp.task_id || resp.id;
    console.log(`   ⏳ Task ${taskId}`);
    const result = await pollTask(taskId);

    await downloadFile(result.videoUrl, clip0Path);
    const size = fs.statSync(clip0Path).size;
    console.log(`   ✅ clip-00-initial.mp4 — ${(size/1024/1024).toFixed(1)} MB`);

    // On utilise l'URL Vidu directe pour le premier extend
    currentVideoUrl = result.videoUrl;
  }

  // ── ÉTAPE 3 : Extensions continues ──
  console.log(`\n\n══ ÉTAPE 3 : ${EXTENDS.length} extensions de 4s chacune ══\n`);

  let totalDuration = 8;
  let successCount = 0;

  for (let i = 0; i < EXTENDS.length; i++) {
    const stepNum = String(i + 1).padStart(2, '0');
    const clipPath = path.join(OUTPUT_DIR, `clip-${stepNum}-extend.mp4`);
    const fromSec = totalDuration;
    const toSec = totalDuration + 4;

    console.log(`\n🔗 Extension ${i+1}/${EXTENDS.length} — [${fromSec}s → ${toSec}s]`);

    if (fs.existsSync(clipPath)) {
      console.log(`   ⏭️  Existe déjà, skip`);
      currentVideoUrl = `${BASE_URL}/clip-${stepNum}-extend.mp4`;
      totalDuration += 4;
      successCount++;
      continue;
    }

    try {
      const resp = await viduRequest('POST', '/extend', {
        video_url: currentVideoUrl,
        prompt: EXTENDS[i],
        duration: 4,
        resolution: '720p',
      });

      const taskId = resp.task_id || resp.id;
      if (!taskId) throw new Error('Pas de task_id: ' + JSON.stringify(resp).substring(0, 200));

      console.log(`   ⏳ Task ${taskId}`);
      const result = await pollTask(taskId);

      if (!result.videoUrl) throw new Error('Pas de videoUrl');

      await downloadFile(result.videoUrl, clipPath);
      const size = fs.statSync(clipPath).size;
      console.log(`   ✅ clip-${stepNum}-extend.mp4 — ${(size/1024/1024).toFixed(1)} MB`);

      // L'URL de cette vidéo étendue devient l'input du prochain extend
      currentVideoUrl = result.videoUrl;
      totalDuration += 4;
      successCount++;

    } catch (err) {
      console.error(`   ❌ Extension ${i+1} échouée : ${err.message}`);
      // On continue avec la dernière URL qui marchait
      console.log('   ⚠️  On continue avec le dernier clip valide');
    }
  }

  // ── Résumé ──
  console.log('\n\n🎬 ═══════════════════════════════════════════════════');
  console.log('              RÉSULTATS FINAUX');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`📊 Extensions réussies : ${successCount}/${EXTENDS.length}`);
  console.log(`⏱️  Durée totale : ${totalDuration}s`);

  // Le DERNIER fichier téléchargé contient toute la vidéo étendue
  const lastClipNum = String(successCount).padStart(2, '0');
  const finalClip = path.join(OUTPUT_DIR, `clip-${lastClipNum}-extend.mp4`);
  if (fs.existsSync(finalClip)) {
    const size = fs.statSync(finalClip).size;
    console.log(`\n🎬 Clip final : clip-${lastClipNum}-extend.mp4 — ${(size/1024/1024).toFixed(1)} MB`);
    console.log(`   📹 ${BASE_URL}/clip-${lastClipNum}-extend.mp4`);

    // Copier comme clip final
    const finalPath = path.join(OUTPUT_DIR, 'clip-final.mp4');
    fs.copyFileSync(finalClip, finalPath);
    console.log(`   📋 Copié vers clip-final.mp4`);
  }

  console.log(`\n💰 Crédits utilisés : ~${initialCredits + successCount * 30}`);
}

main().catch(err => { console.error('💥 Fatal:', err.message); process.exit(1); });
