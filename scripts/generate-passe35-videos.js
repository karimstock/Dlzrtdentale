/**
 * JADOMI Passe 35 — Generate hero videos via Sora 2 (OpenAI API)
 *
 * Usage: node scripts/generate-passe35-videos.js
 * Requires: OPENAI_API_KEY in .env
 *
 * Note: Sora 2 video generation via API may have limited availability.
 * This script will attempt generation and gracefully handle unavailability.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/assets/passe-35/videos');

const VIDEOS_TO_GENERATE = [
  {
    name: 'hero-homepage',
    prompt: 'Cinematic modern healthcare professional office with warm golden lighting, subtle camera motion, premium atmosphere, dark background with gold accents, dental equipment visible, 1080p, 10 seconds loop',
    duration: 10,
  },
  {
    name: 'hero-ads',
    prompt: 'Abstract data flow visualization, golden lines connecting nodes in a neural network pattern, dark background, particles flowing between data points, professional cinematic feel, 1080p, 10 seconds loop',
    duration: 10,
  },
  {
    name: 'hero-studio',
    prompt: 'AI creative studio interface visualization, floating screens with images and videos being created, dark premium design with gold accents, particles forming dental imagery, dynamic but elegant motion, 1080p, 15 seconds loop',
    duration: 15,
  },
];

async function generateVideos() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const OpenAI = require('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  console.log(`[Passe 35] Generating ${VIDEOS_TO_GENERATE.length} hero videos via Sora 2...`);

  for (const video of VIDEOS_TO_GENERATE) {
    const outputPath = path.join(OUTPUT_DIR, `${video.name}.mp4`);

    if (fs.existsSync(outputPath)) {
      console.log(`  [SKIP] ${video.name}.mp4 already exists`);
      continue;
    }

    console.log(`  [GEN] ${video.name}.mp4 (${video.duration}s)...`);

    try {
      // Attempt Sora 2 video generation via OpenAI API
      // Note: API availability may vary
      const response = await openai.videos.generate({
        model: 'sora',
        prompt: video.prompt,
        duration: video.duration,
        resolution: '1080p',
      });

      if (response && response.url) {
        // Download video
        const axios = require('axios');
        const videoData = await axios.get(response.url, { responseType: 'arraybuffer' });
        fs.writeFileSync(outputPath, Buffer.from(videoData.data));
        console.log(`  [OK] ${video.name}.mp4 saved (${(videoData.data.byteLength / 1024 / 1024).toFixed(1)} MB)`);
      }
    } catch (err) {
      console.warn(`  [WARN] ${video.name}: Sora 2 API not available — ${err.message}`);
      console.log(`  [INFO] Karim can generate this video manually via sora.com and place it at:`);
      console.log(`         ${outputPath}`);
    }
  }

  console.log('\n[Passe 35] Video generation complete.');
  console.log('If Sora 2 API was unavailable, generate videos manually at sora.com');
  console.log('and save them to /public/assets/passe-35/videos/');
}

generateVideos().catch(console.error);
