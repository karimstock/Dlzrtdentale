#!/usr/bin/env node
/**
 * JADOMI — DentalGoodDeal Scraper CHEERIO (sans navigateur)
 *
 * Avantage : pas de Puppeteer/Playwright = pas détecté comme bot
 * HTTP GET simple + parsing HTML avec Cheerio
 *
 * Usage: node scripts/scrape-dgd-cheerio.js [--category=ciments] [--limit=500]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const https = require('https');
const http = require('http');
const cheerio = require('cheerio');
const fs = require('fs');

const BASE_URL = 'https://www.dentalgooddeal.com';
const IMPORT_URL = 'http://localhost:3001/api/scan/import-prices';
const LOG_FILE = '/tmp/dgd-cheerio.log';
const PROGRESS_FILE = '/tmp/dgd-cheerio-progress.json';

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

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',
];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
  catch { return { done: [], total: 0 }; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p)); }

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    https.get(url, {
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchPage(res.headers.location));
      }
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => resolve({ status: res.statusCode, html }));
    }).on('error', reject);
  });
}

function parsePrice(text) {
  if (!text) return null;
  const v = parseFloat(text.replace(/[^\d,.]/g, '').replace(',', '.'));
  return isNaN(v) ? null : v;
}

async function run() {
  const args = process.argv.slice(2);
  const catFilter = args.find(a => a.startsWith('--category='))?.split('=')[1];
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 99999;

  log('=== DGD CHEERIO SCRAPER (sans navigateur) ===');
  log('Catégorie: ' + (catFilter || 'TOUTES'));

  const progress = loadProgress();
  const cats = catFilter ? { [catFilter]: CATEGORIES[catFilter] } : CATEGORIES;
  let totalProducts = 0;
  let importBuffer = [];

  for (const [catName, catPath] of Object.entries(cats)) {
    if (!catPath) continue;
    log('\n=== CATÉGORIE: ' + catName + ' ===');

    // Phase 1 : Lister les URLs article depuis les pages catégorie (avec pagination)
    const articleUrls = new Set();
    let pageNum = 1;

    while (pageNum <= 50) {
      const pageUrl = pageNum === 1
        ? BASE_URL + catPath
        : BASE_URL + catPath.replace('.html', '__' + pageNum + '.html');

      try {
        const { status, html } = await fetchPage(pageUrl);
        if (status !== 200 || html.length < 1000) break;

        const $ = cheerio.load(html);
        const sizeBefore = articleUrls.size;
        $('a').each(function() {
          const href = $(this).attr('href') || '';
          if (href.includes('article_') && href.includes('dentalgooddeal')) {
            articleUrls.add(href);
          }
        });
        const newFound = articleUrls.size - sizeBefore;

        if (newFound === 0) break; // plus de nouveaux liens = stop pagination
        log('  Page ' + pageNum + ': +' + newFound + ' nouveaux (' + articleUrls.size + ' total)');
        pageNum++;
      } catch (e) {
        log('  Erreur page ' + pageNum + ': ' + e.message);
        break;
      }

      // Délai humain
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
    }

    log('  Total URLs: ' + articleUrls.size);

    // Phase 2 : Scraper chaque fiche article
    for (const url of articleUrls) {
      if (totalProducts >= limit) break;
      if (progress.done.includes(url)) continue;

      try {
        const { status, html } = await fetchPage(url);
        if (status !== 200) { log('  HTTP ' + status + ': ' + url.substring(35, 80)); continue; }

        const $ = cheerio.load(html);

        // Titre gamme
        const gammeTitle = $('h1').first().text().trim() ||
          $('.titre_gamme').first().text().trim() || '';

        const products = [];
        const brand = $('[class*="marque"]').first().text().trim() ||
          gammeTitle.match(/\b(Dentsply|VOCO|GC|Ivoclar|Kerr|3M|Septodont|VDW|Hu-Friedy|Coltene|Kulzer|Micro-Mega|Acteon|Zhermack|Itena|Cerkamed)\b/i)?.[1] || '';

        // Méthode 1 : Blocs article_prix (fiches produit individuelles — LE VRAI PRIX)
        const articleBlocs = $('[class*="fiche_article_partie"]');
        if (articleBlocs.length > 0) {
          // Chaque bloc fiche_article a un article_prix + un Réf
          const articlePrices = [];
          $('.article_prix').each(function() { articlePrices.push(parsePrice($(this).text())); });
          const articleOldPrices = [];
          $('.article_prix_barre').each(function() { articleOldPrices.push(parsePrice($(this).text())); });

          // Refs
          const bodyText = $('body').text();
          const refMatches = bodyText.match(/Réf\.?\s*(\d{4,})/gi) || [];
          const refs = refMatches.map(m => m.replace(/Réf\.?\s*/i, '').trim());

          // Noms des variantes (libellé sous chaque Réf)
          const variantNames = [];
          $('[class*="fiche_article_partie_droite"]').each(function() {
            const desc = $(this).find('[class*="description"], [class*="libelle"], td').first().text().trim();
            variantNames.push(desc);
          });

          for (let i = 0; i < Math.max(articlePrices.length, refs.length); i++) {
            const price = articlePrices[i];
            if (!price || price < 0.5) continue;
            const ref = refs[i] || '';
            const varName = variantNames[i] || '';
            const fullName = varName
              ? gammeTitle + ' - ' + varName.substring(0, 100)
              : (ref ? gammeTitle + ' (Réf ' + ref + ')' : gammeTitle);
            products.push({
              name: fullName,
              ref,
              price,
              price_original: articleOldPrices[i] || null,
              brand,
              url,
            });
          }
        }

        // Méthode 2 (fallback) : pas de blocs article, prendre gamme_prix
        if (products.length === 0 && gammeTitle) {
          const bodyText = $('body').text();
          const refMatches = bodyText.match(/Réf\.?\s*(\d{4,})/gi) || [];
          const refs = refMatches.map(m => m.replace(/Réf\.?\s*/i, '').trim());

          // Prendre les gamme_prix (pas barre)
          const gPrices = [];
          $('.gamme_prix').each(function() {
            const cls = $(this).attr('class') || '';
            if (!cls.includes('barre')) gPrices.push(parsePrice($(this).text()));
          });

          if (gPrices.length > 0) {
            // Prendre le premier prix (le plus pertinent pour le produit principal)
            products.push({
              name: gammeTitle,
              ref: refs[0] || '',
              price: gPrices[0],
              brand,
              url,
            });
          }
        }

        if (products.length > 0) {
          totalProducts += products.length;
          importBuffer.push(...products);
          log('  → ' + products.length + ' produits | ref: ' + (products[0].ref || '—') + ' | ' + products[0].price + '€ | ' + gammeTitle.substring(0, 50));
        }

        progress.done.push(url);
        if (importBuffer.length >= 50) {
          await importBatch(importBuffer.splice(0, 50));
          saveProgress(progress);
        }
      } catch (e) {
        log('  ERREUR: ' + url.substring(35, 80) + ' — ' + e.message);
      }

      // Délai humain
      await new Promise(r => setTimeout(r, 3000 + Math.random() * 3000));
    }
  }

  // Import le reste
  if (importBuffer.length > 0) await importBatch(importBuffer.splice(0));
  progress.total = totalProducts;
  saveProgress(progress);

  log('\n=== TERMINÉ: ' + totalProducts + ' produits extraits ===');
}

async function importBatch(products) {
  const items = products.filter(p => p.name && p.price && p.price > 0.10 && p.price < 50000);
  if (items.length === 0) return;

  return new Promise((resolve) => {
    const body = JSON.stringify({
      source: 'dentalgooddeal',
      products: items.map(p => ({
        name: p.name, brand: p.brand || '', ref: p.ref || '',
        price: p.price, price_original: p.price_original || null, url: p.url || '',
      })),
    });
    const req = http.request(IMPORT_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 15000,
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { log('  Import: ' + d); resolve(); });
    });
    req.on('error', () => resolve());
    req.write(body);
    req.end();
  });
}

run().catch(e => { log('FATAL: ' + e.message); process.exit(1); });
