#!/usr/bin/env node
/**
 * JADOMI — Matching V2 : scraped_prices ↔ products_database
 *
 * Stratégie en 3 passes :
 *   1. Match exact par REFERENCE FABRICANT (plus fiable)
 *   2. Match exact par GTIN / code-barres EAN
 *   3. Match fuzzy par NOM + MARQUE (dernier recours, seuil élevé)
 *
 * Usage : node scripts/match-scraped-to-products-v2.js [--force]
 *   --force : re-matcher même les produits déjà matchés
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);

const FORCE = process.argv.includes('--force');
const BATCH = 500;

let stats = { processed: 0, matched_ref: 0, matched_gtin: 0, matched_name: 0, skipped: 0, errors: 0 };

async function run() {
  console.log('[MATCH-V2] Démarrage matching V2...');
  console.log('[MATCH-V2] Mode:', FORCE ? 'FORCE (re-match tout)' : 'INCREMENTAL (non-matchés seulement)');

  // Pré-charger un index des refs fabricant pour accélérer
  console.log('[MATCH-V2] Chargement index refs fabricant...');
  const refIndex = await buildRefIndex();
  console.log('[MATCH-V2] Index:', Object.keys(refIndex).length, 'refs uniques chargées');

  let offset = 0;
  while (true) {
    let query = db.from('scraped_prices').select('id,product_name,brand,reference').range(offset, offset + BATCH - 1);
    if (!FORCE) query = query.is('matched_product_id', null);

    const { data: scraped, error } = await query;
    if (error) { console.error('[MATCH-V2] Fetch error:', error.message); break; }
    if (!scraped || scraped.length === 0) break;

    for (const sp of scraped) {
      stats.processed++;
      const match = await matchProduct(sp, refIndex);
      if (match) {
        await db.from('scraped_prices').update({
          matched_product_id: match.id,
          matched_gtin: match.gtin,
          match_confidence: match.confidence,
        }).eq('id', sp.id);
      }
    }

    offset += BATCH;
    if (stats.processed % 1000 === 0) {
      const pct = Math.round((stats.matched_ref + stats.matched_gtin + stats.matched_name) / stats.processed * 100);
      console.log(`[MATCH-V2] ${stats.processed} traités | ref: ${stats.matched_ref} | gtin: ${stats.matched_gtin} | nom: ${stats.matched_name} | total: ${pct}%`);
    }
  }

  console.log('\n[MATCH-V2] ═══ RÉSULTAT FINAL ═══');
  console.log(`Traités:     ${stats.processed}`);
  console.log(`Match ref:   ${stats.matched_ref} (${pct(stats.matched_ref)}%)`);
  console.log(`Match GTIN:  ${stats.matched_gtin} (${pct(stats.matched_gtin)}%)`);
  console.log(`Match nom:   ${stats.matched_name} (${pct(stats.matched_name)}%)`);
  console.log(`TOTAL:       ${stats.matched_ref + stats.matched_gtin + stats.matched_name} (${pct(stats.matched_ref + stats.matched_gtin + stats.matched_name)}%)`);
  console.log(`Non matchés: ${stats.processed - stats.matched_ref - stats.matched_gtin - stats.matched_name}`);
}

function pct(n) { return stats.processed ? Math.round(n / stats.processed * 100) : 0; }

/**
 * Construit un index inversé ref_fabricant → product_id + gtin
 * pour éviter 170K requêtes individuelles
 */
async function buildRefIndex() {
  const index = {};
  let offset = 0;
  const PAGE = 5000;

  while (true) {
    const { data, error } = await db
      .from('products_database')
      .select('id, gtin, manufacturer_ref, name, brand')
      .not('manufacturer_ref', 'is', null)
      .neq('manufacturer_ref', '')
      .range(offset, offset + PAGE - 1);

    if (error || !data || data.length === 0) break;

    for (const p of data) {
      const ref = normalizeRef(p.manufacturer_ref);
      if (ref && ref.length >= 3) {
        if (!index[ref]) index[ref] = [];
        index[ref].push({ id: p.id, gtin: p.gtin, name: p.name, brand: p.brand });
      }
    }
    offset += PAGE;
    if (offset % 50000 === 0) process.stdout.write('.');
  }
  process.stdout.write('\n');
  return index;
}

/**
 * Match un produit scrapé avec la base produits
 */
async function matchProduct(sp, refIndex) {
  const ref = normalizeRef(sp.reference);
  const brand = (sp.brand || '').toLowerCase().trim();
  const name = (sp.product_name || '').toLowerCase().trim();

  // ═══ PASSE 1 : Match par ref fabricant ═══
  if (ref && ref.length >= 3 && refIndex[ref]) {
    const candidates = refIndex[ref];
    // Si une seule correspondance, c'est bon
    if (candidates.length === 1) {
      stats.matched_ref++;
      return { id: candidates[0].id, gtin: candidates[0].gtin, confidence: 0.95 };
    }
    // Plusieurs : choisir le meilleur par marque/nom
    const best = candidates.find(c => {
      const cBrand = (c.brand || '').toLowerCase();
      return brand && cBrand && (cBrand.includes(brand) || brand.includes(cBrand));
    }) || candidates[0];
    stats.matched_ref++;
    return { id: best.id, gtin: best.gtin, confidence: 0.85 };
  }

  // ═══ PASSE 2 : Match par GTIN (code-barres EAN) ═══
  if (ref && /^\d{8,14}$/.test(ref)) {
    const { data } = await db.from('products_database')
      .select('id, gtin')
      .eq('gtin', ref)
      .limit(1);
    if (data && data.length > 0) {
      stats.matched_gtin++;
      return { id: data[0].id, gtin: data[0].gtin, confidence: 0.99 };
    }
  }

  // ═══ PASSE 3 : Match fuzzy par nom + marque ═══
  if (!name || name.length < 5) return null;

  // Extraire les mots significatifs (> 3 lettres, pas des mots génériques)
  const stopWords = new Set(['boite','boîte','tube','sachet','lot','paire','recharge','coffret','blister','flacon','pack','avec','pour','pcs','pieces','unités','unites','conditionnement','teinte','taille','recharge','refill','value','seringue','capsule','capsules','syringe']);
  const words = name.replace(/[-–—()[\]]/g, ' ').split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w) && !/^\d+$/.test(w))
    .slice(0, 4);

  if (words.length < 2) return null;

  // Chercher avec les 2 premiers mots significatifs
  const { data } = await db.from('products_database')
    .select('id, gtin, name, brand, manufacturer_ref')
    .ilike('name', `%${words[0]}%`)
    .ilike('name', `%${words[1]}%`)
    .limit(10);

  if (!data || data.length === 0) return null;

  // Scorer
  let bestScore = 0;
  let bestMatch = null;

  for (const prod of data) {
    let score = 0;
    const pName = (prod.name || '').toLowerCase();
    const pBrand = (prod.brand || '').toLowerCase();

    // Mots en commun
    for (const w of words) {
      if (pName.includes(w)) score += 0.15;
    }

    // Marque identique
    if (brand && pBrand && (pBrand.includes(brand) || brand.includes(pBrand))) {
      score += 0.35;
    }

    // Début de nom similaire
    if (name.slice(0, 10) === pName.slice(0, 10)) score += 0.15;

    score = Math.min(score, 1.0);

    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestMatch = { id: prod.id, gtin: prod.gtin, confidence: Math.round(score * 100) / 100 };
    }
  }

  if (bestMatch) stats.matched_name++;
  return bestMatch;
}

/**
 * Normalise une référence : supprime les zéros en tête, met en minuscule
 */
function normalizeRef(ref) {
  if (!ref) return null;
  return String(ref).trim().replace(/^0+/, '').toLowerCase();
}

run().catch(e => console.error('[MATCH-V2] Fatal:', e));
