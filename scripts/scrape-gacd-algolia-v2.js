#!/usr/bin/env node
// =============================================
// JADOMI — Scraper GACD via Algolia API v2
// ZERO navigateur — appels API directs, ultra rapide
// =============================================

const fs = require('fs');

const PROGRESS_FILE = '/tmp/search-progress-gacd.json';
const LOG_FILE = '/tmp/search-gacd.log';

const ALGOLIA_APP_ID = 'KCFXGPCHAV';
const ALGOLIA_API_KEY = 'YTNhYWUwZjQxZGQ5NjkxNGIyOWUxYjAwYmQ4NjZlNWJlZjU5YTI4MjViZDBmOGNlNzZiNDJiNzI0MTc1MTY3MnRhZ0ZpbHRlcnM9JnZhbGlkVW50aWw9MTc3ODMyMDYzMA==';
const ALGOLIA_INDEX = 'MAGENTO2_PRODdefault_products';

const SEARCH_QUERIES = [
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
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
  'matrice', 'coin', 'strip', 'tenon', 'pivot', 'suture',
  'bistouri', 'compresse', 'gobelet', 'gaine', 'indicateur',
  '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '10', '20', '50', '100', '200', '500',
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

async function algoliaSearch(query, page = 0, hitsPerPage = 100) {
  const url = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/*/queries`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Algolia-Application-Id': ALGOLIA_APP_ID,
      'X-Algolia-API-Key': ALGOLIA_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [{ indexName: ALGOLIA_INDEX, params: `query=${encodeURIComponent(query)}&hitsPerPage=${hitsPerPage}&page=${page}` }]
    }),
  });
  if (!resp.ok) throw new Error(`Algolia ${resp.status}: ${(await resp.text()).substring(0, 200)}`);
  const data = await resp.json();
  return data.results[0];
}

function extractProduct(hit) {
  const priceNum = hit.price?.EUR?.default || null;
  const priceOriginal = hit.price?.EUR?.default_original_formated || '';
  const priceOrigNum = priceOriginal ? parseFloat(priceOriginal.replace(/[^\d,]/g, '').replace(',', '.')) : null;
  return {
    name: hit.name || '',
    priceText: hit.price?.EUR?.default_formated || '',
    price: priceNum,
    priceOriginal: priceOrigNum,
    oldPriceText: priceOriginal,
    brand: hit.sap_mvgr3 || hit.brand || '',
    url: hit.url || '',
    imageUrl: hit.image_url || hit.thumbnail_url || '',
    ref: hit.sku || hit.objectID || '',
    category: (hit.categories?.level0 || [])[0] || '',
    discount: priceOrigNum && priceNum ? Math.round((1 - priceNum / priceOrigNum) * 100) : null,
  };
}

async function main() {
  log('========== DEBUT SCRAPE GACD (ALGOLIA API v2) ==========');
  const progress = loadProgress();
  const completedSet = new Set(progress.completedQueries || []);
  let newProducts = 0;

  // Phase 1: Browse ALL via empty query
  if (!completedSet.has('__browse_all__')) {
    log('Phase 1: Browse complet...');
    try {
      const first = await algoliaSearch('', 0, 100);
      log(`Total dans l'index: ${first.nbHits} produits, ${first.nbPages} pages`);
      const totalPages = Math.min(first.nbPages, 1000); // Algolia max 1000 pages

      for (let p = 0; p < totalPages; p++) {
        const result = p === 0 ? first : await algoliaSearch('', p, 100);
        for (const hit of result.hits) {
          const product = extractProduct(hit);
          if (!product.name || product.name.length < 3) continue;
          const key = `${product.name}__${product.ref}`.toLowerCase().replace(/\s+/g, ' ');
          if (!progress.products[key]) { progress.products[key] = product; newProducts++; }
        }
        if ((p + 1) % 10 === 0) {
          log(`  Page ${p + 1}/${totalPages}: ${Object.keys(progress.products).length} produits`);
          saveProgress(progress);
        }
        await new Promise(r => setTimeout(r, 100));
      }
      completedSet.add('__browse_all__');
      progress.completedQueries = Array.from(completedSet);
      saveProgress(progress);
      log(`Phase 1 OK: ${Object.keys(progress.products).length} produits`);
    } catch (err) { log(`Phase 1 ERREUR: ${err.message}`); }
  }

  // Phase 2: Keywords
  log('Phase 2: Recherche par keywords...');
  for (const query of SEARCH_QUERIES) {
    if (completedSet.has(query)) continue;
    try {
      const first = await algoliaSearch(query, 0, 100);
      const totalPages = Math.min(first.nbPages, 20);
      let newForQ = 0;
      for (let p = 0; p < totalPages; p++) {
        const result = p === 0 ? first : await algoliaSearch(query, p, 100);
        for (const hit of result.hits) {
          const product = extractProduct(hit);
          if (!product.name || product.name.length < 3) continue;
          const key = `${product.name}__${product.ref}`.toLowerCase().replace(/\s+/g, ' ');
          if (!progress.products[key]) { progress.products[key] = product; newForQ++; newProducts++; }
        }
        if (p > 0) await new Promise(r => setTimeout(r, 50));
      }
      completedSet.add(query);
      if (first.nbHits > 0) log(`  [${query}] ${first.nbHits} hits, ${newForQ} nouveaux`);
      if (completedSet.size % 25 === 0) {
        progress.completedQueries = Array.from(completedSet);
        saveProgress(progress);
        log(`--- ${completedSet.size} queries, ${Object.keys(progress.products).length} produits ---`);
      }
      await new Promise(r => setTimeout(r, 50));
    } catch (err) {
      log(`  [${query}] ERREUR: ${err.message}`);
      completedSet.add(query);
      if (err.message.includes('429')) await new Promise(r => setTimeout(r, 5000));
    }
  }

  progress.completedQueries = Array.from(completedSet);
  saveProgress(progress);
  const total = Object.keys(progress.products).length;
  log(`\n========== FIN SCRAPE GACD ==========`);
  log(`Total: ${total} produits, ${newProducts} nouveaux`);

  // Import
  const allProducts = Object.values(progress.products);
  for (let i = 0; i < allProducts.length; i += 200) {
    const batch = allProducts.slice(i, i + 200).map(p => ({
      name: p.name, price: p.price, price_original: p.priceOriginal,
      discount: p.discount, ref: p.ref || '', category: `GACD: ${p.category || 'unknown'}`,
      url: p.url || '', brand: p.brand || null, image_url: p.imageUrl || null,
    }));
    try {
      const resp = await fetch('http://127.0.0.1:3001/api/scan/import-prices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'gacd', products: batch, page: `algolia-${Math.floor(i/200)+1}` }),
      });
      if (resp.ok) log(`  Import ${Math.floor(i/200)+1}: ${batch.length} OK`);
    } catch (err) { log(`  Import err: ${err.message}`); }
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
