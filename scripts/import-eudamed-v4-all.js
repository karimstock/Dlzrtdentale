#!/usr/bin/env node
// =============================================
// JADOMI — EUDAMED v4 — TOUS LES FABRICANTS
// Stratégie : recherche par mots-clés dentaires larges
// + fabricants identifiés avec GTIN + pagination complète
// Anti-doublons : upsert on gtin + ignoreDuplicates
//
// ASTUCE EUDAMED (à retenir dans le CODEX) :
// - L'API search.eudamed.com fonctionne bien
// - L'API officielle ec.europa.eu/tools/eudamed NE filtre PAS par fabricant
// - Chercher par NOM DE FABRICANT exact fonctionne (ex: "KERR ITALIA SRL")
// - Chercher par MOT-CLÉ PRODUIT (ex: "dental implant") pour découvrir
// - Filtrer côté client par manufacturer_name
// - Le champ primary_di_code = GTIN, max 14 chars
// - Pagination via skip (par 100)
// - Rate limit : ~1s entre requêtes
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const LOG_FILE = '/tmp/passe-51-eudamed-v4.log';
const SEARCH_API = 'https://search.eudamed.com/api/search';

// ═══ PARTIE 1 : FABRICANTS IDENTIFIÉS (recherche directe par nom) ═══
const MANUFACTURER_SEARCHES = [
  // GROS VOLUME (non encore en base ou sous-représentés)
  { q: 'KERR ITALIA SRL', m: 'KERR', c: 'Composites', maxPages: 70 },
  { q: 'Adin Dental Implant', m: 'Adin', c: 'Implants', maxPages: 25 },
  { q: 'Kentzler-Kaschner', m: 'Kentzler', c: 'Instruments', maxPages: 10 },
  { q: 'Gebr. Brasseler', m: 'Brasseler', c: 'Instruments', maxPages: 5 },
  { q: 'Dental Expert', m: 'Dental Expert', c: 'Instruments', maxPages: 5 },
  { q: 'Daddy D Pro', m: 'Daddy', c: 'Instruments', maxPages: 5 },
  { q: 'American Eagle Instruments', m: 'American Eagle', c: 'Instruments', maxPages: 5 },
  { q: 'Deltamed GmbH', m: 'Deltamed', c: 'Composites', maxPages: 5 },
  { q: 'ORTHODONTICS HIGH DESIGN', m: 'ORTHODONTICS HIGH', c: 'Orthodontie', maxPages: 5 },
  { q: 'Surtex Instruments', m: 'Surtex', c: 'Instruments', maxPages: 5 },
  { q: 'Bloomden Bioceramics', m: 'Bloomden', c: 'Prothese', maxPages: 5 },
  { q: 'Cortex Dental Implants', m: 'Cortex', c: 'Implants', maxPages: 5 },
  { q: 'Aesculap AG', m: 'Aesculap', c: 'Chirurgie', maxPages: 5 },
  { q: 'Seil Global', m: 'Seil', c: 'Instruments', maxPages: 5 },
  { q: 'Associated Dental Products', m: 'Associated Dental', c: 'Divers', maxPages: 5 },
  { q: 'Henry Schein dental', m: 'Henry Schein', c: 'Divers', maxPages: 5 },
  { q: 'Larident SRL', m: 'Larident', c: 'Prothese', maxPages: 5 },
  { q: 'ASTAR ORTHODONTICS', m: 'ASTAR', c: 'Orthodontie', maxPages: 5 },
  { q: 'YDM CORPORATION', m: 'YDM', c: 'Instruments', maxPages: 5 },
  { q: 'YAMAKIN', m: 'YAMAKIN', c: 'Composites', maxPages: 5 },
  { q: 'MEDIGMA BIOMEDICAL', m: 'MEDIGMA', c: 'Implants', maxPages: 5 },
  { q: 'President Dental GmbH', m: 'President Dental', c: 'Composites', maxPages: 5 },
  { q: 'Polydentia SA', m: 'Polydentia', c: 'Composites', maxPages: 5 },
  { q: 'Edierre Implant', m: 'Edierre', c: 'Implants', maxPages: 5 },
  { q: 'Cavex Holland', m: 'Cavex', c: 'Empreintes', maxPages: 5 },
  { q: 'Directa AB dental', m: 'Directa', c: 'Instruments', maxPages: 5 },
  { q: 'Vigodent dental', m: 'Vigodent', c: 'Composites', maxPages: 5 },
  { q: 'Ditron Dental', m: 'Ditron', c: 'Implants', maxPages: 5 },
  { q: 'B.J.M. Laboratories', m: 'B.J.M.', c: 'Implants', maxPages: 5 },
  { q: 'NOVODENT SA', m: 'NOVODENT', c: 'Composites', maxPages: 5 },
  { q: 'Armor Dental', m: 'Armor', c: 'Composites', maxPages: 5 },
  { q: 'Nordent Manufacturing', m: 'Nordent', c: 'Instruments', maxPages: 5 },
  { q: 'Hu-Friedy Manufacturing', m: 'Hu-Friedy', c: 'Instruments', maxPages: 5 },
  { q: 'G&H Wire Company', m: 'G&H Wire', c: 'Orthodontie', maxPages: 5 },
  { q: 'Water Pik dental', m: 'Water Pik', c: 'Hygiene', maxPages: 5 },
  { q: 'Biomet 3i', m: 'Biomet', c: 'Implants', maxPages: 5 },
  { q: 'Dentsply DeTrey', m: 'Dentsply', c: 'Composites', maxPages: 5 },
  { q: 'CB Healthcare dental', m: 'CB Healthcare', c: 'Divers', maxPages: 5 },
];

// ═══ PARTIE 2 : RECHERCHES PAR MOTS-CLÉS LARGES (pour petits fabricants) ═══
const KEYWORD_SEARCHES = [
  { q: 'dental implant', c: 'Implants' },
  { q: 'dental implant abutment', c: 'Implants' },
  { q: 'dental implant screw', c: 'Implants' },
  { q: 'dental bone graft', c: 'Implants' },
  { q: 'dental membrane collagen', c: 'Implants' },
  { q: 'dental composite', c: 'Composites' },
  { q: 'dental cement luting', c: 'Composites' },
  { q: 'dental adhesive bonding', c: 'Composites' },
  { q: 'dental resin filling', c: 'Composites' },
  { q: 'dental impression material', c: 'Empreintes' },
  { q: 'dental alginate', c: 'Empreintes' },
  { q: 'dental silicone impression', c: 'Empreintes' },
  { q: 'dental handpiece', c: 'Instruments' },
  { q: 'dental turbine', c: 'Instruments' },
  { q: 'dental contra-angle', c: 'Instruments' },
  { q: 'dental scaler ultrasonic', c: 'Instruments' },
  { q: 'dental curette', c: 'Instruments' },
  { q: 'dental explorer probe', c: 'Instruments' },
  { q: 'dental mirror', c: 'Instruments' },
  { q: 'dental forceps extraction', c: 'Chirurgie' },
  { q: 'dental elevator luxator', c: 'Chirurgie' },
  { q: 'dental bur carbide', c: 'Instruments' },
  { q: 'dental bur diamond', c: 'Instruments' },
  { q: 'endodontic file rotary', c: 'Endodontie' },
  { q: 'endodontic obturator', c: 'Endodontie' },
  { q: 'dental apex locator', c: 'Endodontie' },
  { q: 'dental curing light', c: 'Instruments' },
  { q: 'orthodontic bracket', c: 'Orthodontie' },
  { q: 'orthodontic wire archwire', c: 'Orthodontie' },
  { q: 'orthodontic band', c: 'Orthodontie' },
  { q: 'orthodontic elastic', c: 'Orthodontie' },
  { q: 'dental aligner clear', c: 'Orthodontie' },
  { q: 'dental crown ceramic', c: 'Prothese' },
  { q: 'dental zirconia disc', c: 'Prothese' },
  { q: 'dental porcelain veneer', c: 'Prothese' },
  { q: 'dental articulator', c: 'Prothese' },
  { q: 'dental polishing paste', c: 'Hygiene' },
  { q: 'dental whitening bleaching', c: 'Hygiene' },
  { q: 'dental fluoride varnish', c: 'Hygiene' },
  { q: 'dental sealant fissure', c: 'Hygiene' },
  { q: 'dental x-ray sensor', c: 'Radiologie' },
  { q: 'dental panoramic', c: 'Radiologie' },
  { q: 'dental CBCT', c: 'Radiologie' },
  { q: 'dental scanner intraoral', c: 'CFAO' },
  { q: 'dental 3D printer', c: 'CFAO' },
  { q: 'dental milling machine', c: 'CFAO' },
  { q: 'dental autoclave sterilizer', c: 'Sterilisation' },
  { q: 'dental needle carpule', c: 'Anesthesie' },
  { q: 'dental syringe cartridge', c: 'Anesthesie' },
  { q: 'dental chair unit', c: 'Equipement' },
  { q: 'dental suction compressor', c: 'Equipement' },
  { q: 'dental matrix band', c: 'Instruments' },
  { q: 'dental rubber dam clamp', c: 'Instruments' },
  { q: 'dental shade guide', c: 'Prothese' },
  { q: 'dental wax modelling', c: 'Prothese' },
  { q: 'dental tray custom', c: 'Empreintes' },
  { q: 'dental retractor cheek', c: 'Instruments' },
  { q: 'dental suture surgical', c: 'Chirurgie' },
  { q: 'periodontal probe instrument', c: 'Instruments' },
  { q: 'prosthodontic framework', c: 'Prothese' },
];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function fetchEudamed(query, skip) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(
      `${SEARCH_API}?q=${encodeURIComponent(query)}&type=device&size=100&skip=${skip}`,
      { headers: { 'Accept': 'application/json' }, signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}

function classifyCategory(product, defaultCat) {
  const text = (product.name + ' ' + (product.manufacturer || '')).toLowerCase();
  if (/implant/i.test(text)) return 'Implants';
  if (/orthodon|bracket|archwire|aligner/i.test(text)) return 'Orthodontie';
  if (/endodon|root canal|file.*canal|rotary.*file/i.test(text)) return 'Endodontie';
  if (/prosth|crown|bridge|zircon|ceramic|denture|cad.cam|milling|porcelain/i.test(text)) return 'Prothese';
  if (/composite|bonding|adhesive|cement|filling|resin/i.test(text)) return 'Composites';
  if (/impression|alginate|silicone/i.test(text)) return 'Empreintes';
  if (/handpiece|turbine|bur\b|scaler|curette|mirror|explorer|probe|matrix/i.test(text)) return 'Instruments';
  if (/x-ray|radiograph|sensor|panoram|cbct/i.test(text)) return 'Radiologie';
  if (/autoclave|steril|disinfect/i.test(text)) return 'Sterilisation';
  if (/chair|unit|suction|compressor|light.*cur/i.test(text)) return 'Equipement';
  if (/scanner|3d.*print|intraoral|milling.*machine/i.test(text)) return 'CFAO';
  if (/anesthet|syringe|needle|carpule|cartridge/i.test(text)) return 'Anesthesie';
  if (/fluoride|prophyl|sealant|whiten|polish/i.test(text)) return 'Hygiene';
  if (/surgical|extract|forcep|suture|elevator|luxator/i.test(text)) return 'Chirurgie';
  return defaultCat;
}

function mapResult(r, defaultCategory) {
  const gtin = r.primary_di_code;
  if (!gtin || gtin.length > 14) return null;

  const product = {
    gtin,
    name: r.device_name_text || r.trade_name_text || r.reference || 'Unknown',
    name_fr: r.device_name_text || r.trade_name_text || null,
    brand: (r.trade_name_text || '').split(/\s*[,/]\s*/)[0] || null,
    manufacturer: r.manufacturer_name,
    reference: r.reference || null,
    market_region: 'EU',
    source: 'eudamed',
    source_metadata: {
      eudamed_uuid: r.eudamed_uuid,
      manufacturer_srn: r.manufacturer_srn
    },
    confidence_score: 0.8,
    last_synced_at: new Date().toISOString()
  };

  product.category = classifyCategory(product, defaultCategory);
  return product;
}

async function upsertBatch(supabase, products) {
  if (!products.length) return 0;
  let inserted = 0;
  try {
    const { error } = await supabase
      .from('products_database')
      .upsert(products, { onConflict: 'gtin', ignoreDuplicates: true });
    if (!error) return products.length;
    // Fallback one by one
    for (const p of products) {
      try {
        await supabase.from('products_database')
          .upsert(p, { onConflict: 'gtin', ignoreDuplicates: true });
        inserted++;
      } catch (e2) {}
    }
  } catch (e) {
    for (const p of products) {
      try {
        await supabase.from('products_database')
          .upsert(p, { onConflict: 'gtin', ignoreDuplicates: true });
        inserted++;
      } catch (e2) {}
    }
  }
  return inserted;
}

async function main() {
  if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);

  log('╔════════════════��═════════════════════════════════════╗');
  log('║  JADOMI — EUDAMED v4 — TOUS LES FABRICANTS         ║');
  log(`║  ${MANUFACTURER_SEARCHES.length} fabricants + ${KEYWORD_SEARCHES.length} mots-clés dentaires       ║`);
  log('║  Pagination complète — Anti-doublons GTIN           ║');
  log('╚══════════��══════════════════════════��════════════════╝');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { count: before } = await supabase
    .from('products_database')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'eudamed');
  log(`Produits EUDAMED avant : ${before}`);

  let grandTotal = 0;

  // ═══ PARTIE 1 : FABRICANTS IDENTIFIÉS ═══
  log('\n══════ PARTIE 1 : FABRICANTS IDENTIFIÉS ══════');

  for (let i = 0; i < MANUFACTURER_SEARCHES.length; i++) {
    const s = MANUFACTURER_SEARCHES[i];
    log(`\n[${i + 1}/${MANUFACTURER_SEARCHES.length}] ${s.q} (${s.c})`);

    let found = 0, skip = 0;
    const maxSkip = (s.maxPages || 5) * 100;

    while (skip < maxSkip) {
      const data = await fetchEudamed(s.q, skip);
      if (!data?.results?.length) break;

      const matched = data.results.filter(r =>
        (r.manufacturer_name || '').toLowerCase().includes(s.m.toLowerCase())
      );

      const products = matched.map(r => mapResult(r, s.c)).filter(Boolean);

      if (products.length > 0) {
        await upsertBatch(supabase, products);
        found += products.length;
      }

      if (data.results.length < 100) break;
      skip += 100;
      await new Promise(r => setTimeout(r, 1000));
    }

    grandTotal += found;
    log(`  → ${found} produits (total: ${grandTotal})`);
    await new Promise(r => setTimeout(r, 1200));
  }

  // ═══ PARTIE 2 : MOTS-CLÉS LARGES ══��
  log('\n══════ PARTIE 2 : MOTS-CLÉS DENTAIRES ════��═');

  for (let i = 0; i < KEYWORD_SEARCHES.length; i++) {
    const s = KEYWORD_SEARCHES[i];
    log(`\n[${i + 1}/${KEYWORD_SEARCHES.length}] "${s.q}" (${s.c})`);

    let found = 0, skip = 0;

    // Max 30 pages (3000 résultats) par mot-clé
    while (skip < 3000) {
      const data = await fetchEudamed(s.q, skip);
      if (!data?.results?.length) break;

      const products = data.results
        .map(r => mapResult(r, s.c))
        .filter(Boolean);

      if (products.length > 0) {
        await upsertBatch(supabase, products);
        found += products.length;
      }

      if (data.results.length < 100) break;
      skip += 100;
      await new Promise(r => setTimeout(r, 1000));
    }

    grandTotal += found;
    if (found > 0) log(`  �� ${found} produits (total: ${grandTotal})`);
    else log(`  → 0`);
    await new Promise(r => setTimeout(r, 1200));
  }

  // ═══ BILAN FINAL ═══
  const { count: after } = await supabase
    .from('products_database')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'eudamed');

  log(`\n${'═'.repeat(55)}`);
  log(`EUDAMED v4 TERMINÉ`);
  log(`  Total trouvés : ${grandTotal}`);
  log(`  EUDAMED avant : ${before}`);
  log(`  EUDAMED après : ${after}`);
  log(`  Nouveaux uniques ajoutés : ${after - before}`);
  log('═'.repeat(55));
}

main().catch(e => { log('ERREUR FATALE: ' + e.message); process.exit(1); });
