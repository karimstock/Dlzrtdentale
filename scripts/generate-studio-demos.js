#!/usr/bin/env node
// =============================================
// JADOMI Studio — Generateur de demos visuelles
// Genere images DALL-E 3 + videos Sora 2
// Upload R2 + sauvegarde JSON
// Usage : node scripts/generate-studio-demos.js
// Cout estime : ~12 USD
// =============================================

require('dotenv').config();
const OpenAI = require('openai');
const axios = require('axios');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- R2 ---
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  }
});
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'jadomi-rush-fichiers';
const R2_PUBLIC = process.env.CLOUDFLARE_R2_PUBLIC_URL;

async function uploadToR2(buffer, key, contentType) {
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return `${R2_PUBLIC}/${key}`;
}

// =============================================
// PROMPTS
// =============================================

const IMAGE_PROMPTS = [
  {
    id: 'formation-implanto',
    prompt: 'Professional dental training advertisement. Modern dental clinic with warm golden lighting. Experienced female dentist in white coat holding dental model, explaining to a group. Premium quality. Gold accent color palette #c9a961. Text overlay reads "Formation Implantologie - 3 jours - 1500€". Cinematic composition, photorealistic, 16:9 banner format.',
    title: 'Formation Implantologie',
  },
  {
    id: 'catalogue-premium',
    prompt: 'Luxury dental product advertisement. Premium dental materials and instruments elegantly displayed on dark matte background with gold accent elements. Professional laboratory setting with subtle warm lighting. Text overlay reads "Catalogue 2026 - Matériaux Premium". Modern, minimalist composition, photorealistic.',
    title: 'Catalogue Materiaux',
  },
  {
    id: 'gestion-cabinet',
    prompt: 'Dental software promotional banner. Modern bright dental clinic with tablet showing clean interface dashboard. Smiling male dentist presenting analytics screen to a colleague. Warm inviting atmosphere, gold accents on furniture. Text overlay reads "JADOMI - Gestion Cabinet Intelligente". Professional and approachable, photorealistic.',
    title: 'Gestion Cabinet',
  },
  {
    id: 'congres-adf',
    prompt: 'Dental conference event poster design. Modern convention stage with keynote speaker addressing audience of dental professionals. Elegant venue with dramatic lighting, gold accents. Text overlay reads "Congrès ADF 2026 - Paris". Dynamic composition suggesting innovation and prestige. Photorealistic, cinematic.',
    title: 'Congres ADF 2026',
  },
  {
    id: 'prothese-ceramique',
    prompt: 'Dental laboratory services advertisement. Extreme precision view of beautiful ceramic dental prosthesis being crafted by skilled hands. Scientific yet premium artistic feel. Dark background with gold warm lighting. Text overlay reads "Prothèses Céramique - Excellence Française". Detailed, elegant, photorealistic.',
    title: 'Protheses Ceramique',
  },
  {
    id: 'audience-ciblee',
    prompt: 'Digital dental marketing concept. Young confident female dentist creating content on laptop in modern minimalist office. Analytics charts visible on screen. Warm professional atmosphere with gold accent elements. Text overlay reads "42 000 dentistes - Audience vérifiée". Inspirational, photorealistic, cinematic lighting.',
    title: 'Audience Ciblee',
  },
];

const VIDEO_PROMPTS = [
  {
    id: 'clinic-tour',
    prompt: 'Cinematic smooth camera pan through a modern premium dental clinic interior. Starting from a sleek reception desk with warm golden lighting, slowly moving through a bright corridor to a state-of-the-art treatment room with advanced equipment. Soft ambient lighting with gold accent tones. Professional, calming atmosphere. No text overlays. Photorealistic, high production value.',
    title: 'Cabinet Connecte',
    duration: 10,
  },
  {
    id: 'implant-3d',
    prompt: 'Elegant rotating 3D visualization of a modern titanium dental implant on a clean dark background. Slow rotation revealing the threaded surface detail. Subtle gold accent lighting creating premium reflections. Scientific precision meets luxury aesthetics. Smooth continuous rotation. No text. Photorealistic rendering.',
    title: 'Implant Premium',
    duration: 10,
  },
  {
    id: 'smile-design',
    prompt: 'A friendly dentist and patient sitting together in a bright modern dental office, looking at a tablet screen showing smile design results. The patient gradually smiles with satisfaction. Warm golden hour lighting through large windows. Natural interaction, genuine emotions. Professional yet approachable atmosphere. Photorealistic.',
    title: 'Smile Design',
    duration: 10,
  },
  {
    id: 'gold-particles',
    prompt: 'Abstract elegant motion design: flowing luminous gold particles on a deep dark background, slowly forming and dissolving dental shapes - a tooth silhouette, then an implant, then a crown. Smooth cinematic transitions between shapes. Premium luxury aesthetic with warm gold tones. Hypnotic, mesmerizing movement.',
    title: 'Motion Design Or',
    duration: 8,
  },
];

const HERO_VIDEO = {
  id: 'hero-studio',
  prompt: 'Premium cinematic opening sequence for a dental advertising platform. Opens with an establishing shot of a sleek modern dental clinic exterior at golden hour. Transitions to interior showing a dentist using a tablet with holographic-style content appearing. Images and videos materialize in the air around the tablet. Transitions to abstract flowing gold data streams and particles. Premium dark and gold color palette throughout. High production value, inspirational, luxury brand feeling. Smooth camera movements.',
  title: 'Hero JADOMI Studio',
  duration: 15,
};

// =============================================
// GENERATION FUNCTIONS
// =============================================

async function generateImage(item, index, total) {
  console.log(`\n🎨 Image ${index + 1}/${total} : ${item.title}...`);
  const start = Date.now();

  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt: item.prompt,
    n: 1,
    size: '1792x1024',
    quality: 'hd',
    response_format: 'url',
  });

  const imageUrl = response.data[0].url;
  console.log(`   ✓ Genere en ${((Date.now() - start) / 1000).toFixed(1)}s`);

  // Download
  const resp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 60000 });
  const buffer = Buffer.from(resp.data);
  console.log(`   ✓ Telecharge (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

  // Upload R2
  const key = `studio-demos/${item.id}.png`;
  const r2Url = await uploadToR2(buffer, key, 'image/png');
  console.log(`   ✓ Upload R2 : ${key}`);

  return {
    id: item.id,
    url: r2Url,
    title: item.title,
    type: 'image-banner',
    cost: 50,
    revised_prompt: response.data[0].revised_prompt,
  };
}

async function generateVideo(item, index, total, isHero) {
  const label = isHero ? '🎬 HERO VIDEO' : `🎬 Video ${index + 1}/${total}`;
  console.log(`\n${label} : ${item.title} (${item.duration}s)...`);
  const start = Date.now();

  try {
    // Sora via OpenAI responses API
    const response = await openai.responses.create({
      model: 'sora',
      input: item.prompt,
      tools: [{
        type: 'video_generation',
        duration: item.duration,
        resolution: isHero ? '1080p' : '720p',
      }]
    });

    // Extraire video URL
    let videoUrl = null;
    for (const output of (response.output || [])) {
      if (output.type === 'video_generation_call' && output.video_url) {
        videoUrl = output.video_url;
        break;
      }
    }

    if (!videoUrl) {
      console.log(`   ⚠ Pas de video generee, on saute.`);
      return null;
    }

    console.log(`   ✓ Genere en ${((Date.now() - start) / 1000).toFixed(1)}s`);

    // Download
    const resp = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 180000 });
    const buffer = Buffer.from(resp.data);
    console.log(`   ✓ Telecharge (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

    // Upload R2
    const key = `studio-demos/${item.id}.mp4`;
    const r2Url = await uploadToR2(buffer, key, 'video/mp4');
    console.log(`   ✓ Upload R2 : ${key}`);

    return {
      id: item.id,
      url: r2Url,
      title: item.title,
      type: isHero ? 'hero' : `video-${item.duration}s`,
      cost: isHero ? 300 : (item.duration <= 8 ? 80 : 120),
      duration: item.duration,
    };

  } catch (err) {
    console.log(`   ✗ Erreur Sora : ${err.message}`);
    console.log(`   → On continue avec les autres generations.`);
    return null;
  }
}

// =============================================
// MAIN
// =============================================

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(' JADOMI Studio — Generation des demos');
  console.log(' 6 images DALL-E 3 HD + 4 videos Sora 2 + 1 hero');
  console.log(' Cout estime : ~$12');
  console.log('═══════════════════════════════════════════');

  const results = {
    hero_video: null,
    images: [],
    videos: [],
    generated_at: new Date().toISOString(),
    total_cost_usd: 0,
  };

  // --- Images DALL-E 3 ---
  console.log('\n\n━━━ IMAGES DALL-E 3 HD (1792x1024) ━━━');
  for (let i = 0; i < IMAGE_PROMPTS.length; i++) {
    try {
      const result = await generateImage(IMAGE_PROMPTS[i], i, IMAGE_PROMPTS.length);
      results.images.push(result);
      results.total_cost_usd += 0.12;

      // Pause entre requetes pour eviter rate limiting
      if (i < IMAGE_PROMPTS.length - 1) {
        console.log('   ⏳ Pause 3s...');
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (err) {
      console.log(`   ✗ Erreur image ${IMAGE_PROMPTS[i].id} : ${err.message}`);
    }
  }

  // --- Videos Sora 2 ---
  console.log('\n\n━━━ VIDEOS SORA 2 (720p) ━━━');
  for (let i = 0; i < VIDEO_PROMPTS.length; i++) {
    const result = await generateVideo(VIDEO_PROMPTS[i], i, VIDEO_PROMPTS.length, false);
    if (result) {
      results.videos.push(result);
      results.total_cost_usd += (VIDEO_PROMPTS[i].duration <= 8 ? 0.80 : 1.00);
    }
    // Pause entre videos
    if (i < VIDEO_PROMPTS.length - 1) {
      console.log('   ⏳ Pause 5s...');
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  // --- Hero video Sora 2 Pro ---
  console.log('\n\n━━━ HERO VIDEO SORA 2 (1080p, 15s) ━━━');
  const heroResult = await generateVideo(HERO_VIDEO, 0, 1, true);
  if (heroResult) {
    results.hero_video = heroResult.url;
    results.total_cost_usd += 7.50;
  }

  // --- Sauvegarder JSON ---
  const outputDir = path.join(__dirname, '..', 'public', 'assets');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const jsonPath = path.join(outputDir, 'studio-demos.json');
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`\n\n═══════════════════════════════════════════`);
  console.log(` ✅ TERMINE`);
  console.log(` Images generees : ${results.images.length}/6`);
  console.log(` Videos generees : ${results.videos.length}/4`);
  console.log(` Hero video : ${results.hero_video ? 'OUI' : 'NON'}`);
  console.log(` Cout total : ~$${results.total_cost_usd.toFixed(2)}`);
  console.log(` JSON sauvegarde : ${jsonPath}`);
  console.log(`═══════════════════════════════════════════`);
}

main().catch(err => {
  console.error('\n❌ ERREUR FATALE :', err.message);
  process.exit(1);
});
