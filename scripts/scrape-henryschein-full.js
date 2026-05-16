#!/usr/bin/env node
// =============================================
// JADOMI — Henry Schein FULL SCRAPER
//
// Stratégie : Puppeteer login (1 fois) → cookies → Cheerio HTTP (rapide)
// Parcourt les 20 catégories dentaires avec pagination
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');
const https = require('https');
const http = require('http');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const COOKIES_FILE = '/tmp/henryschein-cookies.json';
const PROGRESS_FILE = '/tmp/henryschein-full-progress.json';
const LOG_FILE = '/tmp/henryschein-full.log';
const IMPORT_URL = 'http://127.0.0.1:3001/api/scan/import-prices';

const BASE_URL = 'https://www.henryschein.fr';

const CATEGORIES = [
  { name: 'Endodontie', url: '/fr-fr/dental/c/endodontie' },
  { name: 'Restauration', url: '/fr-fr/dental/c/restauration' },
  { name: 'Implantologie', url: '/fr-fr/dental/c/implantologie' },
  { name: 'Orthodontie', url: '/fr-fr/dental/c/orthodontie' },
  { name: 'Prophylaxie', url: '/fr-fr/dental/c/prophylaxie' },
  { name: 'Empreintes', url: '/fr-fr/dental/c/empreintes' },
  { name: 'Anesthesie', url: '/fr-fr/dental/c/anesthesie' },
  { name: 'Chirurgie', url: '/fr-fr/dental/c/chirurgie' },
  { name: 'Radiologie', url: '/fr-fr/dental/c/radiologie' },
  { name: 'Hygiene', url: '/fr-fr/dental/c/hygiene-et-sterilisation' },
  { name: 'Instrumentation', url: '/fr-fr/dental/c/instrumentation' },
  { name: 'Instrumentation-rotative', url: '/fr-fr/dental/c/instrumentation-rotative' },
  { name: 'Prothese', url: '/fr-fr/dental/c/prothese' },
  { name: 'Materiel', url: '/fr-fr/dental/c/materiel' },
  { name: 'Consommables', url: '/fr-fr/dental/c/consommables-de-cabinet' },
  { name: 'Petit-equipement', url: '/fr-fr/dental/c/petit-equipement' },
  { name: 'Parodontologie', url: '/fr-fr/dental/c/parodontologie' },
  { name: 'Cad-Cam', url: '/fr-fr/dental/c/cad-cam' },
  { name: 'Blanchiment', url: '/fr-fr/dental/c/blanchiment' },
  { name: 'Pedodontie', url: '/fr-fr/dental/c/pedodontie' },
];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// =============================================
// PHASE 1: LOGIN PUPPETEER → COOKIES
// =============================================

async function getSessionCookies() {
  // Vérifier si on a des cookies récents (< 1h)
  if (fs.existsSync(COOKIES_FILE)) {
    const stat = fs.statSync(COOKIES_FILE);
    const ageMinutes = (Date.now() - stat.mtimeMs) / 60000;
    if (ageMinutes < 60) {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
      log(`  Cookies existants (${Math.round(ageMinutes)}min) — réutilisation`);
      return cookies;
    }
  }

  log('  Login Puppeteer...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.goto(BASE_URL + '/fr-fr/Cabinet/Default.aspx?registered=true', {
    waitUntil: 'networkidle2', timeout: 30000,
  });
  await new Promise(r => setTimeout(r, 3000));

  await page.evaluate(() => {
    const e = document.getElementById('ctl00_ucHeader_ucSessionBar_ucLogin_txtLogonName');
    const p = document.getElementById('ctl00_ucHeader_ucSessionBar_ucLogin_txtPassword');
    if (e) { e.value = 'karim_bahmed@yahoo.fr'; e.dispatchEvent(new Event('change', {bubbles:true})); }
    if (p) { p.value = '1987@Amjad'; p.dispatchEvent(new Event('change', {bubbles:true})); }
  });
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate(() => {
    const btn = document.getElementById('ctl00_ucHeader_ucSessionBar_ucLogin_btnLoginCallback');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 8000));
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});

  const cookies = await page.cookies();
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
  log(`  Login OK — ${cookies.length} cookies sauvegardés`);

  await browser.close();
  return cookies;
}

// =============================================
// PHASE 2: CHEERIO HTTP AVEC COOKIES (rapide)
// =============================================

function fetchWithCookies(url, cookies) {
  return new Promise((resolve, reject) => {
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
        'Cookie': cookieStr,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
      timeout: 20000,
    }, (res) => {
      if (res.statusCode >= 300 && res.headers.location) {
        let redir = res.headers.location;
        if (redir.startsWith('/')) redir = BASE_URL + redir;
        return resolve(fetchWithCookies(redir, cookies));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, html: data }));
    }).on('error', reject)
      .on('timeout', function() { this.destroy(); reject(new Error('Timeout')); });
  });
}

function extractProducts(html, category) {
  const $ = cheerio.load(html);
  const products = [];

  // Henry Schein utilise des sélecteurs ASP.NET — essayer plusieurs patterns
  const selectors = [
    '.product-thumb', '.product-item', '.product-tile',
    '.product-list-item', '.search-result-item', '.product',
    '[data-product-id]', 'tr[class*="product"]',
    '.item-product', '.grid-item',
  ];

  let $items = $([]);
  for (const sel of selectors) {
    const found = $(sel);
    if (found.length >= 2) { $items = found; break; }
  }

  // Fallback: chercher les blocs avec un prix
  if ($items.length < 2) {
    // Trouver toutes les zones qui ont un prix + un lien
    $('a[href]').each(function() {
      const el = $(this);
      const text = el.text().replace(/\s+/g, ' ').trim();
      const parent = el.parent().parent();
      const parentText = parent.text().replace(/\s+/g, ' ').trim();

      if (parentText.match(/\d+[.,]\d{2}\s*€/) && text.length > 5 && text.length < 200) {
        const priceMatch = parentText.match(/(\d+[.,]\d{2})\s*€/);
        const img = parent.find('img').first().attr('src') || '';
        const ref = parentText.match(/(?:Réf|SKU|Code|Art)[.\s:]*([A-Z0-9-]+)/i);

        products.push({
          name: text.substring(0, 150),
          price: priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : null,
          ref: ref ? ref[1] : '',
          image: img,
          url: el.attr('href') || '',
          category: category,
        });
      }
    });
    return products;
  }

  $items.each(function() {
    const el = $(this);
    const name = el.find('.product-title, .product-name, h2, h3, a[title], .item-name').first().text().trim()
      || el.find('a[title]').first().attr('title') || '';
    const priceText = el.find('.price, .product-price, [class*="price"]').first().text().trim();
    const priceMatch = priceText.match(/(\d+[.,]\d{2})/);
    const img = el.find('img').first().attr('src') || el.find('img').first().attr('data-src') || '';
    const link = el.find('a[href]').first().attr('href') || '';
    const ref = el.find('.product-ref, .ref, .sku, [class*="ref"], [class*="code"]').first().text().trim();

    if (name && name.length > 3) {
      products.push({
        name: name.replace(/\s+/g, ' ').substring(0, 150),
        price: priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : null,
        ref: ref,
        image: img.startsWith('/') ? BASE_URL + img : img,
        url: link.startsWith('/') ? BASE_URL + link : link,
        category: category,
      });
    }
  });

  return products;
}

function findNextPageUrl(html) {
  const $ = cheerio.load(html);
  // Chercher lien "Suivant", "Next", ">" dans la pagination
  const next = $('a:contains("Suivant"), a:contains("Next"), a:contains(">"), .pagination .next a, a.next-page').first();
  if (next.length) {
    let href = next.attr('href');
    if (href && href.startsWith('/')) return BASE_URL + href;
    if (href && href.startsWith('http')) return href;
  }
  return null;
}

// =============================================
// MAIN
// =============================================

async function main() {
  log('=== HENRY SCHEIN FULL SCRAPER ===');

  // Phase 1: Login
  const cookies = await getSessionCookies();

  // Phase 2: Scraper toutes les catégories
  let totalProducts = 0;
  const allProducts = [];
  let progress = {};
  try { progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); } catch {}

  for (const cat of CATEGORIES) {
    if (progress[cat.name]?.done) {
      log(`  ${cat.name}: déjà fait (${progress[cat.name].count} produits)`);
      totalProducts += progress[cat.name].count;
      continue;
    }

    log(`\n=== ${cat.name} ===`);
    let url = BASE_URL + cat.url;
    let pageNum = 1;
    let catProducts = [];

    while (url && pageNum <= 100) {
      try {
        const { status, html } = await fetchWithCookies(url, cookies);
        if (status !== 200 || html.length < 2000) {
          log(`  Page ${pageNum}: stop (${status})`);
          break;
        }

        const products = extractProducts(html, cat.name);
        if (products.length === 0) {
          log(`  Page ${pageNum}: 0 produits → stop`);
          break;
        }

        catProducts.push(...products);
        log(`  Page ${pageNum}: ${products.length} produits (total: ${catProducts.length})`);

        // Page suivante
        url = findNextPageUrl(html);
        pageNum++;

        // Délai pour pas se faire bloquer
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
      } catch (err) {
        log(`  Page ${pageNum} erreur: ${err.message}`);
        break;
      }
    }

    // Dédupliquer
    const unique = new Map();
    catProducts.forEach(p => unique.set(p.name + p.ref, p));
    const dedupedProducts = [...unique.values()];

    log(`  ${cat.name}: ${dedupedProducts.length} produits uniques`);
    totalProducts += dedupedProducts.length;
    allProducts.push(...dedupedProducts);

    progress[cat.name] = { done: true, count: dedupedProducts.length };
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  }

  log(`\n=== BILAN ===`);
  log(`Total: ${totalProducts} produits de ${CATEGORIES.length} catégories`);
  log(`Produits uniques: ${new Set(allProducts.map(p => p.name + p.ref)).size}`);

  // Sauvegarder en JSON
  fs.writeFileSync('/tmp/henryschein-all-products.json', JSON.stringify(allProducts, null, 2));
  log('Sauvegardé dans /tmp/henryschein-all-products.json');

  // Import vers Supabase via API locale
  if (allProducts.length > 0) {
    log('\nImport vers Supabase...');
    const batchSize = 100;
    let imported = 0;
    for (let i = 0; i < allProducts.length; i += batchSize) {
      const batch = allProducts.slice(i, i + batchSize).map(p => ({
        supplier_name: 'henryschein',
        product_name: p.name,
        price: p.price,
        reference: p.ref,
        category: p.category,
        brand: '',
        url: p.url,
      }));

      try {
        await new Promise((resolve, reject) => {
          const payload = JSON.stringify(batch);
          const req = http.request(IMPORT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
          }, (res) => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => { imported += batch.length; resolve(); });
          });
          req.on('error', () => resolve());
          req.end(payload);
        });
      } catch {}
    }
    log(`Import: ${imported} produits envoyés`);
  }
}

main().catch(err => { console.error('ERREUR:', err); process.exit(1); });
