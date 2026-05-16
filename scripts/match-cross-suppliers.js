#!/usr/bin/env node
// JADOMI — Matching cross-fournisseurs
// Trouve les produits identiques entre GACD, Mega Dental, Doctor-AI, DentalClick
// Stratégie: 1) Match exact par SKU/référence  2) Match par nom normalisé
// Usage: node scripts/match-cross-suppliers.js [--dry-run]

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DRY_RUN = process.argv.includes('--dry-run');
const startTime = Date.now();

function elapsed() { return Math.round((Date.now() - startTime) / 1000) + 's'; }
function log(msg) { console.log(`[MATCH ${elapsed()}] ${msg}`); }

// Normaliser un nom de produit pour le matching
function normalizeName(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // retirer accents
    .replace(/[®™©]/g, '')
    .replace(/\bboite\s+de\s+\d+/g, '')
    .replace(/\bboîte\s+de\s+\d+/g, '')
    .replace(/\bbte\s+de\s+\d+/g, '')
    .replace(/\bsachet\s+de\s+\d+/g, '')
    .replace(/\blot\s+de\s+\d+/g, '')
    .replace(/\bx\s*\d+/g, '')
    .replace(/\b\d+\s*x\s*\d+/g, '')
    .replace(/\(\d+\)/g, '')          // (100), (50)
    .replace(/\d+\s*(ml|g|kg|cm|mm|l)\b/gi, '') // quantités
    .replace(/\b(petit|moyen|grand|xs|s|m|l|xl|xxl)\b/gi, '') // tailles
    .replace(/\b(blanc|bleu|noir|vert|rouge|jaune|rose|violet|orange)\b/gi, '') // couleurs
    .replace(/[-–—]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extraire les mots-clés significatifs (marque + produit)
function extractKeywords(name) {
  const normalized = normalizeName(name);
  const stopWords = new Set([
    'de', 'du', 'le', 'la', 'les', 'des', 'un', 'une', 'et', 'ou', 'pour', 'avec', 'sans',
    'non', 'poudre', 'poudre', 'type', 'ref', 'recharge', 'refill', 'kit', 'set', 'pack',
    'boite', 'sachet', 'flacon', 'tube', 'seringue', 'capsule', 'compule', 'unitaire',
    'par', 'en', 'a', 'au', 'aux'
  ]);
  return normalized.split(' ').filter(w => w.length > 2 && !stopWords.has(w));
}

// Score de similarité entre deux noms normalisés
function similarityScore(name1, name2) {
  const kw1 = extractKeywords(name1);
  const kw2 = extractKeywords(name2);
  if (kw1.length === 0 || kw2.length === 0) return 0;

  const set1 = new Set(kw1);
  const set2 = new Set(kw2);
  let common = 0;
  for (const w of set1) { if (set2.has(w)) common++; }

  // Jaccard similarity
  const union = new Set([...kw1, ...kw2]).size;
  const jaccard = common / union;

  // Bonus si les 2 premiers mots matchent (souvent marque + produit)
  let prefixBonus = 0;
  if (kw1[0] === kw2[0]) prefixBonus += 0.15;
  if (kw1.length > 1 && kw2.length > 1 && kw1[1] === kw2[1]) prefixBonus += 0.1;

  return Math.min(jaccard + prefixBonus, 1.0);
}

async function fetchAllProducts(supplier) {
  const allProducts = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await db.from('scraped_prices')
      .select('id,product_name,brand,price,price_original,discount_percent,reference,supplier_name')
      .eq('supplier_name', supplier)
      .range(offset, offset + PAGE - 1);
    if (error || !data || data.length === 0) break;
    allProducts.push(...data);
    offset += PAGE;
    if (data.length < PAGE) break;
  }
  return allProducts;
}

async function main() {
  log('=== JADOMI — Matching Cross-Fournisseurs ===\n');

  // Charger tous les produits
  const suppliers = ['gacd', 'megadental', 'doctorai'];
  const allBySupplier = {};

  for (const s of suppliers) {
    allBySupplier[s] = await fetchAllProducts(s);
    log(`${s}: ${allBySupplier[s].length} produits chargés`);
  }

  // PHASE 1: Match exact par référence SKU (Mega Dental ↔ Doctor-AI partagent des SKUs)
  log('\n--- PHASE 1: Match par SKU ---');
  const skuIndex = {}; // sku -> [{supplier, product}]
  let skuMatches = 0;

  for (const s of suppliers) {
    for (const p of allBySupplier[s]) {
      const ref = (p.reference || '').trim();
      if (!ref || ref === '?' || ref.length < 3) continue;
      // Normaliser le SKU
      const normRef = ref.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (normRef.length < 3) continue;
      if (!skuIndex[normRef]) skuIndex[normRef] = [];
      skuIndex[normRef].push({ supplier: s, product: p });
    }
  }

  // Trouver les SKUs présents chez 2+ fournisseurs
  const crossSkuMatches = [];
  for (const [sku, entries] of Object.entries(skuIndex)) {
    const suppliers_here = new Set(entries.map(e => e.supplier));
    if (suppliers_here.size >= 2) {
      crossSkuMatches.push({ sku, entries });
      skuMatches++;
    }
  }

  log(`SKUs partagés entre fournisseurs: ${skuMatches}`);
  // Afficher les 10 premiers
  crossSkuMatches.slice(0, 10).forEach(m => {
    const prices = m.entries.map(e => `${e.supplier}=${e.product.price}€`).join(' vs ');
    const name = m.entries[0].product.product_name.substring(0, 50);
    log(`  SKU ${m.sku.substring(0, 25).padEnd(25)} | ${prices} | ${name}`);
  });

  // PHASE 2: Match par nom normalisé
  log('\n--- PHASE 2: Match par nom normalisé ---');

  // Créer un index par mots-clés pour chaque fournisseur
  const nameMatches = [];
  const processed = new Set();

  // Indexer Mega Dental + Doctor-AI par nom normalisé
  const megaProducts = allBySupplier['megadental'] || [];
  const daiProducts = allBySupplier['doctorai'] || [];
  const gacdProducts = allBySupplier['gacd'] || [];

  // Index par premier mot-clé significatif (rapide)
  function buildIndex(products) {
    const idx = {};
    for (const p of products) {
      const kw = extractKeywords(p.product_name);
      if (kw.length === 0) continue;
      const key = kw[0];
      if (!idx[key]) idx[key] = [];
      idx[key].push(p);
    }
    return idx;
  }

  const megaIndex = buildIndex(megaProducts);
  const daiIndex = buildIndex(daiProducts);

  // Pour chaque produit GACD, chercher un match chez Mega Dental et Doctor-AI
  let nameMatchCount = 0;
  const matchResults = [];

  for (const gacdProd of gacdProducts) {
    const kw = extractKeywords(gacdProd.product_name);
    if (kw.length === 0) continue;
    const firstWord = kw[0];

    // Chercher dans Mega Dental
    let bestMega = null, bestMegaScore = 0;
    const megaCandidates = megaIndex[firstWord] || [];
    for (const mp of megaCandidates) {
      const score = similarityScore(gacdProd.product_name, mp.product_name);
      if (score > bestMegaScore && score >= 0.5) {
        bestMegaScore = score;
        bestMega = mp;
      }
    }

    // Chercher dans Doctor-AI
    let bestDai = null, bestDaiScore = 0;
    const daiCandidates = daiIndex[firstWord] || [];
    for (const dp of daiCandidates) {
      const score = similarityScore(gacdProd.product_name, dp.product_name);
      if (score > bestDaiScore && score >= 0.5) {
        bestDaiScore = score;
        bestDai = dp;
      }
    }

    if (bestMega || bestDai) {
      nameMatchCount++;
      const match = {
        gacd: { name: gacdProd.product_name, price: gacdProd.price, brand: gacdProd.brand },
        mega: bestMega ? { name: bestMega.product_name, price: bestMega.price, score: bestMegaScore } : null,
        dai: bestDai ? { name: bestDai.product_name, price: bestDai.price, score: bestDaiScore } : null
      };

      // Calculer le meilleur prix
      const prices = [gacdProd.price];
      if (bestMega) prices.push(bestMega.price);
      if (bestDai) prices.push(bestDai.price);
      match.bestPrice = Math.min(...prices.filter(p => p > 0));
      match.worstPrice = Math.max(...prices.filter(p => p > 0));
      match.saving = match.worstPrice > 0 ? Math.round((1 - match.bestPrice / match.worstPrice) * 100) : 0;

      matchResults.push(match);
    }
  }

  log(`Produits matchés par nom: ${nameMatchCount}`);

  // Top 20 meilleures économies
  matchResults.sort((a, b) => b.saving - a.saving);
  log('\n--- TOP 20 MEILLEURES ECONOMIES ---');
  matchResults.slice(0, 20).forEach((m, i) => {
    const gacdPrice = m.gacd.price > 0 ? `GACD=${m.gacd.price}€` : '';
    const megaPrice = m.mega ? `Mega=${m.mega.price}€` : '';
    const daiPrice = m.dai ? `DocAI=${m.dai.price}€` : '';
    log(`  ${String(i+1).padStart(2)}. -${m.saving}% | ${gacdPrice} ${megaPrice} ${daiPrice}`);
    log(`      GACD: ${m.gacd.name.substring(0, 60)}`);
    if (m.mega) log(`      Mega: ${m.mega.name.substring(0, 60)} (score=${m.mega.score.toFixed(2)})`);
    if (m.dai) log(`      DocAI: ${m.dai.name.substring(0, 60)} (score=${m.dai.score.toFixed(2)})`);
  });

  // Stats globales
  const withSavings = matchResults.filter(m => m.saving > 0);
  const avgSaving = withSavings.length > 0 ? Math.round(withSavings.reduce((s, m) => s + m.saving, 0) / withSavings.length) : 0;
  log(`\n--- STATS ---`);
  log(`Total produits matchés: ${matchResults.length}`);
  log(`Avec économie possible: ${withSavings.length}`);
  log(`Économie moyenne: ${avgSaving}%`);
  log(`SKU matches: ${skuMatches}`);

  // Sauvegarder les résultats
  const output = {
    timestamp: new Date().toISOString(),
    stats: { totalMatched: matchResults.length, withSavings: withSavings.length, avgSaving, skuMatches },
    skuMatches: crossSkuMatches.slice(0, 100).map(m => ({
      sku: m.sku,
      prices: m.entries.map(e => ({ supplier: e.supplier, price: e.product.price, name: e.product.product_name }))
    })),
    topSavings: matchResults.slice(0, 100).map(m => ({
      saving: m.saving,
      bestPrice: m.bestPrice,
      gacd: m.gacd,
      mega: m.mega,
      dai: m.dai
    }))
  };
  require('fs').writeFileSync('/home/ubuntu/jadomi/tmp/cross-match-results.json', JSON.stringify(output, null, 2));
  log(`\nRésultats sauvegardés dans tmp/cross-match-results.json`);
  log(`Terminé en ${elapsed()}`);
}

main().catch(e => { console.error(e); process.exit(1); });
