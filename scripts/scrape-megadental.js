#!/usr/bin/env node
// JADOMI — Scraper Mega Dental via Puppeteer Stealth
// Usage: node scripts/scrape-megadental.js [--dry-run]
// Pas besoin de login : les prix sont publics

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const http = require('http');
const fs = require('fs');

const BASE = 'https://www.megadental.fr';
const IMPORT_URL = 'http://127.0.0.1:3001/api/scan/import-prices';
const DRY_RUN = process.argv.includes('--dry-run');

const CATEGORIES = [
  { url: '/usage-unique.html', name: 'Usage unique' },
  { url: '/instrumentation.html', name: 'Instrumentation' },
  { url: '/restauration.html', name: 'Restauration' },
  { url: '/equipement.html', name: 'Equipement' },
  { url: '/specialites.html', name: 'Specialites' },
  { url: '/divers-4/radiographie.html', name: 'Radiographie' },
  { url: '/dermo-cosmetique.html', name: 'Dermo-cosmetique' },
  { url: '/produits-liberte.html', name: 'Produits liberte' },
  { url: '/offres-fabricants.html', name: 'Offres fabricants' },
  { url: '/offres-lots.html', name: 'Offres lots' },
  { url: '/destockage.html', name: 'Destockage' }
];

const startTime = Date.now();
const allProducts = {};

function elapsed() { return Math.round((Date.now() - startTime) / 1000) + 's'; }
function log(msg) { console.log(`[JADOMI ${elapsed()}] ${msg}`); }

async function extractProducts(page, category) {
  return page.evaluate((cat) => {
    const items = [];
    document.querySelectorAll('form.product-item').forEach(el => {
      const h3El = el.querySelector('h3');
      const linkEl = el.querySelector('a.product-item-link');
      const priceEl = el.querySelector('.price');
      const sku = el.getAttribute('data-sku') || '';
      const id = el.getAttribute('data-id') || '';

      // Nom : prendre le h3 (propre) plutôt que le lien (contient "Réf. XXX")
      let name = '';
      if (h3El) {
        name = h3El.textContent.trim();
      } else if (linkEl) {
        name = linkEl.textContent.trim().split('\n')[0].trim();
      }

      let price = null;
      if (priceEl) {
        const raw = priceEl.textContent.replace(/[^0-9.,]/g, '').replace(',', '.');
        price = parseFloat(raw);
        if (isNaN(price)) price = null;
      }

      // URL du produit
      let url = '';
      if (linkEl && linkEl.href) url = linkEl.href;

      if (name && name.length > 3 && price !== null) {
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
      // Le texte est "Page\n  2" — extraire le chiffre avec regex
      const match = a.textContent.match(/(\d+)/);
      if (match) {
        const n = parseInt(match[1]);
        if (n > max) max = n;
      }
      // Aussi vérifier le href (?p=X)
      const href = a.getAttribute('href') || '';
      const hMatch = href.match(/[?&]p=(\d+)/);
      if (hMatch) {
        const n = parseInt(hMatch[1]);
        if (n > max) max = n;
      }
    });
    return max;
  });
}

async function scrapeCategory(page, cat) {
  const fullUrl = BASE + cat.url;
  log(`Categorie: ${cat.name} (${cat.url})`);

  try {
    await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  } catch (e) {
    log(`  ERREUR chargement: ${e.message}`);
    return 0;
  }

  // Vérifier Cloudflare
  let title = await page.title();
  if (title.includes('moment') || title.includes('security')) {
    log('  Cloudflare challenge, attente...');
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1000));
      title = await page.title();
      if (!title.includes('moment') && !title.includes('security')) break;
    }
  }

  // Page 1
  const products1 = await extractProducts(page, cat.name);
  let catAdded = 0;
  for (const p of products1) {
    const key = p.name + '|' + p.ref;
    if (!allProducts[key]) { allProducts[key] = p; catAdded++; }
  }

  const maxPage = await getMaxPage(page);
  log(`  Page 1/${maxPage} — +${catAdded} produits (${products1.length} sur la page)`);

  // Pages suivantes
  for (let p = 2; p <= maxPage; p++) {
    try {
      await page.goto(fullUrl + '?p=' + p, { waitUntil: 'networkidle2', timeout: 30000 });

      // Cloudflare check
      title = await page.title();
      if (title.includes('moment') || title.includes('security')) {
        for (let i = 0; i < 15; i++) {
          await new Promise(r => setTimeout(r, 1000));
          title = await page.title();
          if (!title.includes('moment') && !title.includes('security')) break;
        }
      }

      const products = await extractProducts(page, cat.name);
      let added = 0;
      for (const prod of products) {
        const key = prod.name + '|' + prod.ref;
        if (!allProducts[key]) { allProducts[key] = prod; added++; }
      }
      catAdded += added;
      log(`  Page ${p}/${maxPage} — +${added} (total cat: ${catAdded})`);
    } catch (e) {
      log(`  ERREUR page ${p}: ${e.message}`);
    }
    // Pause anti-flood
    await new Promise(r => setTimeout(r, 800));
  }

  log(`  ${cat.name} TERMINE: ${catAdded} produits`);
  return catAdded;
}

async function importToJadomi(products) {
  if (DRY_RUN) {
    log(`DRY RUN: ${products.length} produits NON importes`);
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
      page: `mega-server-batch-${batchNum}`
    });

    try {
      const result = await new Promise((resolve, reject) => {
        const url = new URL(IMPORT_URL);
        const req = http.request({
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        }, (res) => {
          let body = '';
          res.on('data', d => body += d);
          res.on('end', () => {
            try { resolve(JSON.parse(body)); } catch (e) { resolve({ imported: 0, raw: body }); }
          });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
      });

      imported += result.imported || 0;
      log(`  Import lot ${batchNum}/${totalBatches}: ${result.imported || 0} importes`);
    } catch (e) {
      log(`  ERREUR import lot ${batchNum}: ${e.message}`);
    }
  }

  return imported;
}

async function main() {
  log('=== JADOMI Scraper Mega Dental ===');
  log(`Mode: ${DRY_RUN ? 'DRY RUN (pas d\'import)' : 'PRODUCTION (import Supabase)'}`);
  log(`Categories: ${CATEGORIES.length}\n`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // Warm up: page d'accueil pour les cookies Cloudflare
    log('Chargement accueil (cookies Cloudflare)...');
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
    let title = await page.title();
    if (title.includes('moment') || title.includes('security')) {
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 1000));
        title = await page.title();
        if (!title.includes('moment') && !title.includes('security')) break;
      }
    }
    log('Accueil OK: ' + title + '\n');

    // Scrape toutes les categories
    for (const cat of CATEGORIES) {
      await scrapeCategory(page, cat);
    }

    const products = Object.values(allProducts);
    log(`\n========================================`);
    log(`SCRAPING TERMINE: ${products.length} produits uniques en ${elapsed()}`);
    log(`========================================\n`);

    // Backup JSON local
    const backupPath = `/home/ubuntu/jadomi/tmp/megadental-${new Date().toISOString().slice(0, 10)}.json`;
    fs.writeFileSync(backupPath, JSON.stringify(products, null, 2));
    log(`Backup local: ${backupPath}`);

    // Stats par categorie
    const byCat = {};
    products.forEach(p => { byCat[p.category] = (byCat[p.category] || 0) + 1; });
    log('\nRepartition par categorie:');
    Object.entries(byCat).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
      log(`  ${String(count).padStart(5)} — ${cat}`);
    });

    // Apercu
    log('\nApercu (10 premiers):');
    products.slice(0, 10).forEach(p => {
      log(`  ${String(p.price.toFixed(2)).padStart(8)} EUR — ${p.ref.padEnd(20)} — ${p.name.substring(0, 60)}`);
    });

    // Import Supabase
    log('\n--- Import Supabase ---');
    const imported = await importToJadomi(products);
    log(`Import final: ${imported}/${products.length} dans scraped_prices`);

  } catch (e) {
    log(`ERREUR FATALE: ${e.message}`);
    console.error(e);
  } finally {
    await browser.close();
  }

  log(`\nTermine en ${elapsed()}`);
}

main();
