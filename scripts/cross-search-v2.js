#!/usr/bin/env node
// =============================================
// JADOMI — CROSS-SEARCH V2
//
// Recherche croisée de produits dentaires entre fournisseurs
// en utilisant les APIs fonctionnelles (pas de web scraping cassé).
//
// Base de référence : GACD (38K produits via Algolia)
// Recherche sur : DoctorStrong (Venta API) + Henry Schein (HTML)
//
// Usage:
//   node scripts/cross-search-v2.js              # Lance la recherche
//   node scripts/cross-search-v2.js --report     # Affiche le rapport
//   node scripts/cross-search-v2.js --stats      # Stats détaillées
//
// Reprise automatique : sauvegarde toutes les 50 itérations.
// =============================================

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// =============================================
// CONFIGURATION
// =============================================

const GACD_FILE = '/home/ubuntu/jadomi/tmp/gacd-algolia-2026-05-08.json';
const PROGRESS_FILE = '/home/ubuntu/jadomi/tmp/cross-search-v2-progress.json';
const RESULTS_FILE = '/home/ubuntu/jadomi/tmp/cross-search-v2-results.json';
const LOG_FILE = '/tmp/cross-search-v2.log';

const VENTA_API = 'https://www.doctorstrong.fr/search/ajax/suggest?q=';
const HENRY_SCHEIN_SEARCH = 'https://dents.henryschein.fr/catalogsearch/result/?q=';

const RATE_LIMIT_VENTA_MS = 500;   // 2 req/sec
const RATE_LIMIT_HS_MS = 1000;     // 1 req/sec
const RETRY_MAX = 3;
const RETRY_DELAY_MS = 2000;
const SAVE_EVERY = 50;

// User-Agent rotation
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
];

let uaIndex = 0;
function nextUA() {
  const ua = USER_AGENTS[uaIndex % USER_AGENTS.length];
  uaIndex++;
  return ua;
}

// =============================================
// LOGGING
// =============================================

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// =============================================
// HTTP HELPERS
// =============================================

function fetchURL(url, accept) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const mod = isHttps ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': nextUA(),
        'Accept': accept || 'text/html,application/json',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 20000,
    }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchURL(res.headers.location, accept).then(resolve).catch(reject);
      }
      if (res.statusCode === 403 || res.statusCode === 429) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchWithRetry(url, accept, maxRetries) {
  maxRetries = maxRetries || RETRY_MAX;
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetchURL(url, accept);
    } catch (err) {
      lastErr = err;
      // Don't retry on 403/429 — skip
      if (err.message.includes('403') || err.message.includes('429')) throw err;
      if (attempt < maxRetries) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }
  throw lastErr;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// =============================================
// QUERY BUILDER — extrait les termes de recherche pertinents
// =============================================

// Mots à supprimer des noms de produits pour créer des requêtes efficaces
const STOP_WORDS = new Set([
  'lot', 'de', 'boite', 'boîte', 'sachet', 'paquet', 'coffret',
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'au', 'aux',
  'et', 'ou', 'en', 'pour', 'par', 'avec', 'sans', 'sur', 'sous',
  'pcs', 'pce', 'pieces', 'pièces', 'unitaire', 'unité', 'unite',
  'ref', 'recharge', 'kit', 'set', 'pack',
  'mm', 'cm', 'ml', 'µm', 'gr', 'kg',
  'x', '-', '/', '+',
]);

function buildSearchQuery(product) {
  const name = (product.name || '').trim();
  const brand = (product.brand || '').trim();

  if (name.length < 3) return null;

  // Normalise: remove accents, lowercase
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // Split into words, remove stop words and very short tokens
  const words = normalized
    .split(/[\s\-\/\(\)\[\],\.;:]+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));

  if (words.length === 0) return null;

  // Strategy: brand + first 2-3 significant words (max ~40 chars for API)
  const brandNorm = brand
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  // If brand is already in the words, don't duplicate
  const brandInName = brandNorm && words.some(w => w.includes(brandNorm) || brandNorm.includes(w));

  let queryParts = [];
  if (brandNorm && !brandInName && brandNorm.length >= 2) {
    queryParts.push(brandNorm);
  }

  // Take first 2-3 significant words (skip numeric-only words first pass)
  const significantWords = words.filter(w => !/^\d+$/.test(w));
  const numericWords = words.filter(w => /^\d+$/.test(w) && w.length >= 3);

  queryParts.push(...significantWords.slice(0, 3));
  if (numericWords.length > 0 && queryParts.length < 4) {
    queryParts.push(numericWords[0]);
  }

  const query = queryParts.join(' ').substring(0, 50).trim();
  return query.length >= 3 ? query : null;
}

// =============================================
// MATCH SCORING
// =============================================

function normalizeForMatch(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function computeMatchScore(gacdProduct, candidateName, candidateCode) {
  const gacdNorm = normalizeForMatch(gacdProduct.name);
  const candNorm = normalizeForMatch(candidateName);
  const gacdRef = (gacdProduct.ref || '').toLowerCase().trim();

  // Exact code match
  if (candidateCode && gacdRef && candidateCode.toLowerCase() === gacdRef) {
    return 100;
  }

  // Word overlap scoring
  const gacdWords = gacdNorm.split(/\s+/).filter(w => w.length > 1);
  const candWords = new Set(candNorm.split(/\s+/).filter(w => w.length > 1));

  if (gacdWords.length === 0 || candWords.size === 0) return 0;

  let matchCount = 0;
  let weightedScore = 0;

  for (const gw of gacdWords) {
    // Exact word match
    if (candWords.has(gw)) {
      matchCount++;
      weightedScore += 1;
      continue;
    }
    // Partial match (word contained in another)
    for (const cw of candWords) {
      if (cw.length >= 4 && gw.length >= 4 && (cw.includes(gw) || gw.includes(cw))) {
        matchCount += 0.7;
        weightedScore += 0.7;
        break;
      }
    }
  }

  // Brand bonus
  const gacdBrand = normalizeForMatch(gacdProduct.brand);
  if (gacdBrand.length >= 2) {
    for (const cw of candWords) {
      if (cw.includes(gacdBrand) || gacdBrand.includes(cw)) {
        weightedScore += 0.5;
        break;
      }
    }
  }

  const rawScore = gacdWords.length > 0 ? (weightedScore / gacdWords.length) * 100 : 0;
  return Math.min(100, Math.round(rawScore));
}

// =============================================
// VENTA (DOCTORSTRONG) API SEARCH
// =============================================

async function searchVenta(query) {
  try {
    const res = await fetchWithRetry(VENTA_API + encodeURIComponent(query), 'application/json');
    let data;
    try {
      data = JSON.parse(res.body);
    } catch (e) {
      return [];
    }

    if (!Array.isArray(data)) return [];

    const products = data.filter(r => r.type === 'product');
    const results = [];

    for (const raw of products) {
      if (!raw.entity_id) continue;

      const name = Array.isArray(raw.name) ? raw.name[0] : raw.name || '';
      const brand = raw.option_text_marque?.[0] || '';

      // Price extraction
      const priceData = (raw.price || []).find(p => p.customer_group_id === 0) || raw.price?.[0] || {};
      const price = priceData.final_price || priceData.price || null;
      const originalPrice = priceData.original_price || null;
      const specialPrice = raw.special_price?.[0] || null;

      // Codes
      const codesDrai = raw.code_drai || [];
      const codesStrong = raw.code_strong || [];
      const codesMega = raw.code_mega || [];
      const codesFournisseur = raw.code_art_fournisseur || [];
      const skus = raw.sku || [];

      results.push({
        entityId: raw.entity_id,
        name,
        brand,
        price: specialPrice || price,
        originalPrice,
        specialPrice,
        code: skus[0] || codesStrong[0] || '',
        codeFournisseur: codesFournisseur[0] || '',
        crossCodes: {
          code_drai: codesDrai[0] || '',
          code_strong: codesStrong[0] || '',
          code_mega: codesMega[0] || '',
        },
      });
    }

    return results;
  } catch (err) {
    if (err.message.includes('403') || err.message.includes('429')) throw err;
    return [];
  }
}

// =============================================
// HENRY SCHEIN HTML SEARCH
// =============================================

async function searchHenrySchein(query) {
  try {
    const res = await fetchWithRetry(HENRY_SCHEIN_SEARCH + encodeURIComponent(query), 'text/html');
    const html = res.body;

    if (!html || html.length < 500) return [];

    const results = [];

    // Extract products from HTML — look for product cards with data-price-amount
    // Pattern: <span class="price" data-price-amount="42.50">
    const priceRegex = /data-price-amount="([^"]+)"/g;
    // Product names: <a class="product-item-link"...>NAME</a>
    const nameRegex = /<a[^>]*class="product-item-link"[^>]*>\s*([\s\S]*?)\s*<\/a>/gi;
    // Product refs/SKUs
    const skuRegex = /data-product-sku="([^"]+)"/g;
    // Product URLs
    const urlRegex = /<a[^>]*class="product-item-link"[^>]*href="([^"]+)"/gi;

    const prices = [];
    const names = [];
    const skus = [];
    const urls = [];

    let m;
    while ((m = priceRegex.exec(html)) !== null) prices.push(parseFloat(m[1]));
    while ((m = nameRegex.exec(html)) !== null) {
      names.push(m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    }
    while ((m = skuRegex.exec(html)) !== null) skus.push(m[1]);

    // Reset regex lastIndex for urlRegex
    urlRegex.lastIndex = 0;
    while ((m = urlRegex.exec(html)) !== null) urls.push(m[1]);

    const count = Math.min(names.length, prices.length);
    for (let i = 0; i < count && i < 10; i++) {
      if (names[i] && prices[i] > 0) {
        results.push({
          name: names[i],
          price: prices[i],
          code: skus[i] || '',
          url: urls[i] || '',
        });
      }
    }

    return results;
  } catch (err) {
    if (err.message.includes('403') || err.message.includes('429')) throw err;
    return [];
  }
}

// =============================================
// PROGRESS MANAGEMENT
// =============================================

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    } catch (e) {
      log(`Erreur lecture progress: ${e.message}`);
    }
  }
  return {
    completedIndices: [],
    stats: {
      total: 0,
      searched: 0,
      matchesVenta: 0,
      matchesHS: 0,
      errorsVenta: 0,
      errorsHS: 0,
      skipped: 0,
    },
    lastSaved: null,
    startedAt: new Date().toISOString(),
  };
}

function saveProgress(progress) {
  progress.lastSaved = new Date().toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
}

function loadResults() {
  if (fs.existsSync(RESULTS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
    } catch (e) {
      log(`Erreur lecture results: ${e.message}`);
    }
  }
  return [];
}

function saveResults(results) {
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
}

// =============================================
// REPORT MODE
// =============================================

function showReport() {
  const progress = loadProgress();
  const results = loadResults();

  const s = progress.stats;
  const totalMatches = results.length;
  const ventaMatches = results.filter(r => r.matches.some(m => m.supplier === 'doctorstrong')).length;
  const hsMatches = results.filter(r => r.matches.some(m => m.supplier === 'henryschein')).length;

  // Price analysis
  let cheaper = 0;
  let moreExpensive = 0;
  let avgDiff = 0;
  let diffs = [];

  for (const r of results) {
    for (const m of r.matches) {
      if (m.price_diff_pct !== null && m.price_diff_pct !== undefined) {
        diffs.push(m.price_diff_pct);
        if (m.price_diff_pct < 0) cheaper++;
        else moreExpensive++;
      }
    }
  }

  if (diffs.length > 0) {
    avgDiff = (diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(1);
  }

  // Top brands matched
  const brandCounts = {};
  for (const r of results) {
    const brand = r.gacd_brand || 'Inconnu';
    brandCounts[brand] = (brandCounts[brand] || 0) + 1;
  }
  const topBrands = Object.entries(brandCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║         JADOMI CROSS-SEARCH V2 — RAPPORT                ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\nProgression: ${s.searched}/${s.total} produits recherchés`);
  console.log(`Skipped (nom trop court): ${s.skipped}`);
  console.log(`\nMatches trouvés: ${totalMatches}`);
  console.log(`  DoctorStrong (Venta): ${ventaMatches}`);
  console.log(`  Henry Schein: ${hsMatches}`);
  console.log(`\nErreurs: Venta=${s.errorsVenta} | HS=${s.errorsHS}`);
  console.log(`\nAnalyse prix (${diffs.length} comparaisons):`);
  console.log(`  Moins cher qu'en GACD: ${cheaper}`);
  console.log(`  Plus cher qu'en GACD: ${moreExpensive}`);
  console.log(`  Ecart moyen: ${avgDiff}%`);
  console.log(`\nTop 15 marques matchées:`);
  for (const [brand, count] of topBrands) {
    console.log(`  ${brand}: ${count}`);
  }
  console.log(`\nDernier save: ${progress.lastSaved || 'jamais'}`);
  console.log(`Démarré: ${progress.startedAt || '?'}`);
}

// =============================================
// STATS MODE
// =============================================

function showStats() {
  const results = loadResults();
  if (results.length === 0) {
    console.log('Aucun résultat.');
    return;
  }

  // Best deals (biggest negative price diff)
  const allMatches = [];
  for (const r of results) {
    for (const m of r.matches) {
      if (m.price_diff_pct !== null && m.price_diff_pct !== undefined) {
        allMatches.push({
          gacdName: r.gacd_name,
          gacdPrice: r.gacd_price,
          supplier: m.supplier,
          supplierName: m.name,
          supplierPrice: m.price,
          diff: m.price_diff_pct,
          score: m.match_score,
        });
      }
    }
  }

  allMatches.sort((a, b) => a.diff - b.diff);

  console.log('\n=== TOP 20 MEILLEURES AFFAIRES (moins cher qu\'en GACD) ===\n');
  for (const m of allMatches.slice(0, 20)) {
    console.log(`${m.diff > 0 ? '+' : ''}${m.diff.toFixed(1)}% | GACD: ${m.gacdPrice}EUR -> ${m.supplier}: ${m.supplierPrice}EUR | Score: ${m.score}`);
    console.log(`  GACD: ${m.gacdName}`);
    console.log(`  ${m.supplier}: ${m.supplierName}`);
    console.log('');
  }

  console.log('\n=== TOP 20 PLUS CHER AILLEURS ===\n');
  const expensive = allMatches.filter(m => m.diff > 0).sort((a, b) => b.diff - a.diff);
  for (const m of expensive.slice(0, 20)) {
    console.log(`+${m.diff.toFixed(1)}% | GACD: ${m.gacdPrice}EUR -> ${m.supplier}: ${m.supplierPrice}EUR | Score: ${m.score}`);
    console.log(`  GACD: ${m.gacdName}`);
    console.log(`  ${m.supplier}: ${m.supplierName}`);
    console.log('');
  }
}

// =============================================
// MAIN
// =============================================

async function main() {
  // Handle modes
  if (process.argv.includes('--report')) return showReport();
  if (process.argv.includes('--stats')) return showStats();

  log('╔══════════════════════════════════════════════════════════╗');
  log('║  JADOMI CROSS-SEARCH V2                                 ║');
  log('║  GACD (38K) vs DoctorStrong + Henry Schein              ║');
  log('║  APIs directes — sans Puppeteer                         ║');
  log('╚══════════════════════════════════════════════════════════╝');

  // Load GACD products
  if (!fs.existsSync(GACD_FILE)) {
    log(`ERREUR: Fichier GACD introuvable: ${GACD_FILE}`);
    process.exit(1);
  }

  log('Chargement des produits GACD...');
  const gacdProducts = JSON.parse(fs.readFileSync(GACD_FILE, 'utf8'));
  log(`GACD: ${gacdProducts.length} produits chargés`);

  // Load progress & results
  const progress = loadProgress();
  const completedSet = new Set(progress.completedIndices || []);
  let results = loadResults();
  const resultsMap = new Map();
  for (const r of results) {
    resultsMap.set(r.gacd_ref, r);
  }

  progress.stats.total = gacdProducts.length;

  log(`Déjà traités: ${completedSet.size}`);
  log(`Résultats existants: ${results.length}`);
  log(`Restants: ${gacdProducts.length - completedSet.size}`);

  const startTime = Date.now();
  let batchMatchesVenta = 0;
  let batchMatchesHS = 0;
  let batchErrors = 0;
  let processed = 0;

  for (let idx = 0; idx < gacdProducts.length; idx++) {
    // Skip already processed
    if (completedSet.has(idx)) continue;

    const gacdP = gacdProducts[idx];
    const gacdPrice = parseFloat(gacdP.price) || 0;

    // Build search query
    const query = buildSearchQuery(gacdP);
    if (processed < 3) log(`[DEBUG] idx=${idx} name="${gacdP.name}" query="${query}"`);
    if (!query) {
      completedSet.add(idx);
      progress.stats.skipped++;
      continue;
    }

    // Dedup: skip if we already have matches for this ref
    if (gacdP.ref && resultsMap.has(gacdP.ref)) {
      completedSet.add(idx);
      continue;
    }

    const matchEntry = {
      gacd_ref: gacdP.ref || `idx_${idx}`,
      gacd_name: gacdP.name,
      gacd_price: gacdPrice,
      gacd_brand: gacdP.brand || '',
      gacd_url: gacdP.url || '',
      matches: [],
    };

    // --- Search DoctorStrong (Venta API) ---
    try {
      const ventaResults = await searchVenta(query);
      await sleep(RATE_LIMIT_VENTA_MS);

      // Find best match
      let bestScore = 0;
      let bestMatch = null;

      for (const vp of ventaResults) {
        const score = computeMatchScore(gacdP, vp.name, vp.codeFournisseur);
        if (score > bestScore && score >= 40) {
          bestScore = score;
          bestMatch = vp;
        }
      }

      if (bestMatch && bestScore >= 40) {
        const effectivePrice = bestMatch.specialPrice || bestMatch.price;
        const diffPct = gacdPrice > 0 && effectivePrice
          ? parseFloat(((effectivePrice - gacdPrice) / gacdPrice * 100).toFixed(1))
          : null;

        matchEntry.matches.push({
          supplier: 'doctorstrong',
          name: bestMatch.name,
          price: bestMatch.price,
          special_price: bestMatch.specialPrice,
          code: bestMatch.code,
          code_fournisseur: bestMatch.codeFournisseur,
          cross_codes: bestMatch.crossCodes,
          match_score: bestScore,
          price_diff_pct: diffPct,
        });
        batchMatchesVenta++;
        progress.stats.matchesVenta++;
      }
    } catch (err) {
      batchErrors++;
      progress.stats.errorsVenta++;
      if (err.message.includes('429')) {
        log('  Rate limited par Venta, pause 30s...');
        await sleep(30000);
      }
    }

    // --- Search Henry Schein (HTML) ---
    try {
      const hsResults = await searchHenrySchein(query);
      await sleep(RATE_LIMIT_HS_MS);

      let bestScore = 0;
      let bestMatch = null;

      for (const hp of hsResults) {
        const score = computeMatchScore(gacdP, hp.name, hp.code);
        if (score > bestScore && score >= 40) {
          bestScore = score;
          bestMatch = hp;
        }
      }

      if (bestMatch && bestScore >= 40) {
        const diffPct = gacdPrice > 0 && bestMatch.price
          ? parseFloat(((bestMatch.price - gacdPrice) / gacdPrice * 100).toFixed(1))
          : null;

        matchEntry.matches.push({
          supplier: 'henryschein',
          name: bestMatch.name,
          price: bestMatch.price,
          code: bestMatch.code,
          url: bestMatch.url,
          match_score: bestScore,
          price_diff_pct: diffPct,
        });
        batchMatchesHS++;
        progress.stats.matchesHS++;
      }
    } catch (err) {
      batchErrors++;
      progress.stats.errorsHS++;
      if (err.message.includes('429')) {
        log('  Rate limited par Henry Schein, pause 60s...');
        await sleep(60000);
      }
    }

    // Save match if any
    if (matchEntry.matches.length > 0) {
      resultsMap.set(matchEntry.gacd_ref, matchEntry);
    }

    completedSet.add(idx);
    progress.stats.searched++;
    processed++;

    // Progress log + save every SAVE_EVERY products
    if (processed % SAVE_EVERY === 0) {
      const totalMatches = batchMatchesVenta + batchMatchesHS;
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      const rate = (processed / ((Date.now() - startTime) / 1000)).toFixed(2);
      const eta = rate > 0
        ? (((gacdProducts.length - completedSet.size) / rate) / 3600).toFixed(1)
        : '?';

      log(`[${completedSet.size}/${gacdProducts.length}] ${resultsMap.size} matches | DoctorStrong: ${progress.stats.matchesVenta} | HenrySchein: ${progress.stats.matchesHS} | Erreurs: ${progress.stats.errorsVenta + progress.stats.errorsHS} | ${elapsed}min | ~${eta}h restantes`);

      // Save progress
      progress.completedIndices = Array.from(completedSet);
      saveProgress(progress);

      // Save results
      results = Array.from(resultsMap.values());
      saveResults(results);

      // Email tous les 500 produits
      if (completedSet.size % 500 === 0 && typeof global.sendReport === 'function') {
        global.sendReport('progress').catch(() => {});
      }
    }
  }

  // Final save
  progress.completedIndices = Array.from(completedSet);
  saveProgress(progress);
  results = Array.from(resultsMap.values());
  saveResults(results);

  // Email final
  if (typeof global.sendReport === 'function') {
    await global.sendReport('final');
  }

  const elapsedMin = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const totalMatches = resultsMap.size;

  log('\n═══════════════════════════════════════════════════════════');
  log(`CROSS-SEARCH V2 TERMINE en ${elapsedMin} min`);
  log(`Produits traités: ${completedSet.size}/${gacdProducts.length}`);
  log(`Matches trouvés: ${totalMatches}`);
  log(`  DoctorStrong: ${progress.stats.matchesVenta}`);
  log(`  Henry Schein: ${progress.stats.matchesHS}`);
  log(`Skipped: ${progress.stats.skipped}`);
  log(`Erreurs: Venta=${progress.stats.errorsVenta} | HS=${progress.stats.errorsHS}`);
  log(`Résultats: ${RESULTS_FILE}`);
  log(`Progress: ${PROGRESS_FILE}`);
  log('═══════════════════════════════════════════════════════════');
}

// ═══ ENVOI RAPPORT EMAIL ═══
const nodemailer = require('nodemailer');

async function sendReport(type) {
  try {
    const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    const results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));

    const totalMatches = results.length;
    const bySupplier = {};
    let bestDeals = [];

    for (const r of results) {
      for (const m of (r.matches || [])) {
        bySupplier[m.supplier] = (bySupplier[m.supplier] || 0) + 1;
        if (m.price_diff_pct < -10) {
          bestDeals.push({
            produit: r.gacd_name,
            gacd: r.gacd_price + '€',
            fournisseur: m.supplier,
            prix: (m.special_price || m.price) + '€',
            economie: m.price_diff_pct.toFixed(1) + '%'
          });
        }
      }
    }
    bestDeals.sort((a, b) => parseFloat(a.economie) - parseFloat(b.economie));
    bestDeals = bestDeals.slice(0, 20);

    const supplierLines = Object.entries(bySupplier).map(([s, n]) => `<li><strong>${s}</strong> : ${n} matchs</li>`).join('');
    const dealLines = bestDeals.map(d =>
      `<tr><td>${d.produit}</td><td>${d.gacd}</td><td>${d.fournisseur}</td><td>${d.prix}</td><td style="color:#22c55e;font-weight:bold">${d.economie}</td></tr>`
    ).join('');

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:700px;margin:0 auto;background:#0a0a0f;color:#e5e5e5;padding:32px;border-radius:16px;">
        <h1 style="color:#0d9488;font-size:24px;">JADOMI — Rapport Cross-Search</h1>
        <p style="color:#737373;">${type === 'final' ? 'Recherche terminée' : 'Rapport intermédiaire'} — ${new Date().toLocaleDateString('fr-FR')}</p>
        <div style="background:#16161f;border-radius:12px;padding:20px;margin:16px 0;">
          <h3 style="color:#fff;margin-top:0;">Progression</h3>
          <p>${progress.completed || 0} / ${progress.total || 0} produits analysés</p>
          <p><strong style="color:#0d9488;">${totalMatches} matchs trouvés</strong></p>
          <ul>${supplierLines}</ul>
        </div>
        ${bestDeals.length > 0 ? `
        <div style="background:#16161f;border-radius:12px;padding:20px;margin:16px 0;">
          <h3 style="color:#fff;margin-top:0;">Top 20 meilleures économies</h3>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tr style="color:#737373;"><th style="text-align:left;padding:6px;">Produit</th><th>GACD</th><th>Fournisseur</th><th>Prix</th><th>Économie</th></tr>
            ${dealLines}
          </table>
        </div>` : ''}
        <p style="color:#525252;font-size:11px;margin-top:24px;">JADOMI Scraping Engine — rapport automatique</p>
      </div>
    `;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'pro1.mail.ovh.net',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });

    await transporter.sendMail({
      from: '"JADOMI Scraping" <noreply@jadomi.fr>',
      to: 'karim_bahmed@yahoo.fr',
      subject: `JADOMI Cross-Search — ${totalMatches} matchs trouvés ${type === 'final' ? '(TERMINÉ)' : ''}`,
      html: html
    });

    log(`[EMAIL] Rapport ${type} envoyé à karim_bahmed@yahoo.fr — ${totalMatches} matchs`);
  } catch (e) {
    log(`[EMAIL] Erreur envoi: ${e.message}`);
  }
}

// Exposer pour appel depuis main()
global.sendReport = sendReport;

main().catch(err => {
  log(`ERREUR FATALE: ${err.message}`);
  log(err.stack);
  process.exit(1);
});
