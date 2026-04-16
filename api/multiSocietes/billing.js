// =============================================
// JADOMI — Multi-sociétés : Plans SaaS Stripe Billing
// /api/billing/* + webhook Stripe (checkout / subscription)
// =============================================
const express = require('express');
const { admin, authSupabase, auditLog } = require('./middleware');

let stripe = null;
try {
  if (process.env.STRIPE_SECRET_KEY) stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} catch {}

const PUBLIC_HOST = process.env.PUBLIC_HOST || 'https://jadomi.fr';
const PRICE_SOLO = process.env.STRIPE_PRICE_SOLO || null;           // ID price 29€/mois
const PRICE_ILLIMITE = process.env.STRIPE_PRICE_ILLIMITE || null;   // ID price 99€/mois
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET_BILLING || null;

function planFromPrice(priceId) {
  if (priceId === PRICE_SOLO) return 'solo';
  if (priceId === PRICE_ILLIMITE) return 'illimite';
  return 'standard';
}

// Webhook Stripe (raw body requis) — monté séparément AVANT express.json
// via api/multiSocietes/webhooks.js. Voir mountBillingWebhook.
async function handleWebhookEvent(event) {
  const obj = event.data?.object || {};
  const meta = obj.metadata || {};
  if (event.type === 'checkout.session.completed') {
    const societe_id = meta.societe_id || null;
    const plan = meta.plan || null;
    if (societe_id) {
      const patch = {
        stripe_customer_id: obj.customer || null,
        stripe_subscription_id: obj.subscription || null,
        actif: true
      };
      if (plan) patch.plan = plan;
      await admin().from('societes').update(patch).eq('id', societe_id);
      await auditLog({
        societeId: societe_id, action: 'checkout_completed',
        entity: 'billing', entityId: obj.id,
        meta: { plan, customer: obj.customer }
      });
    }
  } else if (event.type === 'customer.subscription.updated' ||
             event.type === 'customer.subscription.deleted') {
    const items = obj.items?.data || [];
    const priceId = items[0]?.price?.id || null;
    const newPlan = priceId ? planFromPrice(priceId) : null;
    const actif = (event.type === 'customer.subscription.deleted')
      ? false
      : obj.status === 'active' || obj.status === 'trialing';
    await admin().from('societes').update({
      plan: newPlan || 'solo',
      actif
    }).eq('stripe_subscription_id', obj.id);
    await auditLog({
      action: event.type, entity: 'billing', entityId: obj.id,
      meta: { status: obj.status, plan: newPlan }
    });
  } else if (event.type === 'invoice.payment_failed') {
    await auditLog({
      action: 'invoice_payment_failed', entity: 'billing', entityId: obj.id,
      meta: { customer: obj.customer, amount_due: obj.amount_due }
    });
  }
}

function mountBillingWebhook(app) {
  app.post('/api/billing/webhook',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      try {
        if (!stripe) return res.status(503).json({ error: 'stripe non configuré' });
        let event = null;
        if (WEBHOOK_SECRET) {
          try {
            event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], WEBHOOK_SECRET);
          } catch (e) {
            console.warn('[billing/webhook] signature invalide:', e.message);
            return res.status(400).send('Invalid signature');
          }
        } else {
          event = JSON.parse(req.body.toString());
        }
        await handleWebhookEvent(event);
        res.json({ received: true });
      } catch (e) {
        console.error('[billing/webhook]', e.message);
        res.status(500).json({ error: e.message });
      }
    }
  );
  console.log('[JADOMI] Webhook /api/billing/webhook monté (raw)');
}

module.exports = function mountBilling(app) {
  // -------------------------------------------------------------------
  // Routes authentifiées
  // -------------------------------------------------------------------
  const router = express.Router();
  router.use(authSupabase());

  // État billing pour une société donnée
  router.get('/status', async (req, res) => {
    try {
      const societe_id = req.headers['x-societe-id'] || req.query.societe_id;
      if (!societe_id) return res.status(400).json({ error: 'societe_id requis' });
      const { data: soc } = await admin().from('societes')
        .select('id, nom, plan, actif, stripe_customer_id, stripe_subscription_id, owner_id')
        .eq('id', societe_id).single();
      if (!soc) return res.status(404).json({ error: 'not_found' });

      // Vérifie membership
      const { data: role } = await admin().from('user_societe_roles')
        .select('role').eq('user_id', req.user.id).eq('societe_id', societe_id).maybeSingle();
      if (!role) return res.status(403).json({ error: 'forbidden' });

      let subscription = null;
      if (stripe && soc.stripe_subscription_id) {
        try {
          subscription = await stripe.subscriptions.retrieve(soc.stripe_subscription_id);
        } catch (e) {
          console.warn('[billing/status] sub fetch:', e.message);
        }
      }
      res.json({
        success: true,
        societe: { id: soc.id, nom: soc.nom, plan: soc.plan, actif: soc.actif },
        stripe_configured: !!stripe,
        stripe_customer_id: soc.stripe_customer_id,
        is_owner: soc.owner_id === req.user.id,
        subscription: subscription ? {
          id: subscription.id,
          status: subscription.status,
          current_period_end: subscription.current_period_end,
          cancel_at_period_end: subscription.cancel_at_period_end,
          price_id: subscription.items?.data?.[0]?.price?.id || null,
          amount: subscription.items?.data?.[0]?.price?.unit_amount || null,
          currency: subscription.items?.data?.[0]?.price?.currency || null,
          interval: subscription.items?.data?.[0]?.price?.recurring?.interval || null
        } : null
      });
    } catch (e) {
      console.error('[billing/status]', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Checkout pour un plan (lie à une société)
  router.post('/checkout', async (req, res) => {
    try {
      if (!stripe) return res.status(503).json({ error: 'stripe non configuré' });
      const { plan, societe_id } = req.body || {};
      const priceId = plan === 'illimite' ? PRICE_ILLIMITE : PRICE_SOLO;
      if (!priceId) return res.status(400).json({ error: `price_id manquant pour ${plan}` });
      if (!societe_id) return res.status(400).json({ error: 'societe_id requis' });

      // Vérifie que l'utilisateur est owner ou associe
      const { data: role } = await admin().from('user_societe_roles')
        .select('role').eq('user_id', req.user.id).eq('societe_id', societe_id).maybeSingle();
      if (!role || !['proprietaire','associe'].includes(role.role)) {
        return res.status(403).json({ error: 'role_insuffisant' });
      }

      const { data: soc } = await admin().from('societes')
        .select('stripe_customer_id').eq('id', societe_id).single();

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        customer: soc?.stripe_customer_id || undefined,
        customer_email: soc?.stripe_customer_id ? undefined : req.user.email,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${PUBLIC_HOST}/billing.html?checkout=ok&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${PUBLIC_HOST}/billing.html?checkout=cancel`,
        metadata: { user_id: req.user.id, societe_id, plan },
        subscription_data: {
          metadata: { user_id: req.user.id, societe_id, plan }
        },
        allow_promotion_codes: true
      });
      res.json({ success: true, url: session.url });
    } catch (e) {
      console.error('[billing/checkout]', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Fallback manuel post-checkout si webhook pas encore reçu
  router.post('/confirm-checkout', async (req, res) => {
    try {
      if (!stripe) return res.status(503).json({ error: 'stripe non configuré' });
      const { session_id } = req.body || {};
      if (!session_id) return res.status(400).json({ error: 'session_id requis' });
      const s = await stripe.checkout.sessions.retrieve(session_id);
      const societe_id = s.metadata?.societe_id;
      if (!societe_id) return res.status(400).json({ error: 'societe_id manquant dans session' });
      // Vérifie membership
      const { data: role } = await admin().from('user_societe_roles')
        .select('role').eq('user_id', req.user.id).eq('societe_id', societe_id).maybeSingle();
      if (!role) return res.status(403).json({ error: 'forbidden' });
      await admin().from('societes').update({
        stripe_customer_id: s.customer,
        stripe_subscription_id: s.subscription,
        plan: s.metadata?.plan || 'solo',
        actif: true
      }).eq('id', societe_id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Portail client Stripe
  router.post('/portail', async (req, res) => {
    try {
      if (!stripe) return res.status(503).json({ error: 'stripe non configuré' });
      const { societe_id } = req.body || {};
      if (!societe_id) return res.status(400).json({ error: 'societe_id requis' });
      const { data: soc } = await admin().from('societes').select('stripe_customer_id, owner_id')
        .eq('id', societe_id).single();
      if (!soc || soc.owner_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
      if (!soc.stripe_customer_id) return res.status(400).json({ error: 'pas de stripe_customer_id' });
      const session = await stripe.billingPortal.sessions.create({
        customer: soc.stripe_customer_id,
        return_url: `${PUBLIC_HOST}/billing.html`
      });
      res.json({ success: true, url: session.url });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.use('/api/billing', router);
  console.log('[JADOMI] Routes /api/billing montées');
};

module.exports.mountBillingWebhook = mountBillingWebhook;
