#!/usr/bin/env node
// =============================================
// JADOMI — EUDAMED ALL MANUFACTURERS (200+)
// TOUT prendre, TOUT le dentaire mondial
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const LOG_FILE = '/tmp/passe-51-eudamed-all.log';
const SEARCH_API = 'https://search.eudamed.com/api/search';

// TOUS les fabricants dentaires connus dans le monde
const ALL_MANUFACTURERS = [
  // ═══ IMPLANTS (50+) ═══
  { q: 'Straumann', m: 'Straumann', c: 'Implants' },
  { q: 'Nobel Biocare', m: 'Nobel', c: 'Implants' },
  { q: 'Zimmer Biomet dental', m: 'Zimmer', c: 'Implants' },
  { q: 'Osstem implant', m: 'Osstem', c: 'Implants' },
  { q: 'Biotech dental implant', m: 'Biotech', c: 'Implants' },
  { q: 'Bego implant', m: 'BEGO', c: 'Implants' },
  { q: 'BioHorizons implant', m: 'BioHorizons', c: 'Implants' },
  { q: 'MIS implants', m: 'MIS', c: 'Implants' },
  { q: 'Megagen implant', m: 'MegaGen', c: 'Implants' },
  { q: 'Dentium implant', m: 'Dentium', c: 'Implants' },
  { q: 'Neodent implant', m: 'Neodent', c: 'Implants' },
  { q: 'BTI biotechnology', m: 'BTI', c: 'Implants' },
  { q: 'Anthogyr implant', m: 'anthogyr', c: 'Implants' },
  { q: 'Euroteknika implant', m: 'Euroteknika', c: 'Implants' },
  { q: 'Global D implant', m: 'Global D', c: 'Implants' },
  { q: 'TBR implants', m: 'TBR', c: 'Implants' },
  { q: 'Southern Implants', m: 'Southern', c: 'Implants' },
  { q: 'Neoss implant', m: 'Neoss', c: 'Implants' },
  { q: 'Hiossen implant', m: 'Hiossen', c: 'Implants' },
  { q: 'Implant Direct', m: 'Implant Direct', c: 'Implants' },
  { q: 'IDI implant diffusion', m: 'IDI', c: 'Implants' },
  { q: 'Sweden Martina implant', m: 'Sweden', c: 'Implants' },
  { q: 'Dyna dental implant', m: 'Dyna', c: 'Implants' },
  { q: 'Biomet 3i dental', m: 'Biomet', c: 'Implants' },
  { q: 'Geistlich bone graft', m: 'Geistlich', c: 'Implants' },
  { q: 'Botiss dental', m: 'botiss', c: 'Implants' },
  { q: 'Osteogenics dental', m: 'Osteogenics', c: 'Implants' },

  // ═══ ENDODONTIE (15+) ═══
  { q: 'FKG Dentaire', m: 'FKG', c: 'Endodontie' },
  { q: 'Micro-Mega endodontic', m: 'Micro-Mega', c: 'Endodontie' },
  { q: 'Produits Dentaires SA', m: 'Produits Dentaires', c: 'Endodontie' },
  { q: 'VDW endodontic', m: 'VDW', c: 'Endodontie' },
  { q: 'Dentsply Maillefer', m: 'Maillefer', c: 'Endodontie' },
  { q: 'EdgeEndo endodontic', m: 'EdgeEndo', c: 'Endodontie' },
  { q: 'Brasseler endodontic', m: 'Brasseler', c: 'Endodontie' },
  { q: 'SybronEndo', m: 'SybronEndo', c: 'Endodontie' },
  { q: 'Coltene HyFlex', m: 'Coltene', c: 'Endodontie' },
  { q: 'Komet dental endodontic', m: 'Komet', c: 'Endodontie' },

  // ═══ INSTRUMENTS (25+) ═══
  { q: 'Bien-Air Dental', m: 'Bien-Air', c: 'Instruments' },
  { q: 'W&H dental', m: 'W&H', c: 'Instruments' },
  { q: 'NSK dental', m: 'NSK', c: 'Instruments' },
  { q: 'KaVo dental', m: 'KaVo', c: 'Instruments' },
  { q: 'Acteon dental', m: 'ACTEON', c: 'Instruments' },
  { q: 'EMS dental', m: 'EMS', c: 'Instruments' },
  { q: 'Mectron dental', m: 'Mectron', c: 'Instruments' },
  { q: 'Hu-Friedy dental', m: 'Hu-Friedy', c: 'Instruments' },
  { q: 'LM-Instruments dental', m: 'LM-Instruments', c: 'Instruments' },
  { q: 'American Eagle dental', m: 'American Eagle', c: 'Instruments' },
  { q: 'Komet dental bur', m: 'Komet', c: 'Instruments' },
  { q: 'SS White dental', m: 'SS White', c: 'Instruments' },
  { q: 'Garrison dental', m: 'Garrison', c: 'Instruments' },
  { q: 'Premier dental', m: 'Premier', c: 'Instruments' },
  { q: 'Dentsply Sirona instrument', m: 'Dentsply', c: 'Instruments' },
  { q: 'Stoma dental', m: 'Stoma', c: 'Instruments' },
  { q: 'Carl Martin dental', m: 'Carl Martin', c: 'Instruments' },

  // ═══ COMPOSITES & MATERIAUX (25+) ═══
  { q: 'Ivoclar Vivadent', m: 'Ivoclar', c: 'Composites' },
  { q: '3M oral care ESPE', m: '3M', c: 'Composites' },
  { q: 'Kerr dental', m: 'Kerr', c: 'Composites' },
  { q: 'Dentsply Sirona composite', m: 'Dentsply', c: 'Composites' },
  { q: 'GC dental composite', m: 'GC', c: 'Composites' },
  { q: 'Ultradent Products', m: 'Ultradent', c: 'Composites' },
  { q: 'VOCO dental', m: 'VOCO', c: 'Composites' },
  { q: 'DMG dental', m: 'DMG', c: 'Composites' },
  { q: 'Kulzer dental', m: 'Kulzer', c: 'Composites' },
  { q: 'Coltene dental', m: 'Coltene', c: 'Composites' },
  { q: 'SDI dental', m: 'SDI', c: 'Composites' },
  { q: 'Tokuyama dental', m: 'Tokuyama', c: 'Composites' },
  { q: 'Shofu dental', m: 'Shofu', c: 'Composites' },
  { q: 'Kuraray dental', m: 'Kuraray', c: 'Composites' },
  { q: 'Bisco dental', m: 'Bisco', c: 'Composites' },
  { q: 'Parkell dental', m: 'Parkell', c: 'Composites' },
  { q: 'Bisico dental', m: 'Bisico', c: 'Composites' },

  // ═══ PROTHESE & LABO (20+) ═══
  { q: 'VITA Zahnfabrik', m: 'VITA', c: 'Prothese' },
  { q: 'Zirkonzahn dental', m: 'Zirkonzahn', c: 'Prothese' },
  { q: 'Amann Girrbach dental', m: 'Amann Girrbach', c: 'Prothese' },
  { q: 'Renfert dental', m: 'Renfert', c: 'Prothese' },
  { q: 'Zubler dental', m: 'Zubler', c: 'Prothese' },
  { q: 'Yeti dental', m: 'Yeti', c: 'Prothese' },
  { q: 'Dental Direkt', m: 'Dental Direkt', c: 'Prothese' },
  { q: 'Pritidenta dental', m: 'Pritidenta', c: 'Prothese' },
  { q: 'Wieland dental', m: 'Wieland', c: 'Prothese' },
  { q: 'DeguDent dental', m: 'DeguDent', c: 'Prothese' },
  { q: 'Heraeus dental', m: 'Heraeus', c: 'Prothese' },
  { q: 'Bredent dental', m: 'bredent', c: 'Prothese' },
  { q: 'Merz dental', m: 'Merz', c: 'Prothese' },
  { q: 'Dreve dental', m: 'Dreve', c: 'Prothese' },
  { q: 'Labocast dental', m: 'Labocast', c: 'Prothese' },
  { q: 'Dental Art prosthetic', m: 'Dental Art', c: 'Prothese' },

  // ═══ EMPREINTES (10+) ═══
  { q: 'Zhermack dental', m: 'Zhermack', c: 'Empreintes' },
  { q: 'Kettenbach dental', m: 'Kettenbach', c: 'Empreintes' },
  { q: 'Kulzer impression', m: 'Kulzer', c: 'Empreintes' },
  { q: 'GC Fujirock', m: 'GC', c: 'Empreintes' },
  { q: 'Cavex dental', m: 'Cavex', c: 'Empreintes' },

  // ═══ ANESTHESIE (5+) ═══
  { q: 'Septodont anesthesia', m: 'Septodont', c: 'Anesthesie' },
  { q: 'Pierrel pharma', m: 'Pierrel', c: 'Anesthesie' },
  { q: 'Milestone Scientific', m: 'Milestone', c: 'Anesthesie' },

  // ═══ EQUIPEMENT (15+) ═══
  { q: 'Planmeca dental', m: 'Planmeca', c: 'Equipement' },
  { q: 'Castellini dental', m: 'Castellini', c: 'Equipement' },
  { q: 'Stern Weber dental', m: 'Stern Weber', c: 'Equipement' },
  { q: 'Anthos dental', m: 'Anthos', c: 'Equipement' },
  { q: 'Durr Dental', m: 'Durr', c: 'Equipement' },
  { q: 'Cattani dental', m: 'Cattani', c: 'Equipement' },
  { q: 'Metasys dental', m: 'Metasys', c: 'Equipement' },
  { q: 'A-dec dental', m: 'A-dec', c: 'Equipement' },
  { q: 'Pelton Crane dental', m: 'Pelton', c: 'Equipement' },
  { q: 'Midmark dental', m: 'Midmark', c: 'Equipement' },
  { q: 'Belmont dental', m: 'Belmont', c: 'Equipement' },
  { q: 'Airel dental', m: 'Airel', c: 'Equipement' },

  // ═══ CFAO NUMERIQUE (15+) ═══
  { q: '3Shape dental', m: '3Shape', c: 'CFAO' },
  { q: 'Medit dental scanner', m: 'Medit', c: 'CFAO' },
  { q: 'Formlabs dental', m: 'Formlabs', c: 'CFAO' },
  { q: 'SprintRay dental', m: 'SprintRay', c: 'CFAO' },
  { q: 'Asiga dental', m: 'Asiga', c: 'CFAO' },
  { q: 'NextDent dental', m: 'NextDent', c: 'CFAO' },
  { q: 'VHF dental milling', m: 'VHF', c: 'CFAO' },
  { q: 'imes-icore dental', m: 'imes-icore', c: 'CFAO' },
  { q: 'Roland DG dental', m: 'Roland', c: 'CFAO' },
  { q: 'Dental Wings scanner', m: 'Dental Wings', c: 'CFAO' },
  { q: 'exocad dental software', m: 'exocad', c: 'CFAO' },
  { q: 'Dentsply Sirona CEREC', m: 'Dentsply', c: 'CFAO' },
  { q: 'Straumann CARES', m: 'Straumann', c: 'CFAO' },

  // ═══ RADIOLOGIE (10+) ═══
  { q: 'Vatech dental xray', m: 'Vatech', c: 'Radiologie' },
  { q: 'Owandy radiology', m: 'Owandy', c: 'Radiologie' },
  { q: 'Carestream dental', m: 'Carestream', c: 'Radiologie' },
  { q: 'MyRay dental imaging', m: 'MyRay', c: 'Radiologie' },
  { q: 'Cefla dental', m: 'Cefla', c: 'Radiologie' },
  { q: 'Dentsply Sirona xray', m: 'Dentsply', c: 'Radiologie' },
  { q: 'Planmeca ProMax', m: 'Planmeca', c: 'Radiologie' },
  { q: 'Air Techniques dental', m: 'Air Techniques', c: 'Radiologie' },
  { q: 'Durr VistaScan', m: 'Durr', c: 'Radiologie' },

  // ═══ STERILISATION (10+) ═══
  { q: 'Melag sterilization', m: 'MELAG', c: 'Sterilisation' },
  { q: 'SciCan dental', m: 'SciCan', c: 'Sterilisation' },
  { q: 'Tuttnauer sterilizer', m: 'Tuttnauer', c: 'Sterilisation' },
  { q: 'Mocom sterilization', m: 'Mocom', c: 'Sterilisation' },
  { q: 'W&H Lisa sterilizer', m: 'W&H', c: 'Sterilisation' },
  { q: 'Getinge sterilization', m: 'Getinge', c: 'Sterilisation' },

  // ═══ ORTHODONTIE (15+) ═══
  { q: 'Forestadent orthodontic', m: 'Forestadent', c: 'Orthodontie' },
  { q: 'Leone orthodontic', m: 'Leone', c: 'Orthodontie' },
  { q: 'Ormco orthodontic', m: 'Ormco', c: 'Orthodontie' },
  { q: 'American Orthodontics', m: 'American Orthodontics', c: 'Orthodontie' },
  { q: 'Align Technology invisalign', m: 'Align', c: 'Orthodontie' },
  { q: 'RMO orthodontic', m: 'RMO', c: 'Orthodontie' },
  { q: 'TP Orthodontics', m: 'TP Orthodontics', c: 'Orthodontie' },
  { q: '3M Unitek orthodontic', m: '3M', c: 'Orthodontie' },
  { q: 'Ortho Technology bracket', m: 'Ortho Technology', c: 'Orthodontie' },
  { q: 'DynaFlex orthodontic', m: 'DynaFlex', c: 'Orthodontie' },
  { q: 'ClearCorrect aligner', m: 'ClearCorrect', c: 'Orthodontie' },
  { q: 'Angelalign orthodontic', m: 'Angelalign', c: 'Orthodontie' },
  { q: 'Lightforce orthodontic', m: 'LightForce', c: 'Orthodontie' },

  // ═══ CHIRURGIE (10+) ═══
  { q: 'Stryker dental surgery', m: 'Stryker', c: 'Chirurgie' },
  { q: 'Salvin dental', m: 'Salvin', c: 'Chirurgie' },
  { q: 'Hager Werken dental', m: 'Hager', c: 'Chirurgie' },
  { q: 'Helmut Zepf dental', m: 'Zepf', c: 'Chirurgie' },
  { q: 'Karl Hammacher dental', m: 'Hammacher', c: 'Chirurgie' },

  // ═══ HYGIENE & PREVENTION (5+) ═══
  { q: 'Pierre Fabre oral care', m: 'Pierre Fabre', c: 'Hygiene' },
  { q: 'Colgate professional', m: 'Colgate', c: 'Hygiene' },
  { q: 'Philips Sonicare', m: 'Philips', c: 'Hygiene' },
  { q: 'Oral-B professional', m: 'Oral-B', c: 'Hygiene' },
  { q: 'Curaden Curaprox', m: 'Curaden', c: 'Hygiene' },
  { q: 'TePe dental hygiene', m: 'TePe', c: 'Hygiene' },
];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function searchAndImport(supabase, search) {
  let skip = 0, found = 0;

  while (true) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`${SEARCH_API}?q=${encodeURIComponent(search.q)}&type=device&size=100&skip=${skip}`, {
        headers: { 'Accept': 'application/json' }, signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) break;
      const data = await res.json();
      if (!data.results?.length) break;

      const products = data.results
        .filter(r => (r.manufacturer_name || '').toLowerCase().includes(search.m.toLowerCase()))
        .map(r => {
          const gtin = r.primary_di_code;
          if (!gtin || gtin.length > 14) return null;
          return {
            gtin, name: r.device_name_text || r.trade_name_text || r.reference || 'Unknown',
            name_fr: r.device_name_text || r.trade_name_text || null,
            brand: (r.trade_name_text || '').split(/\s*[,/]\s*/)[0] || null,
            manufacturer: r.manufacturer_name, category: search.c, reference: r.reference || null,
            market_region: 'EU', source: 'eudamed',
            source_metadata: { eudamed_uuid: r.eudamed_uuid, manufacturer_srn: r.manufacturer_srn },
            confidence_score: 0.8, last_synced_at: new Date().toISOString()
          };
        }).filter(Boolean);

      if (products.length > 0) {
        try { await supabase.from('products_database').upsert(products, { onConflict: 'gtin', ignoreDuplicates: true }); }
        catch(e) { for (const p of products) { try { await supabase.from('products_database').upsert(p, { onConflict: 'gtin', ignoreDuplicates: true }); } catch(e2){} } }
        found += products.length;
      }

      if (data.results.length < 100) break;
      skip += 100;
      await new Promise(r => setTimeout(r, 800));
    } catch (e) { break; }
  }
  return found;
}

async function main() {
  log('╔══════════════════════════════════════════════════╗');
  log(`║  JADOMI — EUDAMED ALL (${ALL_MANUFACTURERS.length} fabricants)       ║`);
  log('║  TOUT PRENDRE — SANS LIMITE                     ║');
  log('╚══════════════════════════════════════════════════╝');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  let grandTotal = 0;
  const stats = {};

  for (let i = 0; i < ALL_MANUFACTURERS.length; i++) {
    const s = ALL_MANUFACTURERS[i];
    log(`[${i+1}/${ALL_MANUFACTURERS.length}] ${s.q} (${s.c})`);
    const found = await searchAndImport(supabase, s);
    grandTotal += found;
    if (found > 0) { stats[s.m] = (stats[s.m] || 0) + found; log(`  → ${found} (total: ${grandTotal})`); }
    else log(`  → 0`);
    await new Promise(r => setTimeout(r, 1200));
  }

  log(`\n${'='.repeat(50)}`);
  log(`ALL MANUFACTURERS TERMINE: ${grandTotal} produits`);
  log('Top fabricants:');
  Object.entries(stats).sort((a,b)=>b[1]-a[1]).slice(0,30).forEach(([m,c])=>log(`  ${m}: ${c}`));
  log('='.repeat(50));
}

main().catch(e => { log('ERREUR: ' + e.message); process.exit(1); });
