#!/usr/bin/env node
// =============================================
// JADOMI — Seed produits dentaires europeens courants
// Passe 51 — Les produits que GUDID n'a pas
//
// Usage : node scripts/seed-eu-dental-products.js
//
// Produits europeens les plus utilises en cabinet dentaire FR
// qui ne sont PAS dans la FDA GUDID (marques EU-only)
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const LOG_FILE = '/tmp/passe-51-seed-eu.log';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// Produits europeens courants classes par specialite
const EU_PRODUCTS = [
  // ═══ ENDODONTIE (VDW, Micro-Mega, FKG, Produits Dentaires) ═══
  { gtin: 'VDW-MTWO-2504', name: 'Mtwo NiTi Rotary Files 25/.04', name_fr: 'Limes rotatives Mtwo NiTi 25/.04', brand: 'Mtwo', manufacturer: 'VDW GmbH (Dentsply Sirona)', category: 'Endodontie', subcategory: 'Limes endodontiques', sterile: true, single_use: true },
  { gtin: 'VDW-MTWO-2506', name: 'Mtwo NiTi Rotary Files 25/.06', name_fr: 'Limes rotatives Mtwo NiTi 25/.06', brand: 'Mtwo', manufacturer: 'VDW GmbH', category: 'Endodontie', subcategory: 'Limes endodontiques', sterile: true, single_use: true },
  { gtin: 'VDW-MTWO-3004', name: 'Mtwo NiTi Rotary Files 30/.04', name_fr: 'Limes rotatives Mtwo NiTi 30/.04', brand: 'Mtwo', manufacturer: 'VDW GmbH', category: 'Endodontie', subcategory: 'Limes endodontiques', sterile: true, single_use: true },
  { gtin: 'VDW-MTWO-2004', name: 'Mtwo NiTi Rotary Files 20/.04', name_fr: 'Limes rotatives Mtwo NiTi 20/.04', brand: 'Mtwo', manufacturer: 'VDW GmbH', category: 'Endodontie', subcategory: 'Limes endodontiques', sterile: true, single_use: true },
  { gtin: 'VDW-MTWO-1504', name: 'Mtwo NiTi Rotary Files 15/.04', name_fr: 'Limes rotatives Mtwo NiTi 15/.04', brand: 'Mtwo', manufacturer: 'VDW GmbH', category: 'Endodontie', subcategory: 'Limes endodontiques', sterile: true, single_use: true },
  { gtin: 'VDW-MTWO-KIT', name: 'Mtwo Starter Kit', name_fr: 'Kit de demarrage Mtwo', brand: 'Mtwo', manufacturer: 'VDW GmbH', category: 'Endodontie', subcategory: 'Limes endodontiques', sterile: true, single_use: true },
  { gtin: 'PD-IRRIFLEX-30G', name: 'IrriFlex Irrigation Needle 30G', name_fr: 'Aiguille irrigation IrriFlex 30G', brand: 'IrriFlex', manufacturer: 'Produits Dentaires SA', category: 'Endodontie', subcategory: 'Irrigation', sterile: true, single_use: true },
  { gtin: 'PD-IRRIFLEX-27G', name: 'IrriFlex Irrigation Needle 27G', name_fr: 'Aiguille irrigation IrriFlex 27G', brand: 'IrriFlex', manufacturer: 'Produits Dentaires SA', category: 'Endodontie', subcategory: 'Irrigation', sterile: true, single_use: true },
  { gtin: 'MM-ONESHAPE-2506', name: 'One Shape 25/.06', name_fr: 'Lime One Shape 25/.06', brand: 'One Shape', manufacturer: 'Micro-Mega', category: 'Endodontie', subcategory: 'Limes endodontiques', sterile: true, single_use: true },
  { gtin: 'MM-2SHAPE-2504', name: '2Shape TS1 25/.04', name_fr: 'Lime 2Shape TS1 25/.04', brand: '2Shape', manufacturer: 'Micro-Mega', category: 'Endodontie', subcategory: 'Limes endodontiques', sterile: true, single_use: true },
  { gtin: 'FKG-XP3D-2501', name: 'XP-endo Shaper 3D', name_fr: 'Lime XP-endo Shaper 3D', brand: 'XP-endo', manufacturer: 'FKG Dentaire SA', category: 'Endodontie', subcategory: 'Limes endodontiques', sterile: true, single_use: true },
  { gtin: 'FKG-RACE-2504', name: 'Race NiTi 25/.04', name_fr: 'Lime Race NiTi 25/.04', brand: 'Race', manufacturer: 'FKG Dentaire SA', category: 'Endodontie', subcategory: 'Limes endodontiques', sterile: true, single_use: true },

  // ═══ COMPOSITES / VERRE IONOMERE ═══
  { gtin: 'GC-EQFORTE-A2', name: 'EQUIA Forte HT Fil A2', name_fr: 'EQUIA Forte HT capsules A2', brand: 'EQUIA Forte', manufacturer: 'GC Europe', category: 'Composites', subcategory: 'Verre ionomere', sterile: false, single_use: true },
  { gtin: 'GC-EQFORTE-A3', name: 'EQUIA Forte HT Fil A3', name_fr: 'EQUIA Forte HT capsules A3', brand: 'EQUIA Forte', manufacturer: 'GC Europe', category: 'Composites', subcategory: 'Verre ionomere', sterile: false, single_use: true },
  { gtin: 'GC-EQCOAT', name: 'EQUIA Forte Coat', name_fr: 'EQUIA Forte Coat (vernis)', brand: 'EQUIA Forte', manufacturer: 'GC Europe', category: 'Composites', subcategory: 'Verre ionomere', sterile: false, single_use: false },
  { gtin: 'GC-GRADIA-A2', name: 'Gradia Direct Posterior A2', name_fr: 'Gradia Direct Posterieur A2', brand: 'Gradia', manufacturer: 'GC Europe', category: 'Composites', subcategory: 'Composite posterieur', sterile: false, single_use: false },
  { gtin: 'GC-GAENOCOAT', name: 'G-aenial Universal Injectable A2', name_fr: 'G-aenial Universal Injectable A2', brand: 'G-aenial', manufacturer: 'GC Europe', category: 'Composites', subcategory: 'Composite flow', sterile: false, single_use: false },

  // ═══ IMPLANTS EU ═══
  { gtin: 'ANTH-AXIOM-3510', name: 'Axiom REG 3.5x10mm', name_fr: 'Implant Axiom REG 3.5x10mm', brand: 'Axiom', manufacturer: 'Anthogyr', category: 'Implants', subcategory: 'Implants endo-osseux', sterile: true, single_use: true },
  { gtin: 'ANTH-AXIOM-4010', name: 'Axiom REG 4.0x10mm', name_fr: 'Implant Axiom REG 4.0x10mm', brand: 'Axiom', manufacturer: 'Anthogyr', category: 'Implants', subcategory: 'Implants endo-osseux', sterile: true, single_use: true },
  { gtin: 'GLOBD-IN-KONE-410', name: 'In-Kone Universal 4.0x10mm', name_fr: 'Implant In-Kone 4.0x10mm', brand: 'In-Kone', manufacturer: 'Global D', category: 'Implants', subcategory: 'Implants endo-osseux', sterile: true, single_use: true },
  { gtin: 'TBR-Z1-410', name: 'Z1 Implant 4.0x10mm', name_fr: 'Implant Z1 zircone 4.0x10mm', brand: 'Z1', manufacturer: 'TBR Implants Group', category: 'Implants', subcategory: 'Implants endo-osseux', sterile: true, single_use: true },

  // ═══ PROTHESE / LABO EU ═══
  { gtin: 'ZZ-PRETTAU-98H14', name: 'Prettau Anterior 98mm H14', name_fr: 'Disque Prettau Anterior 98mm H14', brand: 'Prettau', manufacturer: 'Zirkonzahn', category: 'Prothese', subcategory: 'Zircone', sterile: false, single_use: false },
  { gtin: 'ZZ-PRETTAU-98H20', name: 'Prettau Anterior 98mm H20', name_fr: 'Disque Prettau Anterior 98mm H20', brand: 'Prettau', manufacturer: 'Zirkonzahn', category: 'Prothese', subcategory: 'Zircone', sterile: false, single_use: false },
  { gtin: 'AG-ZOLID-FX-ML', name: 'Zolid FX Multilayer 98mm', name_fr: 'Disque Zolid FX Multilayer 98mm', brand: 'Zolid', manufacturer: 'Amann Girrbach', category: 'Prothese', subcategory: 'Zircone', sterile: false, single_use: false },
  { gtin: 'VITA-YZ-ST-A2', name: 'VITA YZ ST Color A2', name_fr: 'Disque VITA YZ ST Color A2', brand: 'VITA YZ', manufacturer: 'VITA Zahnfabrik', category: 'Prothese', subcategory: 'Zircone', sterile: false, single_use: false },
  { gtin: 'IVOCLAR-EMAX-HT-A2', name: 'IPS e.max CAD HT A2 C14', name_fr: 'Bloc IPS e.max CAD HT A2 C14', brand: 'e.max', manufacturer: 'Ivoclar Vivadent', category: 'Prothese', subcategory: 'Ceramique', sterile: false, single_use: false },
  { gtin: 'IVOCLAR-EMAX-LT-A2', name: 'IPS e.max CAD LT A2 C14', name_fr: 'Bloc IPS e.max CAD LT A2 C14', brand: 'e.max', manufacturer: 'Ivoclar Vivadent', category: 'Prothese', subcategory: 'Ceramique', sterile: false, single_use: false },

  // ═══ EMPREINTES EU ═══
  { gtin: 'ZHER-ELITE-HD', name: 'Elite HD+ Regular Body', name_fr: 'Silicone Elite HD+ Regular Body', brand: 'Elite HD+', manufacturer: 'Zhermack', category: 'Empreintes', subcategory: 'Silicone addition', sterile: false, single_use: true },
  { gtin: 'ZHER-ALGINOT', name: 'Alginot Perfect Paste', name_fr: 'Alginot Perfect Paste (alginate)', brand: 'Alginot', manufacturer: 'Zhermack', category: 'Empreintes', subcategory: 'Alginate', sterile: false, single_use: true },
  { gtin: 'KETT-IDENTIUM', name: 'Identium Medium', name_fr: 'Silicone Identium Medium (vinylsiloxanether)', brand: 'Identium', manufacturer: 'Kettenbach', category: 'Empreintes', subcategory: 'Silicone addition', sterile: false, single_use: true },

  // ═══ INSTRUMENTS EU ═══
  { gtin: 'BIENAIR-TORNADO-S', name: 'Tornado S Turbine', name_fr: 'Turbine Tornado S', brand: 'Tornado', manufacturer: 'Bien-Air Dental', category: 'Instruments', subcategory: 'Turbines et contre-angles', sterile: false, single_use: false },
  { gtin: 'WH-ALEGRA-TE95', name: 'Alegra TE-95 RM Turbine', name_fr: 'Turbine Alegra TE-95 RM', brand: 'Alegra', manufacturer: 'W&H', category: 'Instruments', subcategory: 'Turbines et contre-angles', sterile: false, single_use: false },
  { gtin: 'ACTEON-PIEZOTOME-S', name: 'Piezotome Solo LED', name_fr: 'Piezotome Solo LED', brand: 'Piezotome', manufacturer: 'Acteon Group', category: 'Instruments', subcategory: 'Instruments chirurgicaux', sterile: false, single_use: false },
  { gtin: 'EMS-AIRFLOW-PROP', name: 'AIRFLOW Prophylaxis Master', name_fr: 'AIRFLOW Prophylaxis Master', brand: 'AIRFLOW', manufacturer: 'EMS', category: 'Instruments', subcategory: 'Detartreurs', sterile: false, single_use: false },
  { gtin: 'MECTRON-PIEZOSURG', name: 'Piezosurgery Touch', name_fr: 'Piezosurgery Touch', brand: 'Piezosurgery', manufacturer: 'Mectron', category: 'Instruments', subcategory: 'Instruments chirurgicaux', sterile: false, single_use: false },

  // ═══ ANESTHESIE EU ═══
  { gtin: 'SEPT-ARTI-172', name: 'Septanest 1/200.000 articaine 4%', name_fr: 'Septanest articaine 4% adrenaline 1/200.000', brand: 'Septanest', manufacturer: 'Septodont', category: 'Anesthesie', subcategory: 'Carpules', sterile: true, single_use: true },
  { gtin: 'SEPT-ARTI-100', name: 'Septanest SP 1/100.000 articaine 4%', name_fr: 'Septanest SP articaine 4% adrenaline 1/100.000', brand: 'Septanest', manufacturer: 'Septodont', category: 'Anesthesie', subcategory: 'Carpules', sterile: true, single_use: true },
  { gtin: 'SEPT-SCANDONEST', name: 'Scandonest 3% mepivacaine', name_fr: 'Scandonest mepivacaine 3% sans vasoconstricteur', brand: 'Scandonest', manufacturer: 'Septodont', category: 'Anesthesie', subcategory: 'Carpules', sterile: true, single_use: true },

  // ═══ RADIOLOGIE EU ═══
  { gtin: 'OWANDY-OPTEO', name: 'Opteo Intraoral Sensor', name_fr: 'Capteur intraoral Opteo', brand: 'Opteo', manufacturer: 'Owandy Radiology', category: 'Radiologie', subcategory: 'Capteurs numeriques', sterile: false, single_use: false },
  { gtin: 'VATECH-EZRAY', name: 'EzRay Air Portable', name_fr: 'Generateur portable EzRay Air', brand: 'EzRay', manufacturer: 'Vatech', category: 'Radiologie', subcategory: 'Capteurs numeriques', sterile: false, single_use: false },

  // ═══ CFAO EU ═══
  { gtin: '3SHAPE-TRIOS4', name: 'TRIOS 4 Wireless Scanner', name_fr: 'Scanner intraoral TRIOS 4 sans fil', brand: 'TRIOS', manufacturer: '3Shape', category: 'CFAO', subcategory: 'Scanners intra-oraux', sterile: false, single_use: false },
  { gtin: 'MEDIT-I700', name: 'Medit i700 Wireless Scanner', name_fr: 'Scanner intraoral Medit i700 sans fil', brand: 'Medit i700', manufacturer: 'Medit Corp', category: 'CFAO', subcategory: 'Scanners intra-oraux', sterile: false, single_use: false },

  // ═══ STERILISATION EU ═══
  { gtin: 'MELAG-PREMIUM44', name: 'MELAtherm 44 Washer Disinfector', name_fr: 'Thermodesinfecteur MELAtherm 44', brand: 'MELAtherm', manufacturer: 'MELAG', category: 'Sterilisation', subcategory: 'Nettoyage instruments', sterile: false, single_use: false },
  { gtin: 'MELAG-VACUKLAV44', name: 'Vacuklav 44B+ Autoclave', name_fr: 'Autoclave Vacuklav 44B+', brand: 'Vacuklav', manufacturer: 'MELAG', category: 'Sterilisation', subcategory: 'Autoclaves', sterile: false, single_use: false },

  // ═══ ORTHODONTIE EU ═══
  { gtin: 'FOREST-SPRINT-022', name: 'Sprint II Bracket 0.022 MBT', name_fr: 'Bracket Sprint II 0.022 MBT', brand: 'Sprint', manufacturer: 'Forestadent', category: 'Orthodontie', subcategory: 'Brackets', sterile: false, single_use: false },
  { gtin: 'LEONE-ARC-NITI-014', name: 'NiTi Archwire 0.014 upper', name_fr: 'Arc NiTi 0.014 maxillaire', brand: 'Leone', manufacturer: 'Leone S.p.A.', category: 'Orthodontie', subcategory: 'Arcs orthodontiques', sterile: false, single_use: false },
];

async function main() {
  log('╔══════════════════════════════════════════════╗');
  log('║  JADOMI — Seed produits EU courants         ║');
  log(`║  ${EU_PRODUCTS.length} produits a inserer              ║`);
  log('╚══════════════════════════════════════════════╝');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    log('ERREUR: SUPABASE_URL et SUPABASE_SERVICE_KEY requis');
    process.exit(1);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const products = EU_PRODUCTS.map(p => ({
    ...p,
    source: 'seed_eu',
    confidence_score: 0.95,
    market_region: 'EU',
    metadata: {
      keywords_fr: [p.brand, p.manufacturer, p.category, p.subcategory].filter(Boolean),
      seeded_at: new Date().toISOString()
    },
    last_synced_at: new Date().toISOString()
  }));

  let inserted = 0;
  for (const p of products) {
    try {
      const { error } = await supabase.from('products_database')
        .upsert(p, { onConflict: 'gtin', ignoreDuplicates: false });
      if (!error) { inserted++; log(`  + ${p.name_fr} (${p.brand})`); }
      else log(`  ! ${p.name_fr}: ${error.message}`);
    } catch (e) { log(`  ! ${p.name_fr}: ${e.message}`); }
  }

  // Stats
  const catStats = {};
  EU_PRODUCTS.forEach(p => { catStats[p.category] = (catStats[p.category] || 0) + 1; });

  log(`\n${'='.repeat(50)}`);
  log(`SEED EU TERMINE : ${inserted}/${EU_PRODUCTS.length} inseres`);
  log('Par categorie :');
  Object.entries(catStats).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => log(`  ${c}: ${n}`));
  log('='.repeat(50));
}

main().catch(e => { log('ERREUR: ' + e.message); process.exit(1); });
