#!/usr/bin/env node
// =============================================
// JADOMI — Scraper Calaméo Flyers Dentaires
// Stratégie : parcourir les COMPTES ÉDITEURS connus
// (GACD, Henry Schein, DPI, etc.) via l'API interne,
// télécharger les PDF, parser via scan-dashboard.
//
// Usage:
//   node scripts/scrape-calameo.js                  # Scrape tout
//   node scripts/scrape-calameo.js --dry-run         # Simuler
//   node scripts/scrape-calameo.js --max 5           # Limiter
//   node scripts/scrape-calameo.js --reset            # Reset
//   node scripts/scrape-calameo.js --discover         # Chercher de nouveaux comptes
//
// Cron : tous les lundis à 3h
//   0 3 * * 1 node /home/ubuntu/jadomi/scripts/scrape-calameo.js >> /tmp/calameo-scraper.log 2>&1
// =============================================

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// --- Config ---
const TMP_DIR = '/home/ubuntu/jadomi/tmp';
const PROGRESS_FILE = path.join(TMP_DIR, 'calameo-progress.json');
const LOG_FILE = '/tmp/calameo-scraper.log';

const DRY_RUN = process.argv.includes('--dry-run');
const RESET = process.argv.includes('--reset');
const DISCOVER = process.argv.includes('--discover');
const MAX_IDX = process.argv.indexOf('--max');
const MAX_DOWNLOADS = MAX_IDX > -1 ? parseInt(process.argv[MAX_IDX + 1]) || 999 : 999;

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// ===================================================
// COMPTES ÉDITEURS DENTAIRES CONNUS SUR CALAMÉO
// Trouvés via l'API search/account
// ===================================================
const PUBLISHER_ACCOUNTS = [
  { id: 5534853,  brand: 'GACD',                    name: 'GACD' },
  { id: 4957070,  brand: 'MegaDental',              name: 'Mega Dental' },          // 534 publications !
  { id: 4815859,  brand: 'Henry Schein',            name: 'Henry Schein' },
  { id: 7888426,  brand: 'Dental Promotion (DPI)',   name: 'Dental Promotion' },
  { id: 6272184,  brand: 'DVD Dental',              name: 'DVD DENTAL' },
  // Ajouter d'autres comptes au fur et à mesure via --discover
];

// Termes pour découvrir de nouveaux comptes éditeurs
const DISCOVER_QUERIES = [
  'GACD', 'Henry Schein', 'Mega Dental', 'Dental Promotion',
  'Dentsply Sirona', 'Ivoclar', 'Kerr Dental', 'Septodont',
  'Acteon', 'NSK Dental', 'Hu-Friedy', 'Straumann', 'Osstem',
  'Coltene', 'Ultradent', 'Omnident', 'DentalGoodDeal',
  'B2B Dental', 'Dental Evolution', 'dental fournitures',
];

// --- Progress ---
function loadProgress() {
  if (RESET) return { downloaded: {}, discoveredAccounts: [], lastRun: null, stats: {} };
  try { if (fs.existsSync(PROGRESS_FILE)) return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
  catch (e) {}
  return { downloaded: {}, discoveredAccounts: [], lastRun: null, stats: {} };
}
function saveProgress(p) { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2)); }

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (e) {}
}

// --- Download PDF via Puppeteer (avoids 403) ---
async function downloadPdfViaBrowser(page, url, destPath, timeout = 120000) {
  const result = await page.evaluate(async (pdfUrl, to) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), to);
      const resp = await fetch(pdfUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (!resp.ok) return { error: `HTTP ${resp.status}` };
      const ct = resp.headers.get('content-type') || '';
      const blob = await resp.arrayBuffer();
      // Convert to base64 for transfer
      const bytes = new Uint8Array(blob);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return { ok: true, data: btoa(binary), size: bytes.length, contentType: ct };
    } catch (e) {
      return { error: e.message };
    }
  }, url, timeout);

  if (result.error) throw new Error(result.error);
  if (!result.ok) throw new Error('Download failed');

  const buffer = Buffer.from(result.data, 'base64');
  fs.writeFileSync(destPath, buffer);
  return result.size;
}

// --- Upload to scan-dashboard ---
function uploadToScanDashboard(filePath, brand) {
  return new Promise((resolve, reject) => {
    const filename = path.basename(filePath);
    const fileBuffer = fs.readFileSync(filePath);
    const boundary = '----JadomiCalameo' + Date.now();
    let body = '';
    if (brand) body += `--${boundary}\r\nContent-Disposition: form-data; name="brand"\r\n\r\n${brand}\r\n`;
    body += `--${boundary}\r\nContent-Disposition: form-data; name="docType"\r\n\r\nflyer\r\n`;
    body += `--${boundary}\r\nContent-Disposition: form-data; name="pdf"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`;
    const bodyStart = Buffer.from(body, 'utf8');
    const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const fullBody = Buffer.concat([bodyStart, fileBuffer, bodyEnd]);

    const req = http.request({
      hostname: '127.0.0.1', port: 3001,
      path: '/api/scan-dashboard/upload',
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': fullBody.length },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { resolve({ ok: false, error: data.substring(0, 200) }); } });
    });
    req.on('error', reject);
    req.setTimeout(300000, () => { req.destroy(); reject(new Error('Upload timeout')); });
    req.write(fullBody);
    req.end();
  });
}

// --- Main ---
async function main() {
  log('=== JADOMI Calaméo Scraper — Démarrage ===');
  log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'PRODUCTION'} | Max: ${MAX_DOWNLOADS}`);

  const progress = loadProgress();
  progress.lastRun = new Date().toISOString();

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

  // Establish Calaméo session
  log('Session Calaméo...');
  await page.goto('https://www.calameo.com/', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => {
    document.querySelectorAll('button').forEach(b => {
      if (/allow all|accept|accepter/i.test(b.textContent)) b.click();
    });
  });
  await new Promise(r => setTimeout(r, 1000));
  log('Session OK');

  // --- Phase 0: Discover new accounts (optional) ---
  if (DISCOVER) {
    log('\n=== Découverte de nouveaux comptes éditeurs ===');
    const knownIds = new Set(PUBLISHER_ACCOUNTS.map(a => a.id));

    for (const q of DISCOVER_QUERIES) {
      const url = `https://d.calameo.com/pinwheel/public/search/account/get?step=10&search=${encodeURIComponent(q)}`;
      const result = await page.evaluate(async (u) => {
        try { return await (await fetch(u)).json(); } catch(e) { return { error: e.message }; }
      }, url);

      if (result.content?.list) {
        for (const acct of result.content.list) {
          if (!knownIds.has(acct.id)) {
            const isDental = /dental|dent|ortho|implant|prothes|chirurg|hygien/i.test(acct.name);
            if (isDental) {
              log(`  NOUVEAU: ${acct.name} (ID: ${acct.id})`);
              progress.discoveredAccounts = progress.discoveredAccounts || [];
              if (!progress.discoveredAccounts.find(a => a.id === acct.id)) {
                progress.discoveredAccounts.push({ id: acct.id, name: acct.name, discoveredAt: new Date().toISOString() });
              }
            }
          }
        }
      }
      await new Promise(r => setTimeout(r, 500));
    }
    saveProgress(progress);
  }

  // --- Phase 1: Get publications from all known accounts ---
  let allPubs = [];

  for (const account of PUBLISHER_ACCOUNTS) {
    log(`\nCompte: ${account.name} (ID: ${account.id})`);

    const apiUrl = `https://d.calameo.com/pinwheel/public/account/book/get?step=100&account=${account.id}`;
    const result = await page.evaluate(async (u) => {
      try { return await (await fetch(u)).json(); } catch(e) { return { error: e.message }; }
    }, apiUrl);

    if (result.error) {
      log(`  Erreur API: ${result.error}`);
      continue;
    }

    const total = result.content?.total || 0;
    const list = result.content?.list || [];
    log(`  ${list.length}/${total} publications`);

    for (const pub of list) {
      allPubs.push({
        code: pub.code,
        name: pub.name || 'Sans titre',
        brand: account.brand,
        publisher: account.name,
        accountId: account.id,
        pages: pub.document?.pages || 0,
        date: pub.date || '',
        image: pub.image?.medium ? 'https:' + pub.image.medium : null,
      });
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  // Sort by date desc (newest first = most valuable for price tracking)
  allPubs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  log(`\n=== ${allPubs.length} publications totales ===`);

  // --- Phase 2: Download & import ---
  let totalNew = 0, totalSkipped = 0, totalErrors = 0;

  for (const pub of allPubs) {
    if (totalNew >= MAX_DOWNLOADS) {
      log(`Max ${MAX_DOWNLOADS} atteint.`);
      break;
    }

    if (progress.downloaded[pub.code]) {
      totalSkipped++;
      continue;
    }

    log(`\n[${totalNew + 1}] ${pub.name}`);
    log(`  Marque: ${pub.brand} | Date: ${pub.date} | Pages: ${pub.pages}`);

    if (DRY_RUN) {
      log('  [DRY RUN] Skip');
      progress.downloaded[pub.code] = { name: pub.name, brand: pub.brand, date: pub.date, dryRun: true, at: new Date().toISOString() };
      totalNew++;
      continue;
    }

    try {
      // Download URL: Calaméo uses /download/{code} pattern
      const downloadUrl = `https://www.calameo.com/download/${pub.code}`;
      const safeName = pub.name.replace(/[^a-zA-Z0-9À-ÿ._-]/g, '_').substring(0, 80);
      const tmpFile = path.join(TMP_DIR, `calameo-${pub.code.substring(0, 12)}-${safeName}.pdf`);

      log(`  Téléchargement via navigateur...`);

      // Use Puppeteer's native download - navigate to the download URL
      // First visit the publication page
      await page.goto(`https://www.calameo.com/read/${pub.code}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await new Promise(r => setTimeout(r, 2000));

      // Try to download via fetch inside the browser context
      let downloaded = false;
      try {
        const fileSize = await downloadPdfViaBrowser(page, downloadUrl, tmpFile, 120000);
        log(`  Taille: ${(fileSize / 1024 / 1024).toFixed(1)} Mo`);
        downloaded = true;
      } catch (dlErr) {
        log(`  Téléchargement direct échoué: ${dlErr.message}`);
        // Try alternate: some Calaméo publications have public PDF links
        try {
          const altUrl = `https://p.calameoassets.com/${pub.code.substring(0, 9)}/${pub.code}/large.pdf`;
          const altSize = await downloadPdfViaBrowser(page, altUrl, tmpFile, 120000);
          log(`  Alt download OK: ${(altSize / 1024 / 1024).toFixed(1)} Mo`);
          downloaded = true;
        } catch (altErr) {
          log(`  Alt aussi échoué: ${altErr.message}`);
        }
      }

      if (!downloaded) {
        progress.downloaded[pub.code] = { name: pub.name, error: 'download-failed', at: new Date().toISOString() };
        totalErrors++;
        saveProgress(progress);
        continue;
      }

      // Verify PDF header
      const header = Buffer.alloc(5);
      const fd = fs.openSync(tmpFile, 'r');
      fs.readSync(fd, header, 0, 5, 0);
      fs.closeSync(fd);

      if (header.toString() !== '%PDF-') {
        log(`  Pas un PDF, skip`);
        try { fs.unlinkSync(tmpFile); } catch (e) {}
        progress.downloaded[pub.code] = { name: pub.name, error: 'not-pdf', at: new Date().toISOString() };
        saveProgress(progress);
        continue;
      }

      const sizeMb = fs.statSync(tmpFile).size / 1024 / 1024;
      if (sizeMb > 250) {
        log(`  Trop gros (${sizeMb.toFixed(0)} Mo), skip`);
        try { fs.unlinkSync(tmpFile); } catch (e) {}
        progress.downloaded[pub.code] = { name: pub.name, error: 'too-large', at: new Date().toISOString() };
        saveProgress(progress);
        continue;
      }

      // Upload to scan-dashboard
      log(`  Import scan-dashboard...`);
      const result = await uploadToScanDashboard(tmpFile, pub.brand);

      if (result.ok) {
        const prodCount = (result.products || []).length;
        log(`  OK: ${result.pages || 0} pages, ${prodCount} produits, marque: ${result.brand}`);
        totalNew++;
        progress.downloaded[pub.code] = {
          name: pub.name, brand: result.brand || pub.brand,
          date: pub.date, pages: result.pages || 0,
          products: prodCount, file: result.filename,
          at: new Date().toISOString(),
        };
      } else {
        log(`  Échec: ${result.error || result.warning || 'inconnu'}`);
        totalErrors++;
        progress.downloaded[pub.code] = { name: pub.name, error: result.error || result.warning, at: new Date().toISOString() };
      }

      try { fs.unlinkSync(tmpFile); } catch (e) {}

    } catch (err) {
      log(`  Erreur: ${err.message}`);
      totalErrors++;
      progress.downloaded[pub.code] = { name: pub.name, error: err.message, at: new Date().toISOString() };
    }

    saveProgress(progress);
    await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
  }

  // --- Summary ---
  progress.stats = {
    total: Object.keys(progress.downloaded).length,
    newThisRun: totalNew,
    skipped: totalSkipped,
    errors: totalErrors,
    lastRunEnd: new Date().toISOString(),
  };
  saveProgress(progress);
  await browser.close();

  log(`\n========================================`);
  log(`  JADOMI Calaméo Scraper — Terminé`);
  log(`  Comptes éditeurs: ${PUBLISHER_ACCOUNTS.length}`);
  log(`  Publications trouvées: ${allPubs.length}`);
  log(`  Nouveaux importés: ${totalNew}`);
  log(`  Déjà en base: ${totalSkipped}`);
  log(`  Erreurs: ${totalErrors}`);
  log(`========================================`);
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  console.error(err);
  process.exit(1);
});
