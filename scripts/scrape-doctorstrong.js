#!/usr/bin/env node
// JADOMI — Scraper Doctor Strong via Puppeteer Stealth — PAR MARQUE
// Même plateforme que Mega Dental (Magento + Hyva + ElasticSuite)
// Usage: node scripts/scrape-doctorstrong.js

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const http = require('http');
const fs = require('fs');

const BASE = 'https://www.doctorstrong.fr';
const IMPORT_URL = 'http://127.0.0.1:3001/api/scan/import-prices';
const BACKUP_FILE = '/home/ubuntu/jadomi/tmp/doctorstrong-' + new Date().toISOString().slice(0, 10) + '.json';

const startTime = Date.now();
const allProducts = {};
const visitedUrls = new Set();

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

async function extractProducts(page, category) {
  return page.evaluate((cat) => {
    const items = [];
    document.querySelectorAll('form.product-item,.product-item').forEach(el => {
      const h3 = el.querySelector('h3');
      let name = h3 ? h3.textContent.trim() : '';
      if (!name) { const link = el.querySelector('a.product-item-link'); if (link) name = link.textContent.trim().split('\n')[0].trim(); }
      const finalEl = el.querySelector('[data-price-type="finalPrice"] .price,.special-price .price,.price');
      let price = null;
      if (finalEl) { price = parseFloat(finalEl.textContent.replace(/[^0-9.,]/g, '').replace(',', '.')); if (isNaN(price)) price = null; }
      const oldEl = el.querySelector('[data-price-type="oldPrice"] .price,.old-price .price');
      let oldPrice = null;
      if (oldEl) { oldPrice = parseFloat(oldEl.textContent.replace(/[^0-9.,]/g, '').replace(',', '.')); if (isNaN(oldPrice)) oldPrice = null; }
      const discountEl = el.querySelector('.discount');
      let discount = null;
      if (discountEl) { const m = discountEl.textContent.match(/-?\d+/); if (m) discount = Math.abs(parseInt(m[0])); }
      const sku = el.getAttribute('data-sku') || '';
      const linkEl = el.querySelector('a.product-item-link');
      const url = (linkEl && linkEl.href) ? linkEl.href : '';
      if (name && name.length > 2 && price !== null) {
        items.push({ name, price, ref: sku, oldPrice, discount, url, category: cat });
      }
    });
    return items;
  }, category);
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

async function scrapePage(page, url, category) {
  if (visitedUrls.has(url)) return 0;
  visitedUrls.add(url);
  try { await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }); } catch(e) { return 0; }
  if (!await waitCF(page)) return 0;
  const count = await page.evaluate(() => document.querySelectorAll('form.product-item,.product-item').length);
  if (count === 0) return 0;

  let added = 0;
  const products = await extractProducts(page, category);
  for (const p of products) {
    const key = p.name + '|' + p.ref;
    if (!allProducts[key]) { allProducts[key] = p; added++; }
  }

  const maxPage = await getMaxPage(page);
  for (let pg = 2; pg <= maxPage; pg++) {
    try {
      await page.goto(url + '?p=' + pg, { waitUntil: 'networkidle2', timeout: 25000 });
      if (!await waitCF(page)) break;
      const prods = await extractProducts(page, category);
      for (const p of prods) {
        const key = p.name + '|' + p.ref;
        if (!allProducts[key]) { allProducts[key] = p; added++; }
      }
    } catch(e) {}
    await new Promise(r => setTimeout(r, 300));
  }

  if (added > 0) log(`  ${category.padEnd(40)} ${maxPage}p +${String(added).padStart(4)} total=${Object.keys(allProducts).length}`);
  return added;
}

async function main() {
  log('=== JADOMI Scraper Doctor Strong — COMPLET ===\n');

  const browser = await puppeteer.launch({
    headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });
    await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

    // Warm up
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
    await waitCF(page);

    // Phase 1: Découvrir les marques
    log('Phase 1: Page marques...');
    await page.goto(BASE + '/brands', { waitUntil: 'networkidle2', timeout: 30000 });
    await waitCF(page);

    const brandLinks = await page.evaluate((base) => {
      const links = [];
      const seen = {};
      document.querySelectorAll('a[href]').forEach(a => {
        const href = a.href;
        const text = a.textContent.trim();
        if (href && href.startsWith(base) && text.length > 1 && text.length < 60 &&
            !href.includes('customer') && !href.includes('checkout') && !href.includes('blog') &&
            !href.includes('cookie') && !href.includes('cart') && !href.includes('#') &&
            !href.includes('static') && !href.includes('favicon') && !seen[href]) {
          seen[href] = true;
          links.push({ name: text, url: href });
        }
      });
      return links;
    }, BASE);

    log(`Marques trouvées: ${brandLinks.length}`);

    // Phase 2: Aussi découvrir toutes les catégories du menu
    log('Phase 2: Menu navigation...');
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
    const menuBtn = await page.$('button[aria-label*="menu"], .menu-toggle, .nav-toggle');
    if (menuBtn) { try { await menuBtn.click(); await new Promise(r => setTimeout(r, 2000)); } catch(e) {} }

    const menuLinks = await page.evaluate((base) => {
      const links = [];
      const seen = {};
      document.querySelectorAll('a[href]').forEach(a => {
        const href = a.href;
        if (href && href.startsWith(base) && href.endsWith('.html') &&
            !href.includes('customer') && !href.includes('checkout') && !href.includes('blog') &&
            !seen[href]) {
          seen[href] = true;
          links.push({ name: href.replace(base, ''), url: href });
        }
      });
      return links;
    }, BASE);

    log(`Menu: ${menuLinks.length} catégories`);

    // Combiner marques + catégories
    const allPages = [...brandLinks, ...menuLinks];
    const uniquePages = [];
    const seenUrls = new Set();
    for (const p of allPages) {
      if (!seenUrls.has(p.url)) { seenUrls.add(p.url); uniquePages.push(p); }
    }
    log(`Total pages à scraper: ${uniquePages.length}\n`);

    // Phase 3: Sous-catégories
    log('Phase 3: Exploration sous-catégories...');
    const subCats = [];
    for (let i = 0; i < Math.min(uniquePages.length, 50); i++) {
      try {
        await page.goto(uniquePages[i].url, { waitUntil: 'networkidle2', timeout: 15000 });
        if (!await waitCF(page)) continue;
        const links = await page.evaluate((base) => {
          const urls = [];
          document.querySelectorAll('a[href]').forEach(a => {
            if (a.href.startsWith(base) && a.href.endsWith('.html') && !a.href.includes('customer') && !a.href.includes('checkout'))
              urls.push({ name: a.href.replace(base, ''), url: a.href });
          });
          return urls;
        }, BASE);
        links.forEach(l => { if (!seenUrls.has(l.url)) { seenUrls.add(l.url); subCats.push(l); } });
      } catch(e) {}
      await new Promise(r => setTimeout(r, 200));
    }

    const finalPages = [...uniquePages, ...subCats];
    log(`Avec sous-catégories: ${finalPages.length} pages\n`);

    // Phase 4: Scraping
    log('Phase 4: Scraping...');
    let idx = 0;
    for (const item of finalPages) {
      idx++;
      if (idx % 30 === 0) log(`--- ${idx}/${finalPages.length}, ${Object.keys(allProducts).length} produits ---`);
      await scrapePage(page, item.url, item.name);
      await new Promise(r => setTimeout(r, 200));
    }

    const products = Object.values(allProducts);
    log(`\n====================================================`);
    log(`DOCTOR STRONG COMPLET: ${products.length} produits en ${elapsed()}`);
    log(`====================================================\n`);

    // Backup
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(products, null, 2));
    log(`Backup: ${BACKUP_FILE}`);

    // Stats promos
    const withPromo = products.filter(p => p.oldPrice);
    log(`En promo: ${withPromo.length}`);

    // Exemples
    log('\n10 exemples:');
    products.slice(0, 10).forEach(p => {
      const promo = p.oldPrice ? ` (au lieu de ${p.oldPrice}E -${p.discount}%)` : '';
      log(`  REF=${(p.ref||'?').padEnd(20)} ${String(p.price.toFixed(2)).padStart(10)}E${promo}  ${p.name.substring(0, 50)}`);
    });

    // Import Supabase
    log('\n--- Import Supabase ---');
    const chunkSize = 500;
    let imported = 0;
    for (let i = 0; i < products.length; i += chunkSize) {
      const chunk = products.slice(i, i + chunkSize);
      const bn = Math.floor(i / chunkSize) + 1;
      const tb = Math.ceil(products.length / chunkSize);
      const data = JSON.stringify({
        source: 'doctorstrong', products: chunk.map(p => ({
          name: p.name, price: p.price, ref: p.ref || '',
          price_original: p.oldPrice || null, discount: p.discount || null,
          category: p.category || null, url: p.url || null
        })), page: `doctorstrong-batch-${bn}`
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
  log(`\nTermine en ${elapsed()}`);
}

main();
