#!/usr/bin/env node
// =============================================
// JADOMI — Enrichissement COMPLET toutes categories dentaires
// Passe 51 — Sous-categorisation + traduction FR + nettoyage
//
// Usage :
//   node scripts/enrich-all-dental.js [--limit 2000] [--category Implants]
//
// Traite TOUTES les categories :
//   Orthodontie, Prothese, Implants, Instruments, Chirurgie,
//   Endodontie, Parodontie, Composites, Empreintes, Equipement,
//   CFAO, Radiologie, Anesthesie, Hygiene, Sterilisation, Esthetique, Divers
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');

const LOG_FILE = '/tmp/passe-51-enrich-all.log';
const args = process.argv.slice(2);
const LIMIT_PER_CAT = parseInt((args.find(a => a.startsWith('--limit=')) || '--limit=2000').split('=')[1]);
const SINGLE_CAT = (args.find(a => a.startsWith('--category=')) || '').split('=')[1] || null;
const BATCH_SIZE = 15;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// ════════════════════════════════════════════
// SOUS-CATEGORIES PAR SPECIALITE
// ════════════════════════════════════════════
const ALL_SUBCATEGORIES = {
  'Orthodontie': [
    { name: 'Brackets', regex: /bracket|attache|slot\s*(0|\.)/i },
    { name: 'Arcs orthodontiques', regex: /archwire|arch\s*wire|wire.*ortho|niti\b|stainless.*wire|beta.*titanium/i },
    { name: 'Aligneurs', regex: /aligner|clear.*tray|invisible.*ortho|thermoform/i },
    { name: 'Bagues orthodontiques', regex: /\bband\b.*ortho|molar.*band|ortho.*band/i },
    { name: 'Elastiques', regex: /elastic|power\s*chain|ligature.*elastic|o-ring/i },
    { name: 'Fils et ligatures', regex: /ligature|tie.*wire|kobayashi/i },
    { name: 'Ciment orthodontique', regex: /cement.*ortho|bond.*ortho|adhesive.*ortho|primer.*ortho/i },
    { name: 'Mini-vis', regex: /mini.*screw|micro.*screw|tad\b|temporary.*anchor/i },
    { name: 'Tubes orthodontiques', regex: /\btube\b.*ortho|buccal.*tube|molar.*tube/i },
    { name: 'Appareils amovibles', regex: /expander|palatal|quad.*helix|hyrax|herbst|twin.*block|activator|retainer/i },
    { name: 'Instruments ortho', regex: /plier|pince|cutter.*ortho|weingart|distal.*end/i },
    { name: 'Auxiliaires ortho', regex: /button|cleat|hook|eyelet|crimpable|separator/i },
  ],
  'Prothese': [
    { name: 'Zircone', regex: /zircon|yttria|y-tzp|prettau|bruxzir/i },
    { name: 'Ceramique', regex: /ceramic|porcelain|feldspath|leucite|lithium.*disil|e\.max|emax|empress/i },
    { name: 'Resine dentaire', regex: /resin|acrylic|pmma|denture.*base|provisional|temporary.*crown/i },
    { name: 'Metal et alliages', regex: /alloy|cobalt.*chrom|nickel.*chrom|co-cr|ni-cr|gold.*alloy|palladium/i },
    { name: 'Cire dentaire', regex: /\bwax\b|pattern.*wax|casting.*wax|inlay.*wax|modelling/i },
    { name: 'Platre dentaire', regex: /plaster|gypsum|die.*stone|dental.*stone/i },
    { name: 'Articulateurs', regex: /articulator|facebow|face.*bow|mounting/i },
    { name: 'Dents artificielles', regex: /artificial.*tooth|denture.*tooth|prosthetic.*tooth/i },
    { name: 'Piliers implantaires', regex: /abutment|pilier|healing.*cap|scan.*body|analog/i },
    { name: 'Couronnes et bridges', regex: /crown|bridge|pontic|coping|framework|pfm/i },
    { name: 'Facettes et inlays', regex: /veneer|inlay|onlay|overlay|laminate/i },
    { name: 'Fours et equipement labo', regex: /furnace|oven|burnout|pressing|sintering|casting.*machine/i },
    { name: 'CAD/CAM prothese', regex: /cad.*cam|milling.*prosth|digital.*prosth|3d.*print/i },
  ],
  'Implants': [
    { name: 'Implants endo-osseux', regex: /implant.*endo|endo.*osseous|root.*form|screw.*type.*impl/i },
    { name: 'Vis de couverture', regex: /cover.*screw|healing.*screw|closure.*screw/i },
    { name: 'Piliers implantaires', regex: /abutment|pilier|transmucosal|multi.*unit|ti.*base/i },
    { name: 'Composants chirurgicaux', regex: /drill.*impl|osteotom|surgical.*guide|bone.*tap|impl.*driver|torque/i },
    { name: 'Membranes et greffes', regex: /membrane|collagen|bone.*graft|xenograft|allograft|bio.*oss|socket.*preserv/i },
    { name: 'Prothese sur implant', regex: /prosth.*implant|implant.*prosth|bar.*implant|overdenture|bridge.*impl/i },
    { name: 'Vis de cicatrisation', regex: /healing.*abutment|healing.*cap|gingiva.*former/i },
    { name: 'Kits et instruments implanto', regex: /implant.*kit|surgical.*kit|impl.*instrument|sinus.*lift/i },
  ],
  'Instruments': [
    { name: 'Turbines et contre-angles', regex: /handpiece|turbine|contra.*angle|slow.*speed|high.*speed|electric.*motor/i },
    { name: 'Fraises', regex: /\bbur\b|diamond|carbide|finishing|polishing.*bur|round.*bur|fissure/i },
    { name: 'Detartreurs', regex: /scaler|ultrasonic.*tip|piezo.*tip|magnetostrictive/i },
    { name: 'Curettes', regex: /curette|gracey|columbia|langer|mccall|universal.*cur/i },
    { name: 'Miroirs et sondes', regex: /mirror|sonde|explorer|probe|periodontal.*probe/i },
    { name: 'Precelles et pinces', regex: /tweezer|forcep|pince|cotton.*plier|college/i },
    { name: 'Spatules et fouloirs', regex: /spatula|plugger|condenser|carver|burnisher|hollenback/i },
    { name: 'Ciseaux et bistouris', regex: /scissor|scalpel|blade|bistouri|dissect/i },
    { name: 'Instruments rotatifs', regex: /mandrel|disc|strip.*polish|interproximal|finishing.*strip/i },
  ],
  'Chirurgie': [
    { name: 'Daviers', regex: /forcep.*extract|extraction.*forcep|davier|cowhorn|bayonet/i },
    { name: 'Elevateurs', regex: /elevator|luxat|syndesmotome|periosteal|coupland|cryer/i },
    { name: 'Bistouris et lames', regex: /scalpel|blade|surgical.*knife|lance|electrosurg/i },
    { name: 'Sutures', regex: /suture|fil.*resorbable|vicryl|silk.*suture|nylon.*suture|aiguille.*suture/i },
    { name: 'Hemostatiques', regex: /hemostat|collag.*sponge|surgicel|gelfoam|bone.*wax.*surg/i },
    { name: 'Instruments chirurgicaux', regex: /rongeur|rasp|file.*surg|retract|ecarteur|clamp/i },
    { name: 'Piezo-chirurgie', regex: /piezo.*surg|piezotome|ultrasonic.*surg/i },
    { name: 'Regeneration osseuse', regex: /bone.*graft|xenograft|allograft|bio.*oss|membrane.*surg|prp\b|prf\b/i },
  ],
  'Endodontie': [
    { name: 'Limes endodontiques', regex: /\bfile\b.*endo|endo.*file|k-file|h-file|hedstrom|protaper|reciproc|waveone|niti.*file/i },
    { name: 'Gutta percha', regex: /gutta|obturat.*point|master.*cone|accessor.*cone/i },
    { name: 'Ciments canalaires', regex: /sealer|root.*canal.*cem|endo.*sealer|ah.*plus|bioceramic.*seal/i },
    { name: 'Irrigation', regex: /irrigat|sodium.*hypochlorit|edta|chlorhexidine.*endo|needle.*irrig/i },
    { name: 'Localisateur apical', regex: /apex.*locat|apex.*finder|electronic.*apex/i },
    { name: 'Obturation', regex: /obturat|thermafil|backfill|warm.*vertical|system.*b\b/i },
    { name: 'Instruments endo rotatifs', regex: /rotary.*endo|endo.*motor|endo.*handpiece|torque.*control/i },
  ],
  'Parodontie': [
    { name: 'Curettes parodontales', regex: /gracey|columbia|langer|mccall|curette.*paro/i },
    { name: 'Detartrage', regex: /scaler.*paro|ultrasonic.*paro|piezo.*paro|insert.*paro/i },
    { name: 'Chirurgie parodontale', regex: /flap|lambeau|greffe.*gingiv|connective.*tissue|free.*gingiv/i },
    { name: 'Regeneration parodontale', regex: /membrane.*paro|emdogain|amelogenin|gtr\b|gbr\b/i },
    { name: 'Sondes parodontales', regex: /probe.*paro|paro.*probe|pocket.*depth|perio.*chart/i },
    { name: 'Laser parodontal', regex: /laser.*paro|diode.*paro|er:yag|nd:yag/i },
  ],
  'Composites': [
    { name: 'Composite anterieur', regex: /composite.*anter|anter.*composite|estheti.*composite|nano.*fill/i },
    { name: 'Composite posterieur', regex: /composite.*poster|poster.*composite|packable|bulk.*fill/i },
    { name: 'Composite flow', regex: /flow|flowable|injectable.*compos/i },
    { name: 'Adhesifs', regex: /adhesive|bonding|primer|etch.*rinse|self.*etch|universal.*bond/i },
    { name: 'Mordancage', regex: /etch|phosphoric|acid.*etch|gel.*etch/i },
    { name: 'Verre ionomere', regex: /glass.*ionomer|gic\b|verre.*ionomere|fuji|ketac/i },
    { name: 'Compomeres', regex: /compomer|dyract|glasiosite/i },
  ],
  'Empreintes': [
    { name: 'Alginate', regex: /alginate|irreversible.*hydrocolloid/i },
    { name: 'Silicone addition', regex: /addition.*silicone|pvs|vinyl.*polysiloxane|polyvinyl/i },
    { name: 'Silicone condensation', regex: /condensation.*silicone|c-silicone/i },
    { name: 'Polyether', regex: /polyether|impregum/i },
    { name: 'Porte-empreintes', regex: /tray.*impression|impression.*tray|porte.*empreinte|stock.*tray|custom.*tray/i },
    { name: 'Scanner intra-oral', regex: /intraoral.*scan|ios\b|trios|itero|primescan|medit/i },
  ],
  'Equipement': [
    { name: 'Fauteuils dentaires', regex: /chair|dental.*unit|unit.*chair|patient.*chair/i },
    { name: 'Lampes a polymeriser', regex: /curing.*light|led.*cur|polymeriz.*light|light.*cure/i },
    { name: 'Aspiration', regex: /suction|aspirat|saliva.*eject|evacuator|hve\b|lve\b/i },
    { name: 'Compresseurs', regex: /compressor|air.*supply|dental.*air/i },
    { name: 'Eclairage', regex: /operating.*light|dental.*light|scialyt|led.*lamp/i },
    { name: 'Lasers dentaires', regex: /laser.*dent|diode.*laser|er:yag|co2.*laser/i },
    { name: 'Photographie dentaire', regex: /camera.*dent|photo.*dent|dental.*photo|intraoral.*cam/i },
  ],
  'CFAO': [
    { name: 'Scanners intra-oraux', regex: /intraoral.*scan|scanner.*intra|trios|itero|primescan|medit.*scan/i },
    { name: 'Scanners de laboratoire', regex: /lab.*scan|desktop.*scan|model.*scan|3shape/i },
    { name: 'Usineuses', regex: /milling.*mach|cnc.*dent|dental.*mill|vhf\b|imes.*icore|roland.*dent/i },
    { name: 'Imprimantes 3D', regex: /3d.*print|print.*3d|sla\b|dlp\b|formlabs|asiga|nextdent/i },
    { name: 'Logiciels CFAO', regex: /software|logiciel|exocad|3shape.*design|dental.*design|cad.*software/i },
    { name: 'Materiaux CFAO', regex: /disc.*mill|block.*cad|milling.*blank|zirconia.*disc|pmma.*disc|wax.*disc/i },
  ],
  'Radiologie': [
    { name: 'Capteurs numeriques', regex: /sensor|capteur|digital.*radiograph|rvg\b|cmos.*sensor/i },
    { name: 'Panoramiques', regex: /panoram|opg\b|orthopantom/i },
    { name: 'Cone beam (CBCT)', regex: /cbct|cone.*beam|3d.*radiograph|tomograph/i },
    { name: 'Films et phosphores', regex: /film.*radio|phosphor.*plate|psp\b|imaging.*plate/i },
    { name: 'Tabliers et protection', regex: /apron|lead.*protect|thyroid.*collar|radiation.*protect/i },
  ],
  'Anesthesie': [
    { name: 'Carpules', regex: /carpule|cartridge|anesthetic.*sol|lidocaine|articaine|mepivacaine|prilocaine/i },
    { name: 'Seringues', regex: /syringe.*anesth|dental.*syringe|aspirating.*syringe/i },
    { name: 'Aiguilles', regex: /needle.*anesth|dental.*needle|27g|30g|gauge.*needle/i },
    { name: 'Anesthesie electronique', regex: /calaject|sleeper|wand\b|sta\b|computer.*anesth/i },
    { name: 'Anesthesie topique', regex: /topical.*anesth|benzocaine|surface.*anesth|spray.*anesth/i },
  ],
  'Hygiene': [
    { name: 'Prophylaxie', regex: /prophyl|prophy.*paste|polish.*paste|prophy.*cup|rubber.*cup/i },
    { name: 'Fluorures', regex: /fluoride|fluor|varnish.*fluor|gel.*fluor|rinse.*fluor/i },
    { name: 'Scellants', regex: /sealant|scellant|fissure.*seal|pit.*seal/i },
    { name: 'Brossage', regex: /toothbrush|brosse.*dent|interdental|brossette|fil.*dentaire|floss/i },
    { name: 'Detartrage', regex: /scaling|detart|polishing/i },
  ],
  'Sterilisation': [
    { name: 'Autoclaves', regex: /autoclave|steriliz|steam.*steril|class.*b\b|class.*s\b/i },
    { name: 'Desinfection', regex: /disinfect|desinfect|glutaraldehyde|surface.*clean/i },
    { name: 'Sachets et emballage', regex: /pouch|sachet|sterilization.*bag|indicator.*strip|indicator.*tape/i },
    { name: 'Nettoyage instruments', regex: /ultrasonic.*clean|washer.*disinfect|instrument.*clean/i },
    { name: 'Tests de sterilisation', regex: /biological.*indicator|spore.*test|bowie.*dick|helix.*test/i },
  ],
  'Esthetique': [
    { name: 'Blanchiment', regex: /whiten|bleach|peroxide|blanchiment/i },
    { name: 'Facettes esthetiques', regex: /veneer.*esthet|cosmetic.*veneer|minimal.*prep/i },
  ],
};

// Faux positifs
const FALSE_POSITIVES = /ultrasound(?!.*dental)|mri\b|cardiac|hearing\s*aid|spinal|knee\s*joint|hip\s*joint|shoulder|ankle|ophthal|retinal|cochlear|pacemaker|stent\b(?!.*dental)|catheter(?!.*dental)|dialysis|ventilat|insulin|glucose\s*monitor|blood\s*pressure|ecg\b|eeg\b|laparoscop|arthroscop(?!.*tmj)|surgical\s*gown|n95/i;

function classifySubcategory(product, subcatList) {
  const text = [product.name, product.brand, product.manufacturer].filter(Boolean).join(' ');
  for (const sub of subcatList) {
    if (sub.regex.test(text)) return sub.name;
  }
  return null;
}

function isFalsePositive(product) {
  const text = [product.name, product.brand].filter(Boolean).join(' ');
  return FALSE_POSITIVES.test(text);
}

async function main() {
  log('╔══════════════════════════════════════════════════╗');
  log('║  JADOMI — Enrichissement COMPLET dental         ║');
  log(`║  Limit/cat: ${LIMIT_PER_CAT} | Cat: ${SINGLE_CAT || 'TOUTES'}            ║`);
  log('╚══════════════════════════════════════════════════╝');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const categoriesToProcess = SINGLE_CAT ? [SINGLE_CAT] : Object.keys(ALL_SUBCATEGORIES);
  let grandTotalEnriched = 0;
  let grandTotalCleaned = 0;
  let grandTotalTokens = 0;

  for (const category of categoriesToProcess) {
    const subcatList = ALL_SUBCATEGORIES[category];
    if (!subcatList) { log(`Categorie inconnue: ${category}`); continue; }

    log(`\n${'═'.repeat(50)}`);
    log(`CATEGORIE : ${category}`);
    log('═'.repeat(50));

    // Recuperer produits non enrichis
    const { data: products, error } = await supabase.from('products_database')
      .select('id, gtin, name, brand, manufacturer, gmdn_code')
      .eq('category', category)
      .is('name_fr', null)
      .limit(LIMIT_PER_CAT);

    if (error) { log('ERREUR: ' + error.message); continue; }
    if (!products?.length) { log('Aucun produit a enrichir'); continue; }
    log(`${products.length} produits a traiter`);

    // Nettoyage
    let cleaned = 0;
    const realProducts = [];
    for (const p of products) {
      if (isFalsePositive(p)) {
        await supabase.from('products_database')
          .update({ category: 'Divers', name_fr: '[NON DENTAL]' })
          .eq('id', p.id);
        cleaned++;
      } else {
        const subcat = classifySubcategory(p, subcatList);
        p._subcat = subcat;
        realProducts.push(p);
      }
    }
    if (cleaned > 0) log(`${cleaned} faux positifs nettoyes`);
    grandTotalCleaned += cleaned;

    // Sous-categorisation
    const subcatStats = {};
    for (const p of realProducts) {
      const sc = p._subcat || 'Autre';
      subcatStats[sc] = (subcatStats[sc] || 0) + 1;
      if (p._subcat) {
        await supabase.from('products_database')
          .update({ subcategory: p._subcat })
          .eq('id', p.id);
      }
    }
    log('Sous-categories:');
    Object.entries(subcatStats).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => log(`  ${s}: ${c}`));

    // Enrichissement IA
    let enriched = 0;
    const expertRole = {
      'Orthodontie': 'orthodontiste',
      'Prothese': 'prothesiste dentaire',
      'Implants': 'implantologue',
      'Instruments': 'chirurgien-dentiste omnipraticien',
      'Chirurgie': 'chirurgien oral',
      'Endodontie': 'endodontiste',
      'Parodontie': 'parodontiste',
      'Composites': 'dentiste restaurateur',
      'Empreintes': 'dentiste praticien',
      'Equipement': 'dentiste praticien',
      'CFAO': 'specialiste CFAO dentaire',
      'Radiologie': 'radiologue dentaire',
      'Anesthesie': 'dentiste praticien',
      'Hygiene': 'hygieniste dentaire',
      'Sterilisation': 'assistant dentaire',
      'Esthetique': 'dentiste esthetique',
    };

    for (let i = 0; i < realProducts.length; i += BATCH_SIZE) {
      const batch = realProducts.slice(i, i + BATCH_SIZE);
      const list = batch.map((p, idx) =>
        `${idx + 1}. "${p.name}" | ${p.brand || '?'} | ${p.manufacturer || '?'} | ${p._subcat || '?'}`
      ).join('\n');

      try {
        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 3000,
          system: `Tu es un ${expertRole[category] || 'dentiste'} francais expert. Traduis et enrichis ces produits de ${category.toLowerCase()} pour un logiciel de gestion de cabinet dentaire francais. Reponds UNIQUEMENT avec un JSON array.`,
          messages: [{
            role: 'user',
            content: `Enrichis ces ${batch.length} produits en francais.\n\n${list}\n\nPour chaque :\n{"idx":1,"name_fr":"Nom francais precis","subcategory":"Sous-categorie","keywords":["mot1","mot2","mot3"],"usage":"1 phrase utilisation"}\n\nJSON array :`
          }]
        });

        grandTotalTokens += (msg.usage?.input_tokens || 0) + (msg.usage?.output_tokens || 0);
        const txt = msg.content[0]?.text || '';
        const match = txt.match(/\[[\s\S]*\]/);
        if (match) {
          const results = JSON.parse(match[0]);
          for (const r of results) {
            const p = batch[r.idx - 1];
            if (!p) continue;
            await supabase.from('products_database').update({
              name_fr: r.name_fr,
              subcategory: r.subcategory || p._subcat,
              metadata: { keywords_fr: r.keywords, usage_fr: r.usage, enriched_at: new Date().toISOString() }
            }).eq('id', p.id);
            enriched++;
          }
        }
      } catch (e) {
        log(`  Erreur batch ${i}: ${e.message}`);
        await new Promise(r => setTimeout(r, 5000));
      }

      await new Promise(r => setTimeout(r, 800));
      if ((i / BATCH_SIZE) % 20 === 0 && i > 0) {
        log(`  ${category}: ${enriched}/${realProducts.length} (${Math.round(i / realProducts.length * 100)}%)`);
      }
    }

    grandTotalEnriched += enriched;
    log(`${category} : ${enriched} enrichis`);
  }

  const cost = (grandTotalTokens / 1000000 * 1.0).toFixed(2);
  log(`\n${'═'.repeat(50)}`);
  log(`ENRICHISSEMENT COMPLET TERMINE`);
  log(`  Total enrichis: ${grandTotalEnriched}`);
  log(`  Total nettoyes: ${grandTotalCleaned}`);
  log(`  Tokens: ${grandTotalTokens} (~${cost}$)`);
  log('═'.repeat(50));
}

main().catch(e => { log('ERREUR FATALE: ' + e.message); process.exit(1); });
