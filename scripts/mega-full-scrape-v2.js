#!/usr/bin/env node
// JADOMI — Scraper COMPLET Mega Dental v2
// Crawl en profondeur : homepage → catégories → sous-catégories → sous-sous-catégories
// + Pagination complète pour chaque catégorie

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const http = require('http');
const fs = require('fs');

const BASE = 'https://www.megadental.fr';
const IMPORT_URL = 'http://127.0.0.1:3001/api/scan/import-prices';
const DRY_RUN = process.argv.includes('--dry-run');

const BACKUP_FILE = '/home/ubuntu/jadomi/tmp/megadental-full-v2-' + new Date().toISOString().slice(0, 10) + '.json';

const startTime = Date.now();
const allProducts = {};
const visitedUrls = new Set();
const discoveredCats = new Set();

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

      let url = (linkEl && linkEl.href) ? linkEl.href : '';

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

// Extraire les liens catégories d'une page
async function findCategoryLinks(page) {
  return page.evaluate((base) => {
    const urls = new Set();
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.href;
      if (href && href.startsWith(base) && href.endsWith('.html') &&
          !href.includes('customer') && !href.includes('checkout') &&
          !href.includes('blog') && !href.includes('cookie') &&
          !href.includes('wishlist') && !href.includes('newsletter') &&
          !href.includes('cart') && !href.includes('#')) {
        urls.add(href.replace(base, ''));
      }
    });
    return Array.from(urls);
  }, BASE);
}

async function scrapeCatPage(page, fullUrl, catName) {
  let added = 0;
  const products = await extractProducts(page, catName);
  for (const p of products) {
    const key = p.name + '|' + p.ref;
    if (!allProducts[key]) { allProducts[key] = p; added++; }
  }
  return added;
}

async function scrapeCategory(page, catUrl) {
  if (visitedUrls.has(catUrl)) return 0;
  visitedUrls.add(catUrl);

  const fullUrl = BASE + catUrl;
  const catName = catUrl.replace(/\.html$/, '').replace(/^\//,'').replace(/\//g, ' > ');

  try {
    await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (e) { return 0; }

  if (!await waitCF(page)) return 0;

  // Vérifier s'il y a des produits
  const productCount = await page.evaluate(() => document.querySelectorAll('form.product-item').length);
  if (productCount === 0) return 0;

  let catAdded = await scrapeCatPage(page, fullUrl, catName);
  const maxPage = await getMaxPage(page);

  // Pages 2+
  for (let p = 2; p <= maxPage; p++) {
    try {
      await page.goto(fullUrl + '?p=' + p, { waitUntil: 'networkidle2', timeout: 25000 });
      if (!await waitCF(page)) break;
      catAdded += await scrapeCatPage(page, fullUrl, catName);
    } catch (e) { /* skip page */ }
    await new Promise(r => setTimeout(r, 300));
  }

  if (catAdded > 0) {
    log(`  ${catUrl.padEnd(70)} ${maxPage}p  +${String(catAdded).padStart(4)}  total=${Object.keys(allProducts).length}`);
  }

  return catAdded;
}

async function main() {
  log('=== JADOMI Scraper Mega Dental v2 — CRAWL PROFOND ===\n');

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

    // Phase 1 : Découverte des catégories via crawl en profondeur
    log('PHASE 1: Découverte des catégories...');

    // Catégories racines connues (de notre exploration précédente)
    const rootCategories = [
      '/usage-unique.html',
      '/instrumentation.html',
      '/restauration.html',
      '/equipement.html',
      '/specialites.html',
      '/divers-4.html',
      '/endodontie.html',
      '/parodontie.html',
      '/prothese.html',
      '/fraises-polissage.html',
      '/desinfection-sterilisation.html',
      '/amenagement-du-cabinet.html',
      '/dermo-cosmetique.html',
      '/produits-liberte.html',
      '/produits-ecologiques.html',
      '/made-in-france.html',
      '/offres-fabricants.html',
      '/offres-lots.html',
      '/destockage.html',
      '/marques-coup-de-coeur.html',
      '/edgetaper-blaze-utopia.html'
    ];

    // Visiter chaque racine pour collecter les sous-catégories
    for (const root of rootCategories) {
      try {
        await page.goto(BASE + root, { waitUntil: 'networkidle2', timeout: 30000 });
        if (!await waitCF(page)) continue;
        const links = await findCategoryLinks(page);
        links.forEach(l => discoveredCats.add(l));
      } catch(e) {}
      await new Promise(r => setTimeout(r, 200));
    }

    // Visiter aussi la homepage et le menu
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
    await waitCF(page);
    const menuBtn = await page.$('button[aria-label*="menu"], .menu-toggle, .nav-toggle');
    if (menuBtn) { try { await menuBtn.click(); await new Promise(r => setTimeout(r, 2000)); } catch(e) {} }
    const homeLinks = await findCategoryLinks(page);
    homeLinks.forEach(l => discoveredCats.add(l));

    // Filtrer : garder seulement les URLs qui ressemblent à des catégories (avec / ou sans pattern SKU)
    const catUrls = Array.from(discoveredCats).filter(url => {
      // Exclure les pages produits individuelles (contiennent souvent un pattern XXX-XXXX)
      // Mais garder les sous-catégories même si elles ont des tirets
      const segments = url.split('/').filter(s => s);
      const last = segments[segments.length - 1] || '';
      // Si l'URL a un chemin profond (2+ segments), c'est probablement une catégorie
      if (segments.length >= 2) return true;
      // Si c'est un lien root, vérifier que ce n'est pas un produit individuel
      // Les produits individuels ont souvent des motifs comme xxx-xxx-000-0000.html
      if (last.match(/\d{3,}-\d{4,}\.html$/)) return false;
      return true;
    }).sort();

    log(`Catégories découvertes: ${catUrls.length}\n`);

    // Phase 2 : Scraping de toutes les catégories
    log('PHASE 2: Scraping de toutes les catégories...');
    let idx = 0;
    for (const catUrl of catUrls) {
      idx++;
      if (idx % 50 === 0) {
        log(`\n--- ${idx}/${catUrls.length} catégories, ${Object.keys(allProducts).length} produits uniques ---\n`);
        // Sauvegarder le progrès
        fs.writeFileSync('/home/ubuntu/jadomi/tmp/mega-progress-v2.json', JSON.stringify(Object.values(allProducts)));
      }
      await scrapeCategory(page, catUrl);
      await new Promise(r => setTimeout(r, 200));
    }

    // Résultats
    const products = Object.values(allProducts);
    log(`\n====================================================`);
    log(`SCRAPING COMPLET v2: ${products.length} produits uniques en ${elapsed()}`);
    log(`Catégories visitées: ${visitedUrls.size}/${catUrls.length}`);
    log(`====================================================\n`);

    // Backup
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(products, null, 2));
    log(`Backup: ${BACKUP_FILE}`);

    // Stats par catégorie de premier niveau
    const byCat = {};
    products.forEach(p => {
      const topCat = (p.category || '?').split(' > ')[0] || '?';
      byCat[topCat] = (byCat[topCat] || 0) + 1;
    });
    log('\nPar catégorie:');
    Object.entries(byCat).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
      log(`  ${String(count).padStart(5)} — ${cat}`);
    });

    // Exemples
    log('\n10 exemples avec référence:');
    products.filter(p => p.ref).slice(0, 10).forEach(p => {
      log(`  REF=${p.ref.padEnd(25)} ${String(p.price.toFixed(2)).padStart(10)} EUR  ${p.name.substring(0, 50)}`);
    });

    // Import Supabase
    log('\n--- Import Supabase ---');
    if (!DRY_RUN) {
      const chunkSize = 500;
      let imported = 0;
      for (let i = 0; i < products.length; i += chunkSize) {
        const chunk = products.slice(i, i + chunkSize);
        const bn = Math.floor(i / chunkSize) + 1;
        const tb = Math.ceil(products.length / chunkSize);
        const data = JSON.stringify({
          source: 'megadental', products: chunk.map(p => ({ name: p.name, price: p.price, ref: p.ref || '' })),
          page: `mega-full-v2-batch-${bn}`
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
        } catch(e) { log(`  ERR lot ${bn}: ${e.message}`); }
      }
      log(`Import total: ${imported}/${products.length}`);
    } else {
      log(`DRY RUN — ${products.length} produits non importés`);
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
