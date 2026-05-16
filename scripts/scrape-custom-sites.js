#!/usr/bin/env node
// =============================================
// JADOMI — Scraper pour sites custom (non-compatibles search GET)
// Sites : DentalGoodDeal (custom CMS), Henry Schein (ASP.NET B2B), DentalTix (Drupal)
// Usage : node scrape-custom-sites.js --site dentalgooddeal
//         node scrape-custom-sites.js --site henryschein
//         node scrape-custom-sites.js --site dentaltix
//         node scrape-custom-sites.js --all
// =============================================

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const http = require('http');

puppeteer.use(StealthPlugin());

// =============================================
// CONFIG
// =============================================

const IMPORT_URL = 'http://127.0.0.1:3001/api/scan/import-prices';
const DELAY_MS = 1500;
const T = Date.now();

// Known DentalGoodDeal categories (discovered manually)
const DGD_KNOWN_CATEGORIES = [
  'https://www.dentalgooddeal.com/categorie_cfao_68174.html',
  'https://www.dentalgooddeal.com/categorie_empreintes_67637.html',
  'https://www.dentalgooddeal.com/categorie_laboratoire_67447.html',
  'https://www.dentalgooddeal.com/categorie_couronnes_67120.html',
  'https://www.dentalgooddeal.com/categorie_ciments_66751.html',
  'https://www.dentalgooddeal.com/categorie_anesthesie_66644.html',
  'https://www.dentalgooddeal.com/categorie_radiographie_66432.html',
  'https://www.dentalgooddeal.com/categorie_vetements_66357.html',
  'https://www.dentalgooddeal.com/categorie_instruments_rotatifs_65952.html',
  'https://www.dentalgooddeal.com/categorie_hygiene_et_sterilisation_65436.html',
  'https://www.dentalgooddeal.com/categorie_restauration_64571.html',
  'https://www.dentalgooddeal.com/categorie_orthodontie_64086.html',
  'https://www.dentalgooddeal.com/categorie_implantologie_63768.html',
  'https://www.dentalgooddeal.com/categorie_prophylaxie_63522.html',
  'https://www.dentalgooddeal.com/categorie_pivots_63348.html',
];

// =============================================
// HELPERS
// =============================================

function elapsed() { return Math.round((Date.now() - T) / 1000) + 's'; }

function log(site, msg) {
  const line = `[JADOMI ${elapsed()}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(`/tmp/custom-${site}.log`, line + '\n');
  } catch (e) { /* ignore */ }
}

function loadProgress(site) {
  const file = `/tmp/custom-progress-${site}.json`;
  try {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      log(site, `Reprise: ${data.products?.length || 0} produits, ${data.visitedUrls?.length || 0} URLs visitees`);
      return data;
    }
  } catch (e) { /* ignore */ }
  return { products: {}, visitedUrls: [], categoriesVisited: [], phase: 'categories' };
}

function saveProgress(site, state) {
  const file = `/tmp/custom-progress-${site}.json`;
  try {
    fs.writeFileSync(file, JSON.stringify(state, null, 2));
  } catch (e) { /* ignore */ }
}

function parsePrice(text) {
  if (!text) return null;
  // Handle "70,20 €", "81.10€", "1 234,56 €"
  const cleaned = text.replace(/\s/g, '').replace(/[^0-9.,]/g, '').replace(',', '.');
  const val = parseFloat(cleaned);
  return (isNaN(val) || val <= 0) ? null : val;
}

function computeDiscount(price, priceOriginal) {
  if (!price || !priceOriginal || priceOriginal <= price) return null;
  return Math.round((1 - price / priceOriginal) * 100);
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms || DELAY_MS));
}

async function postImport(source, products) {
  const data = JSON.stringify({
    source,
    products: products.map(p => ({
      name: p.name,
      price: p.price,
      price_original: p.price_original || null,
      discount: p.discount || null,
      ref: p.ref || '',
      category: p.category || '',
      url: p.url || '',
      brand: p.brand || '',
      image_url: p.image_url || '',
    })),
    page: source + '-custom',
  });

  return new Promise((resolve) => {
    try {
      const u = new URL(IMPORT_URL);
      const req = http.request(
        {
          hostname: u.hostname,
          port: u.port,
          path: u.pathname,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        },
        (res) => {
          let body = '';
          res.on('data', d => (body += d));
          res.on('end', () => {
            try { resolve(JSON.parse(body)); } catch (e) { resolve({}); }
          });
        }
      );
      req.on('error', () => resolve({}));
      req.write(data);
      req.end();
    } catch (e) {
      resolve({});
    }
  });
}

// =============================================
// DENTALGOODDEAL — Custom CMS scraper
// =============================================

async function scrapeDentalGoodDeal() {
  const SITE = 'dentalgooddeal';
  const BASE = 'https://www.dentalgooddeal.com';
  log(SITE, '=== DENTALGOODDEAL — Scraper custom CMS ===');

  // Load progress
  const state = loadProgress(SITE);
  const products = state.products || {};
  const visitedUrls = new Set(state.visitedUrls || []);

  // Launch browser
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Block images and fonts for speed
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (type === 'image' || type === 'font' || type === 'media') {
        req.abort();
      } else {
        req.continue();
      }
    });

    // ---- PHASE 1: Discover categories from homepage ----
    log(SITE, 'Phase 1 — Decouverte des categories...');
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(1000);

    // Discover dynamic categories
    const dynamicCategories = await page.evaluate(() => {
      const links = new Set();
      document.querySelectorAll('a[href*="categorie"]').forEach(a => {
        const href = a.href;
        if (href.match(/categorie_\w+_\d+\.html/)) {
          links.add(href);
        }
      });
      return Array.from(links);
    });

    // Merge known + dynamic categories (deduplicated)
    const allCategories = [...new Set([...DGD_KNOWN_CATEGORIES, ...dynamicCategories])];
    log(SITE, `${allCategories.length} categories trouvees (${DGD_KNOWN_CATEGORIES.length} connues + ${dynamicCategories.length} dynamiques)`);

    // ---- PHASE 2: Visit each category, collect article links ----
    log(SITE, 'Phase 2 — Collecte des liens produits par categorie...');
    const articleUrls = new Set();

    for (let i = 0; i < allCategories.length; i++) {
      const catUrl = allCategories[i];
      // Extract category name for logging
      const catMatch = catUrl.match(/categorie_([^_]+)/);
      const catName = catMatch ? catMatch[1] : 'unknown';

      if (visitedUrls.has('cat:' + catUrl)) {
        log(SITE, `  [${i + 1}/${allCategories.length}] ${catName} — deja visitee, skip`);
        continue;
      }

      try {
        await page.goto(catUrl, { waitUntil: 'networkidle2', timeout: 20000 });
        await delay(DELAY_MS);

        // Collect article links on this category page
        const articles = await page.evaluate(() => {
          const links = new Set();
          document.querySelectorAll('a[href*="article"]').forEach(a => {
            const href = a.href;
            if (href.match(/article_\w+_\d+\.html/)) {
              links.add(href);
            }
          });
          return Array.from(links);
        });

        articles.forEach(url => articleUrls.add(url));

        // Check for pagination in the category (next page links)
        const subPages = await page.evaluate((base) => {
          const links = new Set();
          document.querySelectorAll('a[href]').forEach(a => {
            const href = a.href;
            if (href.match(/categorie_\w+_\d+_\d+\.html/) || href.match(/[?&]page=\d+/)) {
              links.add(href);
            }
          });
          return Array.from(links);
        }, BASE);

        // Visit sub-pages of this category
        for (const subPage of subPages) {
          if (visitedUrls.has('cat:' + subPage)) continue;
          try {
            await page.goto(subPage, { waitUntil: 'networkidle2', timeout: 20000 });
            await delay(DELAY_MS);
            const moreArticles = await page.evaluate(() => {
              const links = new Set();
              document.querySelectorAll('a[href*="article"]').forEach(a => {
                const href = a.href;
                if (href.match(/article_\w+_\d+\.html/)) {
                  links.add(href);
                }
              });
              return Array.from(links);
            });
            moreArticles.forEach(url => articleUrls.add(url));
            visitedUrls.add('cat:' + subPage);
          } catch (e) { /* skip sub-page */ }
        }

        visitedUrls.add('cat:' + catUrl);
        log(SITE, `  [${i + 1}/${allCategories.length}] ${catName}: +${articles.length} articles (total: ${articleUrls.size})`);
      } catch (e) {
        log(SITE, `  [${i + 1}/${allCategories.length}] ${catName}: ERREUR ${e.message}`);
      }

      // Save progress every 5 categories
      if (i % 5 === 0) {
        saveProgress(SITE, {
          products,
          visitedUrls: Array.from(visitedUrls),
          articleUrls: Array.from(articleUrls),
          phase: 'categories',
        });
      }
    }

    log(SITE, `\nPhase 2 terminee: ${articleUrls.size} articles a scraper\n`);

    // ---- PHASE 3: Visit each article page, extract product data ----
    log(SITE, 'Phase 3 — Extraction des produits...');
    const articleList = Array.from(articleUrls);
    let scraped = 0;

    for (let i = 0; i < articleList.length; i++) {
      const articleUrl = articleList[i];

      if (visitedUrls.has('art:' + articleUrl)) {
        continue;
      }

      try {
        await page.goto(articleUrl, { waitUntil: 'networkidle2', timeout: 20000 });
        await delay(DELAY_MS);

        // Extract product(s) from this article page
        const pageProducts = await page.evaluate((url) => {
          const results = [];

          // Get category from breadcrumb or page
          let category = '';
          const breadcrumb = document.querySelector('.breadcrumb, .fil_ariane, nav[aria-label]');
          if (breadcrumb) {
            const parts = breadcrumb.textContent.split(/[>\/»]/);
            if (parts.length > 1) category = parts[parts.length - 2].trim();
          }

          // Product name
          const h1 = document.querySelector('h1');
          const name = h1 ? h1.textContent.trim() : document.title.replace(/ - DentalGoodDeal.*$/i, '').trim();

          // Price
          const priceEl = document.querySelector('.gamme_prix');
          const priceText = priceEl ? priceEl.textContent.trim() : '';

          // Old price (promo)
          const oldPriceEl = document.querySelector('.gamme_prix_barre');
          const oldPriceText = oldPriceEl ? oldPriceEl.textContent.trim() : '';

          // Image
          const imgEl = document.querySelector('img[src*="article"], img[src*="produit"], .fiche_produit img, #zoom_image, .product_image img');
          const imageUrl = imgEl ? imgEl.src : '';

          // Brand — try to find from page content
          let brand = '';
          const brandEl = document.querySelector('.marque, .brand, [class*="marque"], [class*="brand"]');
          if (brandEl) brand = brandEl.textContent.trim();

          // Reference
          let ref = '';
          const refEl = document.querySelector('.reference, .ref, [class*="ref"]');
          if (refEl) {
            const refMatch = refEl.textContent.match(/(?:R[ée]f|Ref|REF)[.\s:]*([A-Z0-9\-]+)/i);
            if (refMatch) ref = refMatch[1];
          }

          // Check for variant table (multiple products on one page)
          const variantRows = document.querySelectorAll('table.gamme tr, .gamme_table tr, table[class*="produit"] tr');
          if (variantRows.length > 1) {
            // Multiple variants
            variantRows.forEach((row, idx) => {
              if (idx === 0) return; // skip header
              const cells = row.querySelectorAll('td');
              if (cells.length < 2) return;

              let variantName = name;
              const nameCell = cells[0];
              if (nameCell) {
                const cellText = nameCell.textContent.trim();
                if (cellText && cellText.length > 1) {
                  variantName = name + ' - ' + cellText;
                }
              }

              let variantPrice = null;
              let variantOldPrice = null;
              cells.forEach(cell => {
                const pEl = cell.querySelector('.gamme_prix');
                if (pEl) variantPrice = pEl.textContent.trim();
                const oEl = cell.querySelector('.gamme_prix_barre');
                if (oEl) variantOldPrice = oEl.textContent.trim();
              });

              // Fallback: parse price from cell text
              if (!variantPrice) {
                for (const cell of cells) {
                  const m = cell.textContent.match(/(\d[\d\s]*[.,]\d{2})\s*€/);
                  if (m) { variantPrice = m[0]; break; }
                }
              }

              if (variantName && variantPrice) {
                results.push({
                  name: variantName.substring(0, 300),
                  priceText: variantPrice,
                  oldPriceText: variantOldPrice || '',
                  category,
                  url,
                  brand,
                  ref: ref || '',
                  image_url: imageUrl,
                });
              }
            });
          }

          // If no variants found, use main product
          if (results.length === 0 && name && priceText) {
            results.push({
              name: name.substring(0, 300),
              priceText,
              oldPriceText,
              category,
              url,
              brand,
              ref: ref || '',
              image_url: imageUrl,
            });
          }

          return results;
        }, articleUrl);

        // Post-process: parse prices
        for (const p of pageProducts) {
          const price = parseFloat((p.priceText || '').replace(/\s/g, '').replace(/[^0-9.,]/g, '').replace(',', '.'));
          if (!price || price <= 0) continue;

          const oldPrice = p.oldPriceText
            ? parseFloat(p.oldPriceText.replace(/\s/g, '').replace(/[^0-9.,]/g, '').replace(',', '.'))
            : null;

          const key = p.name + '|' + (p.ref || '');
          if (!products[key]) {
            products[key] = {
              name: p.name,
              price,
              price_original: (oldPrice && oldPrice > price) ? oldPrice : null,
              discount: (oldPrice && oldPrice > price) ? computeDiscount(price, oldPrice) : null,
              ref: p.ref || '',
              category: p.category || '',
              url: p.url || '',
              brand: p.brand || '',
              image_url: p.image_url || '',
            };
          }
        }

        scraped++;
        visitedUrls.add('art:' + articleUrl);

        if (scraped % 10 === 0) {
          log(SITE, `  ${scraped}/${articleList.length} articles, ${Object.keys(products).length} produits`);
        }

        // Save progress every 25 articles
        if (scraped % 25 === 0) {
          saveProgress(SITE, {
            products,
            visitedUrls: Array.from(visitedUrls),
            articleUrls: Array.from(articleUrls),
            phase: 'articles',
          });
        }
      } catch (e) {
        log(SITE, `  Article ${i + 1}: ERREUR ${e.message}`);
        visitedUrls.add('art:' + articleUrl);
      }
    }

    // ---- PHASE 4: Import to Supabase ----
    const allProducts = Object.values(products);
    log(SITE, `\n=== TERMINE: ${allProducts.length} produits extraits ===`);

    // Save final backup
    const backupFile = `/home/ubuntu/jadomi/tmp/${SITE}-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      if (!fs.existsSync('/home/ubuntu/jadomi/tmp')) fs.mkdirSync('/home/ubuntu/jadomi/tmp', { recursive: true });
      fs.writeFileSync(backupFile, JSON.stringify(allProducts, null, 2));
      log(SITE, `Backup: ${backupFile}`);
    } catch (e) { log(SITE, `Backup erreur: ${e.message}`); }

    // Import by chunks of 500
    let totalImported = 0;
    for (let i = 0; i < allProducts.length; i += 500) {
      const chunk = allProducts.slice(i, i + 500);
      const batchNum = Math.floor(i / 500) + 1;
      try {
        const result = await postImport(SITE, chunk);
        totalImported += result.imported || 0;
        log(SITE, `  Lot ${batchNum}: ${result.imported || 0} importes`);
      } catch (e) {
        log(SITE, `  Lot ${batchNum}: ERREUR ${e.message}`);
      }
    }

    log(SITE, `Import: ${totalImported}/${allProducts.length}`);

    // Save final progress
    saveProgress(SITE, {
      products,
      visitedUrls: Array.from(visitedUrls),
      articleUrls: Array.from(articleUrls),
      phase: 'done',
      totalProducts: allProducts.length,
      totalImported,
    });
  } catch (e) {
    log(SITE, `ERREUR FATALE: ${e.message}`);
  } finally {
    await browser.close();
  }

  log(SITE, `Termine en ${elapsed()}`);
}

// =============================================
// HENRY SCHEIN — ASP.NET B2B (requires login)
// =============================================

async function scrapeHenrySchein() {
  const SITE = 'henryschein';
  log(SITE, '=== HENRY SCHEIN — ASP.NET B2B ===');
  log(SITE, 'ATTENTION: Ce site necessite une authentification B2B pour acceder au catalogue.');
  log(SITE, 'Les pages produit retournent "Page introuvable" sans session authentifiee.');
  log(SITE, 'Statut: SKIP — necessite credentials de connexion.');
  log(SITE, '');
  log(SITE, 'Pour activer ce scraper:');
  log(SITE, '  1. Obtenir des identifiants Henry Schein (compte pro)');
  log(SITE, '  2. Ajouter HENRYSCHEIN_USER et HENRYSCHEIN_PASS dans .env');
  log(SITE, '  3. Implementer le login ASP.NET (POST form avec __VIEWSTATE)');
  log(SITE, '');

  // Save status
  saveProgress(SITE, {
    status: 'requires_login',
    message: 'Site B2B necessitant authentification. Catalogue inaccessible sans connexion.',
    lastCheck: new Date().toISOString(),
  });

  log(SITE, `Termine en ${elapsed()}`);
}

// =============================================
// DENTALTIX — Drupal-based dental supply store
// =============================================

// Known DentalTix categories (30+ discovered)
const DENTALTIX_KNOWN_CATEGORIES = [
  '/fr/composites',
  '/fr/ciments-dentaires',
  '/fr/instrumentation-endodontie',
  '/fr/fraises',
  '/fr/implants',
  '/fr/empreinte',
  '/fr/aiguilles-et-seringues',
  '/fr/blanchiment-dentaire',
  '/fr/chirugie-et-parondoncie',
  '/fr/desinfection',
  '/fr/instrumentation-dentaire',
  '/fr/usage-unique',
  '/fr/orthodontie',
  '/fr/prophylaxie',
  '/fr/radiographie',
  '/fr/obturation-dentaire',
  '/fr/vetements-pour-cabinets-dentaires',
  '/fr/et-autres',
  '/fr/equipement-dentaire',
  '/fr/materiel-de-chirurgie-dentaire',
  '/fr/materiel-endodontique',
  '/fr/esthetique-et-restauration-dentaire',
  '/fr/mobiliers-dentaires',
  '/fr/materiel-de-prophylaxie',
  '/fr/appareils-de-radriographique',
  '/fr/rechanges-et-accesoires-dentaires',
  '/fr/instruments-rotatifs',
  '/fr/packs_speciaux',
  '/fr/cabinet-dentaire',
];

async function scrapeDentalTix() {
  const SITE = 'dentaltix';
  const BASE = 'https://www.dentaltix.com';
  log(SITE, '=== DENTALTIX — Scraper Drupal ===');

  // Load progress
  const state = loadProgress(SITE);
  const products = state.products || {};
  const visitedUrls = new Set(state.visitedUrls || []);

  // Launch browser
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Block images and fonts for speed
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (type === 'image' || type === 'font' || type === 'media') {
        req.abort();
      } else {
        req.continue();
      }
    });

    // ---- PHASE 1: Visit homepage + accept cookies ----
    log(SITE, 'Phase 1 — Visite homepage et acceptation cookies...');
    await page.goto(BASE + '/fr', { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(2000);

    // Accept cookie popup if present
    try {
      const cookieBtn = await page.$('button[id*="cookie"], button[class*="cookie"], .agree-button, #onetrust-accept-btn-handler, button[data-drupal-selector*="cookie"], .eu-cookie-compliance-agree-button, a.agree-button');
      if (cookieBtn) {
        await cookieBtn.click();
        log(SITE, '  Cookie popup accepte');
        await delay(1000);
      } else {
        // Try broader selectors for cookie consent
        const accepted = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button, a'));
          for (const btn of btns) {
            const text = (btn.textContent || '').toLowerCase().trim();
            if (text.includes('accepter') || text.includes('accept') || text.includes('agree') || text === 'ok' || text.includes('tout accepter')) {
              btn.click();
              return true;
            }
          }
          return false;
        });
        if (accepted) {
          log(SITE, '  Cookie popup accepte (texte)');
          await delay(1000);
        } else {
          log(SITE, '  Pas de cookie popup detecte');
        }
      }
    } catch (e) {
      log(SITE, '  Cookie popup: ' + e.message);
    }

    // ---- PHASE 2: Discover categories from navigation ----
    log(SITE, 'Phase 2 — Decouverte des categories...');

    const dynamicCategories = await page.evaluate(() => {
      const links = new Set();
      document.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href') || '';
        // Match /fr/something paths that look like categories
        if (href.match(/^\/fr\/[a-z0-9\-_]+$/i) && !href.match(/\/fr\/(user|cart|checkout|login|register|contact|node|search)$/i)) {
          links.add(href);
        }
      });
      return Array.from(links);
    });

    // Merge known + dynamic categories (deduplicated)
    const allCategoryPaths = [...new Set([...DENTALTIX_KNOWN_CATEGORIES, ...dynamicCategories])];
    log(SITE, `${allCategoryPaths.length} categories trouvees (${DENTALTIX_KNOWN_CATEGORIES.length} connues + ${dynamicCategories.length} dynamiques)`);

    // ---- PHASE 3: Visit each category, extract products directly ----
    log(SITE, 'Phase 3 — Extraction des produits par categorie...');
    let totalScraped = 0;

    for (let i = 0; i < allCategoryPaths.length; i++) {
      const catPath = allCategoryPaths[i];
      const catName = catPath.replace('/fr/', '');

      if (visitedUrls.has('cat:' + catPath)) {
        log(SITE, `  [${i + 1}/${allCategoryPaths.length}] ${catName} — deja visitee, skip`);
        continue;
      }

      let pageNum = 0;
      let hasNextPage = true;

      while (hasNextPage) {
        const catUrl = pageNum === 0
          ? BASE + catPath
          : BASE + catPath + '?page=' + pageNum;

        if (visitedUrls.has('page:' + catUrl)) {
          pageNum++;
          continue;
        }

        try {
          await page.goto(catUrl, { waitUntil: 'networkidle2', timeout: 25000 });
          await delay(DELAY_MS);

          // Extract products from category listing page
          const pageProducts = await page.evaluate((currentUrl, category) => {
            const results = [];
            // Select product elements — DentalTix uses class containing "product"
            const productEls = document.querySelectorAll('[class*="product"]');
            const seen = new Set();

            productEls.forEach(el => {
              // Skip tiny elements (nav items, labels etc.)
              if (el.offsetHeight < 50) return;

              // Product name
              let name = '';
              const nameEl = el.querySelector('h2, h3, h4, .product-title, .field--name-title, [class*="title"], a[class*="product"]');
              if (nameEl) name = nameEl.textContent.trim();
              if (!name) {
                const linkEl = el.querySelector('a[href*="/fr/"]');
                if (linkEl) name = linkEl.textContent.trim();
              }
              if (!name || name.length < 3) return;
              if (seen.has(name)) return;
              seen.add(name);

              // Product URL
              let url = '';
              const urlEl = el.querySelector('a[href*="/fr/"]');
              if (urlEl) url = urlEl.href;

              // Price — look for price elements
              let priceText = '';
              let oldPriceText = '';
              const priceEls = el.querySelectorAll('[class*="price"], .field--name-price, .commerce-price, .price');
              priceEls.forEach(pe => {
                const text = pe.textContent.trim();
                // Check for old/original price (struck-through or "before" price)
                if (pe.closest('[class*="old"], [class*="original"], [class*="regular"], del, s, [class*="before"]') ||
                    pe.tagName === 'DEL' || pe.tagName === 'S' ||
                    pe.classList.toString().match(/old|original|regular|before|was|crossed/i)) {
                  if (!oldPriceText && text.match(/\d/)) oldPriceText = text;
                } else {
                  if (!priceText && text.match(/\d/)) priceText = text;
                }
              });

              // Fallback: try to find price in any element with euro sign
              if (!priceText) {
                const allText = el.textContent;
                const priceMatch = allText.match(/(\d[\d\s]*[.,]\d{2})\s*€/);
                if (priceMatch) priceText = priceMatch[0];
              }

              // Image
              let imageUrl = '';
              const imgEl = el.querySelector('img[src], img[data-src]');
              if (imgEl) imageUrl = imgEl.src || imgEl.getAttribute('data-src') || '';

              // Brand
              let brand = '';
              const brandEl = el.querySelector('[class*="brand"], [class*="marque"], [class*="manufacturer"]');
              if (brandEl) brand = brandEl.textContent.trim();

              // Reference
              let ref = '';
              const refEl = el.querySelector('[class*="ref"], [class*="sku"]');
              if (refEl) {
                const refMatch = refEl.textContent.match(/(?:R[ée]f|Ref|REF|SKU)[.\s:]*([A-Z0-9\-]+)/i);
                if (refMatch) ref = refMatch[1];
                else ref = refEl.textContent.trim().substring(0, 50);
              }

              if (name && (priceText || url)) {
                results.push({
                  name: name.substring(0, 300),
                  priceText,
                  oldPriceText,
                  category,
                  url: url || currentUrl,
                  brand,
                  ref,
                  image_url: imageUrl,
                });
              }
            });

            return results;
          }, catUrl, catName);

          // Post-process: parse prices and add to products map
          let pageCount = 0;
          for (const p of pageProducts) {
            const price = parsePrice(p.priceText);
            if (!price) continue;

            const oldPrice = parsePrice(p.oldPriceText);
            const key = p.name + '|' + (p.ref || p.url || '');
            if (!products[key]) {
              products[key] = {
                name: p.name,
                price,
                price_original: (oldPrice && oldPrice > price) ? oldPrice : null,
                discount: (oldPrice && oldPrice > price) ? computeDiscount(price, oldPrice) : null,
                ref: p.ref || '',
                category: p.category || '',
                url: p.url || '',
                brand: p.brand || '',
                image_url: p.image_url || '',
              };
              pageCount++;
            }
          }

          totalScraped += pageCount;
          visitedUrls.add('page:' + catUrl);

          // Check for next page (pagination)
          hasNextPage = await page.evaluate((nextPageNum) => {
            // Look for pagination links
            const pagerLinks = document.querySelectorAll('.pager a, .pagination a, [class*="pager"] a, nav[class*="pag"] a, a[href*="?page="]');
            for (const link of pagerLinks) {
              const href = link.getAttribute('href') || '';
              if (href.includes('page=' + nextPageNum)) return true;
            }
            // Also check for a "next" link
            const nextLinks = document.querySelectorAll('a[rel="next"], .pager__item--next a, .next a, a[title="next"], li.next a');
            return nextLinks.length > 0;
          }, pageNum + 1);

          if (pageNum === 0) {
            log(SITE, `  [${i + 1}/${allCategoryPaths.length}] ${catName}: +${pageCount} produits (page 1${hasNextPage ? ', pagination...' : ''})`);
          } else {
            log(SITE, `    ${catName} page ${pageNum + 1}: +${pageCount} produits`);
          }

          pageNum++;

          // Safety: max 50 pages per category
          if (pageNum > 50) {
            log(SITE, `    ${catName}: limite 50 pages atteinte, passage a la categorie suivante`);
            hasNextPage = false;
          }
        } catch (e) {
          log(SITE, `  [${i + 1}/${allCategoryPaths.length}] ${catName} page ${pageNum + 1}: ERREUR ${e.message}`);
          hasNextPage = false;
        }
      }

      visitedUrls.add('cat:' + catPath);

      // Save progress every 3 categories
      if (i % 3 === 0) {
        saveProgress(SITE, {
          products,
          visitedUrls: Array.from(visitedUrls),
          phase: 'categories',
        });
      }
    }

    log(SITE, `\nPhase 3 terminee: ${Object.keys(products).length} produits extraits\n`);

    // ---- PHASE 4: Import to Supabase ----
    const allProducts = Object.values(products);
    log(SITE, `=== TERMINE: ${allProducts.length} produits extraits ===`);

    // Save final backup
    const backupFile = `/home/ubuntu/jadomi/tmp/${SITE}-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      if (!fs.existsSync('/home/ubuntu/jadomi/tmp')) fs.mkdirSync('/home/ubuntu/jadomi/tmp', { recursive: true });
      fs.writeFileSync(backupFile, JSON.stringify(allProducts, null, 2));
      log(SITE, `Backup: ${backupFile}`);
    } catch (e) { log(SITE, `Backup erreur: ${e.message}`); }

    // Import by chunks of 500
    let totalImported = 0;
    for (let i = 0; i < allProducts.length; i += 500) {
      const chunk = allProducts.slice(i, i + 500);
      const batchNum = Math.floor(i / 500) + 1;
      try {
        const result = await postImport(SITE, chunk);
        totalImported += result.imported || 0;
        log(SITE, `  Lot ${batchNum}: ${result.imported || 0} importes`);
      } catch (e) {
        log(SITE, `  Lot ${batchNum}: ERREUR ${e.message}`);
      }
    }

    log(SITE, `Import: ${totalImported}/${allProducts.length}`);

    // Save final progress
    saveProgress(SITE, {
      products,
      visitedUrls: Array.from(visitedUrls),
      phase: 'done',
      totalProducts: allProducts.length,
      totalImported,
    });
  } catch (e) {
    log(SITE, `ERREUR FATALE: ${e.message}`);
  } finally {
    await browser.close();
  }

  log(SITE, `Termine en ${elapsed()}`);
}

// =============================================
// MAIN
// =============================================

async function main() {
  const args = process.argv.slice(2);
  const siteArg = args.find((a, i) => args[i - 1] === '--site');
  const runAll = args.includes('--all');

  if (!siteArg && !runAll) {
    console.log('Usage:');
    console.log('  node scrape-custom-sites.js --site dentalgooddeal');
    console.log('  node scrape-custom-sites.js --site henryschein');
    console.log('  node scrape-custom-sites.js --site dentaltix');
    console.log('  node scrape-custom-sites.js --all');
    process.exit(1);
  }

  const site = (siteArg || '').toLowerCase();

  if (site === 'dentalgooddeal' || runAll) {
    await scrapeDentalGoodDeal();
  }

  if (site === 'henryschein' || runAll) {
    await scrapeHenrySchein();
  }

  if (site === 'dentaltix' || runAll) {
    await scrapeDentalTix();
  }

  if (!runAll && site !== 'dentalgooddeal' && site !== 'henryschein' && site !== 'dentaltix') {
    console.log(`Site inconnu: "${site}". Sites disponibles: dentalgooddeal, henryschein, dentaltix`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Erreur fatale:', e);
  process.exit(1);
});
