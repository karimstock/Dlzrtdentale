#!/usr/bin/env node
// =============================================
// JADOMI — Import EUDAMED v2 (via search.eudamed.com)
// Passe 51 — Produits dentaires europeens
//
// Usage : node scripts/import-eudamed-v2.js [--limit 10000]
//
// Source : search.eudamed.com/api/search (fonctionne !)
// Recupere les vrais fabricants dentaires EU avec leurs SRN
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const LOG_FILE = '/tmp/passe-51-eudamed-v2.log';
const LIMIT = parseInt((process.argv.find(a => a.startsWith('--limit=')) || '--limit=10000').split('=')[1]);
const SEARCH_API = 'https://search.eudamed.com/api/search';
const DELAY_MS = 1500;

// Fabricants dentaires EU a importer
const DENTAL_SEARCHES = [
  // Endodontie
  { query: 'FKG Dentaire', expectedMfg: 'FKG', category: 'Endodontie' },
  { query: 'Micro-Mega', expectedMfg: 'Micro-Mega', category: 'Endodontie' },
  { query: 'Produits Dentaires SA', expectedMfg: 'Produits Dentaires', category: 'Endodontie' },
  // Implants
  { query: 'Anthogyr', expectedMfg: 'anthogyr', category: 'Implants' },
  { query: 'Global D implant', expectedMfg: 'Global D', category: 'Implants' },
  { query: 'TBR implant', expectedMfg: 'TBR', category: 'Implants' },
  { query: 'Euroteknika', expectedMfg: 'Euroteknika', category: 'Implants' },
  // Instruments
  { query: 'Bien-Air Dental', expectedMfg: 'Bien-Air', category: 'Instruments' },
  { query: 'Acteon', expectedMfg: 'ACTEON', category: 'Instruments' },
  { query: 'EMS dental', expectedMfg: 'EMS', category: 'Instruments' },
  { query: 'Mectron', expectedMfg: 'Mectron', category: 'Instruments' },
  { query: 'W&H dental', expectedMfg: 'W&H', category: 'Instruments' },
  { query: 'NSK dental', expectedMfg: 'NSK', category: 'Instruments' },
  // Materiaux
  { query: 'Ivoclar Vivadent', expectedMfg: 'Ivoclar', category: 'Prothese' },
  { query: 'VITA Zahnfabrik', expectedMfg: 'VITA', category: 'Prothese' },
  { query: 'Zhermack dental', expectedMfg: 'Zhermack', category: 'Empreintes' },
  { query: 'Kettenbach dental', expectedMfg: 'Kettenbach', category: 'Empreintes' },
  { query: 'DMG dental', expectedMfg: 'DMG', category: 'Composites' },
  { query: 'VOCO dental', expectedMfg: 'VOCO', category: 'Composites' },
  { query: 'Kulzer dental', expectedMfg: 'Kulzer', category: 'Composites' },
  { query: 'Coltene dental', expectedMfg: 'Coltene', category: 'Composites' },
  { query: 'GC dental', expectedMfg: 'GC', category: 'Composites' },
  { query: 'Septodont', expectedMfg: 'Septodont', category: 'Anesthesie' },
  // Equipement
  { query: 'Planmeca', expectedMfg: 'Planmeca', category: 'Equipement' },
  { query: 'KaVo dental', expectedMfg: 'KaVo', category: 'Equipement' },
  { query: 'Castellini dental', expectedMfg: 'Castellini', category: 'Equipement' },
  { query: 'Durr Dental', expectedMfg: 'Durr', category: 'Equipement' },
  { query: 'Melag sterilization', expectedMfg: 'MELAG', category: 'Sterilisation' },
  // CFAO
  { query: '3Shape dental', expectedMfg: '3Shape', category: 'CFAO' },
  { query: 'Medit dental', expectedMfg: 'Medit', category: 'CFAO' },
  { query: 'Amann Girrbach', expectedMfg: 'Amann Girrbach', category: 'CFAO' },
  // Radiologie
  { query: 'Vatech dental', expectedMfg: 'Vatech', category: 'Radiologie' },
  { query: 'Owandy radiology', expectedMfg: 'Owandy', category: 'Radiologie' },
  { query: 'Carestream dental', expectedMfg: 'Carestream', category: 'Radiologie' },
  // Orthodontie
  { query: 'Forestadent', expectedMfg: 'Forestadent', category: 'Orthodontie' },
  { query: 'Leone orthodontic', expectedMfg: 'Leone', category: 'Orthodontie' },
];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function searchEudamed(query, skip, size) {
  const url = `${SEARCH_API}?q=${encodeURIComponent(query)}&type=device&size=${size}&skip=${skip}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'JADOMI-Medical-Device-Indexer/1.0' },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    log(`  Fetch error: ${e.message}`);
    return null;
  }
}

function mapToProduct(result, defaultCategory) {
  const gtin = result.primary_di_code || null;
  const name = result.device_name_text || result.trade_name_text || null;
  const manufacturer = result.manufacturer_name || null;
  const mfgSrn = result.manufacturer_srn || null;
  const ref = result.reference || null;

  if (!gtin && !name) return null;
  // Skip si GTIN > 14 chars
  if (gtin && gtin.length > 14) return null;

  // Extraire la categorie CND (nomenclature europeenne)
  let cndCategory = defaultCategory;
  const cndRaw = result.cndNomenclatures || '';
  if (/Q01/i.test(cndRaw)) cndCategory = 'Endodontie';
  else if (/Q02/i.test(cndRaw)) cndCategory = 'Prothese';
  else if (/Q03/i.test(cndRaw)) cndCategory = 'Orthodontie';
  else if (/Q04/i.test(cndRaw)) cndCategory = 'Parodontie';
  else if (/Q05/i.test(cndRaw)) cndCategory = 'Chirurgie';
  else if (/Q06/i.test(cndRaw)) cndCategory = 'Implants';

  return {
    gtin: gtin || `EU-${(mfgSrn || 'UNK').replace(/[^A-Z0-9]/gi, '').substring(0, 8)}-${ref || Date.now()}`.substring(0, 14),
    name: name || ref || 'Unknown',
    name_fr: name,
    brand: (result.trade_name_text || '').split(/\s*[,/]\s*/)[0] || null,
    manufacturer,
    category: cndCategory,
    reference: ref,
    market_region: 'EU',
    source: 'eudamed',
    source_metadata: {
      eudamed_uuid: result.eudamed_uuid || null,
      manufacturer_srn: mfgSrn,
      risk_class: (result.riskClass_code || '').replace('refdata.risk-class.', ''),
      cnd_code: (result.cndNomenclatures || '').match(/Q\d+/)?.[0] || null,
      legislation: (result.legislation_code || '').replace('refdata.applicable-legislation.', '')
    },
    confidence_score: 0.8,
    last_synced_at: new Date().toISOString()
  };
}

async function main() {
  log('╔══════════════════════════════════════════════╗');
  log('║  JADOMI — Import EUDAMED v2                 ║');
  log(`║  Via search.eudamed.com (CA MARCHE !)       ║`);
  log(`║  ${DENTAL_SEARCHES.length} recherches | Limit: ${LIMIT}         ║`);
  log('╚══════════════════════════════════════════════╝');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    log('ERREUR: SUPABASE_URL et SUPABASE_SERVICE_KEY requis');
    process.exit(1);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  let totalFound = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  const mfgStats = {};

  for (const search of DENTAL_SEARCHES) {
    log(`\n--- ${search.query} (${search.category}) ---`);

    let skip = 0;
    const pageSize = 100;
    let pageProducts = [];

    while (skip < 2000) { // max 2000 produits par recherche
      const data = await searchEudamed(search.query, skip, pageSize);
      if (!data || !data.results?.length) break;

      for (const result of data.results) {
        // Filtrer par fabricant attendu
        const mfgName = (result.manufacturer_name || '').toLowerCase();
        if (!mfgName.includes(search.expectedMfg.toLowerCase())) continue;

        const product = mapToProduct(result, search.category);
        if (!product) continue;

        pageProducts.push(product);
        mfgStats[product.manufacturer] = (mfgStats[product.manufacturer] || 0) + 1;
      }

      if (data.results.length < pageSize) break;
      skip += pageSize;
      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    // Dedup par GTIN dans ce batch
    const uniqueGtins = new Set();
    const uniqueProducts = pageProducts.filter(p => {
      if (uniqueGtins.has(p.gtin)) return false;
      uniqueGtins.add(p.gtin);
      return true;
    });

    totalFound += uniqueProducts.length;
    log(`  ${uniqueProducts.length} produits uniques trouves`);

    // Insert Supabase
    if (uniqueProducts.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < uniqueProducts.length; i += batchSize) {
        const batch = uniqueProducts.slice(i, i + batchSize);
        try {
          const { error } = await supabase.from('products_database')
            .upsert(batch, { onConflict: 'gtin', ignoreDuplicates: true });
          if (error) {
            for (const p of batch) {
              try {
                await supabase.from('products_database').upsert(p, { onConflict: 'gtin', ignoreDuplicates: true });
                totalInserted++;
              } catch (e) { totalSkipped++; }
            }
          } else {
            totalInserted += batch.length;
          }
        } catch (e) { totalSkipped += batch.length; }
      }
      log(`  → ${uniqueProducts.length} inseres`);
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
    if (totalFound >= LIMIT) { log(`Limit ${LIMIT} atteinte`); break; }
  }

  log(`\n${'='.repeat(50)}`);
  log(`EUDAMED v2 TERMINE`);
  log(`  Total trouves: ${totalFound}`);
  log(`  Inseres: ${totalInserted}`);
  log(`  Skips/doublons: ${totalSkipped}`);
  log(`\nFabricants:`);
  Object.entries(mfgStats).sort((a, b) => b[1] - a[1]).forEach(([m, c]) => log(`  ${m}: ${c}`));
  log('='.repeat(50));
}

main().catch(e => { log('ERREUR: ' + e.message); process.exit(1); });
