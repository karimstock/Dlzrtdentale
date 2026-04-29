#!/usr/bin/env node
// =============================================
// JADOMI — Enrichissement sélectif Orthodontie + Prothèse
// Passe 51 — Sous-catégorisation précise + traduction FR
//
// Usage :
//   node scripts/enrich-ortho-prosth.js [--limit 5000] [--category ortho|prosth|both]
//
// Etapes :
//   1. Nettoyage : retirer les faux positifs (produits non-dentaires)
//   2. Sous-categorisation precise par regex
//   3. Enrichissement IA Claude Haiku (nom FR + description + mots-cles)
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');

const LOG_FILE = '/tmp/passe-51-enrich-ortho-prosth.log';
const args = process.argv.slice(2);
const LIMIT = parseInt((args.find(a => a.startsWith('--limit=')) || '--limit=5000').split('=')[1]);
const CAT_FILTER = (args.find(a => a.startsWith('--category=')) || '--category=both').split('=')[1];
const BATCH_SIZE = 15;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// ════════════════════════════════════════════
// SOUS-CATEGORIES ORTHODONTIE (tri selectif)
// ════════════════════════════════════════════
const ORTHO_SUBCATEGORIES = [
  { name: 'Brackets', regex: /bracket|attache|slot\s*(0|\.)/i },
  { name: 'Arcs orthodontiques', regex: /archwire|arch\s*wire|wire.*ortho|niti|stainless.*wire|beta.*titanium|tha.*wire/i },
  { name: 'Aligneurs', regex: /aligner|clear.*tray|invisible.*ortho|thermoform/i },
  { name: 'Bagues orthodontiques', regex: /\bband\b.*ortho|molar.*band|ortho.*band|band.*molar/i },
  { name: 'Élastiques orthodontiques', regex: /elastic|rubber.*band|power\s*chain|ligature.*elastic|o-ring/i },
  { name: 'Fils et ligatures', regex: /ligature|tie.*wire|kobayashi|steel.*ligature/i },
  { name: 'Ciment orthodontique', regex: /cement.*ortho|ortho.*cement|bond.*ortho|ortho.*bond|adhesive.*ortho|ortho.*adhesive|primer.*ortho/i },
  { name: 'Mini-vis orthodontiques', regex: /mini.*screw|micro.*screw|tad\b|temporary.*anchor|skeletal.*anchor/i },
  { name: 'Tubes orthodontiques', regex: /\btube\b.*ortho|buccal.*tube|molar.*tube|ortho.*tube/i },
  { name: 'Ressorts orthodontiques', regex: /spring.*ortho|coil.*spring|open.*coil|closed.*coil|niti.*spring/i },
  { name: 'Plaques et appareils', regex: /expander|expansion|palatal|quad.*helix|hyrax|pendulum|distalizer|herbst|twin.*block|activator/i },
  { name: 'Rétenteurs', regex: /retainer|retention|hawley|essix|vivera|bonded.*retainer/i },
  { name: 'Instruments orthodontiques', regex: /plier|pince|cutter.*ortho|ortho.*plier|weingart|distal.*end|bird.*beak|how.*plier/i },
  { name: 'Cire orthodontique', regex: /wax.*ortho|ortho.*wax|relief.*wax|comfort.*wax/i },
  { name: 'Scanner et CFAO ortho', regex: /scanner.*ortho|3d.*print.*ortho|digital.*ortho|cad.*ortho|ortho.*scan/i },
  { name: 'Auxiliaires orthodontiques', regex: /button|cleat|hook|eyelet|crimpable|stop|separator|spacer.*ortho/i },
];

// ════════════════════════════════════════════
// SOUS-CATEGORIES PROTHESE DENTAIRE (tri selectif)
// ════════════════════════════════════════════
const PROSTH_SUBCATEGORIES = [
  { name: 'Zircone', regex: /zircon|zirconia|yttria|y-tzp|prettau|katana|bruxzir|lava.*zir/i },
  { name: 'Céramique', regex: /ceramic|porcelain|feldspath|leucite|lithium.*disil|e\.max|emax|ips.*empress|vita.*mark|ivoclar/i },
  { name: 'Résine dentaire', regex: /resin|acrylic|pmma|denture.*base|provisional|temporary.*crown|bis.*gma|composite.*prosth/i },
  { name: 'Métal et alliages', regex: /alloy|cobalt.*chrom|nickel.*chrom|co-cr|ni-cr|gold.*alloy|palladium|titanium.*prosth|cast.*metal/i },
  { name: 'Cire dentaire', regex: /\bwax\b|pattern.*wax|casting.*wax|inlay.*wax|dip.*wax|modelling.*wax|carving.*wax/i },
  { name: 'Platre dentaire', regex: /plaster|gypsum|die.*stone|dental.*stone|type\s*[34]|vel-mix|fuji.*rock/i },
  { name: 'Silicone dentaire', regex: /silicone|polyvinyl|addition.*silicone|condensation|pvs|vinyl.*polysiloxane|impression.*mat/i },
  { name: 'Articulateurs', regex: /articulator|facebow|face.*bow|mounting|semi.*adjust|arcon|non.*arcon/i },
  { name: 'Dents artificielles', regex: /artificial.*tooth|denture.*tooth|acrylic.*tooth|prosthetic.*tooth|tooth.*set|anterior.*tooth|posterior.*tooth/i },
  { name: 'Attachements', regex: /attachment|precision.*attach|semi.*precision|locator|ball.*attach|bar.*attach|telescopic/i },
  { name: 'Piliers implantaires', regex: /abutment|pilier|healing.*cap|scan.*body|analog|implant.*post|multi.*unit/i },
  { name: 'Couronnes et bridges', regex: /crown|bridge|pontic|coping|framework|substructure|pfm|full.*contour/i },
  { name: 'Facettes et inlays', regex: /veneer|inlay|onlay|overlay|laminate|facette/i },
  { name: 'Fraises de laboratoire', regex: /\bbur\b.*lab|lab.*bur|carbide.*lab|diamond.*lab|finishing.*bur|polishing.*bur|trimmer/i },
  { name: 'Fours et équipement labo', regex: /furnace|oven|burnout|pressing|sintering|casting.*machine|centrifug|vacuum.*mixer|polymeriz/i },
  { name: 'CAD/CAM prothese', regex: /cad.*cam|milling|scan.*prosth|digital.*prosth|3d.*print.*prosth|stl|dentin.*disc/i },
  { name: 'Ciments de scellement', regex: /luting|cement.*prosth|prosth.*cement|glass.*ionomer.*cem|resin.*cement|self.*adhesive.*cem/i },
  { name: 'Soudure et céramisation', regex: /solder|brazing|opaque|glaze|stain.*ceramic|liner.*ceramic|wash.*ceramic|build.*up/i },
];

// ════════════════════════════════════════════
// FAUX POSITIFS A RETIRER (bruit)
// ════════════════════════════════════════════
const FALSE_POSITIVES = /ultrasound|mri\b|cardiac|hearing|spinal|knee|hip\s*joint|shoulder|ankle|ophthal|ophth|retinal|cochlear|pacemaker|stent\b|catheter|dialysis|ventilat|insulin|glucose\s*monitor|blood\s*pressure|ecg\b|eeg\b|endoscop|laparoscop|arthroscop|suture.*kit|surgical.*gown|face.*mask(?!.*dental)|glove(?!.*dental)/i;

function classifySubcategory(product, subcatList) {
  const text = [product.name, product.brand, product.manufacturer].filter(Boolean).join(' ');
  for (const sub of subcatList) {
    if (sub.regex.test(text)) return sub.name;
  }
  return 'Autre';
}

function isFalsePositive(product) {
  const text = [product.name, product.brand, product.manufacturer].filter(Boolean).join(' ');
  return FALSE_POSITIVES.test(text);
}

async function main() {
  log('╔══════════════════════════════════════════════╗');
  log('║  JADOMI — Enrichissement Ortho + Prothèse   ║');
  log(`║  Limit: ${LIMIT} | Categories: ${CAT_FILTER}        ║`);
  log('╚══════════════════════════════════════════════╝');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const categories = [];
  if (CAT_FILTER === 'ortho' || CAT_FILTER === 'both') categories.push('Orthodontie');
  if (CAT_FILTER === 'prosth' || CAT_FILTER === 'both') categories.push('Prothèse');

  let totalEnriched = 0;
  let totalCleaned = 0;
  let totalTokens = 0;

  for (const category of categories) {
    log(`\n${'='.repeat(50)}`);
    log(`CATEGORIE : ${category}`);
    log('='.repeat(50));

    const subcatList = category === 'Orthodontie' ? ORTHO_SUBCATEGORIES : PROSTH_SUBCATEGORIES;

    // Récupérer les produits non enrichis
    const { data: products, error } = await supabase.from('products_database')
      .select('id, gtin, name, brand, manufacturer, gmdn_code, subcategory, name_fr, source_metadata')
      .eq('category', category)
      .is('name_fr', null)
      .limit(LIMIT);

    if (error) { log('ERREUR: ' + error.message); continue; }
    if (!products?.length) { log('Aucun produit à enrichir'); continue; }

    log(`${products.length} produits à traiter`);

    // ETAPE 1 : Nettoyage faux positifs
    log('\n--- Etape 1: Nettoyage faux positifs ---');
    let cleanedCount = 0;
    for (const p of products) {
      if (isFalsePositive(p)) {
        await supabase.from('products_database')
          .update({ category: 'Divers', subcategory: 'Faux positif dental', name_fr: '[NON DENTAL]' })
          .eq('id', p.id);
        cleanedCount++;
      }
    }
    log(`${cleanedCount} faux positifs retirés de ${category}`);
    totalCleaned += cleanedCount;

    // Filtrer les vrais produits
    const realProducts = products.filter(p => !isFalsePositive(p));
    log(`${realProducts.length} vrais produits ${category} à enrichir`);

    // ETAPE 2 : Sous-categorisation par regex
    log('\n--- Etape 2: Sous-categorisation ---');
    const subcatStats = {};
    for (const p of realProducts) {
      const subcat = classifySubcategory(p, subcatList);
      p._subcat = subcat;
      subcatStats[subcat] = (subcatStats[subcat] || 0) + 1;
    }
    log('Répartition sous-catégories:');
    Object.entries(subcatStats).sort((a, b) => b[1] - a[1]).forEach(([sub, count]) => {
      log(`  ${sub}: ${count} (${Math.round(count / realProducts.length * 100)}%)`);
    });

    // Sauvegarder les sous-catégories dans Supabase (pas besoin d'IA pour ça)
    for (const p of realProducts) {
      if (p._subcat && p._subcat !== 'Autre') {
        await supabase.from('products_database')
          .update({ subcategory: p._subcat })
          .eq('id', p.id);
      }
    }
    log('Sous-catégories sauvegardées dans Supabase');

    // ETAPE 3 : Enrichissement IA (nom FR + description)
    log('\n--- Etape 3: Enrichissement IA Claude ---');
    let enriched = 0;

    for (let i = 0; i < realProducts.length; i += BATCH_SIZE) {
      const batch = realProducts.slice(i, i + BATCH_SIZE);
      const productsList = batch.map((p, idx) =>
        `${idx + 1}. "${p.name}" | Marque: ${p.brand || '?'} | Fabricant: ${p.manufacturer || '?'} | Sous-cat: ${p._subcat || '?'}`
      ).join('\n');

      try {
        const systemPrompt = category === 'Orthodontie'
          ? `Tu es un orthodontiste français expert. Tu traduis et enrichis des produits d'orthodontie pour un logiciel de gestion de cabinet. Sous-catégories possibles : ${ORTHO_SUBCATEGORIES.map(s => s.name).join(', ')}. Réponds UNIQUEMENT avec un JSON array.`
          : `Tu es un prothésiste dentaire français expert. Tu traduis et enrichis des produits de prothèse dentaire pour un logiciel de laboratoire. Sous-catégories possibles : ${PROSTH_SUBCATEGORIES.map(s => s.name).join(', ')}. Réponds UNIQUEMENT avec un JSON array.`;

        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 3000,
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: `Enrichis ces ${batch.length} produits en français.\n\n${productsList}\n\nPour chaque produit :\n{\n  "idx": 1,\n  "name_fr": "Nom français précis du produit",\n  "subcategory": "Sous-catégorie précise",\n  "description_fr": "Description 1-2 phrases en français pour un praticien",\n  "keywords": ["mot1","mot2","mot3","mot4","mot5"],\n  "usage": "Indication d'utilisation en 1 phrase"\n}\n\nJSON array strict :`
          }]
        });

        totalTokens += (msg.usage?.input_tokens || 0) + (msg.usage?.output_tokens || 0);
        const txt = msg.content[0]?.text || '';
        const match = txt.match(/\[[\s\S]*\]/);

        if (match) {
          const results = JSON.parse(match[0]);
          for (const result of results) {
            const product = batch[result.idx - 1];
            if (!product) continue;

            await supabase.from('products_database').update({
              name_fr: result.name_fr,
              subcategory: result.subcategory || product._subcat,
              metadata: {
                description_fr: result.description_fr,
                keywords_fr: result.keywords,
                usage_fr: result.usage,
                enriched_at: new Date().toISOString(),
                enriched_by: 'claude_haiku_ortho_prosth'
              }
            }).eq('id', product.id);

            enriched++;
          }
        }
      } catch (e) {
        log(`  Erreur batch ${i}: ${e.message}`);
        await new Promise(r => setTimeout(r, 5000));
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 800));

      if ((i / BATCH_SIZE) % 20 === 0 && i > 0) {
        log(`  Progress ${category}: ${enriched}/${realProducts.length} enrichis (${Math.round(i / realProducts.length * 100)}%)`);
      }
    }

    totalEnriched += enriched;
    log(`\n${category} terminé: ${enriched} enrichis, ${cleanedCount} nettoyés`);
  }

  const costEstimate = (totalTokens / 1000000 * 1.0).toFixed(2);
  log(`\n${'='.repeat(50)}`);
  log(`ENRICHISSEMENT TERMINÉ`);
  log(`  Enrichis: ${totalEnriched}`);
  log(`  Nettoyés (faux positifs): ${totalCleaned}`);
  log(`  Tokens utilisés: ${totalTokens} (~${costEstimate}$)`);
  log('='.repeat(50));
}

main().catch(e => { log('ERREUR FATALE: ' + e.message); process.exit(1); });
