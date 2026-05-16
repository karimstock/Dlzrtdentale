#!/usr/bin/env node
// =============================================
// JADOMI — Henry Schein PARALLEL (5 navigateurs)
//
// 5 workers Puppeteer en parallèle = 5x plus rapide
// Chaque worker a sa propre session login
// Progression sauvegardée pour reprendre en cas de crash
//
// Usage: node scripts/scrape-henryschein-parallel.js
//        nohup node scripts/scrape-henryschein-parallel.js &
// =============================================

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const http = require('http');

puppeteer.use(StealthPlugin());

const WORKERS = 5;
const PROGRESS_FILE = '/tmp/henryschein-parallel-progress.json';
const LOG_FILE = '/tmp/henryschein-parallel.log';
const IMPORT_URL = 'http://127.0.0.1:3001/api/scan/import-prices';

const CREDENTIALS = {
  email: 'karim_bahmed@yahoo.fr',
  password: '1987@Amjad',
};

// 300+ mots-clés pour couvrir tout le catalogue
const ALL_KEYWORDS = [
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  'ab','ac','ad','ae','af','ag','al','am','an','ap','ar','as','at','au','av',
  'ba','be','bi','bl','bo','br','bu',
  'ca','ce','ch','ci','cl','co','cr','cu',
  'da','de','di','do','dr','du',
  'ec','el','em','en','ep','eq','er','es','et','eu','ev','ex',
  'fa','fe','fi','fl','fo','fr','fu',
  'ga','ge','gi','gl','go','gr','gu',
  'ha','he','hi','ho','hu','hy',
  'im','in','ir','is',
  'ke','ki',
  'la','le','li','lo','lu',
  'ma','me','mi','mo','mu',
  'na','ne','ni','no','nu',
  'ob','oc','od','op','or','os','ou','ox',
  'pa','pe','ph','pi','pl','po','pr','pu',
  'ra','re','ri','ro','ru',
  'sa','sc','se','si','so','sp','st','su',
  'ta','te','ti','to','tr','tu',
  'ul','un','ur',
  'va','ve','vi','vo',
  'za','zi','zo',
  'composite','ciment','fraise','turbine','implant','couronne',
  'empreinte','alginate','silicone','gant','masque','autoclave',
  'detartreur','scaler','lime','gutta','bracket','fil ortho',
  'membrane','greffe','lampe','fauteuil','compresseur',
  'miroir','sonde','pince','davier','seringue','aiguille',
  'prothese','zircone','ceramique','resine','adhesif',
  'polissage','fluor','vernis','photopolymeriser',
  'endodontie','parodontie','orthodontie','prophylaxie',
  'instrument rotatif','contre-angle','piece a main',
  'sterilisation','sachet','desinfectant',
  'anesthesie','carpule','articaine','lidocaine',
  'chirurgie','elevateur','syndesmotome','curette','bistouri',
  'blanchiment','peroxyde','gouttiere',
  'cad cam','scanner','usinage','bloc','disque',
  'dentsply','kerr','ivoclar','voco','gc','septodont',
  '3m','kulzer','coltene','hu-friedy','acteon','satelec',
  'bien air','nsk','kavo','planmeca','sirona',
  'vita','shofu','zhermack','bisco','ultradent','ems','mectron',
];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
  catch { return { completedKeywords: [], products: {}, stats: { total: 0, newThisRun: 0 } }; }
}

function saveProgress(progress) {
  progress.lastSaved = new Date().toISOString();
  progress.stats.total = Object.keys(progress.products).length;
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
}

// =============================================
// WORKER : 1 navigateur Puppeteer
// =============================================

async function createWorker(workerId, keywords, progress) {
  log(`  Worker ${workerId}: ${keywords.length} mots-clés à traiter`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
           '--disable-gpu', '--disable-extensions', '--disable-images'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  // Bloquer images/CSS pour accélérer
  await page.setRequestInterception(true);
  page.on('request', req => {
    const type = req.resourceType();
    if (['image', 'stylesheet', 'font', 'media'].includes(type)) req.abort();
    else req.continue();
  });

  // Login
  try {
    await page.goto('https://www.henryschein.fr/fr-fr/Cabinet/Default.aspx?registered=true', {
      waitUntil: 'networkidle2', timeout: 30000,
    });
    await new Promise(r => setTimeout(r, 2000));

    await page.evaluate((email, password) => {
      const e = document.getElementById('ctl00_ucHeader_ucSessionBar_ucLogin_txtLogonName');
      const p = document.getElementById('ctl00_ucHeader_ucSessionBar_ucLogin_txtPassword');
      if (e) { e.value = email; e.dispatchEvent(new Event('change', {bubbles:true})); }
      if (p) { p.value = password; p.dispatchEvent(new Event('change', {bubbles:true})); }
    }, CREDENTIALS.email, CREDENTIALS.password);
    await new Promise(r => setTimeout(r, 500));

    await page.evaluate(() => {
      const btn = document.getElementById('ctl00_ucHeader_ucSessionBar_ucLogin_btnLoginCallback');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 5000));
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    log(`  Worker ${workerId}: login OK`);
  } catch (err) {
    log(`  Worker ${workerId}: login ERREUR — ${err.message}`);
    await browser.close();
    return;
  }

  // Scraper chaque mot-clé
  for (const keyword of keywords) {
    if (progress.completedKeywords.includes(keyword)) continue;

    try {
      const url = `https://www.henryschein.fr/fr-fr/dental/Search.aspx?searchkeyWord=${encodeURIComponent(keyword)}&searchType=1`;
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
      await new Promise(r => setTimeout(r, 1500));

      // Extraire les produits
      const products = await page.evaluate(() => {
        const items = [];
        const selectors = [
          '.product-thumb', '.product-item', '.product-tile',
          '[data-product-id]', '.search-result-item', '.product',
          '.product-list-item', 'li[class*="product"]',
        ];
        let cards = [];
        for (const sel of selectors) {
          const found = document.querySelectorAll(sel);
          if (found.length > 0) { cards = Array.from(found); break; }
        }
        if (cards.length === 0) {
          const rows = document.querySelectorAll('table tr, .grid-item, .list-item');
          if (rows.length > 2) cards = Array.from(rows);
        }
        for (const card of cards) {
          const nameEl = card.querySelector('.product-title,.product-name,h2,h3,a[title],.item-name,.product-desc');
          const priceEl = card.querySelector('.price,.product-price,.item-price,[class*="price"]');
          const imgEl = card.querySelector('img');
          const linkEl = card.querySelector('a[href]');
          const refEl = card.querySelector('.product-ref,.ref,.sku,[class*="ref"],[class*="code"]');
          const name = (nameEl?.getAttribute('title') || nameEl?.textContent || '').trim().replace(/\s+/g, ' ');
          const priceText = (priceEl?.textContent || '').trim();
          const imageUrl = imgEl?.src || imgEl?.getAttribute('data-src') || '';
          const url = linkEl?.href || '';
          const ref = (refEl?.textContent || '').trim();
          if (name && name.length > 3) items.push({ name, priceText, imageUrl, url, ref });
        }
        return items;
      });

      let newCount = 0;
      for (const p of products) {
        const key = `${p.name}__${p.ref}`.toLowerCase().replace(/\s+/g, ' ');
        if (!progress.products[key]) {
          progress.products[key] = { ...p, keyword };
          newCount++;
          progress.stats.newThisRun++;
        }
      }

      progress.completedKeywords.push(keyword);
      if (newCount > 0 || products.length > 0) {
        log(`  W${workerId} "${keyword}": ${products.length} produits, ${newCount} nouveaux (total: ${Object.keys(progress.products).length})`);
      }

      // Sauvegarder toutes les 10 requêtes
      if (progress.completedKeywords.length % 10 === 0) saveProgress(progress);

      await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
    } catch (err) {
      log(`  W${workerId} "${keyword}": erreur — ${err.message}`);
      progress.completedKeywords.push(keyword);
    }
  }

  await browser.close();
  log(`  Worker ${workerId}: terminé`);
}

// =============================================
// MAIN : répartir les mots-clés entre workers
// =============================================

async function main() {
  log('=== HENRY SCHEIN PARALLEL SCRAPER ===');
  log(`${WORKERS} workers × ${ALL_KEYWORDS.length} mots-clés`);

  const progress = loadProgress();
  const remaining = ALL_KEYWORDS.filter(k => !progress.completedKeywords.includes(k));
  log(`${remaining.length} mots-clés restants (${progress.completedKeywords.length} déjà faits)`);
  log(`${Object.keys(progress.products).length} produits en stock`);

  if (remaining.length === 0) {
    log('Tout est déjà fait !');
    return;
  }

  // Répartir les mots-clés entre workers
  const chunks = [];
  const chunkSize = Math.ceil(remaining.length / WORKERS);
  for (let i = 0; i < WORKERS; i++) {
    chunks.push(remaining.slice(i * chunkSize, (i + 1) * chunkSize));
  }

  // Lancer les workers en parallèle
  const start = Date.now();
  await Promise.all(chunks.map((chunk, i) => createWorker(i + 1, chunk, progress)));

  saveProgress(progress);

  const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1);
  log(`\n=== BILAN ===`);
  log(`Durée: ${elapsed} min`);
  log(`Total produits uniques: ${Object.keys(progress.products).length}`);
  log(`Nouveaux cette session: ${progress.stats.newThisRun}`);

  // Import vers API
  const allProducts = Object.values(progress.products);
  if (allProducts.length > 0) {
    log(`\nImport ${allProducts.length} produits...`);
    const batch = allProducts.map(p => ({
      name: p.name,
      price: parseFloat((p.priceText || '').replace(/[^\d,.]/g, '').replace(',', '.')) || null,
      ref: p.ref || '',
      category: 'Henry Schein',
      url: p.url || '',
      brand: '',
      image_url: p.imageUrl || null,
    }));

    for (let i = 0; i < batch.length; i += 200) {
      const chunk = batch.slice(i, i + 200);
      try {
        await new Promise((resolve) => {
          const req = http.request(IMPORT_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 10000,
          }, () => resolve());
          req.on('error', () => resolve());
          req.end(JSON.stringify(chunk));
        });
      } catch {}
    }
    log('Import terminé');
  }
}

main().catch(err => { console.error('ERREUR:', err); process.exit(1); });
