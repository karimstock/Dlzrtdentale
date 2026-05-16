#!/usr/bin/env node
// =============================================
// JADOMI — DPI (Dental Promotion & Innovation) Scraper
// Site: dentalpromotion.fr — Drupal 10 + Commerce 3
//
// Strategie hybride :
//   Phase 1 : Sitemap XML (5 pages, ~8600 URLs)
//   Phase 2 : HTTP GET + extraction JSON-LD structuré
//   Phase 3 : Fallback Puppeteer pour pages sans JSON-LD
//   Phase 4 : Import vers API locale par lots de 500
//
// Usage:
//   node scripts/scrape-dpi.js [--dry-run] [--resume] [--reset]
//
// Flags:
//   --dry-run   Scrape sans importer vers l'API
//   --resume    Reprendre depuis la progression sauvegardée (défaut)
//   --reset     Effacer la progression et recommencer à zéro
// =============================================

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// --- Configuration ---
const BASE_URL = 'https://www.dentalpromotion.fr';
const SITEMAP_PAGES = 5;
const IMPORT_URL = 'http://127.0.0.1:3001/api/scan/import-prices';
const TMP_DIR = '/home/ubuntu/jadomi/tmp';
const PROGRESS_FILE = path.join(TMP_DIR, 'dpi-progress.json');
const LOG_FILE = '/tmp/dpi-scraper.log';
const CHUNK_SIZE = 500;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const CONCURRENCY = 5; // Parallel HTTP requests (polite)
const DELAY_BETWEEN_BATCHES_MS = 300; // ms between batches of concurrent requests
const SAVE_EVERY = 200; // Save progress every N URLs completed

// --- Flags ---
const DRY_RUN = process.argv.includes('--dry-run');
const RESET = process.argv.includes('--reset');
// --resume is the default behavior (resume unless --reset)

// --- State ---
const startTime = Date.now();
let allProducts = {};
let completedUrls = new Set();
let allUrls = [];
let totalImported = 0;
let errorCount = 0;
let noJsonLdUrls = [];

// --- User agents rotation ---
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// =============================================
// Logging
// =============================================
function elapsed() {
  const s = Math.round((Date.now() - startTime) / 1000);
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
}

function log(msg) {
  const line = `[DPI ${elapsed()}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`);
  } catch (e) { /* ignore */ }
}

function logError(msg, err) {
  log(`ERREUR: ${msg} — ${(err && err.message) || err}`);
}

// =============================================
// Progress management
// =============================================
function loadProgress() {
  if (RESET) {
    log('--reset: progression effacee, demarrage a zero');
    return false;
  }
  try {
    if (!fs.existsSync(PROGRESS_FILE)) return false;
    const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    if (data.products && typeof data.products === 'object') {
      allProducts = data.products;
    }
    if (Array.isArray(data.completedUrls)) {
      completedUrls = new Set(data.completedUrls);
    }
    if (Array.isArray(data.urls) && data.urls.length > 0) {
      allUrls = data.urls;
    }
    if (Array.isArray(data.noJsonLdUrls)) {
      noJsonLdUrls = data.noJsonLdUrls;
    }
    if (data.totalImported) {
      totalImported = data.totalImported;
    }
    const productCount = Object.keys(allProducts).length;
    log(`Reprise: ${productCount} produits, ${completedUrls.size} URLs traitees, ${allUrls.length} URLs totales`);
    return true;
  } catch (e) {
    logError('Lecture progression', e);
    return false;
  }
}

function saveProgress() {
  try {
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
    const data = {
      timestamp: new Date().toISOString(),
      productCount: Object.keys(allProducts).length,
      completedUrlCount: completedUrls.size,
      totalImported,
      urls: allUrls,
      completedUrls: Array.from(completedUrls),
      noJsonLdUrls,
      products: allProducts,
    };
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data));
    log(`Progression sauvegardee: ${data.productCount} produits, ${completedUrls.size}/${allUrls.length} URLs`);
  } catch (e) {
    logError('Sauvegarde progression', e);
  }
}

// =============================================
// HTTP helper — polite HTTPS GET with retries
// =============================================
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchHTML(url, retries = 2) {
  return new Promise((resolve) => {
    const doFetch = (attempt) => {
      const req = https.get(url, {
        headers: {
          'User-Agent': randomUA(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5',
          'Accept-Encoding': 'identity',
          'Connection': 'keep-alive',
        },
        timeout: 20000,
      }, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : BASE_URL + res.headers.location;
          fetchHTML(redirectUrl, 0).then(resolve);
          return;
        }
        if (res.statusCode !== 200) {
          if (attempt < retries) {
            setTimeout(() => doFetch(attempt + 1), RETRY_DELAY);
          } else {
            resolve('');
          }
          // Consume the body to free the socket
          res.resume();
          return;
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
        res.on('error', () => resolve(''));
      });
      req.on('error', () => {
        if (attempt < retries) {
          setTimeout(() => doFetch(attempt + 1), RETRY_DELAY);
        } else {
          resolve('');
        }
      });
      req.on('timeout', () => { req.destroy(); resolve(''); });
    };
    doFetch(0);
  });
}

// =============================================
// Phase 1: Discover all product URLs from sitemap
// =============================================
async function discoverUrls() {
  if (allUrls.length > 100) {
    log(`URLs deja chargees: ${allUrls.length} (depuis progression)`);
    return;
  }

  log('Phase 1 — Decouverte des URLs depuis le sitemap...');
  const urls = [];
  // Exclude non-product patterns
  const excludeRe = /\/shop\/cat\/|\/shop$|sitemap|\/user\/|\/node\/|\/contact|\/mentions|\/cgv|\/connexion|\/panier|\/mon-compte|\/blog|\/actualite|\/taxonomy|\/media\/|\/system\/|\/captcha|\/cookies|\/conditions|\/checkout|\/faq|\/livraison-retour|\/a-propos/;

  for (let page = 1; page <= SITEMAP_PAGES + 2; page++) {
    const xml = await fetchHTML(`${BASE_URL}/sitemap.xml?page=${page}`);
    if (!xml || xml.length < 100) {
      log(`  Sitemap page ${page}: vide ou inaccessible, arret`);
      break;
    }

    // Extract all <loc> URLs
    const matches = xml.match(/https:\/\/www\.dentalpromotion\.fr\/[^<\s]+/g) || [];
    const productUrls = matches.filter(u => {
      return !excludeRe.test(u) &&
        u !== `${BASE_URL}/` &&
        u !== BASE_URL &&
        !u.endsWith('/shop');
    });
    urls.push(...productUrls);
    log(`  Sitemap page ${page}: ${productUrls.length} URLs produit (total: ${urls.length})`);

    await sleep(500);
  }

  // Also discover category pages to extract subcategory URLs later if needed
  const categoryUrls = [];
  for (let page = 1; page <= SITEMAP_PAGES + 2; page++) {
    const xml = await fetchHTML(`${BASE_URL}/sitemap.xml?page=${page}`);
    if (!xml || xml.length < 100) break;
    const catMatches = xml.match(/https:\/\/www\.dentalpromotion\.fr\/shop\/cat\/[^<\s]+/g) || [];
    categoryUrls.push(...catMatches);
  }

  // Deduplicate
  allUrls = [...new Set(urls)];
  log(`Phase 1 terminee: ${allUrls.length} URLs produit uniques, ${categoryUrls.length} categories`);
}

// =============================================
// Phase 2: Extract products from JSON-LD
// =============================================
function extractJsonLdProducts(html, sourceUrl) {
  const products = [];

  // Match ALL JSON-LD scripts (there can be multiple, or an array)
  const scriptRegex = /<script\s+type="application\/ld\+json"\s*>([^<]+)<\/script>/g;
  let match;

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      let parsed = JSON.parse(match[1]);

      // Can be a single object or an array of products (variants)
      if (!Array.isArray(parsed)) {
        parsed = [parsed];
      }

      for (const item of parsed) {
        if (item['@type'] !== 'Product') continue;
        if (!item.name) continue;

        const price = item.offers && item.offers.price
          ? parseFloat(item.offers.price)
          : null;

        if (!price || price <= 0) continue;

        const sku = item.sku || item.mpn || '';
        const brand = (item.brand && item.brand.name) || '';
        const image = Array.isArray(item.image)
          ? item.image[0] || ''
          : item.image || '';
        const inStock = item.offers && item.offers.availability
          ? item.offers.availability.includes('InStock')
          : true;
        const productUrl = (item.offers && item.offers.url) || sourceUrl;
        const description = item.description || '';
        const productID = item.productID || item.id || '';

        products.push({
          name: item.name.trim(),
          ref: sku,
          price,
          brand,
          imageUrl: image,
          url: productUrl,
          description: description.substring(0, 1000),
          inStock,
          productID,
        });
      }
    } catch (e) {
      // JSON parse error — skip this script block
    }
  }

  return products;
}

/**
 * Extract category from the page breadcrumb or meta
 * Drupal Commerce uses breadcrumb with <nav class="breadcrumb">
 */
function extractCategory(html) {
  // Try breadcrumb extraction
  const breadcrumbMatch = html.match(/<nav[^>]*class="[^"]*breadcrumb[^"]*"[^>]*>([\s\S]*?)<\/nav>/i);
  if (breadcrumbMatch) {
    const crumbs = [];
    const linkRegex = /<a[^>]*>([^<]+)<\/a>/g;
    let lm;
    while ((lm = linkRegex.exec(breadcrumbMatch[1])) !== null) {
      const text = lm[1].trim();
      if (text && text.toLowerCase() !== 'accueil' && text.toLowerCase() !== 'home' && text !== 'Boutique') {
        crumbs.push(text);
      }
    }
    if (crumbs.length > 0) return crumbs.join(' > ');
  }

  // Try og:title or page title
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    const title = titleMatch[1].replace(/\s*\|.*$/, '').trim();
    if (title && title.length < 200) return '';
  }

  return '';
}

/**
 * Extract body/description text from Drupal field markup
 * when JSON-LD description is empty
 */
function extractDescription(html) {
  const bodyMatch = html.match(/field--name-body[^>]*>([\s\S]*?)<\/div>/i);
  if (bodyMatch) {
    // Strip HTML tags
    const text = bodyMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length > 5) return text.substring(0, 1000);
  }
  return '';
}

async function scrapeProductUrl(url) {
  const html = await fetchHTML(url);
  if (!html || html.length < 500) {
    errorCount++;
    return [];
  }

  const products = extractJsonLdProducts(html, url);
  if (products.length === 0) {
    // No JSON-LD found — mark for potential Puppeteer fallback
    return null; // null signals "no JSON-LD"
  }

  // Enrich with category and description from HTML
  const category = extractCategory(html);
  const bodyDescription = extractDescription(html);

  for (const p of products) {
    p.category = category;
    if (!p.description && bodyDescription) {
      p.description = bodyDescription;
    }
  }

  return products;
}

// =============================================
// Phase 3: Puppeteer fallback for pages without JSON-LD
// =============================================
async function scrapeFallbackWithPuppeteer(urls) {
  if (urls.length === 0) return;

  log(`Phase 3 — Puppeteer fallback pour ${urls.length} pages sans JSON-LD...`);

  let browser = null;
  try {
    const puppeteer = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteer.use(StealthPlugin());

    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
    });

    const page = await browser.newPage();
    await page.setUserAgent(randomUA());
    await page.setViewport({ width: 1920, height: 1080 });

    // Block heavy resources for speed
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const rt = req.resourceType();
      if (['image', 'font', 'media', 'stylesheet'].includes(rt)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    let scraped = 0;
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      if (completedUrls.has(url)) continue;

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(1000);

        // Extract product data from the DOM
        const productData = await page.evaluate(() => {
          const results = [];

          // Try to get product name from h1
          const h1 = document.querySelector('h1, .page-title, [itemprop="name"]');
          const name = h1 ? h1.textContent.trim() : '';

          // Try to get price
          let price = null;
          const priceEl = document.querySelector('.price, [itemprop="price"], .field--name-price .field__item');
          if (priceEl) {
            const priceText = priceEl.getAttribute('content') || priceEl.textContent;
            price = parseFloat(priceText.replace(/[^0-9.,]/g, '').replace(',', '.'));
            if (isNaN(price)) price = null;
          }

          // SKU/Reference
          let ref = '';
          const skuEl = document.querySelector('[itemprop="sku"], .field--name-sku .field__item, .product-sku');
          if (skuEl) ref = skuEl.getAttribute('content') || skuEl.textContent.trim();

          // Brand
          let brand = '';
          const brandEl = document.querySelector('[itemprop="brand"] [itemprop="name"], [itemprop="brand"], .field--name-field-brand .field__item');
          if (brandEl) brand = brandEl.getAttribute('content') || brandEl.textContent.trim();

          // Image
          let imageUrl = '';
          const imgEl = document.querySelector('.field--name-field-images img, .product-image img, [itemprop="image"]');
          if (imgEl) imageUrl = imgEl.src || imgEl.getAttribute('content') || '';

          // Description
          let description = '';
          const descEl = document.querySelector('.field--name-body .field__item, [itemprop="description"]');
          if (descEl) description = descEl.textContent.trim().substring(0, 1000);

          // Category from breadcrumb
          let category = '';
          const breadcrumbs = document.querySelectorAll('nav.breadcrumb a, .breadcrumb a');
          if (breadcrumbs.length > 0) {
            const parts = [];
            breadcrumbs.forEach(b => {
              const t = b.textContent.trim();
              if (t && t.toLowerCase() !== 'accueil' && t !== 'Boutique') parts.push(t);
            });
            category = parts.join(' > ');
          }

          if (name && price && price > 0) {
            results.push({ name, ref, price, brand, imageUrl, description, category });
          }

          // Also check for variant selects that might have different products
          const variantOptions = document.querySelectorAll('select[name*="attribute"] option');
          // If we have a basic product, that's enough for fallback
          return results;
        });

        for (const p of productData) {
          p.url = url;
          const key = p.name + '||' + (p.ref || url);
          if (!allProducts[key]) {
            allProducts[key] = {
              ...p,
              supplier: 'dpi',
            };
            scraped++;
          }
        }

        completedUrls.add(url);
      } catch (e) {
        errorCount++;
      }

      // Polite delay
      await sleep(2000 + Math.random() * 2000);

      // Rotate UA every 30 pages
      if (i % 30 === 29) {
        await page.setUserAgent(randomUA());
      }

      // Save progress periodically
      if (i % 50 === 49) {
        saveProgress();
        log(`  Puppeteer fallback: ${i + 1}/${urls.length}, +${scraped} produits`);
      }
    }

    log(`Phase 3 terminee: ${scraped} produits supplementaires via Puppeteer`);
  } catch (e) {
    logError('Puppeteer fallback', e);
  } finally {
    if (browser) {
      try { await browser.close(); } catch (_) {}
    }
  }
}

// =============================================
// Phase 2 main loop: HTTP scraping with concurrency
// =============================================
async function scrapeAllProducts() {
  const pendingUrls = allUrls.filter(u => !completedUrls.has(u));
  log(`Phase 2 — Scraping HTTP de ${pendingUrls.length} URLs (${completedUrls.size} deja faites)...`);

  let processedInPhase = 0;
  let addedInPhase = 0;
  const localNoJsonLd = [...noJsonLdUrls];

  for (let i = 0; i < pendingUrls.length; i += CONCURRENCY) {
    const batch = pendingUrls.slice(i, i + CONCURRENCY);

    const results = await Promise.all(batch.map(async (url) => {
      const products = await scrapeProductUrl(url);
      return { url, products };
    }));

    for (const { url, products } of results) {
      completedUrls.add(url);

      if (products === null) {
        // No JSON-LD — mark for Puppeteer fallback
        localNoJsonLd.push(url);
      } else if (Array.isArray(products)) {
        for (const p of products) {
          const key = p.name + '||' + (p.ref || url);
          if (!allProducts[key]) {
            allProducts[key] = {
              ...p,
              supplier: 'dpi',
            };
            addedInPhase++;
          }
        }
      }
      processedInPhase++;
    }

    // Progress logging every 100 URLs
    if (processedInPhase % 100 < CONCURRENCY || i + CONCURRENCY >= pendingUrls.length) {
      const elapsedSec = (Date.now() - startTime) / 1000;
      const rate = (processedInPhase / elapsedSec).toFixed(1);
      log(`  [${Math.min(i + CONCURRENCY, pendingUrls.length)}/${pendingUrls.length}] ${Object.keys(allProducts).length} produits | ${rate} req/s | ${localNoJsonLd.length} sans JSON-LD | ${errorCount} erreurs`);
    }

    // Save progress periodically
    if (processedInPhase % SAVE_EVERY < CONCURRENCY) {
      noJsonLdUrls = localNoJsonLd;
      saveProgress();

      // Import batch if enough products accumulated
      if (!DRY_RUN && addedInPhase >= CHUNK_SIZE) {
        await importProducts(Object.values(allProducts).slice(-addedInPhase));
        addedInPhase = 0;
      }
    }

    // Polite delay between batches
    await sleep(DELAY_BETWEEN_BATCHES_MS);
  }

  noJsonLdUrls = [...new Set(localNoJsonLd)];
  log(`Phase 2 terminee: ${Object.keys(allProducts).length} produits, ${noJsonLdUrls.length} sans JSON-LD`);
}

// =============================================
// Import to API (lots de 500)
// =============================================
async function importProducts(productsToImport) {
  if (DRY_RUN) {
    log(`[DRY-RUN] ${productsToImport.length} produits auraient ete importes`);
    return;
  }

  const products = productsToImport || Object.values(allProducts);
  if (products.length === 0) return;

  const chunks = [];
  for (let i = 0; i < products.length; i += CHUNK_SIZE) {
    chunks.push(products.slice(i, i + CHUNK_SIZE));
  }

  log(`Import: ${products.length} produits en ${chunks.length} lots de max ${CHUNK_SIZE}`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const payload = JSON.stringify({
      source: 'dpi',
      products: chunk.map(p => ({
        name: p.name,
        price: p.price,
        ref: p.ref || '',
        price_original: p.price, // DPI ne montre pas de prix barre dans le JSON-LD
        category: p.category || null,
        url: p.url || null,
        brand: p.brand || null,
        image_url: p.imageUrl || null,
        description: p.description || null,
      })),
      page: `dpi-batch-${i + 1}`,
    });

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await new Promise((resolve, reject) => {
          const url = new URL(IMPORT_URL);
          const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            },
            timeout: 30000,
          }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
              try {
                const r = JSON.parse(data);
                resolve(r.imported || chunk.length);
              } catch (e) {
                resolve(chunk.length);
              }
            });
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
          req.write(payload);
          req.end();
        });

        totalImported += result;
        if (i % 5 === 0) log(`  Lot ${i + 1}/${chunks.length}: ${result} importes (total: ${totalImported})`);
        break;
      } catch (e) {
        if (attempt < MAX_RETRIES) {
          log(`  Lot ${i + 1} tentative ${attempt} echouee: ${e.message}`);
          await sleep(RETRY_DELAY * attempt);
        } else {
          logError(`Import lot ${i + 1} abandonne`, e);
        }
      }
    }

    await sleep(100);
  }
}

// =============================================
// Main
// =============================================
async function main() {
  log('╔══════════════════════════════════════════════════════════╗');
  log('║  JADOMI — DPI (Dental Promotion & Innovation) Scraper  ║');
  log('║  dentalpromotion.fr — Drupal 10 + Commerce 3           ║');
  log('║  Strategie: Sitemap → JSON-LD → Puppeteer fallback     ║');
  log('╚══════════════════════════════════════════════════════════╝');
  log(`Flags: ${DRY_RUN ? 'DRY-RUN ' : ''}${RESET ? 'RESET ' : ''}RESUME`);

  // Ensure tmp dir
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  // Load progress
  loadProgress();

  // Phase 1: Discover URLs
  await discoverUrls();
  saveProgress();

  // Phase 2: HTTP scraping with JSON-LD extraction
  await scrapeAllProducts();
  saveProgress();

  // Phase 3: Puppeteer fallback for pages without JSON-LD
  const fallbackUrls = noJsonLdUrls.filter(u => !completedUrls.has(u));
  if (fallbackUrls.length > 0 && fallbackUrls.length <= 2000) {
    // Only use Puppeteer if a reasonable number of fallback pages
    await scrapeFallbackWithPuppeteer(fallbackUrls);
    saveProgress();
  } else if (fallbackUrls.length > 2000) {
    log(`Phase 3 ignoree: ${fallbackUrls.length} pages sans JSON-LD (trop nombreuses — verifier le filtre sitemap)`);
  } else {
    log('Phase 3: aucune page sans JSON-LD, pas de fallback necessaire');
  }

  // Final product list
  const products = Object.values(allProducts);
  log(`TOTAL: ${products.length} produits uniques`);

  // Save backup JSON
  const date = new Date().toISOString().split('T')[0];
  const backupFile = path.join(TMP_DIR, `dpi-${date}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(products, null, 0));
  const sizeMB = (fs.statSync(backupFile).size / 1024 / 1024).toFixed(1);
  log(`Backup: ${backupFile} (${sizeMB} MB)`);

  // Phase 4: Final import to API
  log('Phase 4 — Import final vers API...');
  await importProducts(products);

  // Cleanup progress file on success
  try {
    if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
  } catch (e) { /* ignore */ }

  log('');
  log('═══════════════════════════════════════════════════');
  log(`DPI TERMINE en ${elapsed()}`);
  log(`Produits uniques: ${products.length}`);
  log(`URLs traitees: ${completedUrls.size} / ${allUrls.length}`);
  log(`Sans JSON-LD (fallback Puppeteer): ${noJsonLdUrls.length}`);
  log(`Importes en base: ${totalImported}`);
  log(`Erreurs: ${errorCount}`);
  log('═══════════════════════════════════════════════════');
}

// =============================================
// Entry point
// =============================================
main().catch(e => {
  logError('ERREUR FATALE', e);
  saveProgress();
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('Interruption (SIGINT) — sauvegarde progression...');
  saveProgress();
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Arret (SIGTERM) — sauvegarde progression...');
  saveProgress();
  process.exit(0);
});
