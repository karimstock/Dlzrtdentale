#!/usr/bin/env node
// =============================================
// JADOMI — DoctorStrong JSON-LD Scraper
//
// Visite les 7142 URLs du sitemap DoctorAI
// et extrait les données produit via JSON-LD structuré
// SANS Puppeteer — HTTP pur, 5 requêtes concurrentes
//
// Usage: node scripts/scrape-doctorstrong-jsonld.js
// =============================================

const fs = require('fs');
const https = require('https');
const http = require('http');
const nodemailer = require('nodemailer');

const PROGRESS_FILE = '/tmp/doctorstrong-jsonld-progress.json';
const LOG_FILE = '/tmp/doctorstrong-jsonld.log';
const URLS_FILE = '/tmp/doctorstrong-urls.txt';

const transporter = nodemailer.createTransport({
  host: 'pro2.mail.ovh.net', port: 587, secure: false,
  auth: { user: 'noreply@jadomi.fr', pass: '1987@Louiza' },
});

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function fetchHTML(url) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

function extractProducts(html) {
  const products = [];
  const matches = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/g) || [];

  for (const m of matches) {
    const json = m.replace(/<script[^>]+>/, '').replace(/<\/script>/, '');
    try {
      const data = JSON.parse(json);

      // Direct Product type
      if (data['@type'] === 'Product') {
        products.push(extractProduct(data));
      }

      // Graph with Product
      if (data['@graph']) {
        for (const node of data['@graph']) {
          if (node['@type'] === 'Product') {
            products.push(extractProduct(node));
          }
        }
      }
    } catch (e) {}
  }

  // Also extract variant/configurable products from page HTML
  // DoctorAI uses Magento's swatch system
  const swatchMatch = html.match(/jsonSwatchConfig[^{]*({[^;]+})/);
  if (swatchMatch) {
    try {
      const swatchData = JSON.parse(swatchMatch[1]);
      // Extract variant info if available
    } catch (e) {}
  }

  return products.filter(p => p && p.name);
}

function extractProduct(data) {
  const offers = Array.isArray(data.offers) ? data.offers[0] : data.offers || {};
  return {
    name: data.name || '',
    sku: data.sku || data.mpn || data.productID || '',
    brand: data.brand?.name || '',
    description: (data.description || '').substring(0, 200),
    price: offers.price || offers.lowPrice || null,
    priceCurrency: offers.priceCurrency || 'EUR',
    url: data['@id'] || offers.url || '',
    image: Array.isArray(data.image) ? data.image[0] : data.image || '',
    inStock: offers.availability?.includes('InStock') || false,
  };
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
    catch (e) {}
  }
  return { completedUrls: [], totalProducts: 0 };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
}

async function importBatch(products) {
  const items = products.map(p => ({
    name: p.name, brand: p.brand, ref: p.sku,
    price: p.price, price_original: p.price,
    url: p.sourceUrl || p.url,
  }));
  const postData = JSON.stringify({ source: 'doctorstrong', products: items });
  try {
    await new Promise((resolve, reject) => {
      const req = http.request('http://localhost:3001/api/scan/import-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
        timeout: 30000,
      }, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
    log(`  Import: ${items.length} produits OK`);
  } catch (e) {
    log(`  Import erreur: ${e.message}`);
  }
}

async function main() {
  log('╔══════════════════════════════════════════════════════════╗');
  log('║  DoctorStrong JSON-LD SCRAPER — 7142 URLs sitemap          ║');
  log('║  HTTP pur, pas de Puppeteer                             ║');
  log('╚══════════════════════════════════════════════════════════╝');

  // Load URLs from existing sitemap file or fetch
  let urls;
  if (fs.existsSync(URLS_FILE)) {
    urls = fs.readFileSync(URLS_FILE, 'utf8').trim().split('\n').filter(u => u.endsWith('.html') && !u.includes('/blog/'));
  } else {
    log('Fetching sitemap...');
    urls = [];
    for (let i = 1; i <= 3; i++) {
      const xml = await fetchHTML(`https://www.doctorstrong.fr/media/sitemap_35-9-${i}.xml`);
      const matches = xml.match(/https:\/\/www\.doctor-ai\.fr\/[^<]+/g) || [];
      urls.push(...matches.filter(u => u.endsWith('.html')));
    }
    fs.writeFileSync(URLS_FILE, urls.join('\n'));
  }

  log(`URLs totales: ${urls.length}`);

  const progress = loadProgress();
  const completedSet = new Set(progress.completedUrls || []);
  const pendingUrls = urls.filter(u => !completedSet.has(u));
  log(`Déjà faites: ${completedSet.size} | Restantes: ${pendingUrls.length}`);

  const allProducts = [];
  let errors = 0;
  const startTime = Date.now();
  const CONCURRENCY = 5;

  for (let i = 0; i < pendingUrls.length; i += CONCURRENCY) {
    const batch = pendingUrls.slice(i, i + CONCURRENCY);

    const results = await Promise.all(batch.map(async (url) => {
      const html = await fetchHTML(url);
      completedSet.add(url);
      if (!html) return [];
      const products = extractProducts(html);
      products.forEach(p => p.sourceUrl = url);
      return products;
    }));

    for (const prods of results) {
      if (prods.length > 0) allProducts.push(...prods);
      else errors++;
    }

    if ((i + CONCURRENCY) % 100 < CONCURRENCY) {
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      log(`  [${Math.min(i + CONCURRENCY, pendingUrls.length)}/${pendingUrls.length}] ${allProducts.length} produits | ${elapsed}min | ${errors} err`);
    }

    if ((i + CONCURRENCY) % 500 < CONCURRENCY) {
      progress.completedUrls = Array.from(completedSet);
      progress.totalProducts = allProducts.length;
      saveProgress(progress);
      if (allProducts.length >= 500) {
        await importBatch(allProducts.splice(0, 500));
      }
    }

    await new Promise(r => setTimeout(r, 150));
  }

  // Final
  progress.completedUrls = Array.from(completedSet);
  saveProgress(progress);
  if (allProducts.length > 0) await importBatch(allProducts);

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  log(`\nDoctorStrong JSON-LD TERMINÉ: ${progress.totalProducts + allProducts.length} produits en ${elapsed}min`);

  try {
    await transporter.sendMail({
      from: 'JADOMI Engine <noreply@jadomi.fr>', to: 'karim_bahmed@yahoo.fr',
      subject: `🦷 DoctorStrong JSON-LD: ${progress.totalProducts} produits`,
      html: `<h2>DoctorStrong JSON-LD</h2><p>${progress.totalProducts} produits, ${elapsed} min, ${urls.length} URLs</p>`,
    });
  } catch (e) {}
}

main().catch(err => { log(`FATAL: ${err.message}`); process.exit(1); });
