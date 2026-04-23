#!/usr/bin/env node
// =============================================
// JADOMI — Seed base fournisseurs dentaires
// Usage: node scripts/seed-suppliers-dental.js
// =============================================
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis dans .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const seedSuppliers = [
  { name: 'DPI Dental', email: 'commandes@dpi-dental.com', specialties: ['Hygiene', 'Gants', 'Consommables'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'GACD', email: 'contact@gacd.fr', specialties: ['Mobilier', 'Equipement'], city: 'Lyon', region: 'Auvergne-Rhone-Alpes' },
  { name: 'Mega Dental', email: 'contact@megadental.fr', specialties: ['Consommables', 'Composites'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'Henry Schein France', email: 'fr-contact@henryschein.com', specialties: ['Toutes'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'Septodont', email: 'france@septodont.com', specialties: ['Anesthesie', 'Endodontie'], city: 'Saint-Maur-des-Fosses', region: 'Ile-de-France' },
  { name: 'VOCO France', email: 'contact@voco.fr', specialties: ['Composites', 'Ciments'], city: 'Paris', region: 'Ile-de-France' },
  { name: '3M ESPE France', email: 'oralcare.fr@mmm.com', specialties: ['Composites', 'Adhesifs'], city: 'Cergy', region: 'Ile-de-France' },
  { name: 'Dentsply Sirona France', email: 'france@dentsplysirona.com', specialties: ['Toutes'], city: 'Maisons-Alfort', region: 'Ile-de-France' },
  { name: 'Ivoclar Vivadent France', email: 'info.fr@ivoclarvivadent.com', specialties: ['Protheses', 'Ceramiques'], city: 'Saint-Jorioz', region: 'Auvergne-Rhone-Alpes' },
  { name: 'Acteon Group', email: 'contact@acteongroup.com', specialties: ['Equipement', 'Imagerie'], city: 'Merignac', region: 'Nouvelle-Aquitaine' },
  { name: 'Kulzer France', email: 'france@kulzer.com', specialties: ['Composites', 'Protheses'], city: 'Hanau', region: 'Ile-de-France' },
  { name: 'GC France', email: 'info@gc.dental', specialties: ['Composites', 'Ciments', 'Adhesifs'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'Komet France', email: 'info@komet.fr', specialties: ['Fraises', 'Instruments'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'NSK France', email: 'france@nsk.com', specialties: ['Equipement', 'Turbines'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'W&H France', email: 'office.fr@wh.com', specialties: ['Equipement', 'Sterilisation'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'Cattani France', email: 'france@cattani.com', specialties: ['Aspiration', 'Compresseurs'], city: 'Lyon', region: 'Auvergne-Rhone-Alpes' },
  { name: 'Bien-Air Dental', email: 'dental@bienair.com', specialties: ['Turbines', 'Instruments'], city: 'Bienne', region: 'Ile-de-France' },
  { name: 'Planmeca France', email: 'france@planmeca.com', specialties: ['Imagerie', 'Fauteuils'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'Carestream Dental FR', email: 'france@csdental.com', specialties: ['Imagerie', 'Logiciels'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'Straumann France', email: 'france@straumann.com', specialties: ['Implants', 'Regeneration'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'Nobel Biocare FR', email: 'france@nobelbiocare.com', specialties: ['Implants', 'Protheses'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'Zimmer Biomet Dental', email: 'dental.france@zimmerbiomet.com', specialties: ['Implants'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'Osstem France', email: 'france@osstem.com', specialties: ['Implants'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'BioHorizons France', email: 'france@biohorizons.com', specialties: ['Implants', 'Regeneration'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'Coltene France', email: 'france@coltene.com', specialties: ['Consommables', 'Endodontie'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'Ultradent France', email: 'france@ultradent.com', specialties: ['Blanchiment', 'Composites'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'Kerr Dental France', email: 'france@kerrdental.com', specialties: ['Composites', 'Empreintes'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'Zhermack France', email: 'france@zhermack.com', specialties: ['Empreintes', 'Alginates'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'Dental Express', email: 'contact@dentalexpress.fr', specialties: ['Consommables', 'Hygiene'], city: 'Marseille', region: 'Provence-Alpes-Cote d\'Azur' },
  { name: 'Orsing Dental', email: 'contact@orsing.com', specialties: ['Instruments', 'Consommables'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'Prodont Holliger', email: 'contact@prodontholliger.com', specialties: ['Instruments', 'Consommables'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'Anthogyr', email: 'contact@anthogyr.com', specialties: ['Implants', 'Instruments'], city: 'Sallanches', region: 'Auvergne-Rhone-Alpes' },
  { name: 'Swident', email: 'contact@swident.fr', specialties: ['Consommables', 'Hygiene'], city: 'Toulouse', region: 'Occitanie' },
  { name: 'Dental Central', email: 'contact@dentalcentral.fr', specialties: ['Consommables', 'Composites'], city: 'Bordeaux', region: 'Nouvelle-Aquitaine' },
  { name: 'Promodentaire', email: 'contact@promodentaire.com', specialties: ['Consommables', 'Hygiene', 'Gants'], city: 'Nantes', region: 'Pays de la Loire' },
  { name: 'Medistock Dental', email: 'contact@medistock-dental.fr', specialties: ['Consommables', 'Sterilisation'], city: 'Strasbourg', region: 'Grand Est' },
  { name: 'Dental Flex', email: 'contact@dentalflex.fr', specialties: ['Instruments', 'Consommables'], city: 'Lille', region: 'Hauts-de-France' },
  { name: 'Dentalis', email: 'contact@dentalis.fr', specialties: ['Equipement', 'Mobilier'], city: 'Rennes', region: 'Bretagne' },
  { name: 'Euro Dental Supplies', email: 'contact@eurodentalsupplies.fr', specialties: ['Consommables'], city: 'Nice', region: 'Provence-Alpes-Cote d\'Azur' },
  { name: 'Smile Dental Supply', email: 'contact@smiledental.fr', specialties: ['Consommables', 'Blanchiment'], city: 'Montpellier', region: 'Occitanie' },
  { name: 'Dental Axess France', email: 'france@dentalaxess.com', specialties: ['Implants'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'BTI France', email: 'france@bti.com', specialties: ['Implants', 'Regeneration'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'MIS Implants France', email: 'france@mis-implants.com', specialties: ['Implants'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'Southern Implants FR', email: 'france@southernimplants.com', specialties: ['Implants'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'Omnia France', email: 'france@omniaspa.com', specialties: ['Consommables', 'Sterilisation', 'Hygiene'], city: 'Lyon', region: 'Auvergne-Rhone-Alpes' },
  { name: 'Hu-Friedy France', email: 'france@hu-friedy.com', specialties: ['Instruments', 'Sterilisation'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'Mectron France', email: 'france@mectron.com', specialties: ['Equipement', 'Chirurgie'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'Tokuyama France', email: 'france@tokuyama-dental.com', specialties: ['Composites', 'Adhesifs'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'Suni Medical', email: 'contact@sunimedical.com', specialties: ['Imagerie', 'Capteurs'], city: 'Paris', region: 'Ile-de-France' },
  { name: 'DentalEvolution', email: 'contact@dentalevolution.fr', specialties: ['Toutes'], city: 'Paris', region: 'Ile-de-France' }
];

(async () => {
  let inserted = 0;
  let skipped = 0;

  for (const s of seedSuppliers) {
    // Check doublon par email
    if (s.email) {
      const { data: existing } = await supabase
        .from('suppliers')
        .select('id')
        .eq('email', s.email)
        .maybeSingle();
      if (existing) { skipped++; continue; }
    }

    const { error } = await supabase.from('suppliers').insert({
      ...s,
      status: 'extracted',
      source: 'public_base',
      subscription_tier: 'bronze',
      slots_count: 1
    });

    if (error) {
      console.warn('Skip', s.name, ':', error.message);
      skipped++;
    } else {
      inserted++;
    }
  }

  console.log(`\n=== Seed termine ===`);
  console.log(`${inserted} fournisseurs inseres`);
  console.log(`${skipped} ignores (doublons ou erreurs)`);
  console.log(`Total dans la liste : ${seedSuppliers.length}`);
  process.exit(0);
})();
