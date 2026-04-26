#!/usr/bin/env node
// =============================================
// JADOMI — Seed OEM / White Label Equivalences
//
// Base de connaissance des fabricants OEM chinois (et coréens)
// qui fournissent le dentaire mondial en marque blanche.
//
// Quand JADOMI scanne un produit d'une marque occidentale,
// il peut détecter que c'est le MÊME produit qu'une autre marque
// fabriqué dans la MÊME usine → le dentiste sait qu'il paie
// un packaging, pas un produit différent.
//
// Sources : sites fabricants, Alibaba, Made-in-China, salons dentaires
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

// ═══════════════════════════════════════
// BASE DE CONNAISSANCE OEM DENTAIRE
// ═══════════════════════════════════════

const OEM_MANUFACTURERS = [

  // ═══ ENDODONTIE — FABRICANTS CHINOIS DIRECTS (pas du white label, vrais fabricants) ═══
  // Tous basés à Shenzhen/Chengdu, se concurrencent entre eux
  // Certains vendent en propre ET font de l'OEM pour distributeurs EU
  {
    oem: 'Shenzhen Superline Technology (SLT) / NIC Dental',
    country: 'CN',
    city: 'Shenzhen',
    speciality: 'Endodontie',
    products: 'Limes NiTi rotatives, limes manuelles, arcs orthodontiques',
    capacity: '20M+ limes/an, 70+ pays',
    certifications: 'CE, ISO 13485, FDA 510(k)',
    known_brands: ['NIC', 'Superline'],
    oem_for: ['ACCESS / Reverso (GACD) — CONFIRMÉ', 'Distributeurs EU marque propre', 'Nombreux rebranding'],
    western_equivalents: [
      { western: 'Reverso Silver/Blue (GACD/ACCESS)', oem_type: 'NiTi reciprocating file', note: 'Reverso = fabriqué par NIC (lisible sur emballage)' },
      { western: 'Limes Protaper-like distributeur', oem_type: 'NiTi rotary file taper .04-.06', note: 'Format universel NiTi' },
      { western: 'Limes reciprocating distributeur', oem_type: 'Reciprocating NiTi', note: 'Clone WaveOne format' },
    ]
  },

  {
    oem: 'Shenzhen Perfect Medical Instruments (Dental Perfect)',
    country: 'CN',
    city: 'Shenzhen + Shanwei',
    speciality: 'Endodontie',
    products: 'Limes NiTi rotatives (TF, Blue, Gold), arcs ortho, moteurs endo',
    capacity: 'Fabricant direct (fondé 2009), usine propre',
    certifications: 'CE 0197, ISO 13485',
    known_brands: ['Perfect', 'Dental Perfect'],
    oem_for: [],
    note: 'FABRICANT DIRECT — concurrent de NIC. Marque propre, usine propre à Shenzhen+Shanwei. Pas du OEM. Vendu en France par Medistock (exclusivité sur certains produits) et autres distributeurs.',
    western_equivalents: [
      { western: 'Limes NiTi type Protaper', oem_type: 'NiTi rotary taper variable', note: 'Perfect = alternative directe, fabrication propre, MÊME qualité NiTi, prix très inférieur' },
      { western: 'Limes NiTi type Reciproc', oem_type: 'Reciprocating NiTi', note: 'Perfect fait son propre système réciproque, concurrent direct VDW' },
    ]
  },

  {
    oem: 'Chengdu SANI Medical Equipment',
    country: 'CN',
    city: 'Chengdu',
    speciality: 'Endodontie',
    products: 'Limes endo, moteurs endo, localisateurs apex',
    capacity: 'Fabricant direct',
    certifications: 'CE, ISO 13485',
    known_brands: ['SANI', 'CK Dental'],
    oem_for: [],
    western_equivalents: []
  },

  {
    oem: 'Shenzhen Denco Medical',
    country: 'CN',
    city: 'Shenzhen',
    speciality: 'Endodontie',
    products: 'Limes inox et NiTi, instruments endo complets',
    certifications: 'CE, ISO',
    known_brands: ['Dencodent'],
    oem_for: ['Distributeurs EU'],
    western_equivalents: []
  },

  {
    oem: 'Rogin Dental (Chine)',
    country: 'CN',
    city: 'Chine',
    speciality: 'Endodontie',
    products: 'Limes rotatives NiTi, instruments endo',
    certifications: 'CE, ISO',
    known_brands: ['Rogin'],
    oem_for: ['OEM pour marques distributeurs'],
    western_equivalents: []
  },

  {
    oem: 'Belident (Chine)',
    country: 'CN',
    city: 'Chine',
    speciality: 'Endodontie',
    products: 'Limes rotatives, réciproques, moteurs endo',
    certifications: 'CE',
    known_brands: ['Belident'],
    oem_for: [],
    western_equivalents: []
  },

  {
    oem: 'Siven Dental (Chine)',
    country: 'CN',
    city: 'Chine',
    speciality: 'Endodontie',
    products: 'Limes NiTi, pointes gutta, instruments endo',
    certifications: 'CE, ISO 13485',
    known_brands: ['Siven'],
    oem_for: ['OEM pour distributeurs'],
    western_equivalents: []
  },

  // ═══ ENDODONTIE — DISTRIBUTEURS EU QUI REBRANDED ═══
  {
    oem: 'ACCESS (distribué par GACD)',
    country: 'FR',
    city: 'France',
    speciality: 'Endodontie',
    products: 'Reverso Silver, Reverso Blue, Prefile — limes NiTi réciproques',
    certifications: 'CE',
    known_brands: ['ACCESS', 'Reverso'],
    oem_for: [],
    note: 'Marque propre GACD. Fabriqué par NIC/SLT Shenzhen (info emballage). Limes NiTi réciproques.',
    oem_source: 'NIC / Shenzhen Superline Technology',
    western_equivalents: [
      { western: 'Reverso Silver/Blue (GACD/ACCESS)', oem_type: 'NiTi reciprocating file', note: 'CONFIRMÉ : sort de chez NIC (SLT Shenzhen). Même usine que les limes NIC vendues sous leur propre marque.' },
    ]
  },

  // ═══ INSTRUMENTS ROTATIFS ═══
  {
    oem: 'Ningbo Sinyuan Bur & Tool Co.',
    country: 'CN',
    city: 'Ningbo',
    speciality: 'Instruments',
    products: 'Fraises dentaires carbure et diamant (10 000+ refs)',
    capacity: '500M+ fraises/an',
    certifications: 'CE, ISO',
    known_brands: ['Supérieur qualité OEM pour distributeurs EU'],
    western_equivalents: [
      { western: 'Fraises Komet-like', oem_type: 'Carbide bur FG', note: 'Même specs ISO' },
      { western: 'Fraises diamant distributeur', oem_type: 'Diamond bur FG', note: 'Souvent même usine Ningbo' },
    ]
  },

  // ═══ COMPOSITES & MATÉRIAUX ═══
  {
    oem: 'Shandong HUGE Dental Material',
    country: 'CN',
    city: 'Shandong',
    speciality: 'Composites',
    products: 'Résines composites, ciments, matériaux empreinte, résines prothèse',
    capacity: 'Un des plus gros fabricants dentaires CN',
    certifications: 'CE, FDA, ISO 13485',
    known_brands: ['HUGE Dental'],
    western_equivalents: [
      { western: 'Composites distributeur marque propre', oem_type: 'Nano-hybrid composite', note: 'OEM pour distributeurs' },
    ]
  },

  {
    oem: 'Shanghai Double-White Dental',
    country: 'CN',
    city: 'Shanghai',
    speciality: 'Hygiene',
    products: 'Kits blanchiment, gels peroxyde, gouttières, lampes',
    certifications: 'CE, FDA',
    known_brands: ['Cinoll', 'Double-White'],
    western_equivalents: [
      { western: 'Kits blanchiment marque blanche', oem_type: 'Whitening kit', note: 'Leader OEM mondial blanchiment' },
    ]
  },

  // ═══ ÉQUIPEMENT ═══
  {
    oem: 'Foshan Gladent Medical / Foshan Joinchamp',
    country: 'CN',
    city: 'Foshan',
    speciality: 'Equipement',
    products: 'Units dentaires, fauteuils, compresseurs, autoclaves',
    certifications: 'CE, ISO',
    known_brands: ['Gladent', 'Joinchamp'],
    western_equivalents: [
      { western: 'Units entrée de gamme distributeurs', oem_type: 'Dental chair unit', note: 'Beaucoup de marques EU sourcing Foshan' },
    ]
  },

  {
    oem: 'Guilin Woodpecker Medical',
    country: 'CN',
    city: 'Guilin',
    speciality: 'Instruments',
    products: 'Détartreurs ultrasons, lampes à polymériser, localisateurs apex, caméras',
    capacity: 'Leader mondial détartreurs piezo',
    certifications: 'CE, FDA, ISO 13485',
    known_brands: ['Woodpecker'],
    western_equivalents: [
      { western: 'Détartreurs piezo marque distributeur', oem_type: 'Ultrasonic scaler', note: 'Woodpecker = OEM de nombreuses marques' },
      { western: 'Lampes à polymériser budget', oem_type: 'LED curing light', note: 'OEM Woodpecker fréquent' },
    ]
  },

  {
    oem: 'COXO Medical Instrument (Foshan)',
    country: 'CN',
    city: 'Foshan',
    speciality: 'Instruments',
    products: 'Micromoteurs, contre-angles, turbines, pièces à main',
    certifications: 'CE, FDA, ISO',
    known_brands: ['COXO', 'YUSENDENT'],
    western_equivalents: [
      { western: 'Contre-angles entrée de gamme', oem_type: 'Contra-angle handpiece', note: 'OEM pour marques budget' },
    ]
  },

  // ═══ RADIOLOGIE ═══
  {
    oem: 'LargeV Instrument Corp (Beijing)',
    country: 'CN',
    city: 'Beijing',
    speciality: 'Radiologie',
    products: 'Capteurs intra-oraux, panoramiques, CBCT',
    certifications: 'CE, FDA',
    known_brands: ['LargeV', 'Smart3D'],
    western_equivalents: []
  },

  // ═══ IMPLANTS ═══
  {
    oem: 'ZDI (Zhuhai Dental Implant)',
    country: 'CN',
    city: 'Zhuhai',
    speciality: 'Implants',
    products: 'Implants titane grade 4/5, piliers, vis',
    certifications: 'CE',
    known_brands: ['ZDI'],
    western_equivalents: []
  },

  {
    oem: 'Shenzhen Biaokang Medical',
    country: 'CN',
    city: 'Shenzhen',
    speciality: 'Implants',
    products: 'Implants compatible Nobel/Straumann/Osstem',
    certifications: 'CE, ISO',
    known_brands: ['Biaokang', 'compatible implants'],
    western_equivalents: [
      { western: 'Implants compatibles multi-systèmes', oem_type: 'Compatible implant', note: 'Connectiques identiques aux grandes marques' },
    ]
  },

  // ═══ CORÉENS (gros OEM aussi) ═══
  {
    oem: 'DIO Implant (Corée)',
    country: 'KR',
    city: 'Busan',
    speciality: 'Implants',
    products: 'Implants, piliers, kits chirurgicaux',
    certifications: 'CE, FDA, KFDA',
    known_brands: ['DIO'],
    western_equivalents: []
  },

  // ═══ STÉRILISATION ═══
  {
    oem: 'Foshan Gladent / Runyes Medical',
    country: 'CN',
    city: 'Foshan/Ningbo',
    speciality: 'Sterilisation',
    products: 'Autoclaves classe B/N, thermo-désinfecteurs',
    certifications: 'CE, ISO',
    known_brands: ['Runyes', 'Getidy', 'Woson'],
    western_equivalents: [
      { western: 'Autoclaves budget distributeur', oem_type: 'Class B autoclave', note: 'Même usine, différentes marques' },
    ]
  },

  // ═══ PROTHÈSE / CFAO ═══
  {
    oem: 'Bloomden Bioceramics (Hunan)',
    country: 'CN',
    city: 'Changsha',
    speciality: 'CFAO',
    products: 'Disques zircone, blocs PMMA, blocs cire',
    capacity: 'Leader mondial zircone dentaire',
    certifications: 'CE, FDA, ISO',
    known_brands: ['Bloomden', 'ST Zirconia'],
    western_equivalents: [
      { western: 'Disques zircone distributeur (non-Vita)', oem_type: 'Zirconia disc', note: 'Bloomden = OEM pour de nombreuses marques EU/US' },
    ]
  },

  {
    oem: 'Chengdu Besmile Medical Technology',
    country: 'CN',
    city: 'Chengdu',
    speciality: 'CFAO',
    products: 'Disques zircone multicouche, blocs hybrides',
    certifications: 'CE, FDA',
    known_brands: ['Besmile'],
    western_equivalents: []
  },
];

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  JADOMI — Seed OEM / White Label Knowledge Base  ║');
  console.log(`║  ${OEM_MANUFACTURERS.length} fabricants OEM référencés                  ║`);
  console.log('╚══════════════════════════════════════════════════╝');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Stocker la base OEM dans products_database avec source='oem_knowledge'
  let inserted = 0;
  for (const oem of OEM_MANUFACTURERS) {
    // Créer une entrée pour le fabricant OEM lui-même
    const gtin = `OEM-${oem.country}-${oem.oem.substring(0,8).replace(/[^A-Za-z0-9]/g,'').toUpperCase()}`;
    try {
      await supabase.from('products_database').upsert({
        gtin: gtin.substring(0, 14),
        name: `${oem.oem} (OEM)`,
        name_fr: `Fabricant OEM : ${oem.oem}`,
        brand: oem.known_brands[0] || oem.oem.split(' ')[0],
        manufacturer: oem.oem,
        category: oem.speciality,
        market_region: oem.country,
        source: 'oem_knowledge',
        source_metadata: {
          type: 'oem_manufacturer',
          city: oem.city,
          country: oem.country,
          capacity: oem.capacity || null,
          certifications: oem.certifications,
          known_brands: oem.known_brands,
          western_equivalents: oem.western_equivalents,
          products_description: oem.products
        },
        confidence_score: 0.95,
        last_synced_at: new Date().toISOString()
      }, { onConflict: 'gtin', ignoreDuplicates: true });
      inserted++;
    } catch (e) {}
  }

  console.log(`\n${inserted} fabricants OEM insérés dans products_database`);
  console.log('\nFabricants par pays :');
  const byCountry = {};
  OEM_MANUFACTURERS.forEach(o => { byCountry[o.country] = (byCountry[o.country] || 0) + 1; });
  Object.entries(byCountry).forEach(([c, n]) => console.log(`  ${c}: ${n}`));

  console.log('\nPar spécialité :');
  const bySpec = {};
  OEM_MANUFACTURERS.forEach(o => { bySpec[o.speciality] = (bySpec[o.speciality] || 0) + 1; });
  Object.entries(bySpec).sort((a,b) => b[1]-a[1]).forEach(([s, n]) => console.log(`  ${s}: ${n}`));

  console.log('\nÉquivalences connues :');
  let totalEquiv = 0;
  OEM_MANUFACTURERS.forEach(o => {
    if (o.western_equivalents?.length) {
      o.western_equivalents.forEach(e => {
        console.log(`  ${e.western} ←→ ${oem.oem} (${e.oem_type})`);
        totalEquiv++;
      });
    }
  });
  console.log(`\nTotal : ${totalEquiv} équivalences documentées`);
  console.log('Celles-ci seront enrichies au fil des scans (détection automatique par GTIN/ref).');
}

main().catch(e => console.error('ERREUR:', e.message));
