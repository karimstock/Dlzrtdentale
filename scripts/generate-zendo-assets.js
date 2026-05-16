#!/usr/bin/env node
/**
 * Génère les assets manquants pour le flyer ZENDO :
 * 1. NanoBanana : Dentiste blonde avec loupes Zendo Posture 45°
 * 2. NanoBanana : Dentiste brun avec loupes Zendo Vision Direct
 * 3. Vidu : Vidéo rotation MultiVision
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Load .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
}

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const VIDU_KEY = process.env.VIDU_API_KEY;
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'studio', 'generated', 'zendo-flyer');

// ═══ NanoBanana (Gemini Image Gen) ═══
async function generateImage(prompt, filename) {
  console.log(`\n🎨 NanoBanana: Generating "${filename}"...`);
  console.log(`   Prompt: ${prompt.substring(0, 100)}...`);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_KEY}`;

  const body = JSON.stringify({
    contents: [{
      parts: [{ text: `Generate a photorealistic image: ${prompt}` }]
    }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT']
    }
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`NanoBanana error ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  const candidates = data.candidates || [];
  for (const candidate of candidates) {
    const parts = candidate.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        const buffer = Buffer.from(part.inlineData.data, 'base64');
        const outPath = path.join(OUTPUT_DIR, filename);
        fs.writeFileSync(outPath, buffer);
        console.log(`   ✅ Saved: ${outPath} (${(buffer.length / 1024).toFixed(0)} KB)`);
        return outPath;
      }
    }
  }
  throw new Error('No image in NanoBanana response');
}

// ═══ Vidu img2video ═══
function viduRequest(apiPath, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const opts = {
      hostname: 'api.vidu.com',
      path: `/ent/v2${apiPath}`,
      method: 'POST',
      headers: {
        'Authorization': `Token ${VIDU_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 30000
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Vidu parse error: ${data.substring(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Vidu timeout')); });
    req.end(postData);
  });
}

function viduGetTask(taskId) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.vidu.com',
      path: `/ent/v2/tasks?task_ids=${taskId}`,
      method: 'GET',
      headers: { 'Authorization': `Token ${VIDU_KEY}` },
      timeout: 15000
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Vidu parse error: ${data.substring(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function generateVideo(imageUrl, prompt, filename) {
  console.log(`\n🎬 Vidu: Generating video "${filename}"...`);
  console.log(`   Image: ${imageUrl}`);
  console.log(`   Prompt: ${prompt.substring(0, 100)}...`);

  const result = await viduRequest('/img2video', {
    model: 'vidu2.0',
    images: [imageUrl],
    prompt: prompt,
    duration: 4,
    resolution: '720p'
  });

  console.log('   Vidu response:', JSON.stringify(result).substring(0, 200));

  const taskId = result.task_id || result.id;
  if (!taskId) {
    throw new Error('No task_id in Vidu response: ' + JSON.stringify(result).substring(0, 300));
  }

  console.log(`   Task ID: ${taskId} — polling...`);

  // Poll for completion
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const rawStatus = await viduGetTask(taskId);
    const status = rawStatus.tasks ? rawStatus.tasks[0] : rawStatus;
    const state = status.state || status.status || 'unknown';

    if (i % 6 === 0) console.log(`   Poll #${i}: ${state}`);

    if (state === 'success' || state === 'completed') {
      // Extract video URL
      const videoUrl = status.video_url
        || status.output?.video_url
        || (status.creations && status.creations[0]?.url)
        || (status.output?.creations && status.output.creations[0]?.url);

      if (!videoUrl) {
        console.log('   Full status:', JSON.stringify(status).substring(0, 500));
        throw new Error('Video completed but no URL found');
      }

      console.log(`   ✅ Video ready: ${videoUrl}`);

      // Download video
      const outPath = path.join(OUTPUT_DIR, filename);
      await downloadFile(videoUrl, outPath);
      console.log(`   ✅ Saved: ${outPath}`);
      return outPath;
    }

    if (state === 'failed' || state === 'error') {
      throw new Error(`Vidu task failed: ${JSON.stringify(status).substring(0, 300)}`);
    }
  }
  throw new Error('Vidu timeout after 10 minutes');
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : require('http');
    const file = fs.createWriteStream(dest);
    protocol.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

// ═══ MAIN ═══
async function main() {
  console.log('═══ ZENDO Asset Generator ═══');
  console.log(`Output: ${OUTPUT_DIR}`);

  if (!GEMINI_KEY) { console.error('❌ GEMINI_API_KEY missing'); process.exit(1); }
  if (!VIDU_KEY) { console.error('❌ VIDU_API_KEY missing'); process.exit(1); }

  const results = {};

  // 1. Blonde dentiste avec loupes Zendo Posture 45°
  try {
    results.blonde = await generateImage(
      `Professional dental clinic photograph. A beautiful blonde female dentist in her 30s wearing a pristine white dental coat, smiling confidently. She is wearing ZENDO brand dental loupes on her face: the loupes have a sleek dark metal eyeglass frame with two champagne-gold colored cylindrical barrel magnifiers attached at an ANGLED 45-degree downward position from the lens area. The barrels are metallic champagne/gold color, cylindrical shape, positioned symmetrically. The frame sits naturally on her face with the barrels pointing downward at 45 degrees. Clean modern dental office background, soft professional lighting, shallow depth of field. High-end medical equipment catalog style photograph. Photorealistic, 8K quality.`,
      'dentiste-blonde-zendo-real.png'
    );
  } catch (e) {
    console.error('❌ Blonde generation failed:', e.message);
  }

  // 2. Brun dentiste avec loupes Zendo Vision Direct
  try {
    results.brun = await generateImage(
      `Professional dental clinic photograph. A handsome brown-haired male dentist in his 30s-40s wearing a pristine white dental coat, looking professional and focused. He is wearing ZENDO brand dental loupes: a sporty black flip-up eyeglass frame with two silver/chrome Galilean prismatic barrel magnifiers attached at the front. The barrels are silver metallic, compact cylindrical shape, positioned straight forward (not angled). The ZENDO logo is subtle on the frame. He is working on a patient in a modern dental chair. Clean modern dental office, professional warm lighting. High-end medical catalog photograph. Photorealistic, 8K quality.`,
      'dentiste-brun-zendo-real.png'
    );
  } catch (e) {
    console.error('❌ Brun generation failed:', e.message);
  }

  // 3. Vidu video — MultiVision rotation
  try {
    const imageUrl = 'https://www.jadomi.fr/studio/generated/zendo-flyer/zendo-multivision-real-photo.png';
    results.video = await generateVideo(
      imageUrl,
      'The dental loupes slowly rotate 360 degrees on a clean white background, showing every angle of the product. Smooth cinematic rotation, professional product showcase, soft studio lighting with subtle reflections. The blue barrels and metal frame catch the light as they turn.',
      'video-multivision-rotation.mp4'
    );
  } catch (e) {
    console.error('❌ Video generation failed:', e.message);
  }

  console.log('\n═══ RÉSULTATS ═══');
  console.log(JSON.stringify(results, null, 2));
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
