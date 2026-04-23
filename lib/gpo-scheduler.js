// =============================================
// JADOMI — GPO Scheduler : gestion des timeouts
// =============================================
const { pickNextSupplier, computeDeadline, admin } = require('./gpo-queue');
const { sendSupplierOfferEmail } = require('./emails/supplier-offer');

/**
 * Trouve les tentatives en timeout et passe au suivant.
 * Execute toutes les 60 secondes.
 */
async function processExpiredAttempts() {
  try {
    const now = new Date().toISOString();

    const { data: expired, error } = await admin()
      .from('gpo_request_attempts')
      .select('*, gpo_requests(*)')
      .eq('response_status', 'pending')
      .lt('deadline_at', now);

    if (error) {
      console.error('[GPO Scheduler] Query error:', error.message);
      return;
    }
    if (!expired || expired.length === 0) return;

    console.log(`[GPO Scheduler] ${expired.length} tentative(s) expiree(s)`);

    for (const attempt of expired) {
      try {
        // Marquer comme timeout
        await admin()
          .from('gpo_request_attempts')
          .update({ response_status: 'timeout', responded_at: now })
          .eq('id', attempt.id);

        // Incrementer stats fournisseur
        await admin().rpc('increment_field', {
          table_name: 'suppliers',
          row_id: attempt.supplier_id,
          field_name: 'orders_timeout',
          increment_by: 1
        }).catch(() => {
          // Fallback si RPC pas disponible
          admin()
            .from('suppliers')
            .select('orders_timeout')
            .eq('id', attempt.supplier_id)
            .single()
            .then(({ data }) => {
              if (data) {
                admin()
                  .from('suppliers')
                  .update({ orders_timeout: (data.orders_timeout || 0) + 1 })
                  .eq('id', attempt.supplier_id)
                  .then(() => {});
              }
            });
        });

        // Passer au fournisseur suivant
        await escalateToNextSupplier(attempt.request_id);
      } catch (e) {
        console.error(`[GPO Scheduler] Erreur traitement attempt ${attempt.id}:`, e.message);
      }
    }
  } catch (e) {
    console.error('[GPO Scheduler] processExpiredAttempts error:', e.message);
  }
}

async function escalateToNextSupplier(requestId) {
  const { data: request } = await admin()
    .from('gpo_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (!request || request.status === 'accepted' || request.status === 'fulfilled' || request.status === 'cancelled') {
    return;
  }

  // Recuperer tous les fournisseurs deja tentes
  const { data: attempts } = await admin()
    .from('gpo_request_attempts')
    .select('supplier_id, attempt_position')
    .eq('request_id', requestId);

  const alreadyAttempted = (attempts || []).map(a => a.supplier_id);
  const nextPosition = attempts && attempts.length > 0
    ? Math.max(...attempts.map(a => a.attempt_position)) + 1
    : 1;

  // Recuperer la societe pour coordonnees
  const { data: societe } = await admin()
    .from('societes')
    .select('lat, lng')
    .eq('id', request.societe_id)
    .single();

  // Picker le suivant
  const items = Array.isArray(request.items) ? request.items : [];
  const itemsCategories = [...new Set(items.map(i => i.category).filter(Boolean))];

  const nextSupplier = await pickNextSupplier({
    requestId,
    itemsCategories,
    preferLocal: request.prefer_local,
    societeLat: societe?.lat,
    societeLng: societe?.lng,
    alreadyAttempted
  });

  if (!nextSupplier) {
    // Plus de fournisseurs disponibles
    await admin()
      .from('gpo_requests')
      .update({ status: 'failed' })
      .eq('id', requestId);
    console.log(`[GPO Scheduler] Request ${requestId} FAILED — plus de fournisseurs`);
    return;
  }

  // Creer la prochaine tentative
  const { deadline, delayMinutes } = computeDeadline();
  const { data: newAttempt, error } = await admin()
    .from('gpo_request_attempts')
    .insert({
      request_id: requestId,
      supplier_id: nextSupplier.id,
      attempt_position: nextPosition,
      deadline_at: deadline.toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error(`[GPO Scheduler] Insert attempt error:`, error.message);
    return;
  }

  // Envoyer email au nouveau fournisseur
  await sendSupplierOfferEmail({
    supplier: nextSupplier,
    attempt: newAttempt,
    request,
    delayMinutes
  });

  console.log(`[GPO Scheduler] Request ${requestId} → escalade a ${nextSupplier.name} (position ${nextPosition})`);
}

// Lancer le scheduler au require
let _interval = null;
function startScheduler() {
  if (_interval) return;
  _interval = setInterval(processExpiredAttempts, 60000);
  _interval.unref(); // Ne pas empecher le process de quitter
  console.log('[GPO Scheduler] Demarre — polling toutes les 60s');
}

startScheduler();

module.exports = { processExpiredAttempts, escalateToNextSupplier };
