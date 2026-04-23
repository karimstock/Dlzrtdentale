// =============================================
// JADOMI — Actions groupage (trigger / expire)
// =============================================
const { pickNextSupplier, computeDeadline } = require('../../lib/gpo-queue');
const { sendSupplierOfferEmail } = require('../../lib/emails/supplier-offer');
const { sendMail } = require('../multiSocietes/mailer');

const PUBLIC_URL = process.env.JADOMI_PUBLIC_URL || 'https://jadomi.fr';

/**
 * Declenche une campagne de groupage :
 * 1. Agregue tous les items
 * 2. Cree une gpo_request avec le panier volumineux
 * 3. Lance le Queue Auction normal
 * 4. Notifie tous les participants
 */
async function triggerCampaign(admin, campaignId) {
  try {
    const { data: campaign } = await admin()
      .from('group_purchase_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (!campaign || campaign.status !== 'collecting') return;

    // Marquer comme triggered
    await admin()
      .from('group_purchase_campaigns')
      .update({ status: 'triggered', triggered_at: new Date().toISOString() })
      .eq('id', campaignId);

    // Recuperer tous les items actifs
    const { data: participants } = await admin()
      .from('group_purchase_items')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('status', 'active');

    if (!participants || participants.length === 0) return;

    // Agreger les items
    const allItems = [];
    let totalVolume = 0;
    for (const p of participants) {
      const items = Array.isArray(p.items) ? p.items : [];
      for (const item of items) {
        allItems.push({ ...item, societe_id: p.societe_id });
        totalVolume += (item.quantity || 1) * (item.unit_price_eur || item.target_price_eur || 17);
      }
    }

    // Creer une gpo_request agrege
    const { isBusinessHours, deadline, delayMinutes } = computeDeadline();
    const { data: request, error } = await admin()
      .from('gpo_requests')
      .insert({
        societe_id: campaign.created_by_societe_id || participants[0].societe_id,
        items: allItems,
        total_target_eur: totalVolume * 0.85,
        total_market_eur: totalVolume,
        savings_eur: totalVolume * 0.15,
        status: 'searching',
        prefer_local: true,
        created_during_business_hours: isBusinessHours
      })
      .select()
      .single();

    if (error) {
      console.error('[Groupage triggerCampaign] gpo_request insert error:', error.message);
      return;
    }

    // Selectionner le 1er fournisseur via Queue Auction
    const categories = [...new Set(allItems.map(i => i.category).filter(Boolean))];
    const firstSupplier = await pickNextSupplier({
      requestId: request.id,
      itemsCategories: categories.length > 0 ? categories : ['Dentaire'],
      preferLocal: true,
      alreadyAttempted: []
    });

    if (firstSupplier) {
      const { data: attempt } = await admin()
        .from('gpo_request_attempts')
        .insert({
          request_id: request.id,
          supplier_id: firstSupplier.id,
          attempt_position: 1,
          deadline_at: deadline.toISOString()
        })
        .select()
        .single();

      if (attempt) {
        sendSupplierOfferEmail({
          supplier: firstSupplier,
          attempt,
          request: { ...request, items: allItems },
          delayMinutes
        }).catch(e => console.error('[Groupage] Supplier email error:', e.message));
      }
    }

    // Notifier tous les participants
    for (const p of participants) {
      try {
        const { data: societe } = await admin()
          .from('societes')
          .select('owner_user_id')
          .eq('id', p.societe_id)
          .single();

        if (societe?.owner_user_id) {
          const { data: user } = await admin().auth.admin.getUserById(societe.owner_user_id);
          if (user?.user?.email) {
            sendMail({
              to: user.user.email,
              subject: 'Votre commande groupee JADOMI est lancee',
              html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <div style="background:#0f0e0d;padding:24px 28px;"><h1 style="color:#10b981;margin:0;font-size:22px;">JADOMI</h1></div>
                <div style="padding:28px;">
                  <h2 style="margin:0 0 16px;font-size:18px;">Votre commande group\u00e9e est lanc\u00e9e</h2>
                  <p style="color:#555;font-size:14px;">La campagne <strong>${campaign.title}</strong> a atteint le seuil de ${campaign.min_cabinets_required} cabinets.</p>
                  <p style="color:#555;font-size:14px;">Volume total : <strong>${totalVolume.toFixed(2)}\u20ac</strong><br>\u00c9conomies estim\u00e9es : <strong>-25%</strong> (-15% GPO + -10% volume)</p>
                  <div style="text-align:center;margin:24px 0;">
                    <a href="${PUBLIC_URL}/index.html" style="display:inline-block;background:#10b981;color:#fff;padding:14px 32px;border-radius:50px;text-decoration:none;font-weight:700;">Voir le statut</a>
                  </div>
                </div>
              </div>`
            }).catch(() => {});
          }
        }
      } catch (e) {}
    }

    console.log(`[Groupage] Campaign ${campaignId} triggered — ${participants.length} cabinets, ${totalVolume.toFixed(0)}EUR`);
  } catch (e) {
    console.error('[Groupage triggerCampaign]', e.message);
  }
}

/**
 * Expire une campagne (pas assez de cabinets apres 48h)
 */
async function expireCampaign(admin, campaignId) {
  try {
    await admin()
      .from('group_purchase_campaigns')
      .update({ status: 'cancelled' })
      .eq('id', campaignId);

    // Notifier les participants
    const { data: participants } = await admin()
      .from('group_purchase_items')
      .select('societe_id')
      .eq('campaign_id', campaignId)
      .eq('status', 'active');

    for (const p of (participants || [])) {
      try {
        const { data: societe } = await admin()
          .from('societes')
          .select('owner_user_id')
          .eq('id', p.societe_id)
          .single();

        if (societe?.owner_user_id) {
          const { data: user } = await admin().auth.admin.getUserById(societe.owner_user_id);
          if (user?.user?.email) {
            sendMail({
              to: user.user.email,
              subject: 'Votre commande group\u00e9e n\'a pas abouti',
              html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <div style="background:#0f0e0d;padding:24px 28px;"><h1 style="color:#10b981;margin:0;font-size:22px;">JADOMI</h1></div>
                <div style="padding:28px;">
                  <h2 style="margin:0 0 16px;font-size:18px;">Commande group\u00e9e non aboutie</h2>
                  <p style="color:#555;font-size:14px;">Le nombre minimum de cabinets n'a pas \u00e9t\u00e9 atteint dans le d\u00e9lai imparti.</p>
                  <p style="color:#555;font-size:14px;">Vous pouvez commander individuellement au tarif JADOMI -15%.</p>
                  <div style="text-align:center;margin:24px 0;">
                    <a href="${PUBLIC_URL}/index.html" style="display:inline-block;background:#10b981;color:#fff;padding:14px 32px;border-radius:50px;text-decoration:none;font-weight:700;">Commander individuellement</a>
                  </div>
                </div>
              </div>`
            }).catch(() => {});
          }
        }
      } catch (e) {}
    }

    console.log(`[Groupage] Campaign ${campaignId} expired`);
  } catch (e) {
    console.error('[Groupage expireCampaign]', e.message);
  }
}

module.exports = { triggerCampaign, expireCampaign };
