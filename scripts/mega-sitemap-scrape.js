#!/usr/bin/env node
// JADOMI — Scraper Mega Dental via SITEMAP COMPLET
// 1. Récupérer les 3 fichiers sitemap (13K+ URLs)
// 2. Identifier les pages produits vs catégories
// 3. Scraper les pages produits directement pour nom+prix+promo+ref

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const http = require('http');
const fs = require('fs');

const BASE = 'https://www.megadental.fr';
const IMPORT_URL = 'http://127.0.0.1:3001/api/scan/import-prices';
const DRY_RUN = process.argv.includes('--dry-run');
const BACKUP_FILE = '/home/ubuntu/jadomi/tmp/megadental-sitemap-' + new Date().toISOString().slice(0, 10) + '.json';

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

async function fetchSitemapUrls(page) {
  log('Récupération des sitemaps...');
  const sitemapFiles = [
    '/media/sitemap/sitemap_14-1-1.xml',
    '/media/sitemap/sitemap_14-1-2.xml',
    '/media/sitemap/sitemap_14-1-3.xml'
  ];

  const allUrls = [];
  for (const file of sitemapFiles) {
    await page.goto(BASE + file, { waitUntil: 'networkidle2', timeout: 30000 });
    const urls = await page.evaluate(() => {
      const locs = document.querySelectorAll('loc');
      return Array.from(locs).map(l => l.textContent.trim());
    });
    allUrls.push(...urls);
    log(`  ${file}: ${urls.length} URLs`);
  }

  return allUrls;
}

function classifyUrl(url) {
  const path = url.replace(BASE, '');
  // Exclure les pages non-produits
  if (!path.endsWith('.html')) return 'other';
  if (path.includes('blog') || path.includes('customer') || path.includes('cookie') ||
      path.includes('newsletter') || path.includes('checkout') || path.includes('footer') ||
      path.includes('home-v2')) return 'other';

  // Pages catégories : ont un / dans le chemin (sous-catégories) ou pas de chiffre long
  const segments = path.split('/').filter(s => s);
  if (segments.length >= 2) {
    // Sous-catégorie ou produit dans une catégorie
    // Les produits ont souvent un pattern avec des chiffres à la fin: xxx-000-0000.html
    const last = segments[segments.length - 1];
    if (last.match(/\d{3}-\d{4}\.html$/)) return 'product';
    return 'category'; // sous-catégorie
  }

  // Pages racine
  const filename = segments[0] || '';
  if (filename.match(/\d{3}-\d{4}\.html$/)) return 'product';
  // Certains produits n'ont pas ce pattern mais ont un nom long avec des tirets
  if (filename.split('-').length > 4 && filename.match(/\d/)) return 'product';
  return 'category';
}

// Scraper une page produit individuelle
async function scrapeProductPage(page, url) {
  const info = await page.evaluate(() => {
    // Nom du produit
    const h1 = document.querySelector('h1, .page-title, .product-info-main h1');
    const name = h1 ? h1.textContent.trim() : '';

    // SKU/Référence
    const skuEl = document.querySelector('[itemprop="sku"], .product-info-stock-sku .value, .sku .value, [data-sku]');
    const sku = skuEl ? (skuEl.getAttribute('data-sku') || skuEl.textContent.trim()) : '';

    // Prix final
    const finalPriceEl = document.querySelector('[data-price-type="finalPrice"] .price, .special-price .price, .price-final_price .price');
    let price = null;
    if (finalPriceEl) {
      price = parseFloat(finalPriceEl.textContent.replace(/[^0-9.,]/g, '').replace(',', '.'));
      if (isNaN(price)) price = null;
    }
    // Fallback: premier .price
    if (price === null) {
      const anyPrice = document.querySelector('.price');
      if (anyPrice) {
        price = parseFloat(anyPrice.textContent.replace(/[^0-9.,]/g, '').replace(',', '.'));
        if (isNaN(price)) price = null;
      }
    }

    // Prix barré (original)
    const oldPriceEl = document.querySelector('[data-price-type="oldPrice"] .price, .old-price .price');
    let oldPrice = null;
    if (oldPriceEl) {
      oldPrice = parseFloat(oldPriceEl.textContent.replace(/[^0-9.,]/g, '').replace(',', '.'));
      if (isNaN(oldPrice)) oldPrice = null;
    }

    // Réduction
    const discountEl = document.querySelector('.discount');
    let discount = null;
    if (discountEl) {
      const m = discountEl.textContent.match(/-?\d+/);
      if (m) discount = Math.abs(parseInt(m[0]));
    }

    // Catégorie depuis breadcrumbs
    const breadcrumbs = document.querySelectorAll('.breadcrumbs a, nav.breadcrumb a');
    const category = Array.from(breadcrumbs).slice(1, -1).map(a => a.textContent.trim()).join(' > ');

    // Marque
    const brandEl = document.querySelector('[itemprop="brand"], .product-brand, .product-info-brand');
    const brand = brandEl ? brandEl.textContent.trim() : '';

    return { name, sku, price, oldPrice, discount, category, brand };
  });

  return info;
}

// Scraper une page catégorie (grille produits)
async function scrapeCategoryPage(page, url) {
  const products = await page.evaluate(() => {
    const items = [];
    document.querySelectorAll('form.product-item').forEach(el => {
      const h3 = el.querySelector('h3');
      const linkEl = el.querySelector('a.product-item-link');
      const sku = el.getAttribute('data-sku') || '';

      // Prix final
      const finalEl = el.querySelector('[data-price-type="finalPrice"] .price, .special-price .price, .price');
      let price = null;
      if (finalEl) {
        price = parseFloat(finalEl.textContent.replace(/[^0-9.,]/g, '').replace(',', '.'));
        if (isNaN(price)) price = null;
      }

      // Prix barré
      const oldEl = el.querySelector('[data-price-type="oldPrice"] .price, .old-price .price');
      let oldPrice = null;
      if (oldEl) {
        oldPrice = parseFloat(oldEl.textContent.replace(/[^0-9.,]/g, '').replace(',', '.'));
        if (isNaN(oldPrice)) oldPrice = null;
      }

      // Réduction
      const discountEl = el.querySelector('.discount');
      let discount = null;
      if (discountEl) {
        const m = discountEl.textContent.match(/-?\d+/);
        if (m) discount = Math.abs(parseInt(m[0]));
      }

      const name = h3 ? h3.textContent.trim() : '';
      const productUrl = (linkEl && linkEl.href) ? linkEl.href : '';

      if (name && name.length > 2 && price !== null) {
        items.push({ name, price, ref: sku, oldPrice, discount, url: productUrl });
      }
    });
    return items;
  });

  return products;
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

function addProduct(p) {
  const key = (p.name || '') + '|' + (p.ref || '');
  if (!allProducts[key]) {
    allProducts[key] = p;
    return true;
  }
  // Mettre à jour si on a maintenant un prix promo
  if (p.oldPrice && !allProducts[key].oldPrice) {
    allProducts[key].oldPrice = p.oldPrice;
    allProducts[key].discount = p.discount;
  }
  return false;
}

async function importToJadomi(products) {
  if (DRY_RUN) { log(`DRY RUN: ${products.length} produits NON importés`); return 0; }
  const chunkSize = 500;
  let imported = 0;
  for (let i = 0; i < products.length; i += chunkSize) {
    const chunk = products.slice(i, i + chunkSize);
    const bn = Math.floor(i / chunkSize) + 1;
    const tb = Math.ceil(products.length / chunkSize);
    const data = JSON.stringify({
      source: 'megadental',
      products: chunk.map(p => ({
        name: p.name, price: p.price, ref: p.ref || '',
        price_original: p.oldPrice || null,
        discount: p.discount || null,
        category: p.category || null,
        url: p.url || null
      })),
      page: `mega-sitemap-batch-${bn}`
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
  return imported;
}

async function main() {
  log('=== JADOMI Scraper Mega Dental — SITEMAP COMPLET ===\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });
    await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

    // Warm up
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
    await waitCF(page);

    // Phase 1: Récupérer toutes les URLs du sitemap
    const sitemapUrls = await fetchSitemapUrls(page);
    log(`Total sitemap: ${sitemapUrls.length} URLs\n`);

    // Classifier
    const categories = [];
    const productUrls = [];
    const others = [];
    sitemapUrls.forEach(url => {
      const type = classifyUrl(url);
      if (type === 'category') categories.push(url);
      else if (type === 'product') productUrls.push(url);
      else others.push(url);
    });

    log(`Classification: ${categories.length} catégories, ${productUrls.length} produits, ${others.length} autres`);
    log(`Exemples catégories: ${categories.slice(0, 5).map(u => u.replace(BASE, '')).join(', ')}`);
    log(`Exemples produits: ${productUrls.slice(0, 5).map(u => u.replace(BASE, '')).join(', ')}\n`);

    // Phase 2: Scraper les catégories (avec pagination) — plus efficace
    log('PHASE 2: Scraping des catégories...');
    const visitedCats = new Set();
    let catIdx = 0;
    for (const catUrl of categories) {
      const path = catUrl.replace(BASE, '');
      if (visitedCats.has(path)) continue;
      visitedCats.add(path);
      catIdx++;

      try {
        await page.goto(catUrl, { waitUntil: 'networkidle2', timeout: 25000 });
        if (!await waitCF(page)) continue;

        const products = await scrapeCategoryPage(page, catUrl);
        let added = 0;
        products.forEach(p => { if (addProduct(p)) added++; });

        const maxPage = await getMaxPage(page);

        // Pages suivantes
        for (let p = 2; p <= maxPage; p++) {
          try {
            await page.goto(catUrl + '?p=' + p, { waitUntil: 'networkidle2', timeout: 25000 });
            if (!await waitCF(page)) break;
            const prods = await scrapeCategoryPage(page, catUrl);
            prods.forEach(p => { if (addProduct(p)) added++; });
          } catch(e) {}
          await new Promise(r => setTimeout(r, 300));
        }

        if (added > 0) log(`  CAT ${path.padEnd(60)} ${maxPage}p +${String(added).padStart(4)} total=${Object.keys(allProducts).length}`);
      } catch(e) {}

      if (catIdx % 50 === 0) {
        log(`--- ${catIdx}/${categories.length} catégories, ${Object.keys(allProducts).length} produits ---`);
        // Sauvegarder progrès
        fs.writeFileSync('/home/ubuntu/jadomi/tmp/mega-sitemap-progress.json', JSON.stringify(Object.values(allProducts)));
      }

      await new Promise(r => setTimeout(r, 200));
    }

    log(`\nCatégories terminées: ${Object.keys(allProducts).length} produits\n`);

    // Phase 3: Scraper les pages produits individuelles non encore capturées
    log('PHASE 3: Pages produits individuelles...');
    const knownNames = new Set(Object.values(allProducts).map(p => p.name));
    let productIdx = 0;
    let newFromProducts = 0;

    for (const prodUrl of productUrls) {
      productIdx++;
      if (productIdx % 200 === 0) {
        log(`--- Produits: ${productIdx}/${productUrls.length}, nouveaux: ${newFromProducts}, total: ${Object.keys(allProducts).length} ---`);
        fs.writeFileSync('/home/ubuntu/jadomi/tmp/mega-sitemap-progress.json', JSON.stringify(Object.values(allProducts)));
      }

      try {
        await page.goto(prodUrl, { waitUntil: 'networkidle2', timeout: 20000 });
        if (!await waitCF(page)) continue;

        const info = await scrapeProductPage(page, prodUrl);
        if (info.name && info.price !== null) {
          info.url = prodUrl;
          if (addProduct(info)) {
            newFromProducts++;
          }
        }
      } catch(e) {}

      await new Promise(r => setTimeout(r, 150));
    }

    // Résultats
    const products = Object.values(allProducts);
    log(`\n====================================================`);
    log(`SCRAPING SITEMAP COMPLET: ${products.length} produits uniques en ${elapsed()}`);
    log(`  - Via catégories: ${products.length - newFromProducts}`);
    log(`  - Via pages produits: ${newFromProducts}`);
    log(`====================================================\n`);

    // Stats promos
    const withPromo = products.filter(p => p.oldPrice);
    log(`Produits en promo: ${withPromo.length} (${Math.round(withPromo.length/products.length*100)}%)`);
    withPromo.slice(0, 5).forEach(p => {
      log(`  ${p.name.substring(0, 40).padEnd(40)} ${p.price}€ (au lieu de ${p.oldPrice}€, -${p.discount}%)`);
    });

    // Backup
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(products, null, 2));
    log(`\nBackup: ${BACKUP_FILE}`);

    // Import
    log('\n--- Import Supabase ---');
    const imported = await importToJadomi(products);
    log(`Import: ${imported}/${products.length}`);

  } catch (e) {
    log(`ERREUR: ${e.message}`);
    console.error(e);
  } finally {
    await browser.close();
  }

  log(`\nTerminé en ${elapsed()}`);
}

main();
