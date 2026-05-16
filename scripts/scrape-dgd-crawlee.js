#!/usr/bin/env node
/**
 * JADOMI — DentalGoodDeal Scraper v3 (Crawlee + Playwright)
 *
 * Avantages vs Puppeteer :
 * - Playwright Firefox = fingerprint différent, pas détecté
 * - Crawlee gère auto : retries, rate-limit, queue, anti-bot
 * - ProxyConfiguration intégrée (rotation automatique)
 * - Résistant aux blocages
 *
 * Usage: node scripts/scrape-dgd-crawlee.js [--category=endo] [--limit=500]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PlaywrightCrawler, ProxyConfiguration, Dataset } = require('crawlee');
const http = require('http');
const fs = require('fs');

const BASE_URL = 'https://www.dentalgooddeal.com';
const IMPORT_URL = 'http://localhost:3001/api/scan/import-prices';
const LOG_FILE = '/tmp/dgd-crawlee.log';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

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

let totalProducts = 0;
let importBuffer = [];

async function run() {
  const args = process.argv.slice(2);
  const catFilter = args.find(a => a.startsWith('--category='))?.split('=')[1];
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 99999;

  log('=== DGD CRAWLEE + PLAYWRIGHT (Firefox) ===');
  log('Catégorie: ' + (catFilter || 'TOUTES'));

  // URLs de départ
  const startUrls = [];
  const cats = catFilter ? { [catFilter]: CATEGORIES[catFilter] } : CATEGORIES;
  for (const [name, path] of Object.entries(cats)) {
    if (path) startUrls.push({ url: BASE_URL + path, label: 'CATEGORY', userData: { catName: name } });
  }

  const crawler = new PlaywrightCrawler({
    // Utiliser Firefox (pas détecté comme bot, fingerprint différent de Chrome)
    launchContext: {
      launcher: require('playwright').firefox,
      launchOptions: {
        headless: true,
      },
    },

    // Anti-bot
    maxRequestRetries: 2,
    maxConcurrency: 1,
    minConcurrency: 1,

    // Délai humain entre les pages
    maxRequestsPerMinute: 10,

    // Navigation
    navigationTimeoutSecs: 30,

    // Handler principal
    async requestHandler({ request, page, enqueueLinks }) {
      const label = request.label || request.userData?.label || 'CATEGORY';

      if (label === 'CATEGORY') {
        // === PAGE CATÉGORIE : lister les gammes ===
        const catName = request.userData?.catName || '?';
        log('Catégorie: ' + catName + ' → ' + request.url);

        await page.waitForTimeout(1500 + Math.random() * 1500);

        // Récupérer tous les liens article/gamme
        const links = await page.evaluate(() => {
          return [...document.querySelectorAll('a')]
            .map(a => a.href)
            .filter(h => h && h.includes('dentalgooddeal') && (h.includes('article_') || h.includes('gamme_')));
        });

        // Dédupliquer
        const unique = [...new Set(links)];
        log('  ' + unique.length + ' gammes trouvées');

        // Enqueue chaque fiche produit
        for (const link of unique) {
          if (totalProducts >= limit) break;
          await crawler.addRequests([{
            url: link,
            label: 'PRODUCT',
            userData: { catName },
          }]);
        }

        // Pagination — chercher le lien page suivante
        const nextPage = await page.evaluate(() => {
          const links = [...document.querySelectorAll('a')];
          const next = links.find(a => a.textContent.trim() === '>' || a.textContent.trim() === '»');
          return next ? next.href : null;
        });

        if (nextPage && nextPage !== request.url) {
          await crawler.addRequests([{
            url: nextPage,
            label: 'CATEGORY',
            userData: { catName },
          }]);
        }

      } else if (label === 'PRODUCT') {
        // === FICHE PRODUIT : extraire les détails ===
        if (totalProducts >= limit) return;

        await page.waitForTimeout(1000 + Math.random() * 1500);

        const products = await page.evaluate(() => {
          const items = [];
          const gammeTitle = document.querySelector('h1, .titre_gamme')?.textContent?.trim() || '';

          // Chercher les blocs article individuels
          const blocks = document.querySelectorAll('[class*="article"], [class*="encars"], .fiche_article, tr[class*="article"]');

          if (blocks.length > 0) {
            blocks.forEach(block => {
              const nameEl = block.querySelector('[class*="nom"], [class*="libelle"], h2, h3, td:first-child a');
              let name = nameEl?.textContent?.trim() || '';

              // Ref fabricant
              const allText = block.textContent || '';
              const refMatch = allText.match(/R[ée]f\.?\s*:?\s*(\w{4,})/i);
              const ref = refMatch ? refMatch[1] : '';

              // Prix
              const priceEls = block.querySelectorAll('[class*="prix"]:not([class*="barre"])');
              let price = null;
              priceEls.forEach(el => {
                const v = parseFloat(el.textContent.replace(/[^\d,.]/g, '').replace(',', '.'));
                if (!isNaN(v) && v > 0 && (!price || v < price)) price = v;
              });

              // Prix barré
              const oldEl = block.querySelector('[class*="barre"], del, s');
              const oldPrice = oldEl ? parseFloat(oldEl.textContent.replace(/[^\d,.]/g, '').replace(',', '.')) : null;

              // Marque
              const brandEl = block.querySelector('[class*="marque"]');
              const brand = brandEl?.textContent?.trim() || '';

              if ((name || gammeTitle) && price) {
                items.push({
                  name: name ? (gammeTitle + ' - ' + name).substring(0, 500) : gammeTitle,
                  ref,
                  price,
                  price_original: oldPrice,
                  brand,
                });
              }
            });
          }

          // Fallback : produit simple (pas de blocs)
          if (items.length === 0 && gammeTitle) {
            const mainPrice = document.querySelector('[class*="prix"]:not([class*="barre"])');
            const price = mainPrice ? parseFloat(mainPrice.textContent.replace(/[^\d,.]/g, '').replace(',', '.')) : null;
            const allText = document.body.textContent || '';
            const refMatch = allText.match(/R[ée]f\.?\s*:?\s*(\w{4,})/i);

            if (price) {
              items.push({
                name: gammeTitle,
                ref: refMatch ? refMatch[1] : '',
                price,
                price_original: null,
                brand: '',
              });
            }
          }

          return items;
        });

        if (products.length > 0) {
          totalProducts += products.length;
          importBuffer.push(...products);
          log('  → ' + products.length + ' produits (' + totalProducts + ' total) — ' + request.url.substring(35, 80));

          // Import par batch de 50
          if (importBuffer.length >= 50) {
            await importBatch(importBuffer.splice(0, 50));
          }
        }
      }
    },

    // Gestion erreurs
    async failedRequestHandler({ request, error }) {
      log('ERREUR: ' + request.url.substring(35, 80) + ' — ' + error.message);
    },
  });

  await crawler.run(startUrls);

  // Import le reste
  if (importBuffer.length > 0) {
    await importBatch(importBuffer.splice(0));
  }

  log('\n=== TERMINÉ: ' + totalProducts + ' produits extraits ===');
}

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
      })),
    });

    const req = http.request(IMPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { log('  Import: ' + d); resolve(); });
    });
    req.on('error', (e) => { log('  Import error: ' + e.message); resolve(); });
    req.write(body);
    req.end();
  });
}

run().catch(e => { log('FATAL: ' + e.message); process.exit(1); });
