#!/usr/bin/env node
// JADOMI — Scraper Dentaltix via SITEMAP + Puppeteer Stealth
// Bypass AWS WAF via headless Chrome

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const http = require('http');
const fs = require('fs');

const BASE = 'https://www.dentaltix.com';
const IMPORT_URL = 'http://127.0.0.1:3001/api/scan/import-prices';
const BACKUP_FILE = '/home/ubuntu/jadomi/tmp/dentaltix-sitemap-' + new Date().toISOString().slice(0, 10) + '.json';
const PROGRESS_FILE = '/home/ubuntu/jadomi/tmp/dentaltix-progress.json';

const startTime = Date.now();
const allProducts = {};
let scraped = 0;

function elapsed() { return Math.round((Date.now() - startTime) / 1000) + 's'; }
function log(msg) { console.log(`[JADOMI ${elapsed()}] ${msg}`); }

async function waitWAF(page) {
  for (let i = 0; i < 20; i++) {
    const title = await page.title();
    if (!title.includes('moment') && !title.includes('security') && !title.includes('Performing') && !title.includes('challenge')) return true;
    await new Promise(r => setTimeout(r, 1500));
  }
  return false;
}

async function extractJsonLd(page) {
  return page.evaluate(() => {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      try {
        const data = JSON.parse(s.textContent);
        if (data['@type'] === 'Product') return data;
        if (Array.isArray(data)) { const p = data.find(d => d['@type'] === 'Product'); if (p) return p; }
      } catch(e) {}
    }
    return null;
  });
}

async function extractFromHtml(page) {
  return page.evaluate(() => {
    // Breadcrumbs for category
    const crumbs = [];
    document.querySelectorAll('.breadcrumb a, nav.breadcrumb a, .breadcrumbs a').forEach(a => {
      const t = a.textContent.trim();
      if (t && t !== 'Accueil' && t !== 'Home') crumbs.push(t);
    });
    // Price HT
    const priceEl = document.querySelector('.price--sale, .product-price, .field--name-price .field__item, .price');
    let priceText = priceEl ? priceEl.textContent : '';
    return { category: crumbs.join(' > '), priceText };
  });
}

async function scrapeProduct(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    if (!await waitWAF(page)) return null;

    const jsonLd = await extractJsonLd(page);
    const html = await extractFromHtml(page);

    if (!jsonLd || !jsonLd.name) return null;

    let price = null;
    if (jsonLd.offers) {
      const offer = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers;
      price = parseFloat(offer.price);
    }
    if (!price || isNaN(price)) return null;

    return {
      name: jsonLd.name,
      price: price,
      ref: jsonLd.sku || '',
      brand: (jsonLd.brand && jsonLd.brand.name) || '',
      category: html.category || '',
      url: url
    };
  } catch(e) {
    return null;
  }
}

async function importToJadomi(products) {
  log(`\n--- Import ${products.length} produits ---`);
  const chunkSize = 500;
  let imported = 0;
  for (let i = 0; i < products.length; i += chunkSize) {
    const chunk = products.slice(i, i + chunkSize);
    const bn = Math.floor(i / chunkSize) + 1;
    const tb = Math.ceil(products.length / chunkSize);
    const data = JSON.stringify({
      source: 'dentaltix', products: chunk.map(p => ({
        name: p.name, price: p.price, ref: p.ref || '',
        brand: p.brand || '', category: p.category || '', url: p.url || ''
      })), page: `dentaltix-sitemap-${bn}`
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
  log(`Import: ${imported}/${products.length}`);
}

async function main() {
  log('=== JADOMI Scraper Dentaltix — SITEMAP + PUPPETEER ===\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });

    // Warmup - solve initial WAF challenge
    log('Warmup...');
    await page.goto(BASE + '/fr/', { waitUntil: 'networkidle2', timeout: 60000 });
    await waitWAF(page);
    await new Promise(r => setTimeout(r, 3000));

    // Fetch sitemap
    log('Recuperation sitemap FR...');
    await page.goto(BASE + '/fr/sitemap.xml', { waitUntil: 'networkidle2', timeout: 30000 });
    await waitWAF(page);
    const sitemapContent = await page.content();

    // Extract product URLs (exclude blog, contact, error, plan-du-site)
    const allUrls = (sitemapContent.match(/https:\/\/www\.dentaltix\.com\/fr\/[^<"]+/g) || [])
      .filter(u => !u.includes('/blog/') && !u.includes('contact') && !u.includes('error') && !u.includes('plan-du-site') && !u.includes('sitemap'));

    const uniqueUrls = [...new Set(allUrls)];
    log(`${uniqueUrls.length} URLs FR trouvees\n`);

    // Resume support
    let startIdx = 0;
    if (fs.existsSync(PROGRESS_FILE)) {
      try {
        const prog = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
        Object.assign(allProducts, prog.products || {});
        startIdx = prog.idx || 0;
        log(`REPRISE depuis #${startIdx}, ${Object.keys(allProducts).length} produits en cache`);
      } catch(e) {}
    }

    // Scrape each product page
    log('Scraping produits...');
    for (let i = startIdx; i < uniqueUrls.length; i++) {
      const product = await scrapeProduct(page, uniqueUrls[i]);
      if (product) {
        const key = product.name + '|' + product.ref;
        if (!allProducts[key]) {
          allProducts[key] = product;
        }
      }
      scraped++;

      if (i % 50 === 0 && i > 0) {
        log(`  ${i}/${uniqueUrls.length} pages, ${Object.keys(allProducts).length} produits`);
        // Save progress
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ idx: i, products: allProducts }));
      }

      // Respect crawl-delay
      await new Promise(r => setTimeout(r, 2000));
    }

    const products = Object.values(allProducts);
    log(`\n====================================================`);
    log(`DENTALTIX: ${products.length} produits en ${elapsed()}`);
    log(`====================================================\n`);

    // Backup
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(products, null, 2));
    log(`Backup: ${BACKUP_FILE}`);

    // Import
    await importToJadomi(products);

    // Cleanup progress file
    if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);

  } catch(e) {
    log(`ERREUR: ${e.message}`);
    console.error(e);
  } finally {
    await browser.close();
  }
  log(`\nTermine en ${elapsed()}`);
}

main();
