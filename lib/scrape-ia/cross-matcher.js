// =============================================
// JADOMI — CROSS-MATCHER IA
//
// Compare les produits ENTRE fournisseurs pour
// grouper les mêmes produits dans le comparateur.
//
// Étape 1 : Pré-filtre rapide (marque + mots-clés) — gratuit, local
// Étape 2 : Confirmation IA (Gemini/Ollama) — seulement sur les candidats
//
// Objectif : "AH Plus Jet" chez GACD = même chose que
// "AH Plus Bioceramic Sealer" chez DoctorStrong
// =============================================

const { matchProductBatch } = require('./analyzer');
const fs = require('fs');

const LOG_FILE = '/tmp/scrape-ia-crossmatch.log';
const RESULTS_FILE = '/tmp/scrape-ia-crossmatch-results.json';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// =============================================
// PRÉ-FILTRE LOCAL (0€, instantané)
// =============================================

/**
 * Normalise un nom produit pour le pré-matching
 * Retire les mots vides, normalise les accents, lowercase
 */
function normalize(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // accents
    .replace(/[^a-z0-9\s]/g, ' ')                     // ponctuation
    .replace(/\b(de|du|des|le|la|les|un|une|pour|avec|et|en|par|lot|boite|bte|pcs|pce|pieces?|coffret|kit|pack)\b/g, '') // mots vides
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrait les tokens significatifs d'un nom produit
 */
function tokenize(name) {
  return normalize(name).split(' ').filter(t => t.length >= 2);
}

/**
 * Score de similarité locale entre deux produits (0-1)
 * Basé sur les tokens communs + marque
 */
function localSimilarity(a, b) {
  let score = 0;

  // Marque identique = +0.3
  if (a.brand && b.brand && normalize(a.brand) === normalize(b.brand)) {
    score += 0.3;
  }

  // Référence identique = match direct
  if (a.ref && b.ref && a.ref.replace(/\s/g, '') === b.ref.replace(/\s/g, '')) {
    return 0.95;
  }

  // Tokens communs
  const tokensA = tokenize(a.name);
  const tokensB = tokenize(b.name);
  if (tokensA.length === 0 || tokensB.length === 0) return score;

  const common = tokensA.filter(t => tokensB.includes(t));
  const jaccard = common.length / new Set([...tokensA, ...tokensB]).size;
  score += jaccard * 0.7;

  return Math.min(score, 1);
}

// =============================================
// CROSS-MATCHING PIPELINE
// =============================================

/**
 * Cross-match produits entre deux fournisseurs
 * @param {Array} productsA - Produits fournisseur A
 * @param {Array} productsB - Produits fournisseur B
 * @param {Object} options - { threshold, iaConfirm, maxIaCalls }
 * @returns {Array} Matches trouvés
 */
async function crossMatch(productsA, productsB, options = {}) {
  const threshold = options.threshold || 0.4;  // seuil pré-filtre
  const iaConfirm = options.iaConfirm !== false; // confirmer par IA
  const maxIaCalls = options.maxIaCalls || 500;
  let iaCalls = 0;

  log(`\n=== CROSS-MATCH: ${productsA[0]?.supplier || '?'} (${productsA.length}) vs ${productsB[0]?.supplier || '?'} (${productsB.length}) ===`);

  const matches = [];
  const candidatePairs = [];

  // Phase 1 : Pré-filtre local
  log('Phase 1 — pré-filtre local...');
  for (const pA of productsA) {
    const candidates = [];
    for (const pB of productsB) {
      const sim = localSimilarity(pA, pB);
      if (sim >= threshold) {
        candidates.push({ product: pB, similarity: sim });
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.similarity - a.similarity);
      candidatePairs.push({
        reference: pA,
        candidates: candidates.slice(0, 5), // top 5 candidats max
      });
    }
  }

  log(`  ${candidatePairs.length} produits avec candidats (seuil ${threshold})`);

  // Matches directs (ref identique, score >= 0.9)
  const directMatches = candidatePairs.filter(p =>
    p.candidates.some(c => c.similarity >= 0.9)
  );
  for (const dm of directMatches) {
    const best = dm.candidates[0];
    matches.push({
      productA: dm.reference,
      productB: best.product,
      confidence: best.similarity,
      method: 'ref_exact',
      reason: 'Référence identique',
    });
  }
  log(`  ${directMatches.length} matches directs (ref identique)`);

  // Phase 2 : Confirmation IA pour les candidats incertains (0.4 - 0.9)
  if (iaConfirm) {
    const uncertain = candidatePairs.filter(p =>
      !p.candidates.some(c => c.similarity >= 0.9) &&
      p.candidates.some(c => c.similarity >= threshold)
    );
    log(`Phase 2 — confirmation IA pour ${uncertain.length} produits incertains...`);

    for (const pair of uncertain) {
      if (iaCalls >= maxIaCalls) {
        log(`  Limite IA atteinte (${maxIaCalls} appels)`);
        break;
      }

      const candidateProducts = pair.candidates.map(c => c.product);
      const iaResults = await matchProductBatch(pair.reference, candidateProducts);
      iaCalls++;

      for (const result of iaResults) {
        matches.push({
          productA: pair.reference,
          productB: result.candidate,
          confidence: result.confidence,
          method: 'ia_confirmed',
          reason: result.reason,
        });
      }
    }
    log(`  ${iaCalls} appels IA effectués`);
  }

  log(`  TOTAL: ${matches.length} matches trouvés`);

  // Sauvegarder les résultats
  const existingResults = loadResults();
  const key = `${productsA[0]?.supplier || '?'}_vs_${productsB[0]?.supplier || '?'}`;
  existingResults[key] = {
    date: new Date().toISOString(),
    totalA: productsA.length,
    totalB: productsB.length,
    matches: matches.length,
    data: matches.map(m => ({
      nameA: m.productA.name,
      nameB: m.productB.name,
      refA: m.productA.ref,
      refB: m.productB.ref,
      priceA: m.productA.price,
      priceB: m.productB.price,
      confidence: m.confidence,
      method: m.method,
      reason: m.reason,
    })),
  };
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(existingResults, null, 2));

  return matches;
}

function loadResults() {
  try { return JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')); }
  catch { return {}; }
}

/**
 * Cross-match tous les fournisseurs entre eux
 * @param {Object} allProducts - { gacd: [...], dgd: [...], ... }
 */
async function crossMatchAll(allProducts, options = {}) {
  const suppliers = Object.keys(allProducts).filter(k => allProducts[k].length > 0);
  const allMatches = {};

  log(`\n=== CROSS-MATCH ALL: ${suppliers.length} fournisseurs ===`);
  log(`  ${suppliers.map(s => `${s}: ${allProducts[s].length}`).join(', ')}`);

  // Comparer chaque paire (A vs B, pas B vs A)
  for (let i = 0; i < suppliers.length; i++) {
    for (let j = i + 1; j < suppliers.length; j++) {
      const keyA = suppliers[i];
      const keyB = suppliers[j];
      const matches = await crossMatch(
        allProducts[keyA],
        allProducts[keyB],
        options
      );
      allMatches[`${keyA}_vs_${keyB}`] = matches;
    }
  }

  // Résumé
  const totalMatches = Object.values(allMatches).reduce((s, m) => s + m.length, 0);
  log(`\n=== RÉSUMÉ CROSS-MATCH ===`);
  for (const [key, matches] of Object.entries(allMatches)) {
    log(`  ${key}: ${matches.length} matches`);
  }
  log(`  TOTAL: ${totalMatches} matches`);

  return allMatches;
}

module.exports = {
  crossMatch,
  crossMatchAll,
  normalize,
  tokenize,
  localSimilarity,
};
