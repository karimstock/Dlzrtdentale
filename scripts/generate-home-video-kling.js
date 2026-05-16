#!/usr/bin/env node
// =============================================
// JADOMI Home Video — Génération scènes Kling AI
// 2 scénarios réels montrant les workflows JADOMI :
//   A) Dentiste → Communication → Prothésiste → Livraison
//   B) Infirmière tournée → annulation → recalcul → visio avocate
// =============================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const KLING_BASE_URL = 'https://api.klingai.com/v1';
const accessKey = process.env.KLING_ACCESS_KEY;
const secretKey = process.env.KLING_SECRET_KEY;
const OUTPUT_DIR = path.join(__dirname, '..', 'public/assets/videos/home/scenes');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function generateJWT() {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: accessKey, exp: now + 1800, iat: now, nbf: now - 5
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', secretKey).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function authHeaders() {
  return { 'Authorization': `Bearer ${generateJWT()}`, 'Content-Type': 'application/json' };
}

// =============================================
// STORYBOARD — 8 scènes cinématiques
// =============================================
const SCENES = [
  // ═══ SCENARIO A : Dentiste → Prothésiste → Livraison ═══
  {
    id: '01-dentiste-patient',
    prompt: 'Dentist in white coat examining a patient in a modern dental chair, bright LED dental light overhead, dentist holding a dental mirror looking at patient open mouth, clean modern dental clinic interior, warm professional atmosphere, cinematic medium shot, shallow depth of field, 4K',
    negative_prompt: 'blur, deformed, ugly, text, watermark, blood, graphic',
    duration: '5',
    description: 'Dentiste examine patient — une prothèse est nécessaire',
  },
  {
    id: '02-dentiste-photo-shade',
    prompt: 'Dentist holding a smartphone very close to patient open mouth taking a photo of dental preparation, shade guide color tabs visible next to the tooth, dental clinic LED lighting, clinical close-up shot from behind dentist shoulder, professional medical photography moment, cinematic, 4K',
    negative_prompt: 'blur, deformed, ugly, watermark, blood, graphic',
    duration: '5',
    description: 'Photo substrat + teinte — envoi via JADOMI au prothésiste',
  },
  {
    id: '03-prothesiste-recoit',
    prompt: 'Dental lab technician in white coat sitting at workbench looking at a tablet screen showing dental photos and a case notification, dental laboratory equipment in background, magnifying lamp, porcelain crowns on workbench, technician nodding approvingly, warm workshop lighting, cinematic medium shot',
    negative_prompt: 'blur, deformed, ugly, text, watermark',
    duration: '5',
    description: 'Prothésiste reçoit le cas — photos + empreinte — valide sur JADOMI',
  },
  {
    id: '04-prothesiste-fabrique',
    prompt: 'Dental technician carefully crafting a porcelain dental crown at precision workbench, using fine tools under magnifying lamp, ceramic materials and dental models visible, focused concentrated work, warm cinematic lighting from lamp, close-up on hands and crown, professional dental lab atmosphere',
    negative_prompt: 'blur, deformed, ugly, text, watermark',
    duration: '5',
    description: 'Fabrication de la couronne au labo',
  },
  {
    id: '05-coursier-route',
    prompt: 'Delivery driver in branded polo shirt inside a van, one hand on steering wheel, tablet mounted on dashboard showing a GPS navigation map with multiple delivery stops highlighted, morning sunlight through windshield, city streets ahead, professional confident expression, cinematic shot from passenger side, shallow depth of field',
    negative_prompt: 'blur, deformed, ugly, text, watermark',
    duration: '5',
    description: 'Coursier en route — feuille de route live sur tablette',
  },
  {
    id: '06-dentiste-recoit-couronne',
    prompt: 'Dentist in white coat at reception desk of dental clinic, receiving a small white medical delivery box from a delivery man, dentist smiling looking satisfied, clean modern clinic reception area, natural daylight, cinematic medium two-shot, warm tones, professional handoff moment',
    negative_prompt: 'blur, deformed, ugly, text, watermark',
    duration: '5',
    description: 'Dentiste reçoit la couronne — tout le monde content',
  },

  // ═══ SCENARIO B : Infirmière tournée + visio avocate ═══
  {
    id: '07-infirmiere-notif-annulation',
    prompt: 'Female nurse in white medical coat sitting in car driver seat, looking at smartphone showing a red notification alert popup on screen, slightly surprised expression, car interior with morning light, medical bag on passenger seat, close-up on face and phone, cinematic shallow depth of field, natural lighting',
    negative_prompt: 'blur, deformed, ugly, text, watermark',
    duration: '5',
    description: 'Infirmière reçoit notif — patient annule — itinéraire recalculé',
  },
  {
    id: '08-infirmiere-visio-avocate',
    prompt: 'Female nurse in white coat sitting at home desk, laptop screen showing a video call with a professional woman lawyer in business suit, both women engaged in conversation, split composition showing nurse and laptop screen, warm home office lighting, modern interior, cinematic medium shot, professional teleconsultation atmosphere',
    negative_prompt: 'blur, deformed, ugly, text, watermark, split screen effect',
    duration: '5',
    description: 'Visio avocate via JADOMI — question juridique résolue',
  },
];

// =============================================
// GENERATION + POLLING
// =============================================

async function pollTask(taskId) {
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 8000));
    try {
      const resp = await axios.get(`${KLING_BASE_URL}/videos/text2video/${taskId}`, {
        headers: authHeaders(), timeout: 15000
      });
      const data = resp.data?.data;
      const status = data?.task_status;

      if (status === 'succeed') {
        const videoUrl = data?.task_result?.videos?.[0]?.url;
        return { ok: true, videoUrl };
      }
      if (status === 'failed') {
        return { ok: false, error: data?.task_status_msg || 'unknown' };
      }
      if (i % 5 === 0) process.stdout.write('.');
    } catch (e) { /* retry */ }
  }
  return { ok: false, error: 'timeout 12min' };
}

async function generateScene(scene) {
  const outPath = path.join(OUTPUT_DIR, `${scene.id}.mp4`);

  // Skip si déjà généré
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 100000) {
    console.log(`  [SKIP] ${scene.id} — déjà généré (${(fs.statSync(outPath).size/1024/1024).toFixed(1)} MB)`);
    return outPath;
  }

  console.log(`  [GEN] ${scene.id}`);
  console.log(`        ${scene.description}`);

  try {
    const resp = await axios.post(`${KLING_BASE_URL}/videos/text2video`, {
      model_name: 'kling-v2-master',
      prompt: scene.prompt,
      negative_prompt: scene.negative_prompt,
      cfg_scale: 0.5,
      mode: 'pro',
      duration: scene.duration,
      aspect_ratio: '16:9',
    }, { headers: authHeaders(), timeout: 30000 });

    const taskId = resp.data?.data?.task_id;
    if (!taskId) {
      console.log(`        ERREUR — réponse:`, JSON.stringify(resp.data).slice(0, 200));
      return null;
    }
    console.log(`        task: ${taskId}`);
    process.stdout.write('        ');

    const result = await pollTask(taskId);
    console.log('');

    if (!result.ok) {
      console.log(`        ECHEC: ${result.error}`);
      return null;
    }

    // Télécharger
    const dlResp = await axios.get(result.videoUrl, { responseType: 'arraybuffer', timeout: 120000 });
    fs.writeFileSync(outPath, Buffer.from(dlResp.data));
    console.log(`        OK — ${(dlResp.data.length / 1024 / 1024).toFixed(1)} MB`);
    return outPath;

  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data ? JSON.stringify(err.response.data).slice(0, 200) : err.message;
    console.log(`        ERREUR (${status}): ${detail}`);
    return null;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  JADOMI Home Video — Génération Kling AI');
  console.log('  8 scènes x 5s = 40s de footage cinématique');
  console.log('  Budget estimé : ~80-120 units');
  console.log('═══════════════════════════════════════════════════\n');

  console.log('SCENARIO A — Dentiste → Prothésiste → Livraison');
  console.log('─────────────────────────────────────────────────');

  const resultsA = [];
  for (const scene of SCENES.filter(s => parseInt(s.id) <= 6)) {
    const r = await generateScene(scene);
    resultsA.push({ id: scene.id, ok: !!r });
    if (r) await new Promise(res => setTimeout(res, 2000));
  }

  console.log('\nSCENARIO B — Infirmière tournée + visio avocate');
  console.log('─────────────────────────────────────────────────');

  const resultsB = [];
  for (const scene of SCENES.filter(s => parseInt(s.id) > 6)) {
    const r = await generateScene(scene);
    resultsB.push({ id: scene.id, ok: !!r });
    if (r) await new Promise(res => setTimeout(res, 2000));
  }

  // Bilan
  const all = [...resultsA, ...resultsB];
  const success = all.filter(r => r.ok).length;
  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  BILAN : ${success}/${all.length} scènes générées`);
  all.forEach(r => console.log(`    ${r.ok ? '✓' : '✗'} ${r.id}`));
  console.log('═══════════════════════════════════════════════════');

  if (success > 0) {
    console.log(`\n  Fichiers : ${OUTPUT_DIR}/`);
    console.log('  Prochaine étape : régénérer voiceover + assembler');
  }
}

main().catch(err => {
  console.error('ERREUR FATALE:', err.message);
  process.exit(1);
});
