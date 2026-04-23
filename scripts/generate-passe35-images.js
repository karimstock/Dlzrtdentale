/**
 * JADOMI Passe 35 — Generate images via DALL-E 3 (OpenAI API)
 *
 * Usage: node scripts/generate-passe35-images.js
 * Requires: OPENAI_API_KEY in .env
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/assets/passe-35/images');

const IMAGES_TO_GENERATE = [
  {
    name: 'concept-ai-studio',
    prompt: 'Minimalist dark premium illustration showing AI creative tools floating around a central hub, dental imagery subtly integrated, gold (#c9a961) accent color on dark (#0a0a0f) background, no text, ultra clean, editorial style',
    size: '1792x1024',
  },
  {
    name: 'concept-data-flow',
    prompt: 'Abstract visualization of data flowing between connected nodes, neural network aesthetic, gold lines on dark background, premium minimalist style, no text',
    size: '1792x1024',
  },
  {
    name: 'concept-video-creation',
    prompt: 'Cinematic illustration of video production process, floating video frames being assembled by AI, warm gold lighting, dark premium background, editorial quality, no text',
    size: '1792x1024',
  },
];

async function generateImages() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const OpenAI = require('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  console.log(`[Passe 35] Generating ${IMAGES_TO_GENERATE.length} images via DALL-E 3...`);

  for (const img of IMAGES_TO_GENERATE) {
    const outputPath = path.join(OUTPUT_DIR, `${img.name}.webp`);

    if (fs.existsSync(outputPath)) {
      console.log(`  [SKIP] ${img.name}.webp already exists`);
      continue;
    }

    console.log(`  [GEN] ${img.name}.webp...`);

    try {
      const response = await openai.images.generate({
        model: 'dall-e-3',
        prompt: img.prompt,
        n: 1,
        size: img.size,
        quality: 'hd',
        response_format: 'url',
      });

      if (response.data && response.data[0] && response.data[0].url) {
        const axios = require('axios');
        const imageData = await axios.get(response.data[0].url, { responseType: 'arraybuffer' });
        fs.writeFileSync(outputPath, Buffer.from(imageData.data));
        console.log(`  [OK] ${img.name}.webp saved (${(imageData.data.byteLength / 1024).toFixed(0)} KB)`);
      }
    } catch (err) {
      console.warn(`  [WARN] ${img.name}: ${err.message}`);
    }
  }

  console.log('\n[Passe 35] Image generation complete.');
}

generateImages().catch(console.error);
