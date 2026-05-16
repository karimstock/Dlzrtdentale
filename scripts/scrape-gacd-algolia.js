#!/usr/bin/env node
// =============================================
// JADOMI — Scraper GACD via Algolia API (Node.js VPS)
// Strategie : Puppeteer pour extraire la cle API session,
// puis requetes HTTP pures via Algolia REST API.
// Resume automatique depuis fichier de progression.
// Usage: node scripts/scrape-gacd-algolia.js [--dry-run] [--skip-import] [--reset]
// =============================================

const fs = require('fs');
const path = require('path');
const http = require('http');

// --- Configuration ---
const APP_ID = 'KCFXGPCHAV';
const INDEX = 'MAGENTO2_PRODdefault_products';
const ALGOLIA_URL = `https://${APP_ID}-dsn.algolia.net/1/indexes/${INDEX}/query`;
const IMPORT_URL = 'http://127.0.0.1:3001/api/scan/import-prices';
const TMP_DIR = '/home/ubuntu/jadomi/tmp';
const PROGRESS_FILE = path.join(TMP_DIR, 'gacd-algolia-progress.json');
const LOG_FILE = '/tmp/gacd-algolia.log';
const CHUNK_SIZE = 500;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const SAVE_EVERY = 50; // Save progress every N products added

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_IMPORT = process.argv.includes('--skip-import');
const RESET = process.argv.includes('--reset');

// --- State ---
let apiKey = null;
let allProducts = {};
let totalImported = 0;
let completedBrands = new Set();
let productsSinceLastSave = 0;
const startTime = Date.now();

// --- Price ranges for big brands (>1000 products) ---
const PRICE_RANGES = [
  [0, 5], [5, 10], [10, 20], [20, 50], [50, 100],
  [100, 200], [200, 500], [500, 2000], [2000, 100000],
];

// =============================================
// Logging
// =============================================
function elapsed() {
  const s = Math.round((Date.now() - startTime) / 1000);
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
}

function log(msg) {
  const line = `[JADOMI ${elapsed()}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`);
  } catch (e) { /* ignore log write errors */ }
}

function logError(msg, err) {
  log(`ERREUR: ${msg} — ${err.message || err}`);
}

// =============================================
// Progress management
// =============================================
function loadProgress() {
  if (RESET) {
    log('--reset: progression effacee');
    return false;
  }
  try {
    if (!fs.existsSync(PROGRESS_FILE)) return false;
    const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    if (data.products && typeof data.products === 'object') {
      allProducts = data.products;
      log(`Reprise: ${Object.keys(allProducts).length} produits charges`);
    }
    if (Array.isArray(data.completedBrands)) {
      completedBrands = new Set(data.completedBrands);
      log(`Reprise: ${completedBrands.size} marques deja traitees`);
    }
    if (data.totalImported) {
      totalImported = data.totalImported;
    }
    if (data.apiKey) {
      apiKey = data.apiKey;
      log('Reprise: cle API restauree depuis progression');
    }
    return true;
  } catch (e) {
    logError('Lecture progression', e);
    return false;
  }
}

function saveProgress() {
  try {
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
    const data = {
      timestamp: new Date().toISOString(),
      productCount: Object.keys(allProducts).length,
      completedBrands: Array.from(completedBrands),
      totalImported,
      apiKey,
      products: allProducts,
    };
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data));
    log(`Progression sauvegardee: ${data.productCount} produits, ${completedBrands.size} marques`);
  } catch (e) {
    logError('Sauvegarde progression', e);
  }
}

function maybeSaveProgress(addedCount) {
  productsSinceLastSave += addedCount;
  if (productsSinceLastSave >= SAVE_EVERY) {
    saveProgress();
    productsSinceLastSave = 0;
  }
}

// =============================================
// API Key extraction via Puppeteer
// =============================================
async function fetchApiKeyPuppeteer() {
  log('Extraction de la cle API via Puppeteer...');
  let browser = null;
  try {
    const puppeteer = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteer.use(StealthPlugin());

    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    log('Navigation vers gacd.fr...');
    await page.goto('https://www.gacd.fr', {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Wait for Cloudflare/JS challenge if any
    await sleep(3000);
    const title = await page.title();
    if (title.toLowerCase().includes('moment') || title.toLowerCase().includes('security')) {
      log('Challenge Cloudflare detecte, attente...');
      for (let i = 0; i < 30; i++) {
        await sleep(2000);
        const t = await page.title();
        if (!t.toLowerCase().includes('moment') && !t.toLowerCase().includes('security')) break;
      }
    }

    // Extract algoliaConfig.apiKey
    const key = await page.evaluate(() => {
      if (window.algoliaConfig && window.algoliaConfig.apiKey) {
        return window.algoliaConfig.apiKey;
      }
      // Fallback: search in page scripts
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        const text = s.textContent || '';
        const match = text.match(/apiKey['":\s]+['"]([a-f0-9]+)['"]/);
        if (match) return match[1];
      }
      return null;
    });

    if (key) {
      log(`Cle API extraite: ${key.substring(0, 12)}...`);
      await browser.close();
      return key;
    }

    // Second attempt: navigate to a category page where Algolia might load
    log('Cle non trouvee sur la home, essai sur une page categorie...');
    await page.goto('https://www.gacd.fr/catalogsearch/result/?q=composite', {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });
    await sleep(3000);

    const key2 = await page.evaluate(() => {
      if (window.algoliaConfig && window.algoliaConfig.apiKey) {
        return window.algoliaConfig.apiKey;
      }
      return null;
    });

    if (key2) {
      log(`Cle API extraite (page recherche): ${key2.substring(0, 12)}...`);
      await browser.close();
      return key2;
    }

    throw new Error('Impossible d\'extraire la cle API Algolia depuis gacd.fr');
  } catch (e) {
    if (browser) {
      try { await browser.close(); } catch (_) {}
    }
    throw e;
  }
}

// =============================================
// Algolia API calls with retries
// =============================================
async function algoliaSearch(params, retries = MAX_RETRIES) {
  const body = JSON.stringify(params);
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(ALGOLIA_URL, {
        method: 'POST',
        headers: {
          'X-Algolia-Application-Id': APP_ID,
          'X-Algolia-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body,
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if (res.status === 403 || res.status === 401) {
          throw new Error(`API key invalide ou expiree (HTTP ${res.status}): ${text.substring(0, 200)}`);
        }
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
      }

      return await res.json();
    } catch (e) {
      if (e.message.includes('invalide') || e.message.includes('expiree')) throw e;
      if (attempt < retries) {
        const delay = RETRY_DELAY * attempt;
        log(`Tentative ${attempt}/${retries} echouee: ${e.message} — retry dans ${delay}ms`);
        await sleep(delay);
      } else {
        throw e;
      }
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// =============================================
// Product extraction
// =============================================
function addHits(hits) {
  let added = 0;
  for (const h of hits) {
    let price = null;
    if (h.price && h.price.EUR && h.price.EUR.default !== undefined) {
      price = h.price.EUR.default;
    }
    if (price === null || !h.name) continue;

    const name = String(h.name);
    if (allProducts[name]) continue;

    allProducts[name] = {
      name,
      price,
      brand: h.sap_mvgr3 || null,
      ref: Array.isArray(h.sku) ? h.sku[0] : (h.sku || null),
      category: Array.isArray(h.categories) ? h.categories.join(' > ') : null,
      url: h.url ? (h.url.startsWith('http') ? h.url : `https://www.gacd.fr${h.url}`) : null,
      imageUrl: h.thumbnail_url || h.image_url || null,
    };
    added++;
  }
  return added;
}

// =============================================
// Scrape with pagination
// =============================================
async function scrapeQuery(facetFilters, numericFilters, page = 0) {
  const params = {
    query: '',
    hitsPerPage: 1000,
    page,
    attributesToRetrieve: ['name', 'price', 'sap_mvgr3', 'sku', 'categories', 'url', 'thumbnail_url', 'image_url'],
  };
  if (facetFilters) params.facetFilters = facetFilters;
  if (numericFilters) params.numericFilters = numericFilters;

  try {
    const data = await algoliaSearch(params);
    let added = 0;
    if (data.hits && data.hits.length > 0) {
      added = addHits(data.hits);
      maybeSaveProgress(added);
    }

    // Paginate if full page and under safety limit
    if (data.hits && data.hits.length === 1000 && (page + 1) * 1000 < 20000) {
      await sleep(150);
      await scrapeQuery(facetFilters, numericFilters, page + 1);
    }
  } catch (e) {
    logError(`Query page ${page}`, e);
    // Re-throw auth errors to trigger key refresh
    if (e.message.includes('invalide') || e.message.includes('expiree')) throw e;
  }
}

// =============================================
// Brand scraping
// =============================================
async function scrapeSmallBrands(brands) {
  let skipped = 0;
  for (let i = 0; i < brands.length; i++) {
    const b = brands[i];
    if (completedBrands.has(b.name)) {
      skipped++;
      continue;
    }

    if (i % 20 === 0 || b.count > 100) {
      log(`Marque ${i + 1}/${brands.length}: ${b.name} (${b.count}) — total: ${Object.keys(allProducts).length}${skipped > 0 ? ` (${skipped} sautees)` : ''}`);
    }

    await scrapeQuery([['sap_mvgr3:' + b.name]]);
    completedBrands.add(b.name);

    if (i % 50 === 49) await sleep(500);
    else await sleep(50);
  }
  log(`Petites marques terminees: ${Object.keys(allProducts).length} produits (${skipped} sautees)`);
}

async function scrapeBigBrands(brands) {
  for (const b of brands) {
    if (completedBrands.has('BIG:' + b.name)) {
      log(`Grande marque ${b.name} deja traitee, sautee`);
      continue;
    }

    log(`Grande marque: ${b.name} (${b.count}) — decoupage par prix...`);
    for (const [min, max] of PRICE_RANGES) {
      log(`  ${b.name} ${min}-${max}EUR — ${Object.keys(allProducts).length} uniques`);
      await scrapeQuery(
        [['sap_mvgr3:' + b.name]],
        [`price.EUR.default>=${min}`, `price.EUR.default<${max}`]
      );
      await sleep(100);
    }
    completedBrands.add('BIG:' + b.name);
    saveProgress();
  }
  log(`Grandes marques terminees: ${Object.keys(allProducts).length} produits`);
}

// =============================================
// Import to Supabase
// =============================================
async function importToSupabase(products) {
  if (DRY_RUN || SKIP_IMPORT) {
    log(`${DRY_RUN ? 'DRY-RUN' : 'SKIP-IMPORT'}: pas d'import Supabase`);
    return;
  }

  const chunks = [];
  for (let i = 0; i < products.length; i += CHUNK_SIZE) {
    chunks.push(products.slice(i, i + CHUNK_SIZE));
  }

  log(`Import: ${products.length} produits en ${chunks.length} lots de ${CHUNK_SIZE}`);

  for (let i = 0; i < chunks.length; i++) {
    if (i % 5 === 0) log(`Import ${i + 1}/${chunks.length} — ${totalImported} importes`);
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const body = JSON.stringify({
          source: 'gacd',
          products: chunks[i],
          page: `algolia-auto-batch-${i + 1}`,
        });

        const imported = await new Promise((resolve, reject) => {
          const url = new URL(IMPORT_URL);
          const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
            },
            timeout: 30000,
          }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              try {
                const r = JSON.parse(data);
                resolve(r.imported || chunks[i].length);
              } catch (e) {
                resolve(chunks[i].length);
              }
            });
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
          req.write(body);
          req.end();
        });

        totalImported += imported;
        break; // success
      } catch (e) {
        if (attempt < MAX_RETRIES) {
          log(`Import chunk ${i + 1} tentative ${attempt} echouee: ${e.message}`);
          await sleep(RETRY_DELAY * attempt);
        } else {
          logError(`Import chunk ${i + 1} abandonne apres ${MAX_RETRIES} tentatives`, e);
        }
      }
    }
    await sleep(100);
  }
}

// =============================================
// Main
// =============================================
async function main() {
  log('=== GACD ALGOLIA SCRAPER (Node.js VPS) ===');
  log(`Index: ${INDEX}`);
  log(`Flags: ${DRY_RUN ? 'DRY-RUN ' : ''}${SKIP_IMPORT ? 'SKIP-IMPORT ' : ''}${RESET ? 'RESET ' : ''}`);

  // Ensure tmp dir
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  // Load progress
  const resumed = loadProgress();

  // Step 1: Get API key
  if (!apiKey) {
    try {
      apiKey = await fetchApiKeyPuppeteer();
    } catch (e) {
      logError('Extraction cle API', e);
      log('ASTUCE: Vous pouvez aussi definir la variable GACD_API_KEY');
      process.exit(1);
    }
  }

  // Allow override via env
  if (process.env.GACD_API_KEY) {
    apiKey = process.env.GACD_API_KEY;
    log('Cle API utilisee depuis GACD_API_KEY');
  }

  // Validate key with a test query
  log('Test de la cle API...');
  try {
    const test = await algoliaSearch({ query: '', hitsPerPage: 1, page: 0 });
    if (test.hits === undefined) throw new Error('Reponse invalide');
    log(`Cle API valide — ${test.nbHits || '?'} produits dans l'index`);
  } catch (e) {
    logError('Cle API invalide', e);
    // If resumed key is bad, try fetching a fresh one
    if (resumed) {
      log('Tentative de recuperation d\'une nouvelle cle...');
      try {
        apiKey = await fetchApiKeyPuppeteer();
        const test2 = await algoliaSearch({ query: '', hitsPerPage: 1, page: 0 });
        if (test2.hits === undefined) throw new Error('Reponse invalide');
        log('Nouvelle cle API valide');
      } catch (e2) {
        logError('Impossible d\'obtenir une cle valide', e2);
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  }

  // Save key to progress immediately
  saveProgress();

  // Step 2: Get all brands via facets
  log('Recuperation des marques...');
  const brandsData = await algoliaSearch({
    query: '',
    hitsPerPage: 0,
    facets: ['sap_mvgr3'],
    maxValuesPerFacet: 1000,
  });

  const brands = brandsData.facets && brandsData.facets['sap_mvgr3'];
  if (!brands) {
    log('ERREUR: pas de marques trouvees — reponse Algolia invalide');
    process.exit(1);
  }

  const brandList = Object.entries(brands)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const totalProducts = brandList.reduce((s, b) => s + b.count, 0);
  log(`${brandList.length} marques, ~${totalProducts} produits`);

  const smallBrands = brandList.filter(b => b.count <= 1000);
  const bigBrands = brandList.filter(b => b.count > 1000);
  log(`${smallBrands.length} marques <= 1000 produits`);
  if (bigBrands.length > 0) {
    log(`${bigBrands.length} grandes marques: ${bigBrands.map(b => `${b.name}(${b.count})`).join(', ')}`);
  }

  // Step 3: Scrape small brands
  await scrapeSmallBrands(smallBrands);

  // Step 4: Scrape big brands by price range
  await scrapeBigBrands(bigBrands);

  // Step 5: Catch products without brand
  if (!completedBrands.has('__NO_BRAND__')) {
    log('Passage final: produits sans marque...');
    await scrapeQuery(null, null);
    completedBrands.add('__NO_BRAND__');
    saveProgress();
  }

  const products = Object.values(allProducts);
  log(`TOTAL: ${products.length} produits uniques`);

  // Step 6: Save local backup
  const date = new Date().toISOString().split('T')[0];
  const backupFile = path.join(TMP_DIR, `gacd-algolia-${date}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(products, null, 0));
  const sizeMB = (fs.statSync(backupFile).size / 1024 / 1024).toFixed(1);
  log(`Backup: ${backupFile} (${sizeMB} MB)`);

  // Step 7: Import to Supabase
  log('Import Supabase...');
  await importToSupabase(products);

  // Cleanup progress file on success
  try {
    if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
  } catch (e) { /* ignore */ }

  log(`=== TERMINE: ${products.length} scrapes, ${totalImported} importes en ${elapsed()} ===`);
}

// =============================================
// Entry point
// =============================================
main().catch(e => {
  logError('ERREUR FATALE', e);
  // Save progress on crash so we can resume
  saveProgress();
  process.exit(1);
});

// Handle SIGINT/SIGTERM gracefully
process.on('SIGINT', () => {
  log('Interruption (SIGINT) — sauvegarde progression...');
  saveProgress();
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Arret (SIGTERM) — sauvegarde progression...');
  saveProgress();
  process.exit(0);
});
