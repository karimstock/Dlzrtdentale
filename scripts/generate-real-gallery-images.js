/**
 * JADOMI Passe 35.3 — Replace DALL-E images with real Pexels photos + overlay
 *
 * Downloads HD photos from Pexels, adds dark gradient + JADOMI text overlay
 * using Sharp. Output: WebP < 400KB each.
 *
 * Usage: node scripts/generate-real-gallery-images.js
 * Requires: PEXELS_API_KEY in .env, sharp installed
 * Cost: $0 (Pexels free API)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const sharp = require('sharp');

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const OUTPUT_DIR = path.join(__dirname, '../public/assets/studio-demos');

if (!PEXELS_API_KEY) {
  console.error('[ERROR] PEXELS_API_KEY not found in .env');
  process.exit(1);
}

const CARDS = [
  {
    filename: 'formation-implanto',
    queries: ['dental training professional', 'dentist workshop teaching', 'medical professional training'],
    title: 'Formation Implantologie',
    subtitle: '1 500 EUR · 3 jours · Paris',
  },
  {
    filename: 'catalogue-premium',
    queries: ['dental equipment laboratory', 'medical instruments premium', 'dental tools closeup'],
    title: 'Catalogue 2026',
    subtitle: 'Materiaux Premium',
  },
  {
    filename: 'gestion-cabinet',
    queries: ['dentist tablet modern clinic', 'doctor digital technology office', 'medical professional tablet'],
    title: 'Gestion Cabinet',
    subtitle: 'SaaS Dentaire Intelligent',
  },
  {
    filename: 'congres-adf',
    queries: ['medical conference speaker stage', 'professional conference audience', 'business event keynote'],
    title: 'Congres ADF 2026',
    subtitle: 'Paris · 15-17 Novembre',
  },
  {
    filename: 'prothese-ceramique',
    queries: ['dental crown ceramic', 'dental prosthetic laboratory', 'dental implant closeup'],
    title: 'Protheses Ceramique',
    subtitle: 'Excellence Francaise',
  },
  {
    filename: 'audience-ciblee',
    queries: ['business analytics dashboard screen', 'data visualization professional', 'digital marketing analytics'],
    title: '42 000 dentistes cibles',
    subtitle: '100% RPPS verifies',
  },
];

const W = 1792;
const H = 1024;

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Authorization: PEXELS_API_KEY } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Bad JSON')); }
      });
    }).on('error', reject);
  });
}

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : require('http');
    proto.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadBuffer(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function findPhoto(queries) {
  for (const q of queries) {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=10&orientation=landscape&size=large`;
    const data = await fetchJSON(url);
    if (data.photos && data.photos.length > 0) {
      // Pick the best one (landscape, high res)
      const photo = data.photos.find(p => p.width >= 1600) || data.photos[0];
      return {
        url: photo.src.large2x || photo.src.large || photo.src.original,
        photographer: photo.photographer,
        pexelsUrl: photo.url,
      };
    }
  }
  return null;
}

function createOverlaySVG(title, subtitle) {
  return Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fade" x1="0%" y1="40%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="60%" stop-color="rgba(0,0,0,0.5)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.88)"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#fade)"/>
  <rect x="24" y="24" width="180" height="32" rx="16" fill="rgba(201,169,97,0.25)"/>
  <text x="114" y="46" font-family="sans-serif" font-size="14" font-weight="700"
        fill="#c9a961" text-anchor="middle" letter-spacing="1.5">JADOMI STUDIO</text>
  <text x="60" y="${H - 80}" font-family="sans-serif" font-size="52" font-weight="700"
        fill="white">${escapeXML(title)}</text>
  <text x="60" y="${H - 35}" font-family="sans-serif" font-size="30"
        fill="#c9a961">${escapeXML(subtitle)}</text>
</svg>`);
}

function escapeXML(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('═══════════════════════════════════════════════');
  console.log('  JADOMI 35.3 — Real Pexels Photos + Overlay');
  console.log('═══════════════════════════════════════════════\n');

  const results = [];

  for (const card of CARDS) {
    const outPath = path.join(OUTPUT_DIR, `${card.filename}.webp`);
    console.log(`[${card.filename}] "${card.title}"`);

    // Find photo
    const photo = await findPhoto(card.queries);
    if (!photo) {
      console.log('  [FAIL] No photo found\n');
      results.push({ name: card.filename, status: 'not_found' });
      continue;
    }
    console.log(`  Found: ${photo.photographer} (${photo.pexelsUrl})`);

    // Download
    console.log('  Downloading...');
    const imgBuffer = await downloadBuffer(photo.url);
    console.log(`  Downloaded: ${(imgBuffer.length / 1024).toFixed(0)} KB`);

    // Create overlay
    const overlaySvg = createOverlaySVG(card.title, card.subtitle);

    // Composite with Sharp
    try {
      await sharp(imgBuffer)
        .resize(W, H, { fit: 'cover', position: 'center' })
        .composite([{ input: overlaySvg, blend: 'over' }])
        .webp({ quality: 85 })
        .toFile(outPath);

      const finalSize = (fs.statSync(outPath).size / 1024).toFixed(0);
      console.log(`  [OK] ${card.filename}.webp (${finalSize} KB)\n`);
      results.push({ name: card.filename, status: 'ok', size: `${finalSize} KB`, photographer: photo.photographer });
    } catch (err) {
      console.error(`  [ERROR] Sharp: ${err.message}\n`);
      results.push({ name: card.filename, status: 'error', error: err.message });
    }

    // Small delay to be nice to Pexels API
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('═══════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════');
  results.forEach(r => {
    const icon = r.status === 'ok' ? '✓' : '✗';
    console.log(`  ${icon} ${r.name}: ${r.status} ${r.size || ''} ${r.photographer ? '(' + r.photographer + ')' : r.error || ''}`);
  });
  console.log('\n  Output: /public/assets/studio-demos/');
  console.log('  jadomi-studio.html already points to these .webp files');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
