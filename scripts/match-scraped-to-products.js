#!/usr/bin/env node
// JADOMI — Matching batch : scraped_prices ↔ products_database
// Relie les prix GACD aux GTINs de la base produits
// Usage : node scripts/match-scraped-to-products.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('[MATCH] Démarrage du matching scraped_prices ↔ products_database...');

  // Récupérer tous les scraped_prices non encore matchés
  const PAGE = 500;
  let offset = 0;
  let totalMatched = 0;
  let totalProcessed = 0;

  while (true) {
    const { data: scraped, error } = await db
      .from('scraped_prices')
      .select('id,product_name,brand,reference')
      .is('matched_product_id', null)
      .range(offset, offset + PAGE - 1);

    if (error) { console.error('[MATCH] Erreur fetch:', error.message); break; }
    if (!scraped || scraped.length === 0) break;

    for (const sp of scraped) {
      totalProcessed++;
      const match = await findBestMatch(sp);
      if (match) {
        totalMatched++;
        await db.from('scraped_prices').update({
          matched_product_id: match.id,
          matched_gtin: match.gtin,
          match_confidence: match.confidence
        }).eq('id', sp.id);
      }

      if (totalProcessed % 200 === 0) {
        console.log(`[MATCH] ${totalProcessed} traités, ${totalMatched} matchés (${Math.round(totalMatched/totalProcessed*100)}%)`);
      }
    }

    offset += PAGE;
  }

  console.log(`[MATCH] TERMINÉ: ${totalMatched}/${totalProcessed} matchés (${Math.round(totalMatched/totalProcessed*100)}%)`);
}

async function findBestMatch(sp) {
  // Stratégie 1: match exact par premier mot significatif du nom + marque
  const words = sp.product_name
    .replace(/[-–—]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !/^(boîte|boite|tube|sachet|lot|paire|recharge|coffret|blister|flacon)$/i.test(w))
    .slice(0, 3);

  if (words.length === 0) return null;

  // Essai 1: premier mot principal dans le nom
  let { data } = await db
    .from('products_database')
    .select('id,gtin,name,brand')
    .ilike('name', `%${words[0]}%`)
    .limit(20);

  if (!data || data.length === 0) return null;

  // Scorer les résultats
  let bestScore = 0;
  let bestMatch = null;

  for (const prod of data) {
    let score = 0;
    const prodName = (prod.name || '').toLowerCase();
    const spName = sp.product_name.toLowerCase();

    // Points pour chaque mot en commun
    for (const w of words) {
      if (prodName.includes(w.toLowerCase())) score += 0.25;
    }

    // Bonus si la marque correspond
    if (sp.brand && prod.brand) {
      const spBrand = sp.brand.toLowerCase();
      const prodBrand = prod.brand.toLowerCase();
      if (prodBrand.includes(spBrand) || spBrand.includes(prodBrand)) {
        score += 0.3;
      }
    }

    // Bonus si les premiers caractères du nom matchent
    if (spName.slice(0, 8) === prodName.slice(0, 8)) score += 0.2;

    // Cap à 1.0
    score = Math.min(score, 1.0);

    if (score > bestScore && score >= 0.4) {
      bestScore = score;
      bestMatch = { id: prod.id, gtin: prod.gtin, confidence: Math.round(score * 100) / 100 };
    }
  }

  return bestMatch;
}

run().catch(e => console.error('[MATCH] Fatal:', e));
