#!/usr/bin/env node
// =============================================
// JADOMI — Import Datakick/GTIN Search API
// Passe 51 — Enrichissement GTINs manquants
//
// Usage : node scripts/import-datakick.js
//
// Source : https://www.datakick.org/api
// API REST gratuite, pas de rate limit strict
// =============================================

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const LOG_FILE = '/tmp/passe-51-datakick.log';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function fetchFromDatakick(gtin) {
  try {
    const res = await fetch(`https://www.datakick.org/api/items/${gtin}`, {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.name) return null;
    return {
      gtin: data.gtin14 || data.gtin || gtin,
      name: data.name,
      brand: data.brand_name || null,
      manufacturer: data.manufacturer || null,
      image_url: data.image || null,
      source_metadata: {
        size: data.size,
        ingredients: data.ingredients,
        country: data.country
      }
    };
  } catch (e) { return null; }
}

async function main() {
  log('╔══════════════════════════════════════╗');
  log('║  JADOMI — Import Datakick API       ║');
  log('╚══════════════════════════════════════╝');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    log('ERREUR: SUPABASE_URL et SUPABASE_SERVICE_KEY requis');
    process.exit(1);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Recuperer les produits sans nom complet dans products_database
  const { data: incomplete } = await supabase.from('products_database')
    .select('gtin')
    .or('name_fr.is.null,brand.is.null')
    .limit(1000);

  if (!incomplete || !incomplete.length) {
    log('Aucun produit a enrichir');
    return;
  }

  log(`${incomplete.length} produits a enrichir via Datakick`);
  let enriched = 0;

  for (const product of incomplete) {
    const data = await fetchFromDatakick(product.gtin);
    if (data) {
      try {
        await supabase.from('products_database').update({
          name: data.name,
          brand: data.brand,
          manufacturer: data.manufacturer,
          image_url: data.image_url,
          source_metadata: data.source_metadata,
          last_synced_at: new Date().toISOString()
        }).eq('gtin', product.gtin);
        enriched++;
      } catch (e) { /* skip */ }
    }

    // Rate limit respectueux : 500ms entre chaque appel
    await new Promise(r => setTimeout(r, 500));

    if (enriched % 50 === 0 && enriched > 0) {
      log(`Progress: ${enriched} enrichis / ${incomplete.length}`);
    }
  }

  log(`=== Datakick termine: ${enriched} produits enrichis ===`);
}

main().catch(e => { log('ERREUR: ' + e.message); process.exit(1); });
