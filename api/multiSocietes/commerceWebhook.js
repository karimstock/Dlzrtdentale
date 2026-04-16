// =============================================
// JADOMI — Webhook Stripe pour factures commerce (paiement client)
// POST /api/commerce/stripe/webhook — raw body requis
// Monté AVANT express.json() via server.js.
// =============================================
const express = require('express');
const { admin, auditLog } = require('./middleware');

let stripe = null;
try {
  if (process.env.STRIPE_SECRET_KEY) stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} catch {}

const WEBHOOK_SECRET =
  process.env.STRIPE_WEBHOOK_SECRET_COMMERCE ||
  process.env.STRIPE_WEBHOOK_SECRET || null;

let pushNotif = () => null;
try { pushNotif = require('./notifications').pushNotification; } catch {}

// Trouve une facture via payment_intent ou payment_link ou metadata.facture_id
async function findFactureForEvent(obj) {
  const meta = obj.metadata || {};
  if (meta.facture_id) {
    const { data } = await admin().from('factures_societe').select('*')
      .eq('id', meta.facture_id).maybeSingle();
    if (data) return data;
  }
  // checkout.session.completed : obj.payment_link ou obj.payment_intent
  const paymentLink = obj.payment_link || null;
  const paymentIntent = obj.payment_intent || obj.id || null;
  if (paymentLink) {
    const { data } = await admin().from('factures_societe').select('*')
      .eq('stripe_payment_link', paymentLink).maybeSingle();
    if (data) return data;
  }
  if (paymentIntent) {
    const { data } = await admin().from('factures_societe').select('*')
      .eq('stripe_payment_intent', paymentIntent).maybeSingle();
    if (data) return data;
  }
  // Fallback : cherche par URL si payment_link est l'URL complète stockée
  if (obj.url) {
    const { data } = await admin().from('factures_societe').select('*')
      .eq('stripe_payment_link', obj.url).maybeSingle();
    if (data) return data;
  }
  return null;
}

async function markFacturePayee(facture, event) {
  const now = new Date().toISOString();
  const { data: updated, error } = await admin().from('factures_societe').update({
    statut: 'payee',
    montant_paye: Number(facture.total_ttc || 0),
    payee_at: now,
    stripe_payment_intent: event.data?.object?.payment_intent || facture.stripe_payment_intent || null
  }).eq('id', facture.id).select('*').single();
  if (error) throw error;

  // Notifie propriétaires/associés de la société
  try {
    const { data: members } = await admin().from('user_societe_roles')
      .select('user_id').eq('societe_id', facture.societe_id)
      .in('role', ['proprietaire', 'associe']);
    for (const m of members || []) {
      await pushNotif({
        user_id: m.user_id,
        societe_id: facture.societe_id,
        type: 'facture_payee',
        urgence: 'normale',
        titre: `Facture ${facture.numero} payée`,
        message: `Paiement Stripe de ${Number(facture.total_ttc).toFixed(2)} € reçu.`,
        entity_type: 'facture', entity_id: facture.id,
        cta_label: 'Voir', cta_url: '/commerce.html?tab=factures'
      });
    }
  } catch (_) {}

  await auditLog({
    societeId: facture.societe_id,
    action: 'stripe_payment', entity: 'facture', entityId: facture.id,
    meta: { event: event.type, numero: facture.numero, total_ttc: facture.total_ttc }
  });

  return updated;
}

async function handleEvent(event) {
  const obj = event.data?.object || {};
  if (event.type === 'checkout.session.completed' ||
      event.type === 'payment_intent.succeeded' ||
      event.type === 'invoice.paid') {
    const f = await findFactureForEvent(obj);
    if (!f) {
      console.warn('[commerce/webhook] facture introuvable pour event', event.type, obj.id);
      return;
    }
    if (f.statut === 'payee') return; // idempotent
    await markFacturePayee(f, event);
  } else if (event.type === 'payment_intent.payment_failed') {
    // Log seulement, pas de changement statut
    await auditLog({
      action: 'payment_failed', entity: 'stripe',
      entityId: obj.id,
      meta: { last_payment_error: obj.last_payment_error?.message }
    });
  }
}

function mountCommerceWebhook(app) {
  app.post('/api/commerce/stripe/webhook',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      try {
        if (!stripe) return res.status(503).json({ error: 'stripe non configuré' });
        let event = null;
        if (WEBHOOK_SECRET) {
          try {
            event = stripe.webhooks.constructEvent(
              req.body, req.headers['stripe-signature'], WEBHOOK_SECRET
            );
          } catch (e) {
            console.warn('[commerce/webhook] signature invalide:', e.message);
            return res.status(400).send('Invalid signature');
          }
        } else {
          event = JSON.parse(req.body.toString());
        }
        await handleEvent(event);
        res.json({ received: true });
      } catch (e) {
        console.error('[commerce/webhook]', e.message);
        res.status(500).json({ error: e.message });
      }
    }
  );
  console.log('[JADOMI] Webhook /api/commerce/stripe/webhook monté (raw)');
}

module.exports = { mountCommerceWebhook };
