// =============================================
// JADOMI — Billing API (user-level)
// GET  /api/billing/status  — Abonnement utilisateur
// POST /api/billing/portail — Portail Stripe Customer
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { authSupabase } = require('../multiSocietes/middleware');

// --- Supabase admin singleton ---
let _admin = null;
function admin() {
  if (!_admin) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants');
    _admin = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

// --- Stripe (lazy, graceful if not configured) ---
let stripe = null;
try {
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
} catch (e) {
  console.warn('[billing] Stripe SDK non disponible:', e.message);
}

const BASE_URL = process.env.PUBLIC_HOST || process.env.BASE_URL || 'https://jadomi.fr';

// Plan price mapping
const PLAN_PRICES = {
  decouverte: 0,
  solo: 29,
  standard: 79,
  cabinet: 39,
  multi: 79,
  illimite: 99
};

// =============================================
// GET /api/billing/status
// Retourne l'abonnement de l'utilisateur connecté
// =============================================
router.get('/status', authSupabase(), async (req, res) => {
  try {
    const userId = req.user.id;

    // 1) Chercher dans la table subscriptions (abonnements utilisateur)
    let subscription = null;
    try {
      const { data, error } = await admin()
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['active', 'trialing', 'past_due'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error && data) subscription = data;
    } catch (e) {
      // Table may not exist yet — fallback below
      console.warn('[billing/status] subscriptions lookup:', e.message);
    }

    // 2) Fallback : chercher dans la table abonnements
    if (!subscription) {
      try {
        const { data, error } = await admin()
          .from('abonnements')
          .select('*')
          .eq('user_id', userId)
          .in('status', ['active', 'trialing', 'past_due'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!error && data) subscription = data;
      } catch (e) {
        console.warn('[billing/status] abonnements lookup:', e.message);
      }
    }

    // 3) Fallback : chercher via societes (user est owner)
    if (!subscription) {
      try {
        const { data: roles } = await admin()
          .from('user_societe_roles')
          .select('societe_id, role')
          .eq('user_id', userId)
          .in('role', ['proprietaire', 'associe'])
          .limit(1)
          .maybeSingle();
        if (roles?.societe_id) {
          const { data: soc } = await admin()
            .from('societes')
            .select('plan, actif, stripe_customer_id')
            .eq('id', roles.societe_id)
            .single();
          if (soc) {
            subscription = {
              plan_name: soc.plan || 'standard',
              price: PLAN_PRICES[soc.plan] || 79,
              status: soc.actif ? 'active' : 'inactive',
              current_period_end: null,
              has_stripe: !!soc.stripe_customer_id
            };
          }
        }
      } catch (e) {
        console.warn('[billing/status] societes fallback:', e.message);
      }
    }

    // 4) Si aucun abonnement trouvé, retourner état par défaut
    if (!subscription) {
      return res.json({
        subscription: {
          plan_name: 'Essai',
          price: 0,
          status: 'trial',
          current_period_end: null,
          has_stripe: false
        }
      });
    }

    // Normaliser la réponse
    res.json({
      subscription: {
        plan_name: subscription.plan_name || subscription.plan || 'Standard',
        price: subscription.price || PLAN_PRICES[subscription.plan_name || subscription.plan] || 79,
        status: subscription.status || 'active',
        current_period_end: subscription.current_period_end || null,
        has_stripe: !!subscription.stripe_customer_id
      }
    });
  } catch (e) {
    console.error('[billing/status]', e.message);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// =============================================
// POST /api/billing/portail
// Crée une session Stripe Customer Portal
// =============================================
router.post('/portail', authSupabase(), async (req, res) => {
  try {
    // Vérifier que Stripe est configuré
    if (!stripe) {
      return res.status(503).json({
        error: 'Service de paiement non configuré',
        message: 'Le portail de paiement sera bientôt disponible. Veuillez contacter contact@jadomi.fr pour toute question relative à votre abonnement.'
      });
    }

    const userId = req.user.id;
    let stripeCustomerId = null;

    // 1) Chercher stripe_customer_id dans subscriptions
    try {
      const { data } = await admin()
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', userId)
        .not('stripe_customer_id', 'is', null)
        .limit(1)
        .maybeSingle();
      if (data?.stripe_customer_id) stripeCustomerId = data.stripe_customer_id;
    } catch (e) {
      console.warn('[billing/portail] subscriptions lookup:', e.message);
    }

    // 2) Fallback : abonnements
    if (!stripeCustomerId) {
      try {
        const { data } = await admin()
          .from('abonnements')
          .select('stripe_customer_id')
          .eq('user_id', userId)
          .not('stripe_customer_id', 'is', null)
          .limit(1)
          .maybeSingle();
        if (data?.stripe_customer_id) stripeCustomerId = data.stripe_customer_id;
      } catch (e) {
        console.warn('[billing/portail] abonnements lookup:', e.message);
      }
    }

    // 3) Fallback : societes
    if (!stripeCustomerId) {
      try {
        const { data: roles } = await admin()
          .from('user_societe_roles')
          .select('societe_id')
          .eq('user_id', userId)
          .in('role', ['proprietaire', 'associe'])
          .limit(1)
          .maybeSingle();
        if (roles?.societe_id) {
          const { data: soc } = await admin()
            .from('societes')
            .select('stripe_customer_id')
            .eq('id', roles.societe_id)
            .single();
          if (soc?.stripe_customer_id) stripeCustomerId = soc.stripe_customer_id;
        }
      } catch (e) {
        console.warn('[billing/portail] societes fallback:', e.message);
      }
    }

    if (!stripeCustomerId) {
      return res.status(400).json({
        error: 'Aucun compte de paiement associé',
        message: 'Votre compte ne dispose pas encore d\'un identifiant de paiement. Veuillez d\'abord souscrire à un abonnement ou contacter contact@jadomi.fr.'
      });
    }

    // Créer la session portail Stripe
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: BASE_URL + '/billing.html'
    });

    return res.json({ url: session.url });
  } catch (e) {
    console.error('[billing/portail]', e.message);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

module.exports = router;
