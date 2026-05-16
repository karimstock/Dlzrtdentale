#!/usr/bin/env node
// =============================================
// JADOMI — Scraper par recherche exhaustive
// Strategie : requetes search a-z, aa-zz, mots-cles dentaires, numeros
// Usage: node scrape-by-search.js --site dentalachat
//        node scrape-by-search.js --all-search
// =============================================

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const { getAllSites, getSiteByName } = require('./scrape-all-sites');

// =============================================
// SEARCH QUERIES — exhaustive coverage
// =============================================

const SINGLE_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

function generateTwoLetterCombos() {
  const combos = [];
  for (const a of SINGLE_LETTERS) {
    for (const b of SINGLE_LETTERS) {
      combos.push(a + b);
    }
  }
  return combos;
}

const DENTAL_KEYWORDS = [
  // Consommables
  'composite', 'resine', 'ciment', 'adhesif', 'bonding', 'colle',
  'amalgame', 'ceramique', 'zircone', 'disilicate', 'lithium',
  'empreinte', 'alginate', 'silicone', 'polyether', 'plaque',
  // Instruments
  'fraise', 'turbine', 'contre-angle', 'detartreur', 'spatule',
  'miroir', 'sonde', 'precelle', 'pince', 'daviers', 'elevateur',
  'syndesmotome', 'curette', 'excavateur', 'fouloir', 'brunissoir',
  // Endodontie
  'lime', 'endodontie', 'gutta', 'percha', 'obturation', 'irrigation',
  'hypochlorite', 'edta', 'localisateur', 'apex', 'rotary',
  // Implantologie
  'implant', 'pilier', 'vis', 'membrane', 'greffe', 'osseuse',
  'titane', 'straumann', 'nobel', 'biomet', 'zimmer',
  // Orthodontie
  'bracket', 'arc', 'elastique', 'aligneur', 'gouttiere',
  // Prophylaxie
  'prophylaxie', 'polissage', 'detartrage', 'fluor', 'vernis',
  'brossette', 'cupule', 'pate', 'bicarbonate',
  // Radiologie
  'capteur', 'radio', 'panoramique', 'cone', 'beam', 'phosphore',
  // Hygiene / Protection
  'gant', 'masque', 'desinfectant', 'sterilisation', 'autoclave',
  'sachet', 'bavette', 'serviette', 'aspiration', 'canule',
  // Prothese
  'prothese', 'couronne', 'bridge', 'inlay', 'onlay', 'facette',
  'provisoire', 'temporaire', 'articulateur', 'cire', 'platre',
  // Equipement
  'fauteuil', 'unit', 'lampe', 'photopolymeriser', 'scialytique',
  'compresseur', 'aspirateur', 'meuble', 'tabouret',
  // Marques courantes
  'dentsply', 'kerr', 'ivoclar', 'voco', 'gc', 'coltene',
  'septodont', 'hu-friedy', 'nsk', 'kavo', 'bien-air', 'w&h',
  'planmeca', 'acteon', 'ems', 'mectron', 'ultradent',
];

const NUMBER_PREFIXES = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '10', '20', '30', '40', '50', '100', '200', '500',
];

// =============================================
// SELECTOR SETS by platform type
// =============================================

const SELECTOR_SETS = {
  prestashop: {
    productCard: '.product-miniature,.js-product-miniature,.card-product',
    productName: '.product-title a,.product-name a,h2 a,h3 a',
    price: '.price,.product-price,.current-price .price',
    image: '.product-thumbnail img,.product-image img,.product-cover img',
  },
  magento: {
    // Magento 2 Hyva (Mega, Doctor-AI) + Magento 1 (B2B-Dental)
    productCard: 'form.product-item,.product-item,.products-grid > li.item,.products-grid .item,.category-products li.item',
    productName: 'a.product-item-link,.product-item-link,h3 a,h2.product-name a,.product-name a,a.product-name',
    price: '[data-price-amount],[data-price-type="finalPrice"] .price,.price-box .price,.regular-price .price,.special-price .price,.price',
    image: '.product-image-photo,a.product-image img,.product-image img',
  },
  woocommerce: {
    productCard: 'li.product,.type-product,.product-type-simple,.product-type-variable',
    productName: '.woocommerce-loop-product__title,h2 a,h3 a,.product-title a',
    price: '.price ins .woocommerce-Price-amount,.price .woocommerce-Price-amount,.price',
    image: '.wp-post-image,.attachment-woocommerce_thumbnail',
  },
  generic: {
    productCard: '[data-product-id],article.product,.product-card,.product-item,.product,.item,.grid_wrap,.products-grid li',
    productName: 'h2 a,h3 a,.product-title a,.product-name a,a.product-name,.product-item-link',
    price: '[data-price-amount],.price,.product-price,.money,.regular-price .price,.special-price .price',
    image: '.product-image img,.product-thumbnail img,img.product,.wp-post-image',
  },
};

// =============================================
// PROGRESS FILE management
// =============================================

function getProgressPath(siteName) {
  return `/tmp/search-progress-${siteName}.json`;
}

function loadProgress(siteName) {
  const p = getProgressPath(siteName);
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      return { completedQueries: [], products: {} };
    }
  }
  return { completedQueries: [], products: {} };
}

function saveProgress(siteName, progress) {
  fs.writeFileSync(getProgressPath(siteName), JSON.stringify(progress, null, 2));
}

// =============================================
// LOGGING
// =============================================

function getLogger(siteName) {
  const logPath = `/tmp/search-${siteName}.log`;
  const stream = fs.createWriteStream(logPath, { flags: 'a' });
  return {
    log: (msg) => {
      const line = `[${new Date().toISOString()}] ${msg}`;
      console.log(line);
      stream.write(line + '\n');
    },
    close: () => stream.end(),
  };
}

// =============================================
// PRICE PARSING
// =============================================

function parsePrice(text) {
  if (!text) return null;
  // Remove currency symbols, spaces, replace comma with dot
  const cleaned = text.replace(/[^\d,.\-]/g, '').replace(',', '.');
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

// =============================================
// PRODUCT EXTRACTION from a page
// =============================================

async function extractProducts(page, siteConfig) {
  const siteSelectors = siteConfig.selectors || {};
  const typeDefaults = SELECTOR_SETS[siteConfig.type] || SELECTOR_SETS.generic;

  // Merge: site-specific selectors take priority
  const sel = {
    productCard: siteSelectors.productCard || typeDefaults.productCard,
    productName: siteSelectors.productName || typeDefaults.productName,
    price: siteSelectors.price || typeDefaults.price,
    image: siteSelectors.image || typeDefaults.image,
  };

  return page.evaluate((sel) => {
    const products = [];
    const cardSelectors = sel.productCard.split(',');
    let cards = [];
    for (const cs of cardSelectors) {
      const found = document.querySelectorAll(cs.trim());
      if (found.length > 0) {
        cards = Array.from(found);
        break;
      }
    }

    // Fallback: try all card selectors combined
    if (cards.length === 0) {
      cards = Array.from(document.querySelectorAll(sel.productCard));
    }

    for (const card of cards) {
      // Name — try multiple strategies
      let name = '';
      for (const ns of sel.productName.split(',')) {
        const el = card.querySelector(ns.trim());
        if (el) {
          name = (el.getAttribute('title') || el.textContent || '').trim();
          // Clean up multiline names (Hyva theme)
          name = name.replace(/\s+/g, ' ').trim();
          if (name.length > 2) break;
        }
      }
      // Fallback: try title attribute on product link
      if (!name || name.length <= 2) {
        const titleLink = card.querySelector('a[title]');
        if (titleLink) name = titleLink.getAttribute('title').trim();
      }

      // Price — handle data attributes AND text
      let priceText = '';
      // Method 1: data-price-amount (Magento 2)
      const priceDataEl = card.querySelector('[data-price-amount]');
      if (priceDataEl) {
        priceText = priceDataEl.getAttribute('data-price-amount');
      }
      // Method 2: CSS selector text
      if (!priceText) {
        for (const ps of sel.price.split(',')) {
          const s = ps.trim();
          if (s === '[data-price-amount]') continue; // already tried
          const el = card.querySelector(s);
          if (el) { priceText = (el.getAttribute('content') || el.textContent || '').trim(); break; }
        }
      }
      // Method 3: regex on card text
      if (!priceText) {
        const cardText = card.innerText || '';
        const priceMatch = cardText.match(/(\d[\d\s]*[.,]\d{2})\s*(\u20ac|EUR|€)/);
        if (priceMatch) priceText = priceMatch[1].replace(/\s/g, '');
      }

      // Image
      let imageUrl = '';
      for (const is of sel.image.split(',')) {
        const el = card.querySelector(is.trim());
        if (el) {
          imageUrl = el.src || el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || '';
          break;
        }
      }

      // URL
      let url = '';
      const link = card.querySelector('a[href]');
      if (link) url = link.href;

      // SKU
      let ref = '';
      const skuEl = card.querySelector('[data-id-product],[data-sku],[data-product-id],input[name="product"]');
      if (skuEl) {
        ref = skuEl.getAttribute('data-id-product')
          || skuEl.getAttribute('data-sku')
          || skuEl.getAttribute('data-product-id')
          || skuEl.getAttribute('value')
          || '';
      }

      // Old Price / Prix barré (promo detection)
      let oldPriceText = '';
      // Magento 2: data-price-type="oldPrice"
      const oldPriceDataEl = card.querySelector('[data-price-type="oldPrice"] [data-price-amount],[data-price-type="oldPrice"]');
      if (oldPriceDataEl) {
        oldPriceText = oldPriceDataEl.getAttribute('data-price-amount') || '';
      }
      // PrestaShop: .regular-price, .old-price
      if (!oldPriceText) {
        const oldPriceSels = '.regular-price,.old-price,.old-price .price,.price--was,.was-price,.price-old,.prix-barre,.compare-at-price,del .woocommerce-Price-amount,[data-price-type="oldPrice"] .price,.price del';
        for (const ops of oldPriceSels.split(',')) {
          const el = card.querySelector(ops.trim());
          if (el) {
            oldPriceText = (el.getAttribute('content') || el.textContent || '').trim();
            if (oldPriceText) break;
          }
        }
      }
      // Magento Hyva: look for "au lieu de XX,XX €" text
      if (!oldPriceText) {
        const cardText = card.innerText || '';
        const oldMatch = cardText.match(/au lieu de\s*(\d[\d\s]*[.,]\d{2})/i);
        if (oldMatch) oldPriceText = oldMatch[1].replace(/\s/g, '');
      }

      // Discount percentage
      let discount = '';
      const discountEl = card.querySelector('.discount,.discount-percentage,.badge-discount,.promo-label,.price-percent-reduction,.sale-badge');
      if (discountEl) discount = discountEl.textContent.trim();
      if (!discount) {
        const cardText = card.innerText || '';
        const discMatch = cardText.match(/(-\d+%)/);
        if (discMatch) discount = discMatch[1];
      }

      // Brand (Magento 1: .desc_grid)
      let brand = '';
      const brandEl = card.querySelector('.desc_grid,.brand,.manufacturer,.product-brand,[itemprop="brand"],.product-brand-name,.manufacturer-name');
      if (brandEl) brand = brandEl.textContent.trim();

      if (name && name.length > 2) {
        products.push({ name, priceText, oldPriceText, discount, imageUrl, url, ref, brand });
      }
    }
    return products;
  }, sel);
}

// =============================================
// PAGINATION — detect and follow next pages
// =============================================

async function getNextPageUrl(page, siteConfig) {
  const nextSel = siteConfig.selectors?.nextPage || 'a[rel="next"],.pagination a.next,.pages a.next';
  return page.evaluate((sel) => {
    for (const s of sel.split(',')) {
      const links = document.querySelectorAll(s.trim());
      // Find the "next" link (last one, or one with "next" text/class)
      for (const link of links) {
        const text = (link.textContent || '').trim().toLowerCase();
        const cls = link.className || '';
        const rel = link.getAttribute('rel') || '';
        if (rel === 'next' || text === 'next' || text === 'suivant' || text === '>'
          || text === '>>' || cls.includes('next')) {
          return link.href || null;
        }
      }
      // If we have numbered pages, find current and get next
      if (links.length > 0) {
        const current = document.querySelector('.pages .current,.pagination .active,.page-current');
        if (current) {
          const next = current.nextElementSibling;
          if (next && next.tagName === 'A') return next.href || null;
          if (next) {
            const a = next.querySelector('a');
            if (a) return a.href || null;
          }
        }
      }
    }
    return null;
  }, nextSel);
}

// =============================================
// SEARCH ONE QUERY on one site
// =============================================

async function searchQuery(page, siteConfig, query, logger) {
  const searchUrl = siteConfig.baseUrl + siteConfig.searchUrlPattern + encodeURIComponent(query);
  const allProducts = [];
  let pageNum = 1;
  // Magento returns many results per letter - allow more pages
  const isMagento = siteConfig.type === 'magento';
  const maxPages = isMagento ? 100 : 30; // Magento: 100 pages (3200 produits/lettre), autres: 30
  let currentUrl = searchUrl;

  while (pageNum <= maxPages) {
    try {
      await page.goto(currentUrl, { waitUntil: 'networkidle2', timeout: 25000 });

      // Wait for dynamic content (Alpine.js, Hyva, etc.)
      await new Promise(r => setTimeout(r, 1200));

      const products = await extractProducts(page, siteConfig);

      if (products.length === 0) {
        if (pageNum === 1) logger.log(`  [${query}] page 1: 0 produits (selecteurs: ${siteConfig.type})`);
        break;
      }

      // Tag products with search category
      for (const p of products) {
        p.searchQuery = query;
        allProducts.push(p);
      }

      logger.log(`  [${query}] page ${pageNum}: ${products.length} produits`);

      // Check for next page
      const nextUrl = await getNextPageUrl(page, siteConfig);
      if (!nextUrl || nextUrl === currentUrl) break;

      currentUrl = nextUrl;
      pageNum++;

      // Delay between pagination
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      logger.log(`  [${query}] page ${pageNum} ERREUR: ${err.message}`);
      break;
    }
  }

  return allProducts;
}

// =============================================
// IMPORT to Supabase via API
// =============================================

async function importProducts(siteName, products, batchNum) {
  if (products.length === 0) return;

  const batchSize = 200;
  let imported = 0;

  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize).map(p => {
      const price = parsePrice(p.priceText);
      const oldPrice = parsePrice(p.oldPriceText);
      return {
        name: p.name,
        price,
        price_original: oldPrice || null,
        discount: oldPrice && price ? Math.round((1 - price / oldPrice) * 100) : (p.discount ? parseInt(p.discount) : null),
        ref: p.ref || '',
        category: `Recherche: ${p.searchQuery || 'unknown'}`,
        url: p.url || '',
        brand: p.brand || null,
        image_url: p.imageUrl || null,
      };
    });

    try {
      const resp = await fetch('http://127.0.0.1:3001/api/scan/import-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: siteName,
          products: batch,
          page: `search-batch-${batchNum}-${Math.floor(i / batchSize) + 1}`,
        }),
      });
      if (resp.ok) {
        imported += batch.length;
      } else {
        console.error(`Import batch failed: ${resp.status} ${resp.statusText}`);
      }
    } catch (err) {
      console.error(`Import error: ${err.message}`);
    }
  }

  return imported;
}

// =============================================
// SCRAPE ONE SITE via search
// =============================================

async function scrapeSiteBySearch(siteConfig, querySet = 'full') {
  const siteName = siteConfig.name;
  const logger = getLogger(siteName);

  if (!siteConfig.searchUrlPattern) {
    logger.log(`SKIP ${siteName}: pas de searchUrlPattern configure`);
    logger.close();
    return;
  }

  logger.log(`========== DEBUT SCRAPE SEARCH: ${siteName} ==========`);
  logger.log(`URL: ${siteConfig.baseUrl}`);
  logger.log(`Type: ${siteConfig.type}`);
  logger.log(`Search pattern: ${siteConfig.searchUrlPattern}`);

  // Build query list — adapted per platform
  const isMagento = siteConfig.type === 'magento';
  let queries = [];
  if (querySet === 'quick') {
    if (isMagento) {
      // Magento: letters return ALL products matching — 26 letters covers the catalog
      queries = [...SINGLE_LETTERS];
    } else {
      queries = [...SINGLE_LETTERS, ...DENTAL_KEYWORDS.slice(0, 20)];
    }
  } else if (querySet === 'keywords') {
    queries = [...DENTAL_KEYWORDS, ...NUMBER_PREFIXES];
  } else {
    // full mode
    if (isMagento) {
      // Magento: 26 letters + keywords to catch anything missed
      queries = [...SINGLE_LETTERS, ...DENTAL_KEYWORDS, ...NUMBER_PREFIXES];
    } else {
      // PrestaShop/WooCommerce: need exhaustive search — letters + 2-letter combos + all keywords + numbers
      queries = [...SINGLE_LETTERS, ...DENTAL_KEYWORDS, ...NUMBER_PREFIXES, ...generateTwoLetterCombos()];
    }
  }

  logger.log(`Total requetes prevues: ${queries.length}`);

  // Load progress
  const progress = loadProgress(siteName);
  const completedSet = new Set(progress.completedQueries || []);
  const allProducts = progress.products || {};
  let newProductCount = 0;
  let totalSkipped = 0;

  // Filter out completed queries
  const pendingQueries = queries.filter(q => !completedSet.has(q));
  logger.log(`Deja completees: ${completedSet.size}, restantes: ${pendingQueries.length}`);

  // Delay strategy
  const delay = (siteConfig.antiBotLevel === 'none') ? 1000 : 3000;
  logger.log(`Delai entre requetes: ${delay}ms`);

  // Launch browser
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,800',
    ],
  });

  let page = await browser.newPage();

  // Block heavy resources for speed (keep CSS — some sites need it for JS rendering)
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const type = req.resourceType();
    if (['image', 'font', 'media'].includes(type)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  // Set realistic viewport and user agent
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  let batchNum = 1;
  let batchProducts = [];
  const SAVE_EVERY = 100;

  try {
    for (let i = 0; i < pendingQueries.length; i++) {
      const query = pendingQueries[i];

      try {
        const products = await searchQuery(page, siteConfig, query, logger);

        // Deduplicate by name+price
        for (const p of products) {
          const key = `${p.name}__${p.priceText}`.toLowerCase().replace(/\s+/g, ' ');
          if (!allProducts[key]) {
            allProducts[key] = p;
            newProductCount++;
            batchProducts.push(p);
          }
        }

        completedSet.add(query);

        // Save progress every SAVE_EVERY products or every 50 queries
        if (batchProducts.length >= SAVE_EVERY || (i > 0 && i % 50 === 0)) {
          progress.completedQueries = Array.from(completedSet);
          progress.products = allProducts;
          saveProgress(siteName, progress);

          // Import batch
          if (batchProducts.length > 0) {
            const imported = await importProducts(siteName, batchProducts, batchNum);
            logger.log(`>>> IMPORT batch ${batchNum}: ${imported} produits envoyes`);
            batchNum++;
            batchProducts = [];
          }
        }

        // Progress log
        if ((i + 1) % 25 === 0) {
          const uniqueCount = Object.keys(allProducts).length;
          logger.log(`--- Progression: ${i + 1}/${pendingQueries.length} requetes, ${uniqueCount} produits uniques ---`);
        }

        // Delay between queries
        await new Promise(r => setTimeout(r, delay));
      } catch (err) {
        logger.log(`ERREUR query "${query}": ${err.message}`);
        completedSet.add(query); // Mark as done to avoid infinite retry

        // Recover from detached frame / browser crash
        if (err.message.includes('detached') || err.message.includes('Target closed') || err.message.includes('Session closed')) {
          logger.log(`  Navigateur crash detecte — redemarrage page...`);
          try {
            await page.close().catch(() => {});
            page = await browser.newPage();
            await page.setRequestInterception(true);
            page.on('request', (req) => {
              const type = req.resourceType();
              if (['image', 'font', 'media'].includes(type)) { req.abort(); } else { req.continue(); }
            });
            await page.setViewport({ width: 1280, height: 800 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            logger.log(`  Page recreee OK`);
          } catch (recoverErr) {
            logger.log(`  Impossible de recreer la page: ${recoverErr.message}`);
          }
        }
      }
    }

    // Final save & import
    progress.completedQueries = Array.from(completedSet);
    progress.products = allProducts;
    saveProgress(siteName, progress);

    if (batchProducts.length > 0) {
      const imported = await importProducts(siteName, batchProducts, batchNum);
      logger.log(`>>> IMPORT batch final ${batchNum}: ${imported} produits envoyes`);
    }

    const totalUnique = Object.keys(allProducts).length;
    logger.log(`========== FIN SCRAPE SEARCH: ${siteName} ==========`);
    logger.log(`Total produits uniques: ${totalUnique}`);
    logger.log(`Nouveaux cette session: ${newProductCount}`);

  } catch (err) {
    logger.log(`ERREUR FATALE: ${err.message}`);
  } finally {
    await browser.close();
    logger.close();
  }
}

// =============================================
// CLI
// =============================================

async function main() {
  const args = process.argv.slice(2);

  let siteName = null;
  let allSearch = false;
  let querySet = 'full';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--site' && args[i + 1]) {
      siteName = args[i + 1];
      i++;
    } else if (args[i] === '--all-search') {
      allSearch = true;
    } else if (args[i] === '--quick') {
      querySet = 'quick';
    } else if (args[i] === '--keywords') {
      querySet = 'keywords';
    } else if (args[i] === '--help') {
      console.log(`
JADOMI Search Scraper — Scraping exhaustif par recherche

Usage:
  node scrape-by-search.js --site <nom>      Scraper un site
  node scrape-by-search.js --all-search       Scraper tous les sites avec search
  node scrape-by-search.js --site <nom> --quick   Mode rapide (a-z + 20 keywords)
  node scrape-by-search.js --site <nom> --keywords   Keywords + numeros seulement

Options:
  --site <nom>     Nom du site (ex: dentalachat, b2b-dental)
  --all-search     Lancer sur tous les sites ayant un searchUrlPattern
  --quick          Mode rapide: 26 lettres + 20 keywords
  --keywords       Mode keywords: mots dentaires + numeros
  --help           Afficher cette aide

Sites disponibles avec recherche:
`);
      const sites = getAllSites().filter(s => s.searchUrlPattern);
      for (const s of sites) {
        console.log(`  ${s.name.padEnd(25)} ${s.type.padEnd(15)} ${s.searchUrlPattern}`);
      }
      process.exit(0);
    }
  }

  if (!siteName && !allSearch) {
    console.error('Erreur: specifiez --site <nom> ou --all-search');
    console.error('Utilisez --help pour voir les options');
    process.exit(1);
  }

  if (siteName) {
    const site = getSiteByName(siteName);
    if (!site) {
      console.error(`Site inconnu: ${siteName}`);
      console.error('Sites disponibles:', getAllSites().map(s => s.name).join(', '));
      process.exit(1);
    }
    await scrapeSiteBySearch(site, querySet);
  }

  if (allSearch) {
    const sites = getAllSites().filter(s => s.searchUrlPattern);
    console.log(`Lancement sur ${sites.length} sites avec searchUrlPattern...`);
    for (const site of sites) {
      console.log(`\n>>> ${site.name} <<<`);
      await scrapeSiteBySearch(site, querySet);
    }
  }
}

main().catch(err => {
  console.error('Erreur fatale:', err);
  process.exit(1);
});
