#!/usr/bin/env node
// =============================================
// JADOMI — Scraper Henry Schein France (avec login)
// Henry Schein = le plus gros catalogue dentaire France
// Stratégie: login → navigation catégories → extraction produits
// =============================================

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const PROGRESS_FILE = '/tmp/search-progress-henryschein.json';
const LOG_FILE = '/tmp/search-henryschein.log';

const CREDENTIALS = {
  email: 'karim_bahmed@yahoo.fr',
  password: '1987@Amjad',
};

// Henry Schein categories to scrape
const CATEGORIES = [
  // Cabinet dentaire
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
  // Aussi utiliser la recherche pour compléter
];

// Search keywords to complement category browsing
const SEARCH_KEYWORDS = [
  // A-Z (26 lettres)
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  // 2 lettres les plus courants en dentaire
  'ab','ac','ad','ae','af','ag','al','am','an','ap','ar','as','at','au','av',
  'ba','be','bi','bl','bo','br','bu',
  'ca','ce','ch','ci','cl','co','cr','cu',
  'da','de','di','do','dr','du',
  'ec','el','em','en','ep','eq','er','es','et','eu','ev','ex',
  'fa','fe','fi','fl','fo','fr','fu',
  'ga','ge','gi','gl','go','gr','gu',
  'ha','he','hi','ho','hu','hy',
  'im','in','ir','is',
  'ke','ki',
  'la','le','li','lo','lu',
  'ma','me','mi','mo','mu',
  'na','ne','ni','no','nu',
  'ob','oc','od','op','or','os','ou','ox',
  'pa','pe','ph','pi','pl','po','pr','pu',
  'ra','re','ri','ro','ru',
  'sa','sc','se','si','so','sp','st','su',
  'ta','te','ti','to','tr','tu',
  'ul','un','ur',
  'va','ve','vi','vo',
  'za','zi','zo',
  // Produits dentaires spécifiques
  'composite', 'ciment', 'fraise', 'turbine', 'implant', 'couronne',
  'empreinte', 'alginate', 'silicone', 'gant', 'masque', 'autoclave',
  'detartreur', 'scaler', 'lime', 'gutta', 'bracket', 'fil ortho',
  'membrane', 'greffe', 'lampe', 'fauteuil', 'compresseur',
  'miroir', 'sonde', 'pince', 'davier', 'seringue', 'aiguille',
  'prothese', 'zircone', 'ceramique', 'resine', 'adhesif',
  'polissage', 'fluor', 'vernis', 'photopolymeriser',
  'endodontie', 'parodontie', 'orthodontie', 'prophylaxie',
  'radiographie', 'panoramique', 'cone beam', 'capteur',
  'instrument rotatif', 'contre-angle', 'piece a main', 'micro-moteur',
  'sterilisation', 'sachet', 'indicateur', 'desinfectant',
  'amalgame', 'obturation', 'matrice', 'coin', 'strip',
  'anesthesie', 'carpule', 'articaine', 'lidocaine', 'mepivacaine',
  'chirurgie', 'elevateur', 'syndesmotome', 'curette', 'bistouri',
  'blanchiment', 'peroxyde', 'gouttiere',
  'pedodontie', 'coiffe', 'scellement',
  'cad cam', 'scanner', 'usinage', 'bloc', 'disque',
  'aspiration', 'canule', 'pompe',
  'eclairage', 'loupe', 'microscope',
  'mobilier', 'tabouret', 'meuble', 'unite dentaire',
  // Marques
  'dentsply', 'kerr', 'ivoclar', 'voco', 'gc', 'septodont',
  '3m', 'kulzer', 'coltene', 'hu-friedy', 'acteon', 'satelec',
  'bien air', 'nsk', 'kavo', 'w&h', 'planmeca', 'sirona',
  'vita', 'shofu', 'zhermack', 'kettenbach', 'bisco',
  'ultradent', 'ems', 'mectron', 'woodpecker',
  'henry schein', 'krugg', 'cattani', 'durr dental',
];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    } catch (e) {
      return { completedQueries: [], products: {} };
    }
  }
  return { completedQueries: [], products: {} };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function parsePrice(text) {
  if (!text) return null;
  const cleaned = text.replace(/[^\d,.\-]/g, '').replace(',', '.');
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

async function login(page) {
  log('Connexion à Henry Schein...');

  await page.goto('https://www.henryschein.fr/fr-fr/Cabinet/Default.aspx?registered=true', {
    waitUntil: 'networkidle2', timeout: 30000
  });
  await new Promise(r => setTimeout(r, 3000));

  try {
    // Henry Schein ASP.NET form — use specific IDs found by debugging
    // Two forms exist: sidebar (ucSessionBar) and main content (ucLoginMyAccountSidebar)
    // Use the sidebar one which has visible=true (even if offscreen, JS can interact)
    const emailId = 'ctl00_ucHeader_ucSessionBar_ucLogin_txtLogonName';
    const passwordId = 'ctl00_ucHeader_ucSessionBar_ucLogin_txtPassword';
    const buttonId = 'ctl00_ucHeader_ucSessionBar_ucLogin_btnLoginCallback';

    // Fill via JavaScript (bypasses visibility/offscreen issues)
    await page.evaluate((emailId, passwordId, email, password) => {
      const emailEl = document.getElementById(emailId);
      const passEl = document.getElementById(passwordId);
      if (emailEl) { emailEl.value = email; emailEl.dispatchEvent(new Event('change', { bubbles: true })); }
      if (passEl) { passEl.value = password; passEl.dispatchEvent(new Event('change', { bubbles: true })); }
    }, emailId, passwordId, CREDENTIALS.email, CREDENTIALS.password);
    log('  Champs remplis via JS');

    await new Promise(r => setTimeout(r, 500));

    // Click login button via JS
    await page.evaluate((buttonId) => {
      const btn = document.getElementById(buttonId);
      if (btn) btn.click();
    }, buttonId);
    log('  Bouton SE CONNECTER cliqué');

    // Wait for navigation/response
    await new Promise(r => setTimeout(r, 8000));
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});

    // Verify login
    const result = await page.evaluate(() => {
      const text = document.body.innerText;
      const url = window.location.href;
      const hasLogout = text.includes('Déconnexion') || text.includes('déconnexion');
      const hasWelcome = text.includes('Bienvenue') || text.includes('Mon panier');
      const hasError = text.includes('incorrect') || text.includes('invalide');
      return { url, hasLogout, hasWelcome, hasError, snippet: text.substring(0, 300) };
    });

    if (result.hasLogout || result.hasWelcome) {
      log('✅ Connexion réussie !');
      return true;
    } else if (result.hasError) {
      log('❌ Identifiants incorrects');
      return false;
    } else {
      log('⚠️ Login status incertain. URL: ' + result.url);
      log('  Page: ' + result.snippet.substring(0, 200));
      // Try anyway — sometimes login redirects work
      return true;
    }
  } catch (err) {
    log('❌ Erreur login: ' + err.message);
    return false;
  }
}

async function extractProductsFromPage(page) {
  return page.evaluate(() => {
    const products = [];

    // Henry Schein product selectors (try multiple)
    const cardSelectors = [
      '.product-thumb', '.product-item', '.product-tile',
      '.product-list-item', 'tr.product-row', '.item-product',
      '[data-product-id]', '.search-result-item',
      '.product', 'li[class*="product"]',
    ];

    let cards = [];
    for (const sel of cardSelectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) {
        cards = Array.from(found);
        break;
      }
    }

    // Fallback: look for repeating patterns with titles + prices
    if (cards.length === 0) {
      // Try table rows (Henry Schein sometimes uses tables)
      const rows = document.querySelectorAll('table tr, .grid-item, .list-item');
      if (rows.length > 2) cards = Array.from(rows);
    }

    for (const card of cards) {
      const nameEl = card.querySelector('.product-title,.product-name,h2,h3,a[title],.item-name,.product-desc');
      const priceEl = card.querySelector('.price,.product-price,.item-price,[class*="price"],[class*="prix"]');
      const imgEl = card.querySelector('img');
      const linkEl = card.querySelector('a[href]');
      const refEl = card.querySelector('.product-ref,.ref,.sku,.product-code,[class*="ref"],[class*="code"]');

      const name = (nameEl?.getAttribute('title') || nameEl?.textContent || '').trim().replace(/\s+/g, ' ');
      const priceText = (priceEl?.textContent || '').trim();
      const imageUrl = imgEl?.src || imgEl?.getAttribute('data-src') || '';
      const url = linkEl?.href || '';
      const ref = (refEl?.textContent || '').trim();

      if (name && name.length > 3) {
        products.push({ name, priceText, imageUrl, url, ref, brand: '' });
      }
    }

    return products;
  });
}

async function scrapeCategory(page, category, progress) {
  const baseUrl = 'https://www.henryschein.fr';
  const url = baseUrl + category.url;
  log(`\n📂 Catégorie: ${category.name} → ${url}`);

  let pageNum = 1;
  let totalInCategory = 0;
  let currentUrl = url;

  while (pageNum <= 50) { // Max 50 pages per category
    try {
      await page.goto(currentUrl, { waitUntil: 'networkidle2', timeout: 25000 });
      await new Promise(r => setTimeout(r, 2000));

      const products = await extractProductsFromPage(page);

      if (products.length === 0) {
        if (pageNum === 1) log(`  Page 1: 0 produits`);
        break;
      }

      // Deduplicate
      let newCount = 0;
      for (const p of products) {
        p.searchQuery = category.name;
        const key = `${p.name}__${p.priceText}`.toLowerCase().replace(/\s+/g, ' ');
        if (!progress.products[key]) {
          progress.products[key] = p;
          newCount++;
        }
      }

      totalInCategory += products.length;
      log(`  Page ${pageNum}: ${products.length} produits (${newCount} nouveaux)`);

      // Find next page
      const nextUrl = await page.evaluate(() => {
        const nextLinks = document.querySelectorAll(
          'a.next,.pagination a.next,a[rel="next"],a[aria-label="Next"],.pager-next a,a.page-next,.pagination li.next a'
        );
        for (const link of nextLinks) {
          if (link.href) return link.href;
        }
        // Try numbered pagination
        const current = document.querySelector('.pagination .active,.page-current,.current-page');
        if (current) {
          const next = current.nextElementSibling;
          if (next) {
            const a = next.tagName === 'A' ? next : next.querySelector('a');
            if (a?.href) return a.href;
          }
        }
        return null;
      });

      if (!nextUrl || nextUrl === currentUrl) break;
      currentUrl = nextUrl;
      pageNum++;
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      log(`  ERREUR page ${pageNum}: ${err.message}`);
      break;
    }
  }

  log(`  Total catégorie ${category.name}: ${totalInCategory} produits`);
  return totalInCategory;
}

async function scrapeSearch(page, keyword, progress) {
  const url = `https://www.henryschein.fr/fr-fr/dental/Search.aspx?searchkeyWord=${encodeURIComponent(keyword)}&searchType=1`;
  log(`🔍 Recherche: "${keyword}"`);

  let pageNum = 1;
  let currentUrl = url;
  let totalForQuery = 0;

  while (pageNum <= 20) {
    try {
      await page.goto(currentUrl, { waitUntil: 'networkidle2', timeout: 25000 });
      await new Promise(r => setTimeout(r, 2000));

      const products = await extractProductsFromPage(page);
      if (products.length === 0) break;

      let newCount = 0;
      for (const p of products) {
        p.searchQuery = keyword;
        const key = `${p.name}__${p.priceText}`.toLowerCase().replace(/\s+/g, ' ');
        if (!progress.products[key]) {
          progress.products[key] = p;
          newCount++;
        }
      }

      totalForQuery += products.length;
      log(`  [${keyword}] page ${pageNum}: ${products.length} produits (${newCount} nouveaux)`);

      const nextUrl = await page.evaluate(() => {
        const next = document.querySelector('a.next,.pagination a.next,a[rel="next"],a[aria-label="Next"]');
        return next?.href || null;
      });

      if (!nextUrl || nextUrl === currentUrl) break;
      currentUrl = nextUrl;
      pageNum++;
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      log(`  ERREUR [${keyword}] page ${pageNum}: ${err.message}`);
      break;
    }
  }

  return totalForQuery;
}

async function importToApi(products) {
  if (products.length === 0) return 0;

  const batch = products.map(p => ({
    name: p.name,
    price: parsePrice(p.priceText),
    price_original: null,
    discount: null,
    ref: p.ref || '',
    category: `Henry Schein: ${p.searchQuery || 'unknown'}`,
    url: p.url || '',
    brand: p.brand || null,
    image_url: p.imageUrl || null,
  }));

  try {
    const resp = await fetch('http://127.0.0.1:3001/api/scan/import-prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'henryschein',
        products: batch,
        page: 'scrape-henryschein',
      }),
    });
    if (resp.ok) return batch.length;
    log(`Import failed: ${resp.status}`);
    return 0;
  } catch (err) {
    log(`Import error: ${err.message}`);
    return 0;
  }
}

async function main() {
  log('========== DEBUT SCRAPE HENRY SCHEIN ==========');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', '--disable-gpu',
      '--window-size=1280,800',
    ],
  });

  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (['font', 'media'].includes(req.resourceType())) req.abort();
    else req.continue();
  });
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // Login
  const loggedIn = await login(page);
  if (!loggedIn) {
    log('❌ Impossible de se connecter. Arrêt.');
    await browser.close();
    return;
  }

  const progress = loadProgress();
  const completedSet = new Set(progress.completedQueries || []);
  let totalNew = 0;

  // Phase 1: Scrape categories
  log('\n======= PHASE 1: CATEGORIES =======');
  for (const cat of CATEGORIES) {
    if (completedSet.has(`cat:${cat.name}`)) {
      log(`  SKIP ${cat.name} (déjà fait)`);
      continue;
    }

    try {
      await scrapeCategory(page, cat, progress);
      completedSet.add(`cat:${cat.name}`);
      progress.completedQueries = Array.from(completedSet);
      saveProgress(progress);
    } catch (err) {
      log(`  ERREUR catégorie ${cat.name}: ${err.message}`);
    }
  }

  // Phase 2: Search keywords
  log('\n======= PHASE 2: RECHERCHE =======');
  for (const keyword of SEARCH_KEYWORDS) {
    if (completedSet.has(`search:${keyword}`)) continue;

    try {
      await scrapeSearch(page, keyword, progress);
      completedSet.add(`search:${keyword}`);
      progress.completedQueries = Array.from(completedSet);
      saveProgress(progress);
    } catch (err) {
      log(`  ERREUR recherche ${keyword}: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  // Final import
  const allProducts = Object.values(progress.products);
  log(`\nTotal produits uniques: ${allProducts.length}`);

  if (allProducts.length > 0) {
    // Import in batches of 200
    for (let i = 0; i < allProducts.length; i += 200) {
      const batch = allProducts.slice(i, i + 200);
      const imported = await importToApi(batch);
      log(`Import batch ${Math.floor(i/200)+1}: ${imported}/${batch.length}`);
    }
  }

  log('========== FIN SCRAPE HENRY SCHEIN ==========');
  log(`Total: ${allProducts.length} produits`);

  await browser.close();
}

main().catch(err => {
  console.error('Erreur fatale:', err);
  process.exit(1);
});
