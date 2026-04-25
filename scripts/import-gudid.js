#!/usr/bin/env node
// =============================================
// JADOMI — Import GUDID FDA (dental subset)
// Passe 51 — ~50 000 produits dentaires
//
// Usage :
//   node scripts/import-gudid.js [--download] [--filter] [--import] [--all]
//
// Source : https://accessgudid.nlm.nih.gov/download
// Format : pipe-delimited text files
// =============================================

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');

// Config
const GUDID_DOWNLOAD_URL = 'https://accessgudid.nlm.nih.gov/download/files/AccessGUDID_Delimited_Full_Release.zip';
const WORK_DIR = path.join(__dirname, '..', 'data', 'gudid');
const LOG_FILE = '/tmp/passe-51-gudid.log';

// Dental GMDN codes (Global Medical Device Nomenclature)
const DENTAL_GMDN_CODES = [
  // Instruments dentaires
  '35100', '35101', '35102', '35103', '35104', '35105',
  '35110', '35111', '35112', '35113', '35114', '35115',
  '35120', '35121', '35122', '35130', '35131', '35132',
  '35140', '35141', '35150', '35151', '35160', '35161',
  '35170', '35171', '35180', '35190', '35199',
  // Implants dentaires
  '41600', '41601', '41602', '41603', '41604', '41605',
  '41610', '41611', '41620', '41621', '41630', '41640',
  // Materiel prothese
  '47900', '47901', '47902', '47903', '47904', '47905',
  '47910', '47911', '47920', '47921',
  // Orthodontie
  '36400', '36401', '36402', '36403', '36410',
  // Endodontie
  '35200', '35201', '35202', '35203', '35210',
  // Parodontie
  '35300', '35301', '35302', '35303',
];

// Keywords pour filtre supplementaire
const DENTAL_KEYWORDS = [
  'dental', 'tooth', 'teeth', 'dent', 'oral', 'periodontal',
  'orthodontic', 'endodontic', 'prosthodontic', 'prosthetic',
  'implant dental', 'crown', 'bridge', 'veneer', 'inlay', 'onlay',
  'composite', 'ceramic', 'zirconia', 'porcelain',
  'impression', 'alginate', 'silicone dental',
  'handpiece', 'bur', 'scaler', 'curette',
  'x-ray dental', 'radiograph dental',
  'bracket', 'archwire', 'aligner',
  'root canal', 'gutta percha', 'sealer',
  'bonding', 'etching', 'adhesive dental',
  'fluoride', 'sealant dental',
  'whitening', 'bleaching dental',
  'amalgam', 'glass ionomer',
  'curing light', 'polymerization',
  'dental chair', 'dental unit',
  'suction dental', 'saliva ejector'
];

const DENTAL_KEYWORDS_REGEX = new RegExp(DENTAL_KEYWORDS.join('|'), 'i');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function downloadGUDID() {
  log('=== ETAPE 1: Telechargement GUDID ===');
  fs.mkdirSync(WORK_DIR, { recursive: true });

  const zipPath = path.join(WORK_DIR, 'gudid_full.zip');

  if (fs.existsSync(zipPath)) {
    log('Fichier ZIP deja present, skip download');
    return zipPath;
  }

  log(`Telechargement depuis ${GUDID_DOWNLOAD_URL}`);
  log('ATTENTION: Fichier ~8 Go, patience...');

  const { execSync } = require('child_process');
  try {
    execSync(`wget -q --show-progress -O "${zipPath}" "${GUDID_DOWNLOAD_URL}"`, {
      stdio: 'inherit',
      timeout: 3600000 // 1h max
    });
    log('Telechargement termine');
  } catch (e) {
    log('ERREUR telechargement: ' + e.message);
    log('Alternative: telecharger manuellement depuis https://accessgudid.nlm.nih.gov/download');
    log('et placer le ZIP dans ' + WORK_DIR);
    throw e;
  }

  return zipPath;
}

async function extractAndFilter(zipPath) {
  log('=== ETAPE 2: Extraction et filtrage dental ===');
  const { execSync } = require('child_process');

  const extractDir = path.join(WORK_DIR, 'extracted');
  fs.mkdirSync(extractDir, { recursive: true });

  // Extraire seulement le fichier device.txt (produits)
  log('Extraction du fichier device...');
  try {
    execSync(`unzip -o "${zipPath}" "*device*" -d "${extractDir}"`, { stdio: 'pipe' });
  } catch (e) {
    log('Extraction partielle, recherche fichiers disponibles...');
    execSync(`unzip -l "${zipPath}" | head -20`, { stdio: 'inherit' });
  }

  // Trouver le fichier device
  const files = fs.readdirSync(extractDir, { recursive: true });
  const deviceFile = files.find(f => f.toLowerCase().includes('device') && f.endsWith('.txt'));

  if (!deviceFile) {
    log('Fichier device.txt non trouve. Fichiers disponibles: ' + files.join(', '));
    throw new Error('device.txt not found');
  }

  const devicePath = path.join(extractDir, deviceFile);
  log(`Fichier device trouve: ${devicePath}`);

  // Filtrer les produits dentaires
  const outputPath = path.join(WORK_DIR, 'dental_products.jsonl');
  const outputStream = fs.createWriteStream(outputPath);

  const rl = readline.createInterface({
    input: fs.createReadStream(devicePath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  let headers = null;
  let total = 0;
  let dental = 0;

  for await (const line of rl) {
    total++;
    if (total === 1) {
      headers = line.split('|');
      continue;
    }

    const fields = line.split('|');
    const record = {};
    headers.forEach((h, i) => { record[h.trim()] = (fields[i] || '').trim(); });

    // Filtre par GMDN code
    const gmdnMatch = DENTAL_GMDN_CODES.some(code =>
      (record.gmdnPTDefinition || '').includes(code) ||
      (record.gmdnPTName || '').includes(code)
    );

    // Filtre par keywords
    const textToCheck = [
      record.brandName, record.deviceDescription,
      record.gmdnPTName, record.gmdnPTDefinition,
      record.companyName
    ].filter(Boolean).join(' ');

    const keywordMatch = DENTAL_KEYWORDS_REGEX.test(textToCheck);

    if (gmdnMatch || keywordMatch) {
      dental++;
      outputStream.write(JSON.stringify({
        gtin: record.PrimaryDI || record.di || null,
        udi: record.UDI || null,
        name: record.brandName || record.deviceDescription || 'Unknown',
        brand: record.brandName || null,
        manufacturer: record.companyName || null,
        gmdn_code: record.gmdnPTName || null,
        sterile: record.sterilization === 'true',
        single_use: record.singleUse === 'true',
        market_region: 'US',
        source_metadata: {
          fda_listing: record.listingNumber || null,
          device_class: record.deviceClass || null,
          premarket: record.premarketNumber || null
        }
      }) + '\n');
    }

    if (total % 500000 === 0) {
      log(`Progress: ${total} lignes traitees, ${dental} produits dentaires trouves`);
    }
  }

  outputStream.end();
  log(`Filtrage termine: ${dental} produits dentaires / ${total} total`);
  return outputPath;
}

async function importToSupabase(jsonlPath) {
  log('=== ETAPE 3: Import dans Supabase ===');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    log('ERREUR: SUPABASE_URL et SUPABASE_SERVICE_KEY requis dans .env');
    throw new Error('Missing Supabase config');
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const content = fs.readFileSync(jsonlPath, 'utf8');
  const lines = content.split('\n').filter(Boolean);
  log(`${lines.length} produits a importer`);

  const batchSize = 100;
  let imported = 0;
  let errors = 0;

  for (let i = 0; i < lines.length; i += batchSize) {
    const batch = lines.slice(i, i + batchSize).map(line => {
      const p = JSON.parse(line);
      return {
        gtin: p.gtin,
        udi: p.udi,
        name: p.name,
        brand: p.brand,
        manufacturer: p.manufacturer,
        gmdn_code: p.gmdn_code,
        sterile: p.sterile,
        single_use: p.single_use,
        market_region: p.market_region,
        source: 'gudid_fda',
        source_metadata: p.source_metadata,
        last_synced_at: new Date().toISOString()
      };
    }).filter(p => p.gtin); // Ignorer ceux sans GTIN

    if (!batch.length) continue;

    try {
      const { error } = await supabase.from('products_database')
        .upsert(batch, { onConflict: 'gtin', ignoreDuplicates: false });
      if (error) {
        errors += batch.length;
        if (errors < 5) log(`Erreur batch: ${error.message}`);
      } else {
        imported += batch.length;
      }
    } catch (e) {
      errors += batch.length;
    }

    if ((i / batchSize) % 50 === 0) {
      log(`Import: ${imported} inseres, ${errors} erreurs (${Math.round(i/lines.length*100)}%)`);
    }
  }

  log(`=== Import GUDID termine ===`);
  log(`Inseres: ${imported} | Erreurs: ${errors}`);
  return { imported, errors };
}

// ── Main ──────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const doAll = args.includes('--all');

  log('╔══════════════════════════════════════╗');
  log('║  JADOMI — Import GUDID FDA Dental   ║');
  log('╚══════════════════════════════════════╝');

  try {
    if (doAll || args.includes('--download')) {
      const zipPath = await downloadGUDID();
      log('ZIP: ' + zipPath);
    }

    const jsonlPath = path.join(WORK_DIR, 'dental_products.jsonl');

    if (doAll || args.includes('--filter')) {
      const zipPath = path.join(WORK_DIR, 'gudid_full.zip');
      await extractAndFilter(zipPath);
    }

    if (doAll || args.includes('--import')) {
      if (!fs.existsSync(jsonlPath)) {
        log('Fichier dental_products.jsonl non trouve. Lancez --filter d\'abord.');
        process.exit(1);
      }
      await importToSupabase(jsonlPath);
    }

    if (!args.length) {
      log('Usage: node scripts/import-gudid.js [--download] [--filter] [--import] [--all]');
      log('  --download : Telecharge le ZIP GUDID (~8 Go)');
      log('  --filter   : Filtre le subset dental → dental_products.jsonl');
      log('  --import   : Importe dans Supabase (products_database)');
      log('  --all      : Fait tout dans l\'ordre');
    }
  } catch (e) {
    log('ERREUR FATALE: ' + e.message);
    process.exit(1);
  }
}

main();
