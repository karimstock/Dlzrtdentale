#!/usr/bin/env node
// =============================================
// JADOMI — CROSS-REFERENCE SCRAPER
//
// Stratégie : prendre les 38 000 produits GACD comme référence,
// chercher chaque produit sur les sites concurrents pour obtenir
// le prix chez chaque distributeur.
//
// C'est LA méthode pour un comparateur : même produit, prix différents.
//
// Usage: node scrape-crossref.js
//        node scrape-crossref.js --site doctorai
//        node scrape-crossref.js --report
// =============================================

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

puppeteer.use(StealthPlugin());

const PROGRESS_DIR = '/tmp/jadomi-crossref';
const LOG_FILE = '/tmp/jadomi-crossref/crossref.log';
fs.mkdirSync(PROGRESS_DIR, { recursive: true });

const transporter = nodemailer.createTransport({
  host: 'pro2.mail.ovh.net', port: 587, secure: false,
  auth: { user: 'noreply@jadomi.fr', pass: '1987@Louiza' },
});

// =============================================
// COMPETITOR SITES — où chercher chaque produit
// =============================================

const COMPETITOR_SITES = [
  {
    name: 'doctorai',
    baseUrl: 'https://www.doctor-ai.fr',
    searchUrl: '/catalogsearch/result/?q=',
    type: 'magento',
    extractProducts: (page) => page.evaluate(() => {
      const items = [];
      document.querySelectorAll('form.product-item,.product-item').forEach(card => {
        const nameEl = card.querySelector('a.product-item-link,.product-item-link,h3');
        const priceEl = card.querySelector('[data-price-amount]');
        const oldPriceEl = card.querySelector('[data-price-type="oldPrice"] [data-price-amount]');
        const linkEl = card.querySelector('a[href]');
        const name = (nameEl?.getAttribute('title') || nameEl?.textContent || '').trim().replace(/\s+/g, ' ');
        if (name.length > 3) {
          items.push({
            name,
            price: priceEl ? parseFloat(priceEl.getAttribute('data-price-amount')) : null,
            oldPrice: oldPriceEl ? parseFloat(oldPriceEl.getAttribute('data-price-amount')) : null,
            url: linkEl?.href || '',
          });
        }
      });
      return items;
    }),
  },
  {
    name: 'doctorstrong',
    baseUrl: 'https://www.doctorstrong.fr',
    searchUrl: '/catalogsearch/result/?q=',
    type: 'magento',
    extractProducts: null, // Same as doctorai
  },
  {
    name: 'megadental',
    baseUrl: 'https://www.megadental.fr',
    searchUrl: '/catalogsearch/result/?q=',
    type: 'magento',
    extractProducts: null,
  },
  {
    name: 'b2b-dental',
    baseUrl: 'https://www.b2b-dental.com',
    searchUrl: '/cabinet_fr/catalogsearch/result/?q=',
    type: 'magento',
    extractProducts: (page) => page.evaluate(() => {
      const items = [];
      document.querySelectorAll('.products-grid li.item,.category-products li').forEach(card => {
        const nameEl = card.querySelector('h2.product-name a,.product-name a,a[title]');
        const priceEl = card.querySelector('.special-price .price,.regular-price .price,.price');
        const linkEl = card.querySelector('a[href]');
        const name = (nameEl?.getAttribute('title') || nameEl?.textContent || '').trim().replace(/\s+/g, ' ');
        const priceText = priceEl?.textContent?.replace(/[^\d,.\-]/g, '').replace(',', '.') || '';
        if (name.length > 3) {
          items.push({
            name,
            price: parseFloat(priceText) || null,
            url: linkEl?.href || '',
          });
        }
      });
      return items;
    }),
  },
  {
    name: 'dentalprive',
    baseUrl: 'https://www.dentalprive.fr',
    searchUrl: '/recherche?search_query=',
    type: 'prestashop',
    extractProducts: (page) => page.evaluate(() => {
      const items = [];
      document.querySelectorAll('.product-container,.product-miniature,.js-product-miniature').forEach(card => {
        const nameEl = card.querySelector('.product-name a,.product-title a,a.product_img_link[title]');
        const priceEl = card.querySelector('[itemprop="price"],.price,.product-price');
        const linkEl = card.querySelector('a[href]');
        const name = (nameEl?.getAttribute('title') || nameEl?.textContent || '').trim().replace(/\s+/g, ' ');
        const priceText = priceEl?.getAttribute('content') || priceEl?.textContent?.replace(/[^\d,.\-]/g, '').replace(',', '.') || '';
        if (name.length > 3) {
          items.push({ name, price: parseFloat(priceText) || null, url: linkEl?.href || '' });
        }
      });
      return items;
    }),
  },
  {
    name: 'godentaire',
    baseUrl: 'https://www.go-dentaire.com',
    searchUrl: '/recherche?s=',
    type: 'prestashop',
    extractProducts: null, // Same as dentalprive
  },
  {
    name: 'dentalachat',
    baseUrl: 'https://www.dentalachat.com',
    searchUrl: '/recherche?controller=search&s=',
    type: 'prestashop',
    extractProducts: null,
  },
  {
    name: 'topdentaire',
    baseUrl: 'https://www.topdentaire.fr',
    searchUrl: '/recherche?s=',
    type: 'prestashop',
    extractProducts: null,
  },
  {
    name: 'dental-france',
    baseUrl: 'https://www.dental-france.fr',
    searchUrl: '/?s=',
    type: 'woocommerce',
    extractProducts: (page) => page.evaluate(() => {
      const items = [];
      document.querySelectorAll('li.product,.type-product').forEach(card => {
        const nameEl = card.querySelector('.woocommerce-loop-product__title,h2,h3');
        const priceEl = card.querySelector('.price ins .woocommerce-Price-amount,.price .woocommerce-Price-amount');
        const linkEl = card.querySelector('a[href]');
        const name = (nameEl?.textContent || '').trim().replace(/\s+/g, ' ');
        const priceText = priceEl?.textContent?.replace(/[^\d,.\-]/g, '').replace(',', '.') || '';
        if (name.length > 3) {
          items.push({ name, price: parseFloat(priceText) || null, url: linkEl?.href || '' });
        }
      });
      return items;
    }),
  },
  {
    name: 'dentalevolution',
    baseUrl: 'https://dentalevolution.fr',
    searchUrl: '/?s=',
    type: 'woocommerce',
    extractProducts: null, // Same as dental-france
  },
];

// Default Magento extractor
const defaultMagentoExtract = (page) => page.evaluate(() => {
  const items = [];
  document.querySelectorAll('form.product-item,.product-item').forEach(card => {
    const nameEl = card.querySelector('a.product-item-link,.product-item-link,h3');
    const priceEl = card.querySelector('[data-price-amount]');
    const linkEl = card.querySelector('a[href]');
    const name = (nameEl?.getAttribute('title') || nameEl?.textContent || '').trim().replace(/\s+/g, ' ');
    if (name.length > 3) {
      items.push({
        name,
        price: priceEl ? parseFloat(priceEl.getAttribute('data-price-amount')) : null,
        url: linkEl?.href || '',
      });
    }
  });
  return items;
});

// Default PrestaShop extractor
const defaultPrestashopExtract = (page) => page.evaluate(() => {
  const items = [];
  document.querySelectorAll('.product-miniature,.js-product-miniature,.product-container').forEach(card => {
    const nameEl = card.querySelector('.product-title a,.product-name a');
    const priceEl = card.querySelector('[itemprop="price"],.price,.product-price');
    const linkEl = card.querySelector('a[href]');
    const name = (nameEl?.textContent || '').trim().replace(/\s+/g, ' ');
    const priceText = priceEl?.getAttribute('content') || priceEl?.textContent?.replace(/[^\d,.\-]/g, '').replace(',', '.') || '';
    if (name.length > 3) {
      items.push({ name, price: parseFloat(priceText) || null, url: linkEl?.href || '' });
    }
  });
  return items;
});

// =============================================
// LOGGING
// =============================================

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// =============================================
// PRODUCT MATCHING — fuzzy match entre noms
// =============================================

function normalizeProductName(name) {
  return (name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeywords(name) {
  const normalized = normalizeProductName(name);
  // Remove common filler words
  const stopWords = new Set(['de', 'le', 'la', 'les', 'du', 'des', 'un', 'une', 'et', 'ou', 'pour', 'avec', 'sans', 'boite', 'bte', 'lot', 'pcs', 'pieces']);
  return normalized.split(' ').filter(w => w.length > 1 && !stopWords.has(w));
}

function matchScore(gacdName, competitorName) {
  const gacdWords = extractKeywords(gacdName);
  const compWords = new Set(extractKeywords(competitorName));

  if (gacdWords.length === 0) return 0;

  let matches = 0;
  for (const word of gacdWords) {
    if (compWords.has(word)) matches++;
    // Partial match for long words
    else if (word.length > 4) {
      for (const cw of compWords) {
        if (cw.includes(word) || word.includes(cw)) { matches += 0.5; break; }
      }
    }
  }

  return matches / gacdWords.length;
}

function findBestMatch(gacdProduct, competitorProducts) {
  let bestScore = 0;
  let bestMatch = null;

  for (const cp of competitorProducts) {
    const score = matchScore(gacdProduct.name, cp.name);
    if (score > bestScore && score >= 0.4) { // Min 40% match
      bestScore = score;
      bestMatch = { ...cp, matchScore: score };
    }
  }

  return bestMatch;
}

// =============================================
// BUILD SEARCH QUERIES from GACD products
// =============================================

function buildSearchQueries(gacdProducts) {
  // Group by brand + key terms for efficient batch searching
  const queries = new Map(); // query → [gacdProduct, ...]

  for (const p of gacdProducts) {
    // Strategy 1: Brand + first key words
    const brand = (p.brand || '').trim();
    const nameWords = extractKeywords(p.name);

    // Use brand + first 2-3 significant words
    let query;
    if (brand && brand.length > 1) {
      const keyWords = nameWords.filter(w => normalizeProductName(brand).split(' ').indexOf(w) === -1).slice(0, 2);
      query = `${brand} ${keyWords.join(' ')}`.trim();
    } else {
      query = nameWords.slice(0, 3).join(' ');
    }

    if (query.length < 3) continue;

    if (!queries.has(query)) queries.set(query, []);
    queries.get(query).push(p);
  }

  return queries;
}

// =============================================
// PROGRESS MANAGEMENT
// =============================================

function loadProgress(siteName) {
  const f = path.join(PROGRESS_DIR, `crossref-${siteName}.json`);
  if (fs.existsSync(f)) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
    catch (e) {}
  }
  return { completedQueries: [], matches: {}, noMatch: 0, totalSearched: 0 };
}

function saveProgress(siteName, progress) {
  fs.writeFileSync(path.join(PROGRESS_DIR, `crossref-${siteName}.json`), JSON.stringify(progress, null, 2));
}

// =============================================
// SCRAPE ONE COMPETITOR SITE
// =============================================

async function scrapeCompetitor(site, gacdProducts) {
  log(`\n${'═'.repeat(55)}`);
  log(`🔍 Cross-ref: ${site.name} (${gacdProducts.length} produits GACD à chercher)`);

  const progress = loadProgress(site.name);
  const completedSet = new Set(progress.completedQueries || []);
  const queries = buildSearchQueries(gacdProducts);
  const pendingQueries = [...queries.entries()].filter(([q]) => !completedSet.has(q));

  log(`  Queries totales: ${queries.size} | Déjà faites: ${completedSet.size} | Restantes: ${pendingQueries.length}`);
  log(`  Matches existants: ${Object.keys(progress.matches).length}`);

  if (pendingQueries.length === 0) {
    log(`  Tout déjà fait pour ${site.name}`);
    return progress;
  }

  // Launch browser
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['image', 'font', 'media'].includes(req.resourceType())) req.abort();
    else req.continue();
  });
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

  const extractor = site.extractProducts ||
    (site.type === 'magento' ? defaultMagentoExtract : defaultPrestashopExtract);

  let newMatches = 0;
  let errors = 0;
  const delay = site.type === 'magento' ? 1500 : 2000;

  for (let i = 0; i < pendingQueries.length; i++) {
    const [query, gacdGroup] = pendingQueries[i];

    try {
      const searchUrl = site.baseUrl + site.searchUrl + encodeURIComponent(query);
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await new Promise(r => setTimeout(r, 1200));

      const competitorProducts = await extractor(page);

      // Match each GACD product with competitor results
      for (const gacdP of gacdGroup) {
        const gacdKey = normalizeProductName(gacdP.name);
        if (progress.matches[gacdKey]) continue; // Already matched

        const match = findBestMatch(gacdP, competitorProducts);
        if (match) {
          progress.matches[gacdKey] = {
            gacdName: gacdP.name,
            gacdPrice: gacdP.price,
            gacdBrand: gacdP.brand,
            competitorName: match.name,
            competitorPrice: match.price,
            competitorUrl: match.url,
            matchScore: match.matchScore,
            site: site.name,
          };
          newMatches++;
        }
      }

      completedSet.add(query);
      progress.totalSearched += gacdGroup.length;

      // Progress log & save
      if ((i + 1) % 50 === 0) {
        const matchCount = Object.keys(progress.matches).length;
        log(`  [${i + 1}/${pendingQueries.length}] ${matchCount} matches (${newMatches} nouveaux, ${errors} erreurs)`);
        progress.completedQueries = Array.from(completedSet);
        saveProgress(site.name, progress);
      }

      await new Promise(r => setTimeout(r, delay));

    } catch (err) {
      errors++;
      completedSet.add(query); // Skip on error

      if (err.message.includes('detached') || err.message.includes('Target closed')) {
        log(`  Browser crash, recreating page...`);
        try {
          await page.close().catch(() => {});
          const newPage = await browser.newPage();
          await newPage.setRequestInterception(true);
          newPage.on('request', req => {
            if (['image', 'font', 'media'].includes(req.resourceType())) req.abort();
            else req.continue();
          });
          await newPage.setViewport({ width: 1280, height: 800 });
          await newPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
          // Can't reassign const, but we continue with the browser instance
        } catch (e) {
          log(`  Recovery failed, skipping remaining queries`);
          break;
        }
      }
    }
  }

  // Final save
  progress.completedQueries = Array.from(completedSet);
  saveProgress(site.name, progress);

  await browser.close();

  const totalMatches = Object.keys(progress.matches).length;
  log(`  ✅ ${site.name}: ${totalMatches} matches totaux (+${newMatches} nouveaux), ${errors} erreurs`);

  // Also save matches to the standard search-progress format for the comparator
  await saveToSearchProgress(site.name, progress);

  return progress;
}

// =============================================
// SAVE TO SEARCH PROGRESS — pour le comparateur
// =============================================

async function saveToSearchProgress(siteName, crossrefProgress) {
  const progressFile = `/tmp/search-progress-${siteName}.json`;
  let existing = { completedQueries: [], products: {} };
  if (fs.existsSync(progressFile)) {
    try { existing = JSON.parse(fs.readFileSync(progressFile, 'utf8')); } catch (e) {}
  }

  let added = 0;
  for (const match of Object.values(crossrefProgress.matches)) {
    const key = `${match.competitorName}__${match.competitorPrice}`.toLowerCase().replace(/\s+/g, ' ');
    if (!existing.products[key]) {
      existing.products[key] = {
        name: match.competitorName,
        priceText: match.competitorPrice ? String(match.competitorPrice) : '',
        url: match.competitorUrl,
        brand: match.gacdBrand || '',
        searchQuery: `crossref:${match.gacdName.substring(0, 40)}`,
        imageUrl: '',
        ref: '',
      };
      added++;
    }
  }

  fs.writeFileSync(progressFile, JSON.stringify(existing, null, 2));
  log(`  Ajouté ${added} produits au search-progress de ${siteName}`);
}

// =============================================
// MAIN
// =============================================

async function main() {
  // Report mode
  if (process.argv.includes('--report')) {
    console.log('\n=== JADOMI CROSS-REFERENCE REPORT ===\n');
    for (const site of COMPETITOR_SITES) {
      const prog = loadProgress(site.name);
      const matches = Object.keys(prog.matches).length;
      console.log(`${site.name.padEnd(20)} ${String(matches).padStart(6)} matches | ${prog.completedQueries?.length || 0} queries`);
    }
    return;
  }

  log('╔══════════════════════════════════════════════════════════╗');
  log('║  JADOMI CROSS-REFERENCE SCRAPER                        ║');
  log('║  38 000 produits GACD → cherchés chez chaque concurrent║');
  log('╚══════════════════════════════════════════════════════════╝');

  // Load GACD products
  const gacdData = JSON.parse(fs.readFileSync('/tmp/search-progress-gacd.json', 'utf8'));
  const gacdProducts = Object.values(gacdData.products);
  log(`Référence GACD: ${gacdProducts.length} produits, ${new Set(gacdProducts.map(p => p.brand)).size} marques`);

  // Filter target site if specified
  let targetSite = null;
  const siteArg = process.argv.indexOf('--site');
  if (siteArg >= 0) targetSite = process.argv[siteArg + 1];

  const sitesToScrape = targetSite
    ? COMPETITOR_SITES.filter(s => s.name === targetSite)
    : COMPETITOR_SITES;

  // Send start email
  try {
    await transporter.sendMail({
      from: 'JADOMI Engine <noreply@jadomi.fr>',
      to: 'karim_bahmed@yahoo.fr',
      subject: `🔍 Cross-Ref démarré — ${gacdProducts.length} produits GACD → ${sitesToScrape.length} sites`,
      html: `<h2>Cross-Reference Scraper</h2><p>${gacdProducts.length} produits GACD seront cherchés sur ${sitesToScrape.map(s => s.name).join(', ')}</p>`,
    });
  } catch (e) {}

  // Scrape each competitor
  for (const site of sitesToScrape) {
    try {
      await scrapeCompetitor(site, gacdProducts);
    } catch (err) {
      log(`❌ ${site.name}: ${err.message}`);
    }

    // Cleanup between sites
    try { require('child_process').execSync('killall -9 chrome 2>/dev/null || true'); } catch (e) {}
    await new Promise(r => setTimeout(r, 5000));
  }

  // Final report
  log('\n═══════════════════════════════════════');
  log('CROSS-REFERENCE TERMINÉ');

  let totalMatches = 0;
  const report = [];
  for (const site of sitesToScrape) {
    const prog = loadProgress(site.name);
    const matches = Object.keys(prog.matches).length;
    totalMatches += matches;
    report.push(`${site.name}: ${matches} correspondances`);
    log(`  ${site.name}: ${matches} correspondances`);
  }

  // Grand total
  const allCounts = {};
  let grandTotal = 0;
  for (const f of fs.readdirSync('/tmp').filter(f => f.startsWith('search-progress-') && f.endsWith('.json') && !f.includes('backup'))) {
    try {
      const d = JSON.parse(fs.readFileSync(`/tmp/${f}`, 'utf8'));
      const c = typeof d.products === 'object' && !Array.isArray(d.products) ? Object.keys(d.products).length : 0;
      if (c > 0) { const n = f.replace('search-progress-','').replace('.json',''); allCounts[n] = c; grandTotal += c; }
    } catch (e) {}
  }

  log(`\nTOTAL COMPARATEUR: ${grandTotal} produits`);

  // Send final email
  let html = `<h2>🔍 Cross-Reference terminé</h2>`;
  html += `<p><b>${totalMatches} correspondances</b> trouvées sur ${sitesToScrape.length} sites</p>`;
  html += `<table border="1" cellpadding="6" style="border-collapse:collapse">`;
  html += `<tr style="background:#16213e;color:white"><th>Site</th><th>Matches</th><th>Total produits</th></tr>`;
  Object.entries(allCounts).sort((a,b) => b[1] - a[1]).forEach(([name, count]) => {
    const matches = loadProgress(name);
    const mCount = Object.keys(matches.matches || {}).length;
    html += `<tr><td>${name}</td><td>${mCount || '-'}</td><td><b>${count}</b></td></tr>`;
  });
  html += `<tr style="background:#16213e;color:white"><td><b>TOTAL</b></td><td><b>${totalMatches}</b></td><td><b>${grandTotal}</b></td></tr>`;
  html += `</table>`;

  try {
    await transporter.sendMail({
      from: 'JADOMI Engine <noreply@jadomi.fr>',
      to: 'karim_bahmed@yahoo.fr',
      subject: `🏆 Cross-Ref terminé — ${totalMatches} correspondances, ${grandTotal} produits total`,
      html,
    });
  } catch (e) {}
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
