#!/usr/bin/env node
// =============================================
// JADOMI Pub — Génération continue 4×10s
// Chaque clip utilise le dernier frame du précédent
// Résultat : 40s fluide d'un seul tenant
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
const OUTPUT_DIR = path.join(__dirname, '..', 'public/assets/videos/home/pub');
const AVATAR_IMG = 'https://jadomi.fr/assets/images/jadomi-avatar-base.jpg';

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function generateJWT() {
  const header = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const now = Math.floor(Date.now()/1000);
  const payload = Buffer.from(JSON.stringify({iss:accessKey,exp:now+1800,iat:now,nbf:now-5})).toString('base64url');
  const sig = crypto.createHmac('sha256',secretKey).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function auth() {
  return { 'Authorization': `Bearer ${generateJWT()}`, 'Content-Type': 'application/json' };
}

// Les 4 prompts de 10s chacun
const CLIPS = [
  {
    id: 'clip-01-intro-cabinet',
    prompt: `0-3s: Confident man in black suit walks forward in a dark minimal space with golden rim light on his silhouette, reflective floor, he looks at camera with purpose. 3-6s: A large glowing screen appears ahead showing a sleek dark dashboard interface with golden accents and notification cards, he reaches out and taps the screen with his finger. 6-10s: The screen shatters into golden light particles, he walks through them without stopping, emerging into a bright modern dental clinic with white walls and chrome equipment, a dentist in white coat visible working on a patient in a dental chair. Continuous steadicam tracking from front, cinematic golden to clinical white lighting transition, 4K.`,
  },
  {
    id: 'clip-02-labo-coursier',
    prompt: `0-3s: Man in black suit continues walking forward through the dental clinic, passes the dentist who looks up and nods at him, clinic walls begin to warm in color and darken. 3-6s: The environment smoothly transforms into a dental prosthetics laboratory with amber workshop lighting, workbenches with dental models on both sides, a technician in white coat sculpts a crown under a magnifying lamp, the technician holds up the finished crown as the man passes. 6-10s: The lab opens up, morning sunlight floods in, he walks into a delivery van interior seen from inside, a GPS tablet on the dashboard shows a blue route with delivery stops, he taps the tablet and keeps walking out through the van door into golden morning street light. Continuous tracking shot, warm amber to morning gold lighting, seamless transitions, 4K.`,
  },
  {
    id: 'clip-03-infirmiere-avocate',
    prompt: `0-3s: Man in black suit walks forward on a suburban morning street with golden light and trees, a nurse in white medical coat sits in a parked car, her phone screen lights up red with a notification, the route on her phone recalculates instantly. 3-6s: He walks past the car, the nurse looks relieved, the street environment begins transforming as he keeps moving, walls rise around him, bookshelves appear. 6-10s: He enters an elegant office interior, a large screen shows a video call with a professional woman lawyer in blazer speaking, he gestures toward the screen with a knowing smile, then the office begins to dim as he walks forward into darkness. Continuous tracking shot, natural daylight to interior warm lighting, seamless environment transition, 4K.`,
  },
  {
    id: 'clip-04-final-equipe',
    prompt: `0-3s: Man in black suit walks forward into a dark space with dramatic golden rim lighting from behind, he slows his pace, individual spotlights illuminate professionals one by one on each side of him: a dentist, a lab technician, a courier, a nurse, a lawyer, each standing proud. 3-7s: He stops walking for the first time, turns to face camera directly, the professionals step forward and form a semi-circle behind him, all lit by warm golden backlight, connected by subtle golden light threads between them. 7-10s: He stands center frame, adjusts his jacket, looks at camera with absolute confidence and a powerful calm smile, slight slow dolly in on his face, the team stands united behind him, epic hero shot moment. Dramatic golden backlighting, deep blacks, cinematic finale, 4K.`,
  },
];

async function pollTask(taskId, type = 'image2video') {
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 10000));
    try {
      const resp = await axios.get(`${KLING_BASE_URL}/videos/${type}/${taskId}`, {
        headers: auth(), timeout: 15000
      });
      const data = resp.data?.data;
      if (data?.task_status === 'succeed') {
        return data.task_result.videos[0].url;
      }
      if (data?.task_status === 'failed') {
        console.log(`    ECHEC: ${data.task_status_msg}`);
        return null;
      }
      if (i % 4 === 0) process.stdout.write('.');
    } catch(e) {}
  }
  return null;
}

function extractLastFrame(videoPath, outputPath) {
  execSync(`ffmpeg -y -sseof -0.1 -i "${videoPath}" -frames:v 1 -q:v 2 "${outputPath}" 2>/dev/null`);
}

async function generateClip(clip, imageInput) {
  const outVideo = path.join(OUTPUT_DIR, `${clip.id}.mp4`);
  const outFrame = path.join(OUTPUT_DIR, `${clip.id}-lastframe.jpg`);

  // Skip si déjà fait
  if (fs.existsSync(outVideo) && fs.statSync(outVideo).size > 500000) {
    console.log(`  [SKIP] ${clip.id} existe`);
    if (!fs.existsSync(outFrame)) extractLastFrame(outVideo, outFrame);
    return outVideo;
  }

  console.log(`  [GEN] ${clip.id}`);
  console.log(`    Image: ${imageInput.slice(0, 60)}...`);

  try {
    const resp = await axios.post(`${KLING_BASE_URL}/videos/image2video`, {
      model_name: 'kling-v3',
      image: imageInput,
      prompt: clip.prompt,
      negative_prompt: 'blur, deformed fingers, extra fingers, mutated hands, ugly, static, frozen, cartoon, 3D render, morphing face, flickering, multiple copies of same person, text overlay',
      cfg_scale: 0.5,
      mode: 'pro',
      duration: '10',
      aspect_ratio: '16:9',
    }, { headers: auth(), timeout: 30000 });

    const taskId = resp.data?.data?.task_id;
    if (!taskId) {
      console.log(`    ERREUR: ${JSON.stringify(resp.data).slice(0, 200)}`);
      return null;
    }
    console.log(`    Task: ${taskId}`);
    process.stdout.write('    ');

    const videoUrl = await pollTask(taskId, 'image2video');
    console.log('');
    if (!videoUrl) return null;

    const dl = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 180000 });
    fs.writeFileSync(outVideo, Buffer.from(dl.data));
    console.log(`    OK — ${(dl.data.length/1024/1024).toFixed(1)} MB`);

    // Extraire le dernier frame pour le clip suivant
    extractLastFrame(outVideo, outFrame);
    console.log(`    Last frame → ${outFrame}`);

    return outVideo;
  } catch(err) {
    const msg = err.response?.data?.message || err.message;
    console.log(`    ERREUR: ${err.response?.status} ${msg.slice(0,150)}`);
    // Rate limit → attendre
    if (err.response?.data?.code === 1303) {
      console.log('    Rate limit — attente 60s...');
      await new Promise(r => setTimeout(r, 60000));
      return generateClip(clip, imageInput); // retry
    }
    return null;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  JADOMI PUB — 4 clips × 10s = 40s continu');
  console.log('  Modèle: kling-v3 / pro / 10s');
  console.log('  Budget: ~140 crédits (4 × 35)');
  console.log('═══════════════════════════════════════════════════\n');

  let currentImage = AVATAR_IMG;
  const results = [];

  for (let i = 0; i < CLIPS.length; i++) {
    const clip = CLIPS[i];
    const video = await generateClip(clip, currentImage);
    results.push({ id: clip.id, ok: !!video, path: video });

    if (video) {
      // Le prochain clip utilise le dernier frame de celui-ci
      const lastFrame = path.join(OUTPUT_DIR, `${clip.id}-lastframe.jpg`);
      if (fs.existsSync(lastFrame)) {
        // Upload vers jadomi.fr pour que l'API puisse y accéder
        currentImage = `https://jadomi.fr/assets/videos/home/pub/${clip.id}-lastframe.jpg`;
      }
      // Pause entre générations
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  // Assembler les 4 clips
  const successClips = results.filter(r => r.ok);
  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  BILAN: ${successClips.length}/${CLIPS.length} clips générés`);
  results.forEach(r => console.log(`    ${r.ok ? '✓' : '✗'} ${r.id}`));

  if (successClips.length === CLIPS.length) {
    console.log('\n  Assemblage...');
    const concatList = successClips.map(r => `file '${r.path}'`).join('\n');
    const concatFile = path.join(OUTPUT_DIR, 'concat.txt');
    fs.writeFileSync(concatFile, concatList);
    const finalPath = path.join(OUTPUT_DIR, 'jadomi-pub-40s.mp4');
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p "${finalPath}" 2>/dev/null`, { maxBuffer: 200*1024*1024 });
    const dur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${finalPath}"`).toString().trim());
    console.log(`  VIDÉO FINALE: ${dur.toFixed(1)}s`);
    console.log(`  https://jadomi.fr/assets/videos/home/pub/jadomi-pub-40s.mp4`);
  }
  console.log('═══════════════════════════════════════════════════');
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
