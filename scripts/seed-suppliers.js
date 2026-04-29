#!/usr/bin/env node
// =============================================
// JADOMI — Seed annuaire fournisseurs dentaires FR
// Passe 51 — Enrichissement IA par metier
//
// Usage : node scripts/seed-suppliers.js
// Prereq : SQL scan/suppliers_directory.sql execute
// =============================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');

const LOG_FILE = '/tmp/passe-51-seed-suppliers.log';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// Fournisseurs à enrichir par métier
const SUPPLIERS_BY_SECTOR = {
  'Distributeurs généraux FR': [
    'Henry Schein France', 'GACD', 'Mega Dental', 'Dental Express',
    'Dental Hi Tec', 'OralCare', 'Promodentaire', 'Medidental',
    'Labocast', 'Techno Dent'
  ],
  'Fabricants internationaux': [
    'Dentsply Sirona', 'Ivoclar Vivadent', 'GC Europe', '3M Oral Care',
    'Kerr Dental', 'Ultradent Products', 'Septodont', 'VOCO',
    'Kulzer', 'DMG', 'Coltene', 'SDI', 'Tokuyama', 'Shofu', 'Kuraray Noritake'
  ],
  'Orthodontie': [
    'Ormco', 'American Orthodontics', '3M Unitek', 'Forestadent',
    'RMO', 'Ortho Technology', 'TP Orthodontics', 'Leone',
    'Ortholution', 'DynaFlex', 'Align Technology', 'Invisalign',
    'Angelalign', 'ClearCorrect'
  ],
  'Implantologie': [
    'Straumann', 'Nobel Biocare', 'Zimmer Biomet', 'Osstem',
    'MIS Implants', 'Anthogyr', 'Bego Implants', 'BioHorizons',
    'Neodent', 'BTI', 'Global D', 'TBR Implants',
    'Implant Direct', 'Dentium', 'Megagen'
  ],
  'Prothèse et labo': [
    'Zirkonzahn', 'Amann Girrbach', 'Ivoclar Digital', 'Vita Zahnfabrik',
    'Zubler', 'Renfert', 'Yeti Dental', 'Schmitz Zander',
    'Dental Direkt', 'Pritidenta', 'Wieland Dental',
    'Zhermack', 'Kettenbach', 'Coltene Whaledent'
  ],
  'CFAO numérique': [
    '3Shape', 'Medit', 'Planmeca', 'Align Technology iTero',
    'Dentsply Sirona Primescan', 'Carestream Dental',
    'Formlabs', 'SprintRay', 'Asiga', 'NextDent',
    'VHF', 'Imes-Icore', 'Roland DG Dental', 'Amann Girrbach'
  ],
  'Équipement cabinet': [
    'KaVo Kerr', 'Planmeca', 'Bien-Air', 'W&H', 'NSK',
    'Sirona', 'Castellini', 'Stern Weber', 'Anthos',
    'Mectron', 'Satelec Acteon', 'EMS', 'Durr Dental',
    'Cattani', 'Metasys'
  ],
  'Endodontie': [
    'VDW (Dentsply)', 'Maillefer (Dentsply)', 'FKG Dentaire',
    'Coltene HyFlex', 'Produits Dentaires SA', 'Micro-Mega',
    'EdgeEndo', 'Brasseler', 'SybronEndo', 'Ultradent'
  ],
  'Hygiène et stérilisation': [
    'Hu-Friedy (Cantel)', 'LM-Instruments', 'American Eagle',
    'W&H Lisa', 'Melag', 'SciCan', 'Tuttnauer', 'Mocom',
    'Durr Dental Hygiene', 'Pierre Fabre Oral Care'
  ],
  'Radiologie': [
    'Carestream Dental', 'Planmeca ProMax', 'Vatech',
    'Acteon Satelec', 'Dentsply Sirona Orthophos', 'KaVo OP3D',
    'Durr Dental VistaScan', 'Air Techniques', 'Owandy',
    'MyRay (Cefla)'
  ]
};

async function main() {
  log('╔══════════════════════════════════════════════╗');
  log('║  JADOMI — Seed annuaire fournisseurs FR     ║');
  log('╚══════════════════════════════════════════════╝');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY || !process.env.ANTHROPIC_API_KEY) {
    log('ERREUR: SUPABASE_URL, SUPABASE_SERVICE_KEY et ANTHROPIC_API_KEY requis');
    process.exit(1);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let totalEnriched = 0;
  let totalTokens = 0;

  for (const [sector, suppliers] of Object.entries(SUPPLIERS_BY_SECTOR)) {
    log(`\n=== ${sector} (${suppliers.length} fournisseurs) ===`);

    // Batch de 5 fournisseurs par appel IA
    for (let i = 0; i < suppliers.length; i += 5) {
      const batch = suppliers.slice(i, i + 5);
      const list = batch.map((s, idx) => `${idx + 1}. ${s}`).join('\n');

      try {
        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          system: `Tu es un expert du marché de la distribution dentaire et médicale en France et en Europe. Tu connais tous les acteurs du secteur, leurs spécialités, leurs marques distribuées, leur couverture géographique, et leurs conditions commerciales générales.`,
          messages: [{
            role: 'user',
            content: `Enrichis ces fournisseurs du secteur "${sector}" avec un maximum d'infos utiles pour un logiciel de gestion de cabinet dentaire.

${list}

Pour chaque, JSON dans un array :
{
  "idx": 1,
  "name": "Nom officiel",
  "legal_name": "Raison sociale ou null",
  "supplier_type": "distributor|manufacturer|groupement",
  "website": "URL exacte",
  "phone": "telephone France ou null",
  "country": "FR|DE|CH|...",
  "city": "ville siege",
  "specialties": ["orthodontie","prothèse","implants","omnipratique","labo","cfao","endodontie","parodontie","hygiène","radiologie","équipement"],
  "brands_distributed": ["Marque1","Marque2"],
  "sectors": ["dentaire","medical","labo"],
  "coverage_national": true/false,
  "delivery_days": 1-5,
  "description": "2-3 phrases utiles pour un dentiste"
}

JSON array strict :`
          }]
        });

        totalTokens += (msg.usage?.input_tokens || 0) + (msg.usage?.output_tokens || 0);
        const txt = msg.content[0]?.text || '';
        const match = txt.match(/\[[\s\S]*\]/);

        if (match) {
          const results = JSON.parse(match[0]);
          for (const r of results) {
            const supplierName = r.name || batch[r.idx - 1];
            const normalized = supplierName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '');

            try {
              await supabase.from('suppliers_directory').upsert({
                name: supplierName,
                name_normalized: normalized,
                legal_name: r.legal_name || null,
                supplier_type: r.supplier_type || 'distributor',
                website: r.website || null,
                phone: r.phone || null,
                country: r.country || 'FR',
                city: r.city || null,
                specialties: r.specialties || [],
                brands_distributed: r.brands_distributed || [],
                sectors: r.sectors || ['dentaire'],
                coverage_national: r.coverage_national || false,
                delivery_days: r.delivery_days || null,
                source: 'ia_enriched',
                enriched_at: new Date().toISOString(),
                enriched_by: 'claude_haiku',
                metadata: { description: r.description, sector }
              }, { onConflict: 'name', ignoreDuplicates: false });
              totalEnriched++;
              log(`  + ${supplierName} (${r.supplier_type})`);
            } catch (e) {
              log(`  ! ${supplierName}: ${e.message}`);
            }
          }
        }
      } catch (e) {
        log(`  ERREUR batch: ${e.message}`);
        await new Promise(r => setTimeout(r, 5000));
      }

      await new Promise(r => setTimeout(r, 1000));
    }
  }

  const cost = (totalTokens / 1000000 * 1.0).toFixed(2);
  log(`\n${'='.repeat(50)}`);
  log(`SEED FOURNISSEURS TERMINÉ`);
  log(`  Enrichis: ${totalEnriched}`);
  log(`  Tokens: ${totalTokens} (~${cost}$)`);
  log('='.repeat(50));
}

main().catch(e => { log('ERREUR: ' + e.message); process.exit(1); });
