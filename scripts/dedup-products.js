#!/usr/bin/env node
// =============================================
// JADOMI — Deduplication & merge produits
// Passe 51 — Cross-validation multi-sources
//
// Usage : node scripts/dedup-products.js
// =============================================

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const LOG_FILE = '/tmp/passe-51-dedup.log';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function main() {
  log('╔══════════════════════════════════════╗');
  log('║  JADOMI — Deduplication produits    ║');
  log('╚══════════════════════════════════════╝');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    log('ERREUR: SUPABASE_URL et SUPABASE_SERVICE_KEY requis');
    process.exit(1);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Detecter les produits avec meme GTIN mais sources differentes
  // (normalement impossible grace a UNIQUE, mais verifier les variantes)
  log('Verification doublons par GTIN...');

  // Verifier les GTINs avec padding (EAN-8 vs EAN-13)
  const { data: all } = await supabase.from('products_database')
    .select('id, gtin, name, name_fr, brand, source, scan_count, confidence_score')
    .order('gtin')
    .limit(100000);

  if (!all?.length) {
    log('Base vide, rien a dedup');
    return;
  }

  log(`${all.length} produits en base`);

  // Detecter les GTINs courts (EAN-8) qui pourraient matcher un EAN-13
  const gtinMap = new Map();
  for (const p of all) {
    const normalized = p.gtin.padStart(14, '0');
    if (!gtinMap.has(normalized)) gtinMap.set(normalized, []);
    gtinMap.get(normalized).push(p);
  }

  let duplicates = 0;
  let merged = 0;

  for (const [normalizedGtin, products] of gtinMap) {
    if (products.length <= 1) continue;
    duplicates++;

    // Garder le produit le plus complet (le plus de champs remplis + plus de scans)
    const sorted = products.sort((a, b) => {
      const scoreA = (a.name_fr ? 2 : 0) + (a.brand ? 1 : 0) + (a.scan_count || 0) + (a.confidence_score || 0);
      const scoreB = (b.name_fr ? 2 : 0) + (b.brand ? 1 : 0) + (b.scan_count || 0) + (b.confidence_score || 0);
      return scoreB - scoreA;
    });

    const keeper = sorted[0];
    const toDelete = sorted.slice(1);

    // Merger les informations manquantes
    for (const dup of toDelete) {
      const updates = {};
      if (!keeper.name_fr && dup.name_fr) updates.name_fr = dup.name_fr;
      if (!keeper.brand && dup.brand) updates.brand = dup.brand;

      if (Object.keys(updates).length > 0) {
        await supabase.from('products_database').update(updates).eq('id', keeper.id);
      }

      // Supprimer le doublon
      await supabase.from('products_database').delete().eq('id', dup.id);
      merged++;
    }
  }

  log(`=== Deduplication terminee ===`);
  log(`Doublons detectes: ${duplicates} | Merges et supprimes: ${merged}`);

  // Stats finales
  const { count } = await supabase.from('products_database').select('*', { count: 'exact', head: true });
  log(`Total produits apres dedup: ${count}`);
}

main().catch(e => { log('ERREUR: ' + e.message); process.exit(1); });
