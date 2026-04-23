/**
 * JADOMI Passe 35 — Fix Studio Gallery Images
 * Generate 6 DALL-E 3 HD images for /jadomi-studio gallery
 * Save locally to /public/assets/studio-demos/
 *
 * Usage: node scripts/fix-studio-gallery-images.js
 * Requires: OPENAI_API_KEY in .env
 * Cost: ~$0.72 (6 x $0.12)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUTPUT_DIR = path.join(__dirname, '../public/assets/studio-demos');

if (!process.env.OPENAI_API_KEY) {
  console.error('[ERROR] OPENAI_API_KEY not found in .env');
  process.exit(1);
}

const IMAGES = [
  {
    name: 'formation-implanto',
    prompt: 'Professional dental training advertisement poster, experienced dentist demonstrating implant technique to colleagues in modern clinic, warm golden lighting, premium editorial photography style, dark background with subtle gold accents, cinematic composition, no text overlay, hyper realistic',
  },
  {
    name: 'catalogue-premium',
    prompt: 'Luxury dental products catalog cover, premium dental materials and instruments display on dark marble background, professional lab setting, gold and amber highlights, editorial style, cinematic lighting, no text, hyper realistic',
  },
  {
    name: 'gestion-cabinet',
    prompt: 'Modern dental practice management concept, dentist using tablet showing clean software interface in bright modern clinic, professional atmosphere, warm golden accents on dark tones, editorial photography, no text, hyper realistic',
  },
  {
    name: 'congres-adf',
    prompt: 'Premium dental conference event scene, stage with speaker addressing audience of healthcare professionals in elegant dark venue, warm spotlights, gold accents, dynamic cinematic composition suggesting prestige, no text, hyper realistic',
  },
  {
    name: 'prothese-ceramique',
    prompt: 'Luxury dental prosthetics advertisement, close-up of pristine ceramic dental crown on dark marble surface, scientific precision, premium editorial photography, warm golden backlight creating rim lighting, minimalist elegant composition, no text, hyper realistic',
  },
  {
    name: 'audience-ciblee',
    prompt: 'Digital marketing analytics concept for dental professionals, elegant data visualization dashboard floating on dark background with gold highlights and particle effects, modern tech atmosphere, premium cinematic feel, no text, hyper realistic',
  },
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const OpenAI = require('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  console.log('═══════════════════════════════════════════════');
  console.log('  JADOMI — Fix Studio Gallery Images (DALL-E 3)');
  console.log('═══════════════════════════════════════════════\n');

  const results = [];

  for (const img of IMAGES) {
    const outputPath = path.join(OUTPUT_DIR, `${img.name}.png`);

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 50000) {
      const size = (fs.statSync(outputPath).size / 1024).toFixed(0);
      console.log(`[SKIP] ${img.name}.png already exists (${size} KB)`);
      results.push({ name: img.name, status: 'skipped', size: `${size} KB` });
      continue;
    }

    console.log(`[GEN] ${img.name}.png ...`);

    try {
      const response = await openai.images.generate({
        model: 'dall-e-3',
        prompt: img.prompt,
        n: 1,
        size: '1792x1024',
        quality: 'hd',
        response_format: 'url',
      });

      const imageUrl = response.data[0].url;
      if (!imageUrl) throw new Error('No URL in response');

      await downloadFile(imageUrl, outputPath);
      const fileSize = (fs.statSync(outputPath).size / 1024).toFixed(0);
      console.log(`  [OK] ${img.name}.png saved (${fileSize} KB)`);
      results.push({ name: img.name, status: 'generated', size: `${fileSize} KB` });

      // Brief pause to avoid rate limiting
      await new Promise(r => setTimeout(r, 2000));

    } catch (err) {
      console.error(`  [ERROR] ${img.name}: ${err.message}`);
      results.push({ name: img.name, status: 'error', error: err.message });
    }
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════');
  let totalSize = 0;
  results.forEach(r => {
    const icon = r.status === 'generated' || r.status === 'skipped' ? '✓' : '✗';
    console.log(`  ${icon} ${r.name}: ${r.status} ${r.size || r.error || ''}`);
    if (r.size) totalSize += parseInt(r.size);
  });
  console.log(`\n  Total: ${(totalSize / 1024).toFixed(1)} MB`);
  console.log('  Saved in: /public/assets/studio-demos/');
  console.log('\n  Next: update jadomi-studio.html to point to /assets/studio-demos/');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
