#!/usr/bin/env node
// =============================================
// Kling Avatar Pipeline : image → video → lip-sync
// Etape 1 : image-to-video (visage anime, 5s)
// Etape 2 : lip-sync (levres synchronisees sur audio FR)
// =============================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const KLING_BASE_URL = 'https://api.klingai.com/v1';
const accessKey = process.env.KLING_ACCESS_KEY;
const secretKey = process.env.KLING_SECRET_KEY;
const BASE_URL = process.env.APP_URL || 'https://jadomi.fr';
const PEXELS_KEY = process.env.PEXELS_API_KEY;

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

async function pollTask(endpoint, taskId, label) {
  console.log(`  Polling ${label} (check toutes les 10s)...`);
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 10000));
    try {
      const resp = await axios.get(`${endpoint}/${taskId}`, { headers: authHeaders(), timeout: 15000 });
      const data = resp.data?.data;
      const status = data?.task_status;
      process.stdout.write(`  [${(i+1)*10}s] ${status}       \r`);

      if (status === 'succeed') {
        const videoUrl = data?.task_result?.videos?.[0]?.url;
        console.log(`\n  SUCCES — URL: ${videoUrl?.slice(0, 80)}...`);
        return { ok: true, videoUrl, data };
      }
      if (status === 'failed') {
        console.log(`\n  ECHEC — ${data?.task_status_msg || 'raison inconnue'}`);
        return { ok: false, error: data?.task_status_msg };
      }
    } catch (e) {
      // continue polling
    }
  }
  console.log('\n  TIMEOUT (10 min)');
  return { ok: false, error: 'timeout' };
}

async function main() {
  console.log('=== Kling Avatar Pipeline ===\n');

  // Audio
  const audioUrl = `${BASE_URL}/assets/audio/home/09-final.mp3`;
  console.log('Audio:', audioUrl);

  // Photo portrait
  console.log('Recherche portrait pro Pexels...');
  const pResp = await axios.get('https://api.pexels.com/v1/search', {
    headers: { Authorization: PEXELS_KEY },
    params: { query: 'professional man portrait face confident dark background', per_page: 3, orientation: 'landscape' }
  });
  const photo = pResp.data.photos?.[0];
  if (!photo) { console.error('Aucune photo trouvee'); return; }
  const imageUrl = photo.src.large2x || photo.src.large;
  console.log(`Photo: Pexels #${photo.id}\n`);

  // ═══ ETAPE 1 : Image-to-Video ═══
  console.log('ETAPE 1 — Image-to-Video (5s)');
  let i2vTaskId;
  try {
    const resp = await axios.post(`${KLING_BASE_URL}/videos/image2video`, {
      model_name: 'kling-v1-5',
      image: imageUrl,
      prompt: 'Professional person looking at camera with confident expression, slight natural head movement, studio lighting, cinematic, dark background',
      negative_prompt: 'blur, deformed, ugly, text',
      cfg_scale: 0.5,
      mode: 'std',
      duration: '5',
      aspect_ratio: '16:9',
    }, { headers: authHeaders(), timeout: 30000 });

    i2vTaskId = resp.data?.data?.task_id;
    console.log(`  Task ID: ${i2vTaskId}`);
    if (!i2vTaskId) {
      console.log('  Reponse:', JSON.stringify(resp.data));
      return;
    }
  } catch (err) {
    console.error('  ERREUR:', err.response?.status, JSON.stringify(err.response?.data || err.message));
    return;
  }

  const i2vResult = await pollTask(`${KLING_BASE_URL}/videos/image2video`, i2vTaskId, 'image2video');
  if (!i2vResult.ok) {
    console.log('Arret — image-to-video echoue');
    return;
  }

  // Sauvegarder la video intermediaire
  const i2vPath = path.join(__dirname, '..', 'public/assets/videos/home/kling-avatar-raw.mp4');
  const dlResp = await axios.get(i2vResult.videoUrl, { responseType: 'arraybuffer', timeout: 120000 });
  fs.writeFileSync(i2vPath, Buffer.from(dlResp.data));
  console.log(`  Sauvegarde: ${i2vPath} (${(dlResp.data.length / 1024 / 1024).toFixed(1)} MB)\n`);

  // ═══ ETAPE 2 : Lip-Sync ═══
  console.log('ETAPE 2 — Lip-Sync (audio FR sur video)');
  let lsTaskId;
  try {
    const resp = await axios.post(`${KLING_BASE_URL}/videos/lip-sync`, {
      input: {
        video_url: i2vResult.videoUrl,
        audio_type: 'url',
        audio_url: audioUrl,
        mode: 'audio2video',
      },
    }, { headers: authHeaders(), timeout: 30000 });

    lsTaskId = resp.data?.data?.task_id;
    console.log(`  Task ID: ${lsTaskId}`);
    if (!lsTaskId) {
      console.log('  Reponse:', JSON.stringify(resp.data));
      console.log('\n  PLAN B — Video sans lip-sync sauvegardee dans kling-avatar-raw.mp4');
      return;
    }
  } catch (err) {
    console.error('  ERREUR lip-sync:', err.response?.status, JSON.stringify(err.response?.data || err.message));
    console.log('\n  PLAN B — Video sans lip-sync sauvegardee dans kling-avatar-raw.mp4');
    return;
  }

  const lsResult = await pollTask(`${KLING_BASE_URL}/videos/lip-sync`, lsTaskId, 'lip-sync');
  if (!lsResult.ok) {
    console.log('Lip-sync echoue — la video image2video reste utilisable (kling-avatar-raw.mp4)');
    return;
  }

  // Sauvegarder le resultat final lip-sync
  const finalPath = path.join(__dirname, '..', 'public/assets/videos/home/kling-lipsync-avatar.mp4');
  const finalResp = await axios.get(lsResult.videoUrl, { responseType: 'arraybuffer', timeout: 120000 });
  fs.writeFileSync(finalPath, Buffer.from(finalResp.data));
  console.log(`\n  AVATAR LIP-SYNC FINAL: ${finalPath} (${(finalResp.data.length / 1024 / 1024).toFixed(1)} MB)`);

  console.log('\n=== PIPELINE TERMINE ===');
}

main().catch(err => {
  console.error('ERREUR FATALE:', err.message);
  process.exit(1);
});
