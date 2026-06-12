// =============================================
// JADOMI — Synchronisation Judilibre
// Vérifie les modifications via /transactionalHistory
// et met à jour le cache legal_data_cache
// Conforme aux CGU Judilibre (article V, 72h max)
// =============================================

const { createClient } = require('@supabase/supabase-js');
const judilibre = require('./judilibre');

let _admin = null;
function admin() {
  if (!_admin) {
    _admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

/**
 * Synchronise le cache local avec les modifications Judilibre.
 * @param {number} hoursBack - Nombre d'heures en arrière (défaut 24)
 * @returns {Object} Rapport de sync { updated, deleted, errors, total }
 */
async function syncJudilibre(hoursBack = 24) {
  const sinceDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  const report = { updated: 0, deleted: 0, created: 0, errors: 0, total: 0, details: [] };

  console.log(`[judilibre-sync] Démarrage sync depuis ${sinceDate.toISOString()}`);

  let transactions;
  try {
    transactions = await judilibre.getAllTransactionalHistory(sinceDate);
  } catch (err) {
    console.error('[judilibre-sync] Erreur récupération historique:', err.message);
    report.errors++;
    report.details.push({ error: 'fetch_history', message: err.message });
    return report;
  }

  report.total = transactions.length;
  console.log(`[judilibre-sync] ${transactions.length} transactions trouvées`);

  if (!transactions.length) return report;

  for (const tx of transactions) {
    try {
      if (tx.action === 'deleted') {
        // Supprimer du cache
        const { error } = await admin().from('legal_data_cache')
          .delete()
          .eq('source', 'judilibre')
          .eq('external_id', tx.id);

        if (error) throw error;
        report.deleted++;
        report.details.push({ action: 'deleted', id: tx.id });

      } else if (tx.action === 'updated' || tx.action === 'created') {
        // Vérifier si on a cette décision en cache
        const { data: cached } = await admin().from('legal_data_cache')
          .select('id')
          .eq('source', 'judilibre')
          .eq('external_id', tx.id)
          .single();

        if (cached || tx.action === 'updated') {
          // Re-fetch la décision depuis Judilibre
          try {
            const decision = await judilibre.getDecision(tx.id);

            const row = {
              source: 'judilibre',
              external_id: tx.id,
              titre: decision.title || decision.titre || decision.numero || tx.id,
              contenu_extrait: JSON.stringify(decision).substring(0, 5000),
              metadata: {
                date: decision.date || decision.dateDecision || null,
                type: decision.type || decision.nature || null,
                source_url: decision.url || null,
                last_sync: new Date().toISOString(),
                sync_action: tx.action
              },
              updated_at: new Date().toISOString()
            };

            const { error } = await admin().from('legal_data_cache')
              .upsert(row, { onConflict: 'source,external_id' });

            if (error) throw error;

            if (tx.action === 'updated') report.updated++;
            else report.created++;

            report.details.push({ action: tx.action, id: tx.id, title: row.titre });
          } catch (fetchErr) {
            // Décision peut ne plus exister
            console.warn(`[judilibre-sync] Erreur fetch décision ${tx.id}:`, fetchErr.message);
            report.errors++;
            report.details.push({ action: tx.action, id: tx.id, error: fetchErr.message });
          }
        }
      }
    } catch (err) {
      console.error(`[judilibre-sync] Erreur traitement ${tx.id}:`, err.message);
      report.errors++;
      report.details.push({ action: tx.action, id: tx.id, error: err.message });
    }
  }

  console.log(`[judilibre-sync] Terminé — ${report.updated} MAJ, ${report.deleted} supprimées, ${report.created} créées, ${report.errors} erreurs`);

  // Logger l'appel API
  try {
    await admin().from('legal_api_calls').insert({
      provider: 'judilibre',
      endpoint: 'transactionalHistory/sync',
      status_code: 200,
      response_ms: 0
    });
  } catch {} // non-critique

  return report;
}

/**
 * Purge et re-fetch une liste de décisions spécifiques du cache.
 * @param {string[]} decisionIds - Liste des IDs de décision à rafraîchir
 * @returns {Object} Rapport { refreshed, deleted, errors }
 */
async function purgeAndRefresh(decisionIds) {
  const report = { refreshed: 0, deleted: 0, errors: 0, details: [] };

  console.log(`[judilibre-sync] Purge de ${decisionIds.length} décisions`);

  for (const id of decisionIds) {
    try {
      // Supprimer l'ancien cache
      await admin().from('legal_data_cache')
        .delete()
        .eq('source', 'judilibre')
        .eq('external_id', id);

      report.deleted++;

      // Re-fetch depuis Judilibre
      try {
        const decision = await judilibre.getDecision(id);

        if (decision && (decision.title || decision.titre || decision.numero)) {
          const row = {
            source: 'judilibre',
            external_id: id,
            titre: decision.title || decision.titre || decision.numero || id,
            contenu_extrait: JSON.stringify(decision).substring(0, 5000),
            metadata: {
              date: decision.date || decision.dateDecision || null,
              type: decision.type || decision.nature || null,
              source_url: decision.url || null,
              last_sync: new Date().toISOString(),
              sync_action: 'purge_refresh'
            }
          };

          await admin().from('legal_data_cache')
            .upsert(row, { onConflict: 'source,external_id' });

          report.refreshed++;
          report.details.push({ id, status: 'refreshed', title: row.titre });
        } else {
          report.details.push({ id, status: 'deleted_only', reason: 'décision introuvable' });
        }
      } catch (fetchErr) {
        // La décision n'existe peut-être plus ou le format d'ID diffère
        report.details.push({ id, status: 'deleted_only', error: fetchErr.message });
      }
    } catch (err) {
      console.error(`[judilibre-sync] Erreur purge ${id}:`, err.message);
      report.errors++;
      report.details.push({ id, status: 'error', error: err.message });
    }
  }

  console.log(`[judilibre-sync] Purge terminée — ${report.refreshed} rafraîchies, ${report.deleted} purgées, ${report.errors} erreurs`);
  return report;
}

// === Exécution standalone (appelé par PM2 cron) ===
if (require.main === module) {
  require('dotenv').config({ path: '/home/ubuntu/jadomi/.env' });
  console.log('[judilibre-sync] Exécution cron standalone');

  syncJudilibre(24)
    .then(report => {
      console.log('[judilibre-sync] Rapport:', JSON.stringify(report, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error('[judilibre-sync] FATAL:', err);
      process.exit(1);
    });
}

module.exports = { syncJudilibre, purgeAndRefresh };
