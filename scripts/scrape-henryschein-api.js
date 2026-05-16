#!/usr/bin/env node
// =============================================
// JADOMI — Scraper Henry Schein via API interne
// Utilise SearchAutoComplete.ashx (trouvé par interception réseau)
// + JSONRequestHandler.ashx pour les prix
// =============================================

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const PROGRESS_FILE = '/tmp/search-progress-henryschein.json';
const LOG_FILE = '/tmp/search-henryschein.log';

const SEARCH_KEYWORDS = [
  // Alphabet exhaustif
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  // Mots-clés dentaires
  'composite', 'resine', 'ciment', 'adhesif', 'bonding', 'colle',
  'amalgame', 'ceramique', 'zircone', 'disilicate', 'lithium',
  'empreinte', 'alginate', 'silicone', 'polyether', 'plaque',
  'fraise', 'turbine', 'contre-angle', 'detartreur', 'spatule',
  'miroir', 'sonde', 'precelle', 'pince', 'daviers', 'elevateur',
  'syndesmotome', 'curette', 'excavateur', 'fouloir', 'brunissoir',
  'lime', 'endodontie', 'gutta', 'percha', 'obturation', 'irrigation',
  'hypochlorite', 'edta', 'localisateur', 'apex', 'rotary',
  'implant', 'pilier', 'vis', 'membrane', 'greffe', 'osseuse',
  'titane', 'straumann', 'nobel', 'biomet', 'zimmer',
  'bracket', 'arc', 'elastique', 'aligneur', 'gouttiere',
  'prophylaxie', 'polissage', 'detartrage', 'fluor', 'vernis',
  'brossette', 'cupule', 'pate', 'bicarbonate',
  'capteur', 'radio', 'panoramique', 'cone', 'beam', 'phosphore',
  'gant', 'masque', 'desinfectant', 'sterilisation', 'autoclave',
  'sachet', 'bavette', 'serviette', 'aspiration', 'canule',
  'prothese', 'couronne', 'bridge', 'inlay', 'onlay', 'facette',
  'provisoire', 'temporaire', 'articulateur', 'cire', 'platre',
  'fauteuil', 'unit', 'lampe', 'photopolymeriser', 'scialytique',
  'compresseur', 'aspirateur', 'meuble', 'tabouret',
  'dentsply', 'kerr', 'ivoclar', 'voco', 'gc', 'coltene',
  'septodont', 'hu-friedy', 'nsk', 'kavo', 'bien-air',
  'planmeca', 'acteon', 'ems', 'mectron', 'ultradent',
  'aiguille', 'seringue', 'anesthesique', 'digue', 'crampon',
  'matrice', 'coin', 'strip', 'tenon', 'pivot',
  'suture', 'bistouri', 'compresse', 'gobelet',
  'cire', 'gaine', 'sachet', 'indicateur',
  // Numéros (codes articles)
  '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '100', '200', '300', '400', '500', '900',
];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); }
    catch (e) { return { completedQueries: [], products: {} }; }
  }
  return { completedQueries: [], products: {} };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function main() {
  log('========== DEBUT SCRAPE HENRY SCHEIN (API) ==========');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

  // Login
  log('Connexion...');
  await page.goto('https://www.henryschein.fr/fr-fr/Cabinet/Default.aspx?registered=true', {
    waitUntil: 'networkidle2', timeout: 30000
  });
  await new Promise(r => setTimeout(r, 3000));

  await page.evaluate(() => {
    document.getElementById('ctl00_ucHeader_ucSessionBar_ucLogin_txtLogonName').value = 'karim_bahmed@yahoo.fr';
    document.getElementById('ctl00_ucHeader_ucSessionBar_ucLogin_txtPassword').value = '1987@Amjad';
    document.getElementById('ctl00_ucHeader_ucSessionBar_ucLogin_btnLoginCallback')?.click();
  });
  await new Promise(r => setTimeout(r, 8000));
  log('Connecté');

  // Get cookies for direct API calls
  const cookies = await page.cookies();
  const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

  const progress = loadProgress();
  const completedSet = new Set(progress.completedQueries || []);
  let newProducts = 0;

  // Phase 1: Use SearchAutoComplete API
  log('\\n======= PHASE 1: AUTOCOMPLETE API =======');

  for (const keyword of SEARCH_KEYWORDS) {
    if (completedSet.has(keyword)) continue;

    try {
      const callbackName = `jQuery_${Date.now()}`;
      const apiUrl = `https://www.henryschein.fr/webservices/SearchAutoComplete.ashx?callback=${callbackName}&templateMode=Single_Column&did=dental&culture=fr-FR&searchType=keyword&searchTerm=${encodeURIComponent(keyword)}&_=${Date.now()}`;

      const response = await page.evaluate(async (url) => {
        const res = await fetch(url, { credentials: 'include' });
        return res.text();
      }, apiUrl);

      // Parse JSONP response
      let data;
      try {
        const jsonStr = response.replace(/^[^(]+\(/, '').replace(/\);?\s*$/, '');
        data = JSON.parse(jsonStr);
      } catch (e) {
        log(`  [${keyword}] Parse error`);
        completedSet.add(keyword);
        continue;
      }

      // Extract products from DefaultSearchResults
      const results = data.DefaultSearchResults || [];
      let newForQuery = 0;

      for (const item of results) {
        if (!item.Title || item.Title.length < 3) continue;

        const key = `${item.Title}__${item.Price || ''}`.toLowerCase().replace(/\s+/g, ' ');
        if (!progress.products[key]) {
          progress.products[key] = {
            name: item.Title,
            priceText: item.Price || item.FormattedPrice || '',
            url: item.NavigateURL || '',
            ref: item.SKU || item.ProductId || '',
            brand: item.Brand || item.Manufacturer || '',
            imageUrl: item.ImageURL || item.ThumbnailURL || '',
            searchQuery: keyword,
            category: item.Category || '',
          };
          newForQuery++;
          newProducts++;
        }
      }

      // Also check KeywordResults, CategoryResults, ManufacturerResults
      const kwResults = data.KeywordResults || [];
      const catResults = data.CategoryResults || [];

      completedSet.add(keyword);

      if (results.length > 0 || newForQuery > 0) {
        log(`  [${keyword}] ${results.length} résultats, ${newForQuery} nouveaux`);
      }

      // Save progress every 25 queries
      if (completedSet.size % 25 === 0) {
        progress.completedQueries = Array.from(completedSet);
        saveProgress(progress);
        const total = Object.keys(progress.products).length;
        log(`--- Progression: ${completedSet.size}/${SEARCH_KEYWORDS.length} queries, ${total} produits ---`);
      }

      // Delay
      await new Promise(r => setTimeout(r, 500));

    } catch (err) {
      log(`  [${keyword}] ERREUR: ${err.message}`);
      completedSet.add(keyword);
    }
  }

  // Phase 2: Also scrape the JSONRequestHandler for pricing on categories
  log('\\n======= PHASE 2: CATEGORY PRICING API =======');

  // Get all subcategory URLs
  await page.goto('https://www.henryschein.fr/fr-fr/dental/Browse.aspx', { waitUntil: 'networkidle2', timeout: 20000 });
  await new Promise(r => setTimeout(r, 3000));

  const categories = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href*="/dental/c/"]'))
      .map(a => ({ text: a.textContent.trim(), url: a.href }))
      .filter(a => a.text.length > 1 && !a.url.includes('browsesupplies'));
  });

  log(`${categories.length} sous-catégories trouvées`);

  for (const cat of categories) {
    const catKey = `cat:${cat.text}`;
    if (completedSet.has(catKey)) continue;

    try {
      // Intercept the JSONRequestHandler response for this category
      let priceData = null;
      const responseHandler = async (response) => {
        if (response.url().includes('JSONRequestHandler.ashx')) {
          try {
            const text = await response.text();
            priceData = JSON.parse(text);
          } catch (e) {}
        }
      };
      page.on('response', responseHandler);

      await page.goto(cat.url, { waitUntil: 'networkidle2', timeout: 20000 });
      await new Promise(r => setTimeout(r, 4000));

      page.off('response', responseHandler);

      if (priceData && priceData.ItemDataToPrice) {
        let newForCat = 0;
        for (const item of priceData.ItemDataToPrice) {
          if (!item.ProductId) continue;

          // Try to get name from the page
          const key = `hs:${item.ProductId}`;
          if (!progress.products[key]) {
            progress.products[key] = {
              name: item.ProductDescription || item.ProductId,
              priceText: item.CustomerPrice || item.CatalogPrice || '',
              ref: item.ProductId,
              brand: item.ManufacturerName || '',
              url: cat.url,
              imageUrl: '',
              searchQuery: cat.text,
              category: cat.text,
              catalogPrice: item.CatalogPriceDisplay || '',
              availability: item.AvailabilityCode || '',
            };
            newForCat++;
            newProducts++;
          }
        }
        log(`  📂 ${cat.text}: ${priceData.ItemDataToPrice.length} produits, ${newForCat} nouveaux`);
      }

      completedSet.add(catKey);

      if (completedSet.size % 10 === 0) {
        progress.completedQueries = Array.from(completedSet);
        saveProgress(progress);
      }

      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      log(`  ❌ ${cat.text}: ${err.message}`);
      completedSet.add(catKey);
    }
  }

  // Final save
  progress.completedQueries = Array.from(completedSet);
  saveProgress(progress);

  const totalProducts = Object.keys(progress.products).length;
  log(`\\n========== FIN SCRAPE HENRY SCHEIN ==========`);
  log(`Total produits uniques: ${totalProducts}`);
  log(`Nouveaux cette session: ${newProducts}`);

  // Import to API
  const allProducts = Object.values(progress.products);
  if (allProducts.length > 0) {
    log('Import vers API...');
    for (let i = 0; i < allProducts.length; i += 200) {
      const batch = allProducts.slice(i, i + 200).map(p => ({
        name: p.name,
        price: parseFloat((p.priceText || '0').replace(/[^\d.,]/g, '').replace(',', '.')) || null,
        price_original: p.catalogPrice ? parseFloat(p.catalogPrice.replace(/[^\d.,]/g, '').replace(',', '.')) : null,
        ref: p.ref || '',
        category: `Henry Schein: ${p.category || p.searchQuery || 'unknown'}`,
        url: p.url || '',
        brand: p.brand || null,
        image_url: p.imageUrl || null,
      }));

      try {
        const resp = await fetch('http://127.0.0.1:3001/api/scan/import-prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'henryschein', products: batch, page: `api-batch-${Math.floor(i/200)+1}` }),
        });
        if (resp.ok) log(`  Import batch ${Math.floor(i/200)+1}: ${batch.length} OK`);
        else log(`  Import batch ${Math.floor(i/200)+1}: ERREUR ${resp.status}`);
      } catch (err) {
        log(`  Import error: ${err.message}`);
      }
    }
  }

  await browser.close();
}

main().catch(err => {
  console.error('Erreur fatale:', err);
  process.exit(1);
});
