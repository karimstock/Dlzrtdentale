#!/usr/bin/env node
// =============================================
// JADOMI — Purge immédiate des 20 décisions Judilibre
// Mail reçu le 12 juin 2026 — anomalies signalées
// Exécuter : node scripts/judilibre-purge-20260612.js
// =============================================

require('dotenv').config({ path: '/home/ubuntu/jadomi/.env' });
const { purgeAndRefresh } = require('../lib/legal-providers/judilibre-sync');

// Les 20 décisions listées dans le mail Judilibre du 12 juin 2026
// Format : numéro RG tel que dans le mail
const DECISIONS_A_PURGER = [
  '22/00702',
  '20/11567',
  '22/06280',   // Note mail: aussi référencé 23/06280
  '23/06280',   // Variante possible
  '22/10194',
  '22/11503',
  '23/01373',
  '23/06162',
  '23/11016',
  '23/12325',
  '20/01351',
  '16/03622',
  '14/00113',
  '17/16657',
  '23/16499',
  '24/04213',
  '22/04654',
  '22/10788',
  '22/06693',
  '24/01708',
  '24/00486'
];

// Judilibre utilise des IDs internes, pas les RG directement.
// On purge d'abord par external_id correspondant, puis on tente
// aussi le format sans slash (ex: 2200702)
function generateIdVariants(rg) {
  const variants = [rg];
  // Sans slash
  variants.push(rg.replace('/', ''));
  // Avec tiret
  variants.push(rg.replace('/', '-'));
  return variants;
}

async function main() {
  console.log('=== Purge Judilibre — Mail 12 juin 2026 ===');
  console.log(`${DECISIONS_A_PURGER.length} décisions à purger\n`);

  // Générer toutes les variantes d'ID possibles
  const allIds = [];
  for (const rg of DECISIONS_A_PURGER) {
    allIds.push(...generateIdVariants(rg));
  }

  // Dédupliquer
  const uniqueIds = [...new Set(allIds)];
  console.log(`${uniqueIds.length} IDs (avec variantes) à vérifier\n`);

  const report = await purgeAndRefresh(uniqueIds);

  console.log('\n=== RAPPORT FINAL ===');
  console.log(`Purgées du cache : ${report.deleted}`);
  console.log(`Rafraîchies       : ${report.refreshed}`);
  console.log(`Erreurs           : ${report.errors}`);
  console.log('\nDétails :');
  for (const d of report.details) {
    if (d.status === 'refreshed') {
      console.log(`  ✓ ${d.id} → ${d.title}`);
    } else if (d.status === 'deleted_only') {
      console.log(`  - ${d.id} (purgé, ${d.reason || d.error || 'non trouvé sur API'})`);
    } else if (d.status === 'error') {
      console.log(`  ✗ ${d.id} ERREUR: ${d.error}`);
    }
  }

  // Aussi lancer une sync des dernières 72h pour être conforme
  console.log('\n=== Sync transactionalHistory 72h ===');
  const { syncJudilibre } = require('../lib/legal-providers/judilibre-sync');
  const syncReport = await syncJudilibre(72);
  console.log(`Transactions trouvées : ${syncReport.total}`);
  console.log(`MAJ: ${syncReport.updated}, Supprimées: ${syncReport.deleted}, Créées: ${syncReport.created}, Erreurs: ${syncReport.errors}`);
}

main()
  .then(() => {
    console.log('\nTerminé avec succès.');
    process.exit(0);
  })
  .catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
  });
