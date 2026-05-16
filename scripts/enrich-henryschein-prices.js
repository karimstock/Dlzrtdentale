#!/usr/bin/env node
/**
 * enrich-henryschein-prices.js
 * Enrichit les 2166 produits Henry Schein avec prix depuis plusieurs sources.
 *
 * Sources (par ordre de priorite) :
 *   1. henryschein.fr - recherche par ref
 *   2. Google Shopping - recherche "henry schein REF prix"
 *   3. GACD Algolia local (38K produits) - matching par mots-cles
 *   4. Supabase scraped_prices (local API)
 *
 * Usage: node scripts/enrich-henryschein-prices.js
 */

const fs = require('fs');
const path = require('path');

// ── Paths ──────────────────────────────────────────────────────────────────
const HS_INPUT     = '/home/ubuntu/jadomi/tmp/henryschein-mp-2024.json';
const GACD_INPUT   = '/home/ubuntu/jadomi/tmp/gacd-algolia-2026-05-08.json';
const OUTPUT       = '/home/ubuntu/jadomi/tmp/henryschein-enriched.json';
const PROGRESS     = '/home/ubuntu/jadomi/tmp/henryschein-enrich-progress.json';

// ── Settings ───────────────────────────────────────────────────────────────
const RATE_LIMIT_MS   = 2000;   // 1 request per 2 seconds
const REQUEST_TIMEOUT = 10000;  // 10s timeout
const MIN_JACCARD     = 0.4;    // minimum Jaccard similarity

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

// ── French stop words ──────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'ou', 'en',
  'au', 'aux', 'par', 'pour', 'sur', 'avec', 'dans', 'est', 'son', 'sa',
  'ses', 'ce', 'cette', 'ces', 'qui', 'que', 'dont', 'pas', 'plus', 'tout',
  'tous', 'toute', 'toutes', 'bon', 'bonne', 'tres', 'plus', 'bien',
  'flacon', 'boite', 'sachet', 'tube', 'bidon', 'pochette', 'recharge',
]);

// ── Utilities ──────────────────────────────────────────────────────────────

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/** Remove accents, lowercase, strip packaging sizes */
function normalize(str) {
  if (!str) return '';
  return str
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // remove accents
    .toLowerCase()
    .replace(/\d+\s*(ml|l|g|kg|cm|mm|m|cl)\b/gi, '')  // remove sizes
    .replace(/[^a-z0-9\s]/g, ' ')                       // keep alphanum + space
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract significant keywords (>2 chars, not stop words) */
function extractKeywords(str) {
  const normalized = normalize(str);
  return new Set(
    normalized.split(' ')
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  );
}

/** Jaccard similarity between two sets */
function jaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Extract price from HTML text - tries multiple patterns */
function extractPriceFromHTML(html) {
  if (!html) return null;
  const patterns = [
    // Common price patterns on French sites
    /(?:prix|price|ttc|ht)\s*[:=]?\s*(\d+[.,]\d{2})\s*[€e]/i,
    /(\d+[.,]\d{2})\s*€\s*(?:ttc|ht)/i,
    /(\d+[.,]\d{2})\s*€/i,
    /class="[^"]*price[^"]*"[^>]*>\s*(\d+[.,]\d{2})\s*€/i,
    /data-price="(\d+[.,]\d+)"/i,
    /"price"\s*:\s*"?(\d+[.,]\d+)"?/i,
    /itemprop="price"\s+content="(\d+[.,]\d+)"/i,
  ];
  for (const pat of patterns) {
    const m = html.match(pat);
    if (m) {
      return parseFloat(m[1].replace(',', '.'));
    }
  }
  return null;
}

/** Fetch with timeout, UA rotation, error handling */
async function safeFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    return await resp.text();
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

// ── GACD Index (built once) ────────────────────────────────────────────────
let gacdProducts = [];
let gacdByKeywords = [];  // [{product, keywords: Set}]

function buildGacdIndex() {
  console.log('[GACD] Chargement de l\'index GACD...');
  gacdProducts = JSON.parse(fs.readFileSync(GACD_INPUT, 'utf-8'));
  console.log(`[GACD] ${gacdProducts.length} produits charges`);

  gacdByKeywords = gacdProducts.map(p => ({
    product: p,
    keywords: extractKeywords(p.name || ''),
    normalizedName: normalize(p.name || ''),
  }));
  console.log('[GACD] Index construit');
}

/** Find best GACD match for a product name + category */
function findGacdMatch(hsProduct) {
  const hsName = (hsProduct.product || '') + ' ' + (hsProduct.category || '') + ' ' + (hsProduct.brand || '');
  const hsKeywords = extractKeywords(hsName);
  const hsRef = (hsProduct.ref || '').replace('-', '');

  if (hsKeywords.size === 0) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const entry of gacdByKeywords) {
    // Try exact ref matching first
    if (hsRef && entry.product.ref && entry.product.ref.replace('-', '') === hsRef) {
      return {
        matched_gacd_ref: entry.product.ref,
        matched_gacd_name: entry.product.name,
        price_gacd: parseFloat(entry.product.price) || null,
        match_confidence: 1.0,
        match_method: 'exact_ref',
      };
    }

    // Keyword Jaccard similarity
    const score = jaccard(hsKeywords, entry.keywords);
    if (score > bestScore && score >= MIN_JACCARD) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  if (bestMatch) {
    return {
      matched_gacd_ref: bestMatch.product.ref,
      matched_gacd_name: bestMatch.product.name,
      price_gacd: parseFloat(bestMatch.product.price) || null,
      match_confidence: Math.round(bestScore * 100) / 100,
      match_method: 'jaccard',
    };
  }
  return null;
}

// ── Source 1: Henry Schein website ─────────────────────────────────────────
async function fetchPriceHS(ref) {
  const url = `https://www.henryschein.fr/fr-fr/Shopping/SearchProducts.aspx?searchkeyWord=${encodeURIComponent(ref)}`;
  const html = await safeFetch(url);
  if (!html) return null;
  const price = extractPriceFromHTML(html);
  return price;
}

// ── Source 2: Google Shopping ──────────────────────────────────────────────
async function fetchPriceGoogle(ref) {
  const query = encodeURIComponent(`henry schein ${ref} prix`);
  const url = `https://www.google.fr/search?q=${query}&tbm=shop`;
  const html = await safeFetch(url);
  if (!html) return null;
  const price = extractPriceFromHTML(html);
  return price;
}

// ── Source 4: Supabase local API ───────────────────────────────────────────
async function fetchPriceSupabase(ref) {
  try {
    // Try local Supabase API if running
    const url = `http://localhost:54321/rest/v1/scraped_prices?ref=eq.${encodeURIComponent(ref)}&select=price,supplier&limit=1`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
        'Content-Type': 'application/json',
      },
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data && data.length > 0 && data[0].price) {
      return { price: parseFloat(data[0].price), supplier: data[0].supplier };
    }
  } catch (e) {
    // Supabase not available locally, skip
  }
  return null;
}

// ── Progress management ────────────────────────────────────────────────────
function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS)) {
      return JSON.parse(fs.readFileSync(PROGRESS, 'utf-8'));
    }
  } catch (e) {
    console.warn('[WARN] Fichier de progression corrompu, redemarrage a zero');
  }
  return { enriched: {}, lastIndex: 0 };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS, JSON.stringify(progress, null, 2), 'utf-8');
}

function saveOutput(enrichedList) {
  fs.writeFileSync(OUTPUT, JSON.stringify(enrichedList, null, 2), 'utf-8');
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(60));
  console.log(' ENRICHISSEMENT PRIX HENRY SCHEIN - 2166 produits');
  console.log('='.repeat(60));
  console.log();

  // Load input data
  const hsData = JSON.parse(fs.readFileSync(HS_INPUT, 'utf-8'));
  const products = hsData.products;
  console.log(`[INPUT] ${products.length} produits Henry Schein charges`);

  // Build GACD index
  buildGacdIndex();
  console.log();

  // Load progress
  const progress = loadProgress();
  const enrichedMap = progress.enriched || {};
  const alreadyDone = Object.keys(enrichedMap).length;
  if (alreadyDone > 0) {
    console.log(`[RESUME] ${alreadyDone} produits deja enrichis, reprise...`);
  }

  // Stats
  let stats = {
    total: products.length,
    skipped: 0,
    priceHS: 0,
    priceGoogle: 0,
    priceGACD: 0,
    priceSupabase: 0,
    gacdMatches: 0,
    errors: 0,
  };

  for (let i = 0; i < products.length; i++) {
    const prod = products[i];
    const ref = prod.ref;

    // Skip already enriched
    if (enrichedMap[ref]) {
      stats.skipped++;
      continue;
    }

    const pct = ((i + 1) / products.length * 100).toFixed(1);
    process.stdout.write(`\r[${pct}%] ${i + 1}/${products.length} - Ref ${ref}...`);

    let result = {
      ref: ref,
      product: prod.product || '',
      brand: prod.brand || '',
      category: prod.category || '',
      page: prod.page || null,
      price_hs: prod.price || null,   // some already have price from PDF
      price_gacd: null,
      price_dpi: null,
      matched_gacd_ref: null,
      matched_gacd_name: null,
      match_confidence: null,
    };

    try {
      // ── Source 1: HS website ──
      if (!result.price_hs) {
        const hsPrice = await fetchPriceHS(ref);
        if (hsPrice) {
          result.price_hs = hsPrice;
          stats.priceHS++;
        }
        await sleep(RATE_LIMIT_MS);
      }

      // ── Source 2: Google Shopping ──
      if (!result.price_hs) {
        const googlePrice = await fetchPriceGoogle(ref);
        if (googlePrice) {
          result.price_hs = googlePrice;
          stats.priceGoogle++;
        }
        await sleep(RATE_LIMIT_MS);
      }

      // ── Source 3: GACD matching (local, no delay needed) ──
      const gacdMatch = findGacdMatch(prod);
      if (gacdMatch) {
        result.price_gacd = gacdMatch.price_gacd;
        result.matched_gacd_ref = gacdMatch.matched_gacd_ref;
        result.matched_gacd_name = gacdMatch.matched_gacd_name;
        result.match_confidence = gacdMatch.match_confidence;
        stats.gacdMatches++;
        if (gacdMatch.price_gacd) stats.priceGACD++;
      }

      // ── Source 4: Supabase ──
      const sbResult = await fetchPriceSupabase(ref);
      if (sbResult) {
        result.price_dpi = sbResult.price;
        stats.priceSupabase++;
      }

    } catch (err) {
      stats.errors++;
      console.error(`\n[ERREUR] Ref ${ref}: ${err.message}`);
    }

    // Save to progress
    enrichedMap[ref] = result;

    // Save progress every 10 products
    if ((i + 1) % 10 === 0) {
      progress.enriched = enrichedMap;
      progress.lastIndex = i;
      saveProgress(progress);
    }
  }

  // Final save
  console.log('\n\n[SAVE] Sauvegarde finale...');
  progress.enriched = enrichedMap;
  progress.lastIndex = products.length - 1;
  saveProgress(progress);

  // Build ordered output array (same order as input)
  const enrichedList = products.map(p => enrichedMap[p.ref]).filter(Boolean);
  saveOutput(enrichedList);

  // ── Summary ──────────────────────────────────────────────────────────
  console.log();
  console.log('='.repeat(60));
  console.log(' RESUME ENRICHISSEMENT');
  console.log('='.repeat(60));
  console.log(`  Total produits         : ${stats.total}`);
  console.log(`  Deja enrichis (skip)   : ${stats.skipped}`);
  console.log(`  Prix HS site           : ${stats.priceHS}`);
  console.log(`  Prix Google Shopping   : ${stats.priceGoogle}`);
  console.log(`  Prix GACD (match)      : ${stats.priceGACD}`);
  console.log(`  Prix Supabase/DPI      : ${stats.priceSupabase}`);
  console.log(`  Correspondances GACD   : ${stats.gacdMatches}`);
  console.log(`  Erreurs                : ${stats.errors}`);
  console.log(`  Total enrichis         : ${enrichedList.length}`);
  console.log();
  console.log(`  Fichier sortie : ${OUTPUT}`);
  console.log(`  Progression    : ${PROGRESS}`);
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
