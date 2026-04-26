#!/usr/bin/env node
// =============================================
// JADOMI — EUDAMED COMPLETE — 0 limite, TOUT prendre
// Relance les fabricants qui ont ete tronques
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const LOG_FILE = '/tmp/passe-51-eudamed-complete.log';
const SEARCH_API = 'https://search.eudamed.com/api/search';

// TOUS les fabricants dentaires — sans limite
const ALL_SEARCHES = [
  // Gros catalogues (>2000 produits)
  { query: 'Ivoclar Vivadent', expectedMfg: 'Ivoclar', category: 'Prothese' },
  { query: 'Acteon dental', expectedMfg: 'ACTEON', category: 'Instruments' },
  { query: 'FKG Dentaire', expectedMfg: 'FKG', category: 'Endodontie' },
  { query: 'Anthogyr', expectedMfg: 'anthogyr', category: 'Implants' },
  { query: 'Dentsply Sirona', expectedMfg: 'Dentsply', category: 'Instruments' },
  { query: 'Straumann dental', expectedMfg: 'Straumann', category: 'Implants' },
  { query: 'Nobel Biocare', expectedMfg: 'Nobel', category: 'Implants' },
  { query: 'Zimmer dental', expectedMfg: 'Zimmer', category: 'Implants' },
  { query: '3M oral care', expectedMfg: '3M', category: 'Composites' },
  { query: 'Kerr dental', expectedMfg: 'Kerr', category: 'Composites' },
  { query: 'GC dental europe', expectedMfg: 'GC', category: 'Composites' },
  { query: 'Hu-Friedy dental', expectedMfg: 'Hu-Friedy', category: 'Instruments' },
  { query: 'Bien-Air Dental', expectedMfg: 'Bien-Air', category: 'Instruments' },
  { query: 'W&H dental', expectedMfg: 'W&H', category: 'Instruments' },
  { query: 'NSK dental', expectedMfg: 'NSK', category: 'Instruments' },
  { query: 'Planmeca', expectedMfg: 'Planmeca', category: 'Equipement' },
  { query: 'KaVo dental', expectedMfg: 'KaVo', category: 'Equipement' },
  { query: 'VITA Zahnfabrik', expectedMfg: 'VITA', category: 'Prothese' },
  { query: 'Amann Girrbach', expectedMfg: 'Amann Girrbach', category: 'CFAO' },
  { query: 'Zirkonzahn dental', expectedMfg: 'Zirkonzahn', category: 'Prothese' },
  { query: 'Osstem implant', expectedMfg: 'Osstem', category: 'Implants' },
  { query: 'Megagen implant', expectedMfg: 'MegaGen', category: 'Implants' },
  { query: 'Biotech dental', expectedMfg: 'Biotech', category: 'Implants' },
  { query: 'Bego implant', expectedMfg: 'BEGO', category: 'Implants' },
  { query: 'BioHorizons', expectedMfg: 'BioHorizons', category: 'Implants' },
  { query: 'MIS implant', expectedMfg: 'MIS', category: 'Implants' },
  { query: 'Dentium implant', expectedMfg: 'Dentium', category: 'Implants' },
  { query: 'Euroteknika', expectedMfg: 'Euroteknika', category: 'Implants' },
  { query: 'Septodont', expectedMfg: 'Septodont', category: 'Anesthesie' },
  { query: 'Ultradent Products', expectedMfg: 'Ultradent', category: 'Composites' },
  { query: 'VOCO dental', expectedMfg: 'VOCO', category: 'Composites' },
  { query: 'DMG dental', expectedMfg: 'DMG', category: 'Composites' },
  { query: 'Kulzer dental', expectedMfg: 'Kulzer', category: 'Composites' },
  { query: 'Coltene dental', expectedMfg: 'Coltene', category: 'Composites' },
  { query: 'SDI dental', expectedMfg: 'SDI', category: 'Composites' },
  { query: 'Tokuyama dental', expectedMfg: 'Tokuyama', category: 'Composites' },
  { query: 'Shofu dental', expectedMfg: 'Shofu', category: 'Composites' },
  { query: 'Kuraray dental', expectedMfg: 'Kuraray', category: 'Composites' },
  { query: 'Zhermack dental', expectedMfg: 'Zhermack', category: 'Empreintes' },
  { query: 'Kettenbach dental', expectedMfg: 'Kettenbach', category: 'Empreintes' },
  { query: 'Micro-Mega', expectedMfg: 'Micro-Mega', category: 'Endodontie' },
  { query: 'Produits Dentaires SA', expectedMfg: 'Produits Dentaires', category: 'Endodontie' },
  { query: 'Mectron dental', expectedMfg: 'Mectron', category: 'Instruments' },
  { query: 'EMS dental scaler', expectedMfg: 'EMS', category: 'Instruments' },
  { query: 'Durr Dental', expectedMfg: 'Durr', category: 'Equipement' },
  { query: 'Castellini dental', expectedMfg: 'Castellini', category: 'Equipement' },
  { query: 'Melag sterilization', expectedMfg: 'MELAG', category: 'Sterilisation' },
  { query: 'SciCan dental', expectedMfg: 'SciCan', category: 'Sterilisation' },
  { query: 'Tuttnauer dental', expectedMfg: 'Tuttnauer', category: 'Sterilisation' },
  { query: '3Shape dental', expectedMfg: '3Shape', category: 'CFAO' },
  { query: 'Medit dental scanner', expectedMfg: 'Medit', category: 'CFAO' },
  { query: 'Formlabs dental', expectedMfg: 'Formlabs', category: 'CFAO' },
  { query: 'SprintRay dental', expectedMfg: 'SprintRay', category: 'CFAO' },
  { query: 'Vatech dental', expectedMfg: 'Vatech', category: 'Radiologie' },
  { query: 'Owandy radiology', expectedMfg: 'Owandy', category: 'Radiologie' },
  { query: 'Carestream dental', expectedMfg: 'Carestream', category: 'Radiologie' },
  { query: 'Forestadent orthodontic', expectedMfg: 'Forestadent', category: 'Orthodontie' },
  { query: 'Leone orthodontic', expectedMfg: 'Leone', category: 'Orthodontie' },
  { query: 'Ormco orthodontic', expectedMfg: 'Ormco', category: 'Orthodontie' },
  { query: 'American Orthodontics', expectedMfg: 'American Orthodontics', category: 'Orthodontie' },
  { query: 'Align Technology', expectedMfg: 'Align', category: 'Orthodontie' },
  { query: 'Renfert dental', expectedMfg: 'Renfert', category: 'Prothese' },
  { query: 'Dental Direkt', expectedMfg: 'Dental Direkt', category: 'Prothese' },
  { query: 'Pierre Fabre oral', expectedMfg: 'Pierre Fabre', category: 'Hygiene' },
  { query: 'LM-Instruments dental', expectedMfg: 'LM-Instruments', category: 'Instruments' },
  { query: 'Cattani dental', expectedMfg: 'Cattani', category: 'Equipement' },
];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function searchEudamed(query, skip, size) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(`${SEARCH_API}?q=${encodeURIComponent(query)}&type=device&size=${size}&skip=${skip}`, {
      headers: { 'Accept': 'application/json' }, signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}

async function main() {
  log('╔══════════════════════════════════════════════╗');
  log('║  JADOMI — EUDAMED COMPLETE (TOUT PRENDRE)   ║');
  log(`║  ${ALL_SEARCHES.length} fabricants — SANS LIMITE              ║`);
  log('╚══════════════════════════════════════════════╝');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  let grandTotal = 0, grandInserted = 0;

  for (const search of ALL_SEARCHES) {
    log(`\n--- ${search.query} (${search.category}) ---`);
    let skip = 0, found = 0;

    // SANS LIMITE — on prend TOUT
    while (true) {
      const data = await searchEudamed(search.query, skip, 100);
      if (!data || !data.results?.length) break;

      const matched = data.results.filter(r =>
        (r.manufacturer_name || '').toLowerCase().includes(search.expectedMfg.toLowerCase())
      );

      const products = matched.map(r => {
        const gtin = r.primary_di_code;
        if (!gtin || gtin.length > 14) return null;
        return {
          gtin,
          name: r.device_name_text || r.trade_name_text || r.reference || 'Unknown',
          name_fr: r.device_name_text || r.trade_name_text || null,
          brand: (r.trade_name_text || '').split(/\s*[,/]\s*/)[0] || null,
          manufacturer: r.manufacturer_name,
          category: search.category,
          reference: r.reference || null,
          market_region: 'EU',
          source: 'eudamed',
          source_metadata: { eudamed_uuid: r.eudamed_uuid, manufacturer_srn: r.manufacturer_srn },
          confidence_score: 0.8,
          last_synced_at: new Date().toISOString()
        };
      }).filter(Boolean);

      if (products.length > 0) {
        try {
          await supabase.from('products_database').upsert(products, { onConflict: 'gtin', ignoreDuplicates: true });
          grandInserted += products.length;
        } catch (e) {
          for (const p of products) {
            try { await supabase.from('products_database').upsert(p, { onConflict: 'gtin', ignoreDuplicates: true }); grandInserted++; } catch(e2){}
          }
        }
        found += products.length;
      }

      // Stop si plus de resultats ou si on a depasse le total
      if (data.results.length < 100) break;
      if (skip + 100 > (data.total || 99999)) break;
      skip += 100;
      await new Promise(r => setTimeout(r, 1000));
    }

    grandTotal += found;
    log(`  → ${found} inseres (total cumule: ${grandTotal})`);
    await new Promise(r => setTimeout(r, 1500));
  }

  log(`\n${'='.repeat(50)}`);
  log(`EUDAMED COMPLETE TERMINE`);
  log(`  Total trouves: ${grandTotal}`);
  log(`  Total inseres: ${grandInserted}`);
  log('='.repeat(50));
}

main().catch(e => { log('ERREUR: ' + e.message); process.exit(1); });
