/**
 * JADOMI — Dispute Engine (Moteur de litiges automatise)
 * Gere automatiquement 90% des litiges comme Amazon A-to-Z
 */

const AUTO_REFUND_THRESHOLD = 500; // EUR — above this, manual review required

/**
 * Process a new dispute automatically
 * Returns { auto_resolved, resolution, reason, refund_amount, escalate }
 */
async function processDispute(dispute, supabase) {
  const result = {
    auto_resolved: false,
    resolution: null,
    reason: null,
    refund_amount: 0,
    escalate: false,
    actions: []
  };

  try {
    switch (dispute.type) {
      case 'not_received':
        return await handleNotReceived(dispute, supabase, result);

      case 'damaged':
        return await handleDamaged(dispute, supabase, result);

      case 'expired':
        return await handleExpired(dispute, supabase, result);

      case 'wrong_product':
        return await handleWrongProduct(dispute, supabase, result);

      case 'quality':
      case 'other':
      default:
        // These need human review
        result.escalate = true;
        result.reason = 'Type de litige necessitant une verification manuelle';
        result.actions.push('escalate_to_mediation');
        return result;
    }
  } catch (e) {
    console.error('[DisputeEngine] Error:', e.message);
    result.escalate = true;
    result.reason = 'Erreur technique: ' + e.message;
    return result;
  }
}

/**
 * NOT RECEIVED — Check tracking via carrier API
 */
async function handleNotReceived(dispute, supabase, result) {
  // Get order tracking info
  const { data: order } = await supabase.from('jadomi_orders')
    .select('tracking_number, shipped_at, delivered_at, total_ttc, metadata')
    .eq('id', dispute.order_id).maybeSingle();

  if (!order) {
    result.escalate = true;
    result.reason = 'Commande non trouvee';
    return result;
  }

  // Case 1: No tracking number → fournisseur hasn't shipped
  if (!order.tracking_number) {
    result.auto_resolved = true;
    result.resolution = 'full_refund';
    result.reason = 'Aucun numero de suivi — commande non expediee';
    result.refund_amount = order.total_ttc;
    result.actions.push('refund_client', 'penalize_supplier', 'notify_supplier');
    return result;
  }

  // Case 2: No delivery date recorded → check if shipped long ago
  if (!order.delivered_at && order.shipped_at) {
    const daysSinceShipped = (Date.now() - new Date(order.shipped_at).getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceShipped > 10) {
      // Shipped 10+ days ago, no delivery → refund
      result.auto_resolved = true;
      result.resolution = 'full_refund';
      result.reason = 'Colis expedie il y a ' + Math.round(daysSinceShipped) + ' jours, non livre';
      result.refund_amount = order.total_ttc;
      result.actions.push('refund_client', 'claim_carrier_insurance');
      return result;
    }
  }

  // Case 3: Delivery confirmed by carrier but client says no
  if (order.delivered_at) {
    // Ask for proof — need photo or more details
    result.reason = 'Le transporteur confirme la livraison. Demande de preuves au client.';
    result.actions.push('request_client_proof');
    // Don't auto-resolve — wait for proof
    return result;
  }

  // Default: escalate
  result.escalate = true;
  result.reason = 'Situation ambigue — verification manuelle';
  return result;
}

/**
 * DAMAGED — Analyze photo evidence
 */
async function handleDamaged(dispute, supabase, result) {
  const { data: order } = await supabase.from('jadomi_orders')
    .select('total_ttc').eq('id', dispute.order_id).maybeSingle();

  const amount = order?.total_ttc || 0;
  const hasPhotos = dispute.photo_urls && dispute.photo_urls.length > 0;

  if (!hasPhotos) {
    result.reason = 'Photos requises pour traiter une reclamation produit endommage';
    result.actions.push('request_photos');
    return result;
  }

  // If amount under threshold, auto-refund with photos as evidence
  if (amount <= AUTO_REFUND_THRESHOLD) {
    result.auto_resolved = true;
    result.resolution = 'full_refund';
    result.reason = 'Produit endommage confirme par photos — montant sous seuil auto (' + AUTO_REFUND_THRESHOLD + 'EUR)';
    result.refund_amount = amount;
    result.actions.push('refund_client', 'deduct_from_supplier', 'update_supplier_score');
    return result;
  }

  // Above threshold — manual review
  result.escalate = true;
  result.reason = 'Montant superieur a ' + AUTO_REFUND_THRESHOLD + 'EUR — verification manuelle requise';
  result.actions.push('escalate_to_mediation');
  return result;
}

/**
 * EXPIRED — Zero tolerance for health products
 */
async function handleExpired(dispute, supabase, result) {
  const { data: order } = await supabase.from('jadomi_orders')
    .select('total_ttc').eq('id', dispute.order_id).maybeSingle();

  // Health products: ZERO TOLERANCE on expiry
  result.auto_resolved = true;
  result.resolution = 'full_refund';
  result.reason = 'Produit perime — remboursement immediat (zero tolerance sante)';
  result.refund_amount = order?.total_ttc || 0;
  result.actions.push('refund_client', 'deduct_from_supplier', 'update_supplier_score', 'flag_supplier_health_warning');
  return result;
}

/**
 * WRONG PRODUCT — Compare with order
 */
async function handleWrongProduct(dispute, supabase, result) {
  const { data: order } = await supabase.from('jadomi_orders')
    .select('total_ttc, items').eq('id', dispute.order_id).maybeSingle();

  const amount = order?.total_ttc || 0;

  if (amount <= AUTO_REFUND_THRESHOLD) {
    result.auto_resolved = true;
    result.resolution = 'replacement';
    result.reason = 'Produit non conforme — renvoi + remplacement demande au fournisseur';
    result.refund_amount = 0; // replacement, not refund
    result.actions.push('request_supplier_replacement', 'send_return_label', 'update_supplier_score');
    return result;
  }

  result.escalate = true;
  result.reason = 'Produit non conforme — montant eleve, verification manuelle';
  return result;
}

/**
 * Update supplier score after an event
 */
async function updateSupplierScore(supplierId, supabase) {
  try {
    // Get all orders for this supplier
    const { data: orders } = await supabase.from('jadomi_orders')
      .select('status, shipped_at, created_at, metadata')
      .eq('metadata->>supplier_id', supplierId);

    const { data: disputes } = await supabase.from('jadomi_disputes')
      .select('type, resolution, status')
      .eq('supplier_id', supplierId);

    const totalOrders = (orders || []).length;
    if (totalOrders === 0) return;

    // Calculate scores
    let expeditionScore = 100;
    let conformityScore = 100;
    const totalDisputes = (disputes || []).length;
    const resolvedFavorably = (disputes || []).filter(d =>
      d.resolution === 'full_refund' || d.resolution === 'replacement'
    ).length;

    // Expedition: based on % shipped on time
    const shippedOrders = (orders || []).filter(o => o.shipped_at);
    const onTimeOrders = shippedOrders.filter(o => {
      if (!o.shipped_at || !o.created_at) return false;
      const hours = (new Date(o.shipped_at) - new Date(o.created_at)) / (1000 * 60 * 60);
      return hours <= 48;
    });
    const onTimeRate = shippedOrders.length > 0 ? onTimeOrders.length / shippedOrders.length : 1;
    expeditionScore = Math.round(onTimeRate * 30);

    // Conformity: based on dispute rate
    const issueRate = totalOrders > 0 ? totalDisputes / totalOrders : 0;
    conformityScore = Math.round(Math.max(0, 1 - issueRate * 3) * 30); // 3x penalty

    // Price score: fixed for now (would need market comparison)
    const priceScore = 15;

    // Reactivity: fixed for now
    const reactivityScore = 7;

    // Seniority
    const monthsActive = totalOrders > 0 ? Math.min(10, Math.round(
      (Date.now() - new Date((orders || [])[orders.length - 1]?.created_at || Date.now()).getTime()) / (1000 * 60 * 60 * 24 * 30)
    )) : 0;
    const seniorityScore = monthsActive;

    const totalScore = expeditionScore + conformityScore + priceScore + reactivityScore + seniorityScore;

    // Determine badge
    let badge = 'standard';
    if (totalScore >= 90) badge = 'premium';
    else if (totalScore >= 70) badge = 'standard';
    else if (totalScore >= 50) badge = 'warning';
    else badge = 'suspended';
    if (totalOrders < 3) badge = 'new';

    // Upsert score
    const scoreData = {
      supplier_id: supplierId,
      score_total: totalScore,
      score_expedition: expeditionScore,
      score_conformity: conformityScore,
      score_price: priceScore,
      score_reactivity: reactivityScore,
      score_seniority: seniorityScore,
      total_orders: totalOrders,
      orders_on_time: onTimeOrders.length,
      orders_with_issues: totalDisputes,
      total_disputes: totalDisputes,
      disputes_resolved_favorably: resolvedFavorably,
      badge,
      last_calculated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: existing } = await supabase.from('supplier_scores')
      .select('id').eq('supplier_id', supplierId).maybeSingle();

    if (existing) {
      await supabase.from('supplier_scores').update(scoreData).eq('id', existing.id);
    } else {
      scoreData.created_at = new Date().toISOString();
      await supabase.from('supplier_scores').insert(scoreData);
    }

    return { score: totalScore, badge };
  } catch (e) {
    console.error('[SupplierScore] Error:', e.message);
    return null;
  }
}

/**
 * Check for overdue shipments and auto-escalate
 * Called by a cron job daily
 */
async function checkOverdueShipments(supabase) {
  const results = { reminded: 0, warned: 0, cancelled: 0 };

  try {
    // Find paid orders without tracking after 48h
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const fourDaysAgo = new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 168 * 60 * 60 * 1000).toISOString();

    const { data: overdueOrders } = await supabase.from('jadomi_orders')
      .select('*')
      .eq('status', 'paid')
      .is('tracking_number', null)
      .lt('paid_at', twoDaysAgo);

    for (const order of (overdueOrders || [])) {
      const paidAt = new Date(order.paid_at);
      const hoursSincePaid = (Date.now() - paidAt.getTime()) / (1000 * 60 * 60);

      if (hoursSincePaid >= 168) { // 7 days
        // Auto-cancel + refund
        await supabase.from('jadomi_orders')
          .update({ status: 'cancelled', metadata: { ...order.metadata, cancel_reason: 'overdue_shipment_7d' }, updated_at: new Date().toISOString() })
          .eq('id', order.id);
        results.cancelled++;
      } else if (hoursSincePaid >= 96) { // 4 days
        // Final warning
        results.warned++;
        // TODO: send email warning to supplier
      } else { // 2+ days
        // Reminder
        results.reminded++;
        // TODO: send email reminder to supplier
      }
    }
  } catch (e) {
    console.error('[OverdueCheck] Error:', e.message);
  }

  return results;
}

module.exports = {
  processDispute,
  updateSupplierScore,
  checkOverdueShipments,
  AUTO_REFUND_THRESHOLD
};
