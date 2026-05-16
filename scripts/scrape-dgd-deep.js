#!/usr/bin/env node
// =============================================
// JADOMI — DentalGoodDeal DEEP SCRAPER
//
// Stratégie : crawler TOUTES les catégories ET sous-catégories
// puis entrer dans chaque GAMME pour capturer les produits individuels
// (le site affiche des gammes, pas des produits directs)
//
// Objectif : 30 000+ produits
//
// Usage: nohup node scripts/scrape-dgd-deep.js &
// =============================================

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const http = require('http');

puppeteer.use(StealthPlugin());

const PROGRESS_FILE = '/tmp/dgd-deep-progress.json';
const LOG_FILE = '/tmp/dgd-deep.log';

// TOUTES les catégories racines de DGD
const ROOT_CATEGORIES = [
  '/categorie_cfao_68174.html',
  '/categorie_empreintes_67637.html',
  '/categorie_laboratoire_67447.html',
  '/categorie_couronnes_67120.html',
  '/categorie_ciments_66751.html',
  '/categorie_anesthesie_66644.html',
  '/categorie_radiographie_66432.html',
  '/categorie_vetements_66357.html',
  '/categorie_instruments_rotatifs_65952.html',
  '/categorie_hygiene_et_sterilisation_65436.html',
  '/categorie_restauration_64571.html',
  '/categorie_orthodontie_64086.html',
  '/categorie_implantologie_63768.html',
  '/categorie_prophylaxie_63522.html',
  '/categorie_pivots_63348.html',
  '/categorie_fraises_62701.html',
  '/categorie_usage_unique_62124.html',
  '/categorie_endodontie_61498.html',
  '/categorie_petits_instruments_60529.html',
  '/categorie_chirurgie_68169.html',
  '/categorie_parodontologie_63090.html',
  '/categorie_divers_61090.html',
];

const BASE_URL = 'https://www.dentalgooddeal.com';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
    catch (e) {}
  }
  return {
    products: {},
    completedCategories: [],
    completedGammes: [],
    discoveredCategories: [],
    stats: { gammes: 0, categories: 0 },
  };
}

function saveProgress(progress) {
  progress.lastSaved = new Date().toISOString();
  progress.stats.totalProducts = Object.keys(progress.products).length;
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
}

// =============================================
// PHASE 1: Discover ALL sub-categories recursively
// =============================================

async function discoverCategories(page, startUrls) {
  const allCats = new Set(startUrls);
  const queue = [...startUrls];
  const visited = new Set();

  while (queue.length > 0) {
    const catUrl = queue.shift();
    if (visited.has(catUrl)) continue;
    visited.add(catUrl);

    try {
      await page.goto(BASE_URL + catUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await new Promise(r => setTimeout(r, 1500));

      const subCats = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href*="categorie_"]'))
          .map(a => {
            try { return new URL(a.href).pathname; }
            catch (e) { return ''; }
          })
          .filter(u => u.startsWith('/categorie_') && u.endsWith('.html'));
      });

      for (const sub of subCats) {
        if (!allCats.has(sub)) {
          allCats.add(sub);
          queue.push(sub);
        }
      }

      log(`  Découverte: ${catUrl.substring(11, 40)}... → ${subCats.length} sous-cats (total: ${allCats.size})`);
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      log(`  Erreur découverte ${catUrl}: ${e.message.substring(0, 60)}`);
    }
  }

  return Array.from(allCats);
}

// =============================================
// PHASE 2: Scrape products from a category page
// DGD shows "gammes" (product groups). Each gamme page
// has individual products with prices and variants.
// =============================================

async function scrapeGammePage(page, gammeUrl, progress) {
  try {
    await page.goto(gammeUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, 1500));

    // Extract all individual products/articles on the gamme page
    const products = await page.evaluate(() => {
      const items = [];

      // Method 1: Individual article rows (table-like layout)
      document.querySelectorAll('.div_encars_article, .div_article, tr.article, .ligne_article').forEach(row => {
        const nameEl = row.querySelector('.titre_article, .nom_article, .designation, td:first-child');
        const priceEl = row.querySelector('.prix_article, .prix, .gamme_prix');
        const oldPriceEl = row.querySelector('.prix_barre, .ancien_prix, .gamme_prix_barre');
        const refEl = row.querySelector('.ref_article, .reference');
        const imgEl = row.querySelector('img');

        const name = (nameEl?.textContent || '').trim();
        const price = (priceEl?.textContent || '').trim();
        const oldPrice = (oldPriceEl?.textContent || '').trim();
        const ref = (refEl?.textContent || '').trim();
        const img = imgEl?.src || imgEl?.getAttribute('data-src') || '';

        if (name && name.length > 2) {
          items.push({ name, price, oldPrice, ref, img });
        }
      });

      // Method 2: Product cards (different layout)
      document.querySelectorAll('.div_produit, .produit_detail, .product-item').forEach(card => {
        const nameEl = card.querySelector('h1, h2, h3, .titre, .nom');
        const priceEl = card.querySelector('.prix, .price, .gamme_prix');
        const name = (nameEl?.textContent || '').trim();
        const price = (priceEl?.textContent || '').trim();
        if (name && name.length > 2 && !items.find(i => i.name === name)) {
          items.push({ name, price, oldPrice: '', ref: '', img: '' });
        }
      });

      // Method 3: Variant/option selectors (select options, size/color pickers)
      document.querySelectorAll('select option, .option_article').forEach(opt => {
        const text = (opt.textContent || '').trim();
        const value = opt.value || '';
        if (text.length > 3 && value && !text.includes('Choisir') && !text.includes('Sélectionner')) {
          // Extract price if embedded in text
          const priceMatch = text.match(/([\d,]+)\s*€/);
          items.push({
            name: text.replace(/([\d,]+)\s*€.*$/, '').trim(),
            price: priceMatch ? priceMatch[1] : '',
            oldPrice: '',
            ref: value,
            img: '',
          });
        }
      });

      // Method 4: Generic — all elements with price-like content
      if (items.length === 0) {
        const allText = document.body.innerText;
        const productBlocks = allText.match(/[A-ZÀ-Ü][a-zà-ü\s\-]{3,50}\s+\d+[,\.]\d{2}\s*€/g) || [];
        for (const block of productBlocks.slice(0, 100)) {
          const parts = block.match(/(.+?)\s+([\d,\.]+)\s*€/);
          if (parts) {
            items.push({ name: parts[1].trim(), price: parts[2] + ' €', oldPrice: '', ref: '', img: '' });
          }
        }
      }

      return items;
    });

    return products;
  } catch (e) {
    return [];
  }
}

async function scrapeCategoryProducts(page, catUrl, progress) {
  try {
    await page.goto(BASE_URL + catUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, 1500));

    // Get all gamme links on this category page
    const gammeLinks = await page.evaluate(() => {
      const links = [];
      // Gamme cards have links to individual product pages
      document.querySelectorAll('a[href*="fiche_"], a[href*="gamme_"], a[href*="produit_"]').forEach(a => {
        try {
          const url = new URL(a.href).pathname;
          const name = (a.textContent || a.getAttribute('title') || '').trim();
          if (url.length > 5 && name.length > 2) {
            links.push({ url, name });
          }
        } catch (e) {}
      });
      return links;
    });

    // Also extract products directly visible on the category page
    const directProducts = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('.div_encars_gamme, .div_encars_gamme_horizontal').forEach(card => {
        const nameEl = card.querySelector('.titre_gamme_liste_gamme, .titre_gamme');
        const priceEl = card.querySelector('.gamme_prix');
        const oldPriceEl = card.querySelector('.gamme_prix_barre');
        const countEl = card.querySelector('.nb_articles_liste_gamme, .nb_articles');
        const imgEl = card.querySelector('img');
        const linkEl = card.querySelector('a[href]');

        items.push({
          name: (nameEl?.textContent || '').trim(),
          price: (priceEl?.textContent || '').trim(),
          oldPrice: (oldPriceEl?.textContent || '').trim(),
          articleCount: (countEl?.textContent || '').trim(),
          img: imgEl?.src || '',
          url: linkEl?.href || '',
        });
      });
      return items;
    });

    // Check pagination
    const nextPages = await page.evaluate(() => {
      const pages = [];
      document.querySelectorAll('a[href*="page="], .pagination a').forEach(a => {
        const match = a.href.match(/page=(\d+)/);
        if (match) pages.push(parseInt(match[1]));
      });
      return [...new Set(pages)].sort((a, b) => a - b);
    });

    return { gammeLinks, directProducts, nextPages };
  } catch (e) {
    return { gammeLinks: [], directProducts: [], nextPages: [] };
  }
}

// =============================================
// MAIN
// =============================================

async function main() {
  log('╔══════════════════════════════════════════════════════════╗');
  log('║  JADOMI — DentalGoodDeal DEEP SCRAPER                  ║');
  log('║  Toutes catégories + gammes + variantes                 ║');
  log('╚══════════════════════════════════════════════════════════╝');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
           '--single-process', '--no-zygote'],
  });

  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['image', 'font', 'media', 'stylesheet'].includes(req.resourceType())) req.abort();
    else req.continue();
  });
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

  // Set cookie to bypass popup
  await page.setCookie({ name: 'choix_site', value: 'dgd', domain: 'www.dentalgooddeal.com' });

  const progress = loadProgress();
  const completedCatSet = new Set(progress.completedCategories || []);
  const completedGammeSet = new Set(progress.completedGammes || []);

  // Phase 1: Discover all categories
  log('\n📂 Phase 1: Découverte de toutes les catégories...');
  const allCategories = progress.discoveredCategories?.length > 50
    ? progress.discoveredCategories
    : await discoverCategories(page, ROOT_CATEGORIES);
  progress.discoveredCategories = allCategories;
  saveProgress(progress);
  log(`  ${allCategories.length} catégories découvertes au total`);

  // Phase 2: Scrape each category
  log('\n🛒 Phase 2: Scraping produits par catégorie...');
  let totalGammes = 0;

  for (let ci = 0; ci < allCategories.length; ci++) {
    const catUrl = allCategories[ci];
    if (completedCatSet.has(catUrl)) continue;

    const catName = catUrl.replace('/categorie_', '').replace('.html', '').replace(/_\d+$/, '').replace(/_/g, ' ');

    // Scrape first page
    const result = await scrapeCategoryProducts(page, catUrl, progress);

    // Save direct products (gamme-level)
    let newCount = 0;
    for (const p of result.directProducts) {
      if (p.name && p.name.length > 2) {
        const key = `${p.name}__${p.price}`.toLowerCase().replace(/\s+/g, ' ');
        if (!progress.products[key]) {
          progress.products[key] = {
            name: p.name,
            priceText: p.price,
            oldPriceText: p.oldPrice,
            category: catName,
            url: p.url,
            imageUrl: p.img,
          };
          newCount++;
        }
      }
    }

    // Scrape gamme detail pages for individual products
    for (const gamme of result.gammeLinks) {
      if (completedGammeSet.has(gamme.url)) continue;

      const gammeProducts = await scrapeGammePage(page, BASE_URL + gamme.url, progress);
      for (const gp of gammeProducts) {
        if (gp.name && gp.name.length > 2) {
          const key = `${gp.name}__${gp.price}`.toLowerCase().replace(/\s+/g, ' ');
          if (!progress.products[key]) {
            progress.products[key] = {
              name: gp.name,
              priceText: gp.price,
              oldPriceText: gp.oldPrice || '',
              category: catName,
              ref: gp.ref || '',
              url: BASE_URL + gamme.url,
              imageUrl: gp.img || '',
            };
            newCount++;
          }
        }
      }
      completedGammeSet.add(gamme.url);
      totalGammes++;
      await new Promise(r => setTimeout(r, 800));
    }

    // Handle pagination
    for (const pageNum of result.nextPages) {
      const pageUrl = catUrl.replace('.html', `_page_${pageNum}.html`);
      if (completedCatSet.has(pageUrl)) continue;

      const pageResult = await scrapeCategoryProducts(page, pageUrl, progress);
      for (const p of pageResult.directProducts) {
        if (p.name && p.name.length > 2) {
          const key = `${p.name}__${p.price}`.toLowerCase().replace(/\s+/g, ' ');
          if (!progress.products[key]) {
            progress.products[key] = {
              name: p.name, priceText: p.price, oldPriceText: p.oldPrice,
              category: catName, url: p.url, imageUrl: p.img,
            };
            newCount++;
          }
        }
      }

      // Also scrape gammes from paginated pages
      for (const gamme of pageResult.gammeLinks) {
        if (completedGammeSet.has(gamme.url)) continue;
        const gammeProducts = await scrapeGammePage(page, BASE_URL + gamme.url, progress);
        for (const gp of gammeProducts) {
          if (gp.name && gp.name.length > 2) {
            const key = `${gp.name}__${gp.price}`.toLowerCase().replace(/\s+/g, ' ');
            if (!progress.products[key]) {
              progress.products[key] = {
                name: gp.name, priceText: gp.price, oldPriceText: gp.oldPrice || '',
                category: catName, ref: gp.ref || '', url: BASE_URL + gamme.url,
              };
              newCount++;
            }
          }
        }
        completedGammeSet.add(gamme.url);
        totalGammes++;
        await new Promise(r => setTimeout(r, 800));
      }

      completedCatSet.add(pageUrl);
      await new Promise(r => setTimeout(r, 1000));
    }

    completedCatSet.add(catUrl);
    const totalProducts = Object.keys(progress.products).length;
    log(`  [${ci+1}/${allCategories.length}] ${catName}: +${newCount} (total: ${totalProducts}, gammes: ${totalGammes})`);

    // Save every 5 categories
    if ((ci + 1) % 5 === 0) {
      progress.completedCategories = Array.from(completedCatSet);
      progress.completedGammes = Array.from(completedGammeSet);
      saveProgress(progress);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  // Final save
  progress.completedCategories = Array.from(completedCatSet);
  progress.completedGammes = Array.from(completedGammeSet);
  saveProgress(progress);

  const totalProducts = Object.keys(progress.products).length;
  log('\n═══════════════════════════════════════════════');
  log(`DGD DEEP TERMINÉ`);
  log(`Catégories: ${allCategories.length}`);
  log(`Gammes visitées: ${totalGammes}`);
  log(`Produits: ${totalProducts}`);
  log('═══════════════════════════════════════════════');

  // Import to Supabase
  log('\n📦 Import vers Supabase...');
  const allProds = Object.values(progress.products);
  for (let i = 0; i < allProds.length; i += 500) {
    const batch = allProds.slice(i, i + 500).map(p => {
      const price = p.priceText ? parseFloat(p.priceText.replace(/[^\d,.\-]/g, '').replace(',', '.')) : null;
      const oldPrice = p.oldPriceText ? parseFloat(p.oldPriceText.replace(/[^\d,.\-]/g, '').replace(',', '.')) : null;
      return { name: p.name, price, price_original: oldPrice, ref: p.ref || '', category: p.category || '', url: p.url || '' };
    }).filter(p => p.name);

    try {
      const postData = JSON.stringify({ source: 'dentalgooddeal', products: batch });
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
      log(`  Import batch ${Math.floor(i/500)+1}: ${batch.length} OK`);
    } catch (e) {
      log(`  Import erreur: ${e.message}`);
    }
  }

  await browser.close();
}

main().catch(err => {
  log(`ERREUR FATALE: ${err.message}`);
  process.exit(1);
});
