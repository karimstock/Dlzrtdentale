#!/usr/bin/env node
/**
 * MATCHING CROSS-FOURNISSEURS V2
 * Pour chaque produit, cherche s'il existe chez les autres fournisseurs
 *
 * Sources de données:
 * - Henry Schein: 40K refs (PDF + sitemap) → prix via dents.henryschein.fr
 * - GACD: 38K refs (Algolia) → prix inclus
 * - DPI: 9.5K refs (PDF) → prix via dentalpromotion.fr
 * - MegaDental: 19K refs (PDF) → prix dans les flyers
 *
 * Méthodes de matching:
 * 1. Ref exacte (même ref chez 2 fournisseurs = même produit fabricant)
 * 2. Nom produit normalisé (Jaccard keywords)
 * 3. Marque + description (fuzzy match)
 *
 * Pour les sites ouverts (Dentaltix, DentalClick, DPI):
 * → Recherche web du nom produit sur leur site
 */

const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '..', 'tmp');
const OUTPUT = path.join(TMP, 'cross-supplier-matches.json');
const PROGRESS = path.join(TMP, 'cross-match-progress.json');

// ── Normalize ──
function normalize(text) {
  if (!text) return '';
  return text.toLowerCase()
    .replace(/[éèêë]/g, 'e').replace(/[àâä]/g, 'a').replace(/[ùûü]/g, 'u')
    .replace(/[ôö]/g, 'o').replace(/[îï]/g, 'i').replace(/ç/g, 'c')
    .replace(/™|®|©/g, '')
    .replace(/\b(boite|boîte|lot|paquet|sachet|coffret|kit|set|recharge)\s*(de)?\s*\d+\b/gi, '')
    .replace(/\b\d+\s*(ml|l|g|kg|cm|mm|pcs|pieces|unites|µm)\b/gi, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

const STOP = new Set(['le','la','les','de','du','des','un','une','pour','avec','sans','par','en','et','ou','au','aux','sur','dans','henry','schein','dental','dentaire','dentsply','sirona']);

function keywords(text) {
  return normalize(text).split(' ').filter(w => w.length > 2 && !STOP.has(w));
}

function jaccard(kw1, kw2) {
  const s1 = new Set(kw1);
  const s2 = new Set(kw2);
  const inter = [...s1].filter(w => s2.has(w)).length;
  const union = new Set([...s1, ...s2]).size;
  return union > 0 ? inter / union : 0;
}

// ── Load all data sources ──
function loadSource(filename, supplier) {
  const filepath = path.join(TMP, filename);
  if (!fs.existsSync(filepath)) { console.log(`  ⚠ ${filename} non trouvé`); return []; }
  const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  const products = data.products || data;
  console.log(`  ✓ ${supplier}: ${products.length} produits`);
  return products.map(p => ({
    ref: p.ref || p.sku || '',
    name: p.product || p.name || p.nom || '',
    brand: p.brand || p.marque || '',
    price: p.price || p.price_hs || p.prix || null,
    category: p.category || p.categorie || '',
    supplier,
    _kw: keywords((p.product || p.name || '') + ' ' + (p.brand || ''))
  }));
}

// ── Build keyword index for fast lookup ──
function buildIndex(products) {
  const idx = {}; // keyword → [product indices]
  products.forEach((p, i) => {
    for (const w of p._kw) {
      if (!idx[w]) idx[w] = [];
      idx[w].push(i);
    }
  });
  return idx;
}

// ── Find matches for a product ──
function findMatches(product, targets, targetIndex, topN = 3) {
  if (!product._kw.length) return [];

  // Get candidate indices (products sharing at least 1 keyword)
  const candidateCounts = {};
  for (const w of product._kw) {
    if (targetIndex[w]) {
      for (const idx of targetIndex[w]) {
        candidateCounts[idx] = (candidateCounts[idx] || 0) + 1;
      }
    }
  }

  // Only score candidates with 2+ shared keywords (speed optimization)
  const candidates = Object.entries(candidateCounts)
    .filter(([_, count]) => count >= 2)
    .map(([idx]) => parseInt(idx));

  // Score each candidate
  const scored = candidates.map(idx => {
    const t = targets[idx];
    const score = jaccard(product._kw, t._kw);
    return { idx, score, product: t };
  }).filter(m => m.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return scored.map(m => ({
    ref: m.product.ref,
    name: m.product.name,
    brand: m.product.brand,
    price: m.product.price,
    supplier: m.product.supplier,
    confidence: Math.round(m.score * 100)
  }));
}

// ── Web search on open sites ──
const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function searchDentaltix(productName) {
  try {
    const q = encodeURIComponent(normalize(productName).split(' ').slice(0, 4).join(' '));
    const url = `https://www.dentaltix.com/fr/catalogsearch/result/?q=${q}`;
    const ua = UAS[Math.floor(Math.random() * UAS.length)];
    const r = await fetch(url, { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const html = await r.text();
    const priceMatch = html.match(/data-price-amount="([0-9.]+)"/);
    const nameMatch = html.match(/product-item-link[^>]*>([^<]+)/);
    if (priceMatch) {
      return {
        price: parseFloat(priceMatch[1]),
        name: nameMatch ? nameMatch[1].trim() : null,
        supplier: 'Dentaltix'
      };
    }
  } catch (e) {}
  return null;
}

async function searchDPI(productName) {
  try {
    const q = encodeURIComponent(normalize(productName).split(' ').slice(0, 4).join(' '));
    const url = `https://www.dentalpromotion.fr/shop?search_api_fulltext=${q}`;
    const ua = UAS[Math.floor(Math.random() * UAS.length)];
    const r = await fetch(url, { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const html = await r.text();
    const priceMatch = html.match(/product-price[^>]*>([0-9]+[,.]?[0-9]*)\s*EUR/);
    if (priceMatch) {
      return {
        price: parseFloat(priceMatch[1].replace(',', '.')),
        supplier: 'DPI'
      };
    }
  } catch (e) {}
  return null;
}

// ── Main ──
async function main() {
  console.log('=== MATCHING CROSS-FOURNISSEURS V2 ===\n');

  // Load all sources
  console.log('Chargement des données...');
  const hs = loadSource('henryschein-all-refs.json', 'Henry Schein');
  const gacd = loadSource('gacd-algolia-2026-05-08.json', 'GACD');

  // DPI & MegaDental from parsed PDFs
  const dpiFiles = ['dpi-catalogue-general.json'];
  let dpi = [];
  for (const f of dpiFiles) {
    const fp = path.join(TMP, f);
    if (fs.existsSync(fp)) {
      const d = JSON.parse(fs.readFileSync(fp, 'utf8'));
      const prods = (d.products || d).map(p => ({
        ref: p.ref || '', name: p.product || p.name || '', brand: p.brand || 'DPI',
        price: p.price || p.prixPromo || null, category: p.category || '', supplier: 'DPI',
        _kw: keywords((p.product || p.name || '') + ' ' + (p.brand || ''))
      }));
      dpi = dpi.concat(prods);
    }
  }
  console.log(`  ✓ DPI: ${dpi.length} produits`);

  // Build indices
  console.log('\nConstruction des index...');
  const gacdIndex = buildIndex(gacd);
  const dpiIndex = buildIndex(dpi);
  console.log(`  GACD index: ${Object.keys(gacdIndex).length} keywords`);
  console.log(`  DPI index: ${Object.keys(dpiIndex).length} keywords`);

  // Match Henry Schein → other suppliers
  console.log(`\nMatching ${hs.length} produits Henry Schein...\n`);

  const results = [];
  let matched = 0;
  let withSavings = 0;

  // Load progress
  let done = new Set();
  if (fs.existsSync(PROGRESS)) {
    const prog = JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
    done = new Set(prog.done || []);
    console.log(`Reprise: ${done.size} déjà traités`);
  }

  for (let i = 0; i < hs.length; i++) {
    const p = hs[i];
    if (done.has(p.ref)) continue;

    // Local matching (fast)
    const gacdMatches = findMatches(p, gacd, gacdIndex, 2);
    const dpiMatches = findMatches(p, dpi, dpiIndex, 2);

    const allMatches = [...gacdMatches, ...dpiMatches];

    if (allMatches.length > 0) {
      matched++;
      const bestPrice = allMatches.filter(m => m.price).sort((a, b) => a.price - b.price)[0];
      const hsPrice = p.price;

      let savings = null;
      if (hsPrice && bestPrice && bestPrice.price < hsPrice) {
        savings = Math.round((1 - bestPrice.price / hsPrice) * 100);
        withSavings++;
      }

      results.push({
        hs_ref: p.ref,
        hs_name: p.name,
        hs_price: hsPrice,
        hs_brand: p.brand,
        matches: allMatches,
        best_alternative: bestPrice || null,
        savings_pct: savings
      });
    }

    done.add(p.ref);

    if ((i + 1) % 500 === 0) {
      const pct = Math.round(((i + 1) / hs.length) * 100);
      console.log(`[${pct}%] ${i + 1}/${hs.length} | Matchés: ${matched} | Économies: ${withSavings}`);
      fs.writeFileSync(PROGRESS, JSON.stringify({ done: [...done] }));
    }
  }

  // Save results
  const output = {
    generated_at: new Date().toISOString(),
    stats: {
      hs_total: hs.length,
      matched,
      with_savings: withSavings,
      match_rate: Math.round(matched / hs.length * 100) + '%'
    },
    matches: results
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
  fs.writeFileSync(PROGRESS, JSON.stringify({ done: [...done] }));

  console.log('\n=== RÉSUMÉ ===');
  console.log(`Total HS: ${hs.length}`);
  console.log(`Matchés avec GACD/DPI: ${matched} (${output.stats.match_rate})`);
  console.log(`Avec économies possibles: ${withSavings}`);
  console.log(`Fichier: ${OUTPUT}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
