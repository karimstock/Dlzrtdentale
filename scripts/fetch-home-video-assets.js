#!/usr/bin/env node
// =============================================
// Fetch stock footage from Pexels for JADOMI home video
// Downloads HD videos for each storyboard scene
// =============================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const PEXELS_KEY = process.env.PEXELS_API_KEY;
const OUTPUT_DIR = path.join(__dirname, '..', 'public/assets/videos/home');

if (!PEXELS_KEY) {
  console.error('PEXELS_API_KEY manquante dans .env');
  process.exit(1);
}

// Scenes a chercher — mots-cles Pexels
const SCENES = [
  { id: '01-stock-drawer', query: 'medical supplies cabinet drawer close up', backup: 'pharmacy shelves inventory' },
  { id: '02-nurse-car', query: 'woman driving car morning city', backup: 'healthcare worker commute morning' },
  { id: '03-lab-technician', query: 'dental laboratory technician working precision', backup: 'craftsman workshop precision hands' },
  { id: '04-delivery-corridor', query: 'delivery person walking hospital corridor package', backup: 'courier delivering package office building' },
  { id: '05-negotiation', query: 'business analytics dashboard screen data', backup: 'stock market chart decreasing price' },
  { id: '06-tired-doctor', query: 'tired doctor office evening alone', backup: 'professional working late office night' },
  { id: '07-doctor-smile', query: 'doctor smiling morning office confident', backup: 'professional happy workplace morning' },
  { id: '08-avatar-bg', query: 'dark minimal background cinematic black', backup: 'black dark background abstract minimal' },
];

async function searchPexels(query, perPage = 5) {
  const resp = await axios.get('https://api.pexels.com/videos/search', {
    headers: { Authorization: PEXELS_KEY },
    params: { query, per_page: perPage, size: 'medium', orientation: 'landscape' },
  });
  return resp.data.videos || [];
}

function getBestFile(videoFiles) {
  // Prefer HD (1920x1080) or closest
  const sorted = videoFiles
    .filter(f => f.width >= 1280)
    .sort((a, b) => {
      // Prefer 1080p
      const aDiff = Math.abs(a.height - 1080);
      const bDiff = Math.abs(b.height - 1080);
      return aDiff - bDiff;
    });
  return sorted[0] || videoFiles[0];
}

async function downloadVideo(url, filepath) {
  const resp = await axios.get(url, { responseType: 'stream', timeout: 120000 });
  const writer = fs.createWriteStream(filepath);
  resp.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function main() {
  console.log('=== Fetch Pexels Stock Footage for JADOMI Home Video ===\n');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results = [];

  for (const scene of SCENES) {
    console.log(`[${scene.id}] Recherche: "${scene.query}"`);

    let videos = await searchPexels(scene.query);

    // Si pas assez de resultats, essayer le backup
    if (videos.length === 0 && scene.backup) {
      console.log(`  -> Backup: "${scene.backup}"`);
      videos = await searchPexels(scene.backup);
    }

    if (videos.length === 0) {
      console.log(`  AUCUN RESULTAT — scene a chercher manuellement`);
      results.push({ id: scene.id, status: 'NOT_FOUND' });
      continue;
    }

    // Prendre la premiere video avec fichier HD
    const video = videos[0];
    const bestFile = getBestFile(video.video_files);

    if (!bestFile) {
      console.log(`  Pas de fichier HD disponible`);
      results.push({ id: scene.id, status: 'NO_HD' });
      continue;
    }

    const filename = `${scene.id}.mp4`;
    const filepath = path.join(OUTPUT_DIR, filename);

    // Skip si deja telecharge
    if (fs.existsSync(filepath)) {
      const size = fs.statSync(filepath).size;
      if (size > 100000) {
        console.log(`  Deja telecharge (${(size / 1024 / 1024).toFixed(1)} MB) — skip`);
        results.push({ id: scene.id, status: 'EXISTS', size, pexelsId: video.id });
        continue;
      }
    }

    console.log(`  Video #${video.id} — ${bestFile.width}x${bestFile.height} — ${video.duration}s`);
    console.log(`  Telechargement...`);

    try {
      await downloadVideo(bestFile.link, filepath);
      const size = fs.statSync(filepath).size;
      console.log(`  OK — ${(size / 1024 / 1024).toFixed(1)} MB`);
      results.push({ id: scene.id, status: 'OK', size, pexelsId: video.id, resolution: `${bestFile.width}x${bestFile.height}`, duration: video.duration });
    } catch (err) {
      console.log(`  ERREUR telechargement: ${err.message}`);
      results.push({ id: scene.id, status: 'DOWNLOAD_ERROR', error: err.message });
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n=== RESULTATS ===');
  console.table(results);

  // Sauvegarder le manifest
  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(results, null, 2));
  console.log(`\nManifest sauvegarde: ${manifestPath}`);
}

main().catch(err => {
  console.error('ERREUR:', err.message);
  process.exit(1);
});
