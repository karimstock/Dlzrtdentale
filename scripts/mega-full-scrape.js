#!/usr/bin/env node
// JADOMI — Scraper COMPLET Mega Dental via Sitemap + Puppeteer Stealth
// Stratégie : 1) Extraire toutes les catégories du menu (330+)
//             2) Scraper chaque catégorie avec pagination complète
//             3) Dédoublonner par nom+ref
// Usage: node scripts/mega-full-scrape.js [--dry-run] [--resume]

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const http = require('http');
const fs = require('fs');

const BASE = 'https://www.megadental.fr';
const IMPORT_URL = 'http://127.0.0.1:3001/api/scan/import-prices';
const DRY_RUN = process.argv.includes('--dry-run');
const RESUME = process.argv.includes('--resume');

const PROGRESS_FILE = '/home/ubuntu/jadomi/tmp/mega-progress.json';
const BACKUP_FILE = '/home/ubuntu/jadomi/tmp/megadental-full-' + new Date().toISOString().slice(0, 10) + '.json';

const startTime = Date.now();
const allProducts = {};
let scrapedCategories = new Set();

function elapsed() { return Math.round((Date.now() - startTime) / 1000) + 's'; }
function log(msg) { console.log(`[JADOMI ${elapsed()}] ${msg}`); }

function saveProgress() {
  const data = {
    products: Object.values(allProducts),
    scrapedCategories: Array.from(scrapedCategories),
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data));
}

function loadProgress() {
  if (RESUME && fs.existsSync(PROGRESS_FILE)) {
    const data = JSON.parse(fs.readFileSync(PROGRESS_FILE));
    data.products.forEach(p => {
      const key = (p.name || '') + '|' + (p.ref || '');
      allProducts[key] = p;
    });
    scrapedCategories = new Set(data.scrapedCategories || []);
    log(`Resume: ${Object.keys(allProducts).length} produits, ${scrapedCategories.size} categories deja scrapees`);
    return true;
  }
  return false;
}

async function extractProducts(page, category) {
  return page.evaluate((cat) => {
    const items = [];
    document.querySelectorAll('form.product-item').forEach(el => {
      const h3 = el.querySelector('h3');
      const linkEl = el.querySelector('a.product-item-link');
      const priceEl = el.querySelector('.price');
      const sku = el.getAttribute('data-sku') || '';
      const id = el.getAttribute('data-id') || '';

      let name = '';
      if (h3) name = h3.textContent.trim();
      else if (linkEl) name = linkEl.textContent.trim().split('\n')[0].trim();

      let price = null;
      if (priceEl) {
        const raw = priceEl.textContent.replace(/[^0-9.,]/g, '').replace(',', '.');
        price = parseFloat(raw);
        if (isNaN(price)) price = null;
      }

      let url = '';
      if (linkEl && linkEl.href) url = linkEl.href;

      if (name && name.length > 2 && price !== null) {
        items.push({ name, price, ref: sku, productId: id, url, category: cat });
      }
    });
    return items;
  }, category);
}

async function getMaxPage(page) {
  return page.evaluate(() => {
    let max = 1;
    document.querySelectorAll('.pages a').forEach(a => {
      const m = a.textContent.match(/(\d+)/);
      if (m) { const n = parseInt(m[1]); if (n > max) max = n; }
      const h = (a.getAttribute('href') || '').match(/p=(\d+)/);
      if (h) { const n = parseInt(h[1]); if (n > max) max = n; }
    });
    return max;
  });
}

async function waitForCloudflare(page) {
  let title = await page.title();
  if (title.includes('moment') || title.includes('security') || title.includes('Performing')) {
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1000));
      title = await page.title();
      if (!title.includes('moment') && !title.includes('security') && !title.includes('Performing')) return true;
    }
    return false; // Challenge non passé
  }
  return true;
}

async function scrapeCategory(page, catUrl) {
  if (scrapedCategories.has(catUrl)) return 0;

  const fullUrl = BASE + catUrl;
  const catName = catUrl.replace(/\.html$/, '').replace(/\//g, ' > ').trim();

  try {
    await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (e) {
    log(`  SKIP ${catUrl}: timeout`);
    return 0;
  }

  if (!await waitForCloudflare(page)) {
    log(`  SKIP ${catUrl}: Cloudflare bloque`);
    return 0;
  }

  // Vérifier qu'il y a des produits sur cette page
  const hasProducts = await page.evaluate(() => document.querySelectorAll('form.product-item').length);
  if (hasProducts === 0) {
    scrapedCategories.add(catUrl);
    return 0;
  }

  let catAdded = 0;

  // Page 1
  const products1 = await extractProducts(page, catName);
  for (const p of products1) {
    const key = p.name + '|' + p.ref;
    if (!allProducts[key]) { allProducts[key] = p; catAdded++; }
  }

  const maxPage = await getMaxPage(page);

  // Pages suivantes
  for (let p = 2; p <= maxPage; p++) {
    try {
      await page.goto(fullUrl + '?p=' + p, { waitUntil: 'networkidle2', timeout: 30000 });
      if (!await waitForCloudflare(page)) break;

      const products = await extractProducts(page, catName);
      for (const prod of products) {
        const key = prod.name + '|' + prod.ref;
        if (!allProducts[key]) { allProducts[key] = prod; catAdded++; }
      }
    } catch (e) {
      // Timeout, continuer
    }
    await new Promise(r => setTimeout(r, 400));
  }

  scrapedCategories.add(catUrl);

  if (catAdded > 0) {
    log(`  ${catUrl} — ${maxPage} pages — +${catAdded} nouveaux (total: ${Object.keys(allProducts).length})`);
  }

  // Sauvegarder le progrès régulièrement
  if (scrapedCategories.size % 10 === 0) {
    saveProgress();
  }

  return catAdded;
}

async function discoverCategories(page) {
  log('Découverte des catégories...');
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await waitForCloudflare(page);

  // Ouvrir le menu si besoin
  const menuBtn = await page.$('button[aria-label*="menu"], .menu-toggle, [data-action="toggle-nav"], .nav-toggle');
  if (menuBtn) {
    try { await menuBtn.click(); await new Promise(r => setTimeout(r, 2000)); } catch(e) {}
  }

  const categoryUrls = await page.evaluate((base) => {
    const urls = new Set();
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.href;
      if (href && href.startsWith(base) && href.endsWith('.html') &&
          !href.includes('customer') && !href.includes('checkout') &&
          !href.includes('blog') && !href.includes('cookie') &&
          !href.includes('wishlist') && !href.includes('newsletter') &&
          !href.includes('cart')) {
        const path = href.replace(base, '');
        // Filtrer les URLs qui ressemblent à des catégories (pas trop de tirets = pas un produit)
        // Les produits ont souvent des patterns comme xxx-xxx-xxx-000-0000.html
        const segments = path.split('/');
        const lastSegment = segments[segments.length - 1];
        // Catégorie si : pas de chiffre-tiret-chiffre pattern, ou c'est un chemin avec /
        if (segments.length > 1 || !lastSegment.match(/\d{3,}-\d{3,}/)) {
          urls.add(path);
        }
      }
    });
    return Array.from(urls).sort();
  }, BASE);

  log(`${categoryUrls.length} URLs catégories trouvées`);
  return categoryUrls;
}

async function importToJadomi(products) {
  if (DRY_RUN) {
    log(`DRY RUN: ${products.length} produits NON importés`);
    return 0;
  }

  const chunkSize = 500;
  let imported = 0;

  for (let i = 0; i < products.length; i += chunkSize) {
    const chunk = products.slice(i, i + chunkSize);
    const batchNum = Math.floor(i / chunkSize) + 1;
    const totalBatches = Math.ceil(products.length / chunkSize);

    const data = JSON.stringify({
      source: 'megadental',
      products: chunk.map(p => ({ name: p.name, price: p.price, ref: p.ref || '' })),
      page: `mega-full-batch-${batchNum}`
    });

    try {
      const result = await new Promise((resolve, reject) => {
        const url = new URL(IMPORT_URL);
        const req = http.request({
          hostname: url.hostname, port: url.port, path: url.pathname,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        }, res => {
          let body = '';
          res.on('data', d => body += d);
          res.on('end', () => {
            try { resolve(JSON.parse(body)); } catch(e) { resolve({ imported: 0 }); }
          });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
      });
      imported += result.imported || 0;
      log(`  Import lot ${batchNum}/${totalBatches}: ${result.imported || 0}`);
    } catch (e) {
      log(`  ERREUR import lot ${batchNum}: ${e.message}`);
    }
  }

  return imported;
}

async function main() {
  log('=== JADOMI Scraper Mega Dental — MODE COMPLET ===');
  log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'PRODUCTION'}`);

  loadProgress();

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // Découvrir toutes les catégories
    const categoryUrls = await discoverCategories(page);

    // Scraper chaque catégorie
    const total = categoryUrls.length;
    let idx = 0;
    for (const catUrl of categoryUrls) {
      idx++;
      if (idx % 20 === 0) {
        log(`--- Progression: ${idx}/${total} catégories, ${Object.keys(allProducts).length} produits ---`);
      }
      await scrapeCategory(page, catUrl);
      await new Promise(r => setTimeout(r, 300));
    }

    // Résultats
    const products = Object.values(allProducts);
    log(`\n================================================`);
    log(`SCRAPING COMPLET: ${products.length} produits uniques en ${elapsed()}`);
    log(`Categories scrapées: ${scrapedCategories.size}/${total}`);
    log(`================================================\n`);

    // Backup
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(products, null, 2));
    log(`Backup: ${BACKUP_FILE}`);

    // Stats
    const byCat = {};
    products.forEach(p => {
      const topCat = (p.category || 'unknown').split(' > ')[0].trim() || 'root';
      byCat[topCat] = (byCat[topCat] || 0) + 1;
    });
    log('\nPar catégorie principale:');
    Object.entries(byCat).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
      log(`  ${String(count).padStart(5)} — ${cat}`);
    });

    // Aperçu prix
    const prices = products.map(p => p.price).sort((a, b) => a - b);
    log(`\nPrix: min=${prices[0]?.toFixed(2)} / median=${prices[Math.floor(prices.length/2)]?.toFixed(2)} / max=${prices[prices.length-1]?.toFixed(2)} EUR`);

    // Import
    log('\n--- Import Supabase ---');
    const imported = await importToJadomi(products);
    log(`Import: ${imported}/${products.length}`);

  } catch (e) {
    log(`ERREUR: ${e.message}`);
    saveProgress();
    log('Progrès sauvegardé. Relancez avec --resume pour reprendre.');
  } finally {
    await browser.close();
  }

  log(`Terminé en ${elapsed()}`);
}

main();
