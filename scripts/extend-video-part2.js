#!/usr/bin/env node
// ============================================
// Script : Continue Vidu /extend pour brossage partie 2
// Reprend à part2-05 (28s) → objectif ~60s
// Méthode : extraire dernière frame → img2video 4s → concat
// ============================================

const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '/home/ubuntu/jadomi/.env' });

const VIDU_KEY = process.env.VIDU_API_KEY;
const CONTINU_DIR = '/home/ubuntu/jadomi/public/studio/assets/brossage/continu';
const PUBLIC_BASE = 'https://jadomi.fr/studio/assets/brossage/continu';

// Prompts cohérents pour la suite de la partie 2 (célébration brossage)
const PROMPTS = [
  "The three cute unicorn characters (pink baby, purple mom, blue dad) in the colorful bathroom celebrating with golden stars falling around them, the pink baby unicorn holds up a sparkling toothbrush proudly, confetti and rainbow sparkles, 3D Pixar animation style, warm lighting, joyful expressions",
  "The three cute unicorn characters dance together in the pink bathroom, golden stars and sparkles swirling around them, the baby pink unicorn giggles showing clean white teeth, purple and blue parent unicorns clap their hooves, 3D Pixar animation style, magical atmosphere",
  "Close-up of the baby pink unicorn smiling wide showing perfectly clean sparkling white teeth, golden star reward floats above, purple mom unicorn and blue dad unicorn hug the baby, bathroom background with rainbow, 3D Pixar style, warm golden light",
  "The three unicorn characters (pink baby, purple, blue) walk out of the bathroom together, the baby unicorn waves goodbye happily holding toothbrush like a magic wand, trail of golden stars behind them, 3D Pixar animation, warm sunset light through window",
  "The baby pink unicorn yawns sleepily, purple and blue parent unicorns tuck the baby into bed with star-covered blanket, toothbrush on nightstand, golden stars on walls glow softly, cozy bedroom, 3D Pixar animation style, warm night light",
  "Gentle zoom out of the cozy bedroom, baby pink unicorn sleeping peacefully with smile, sparkling clean teeth visible, purple and blue parent unicorns watch lovingly, stars twinkle on ceiling, 3D Pixar animation, soft moonlight",
  "Final wide shot of the magical unicorn house at night, stars twinkling, a golden toothbrush constellation appears in the sky, warm light glowing from bedroom window, 3D Pixar animation style, dreamy magical atmosphere",
  "Magical ending scene: a golden star with a toothbrush silhouette shines brightly against a soft purple-pink sky, sparkles cascade down, text area below for logo, 3D Pixar animation style, cinematic, beautiful",
];

let currentClipIndex = 6; // On reprend après part2-06

function viduRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.vidu.com',
      path: '/ent/v2' + apiPath,
      method,
      headers: {
        'Authorization': 'Token ' + VIDU_KEY,
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
            reject(new Error(`Vidu ${res.statusCode}: ${parsed.message || data.substring(0, 300)}`));
          } else resolve(parsed);
        } catch { reject(new Error('Vidu parse: ' + data.substring(0, 300))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (payload) req.end(payload); else req.end();
  });
}

async function pollTask(taskId) {
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const resp = await viduRequest('GET', `/tasks?task_ids=${taskId}`);
    const task = resp.tasks?.[0] || resp;
    const state = task.state || task.status;
    console.log(`  [poll ${i + 1}] ${state} ${task.progress || ''}%`);

    if (state === 'completed' || state === 'success') {
      const creation = task.creations?.[0] || {};
      const videoUrl = creation.url || task.video_url || task.output?.video_url;
      if (!videoUrl) {
        console.log('  Réponse complète:', JSON.stringify(task).substring(0, 500));
      }
      return videoUrl;
    }
    if (state === 'failed') {
      throw new Error('Génération échouée: ' + (task.err_msg || task.error || task.message || JSON.stringify(task).substring(0, 200)));
    }
  }
  throw new Error('Timeout 10min');
}

function extractLastFrame(videoPath, outputPath) {
  execSync(`ffmpeg -y -sseof -0.5 -i "${videoPath}" -frames:v 1 -q:v 2 "${outputPath}" 2>/dev/null`);
  console.log(`  Frame extraite: ${outputPath}`);
}

function downloadVideo(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    const doRequest = (url) => {
      const mod = url.startsWith('https') ? https : require('http');
      mod.get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return doRequest(res.headers.location);
        }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', reject);
    };
    doRequest(url);
  });
}

function concatVideos(existingPath, newClipPath, outputPath) {
  const listFile = '/tmp/concat-extend.txt';
  fs.writeFileSync(listFile, `file '${existingPath}'\nfile '${newClipPath}'\n`);
  execSync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${outputPath}" 2>/dev/null`);
  console.log(`  Concaténé: ${outputPath}`);
}

async function extendOneStep(promptIndex) {
  const prevClip = path.join(CONTINU_DIR, `part2-${String(currentClipIndex).padStart(2, '0')}-extend.mp4`);
  const nextIndex = currentClipIndex + 1;
  const framePath = path.join(CONTINU_DIR, `part2-frame-${nextIndex}.png`);
  const newClipPath = `/tmp/part2-new-${nextIndex}.mp4`;
  const outputPath = path.join(CONTINU_DIR, `part2-${String(nextIndex).padStart(2, '0')}-extend.mp4`);

  console.log(`\n=== Extension ${nextIndex} (prompt ${promptIndex + 1}/${PROMPTS.length}) ===`);

  // 1. Extraire dernière frame
  extractLastFrame(prevClip, framePath);

  // 2. Upload frame comme URL publique (copier dans le dossier public)
  const frameUrl = `${PUBLIC_BASE}/part2-frame-${nextIndex}.png`;
  console.log(`  Image URL: ${frameUrl}`);

  // 3. Appeler Vidu img2video (API v2)
  const prompt = PROMPTS[promptIndex];
  console.log(`  Prompt: ${prompt.substring(0, 80)}...`);

  const viduBody = {
    model: 'viduq3-turbo',
    images: [frameUrl],
    prompt: prompt,
    duration: 4,
    resolution: '720p',
  };

  const result = await viduRequest('POST', '/img2video', viduBody);
  const taskId = result.task_id || result.id;
  console.log(`  Task ID: ${taskId}`);

  if (!taskId) {
    console.error('  PAS DE TASK ID:', JSON.stringify(result).substring(0, 500));
    throw new Error('Pas de task_id');
  }

  // 4. Polling
  const videoUrl = await pollTask(taskId);
  if (!videoUrl) throw new Error('Pas de video_url dans la réponse');
  console.log(`  Video URL: ${videoUrl}`);

  // 5. Télécharger le clip
  await downloadVideo(videoUrl, newClipPath);
  console.log(`  Clip téléchargé: ${newClipPath}`);

  // 6. Concaténer
  concatVideos(prevClip, newClipPath, outputPath);

  // 7. Vérifier durée
  const duration = execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${outputPath}"`).toString().trim();
  console.log(`  Durée totale partie 2: ${parseFloat(duration).toFixed(1)}s`);

  currentClipIndex = nextIndex;

  // Nettoyage
  fs.unlinkSync(newClipPath);

  return parseFloat(duration);
}

async function main() {
  console.log('=== REPRISE EXTENSION VIDÉO BROSSAGE PARTIE 2 ===');
  console.log(`Dernier clip: part2-${String(currentClipIndex).padStart(2, '0')}-extend.mp4`);
  console.log(`Objectif: ~60 secondes\n`);

  const targetDuration = 58; // Viser ~58s pour être proche de 60s

  for (let i = 1; i < PROMPTS.length; i++) {
    try {
      const duration = await extendOneStep(i);
      if (duration >= targetDuration) {
        console.log(`\n✓ Objectif atteint: ${duration.toFixed(1)}s`);
        break;
      }
    } catch (err) {
      console.error(`\n✗ Erreur extension ${currentClipIndex + 1}:`, err.message);
      console.log('Attente 10s avant retry...');
      await new Promise(r => setTimeout(r, 10000));
      i--; // Retry
    }
  }

  // Assemblage final partie 2
  const finalPart2 = path.join(CONTINU_DIR, 'part2-final.mp4');
  const lastClip = path.join(CONTINU_DIR, `part2-${String(currentClipIndex).padStart(2, '0')}-extend.mp4`);
  fs.copyFileSync(lastClip, finalPart2);
  console.log(`\nPartie 2 finale: ${finalPart2}`);

  // Assemblage partie 1 + partie 2
  const part1 = path.join(CONTINU_DIR, 'clip-final.mp4');
  const finalVideo = '/home/ubuntu/jadomi/public/studio/assets/brossage/video-brossage-complete.mp4';

  // Re-encode pour compatibilité concat
  const part1Norm = '/tmp/part1-norm.mp4';
  const part2Norm = '/tmp/part2-norm.mp4';

  console.log('\nNormalisation des parties pour assemblage...');
  execSync(`ffmpeg -y -i "${part1}" -c:v libx264 -preset fast -crf 23 -r 24 -s 1176x784 -an "${part1Norm}" 2>/dev/null`);
  execSync(`ffmpeg -y -i "${finalPart2}" -c:v libx264 -preset fast -crf 23 -r 24 -s 1176x784 -an "${part2Norm}" 2>/dev/null`);

  const finalList = '/tmp/concat-final.txt';
  fs.writeFileSync(finalList, `file '${part1Norm}'\nfile '${part2Norm}'\n`);
  execSync(`ffmpeg -y -f concat -safe 0 -i "${finalList}" -c copy "${finalVideo}" 2>/dev/null`);

  const finalDur = execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${finalVideo}"`).toString().trim();
  console.log(`\n=== VIDÉO FINALE ===`);
  console.log(`Fichier: ${finalVideo}`);
  console.log(`Durée: ${parseFloat(finalDur).toFixed(1)}s`);
  console.log(`Taille: ${(fs.statSync(finalVideo).size / 1024 / 1024).toFixed(1)} Mo`);
}

main().catch(err => {
  console.error('ERREUR FATALE:', err.message);
  process.exit(1);
});
