#!/usr/bin/env node
// JADOMI — Scraper Mega Dental PAR MARQUE via Puppeteer
// Comme GACD/Algolia mais avec le search Magento
// Va sur /brands, récupère chaque marque, scrape toutes les pages

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const http = require('http');
const fs = require('fs');

const SITE = process.argv[2] || 'megadental'; // megadental, doctorai, doctorstrong
const SITES = {
  megadental: { base: 'https://www.megadental.fr', source: 'megadental' },
  doctorai: { base: 'https://www.doctor-ai.fr', source: 'doctorai' },
  doctorstrong: { base: 'https://www.doctorstrong.fr', source: 'doctorstrong' }
};
const config = SITES[SITE];
if (!config) { console.log('Usage: node mega-brands-scrape.js [megadental|doctorai|doctorstrong]'); process.exit(1); }

const BASE = config.base;
const SOURCE = config.source;
const IMPORT_URL = 'http://127.0.0.1:3001/api/scan/import-prices';
const BACKUP_FILE = `/home/ubuntu/jadomi/tmp/${SOURCE}-brands-${new Date().toISOString().slice(0, 10)}.json`;

const startTime = Date.now();
const allProducts = {};

function elapsed() { return Math.round((Date.now() - startTime) / 1000) + 's'; }
function log(msg) { console.log(`[JADOMI ${elapsed()}] ${msg}`); }

async function waitCF(page) {
  let title = await page.title();
  if (title.includes('moment') || title.includes('security') || title.includes('Performing')) {
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 1000));
      title = await page.title();
      if (!title.includes('moment') && !title.includes('security') && !title.includes('Performing')) return true;
    }
    return false;
  }
  return true;
}

async function extractProducts(page, brand) {
  return page.evaluate((br) => {
    const items = [];
    document.querySelectorAll('form.product-item,.product-item').forEach(el => {
      const h3 = el.querySelector('h3');
      let name = h3 ? h3.textContent.trim() : '';
      if (!name) { const l = el.querySelector('a.product-item-link'); if (l) name = l.textContent.trim().split('\n')[0].trim(); }
      const pe = el.querySelector('[data-price-type="finalPrice"] .price,.special-price .price,.price');
      let price = null;
      if (pe) { price = parseFloat(pe.textContent.replace(/[^0-9.,]/g, '').replace(',', '.')); if (isNaN(price)) price = null; }
      const oe = el.querySelector('[data-price-type="oldPrice"] .price,.old-price .price');
      let oldPrice = null;
      if (oe) { oldPrice = parseFloat(oe.textContent.replace(/[^0-9.,]/g, '').replace(',', '.')); if (isNaN(oldPrice)) oldPrice = null; }
      const de = el.querySelector('.discount');
      let discount = null;
      if (de) { const m = de.textContent.match(/-?\d+/); if (m) discount = Math.abs(parseInt(m[0])); }
      const sk = el.getAttribute('data-sku') || '';
      const li = el.querySelector('a.product-item-link');
      const url = (li && li.href) ? li.href : '';
      if (name && name.length > 2 && price !== null) {
        items.push({ name, price, ref: sk, oldPrice, discount, url, category: br });
      }
    });
    return items;
  }, brand);
}

async function getMaxPage(page) {
  return page.evaluate(() => {
    let max = 1;
    document.querySelectorAll('.pages a').forEach(a => {
      const m = a.textContent.match(/(\d+)/); if (m) { const n = parseInt(m[1]); if (n > max) max = n; }
      const h = (a.getAttribute('href') || '').match(/p=(\d+)/); if (h) { const n = parseInt(h[1]); if (n > max) max = n; }
    });
    return max;
  });
}

async function scrapeBrand(page, brandUrl, brandName) {
  try { await page.goto(brandUrl, { waitUntil: 'networkidle2', timeout: 30000 }); } catch(e) { return 0; }
  if (!await waitCF(page)) return 0;

  const count = await page.evaluate(() => document.querySelectorAll('form.product-item,.product-item').length);
  if (count === 0) return 0;

  let added = 0;
  const prods = await extractProducts(page, brandName);
  for (const p of prods) {
    const key = p.name + '|' + p.ref;
    if (!allProducts[key]) { allProducts[key] = p; added++; }
  }

  const maxPage = await getMaxPage(page);

  for (let pg = 2; pg <= maxPage; pg++) {
    try {
      await page.goto(brandUrl + (brandUrl.includes('?') ? '&' : '?') + 'p=' + pg, { waitUntil: 'networkidle2', timeout: 25000 });
      if (!await waitCF(page)) break;
      const prods2 = await extractProducts(page, brandName);
      for (const p of prods2) {
        const key = p.name + '|' + p.ref;
        if (!allProducts[key]) { allProducts[key] = p; added++; }
      }
    } catch(e) {}
    await new Promise(r => setTimeout(r, 300));
  }

  if (added > 0) log(`  ${brandName.padEnd(35)} ${maxPage}p +${String(added).padStart(4)} total=${Object.keys(allProducts).length}`);
  return added;
}

async function main() {
  log(`=== JADOMI Scraper ${SOURCE.toUpperCase()} PAR MARQUE ===\n`);

  const browser = await puppeteer.launch({
    headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });
    await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

    // Phase 1: Récupérer la liste des marques
    log('Phase 1: Page marques...');
    await page.goto(BASE + '/brands', { waitUntil: 'networkidle2', timeout: 60000 });
    await waitCF(page);

    const brands = await page.evaluate((base) => {
      const results = [];
      const seen = new Set();
      // Sélecteur spécifique pour les pages marques Magento/Amasty
      document.querySelectorAll('.brands-list a, .ambrands-item a, .brand-list a, [class*="brand"] a').forEach(a => {
        const href = a.href;
        if (href && href.startsWith(base) && href.includes('/brands/') && !seen.has(href)) {
          seen.add(href);
          const name = a.textContent.trim() || a.getAttribute('title') || href.split('/brands/')[1].replace(/-/g, ' ');
          results.push({ name, url: href });
        }
      });
      // Fallback: tous les liens /brands/xxx
      if (results.length < 10) {
        document.querySelectorAll('a[href*="/brands/"]').forEach(a => {
          const href = a.href;
          if (href && href.startsWith(base) && !seen.has(href)) {
            seen.add(href);
            const name = a.textContent.trim() || href.split('/brands/')[1].replace(/-/g, ' ');
            results.push({ name, url: href });
          }
        });
      }
      return results;
    }, BASE);

    log(`Marques trouvées: ${brands.length}`);
    const mainBrands = brands;

    log(`Marques filtrées: ${mainBrands.length}`);
    log(`Exemples: ${mainBrands.slice(0, 10).map(b => b.name).join(', ')}\n`);

    // Phase 2: Scraper chaque marque
    log('Phase 2: Scraping par marque...');
    let idx = 0;
    for (const brand of mainBrands) {
      idx++;
      if (idx % 30 === 0) log(`--- ${idx}/${mainBrands.length} marques, ${Object.keys(allProducts).length} produits ---`);
      await scrapeBrand(page, brand.url, brand.name);
      await new Promise(r => setTimeout(r, 200));
    }

    const products = Object.values(allProducts);
    log(`\n====================================================`);
    log(`${SOURCE.toUpperCase()} PAR MARQUE: ${products.length} produits en ${elapsed()}`);
    log(`====================================================\n`);

    // Backup
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(products, null, 2));
    log(`Backup: ${BACKUP_FILE}`);

    // Import
    log('\n--- Import Supabase ---');
    const chunkSize = 500;
    let imported = 0;
    for (let i = 0; i < products.length; i += chunkSize) {
      const chunk = products.slice(i, i + chunkSize);
      const bn = Math.floor(i / chunkSize) + 1;
      const tb = Math.ceil(products.length / chunkSize);
      const data = JSON.stringify({
        source: SOURCE, products: chunk.map(p => ({
          name: p.name, price: p.price, ref: p.ref || '',
          price_original: p.oldPrice || null, discount: p.discount || null,
          category: p.category || null, url: p.url || null
        })), page: `${SOURCE}-brands-batch-${bn}`
      });
      try {
        const r = await new Promise((resolve, reject) => {
          const u = new URL(IMPORT_URL);
          const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
          }, res => { let b = ''; res.on('data', d => b += d); res.on('end', () => { try { resolve(JSON.parse(b)); } catch(e) { resolve({}); } }); });
          req.on('error', reject); req.write(data); req.end();
        });
        imported += r.imported || 0;
        log(`  Lot ${bn}/${tb}: ${r.imported || 0}`);
      } catch(e) { log(`  ERR: ${e.message}`); }
    }
    log(`Import total: ${imported}/${products.length}`);

  } catch (e) {
    log(`ERREUR: ${e.message}`);
    console.error(e);
  } finally {
    await browser.close();
  }
  log(`\nTerminé en ${elapsed()}`);
}

main();
