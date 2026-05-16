#!/usr/bin/env node
// JADOMI — Scraper Doctor-AI via SITEMAP COMPLET
// Même approche que mega-sitemap-scrape.js mais pour doctor-ai.fr

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const http = require('http');
const fs = require('fs');

const BASE = 'https://www.doctor-ai.fr';
const IMPORT_URL = 'http://127.0.0.1:3001/api/scan/import-prices';
const DRY_RUN = process.argv.includes('--dry-run');
const BACKUP_FILE = '/home/ubuntu/jadomi/tmp/doctorai-sitemap-' + new Date().toISOString().slice(0, 10) + '.json';

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
    document.querySelectorAll('form.product-item').forEach(el => {
      const h3 = el.querySelector('h3');
      const linkEl = el.querySelector('a.product-item-link');
      const sku = el.getAttribute('data-sku') || '';
      const id = el.getAttribute('data-id') || '';
      let name = h3 ? h3.textContent.trim() : '';
      if (!name && linkEl) name = linkEl.textContent.trim().split('\n')[0].trim();
      const finalEl = el.querySelector('[data-price-type="finalPrice"] .price, .special-price .price, .price');
      let price = null;
      if (finalEl) { price = parseFloat(finalEl.textContent.replace(/[^0-9.,]/g, '').replace(',', '.')); if (isNaN(price)) price = null; }
      const oldEl = el.querySelector('[data-price-type="oldPrice"] .price, .old-price .price');
      let oldPrice = null;
      if (oldEl) { oldPrice = parseFloat(oldEl.textContent.replace(/[^0-9.,]/g, '').replace(',', '.')); if (isNaN(oldPrice)) oldPrice = null; }
      const discountEl = el.querySelector('.discount');
      let discount = null;
      if (discountEl) { const m = discountEl.textContent.match(/-?\d+/); if (m) discount = Math.abs(parseInt(m[0])); }
      let url = (linkEl && linkEl.href) ? linkEl.href : '';
      if (name && name.length > 2 && price !== null) {
        items.push({ name, price, ref: sku, productId: id, url, category: cat, oldPrice, discount });
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

async function scrapeCatPage(page, catName) {
  let added = 0;
  const products = await extractProducts(page, catName);
  for (const p of products) {
    const key = p.name + '|' + p.ref;
    if (!allProducts[key]) { allProducts[key] = p; added++; }
    else if (p.oldPrice && !allProducts[key].oldPrice) { allProducts[key].oldPrice = p.oldPrice; allProducts[key].discount = p.discount; }
  }
  return added;
}

async function scrapeCategory(page, catUrl) {
  if (visitedUrls.has(catUrl)) return 0;
  visitedUrls.add(catUrl);
  const fullUrl = BASE + catUrl;
  const catName = catUrl.replace(/\.html$/, '').replace(/^\//,'').replace(/\//g, ' > ');
  try { await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 30000 }); } catch (e) { return 0; }
  if (!await waitCF(page)) return 0;
  const productCount = await page.evaluate(() => document.querySelectorAll('form.product-item').length);
  if (productCount === 0) return 0;
  let catAdded = await scrapeCatPage(page, catName);
  const maxPage = await getMaxPage(page);
  for (let p = 2; p <= maxPage; p++) {
    try {
      await page.goto(fullUrl + '?p=' + p, { waitUntil: 'networkidle2', timeout: 25000 });
      if (!await waitCF(page)) break;
      catAdded += await scrapeCatPage(page, catName);
    } catch(e) {}
    await new Promise(r => setTimeout(r, 300));
  }
  if (catAdded > 0) log(`  CAT ${catUrl.padEnd(70)} ${maxPage}p +${String(catAdded).padStart(4)} total=${Object.keys(allProducts).length}`);
  return catAdded;
}

async function main() {
  log('=== JADOMI Scraper Doctor-AI — SITEMAP COMPLET ===\n');
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

    // Fetch sitemap
    log('Récupération du sitemap...');
    await page.goto(BASE + '/sitemap.xml', { waitUntil: 'networkidle2', timeout: 30000 });
    let sitemapContent = await page.content();

    // Check if it's a sitemap index
    let allSitemapUrls = [];
    if (sitemapContent.includes('<sitemapindex') || sitemapContent.includes('<sitemap>')) {
      const sitemapRefs = (sitemapContent.match(/<loc>([^<]+\.xml[^<]*)<\/loc>/g) || []).map(m => m.replace('<loc>','').replace('</loc>',''));
      log(`Sitemap index: ${sitemapRefs.length} sous-sitemaps`);
      for (const ref of sitemapRefs) {
        await page.goto(ref, { waitUntil: 'networkidle2', timeout: 30000 });
        const subContent = await page.content();
        const urls = (subContent.match(/<loc>([^<]+)<\/loc>/g) || []).map(m => m.replace('<loc>','').replace('</loc>',''));
        allSitemapUrls.push(...urls);
        log(`  ${ref.split('/').pop()}: ${urls.length} URLs`);
      }
    } else {
      allSitemapUrls = (sitemapContent.match(/<loc>([^<]+)<\/loc>/g) || []).map(m => m.replace('<loc>','').replace('</loc>',''));
      log(`Sitemap direct: ${allSitemapUrls.length} URLs`);
    }

    // Filter and classify URLs
    const catUrls = [];
    allSitemapUrls.forEach(url => {
      if (!url.startsWith(BASE)) return;
      const path = url.replace(BASE, '');
      if (!path.endsWith('.html')) return;
      if (path.includes('customer') || path.includes('checkout') || path.includes('blog') || path.includes('cookie')) return;
      catUrls.push(path);
    });

    // Deduplicate and sort
    const uniqueCats = [...new Set(catUrls)].sort();
    log(`Total URLs à scraper: ${uniqueCats.length}\n`);

    // Also add categories discovered from navigation
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
    await waitCF(page);
    const menuBtn = await page.$('button[aria-label*="menu"], .menu-toggle, .nav-toggle');
    if (menuBtn) { try { await menuBtn.click(); await new Promise(r => setTimeout(r, 2000)); } catch(e) {} }
    const navLinks = await page.evaluate((base) => {
      const urls = new Set();
      document.querySelectorAll('a[href]').forEach(a => {
        if (a.href.startsWith(base) && a.href.endsWith('.html') && !a.href.includes('customer') && !a.href.includes('checkout'))
          urls.add(a.href.replace(base, ''));
      });
      return Array.from(urls);
    }, BASE);
    navLinks.forEach(u => { if (!uniqueCats.includes(u)) uniqueCats.push(u); });
    uniqueCats.sort();
    log(`Total avec navigation: ${uniqueCats.length}\n`);

    // Scrape all
    log('PHASE 2: Scraping...');
    let idx = 0;
    for (const catUrl of uniqueCats) {
      idx++;
      if (idx % 50 === 0) {
        log(`\n--- ${idx}/${uniqueCats.length} catégories, ${Object.keys(allProducts).length} produits ---\n`);
        fs.writeFileSync('/home/ubuntu/jadomi/tmp/doctorai-sitemap-progress.json', JSON.stringify(Object.values(allProducts)));
      }
      await scrapeCategory(page, catUrl);
      await new Promise(r => setTimeout(r, 200));
    }

    const products = Object.values(allProducts);
    log(`\n====================================================`);
    log(`DOCTOR-AI SITEMAP COMPLET: ${products.length} produits uniques en ${elapsed()}`);
    log(`====================================================\n`);

    fs.writeFileSync(BACKUP_FILE, JSON.stringify(products, null, 2));
    log(`Backup: ${BACKUP_FILE}`);

    // Stats promos
    const withPromo = products.filter(p => p.oldPrice);
    log(`En promo: ${withPromo.length}`);

    // Import
    log('\n--- Import Supabase ---');
    if (!DRY_RUN) {
      const chunkSize = 500;
      let imported = 0;
      for (let i = 0; i < products.length; i += chunkSize) {
        const chunk = products.slice(i, i + chunkSize);
        const bn = Math.floor(i / chunkSize) + 1;
        const tb = Math.ceil(products.length / chunkSize);
        const data = JSON.stringify({
          source: 'doctorai', products: chunk.map(p => ({
            name: p.name, price: p.price, ref: p.ref || '',
            price_original: p.oldPrice || null, discount: p.discount || null,
            category: p.category || null, url: p.url || null
          })), page: `doctorai-sitemap-batch-${bn}`
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
    }
  } catch (e) {
    log(`ERREUR: ${e.message}`);
    console.error(e);
  } finally {
    await browser.close();
  }
  log(`\nTerminé en ${elapsed()}`);
}

main();
