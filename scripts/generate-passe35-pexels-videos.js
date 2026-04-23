/**
 * JADOMI Passe 35 — Download hero videos from Pexels API
 * Fallback for Sora 2 (API not publicly available)
 *
 * Usage: node scripts/generate-passe35-pexels-videos.js
 * Requires: PEXELS_API_KEY in .env, ffmpeg installed
 */

require('dotenv').config();
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const OUTPUT_DIR = path.join(__dirname, '../public/assets/passe-35/videos');
const POSTER_DIR = path.join(__dirname, '../public/assets/passe-35/posters');

if (!PEXELS_API_KEY) {
  console.error('[ERROR] PEXELS_API_KEY not found in .env');
  process.exit(1);
}

const VIDEOS = [
  {
    name: 'hero-homepage',
    queries: ['modern professional office', 'healthcare workplace premium', 'business office golden light'],
    description: 'Homepage hero — professional office ambiance',
  },
  {
    name: 'hero-ads',
    queries: ['data visualization technology', 'abstract technology network', 'digital data flow abstract'],
    description: 'JADOMI Ads hero — data/tech abstract',
  },
  {
    name: 'hero-studio',
    queries: ['creative design studio', 'digital art creation', 'technology abstract design'],
    description: 'JADOMI Studio hero — creative/AI studio',
  },
];

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'Authorization': PEXELS_API_KEY,
      },
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON: ' + data.slice(0, 200))); }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (response) => {
      // Follow redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${response.statusCode}`));
      }
      const total = parseInt(response.headers['content-length'], 10) || 0;
      let downloaded = 0;
      response.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total > 0) {
          const pct = ((downloaded / total) * 100).toFixed(0);
          process.stdout.write(`\r    Downloading: ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`);
        }
      });
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log('');
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function findBestVideo(queries) {
  for (const query of queries) {
    console.log(`    Searching: "${query}"`);
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape&size=medium`;
    const data = await fetchJSON(url);

    if (!data.videos || data.videos.length === 0) {
      console.log(`    No results for "${query}"`);
      continue;
    }

    // Find best video: HD, 10-30s duration, smallest file size
    for (const video of data.videos) {
      if (video.duration < 8 || video.duration > 40) continue;

      // Find HD file (1080p or 720p, prefer smaller)
      const files = video.video_files || [];
      const hdFiles = files
        .filter(f => f.height >= 720 && f.height <= 1080 && f.file_type === 'video/mp4')
        .sort((a, b) => (a.height === 1080 ? -1 : 1)); // Prefer 1080p

      if (hdFiles.length > 0) {
        const chosen = hdFiles[0];
        return {
          url: chosen.link,
          width: chosen.width,
          height: chosen.height,
          duration: video.duration,
          photographer: video.user?.name || 'Pexels',
          pexelsUrl: video.url,
        };
      }
    }
  }
  return null;
}

function extractPoster(videoPath, posterPath) {
  try {
    // Extract first frame as WebP poster
    execSync(`ffmpeg -y -i "${videoPath}" -vframes 1 -q:v 2 -vf "scale=1920:-1" "${posterPath}" 2>/dev/null`);
    return true;
  } catch (err) {
    console.log(`    [WARN] Could not extract poster: ${err.message}`);
    return false;
  }
}

async function main() {
  // Create directories
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(POSTER_DIR)) fs.mkdirSync(POSTER_DIR, { recursive: true });

  console.log('═══════════════════════════════════════════════');
  console.log('  JADOMI Passe 35 — Pexels Hero Videos');
  console.log('═══════════════════════════════════════════════\n');

  const results = [];

  for (const video of VIDEOS) {
    const mp4Path = path.join(OUTPUT_DIR, `${video.name}.mp4`);
    const posterPath = path.join(POSTER_DIR, `${video.name}.webp`);

    console.log(`[${video.name}] ${video.description}`);

    // Skip if already exists and > 100KB
    if (fs.existsSync(mp4Path) && fs.statSync(mp4Path).size > 100000) {
      const size = (fs.statSync(mp4Path).size / 1024 / 1024).toFixed(1);
      console.log(`  [SKIP] Already exists (${size} MB)\n`);
      results.push({ name: video.name, status: 'skipped', size: `${size} MB` });
      continue;
    }

    const best = await findBestVideo(video.queries);
    if (!best) {
      console.log(`  [FAIL] No suitable video found\n`);
      results.push({ name: video.name, status: 'not_found' });
      continue;
    }

    console.log(`  Found: ${best.width}x${best.height}, ${best.duration}s, by ${best.photographer}`);

    try {
      await downloadFile(best.url, mp4Path);
      const fileSize = (fs.statSync(mp4Path).size / 1024 / 1024).toFixed(1);
      console.log(`  [OK] Saved: ${mp4Path} (${fileSize} MB)`);

      // Extract poster
      const posterOk = extractPoster(mp4Path, posterPath);
      if (posterOk) {
        const posterSize = (fs.statSync(posterPath).size / 1024).toFixed(0);
        console.log(`  [OK] Poster: ${posterPath} (${posterSize} KB)`);
      }

      results.push({
        name: video.name,
        status: 'downloaded',
        size: `${fileSize} MB`,
        resolution: `${best.width}x${best.height}`,
        duration: `${best.duration}s`,
        photographer: best.photographer,
        pexelsUrl: best.pexelsUrl,
      });
    } catch (err) {
      console.log(`  [ERROR] Download failed: ${err.message}`);
      results.push({ name: video.name, status: 'error', error: err.message });
    }
    console.log('');
  }

  // Summary
  console.log('═══════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════');
  results.forEach(r => {
    const icon = r.status === 'downloaded' ? '✓' : r.status === 'skipped' ? '~' : '✗';
    console.log(`  ${icon} ${r.name}: ${r.status} ${r.size || ''} ${r.resolution || ''}`);
  });
  console.log('\nDone. Videos saved in /public/assets/passe-35/videos/');
  console.log('Posters saved in /public/assets/passe-35/posters/');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
