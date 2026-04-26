#!/usr/bin/env node
// =============================================
// JADOMI — Import EUDAMED (produits dentaires europeens)
// Passe 51 — VDW Mtwo, IrriFlex, Micro-Mega, FKG, etc.
//
// Usage : node scripts/import-eudamed.js [--limit 5000]
//
// Source : API publique EUDAMED (base officielle UE)
// https://ec.europa.eu/tools/eudamed/api/devices/udiDiData
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const LOG_FILE = '/tmp/passe-51-eudamed.log';
const LIMIT = parseInt((process.argv.find(a => a.startsWith('--limit=')) || '--limit=5000').split('=')[1]);
const EUDAMED_API = 'https://ec.europa.eu/tools/eudamed/api/devices/udiDiData';

// Fabricants dentaires europeens a chercher
const DENTAL_MANUFACTURERS = [
  // Endodontie
  'VDW', 'Micro-Mega', 'FKG', 'Produits Dentaires', 'Maillefer',
  // Implants EU
  'Anthogyr', 'Global D', 'TBR', 'Bego', 'Tekka', 'Euroteknika',
  // Prothese EU
  'Zirkonzahn', 'Amann Girrbach', 'Vita Zahnfabrik', 'Ivoclar', 'Zubler', 'Renfert',
  // Instruments EU
  'Bien-Air', 'W&H', 'Acteon', 'Satelec', 'EMS', 'Mectron',
  'LM-Instruments', 'Hu-Friedy', 'Carl Martin',
  // Equipement EU
  'Planmeca', 'KaVo', 'Castellini', 'Stern Weber', 'Anthos',
  'Durr Dental', 'Cattani', 'Melag',
  // Materiaux EU
  'Zhermack', 'Kettenbach', 'DMG', 'VOCO', 'Kulzer', 'Coltene',
  'GC Europe', 'Septodont', 'Pierre Fabre',
  // CFAO EU
  '3Shape', 'Medit', 'Exocad',
  // Radiologie EU
  'Vatech', 'Owandy', 'MyRay', 'Carestream',
  // Orthodontie EU
  'Forestadent', 'Leone', 'RMO', 'Ortholution',
];

// Mots-cles pour filtrer les dispositifs dentaires dans EUDAMED
const DENTAL_KEYWORDS = /dental|tooth|teeth|dent[aiu]|oral\s|periodon|orthodon|endodon|prosthodon|implant.*dent|zircon|ceramic.*dent|composite.*dent/i;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function fetchEudamedPage(page, pageSize) {
  const url = `${EUDAMED_API}?page=${page}&pageSize=${pageSize}&languageIso2Code=en&sort=lastUpdateDate,desc`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) { log(`EUDAMED HTTP ${res.status}`); return null; }
    return await res.json();
  } catch (e) {
    log(`EUDAMED fetch error: ${e.message}`);
    return null;
  }
}

async function searchByManufacturer(manufacturer) {
  // EUDAMED ne supporte pas de filtre texte direct sur le nom fabricant
  // On utilise la recherche generale et on filtre cote client
  const url = `${EUDAMED_API}?page=1&pageSize=25&languageIso2Code=en&freeText=${encodeURIComponent(manufacturer)}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    return data.content || [];
  } catch (e) {
    return [];
  }
}

function mapEudamedToProduct(device) {
  // Extraire les infos utiles du format EUDAMED
  const tradeNames = device.tradeNames || device.tradeName || [];
  const name = Array.isArray(tradeNames) ? tradeNames[0]?.name : (typeof tradeNames === 'string' ? tradeNames : null);
  const udi = device.primaryDi?.code || device.udiDi || null;
  const manufacturer = device.manufacturer?.name || device.authorisedRepresentative?.name || null;
  const riskClass = device.riskClass?.code || null;

  if (!udi && !name) return null;

  return {
    gtin: udi || `EUDAMED-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    name: name || 'Unknown',
    name_fr: name, // souvent deja en anglais, sera enrichi par IA
    brand: name ? name.split(' ')[0] : null,
    manufacturer: manufacturer,
    market_region: 'EU',
    source: 'eudamed',
    source_metadata: {
      eudamed_id: device.uuid || device.id || null,
      risk_class: riskClass,
      basic_udi_di: device.basicUdiDi || null,
      certificate: device.certificates?.[0]?.certificateNumber || null,
      emdn_code: device.emdnCode || null,
      status: device.deviceStatusType?.code || null
    },
    confidence_score: 0.7,
    last_synced_at: new Date().toISOString()
  };
}

function isDentalDevice(device) {
  const text = JSON.stringify(device).toLowerCase();
  return DENTAL_KEYWORDS.test(text);
}

function classifyCategory(device) {
  const text = JSON.stringify(device).toLowerCase();
  if (/implant/i.test(text)) return 'Implants';
  if (/orthodon|bracket|archwire/i.test(text)) return 'Orthodontie';
  if (/endodon|root canal|file.*canal|rotary/i.test(text)) return 'Endodontie';
  if (/prosth|crown|bridge|zircon|ceramic|denture|cad.cam|milling/i.test(text)) return 'Prothese';
  if (/composite|bonding|adhesive|cement|fill/i.test(text)) return 'Composites';
  if (/impression|alginate|silicone/i.test(text)) return 'Empreintes';
  if (/handpiece|turbine|bur\b|scaler|curette/i.test(text)) return 'Instruments';
  if (/x-ray|radiograph|sensor|panoram|cbct/i.test(text)) return 'Radiologie';
  if (/autoclave|steril|disinfect/i.test(text)) return 'Sterilisation';
  if (/chair|unit|suction|compressor|light.*cur/i.test(text)) return 'Equipement';
  if (/scanner|3d.*print|intraoral/i.test(text)) return 'CFAO';
  if (/anesthet|syringe|needle/i.test(text)) return 'Anesthesie';
  if (/fluoride|prophyl|sealant/i.test(text)) return 'Hygiene';
  if (/surgical|extract|forcep|suture/i.test(text)) return 'Chirurgie';
  return 'Divers';
}

async function main() {
  log('╔══════════════════════════════════════════════╗');
  log('║  JADOMI — Import EUDAMED Dental (EU)        ║');
  log(`║  Fabricants: ${DENTAL_MANUFACTURERS.length} | Limit: ${LIMIT}         ║`);
  log('╚══════════════════════════════════════════════╝');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    log('ERREUR: SUPABASE_URL et SUPABASE_SERVICE_KEY requis');
    process.exit(1);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  let totalFound = 0;
  let totalInserted = 0;
  let totalSkipped = 0;

  for (const manufacturer of DENTAL_MANUFACTURERS) {
    log(`\n--- ${manufacturer} ---`);

    const devices = await searchByManufacturer(manufacturer);
    if (!devices.length) { log(`  Aucun resultat`); await new Promise(r => setTimeout(r, 1000)); continue; }

    const dentalDevices = devices.filter(isDentalDevice);
    log(`  ${devices.length} dispositifs, ${dentalDevices.length} dentaires`);

    const products = dentalDevices
      .map(mapEudamedToProduct)
      .filter(Boolean)
      .map(p => ({ ...p, category: classifyCategory(p) }));

    if (products.length > 0) {
      try {
        const { error } = await supabase.from('products_database')
          .upsert(products, { onConflict: 'gtin', ignoreDuplicates: true });
        if (error) {
          // Fallback: insert un par un
          for (const p of products) {
            try {
              await supabase.from('products_database').upsert(p, { onConflict: 'gtin', ignoreDuplicates: true });
              totalInserted++;
            } catch (e) { totalSkipped++; }
          }
        } else {
          totalInserted += products.length;
        }
      } catch (e) { totalSkipped += products.length; }

      totalFound += products.length;
      log(`  → ${products.length} inseres`);
    }

    // Rate limit respectueux
    await new Promise(r => setTimeout(r, 1500));

    if (totalFound >= LIMIT) { log(`Limit ${LIMIT} atteinte`); break; }
  }

  log(`\n${'='.repeat(50)}`);
  log(`EUDAMED IMPORT TERMINE`);
  log(`  Trouves: ${totalFound}`);
  log(`  Inseres: ${totalInserted}`);
  log(`  Skips: ${totalSkipped}`);
  log('='.repeat(50));
}

main().catch(e => { log('ERREUR: ' + e.message); process.exit(1); });
