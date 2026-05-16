#!/usr/bin/env node
/**
 * JADOMI — DentalGoodDeal FICHE PRODUIT SCRAPER
 *
 * Stratégie :
 * 1. Récupérer les URLs de toutes les gammes depuis les catégories
 * 2. Entrer dans CHAQUE fiche produit
 * 3. Extraire : nom complet + ref fabricant + conditionnement + prix HT + prix barré
 *
 * Ce scraper capture la REF FABRICANT (ex: 160081, 187099)
 * qui est LA CLÉ UNIVERSELLE pour le matching cross-fournisseur.
 *
 * Usage: node scripts/scrape-dgd-fiches.js [--category=endo] [--limit=100]
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const http = require('http');
const https = require('https');

puppeteer.use(StealthPlugin());

const BASE_URL = 'https://www.dentalgooddeal.com';
const PROGRESS_FILE = '/tmp/dgd-fiches-progress.json';
const LOG_FILE = '/tmp/dgd-fiches.log';
const IMPORT_URL = 'http://localhost:3001/api/scan/import-prices';

// ═══ PROXY ROTATION ═══
// Récupère des proxies gratuits et tourne entre eux
const PROXY_LIST_URL = 'https://api.proxifly.dev/get-proxy?protocol=http&count=20&format=json';
let proxyPool = [];
let proxyIndex = 0;

async function refreshProxies() {
  const sources = [
    'https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&protocol=http&timeout=5000&limit=30',
    'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/http/data.txt',
  ];
  for (const url of sources) {
    try {
      const raw = await new Promise((resolve) => {
        https.get(url, (res) => {
          let d = ''; res.on('data', c => d += c);
          res.on('end', () => resolve(d));
        }).on('error', () => resolve(''));
      });
      const lines = raw.split('\n').map(l => l.trim().replace(/^https?:\/\//, '')).filter(l => /^\d+\.\d+\.\d+\.\d+:\d+$/.test(l));
      if (lines.length > 0) {
        proxyPool = lines.slice(0, 30);
        log('Proxies chargés: ' + proxyPool.length + ' depuis ' + url.substring(0, 40));
        return;
      }
    } catch (e) {}
  }
  if (proxyPool.length === 0) {
    log('Pas de proxy dispo — mode délai long (5-8s entre requêtes)');
  }
}

function getNextProxy() {
  if (proxyPool.length === 0) return null;
  const proxy = proxyPool[proxyIndex % proxyPool.length];
  proxyIndex++;
  return proxy;
}

// User-Agents aléatoires
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/17.5',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
];

const CATEGORIES = {
  cfao: '/categorie_cfao_68174.html',
  empreintes: '/categorie_empreintes_67637.html',
  labo: '/categorie_laboratoire_67447.html',
  couronnes: '/categorie_couronnes_67120.html',
  ciments: '/categorie_ciments_66751.html',
  anesthesie: '/categorie_anesthesie_66644.html',
  radio: '/categorie_radiographie_66432.html',
  hygiene: '/categorie_hygiene_et_sterilisation_65436.html',
  restauration: '/categorie_restauration_64571.html',
  ortho: '/categorie_orthodontie_64086.html',
  implanto: '/categorie_implantologie_63768.html',
  prophylaxie: '/categorie_prophylaxie_63522.html',
  fraises: '/categorie_fraises_62701.html',
  endo: '/categorie_endodontie_61498.html',
  chirurgie: '/categorie_chirurgie_68169.html',
  paro: '/categorie_parodontologie_63090.html',
  instruments: '/categorie_petits_instruments_60529.html',
  usage_unique: '/categorie_usage_unique_62124.html',
  pivots: '/categorie_pivots_63348.html',
};

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
  catch { return { scrapedUrls: [], products: [], lastCategory: null }; }
}

function saveProgress(progress) {
  progress.lastSaved = new Date().toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
}

function parsePrice(text) {
  if (!text) return null;
  const clean = text.replace(/[^\d,.\-]/g, '').replace(',', '.');
  const val = parseFloat(clean);
  return isNaN(val) ? null : val;
}

async function run() {
  const args = process.argv.slice(2);
  const catFilter = args.find(a => a.startsWith('--category='))?.split('=')[1];
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 99999;

  log('=== DGD FICHE SCRAPER (avec rotation IP) ===');
  log('Catégorie: ' + (catFilter || 'TOUTES'));
  log('Limite: ' + limit);

  // Charger les proxies
  await refreshProxies();

  const progress = loadProgress();
  let browser = null;
  let page = null;
  let requestCount = 0;

  async function launchBrowser() {
    if (browser) try { await browser.close(); } catch {}
    const proxy = getNextProxy();
    const args = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
    if (proxy) {
      args.push('--proxy-server=http://' + proxy);
      log('Proxy: ' + proxy);
    }
    browser = await puppeteer.launch({ headless: 'new', args });
    page = await browser.newPage();
    page.setUserAgent(USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]);
    await page.setViewport({ width: 1280, height: 800 });
    // Bloquer images/CSS pour aller plus vite
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
      else req.continue();
    });
    requestCount = 0;
    return page;
  }

  page = await launchBrowser();

  try {

    // Sélectionner les catégories à scraper
    const cats = catFilter
      ? { [catFilter]: CATEGORIES[catFilter] }
      : CATEGORIES;

    let totalProducts = 0;

    for (const [catName, catUrl] of Object.entries(cats)) {
      if (!catUrl) { log('Catégorie inconnue: ' + catName); continue; }
      log('\n=== CATÉGORIE: ' + catName + ' ===');

      // Rotation IP entre chaque catégorie
      if (proxyPool.length > 0) {
        log('  Nouvelle IP pour cette catégorie...');
        page = await launchBrowser();
      }
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));

      // Phase 1: Récupérer tous les liens gamme/produit de cette catégorie
      const gammeUrls = await discoverGammes(page, BASE_URL + catUrl, catName);
      log('Gammes trouvées: ' + gammeUrls.length);

      // Phase 2: Entrer dans chaque gamme et extraire les produits
      for (const url of gammeUrls) {
        if (progress.scrapedUrls.includes(url)) continue;
        if (totalProducts >= limit) break;

        try {
          const products = await scrapeFicheProduit(page, url, catName);
          if (products.length > 0) {
            progress.products.push(...products);
            totalProducts += products.length;
            log('  → ' + products.length + ' produits extraits (' + totalProducts + ' total)');

            // Import par batch de 50
            if (progress.products.length >= 50) {
              await importBatch(progress.products.splice(0, 50));
            }
          }
          progress.scrapedUrls.push(url);
          saveProgress(progress);
        } catch (e) {
          log('  ERREUR ' + url + ': ' + e.message);
        }

        requestCount++;
        // Rotation IP toutes les 20 requêtes
        if (requestCount >= 20 && proxyPool.length > 0) {
          log('  Rotation IP...');
          page = await launchBrowser();
        }
        // Délai aléatoire humain (3-7s, plus si pas de proxy)
        const delay = proxyPool.length > 0 ? (2000 + Math.random() * 3000) : (5000 + Math.random() * 3000);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    // Import le reste
    if (progress.products.length > 0) {
      await importBatch(progress.products.splice(0));
    }

    log('\n=== TERMINÉ: ' + totalProducts + ' produits extraits ===');
  } finally {
    await browser.close();
  }
}

/**
 * Découvrir tous les liens gamme depuis une page catégorie
 */
async function discoverGammes(page, url, catName) {
  const urls = new Set();
  let pageNum = 1;

  while (pageNum <= 50) {
    const pageUrl = pageNum === 1 ? url : url.replace('.html', `__${pageNum}.html`);
    try {
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await new Promise(r => setTimeout(r, 1000));

      const links = await page.evaluate(() => {
        const anchors = document.querySelectorAll('a[href*="article_"], a[href*="gamme_"], a.encars_gamme_bouton_en_savoir_plus, .div_encars_gamme a');
        return [...anchors].map(a => a.href).filter(h => h && h.includes('dentalgooddeal'));
      });

      if (links.length === 0) break;
      links.forEach(l => urls.add(l));
      log('  Page ' + pageNum + ': ' + links.length + ' liens');
      pageNum++;
    } catch (e) {
      break;
    }
  }

  return [...urls];
}

/**
 * Scraper une fiche produit/gamme DGD
 * Extrait : nom, ref fabricant, prix HT, prix barré, conditionnement
 */
async function scrapeFicheProduit(page, url, category) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise(r => setTimeout(r, 1000));

  return await page.evaluate((cat, pageUrl) => {
    const products = [];

    // Nom de la gamme (titre principal)
    const gammeTitle = document.querySelector('h1, .titre_gamme, .product-title')?.textContent?.trim() || '';
    // Marque
    const brand = document.querySelector('.marque, .brand, [class*="marque"]')?.textContent?.trim() || '';

    // Méthode 1: Fiches produits individuelles dans une gamme
    // DGD affiche plusieurs variantes par gamme (ex: AH Plus Jet kit, recharge, cleaner...)
    const rows = document.querySelectorAll('.fiche_article, .product-item, .gamme_article, [class*="article"]');

    if (rows.length > 0) {
      rows.forEach(row => {
        // Nom complet du produit
        const nameEl = row.querySelector('.nom_article, .product-name, h2, h3, .titre, [class*="nom"]');
        let name = nameEl?.textContent?.trim() || '';

        // Ref fabricant — souvent dans un span "Réf XXXXX" ou "Réf. XXXXX"
        const refEl = row.querySelector('[class*="ref"], .ref_article, .reference');
        let refText = refEl?.textContent?.trim() || '';
        // Aussi chercher dans tout le texte du bloc
        if (!refText) {
          const allText = row.textContent || '';
          const refMatch = allText.match(/R[ée]f\.?\s*:?\s*(\d{4,})/i);
          if (refMatch) refText = refMatch[1];
        }
        // Nettoyer la ref
        const refClean = refText.replace(/^R[ée]f\.?\s*:?\s*/i, '').trim();

        // Prix HT (le prix en gras, plus petit)
        const priceEls = row.querySelectorAll('.prix, .price, [class*="prix"], .gamme_prix');
        let priceHT = null;
        let priceTTC = null;
        priceEls.forEach(el => {
          const val = el.textContent.replace(/[^\d,.\-]/g, '').replace(',', '.');
          const num = parseFloat(val);
          if (!isNaN(num) && num > 0) {
            if (!priceHT) priceHT = num;
            else if (num > priceHT) priceTTC = num;
            else { priceTTC = priceHT; priceHT = num; }
          }
        });

        // Prix barré (ancien prix)
        const oldPriceEl = row.querySelector('.prix_barre, .ancien_prix, [class*="barre"], del, s');
        const oldPrice = oldPriceEl ? parseFloat(oldPriceEl.textContent.replace(/[^\d,.]/g, '').replace(',', '.')) : null;

        // Conditionnement (dans la description)
        const descEl = row.querySelector('.desc, .description, [class*="desc"], p');
        const conditionnement = descEl?.textContent?.trim() || '';

        if (name || refClean) {
          // Construire le nom complet
          const fullName = [gammeTitle, name].filter(Boolean).join(' - ');
          products.push({
            name: fullName || name || gammeTitle,
            brand: brand,
            ref: refClean || '',
            price: priceHT,
            price_original: oldPrice || priceTTC,
            conditionnement,
            url: pageUrl,
            category: cat,
          });
        }
      });
    }

    // Méthode 2: Page produit simple (pas une gamme)
    if (products.length === 0) {
      // Chercher le prix principal
      const mainPrice = document.querySelector('.prix_article, .product-price, .prix');
      const priceVal = mainPrice ? parseFloat(mainPrice.textContent.replace(/[^\d,.]/g, '').replace(',', '.')) : null;

      // Chercher la ref
      const allText = document.body.textContent || '';
      const refMatch = allText.match(/R[ée]f\.?\s*:?\s*(\d{4,})/i);
      const ref = refMatch ? refMatch[1] : '';

      if (gammeTitle && priceVal) {
        products.push({
          name: gammeTitle,
          brand,
          ref,
          price: priceVal,
          price_original: null,
          url: pageUrl,
          category: cat,
        });
      }
    }

    return products;
  }, category, url);
}

/**
 * Import un batch de produits via l'API JADOMI
 */
async function importBatch(products) {
  const items = products.filter(p => p.name && p.price && p.price > 0.10 && p.price < 50000);
  if (items.length === 0) return;

  return new Promise((resolve) => {
    const body = JSON.stringify({
      source: 'dentalgooddeal',
      products: items.map(p => ({
        name: p.name,
        brand: p.brand || '',
        ref: p.ref || '',
        price: p.price,
        price_original: p.price_original || null,
        url: p.url || '',
      })),
    });

    const req = http.request(IMPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { log('  Import: ' + d); resolve(); });
    });
    req.on('error', (e) => { log('  Import error: ' + e.message); resolve(); });
    req.write(body);
    req.end();
  });
}

run().catch(e => { log('FATAL: ' + e.message); process.exit(1); });
