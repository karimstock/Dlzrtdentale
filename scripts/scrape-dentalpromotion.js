#!/usr/bin/env node
// =============================================
// JADOMI — Dental Promotion & Innovation Scraper
//
// Site Drupal Commerce avec JSON-LD sur chaque page produit
// 7981 URLs dans le sitemap — scraping pur HTTP sans Puppeteer
//
// Usage: node scripts/scrape-dentalpromotion.js
// =============================================

const fs = require('fs');
const https = require('https');
const http = require('http');
const nodemailer = require('nodemailer');

const PROGRESS_FILE = '/tmp/dentalpromotion-progress.json';
const LOG_FILE = '/tmp/dentalpromotion-scraper.log';

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
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'text/html' },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        fetchHTML(res.headers.location).then(resolve);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
    catch (e) {}
  }
  return { products: {}, completedUrls: [], urls: [] };
}

function saveProgress(progress) {
  progress.lastSaved = new Date().toISOString();
  // Save without products to keep file small, products in separate file
  const slim = { completedUrls: progress.completedUrls, urls: progress.urls, lastSaved: progress.lastSaved };
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(slim));
}

// =============================================
// PHASE 1: Get all product URLs from sitemap
// =============================================

async function getAllProductUrls() {
  log('Phase 1: Lecture du sitemap...');
  const urls = [];
  const exclude = /shop\/cat|sitemap|user|node\/|contact|mentions|cgv|connexion|panier|mon-compte|blog|actualite|taxonomy|media|system|captcha/;

  for (let page = 1; page <= 10; page++) {
    const xml = await fetchHTML(`https://www.dentalpromotion.fr/sitemap.xml?page=${page}`);
    if (!xml || xml.length < 100) break;

    const matches = xml.match(/https:\/\/www\.dentalpromotion\.fr\/[^<]+/g) || [];
    const productUrls = matches.filter(u => !exclude.test(u) && u !== 'https://www.dentalpromotion.fr/' && u !== 'https://www.dentalpromotion.fr/shop');
    urls.push(...productUrls);
    log(`  Sitemap page ${page}: ${productUrls.length} product URLs`);
  }

  log(`  Total: ${urls.length} product URLs`);
  return urls;
}

// =============================================
// PHASE 2: Scrape each product page (JSON-LD)
// =============================================

function extractJsonLd(html) {
  const match = html.match(/<script type="application\/ld\+json">({[^<]+})<\/script>/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    if (data['@type'] !== 'Product') return null;
    return {
      name: data.name || '',
      sku: data.sku || data.mpn || '',
      brand: data.brand?.name || '',
      price: data.offers?.price || null,
      currency: data.offers?.priceCurrency || 'EUR',
      inStock: data.offers?.availability?.includes('InStock') || false,
      url: data.offers?.url || '',
      image: Array.isArray(data.image) ? data.image[0] : data.image || '',
    };
  } catch (e) {
    return null;
  }
}

// =============================================
// MAIN
// =============================================

async function main() {
  log('╔══════════════════════════════════════════════════════════╗');
  log('║  DENTAL PROMOTION & INNOVATION — Scraper JSON-LD       ║');
  log('║  ~8000 produits via sitemap + JSON-LD structuré         ║');
  log('╚══════════════════════════════════════════════════════════╝');

  const progress = loadProgress();
  const completedSet = new Set(progress.completedUrls || []);

  // Get URLs
  const urls = progress.urls?.length > 100 ? progress.urls : await getAllProductUrls();
  progress.urls = urls;

  const pendingUrls = urls.filter(u => !completedSet.has(u));
  log(`URLs totales: ${urls.length} | Déjà faites: ${completedSet.size} | Restantes: ${pendingUrls.length}`);

  const products = [];
  let errors = 0;
  const startTime = Date.now();

  // Scrape in batches of 5 concurrent requests
  const CONCURRENCY = 5;
  for (let i = 0; i < pendingUrls.length; i += CONCURRENCY) {
    const batch = pendingUrls.slice(i, i + CONCURRENCY);

    const results = await Promise.all(batch.map(async (url) => {
      const html = await fetchHTML(url);
      if (!html) return null;

      const product = extractJsonLd(html);
      if (product && product.name) {
        product.sourceUrl = url;
        completedSet.add(url);
        return product;
      }
      completedSet.add(url);
      return null;
    }));

    for (const p of results) {
      if (p) products.push(p);
      else errors++;
    }

    // Progress log every 100
    if ((i + CONCURRENCY) % 100 < CONCURRENCY || i + CONCURRENCY >= pendingUrls.length) {
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      const rate = ((i + CONCURRENCY) / ((Date.now() - startTime) / 1000)).toFixed(1);
      log(`  [${Math.min(i + CONCURRENCY, pendingUrls.length)}/${pendingUrls.length}] ${products.length} produits | ${elapsed}min | ${rate} req/s | ${errors} err`);
    }

    // Save every 500
    if ((i + CONCURRENCY) % 500 < CONCURRENCY) {
      progress.completedUrls = Array.from(completedSet);
      saveProgress(progress);

      // Import batch to Supabase
      if (products.length >= 500) {
        await importBatch(products.splice(0, 500));
      }
    }

    await new Promise(r => setTimeout(r, 200)); // 200ms between batches of 5
  }

  // Final save & import
  progress.completedUrls = Array.from(completedSet);
  saveProgress(progress);

  if (products.length > 0) {
    await importBatch(products);
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const totalProducts = completedSet.size - errors;

  log('\n═══════════════════════════════════════════════');
  log(`DENTAL PROMOTION TERMINÉ en ${elapsed} min`);
  log(`Produits: ${totalProducts}`);
  log(`Erreurs: ${errors}`);
  log('═══════════════════════════════════════════════');

  // Email
  try {
    await transporter.sendMail({
      from: 'JADOMI Engine <noreply@jadomi.fr>',
      to: 'karim_bahmed@yahoo.fr',
      subject: `🦷 Dental Promotion: ${totalProducts} produits scrapés`,
      html: `<h2>Dental Promotion & Innovation</h2><p>${totalProducts} produits, ${elapsed} min</p>`,
    });
  } catch (e) {}
}

async function importBatch(products) {
  const items = products.map(p => ({
    name: p.name,
    brand: p.brand,
    ref: p.sku,
    price: p.price,
    price_original: p.price, // DentalPromo doesn't show original price in JSON-LD
    url: p.sourceUrl,
  }));

  const postData = JSON.stringify({ source: 'dentalpromotion', products: items });
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

main().catch(err => {
  log(`ERREUR FATALE: ${err.message}`);
  process.exit(1);
});
