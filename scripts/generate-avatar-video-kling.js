#!/usr/bin/env node
// =============================================
// JADOMI — Avatar Vidéo Pipeline Kling
// 1 avatar récurrent qui parle face caméra
// et se téléporte dans chaque univers métier
//
// Pipeline par scène :
//   1. image-to-video (portrait + prompt environnement)
//   2. lip-sync (vidéo + audio segment)
// =============================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const KLING_BASE_URL = 'https://api.klingai.com/v1';
const accessKey = process.env.KLING_ACCESS_KEY;
const secretKey = process.env.KLING_SECRET_KEY;
const BASE_URL = process.env.APP_URL || 'https://jadomi.fr';

const OUTPUT_DIR = path.join(__dirname, '..', 'public/assets/videos/home/avatar');
const AUDIO_DIR = path.join(__dirname, '..', 'public/assets/audio/home');
const AVATAR_IMAGE = `${BASE_URL}/assets/images/jadomi-avatar-base.jpg`;

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
// SCENES — L'avatar JADOMI dans chaque monde
// =============================================
const SCENES = [
  {
    id: '01-intro',
    i2v_prompt: 'A confident man in a black suit looking directly at the camera, slight natural head movement and blinking, clean dark studio background with subtle blue gradient lighting, professional corporate video style, cinematic, 4K',
    audio_file: '01-intro.mp3',
    audio_url: `${BASE_URL}/assets/audio/home/01-intro.mp3`,
  },
  {
    id: '02-dentiste',
    i2v_prompt: 'A confident man in a black suit standing inside a bright modern dental clinic, dental chair and equipment visible behind him, looking at camera, natural head movement, warm professional lighting, cinematic medium shot, 4K',
    audio_file: '02-dentiste-patient.mp3',
    audio_url: `${BASE_URL}/assets/audio/home/02-dentiste-patient.mp3`,
  },
  {
    id: '03-photo',
    i2v_prompt: 'A confident man in a black suit in a dental treatment room, dental light overhead, gesturing toward a dental chair, looking at camera with slight movement, clinical white environment, cinematic, 4K',
    audio_file: '03-dentiste-photo.mp3',
    audio_url: `${BASE_URL}/assets/audio/home/03-dentiste-photo.mp3`,
  },
  {
    id: '04-prothesiste',
    i2v_prompt: 'A confident man in a black suit standing in a dental laboratory workshop, porcelain crowns and dental models on workbench behind him, magnifying lamp visible, looking at camera, warm workshop lighting, cinematic, 4K',
    audio_file: '04-prothesiste-recoit.mp3',
    audio_url: `${BASE_URL}/assets/audio/home/04-prothesiste-recoit.mp3`,
  },
  {
    id: '05-fabrique',
    i2v_prompt: 'A confident man in a black suit in a dental lab, technician working on crown in background blurred, man looking at camera smiling slightly, professional atmosphere, cinematic shallow depth of field, 4K',
    audio_file: '05-prothesiste-fabrique.mp3',
    audio_url: `${BASE_URL}/assets/audio/home/05-prothesiste-fabrique.mp3`,
  },
  {
    id: '06-coursier',
    i2v_prompt: 'A confident man in a black suit sitting in the passenger seat of a delivery van, GPS navigation visible on dashboard tablet, city street through windshield, looking at camera, natural movement, morning light, cinematic, 4K',
    audio_file: '06-coursier-route.mp3',
    audio_url: `${BASE_URL}/assets/audio/home/06-coursier-route.mp3`,
  },
  {
    id: '07-recoit',
    i2v_prompt: 'A confident man in a black suit at a dental clinic reception, handing a small white box to someone off-camera, smiling at camera, bright modern clinic interior, warm natural daylight, cinematic, 4K',
    audio_file: '07-dentiste-recoit.mp3',
    audio_url: `${BASE_URL}/assets/audio/home/07-dentiste-recoit.mp3`,
  },
  {
    id: '08-infirmiere',
    i2v_prompt: 'A confident man in a black suit sitting in the backseat of a car, looking at camera, suburban residential street visible through car window, morning golden light, smartphone in hand showing notification, cinematic, 4K',
    audio_file: '08-infirmiere-annulation.mp3',
    audio_url: `${BASE_URL}/assets/audio/home/08-infirmiere-annulation.mp3`,
  },
  {
    id: '09-visio',
    i2v_prompt: 'A confident man in a black suit sitting at a modern desk with laptop showing a video call, home office setting, looking at camera, warm interior lighting, professional atmosphere, cinematic medium shot, 4K',
    audio_file: '09-infirmiere-visio.mp3',
    audio_url: `${BASE_URL}/assets/audio/home/09-infirmiere-visio.mp3`,
  },
  {
    id: '10-final',
    i2v_prompt: 'A confident man in a black suit looking directly at camera, slow zoom in on face, dark studio background with elegant golden backlight, powerful confident expression, cinematic hero shot, 4K',
    audio_file: '10-final.mp3',
    audio_url: `${BASE_URL}/assets/audio/home/10-final.mp3`,
  },
];

// =============================================
// POLLING
// =============================================

async function pollImageToVideo(taskId) {
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 10000));
    try {
      const resp = await axios.get(`${KLING_BASE_URL}/videos/image2video/${taskId}`, {
        headers: authHeaders(), timeout: 15000
      });
      const data = resp.data?.data;
      const status = data?.task_status;
      if (status === 'succeed') {
        return { ok: true, videoUrl: data?.task_result?.videos?.[0]?.url };
      }
      if (status === 'failed') {
        return { ok: false, error: data?.task_status_msg || 'failed' };
      }
      if (i % 4 === 0) process.stdout.write('.');
    } catch (e) { /* retry */ }
  }
  return { ok: false, error: 'timeout' };
}

async function pollLipSync(taskId) {
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 10000));
    try {
      const resp = await axios.get(`${KLING_BASE_URL}/videos/lip-sync/${taskId}`, {
        headers: authHeaders(), timeout: 15000
      });
      const data = resp.data?.data;
      const status = data?.task_status;
      if (status === 'succeed') {
        return { ok: true, videoUrl: data?.task_result?.videos?.[0]?.url };
      }
      if (status === 'failed') {
        return { ok: false, error: data?.task_status_msg || 'failed' };
      }
      if (i % 4 === 0) process.stdout.write('.');
    } catch (e) { /* retry */ }
  }
  return { ok: false, error: 'timeout' };
}

// =============================================
// PIPELINE PAR SCENE
// =============================================

async function processScene(scene) {
  const i2vPath = path.join(OUTPUT_DIR, `${scene.id}-raw.mp4`);
  const finalPath = path.join(OUTPUT_DIR, `${scene.id}-final.mp4`);

  // Skip si déjà fait
  if (fs.existsSync(finalPath) && fs.statSync(finalPath).size > 50000) {
    console.log(`  [SKIP] ${scene.id} — déjà terminé`);
    return finalPath;
  }

  // --- ETAPE 1 : Image-to-Video ---
  let i2vVideoUrl;
  if (fs.existsSync(i2vPath) && fs.statSync(i2vPath).size > 50000) {
    console.log(`  [SKIP i2v] ${scene.id} — vidéo brute existe`);
    // On a besoin de l'URL pour lip-sync... on va re-upload ou utiliser l'URL publique
    i2vVideoUrl = `${BASE_URL}/assets/videos/home/avatar/${scene.id}-raw.mp4`;
  } else {
    console.log(`  [i2v] ${scene.id} — génération vidéo avatar...`);
    try {
      const resp = await axios.post(`${KLING_BASE_URL}/videos/image2video`, {
        model_name: 'kling-v2-master',
        image: AVATAR_IMAGE,
        prompt: scene.i2v_prompt,
        negative_prompt: 'blur, deformed, ugly, text, watermark, multiple people',
        cfg_scale: 0.5,
        mode: 'pro',
        duration: '5',
        aspect_ratio: '16:9',
      }, { headers: authHeaders(), timeout: 30000 });

      const taskId = resp.data?.data?.task_id;
      if (!taskId) {
        console.log(`         ERREUR: ${JSON.stringify(resp.data).slice(0, 200)}`);
        return null;
      }
      process.stdout.write('         ');
      const result = await pollImageToVideo(taskId);
      console.log('');

      if (!result.ok) {
        console.log(`         ECHEC i2v: ${result.error}`);
        return null;
      }

      // Télécharger
      const dl = await axios.get(result.videoUrl, { responseType: 'arraybuffer', timeout: 120000 });
      fs.writeFileSync(i2vPath, Buffer.from(dl.data));
      console.log(`         OK i2v — ${(dl.data.length/1024/1024).toFixed(1)} MB`);
      i2vVideoUrl = result.videoUrl; // URL Kling temporaire pour lip-sync
    } catch (err) {
      console.log(`         ERREUR: ${err.response?.status} ${JSON.stringify(err.response?.data || err.message).slice(0,200)}`);
      return null;
    }
  }

  // --- ETAPE 2 : Lip-Sync ---
  console.log(`  [lip] ${scene.id} — synchronisation lèvres...`);
  try {
    // Utiliser l'URL publique du serveur pour l'audio et la vidéo
    const videoUrl = i2vVideoUrl || `${BASE_URL}/assets/videos/home/avatar/${scene.id}-raw.mp4`;

    const resp = await axios.post(`${KLING_BASE_URL}/videos/lip-sync`, {
      input: {
        video_url: videoUrl,
        audio_type: 'url',
        audio_url: scene.audio_url,
        mode: 'audio2video',
      },
    }, { headers: authHeaders(), timeout: 30000 });

    const taskId = resp.data?.data?.task_id;
    if (!taskId) {
      console.log(`         ERREUR lip-sync: ${JSON.stringify(resp.data).slice(0, 200)}`);
      // Fallback : garder la vidéo sans lip-sync
      if (fs.existsSync(i2vPath)) {
        fs.copyFileSync(i2vPath, finalPath);
        console.log(`         FALLBACK — vidéo sans lip-sync`);
        return finalPath;
      }
      return null;
    }
    process.stdout.write('         ');
    const result = await pollLipSync(taskId);
    console.log('');

    if (!result.ok) {
      console.log(`         ECHEC lip-sync: ${result.error}`);
      // Fallback
      if (fs.existsSync(i2vPath)) {
        fs.copyFileSync(i2vPath, finalPath);
        console.log(`         FALLBACK — vidéo sans lip-sync`);
        return finalPath;
      }
      return null;
    }

    // Télécharger le résultat final
    const dl = await axios.get(result.videoUrl, { responseType: 'arraybuffer', timeout: 120000 });
    fs.writeFileSync(finalPath, Buffer.from(dl.data));
    console.log(`         OK lip-sync — ${(dl.data.length/1024/1024).toFixed(1)} MB`);
    return finalPath;

  } catch (err) {
    console.log(`         ERREUR: ${err.response?.status} ${JSON.stringify(err.response?.data || err.message).slice(0,200)}`);
    if (fs.existsSync(i2vPath)) {
      fs.copyFileSync(i2vPath, finalPath);
      console.log(`         FALLBACK — vidéo sans lip-sync`);
      return finalPath;
    }
    return null;
  }
}

// =============================================
// MAIN
// =============================================
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  JADOMI Avatar Video — Kling Pipeline');
  console.log('  Avatar récurrent qui parle dans chaque monde');
  console.log('  10 scènes : image-to-video + lip-sync');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Portrait: ${AVATAR_IMAGE}`);
  console.log(`  Output:   ${OUTPUT_DIR}/`);
  console.log('');

  const results = [];

  for (let i = 0; i < SCENES.length; i++) {
    const scene = SCENES[i];
    console.log(`\n[${i+1}/${SCENES.length}] ${scene.id}`);
    const result = await processScene(scene);
    results.push({ id: scene.id, ok: !!result, path: result });

    // Pause entre scènes
    if (result && i < SCENES.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // Bilan
  const success = results.filter(r => r.ok).length;
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  BILAN : ${success}/${SCENES.length} scènes terminées`);
  results.forEach(r => console.log(`    ${r.ok ? '✓' : '✗'} ${r.id}`));
  console.log('═══════════════════════════════════════════════════════');

  if (success === SCENES.length) {
    console.log('\n  TOUTES LES SCENES OK — prêt pour assemblage final');
    console.log('  → node scripts/assemble-home-video.js');
  }
}

main().catch(err => {
  console.error('ERREUR FATALE:', err.message);
  process.exit(1);
});
