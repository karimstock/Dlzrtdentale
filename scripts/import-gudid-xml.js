#!/usr/bin/env node
// =============================================
// JADOMI — Import GUDID FDA XML (dental subset)
// Passe 51 — Parse XML streaming + filtre dental + insert Supabase
//
// Usage : node scripts/import-gudid-xml.js
// Prereq : SQL scan/products_database.sql execute dans Supabase
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const WORK_DIR = path.join(__dirname, '..', 'data', 'gudid');
const EXTRACTED_DIR = path.join(WORK_DIR, 'extracted');
const OUTPUT_FILE = path.join(WORK_DIR, 'dental_products.jsonl');
const LOG_FILE = '/tmp/passe-51-gudid-import.log';

// Dental keywords pour filtrage
const DENTAL_KEYWORDS = /dental|tooth|teeth|dent[aiu]|oral\s|periodon|orthodon|endodon|prosthodon|prosthetic|implant.*dent|crown|bridge|veneer|inlay|onlay|composite.*dent|ceramic.*dent|zirconi|porcelain|impression.*dent|alginate|silicone.*dent|handpiece|bur\b|scaler|curette|x-ray.*dent|bracket|archwire|aligner|root\s*canal|gutta.*percha|sealer.*dent|bonding.*dent|etch.*dent|adhesive.*dent|fluoride|sealant.*dent|whiten|bleach.*dent|amalgam|glass\s*ionomer|curing\s*light|dental\s*chair|dental\s*unit|saliva\s*eject|cad.*cam.*dent|milling.*dent|scanner.*dent|3d.*print.*dent/i;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

/**
 * Parse un fichier XML GUDID et extrait les produits dentaires
 * Utilise un parsing regex simplifie (pas de dependance XML parser)
 */
function parseGudidXml(xmlPath) {
  const products = [];
  const content = fs.readFileSync(xmlPath, 'utf8');

  // Split par <device ...>...</device>
  const devicePattern = /<device[^>]*>([\s\S]*?)<\/device>/g;
  let match;

  while ((match = devicePattern.exec(content)) !== null) {
    const block = match[1];

    // Extraire les champs
    const brandName = extractTag(block, 'brandName');
    const companyName = extractTag(block, 'companyName');
    const description = extractTag(block, 'deviceDescription');
    const gmdnPTName = extractTag(block, 'gmdnPTName');
    const gmdnPTDef = extractTag(block, 'gmdnPTDefinition');
    const gmdnCode = extractTag(block, 'gmdnCode');
    const productCodeName = extractTag(block, 'productCodeName');
    const productCode = extractTag(block, 'productCode');

    // Texte complet pour filtrage
    const fullText = [brandName, companyName, description, gmdnPTName, gmdnPTDef, productCodeName].filter(Boolean).join(' ');

    // Filtrer : garder uniquement les produits dentaires
    if (!DENTAL_KEYWORDS.test(fullText)) continue;

    // Extraire identifiants
    const deviceId = extractTag(block, 'deviceId');
    const catalogNumber = extractTagNonNil(block, 'catalogNumber');
    const versionModel = extractTag(block, 'versionModelNumber');
    const singleUse = extractTag(block, 'singleUse') === 'true';
    const deviceSterile = extractTag(block, 'deviceSterile') === 'true';
    const deviceClass = extractTag(block, 'deviceClass');

    // Construire le GTIN (deviceId ou catalogNumber)
    let gtin = deviceId || catalogNumber || null;
    if (!gtin) continue;

    // Nettoyer le GTIN
    gtin = gtin.replace(/\s+/g, '').substring(0, 14);
    if (gtin.length < 4) continue;

    products.push({
      gtin,
      udi: null,
      reference: catalogNumber || versionModel || null,
      manufacturer_ref: versionModel || null,
      name: (brandName || description || 'Unknown').substring(0, 255),
      brand: brandName ? brandName.substring(0, 100) : null,
      manufacturer: companyName ? companyName.substring(0, 100) : null,
      category: classifyDentalProduct(gmdnPTName, description, productCodeName),
      gmdn_code: gmdnCode || null,
      sterile: deviceSterile,
      single_use: singleUse,
      market_region: 'US',
      source: 'gudid_fda',
      source_metadata: {
        gmdn_name: gmdnPTName,
        fda_product_code: productCode,
        fda_product_code_name: productCodeName,
        device_class: deviceClass
      }
    });
  }

  return products;
}

function extractTag(block, tagName) {
  const re = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`);
  const m = re.exec(block);
  if (!m) return null;
  const val = m[1].trim();
  return val || null;
}

function extractTagNonNil(block, tagName) {
  const re = new RegExp(`<${tagName}[^>]*nil="true"[^>]*/>`);
  if (re.test(block)) return null;
  return extractTag(block, tagName);
}

function classifyDentalProduct(gmdnName, description, productCodeName) {
  const text = [gmdnName, description, productCodeName].filter(Boolean).join(' ').toLowerCase();
  if (/implant/i.test(text)) return 'Implants';
  if (/orthodon|bracket|archwire|aligner/i.test(text)) return 'Orthodontie';
  if (/endodon|root\s*canal|gutta|file.*canal/i.test(text)) return 'Endodontie';
  if (/periodon|scaler|curette/i.test(text)) return 'Parodontie';
  if (/prosth|crown|bridge|veneer|denture|cad.*cam|milling|zirconi|ceramic|porcelain/i.test(text)) return 'Prothese';
  if (/composite|bonding|adhesive|cement|fill/i.test(text)) return 'Composites';
  if (/impression|alginate|silicone/i.test(text)) return 'Empreintes';
  if (/x-ray|radiog|sensor|panoram|ceph/i.test(text)) return 'Radiologie';
  if (/handpiece|turbine|contra/i.test(text)) return 'Instruments';
  if (/bur\b|diamond|carbide|rotat/i.test(text)) return 'Instruments';
  if (/curing|light.*cur|polymer/i.test(text)) return 'Equipement';
  if (/chair|unit.*dental|suction/i.test(text)) return 'Equipement';
  if (/whiten|bleach/i.test(text)) return 'Esthetique';
  if (/fluori|sealant|prophyl|paste/i.test(text)) return 'Hygiene';
  if (/anesthet|needle|syringe.*dent/i.test(text)) return 'Anesthesie';
  if (/surg|extract|forcep|elev/i.test(text)) return 'Chirurgie';
  if (/steril|autocla|disinfect/i.test(text)) return 'Sterilisation';
  if (/scanner|3d.*print|intraoral/i.test(text)) return 'CFAO';
  return 'Divers';
}

async function insertToSupabase(products) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    log('ERREUR: SUPABASE_URL et SUPABASE_SERVICE_KEY requis dans .env');
    process.exit(1);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const batchSize = 200;
  let inserted = 0;
  let errors = 0;
  let skipped = 0;

  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize).map(p => ({
      ...p,
      last_synced_at: new Date().toISOString()
    }));

    try {
      const { error } = await supabase.from('products_database')
        .upsert(batch, { onConflict: 'gtin', ignoreDuplicates: true });

      if (error) {
        // Essayer un par un si batch echoue
        for (const product of batch) {
          try {
            const { error: singleErr } = await supabase.from('products_database')
              .upsert(product, { onConflict: 'gtin', ignoreDuplicates: true });
            if (singleErr) { skipped++; } else { inserted++; }
          } catch (e) { skipped++; }
        }
      } else {
        inserted += batch.length;
      }
    } catch (e) {
      errors += batch.length;
    }

    if ((i / batchSize) % 20 === 0 && i > 0) {
      log(`  Insert: ${inserted} OK, ${skipped} skip, ${errors} err (${Math.round(i / products.length * 100)}%)`);
    }
  }

  return { inserted, skipped, errors };
}

async function main() {
  log('╔══════════════════════════════════════════════╗');
  log('║  JADOMI — Import GUDID FDA Dental (XML)     ║');
  log('║  Mode: fichier par fichier (low memory)     ║');
  log('╚══════════════════════════════════════════════╝');

  // Lister les fichiers XML extraits
  if (!fs.existsSync(EXTRACTED_DIR)) {
    log('Extraction des fichiers XML...');
    fs.mkdirSync(EXTRACTED_DIR, { recursive: true });
    const { execSync } = require('child_process');
    execSync(`unzip -o "${path.join(WORK_DIR, 'gudid_full.zip')}" -d "${EXTRACTED_DIR}"`, {
      stdio: 'pipe',
      timeout: 600000
    });
    log('Extraction terminee');
  }

  const xmlFiles = fs.readdirSync(EXTRACTED_DIR)
    .filter(f => f.endsWith('.xml'))
    .sort();

  log(`${xmlFiles.length} fichiers XML a traiter`);

  let totalDental = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalProcessed = 0;
  const catStats = {};

  // Resume support : skip fichiers deja traites
  const PROGRESS_FILE = path.join(WORK_DIR, 'import_progress.txt');
  const doneFiles = new Set();
  if (fs.existsSync(PROGRESS_FILE)) {
    fs.readFileSync(PROGRESS_FILE, 'utf8').split('\n').filter(Boolean).forEach(f => doneFiles.add(f));
    log(`Resume mode: ${doneFiles.size} fichiers deja traites, skip`);
  }

  // Ouvrir le fichier JSONL en append
  const jsonlStream = fs.createWriteStream(OUTPUT_FILE, { flags: 'a' });

  for (let i = 0; i < xmlFiles.length; i++) {
    const xmlFile = xmlFiles[i];
    if (doneFiles.has(xmlFile)) { totalProcessed++; continue; }

    const xmlPath = path.join(EXTRACTED_DIR, xmlFile);
    const fileSize = (fs.statSync(xmlPath).size / 1024 / 1024).toFixed(1);

    log(`[${i + 1}/${xmlFiles.length}] ${xmlFile} (${fileSize} Mo)...`);

    try {
      const products = parseGudidXml(xmlPath);

      // Pas de dedup en memoire — Supabase gere avec ignoreDuplicates
      for (const p of products) {
        catStats[p.category] = (catStats[p.category] || 0) + 1;
        jsonlStream.write(JSON.stringify(p) + '\n');
      }

      totalDental += products.length;
      totalProcessed++;

      // Inserer dans Supabase immediatement (libere la memoire)
      if (products.length > 0) {
        const result = await insertToSupabase(products);
        totalInserted += result.inserted;
        totalSkipped += result.skipped;
        totalErrors += result.errors;
      }

      // Marquer comme traite
      fs.appendFileSync(PROGRESS_FILE, xmlFile + '\n');

      log(`  → ${products.length} dental, cumul inseres: ${totalInserted} (skip: ${totalSkipped})`);
    } catch (e) {
      log(`  ERREUR: ${e.message}`);
    }
  }

  jsonlStream.end();

  log(`\n=== IMPORT GUDID TERMINE ===`);
  log(`Fichiers traites: ${totalProcessed}/${xmlFiles.length}`);
  log(`Produits dentaires uniques: ${totalDental}`);
  log(`Inseres Supabase: ${totalInserted}`);
  log(`Skips (doublons): ${totalSkipped}`);
  log(`Erreurs: ${totalErrors}`);
  log(`JSONL: ${OUTPUT_FILE}`);

  log('\nRepartition par categorie:');
  Object.entries(catStats).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
    log(`  ${cat}: ${count} (${Math.round(count / totalDental * 100)}%)`);
  });
}

main().catch(e => { log('ERREUR FATALE: ' + e.message); process.exit(1); });
