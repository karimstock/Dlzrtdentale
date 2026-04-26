#!/usr/bin/env node
// =============================================
// JADOMI — Import EUDAMED extra (fabricants supplementaires)
// Passe 51 — Biotech, Osstem, Bego, Dentsply, 3M, etc.
//
// Usage : node scripts/import-eudamed-extra.js
// A lancer APRES import-eudamed-v2.js
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const LOG_FILE = '/tmp/passe-51-eudamed-extra.log';
const SEARCH_API = 'https://search.eudamed.com/api/search';
const DELAY_MS = 1500;

const EXTRA_SEARCHES = [
  // Implants supplementaires
  { query: 'Biotech dental implant', expectedMfg: 'Biotech', category: 'Implants' },
  { query: 'Osstem implant', expectedMfg: 'Osstem', category: 'Implants' },
  { query: 'Bego implant', expectedMfg: 'BEGO', category: 'Implants' },
  { query: 'BioHorizons implant', expectedMfg: 'BioHorizons', category: 'Implants' },
  { query: 'MIS implant', expectedMfg: 'MIS', category: 'Implants' },
  { query: 'Megagen implant', expectedMfg: 'MegaGen', category: 'Implants' },
  { query: 'Dentium implant', expectedMfg: 'Dentium', category: 'Implants' },
  { query: 'Neodent implant', expectedMfg: 'Neodent', category: 'Implants' },
  { query: 'BTI implant', expectedMfg: 'BTI', category: 'Implants' },
  { query: 'Zimmer dental', expectedMfg: 'Zimmer', category: 'Implants' },
  { query: 'Nobel Biocare', expectedMfg: 'Nobel', category: 'Implants' },
  { query: 'Straumann dental', expectedMfg: 'Straumann', category: 'Implants' },

  // Dentsply Sirona (global mais fort en EU)
  { query: 'Dentsply Sirona', expectedMfg: 'Dentsply', category: 'Instruments' },
  { query: 'Dentsply Maillefer', expectedMfg: 'Dentsply', category: 'Endodontie' },

  // 3M Oral Care
  { query: '3M oral care', expectedMfg: '3M', category: 'Composites' },
  { query: '3M ESPE', expectedMfg: '3M', category: 'Composites' },

  // Kerr
  { query: 'Kerr dental', expectedMfg: 'Kerr', category: 'Composites' },

  // Ultradent
  { query: 'Ultradent Products', expectedMfg: 'Ultradent', category: 'Composites' },

  // Hu-Friedy (instruments)
  { query: 'Hu-Friedy dental', expectedMfg: 'Hu-Friedy', category: 'Instruments' },

  // Prothese supplementaire
  { query: 'Renfert dental', expectedMfg: 'Renfert', category: 'Prothese' },
  { query: 'Zubler dental', expectedMfg: 'Zubler', category: 'Prothese' },
  { query: 'Yeti dental', expectedMfg: 'Yeti', category: 'Prothese' },
  { query: 'Dental Direkt', expectedMfg: 'Dental Direkt', category: 'Prothese' },
  { query: 'Pritidenta', expectedMfg: 'Pritidenta', category: 'Prothese' },

  // CFAO supplementaire
  { query: 'VHF dental milling', expectedMfg: 'VHF', category: 'CFAO' },
  { query: 'imes-icore dental', expectedMfg: 'imes-icore', category: 'CFAO' },
  { query: 'Formlabs dental', expectedMfg: 'Formlabs', category: 'CFAO' },
  { query: 'SprintRay dental', expectedMfg: 'SprintRay', category: 'CFAO' },
  { query: 'Asiga dental', expectedMfg: 'Asiga', category: 'CFAO' },
  { query: 'NextDent dental', expectedMfg: 'NextDent', category: 'CFAO' },

  // Sterilisation supplementaire
  { query: 'SciCan dental', expectedMfg: 'SciCan', category: 'Sterilisation' },
  { query: 'Tuttnauer dental', expectedMfg: 'Tuttnauer', category: 'Sterilisation' },
  { query: 'Mocom dental', expectedMfg: 'Mocom', category: 'Sterilisation' },

  // Anesthesie
  { query: 'Septodont anesthesia', expectedMfg: 'Septodont', category: 'Anesthesie' },

  // Radiologie
  { query: 'MyRay dental', expectedMfg: 'MyRay', category: 'Radiologie' },
  { query: 'Cefla dental', expectedMfg: 'Cefla', category: 'Radiologie' },
  { query: 'Dentsply Sirona imaging', expectedMfg: 'Dentsply', category: 'Radiologie' },

  // Orthodontie supplementaire
  { query: 'Ormco orthodontic', expectedMfg: 'Ormco', category: 'Orthodontie' },
  { query: 'American Orthodontics', expectedMfg: 'American Orthodontics', category: 'Orthodontie' },
  { query: 'Align Technology', expectedMfg: 'Align', category: 'Orthodontie' },
  { query: 'RMO orthodontic', expectedMfg: 'RMO', category: 'Orthodontie' },

  // Hygiene / prophylaxie
  { query: 'Pierre Fabre oral', expectedMfg: 'Pierre Fabre', category: 'Hygiene' },
  { query: 'Oral-B dental', expectedMfg: 'Oral-B', category: 'Hygiene' },

  // Equipement supplementaire
  { query: 'Cattani dental', expectedMfg: 'Cattani', category: 'Equipement' },
  { query: 'Stern Weber dental', expectedMfg: 'Stern Weber', category: 'Equipement' },
  { query: 'Anthos dental', expectedMfg: 'Anthos', category: 'Equipement' },

  // Materiaux specifiques
  { query: 'Tokuyama dental', expectedMfg: 'Tokuyama', category: 'Composites' },
  { query: 'Shofu dental', expectedMfg: 'Shofu', category: 'Composites' },
  { query: 'Kuraray dental', expectedMfg: 'Kuraray', category: 'Composites' },
  { query: 'SDI dental', expectedMfg: 'SDI', category: 'Composites' },
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
    const res = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}

function mapToProduct(result, defaultCategory) {
  const gtin = result.primary_di_code || null;
  const name = result.device_name_text || result.trade_name_text || null;
  const manufacturer = result.manufacturer_name || null;
  const mfgSrn = result.manufacturer_srn || null;
  const ref = result.reference || null;
  if (!gtin && !name) return null;
  if (gtin && gtin.length > 14) return null;

  return {
    gtin: gtin || `EU-${(mfgSrn || 'X').replace(/[^A-Z0-9]/gi, '').substring(0, 8)}-${ref || Date.now()}`.substring(0, 14),
    name: name || ref || 'Unknown',
    name_fr: name,
    brand: (result.trade_name_text || '').split(/\s*[,/]\s*/)[0] || null,
    manufacturer,
    category: defaultCategory,
    reference: ref,
    market_region: 'EU',
    source: 'eudamed',
    source_metadata: { eudamed_uuid: result.eudamed_uuid || null, manufacturer_srn: mfgSrn },
    confidence_score: 0.8,
    last_synced_at: new Date().toISOString()
  };
}

async function main() {
  log('╔══════════════════════════════════════════════╗');
  log('║  JADOMI — EUDAMED Extra (50+ fabricants)    ║');
  log('╚══════════════════════════════════════════════╝');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  let totalFound = 0, totalInserted = 0;

  for (const search of EXTRA_SEARCHES) {
    log(`--- ${search.query} (${search.category}) ---`);
    let skip = 0;
    const pageProducts = [];

    while (skip < 2000) {
      const data = await searchEudamed(search.query, skip, 100);
      if (!data || !data.results?.length) break;

      for (const r of data.results) {
        const mfg = (r.manufacturer_name || '').toLowerCase();
        if (!mfg.includes(search.expectedMfg.toLowerCase())) continue;
        const p = mapToProduct(r, search.category);
        if (p) pageProducts.push(p);
      }

      if (data.results.length < 100) break;
      skip += 100;
      await new Promise(r => setTimeout(r, 500));
    }

    // Dedup
    const seen = new Set();
    const unique = pageProducts.filter(p => { if (seen.has(p.gtin)) return false; seen.add(p.gtin); return true; });
    totalFound += unique.length;

    if (unique.length > 0) {
      for (let i = 0; i < unique.length; i += 50) {
        const batch = unique.slice(i, i + 50);
        try {
          await supabase.from('products_database').upsert(batch, { onConflict: 'gtin', ignoreDuplicates: true });
          totalInserted += batch.length;
        } catch (e) {
          for (const p of batch) {
            try { await supabase.from('products_database').upsert(p, { onConflict: 'gtin', ignoreDuplicates: true }); totalInserted++; } catch(e2){}
          }
        }
      }
      log(`  → ${unique.length} inseres`);
    } else { log(`  0 resultats`); }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  log(`\n${'='.repeat(50)}`);
  log(`EUDAMED EXTRA TERMINE: ${totalFound} trouves, ${totalInserted} inseres`);
  log('='.repeat(50));
}

main().catch(e => { log('ERREUR: ' + e.message); process.exit(1); });
