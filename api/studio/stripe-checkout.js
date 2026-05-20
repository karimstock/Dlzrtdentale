// =============================================
// JADOMI Studio — Stripe Checkout (MODE TEST)
// Gestion des abonnements forfaits studio
// Passe 90 — 20 mai 2026
// =============================================

'use strict';

const express = require('express');
const router  = express.Router();

// Stripe en mode TEST uniquement
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || '');

// ── Forfaits JADOMI Studio ──────────────────────────────────────────────────
// Les stripe_price_id seront renseignés dans Stripe Dashboard (TEST)
// En attendant on crée les prix à la volée via l'API Stripe si non fournis
const FORFAITS = {
  classic: {
    label:    'Classic',
    creation: 0,    // 0 € — pas de paiement de création
    mensuel:  19,   // 19 €/mois
    mensuel_cents: 1900,
  },
  pro: {
    label:    'Pro',
    creation:       149,
    creation_cents: 14900,
    mensuel:        39,
    mensuel_cents:  3900,
  },
  expert: {
    label:    'Expert',
    creation:       299,
    creation_cents: 29900,
    mensuel:        69,
    mensuel_cents:  6900,
  },
};

// URL de base dynamique (prod ou local)
function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host  = req.headers['x-forwarded-host'] || req.headers.host || 'jadomi.fr';
  return `${proto}://${host}`;
}

// ── Middleware : auth JWT Supabase ──────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }
  next();
}

// ── POST /create-checkout ───────────────────────────────────────────────────
// Corps attendu : { forfait: 'classic'|'pro'|'expert', societe_id: '...' }
router.post('/create-checkout', requireAuth, async (req, res) => {
  try {
    const { forfait, societe_id } = req.body || {};
    const userId = req.user.id || req.user.sub;

    if (!forfait || !FORFAITS[forfait]) {
      return res.status(400).json({ ok: false, error: 'Forfait invalide. Valeurs acceptées : classic, pro, expert.' });
    }

    const plan    = FORFAITS[forfait];
    const baseUrl = getBaseUrl(req);
    const meta    = { forfait, user_id: userId, societe_id: societe_id || '' };

    // ── Cas Classic : 0 € création + 19 €/mois (subscription only)
    if (forfait === 'classic') {
      // Chercher ou créer le Price mensuel dans Stripe TEST
      const priceId = await getOrCreateRecurringPrice(
        `JADOMI Studio Classic — 19 €/mois`,
        plan.mensuel_cents,
        `studio_classic_mensuel`
      );

      const session = await stripe.checkout.sessions.create({
        mode:                'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${baseUrl}/studio/mon-site/creer?success=1&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${baseUrl}/studio/onboarding/?cancelled=1`,
        metadata:    meta,
        subscription_data: { metadata: meta },
      });

      return res.json({ ok: true, checkout_url: session.url, session_id: session.id });
    }

    // ── Cas Pro / Expert : paiement unique (création) + abonnement mensuel
    const creationPriceId = await getOrCreateOneTimePrice(
      `JADOMI Studio ${plan.label} — Création`,
      plan.creation_cents,
      `studio_${forfait}_creation`
    );
    const mensuelPriceId = await getOrCreateRecurringPrice(
      `JADOMI Studio ${plan.label} — ${plan.mensuel} €/mois`,
      plan.mensuel_cents,
      `studio_${forfait}_mensuel`
    );

    const session = await stripe.checkout.sessions.create({
      mode:                'payment',
      payment_method_types: ['card'],
      line_items: [
        { price: creationPriceId, quantity: 1 },
      ],
      // On crée aussi l'abonnement récurrent via payment_intent_data + subscription
      // Stripe ne permet pas mode:'payment' + 'subscription' dans la même session.
      // Solution : on utilise mode:'subscription' avec un prix de création en ajout
      // Voir ci-dessous — on recrée en subscription mode avec trial + item création
      success_url: `${baseUrl}/studio/mon-site/creer?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/studio/onboarding/?cancelled=1`,
      metadata:    meta,
    });

    // NOTE : Stripe ne supporte pas mode mixte payment+subscription dans une session.
    // Implémentation correcte : deux items dans mode 'subscription', dont un non-récurrent
    // via subscription_data.add_invoice_items.
    // On recrée une session propre ci-dessous.
    await stripe.checkout.sessions.expire(session.id).catch(() => {});

    const sessionFinal = await stripe.checkout.sessions.create({
      mode:                'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: mensuelPriceId, quantity: 1 }],
      subscription_data: {
        metadata: meta,
        add_invoice_items: [{ price: creationPriceId }],
      },
      success_url: `${baseUrl}/studio/mon-site/creer?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/studio/onboarding/?cancelled=1`,
      metadata:    meta,
    });

    return res.json({ ok: true, checkout_url: sessionFinal.url, session_id: sessionFinal.id });
  } catch (err) {
    console.error('[Stripe Checkout] Erreur create-checkout :', err.message);
    return res.status(500).json({ ok: false, error: err.message || 'Erreur Stripe.' });
  }
});

// ── GET /status/:session_id ─────────────────────────────────────────────────
router.get('/status/:session_id', requireAuth, async (req, res) => {
  try {
    const { session_id } = req.params;
    if (!session_id || !session_id.startsWith('cs_')) {
      return res.status(400).json({ ok: false, error: 'Identifiant de session invalide.' });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['subscription', 'payment_intent'],
    });

    return res.json({
      ok:                    true,
      status:                session.payment_status,
      subscription_id:       session.subscription?.id || null,
      subscription_status:   session.subscription?.status || null,
      customer_email:        session.customer_details?.email || null,
      metadata:              session.metadata,
    });
  } catch (err) {
    console.error('[Stripe Checkout] Erreur status :', err.message);
    return res.status(500).json({ ok: false, error: err.message || 'Erreur Stripe.' });
  }
});

// ── POST /webhook ───────────────────────────────────────────────────────────
// Endpoint Stripe webhook — doit recevoir le body brut (raw)
// À déclarer AVANT express.json() sur ce router, d'où l'usage de express.raw
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const sig           = req.headers['stripe-signature'];

    let event;
    try {
      if (webhookSecret && sig) {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } else {
        // Mode TEST sans secret configuré — on parse directement
        event = JSON.parse(req.body.toString());
        console.warn('[Stripe Webhook] ATTENTION : signature non vérifiée (STRIPE_WEBHOOK_SECRET manquant).');
      }
    } catch (err) {
      console.error('[Stripe Webhook] Signature invalide :', err.message);
      return res.status(400).json({ error: `Webhook signature invalide : ${err.message}` });
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session  = event.data.object;
          const meta     = session.metadata || {};
          const forfait  = meta.forfait;
          const userId   = meta.user_id;
          const societeId = meta.societe_id || null;
          const subId    = session.subscription || null;

          if (forfait && userId) {
            // Mettre à jour studio_abonnements dans Supabase
            const db = global.__supabaseAdmin || global.__supabase;

            if (db) {
              // Vérifier si un abonnement existe déjà pour cet utilisateur
              const { data: existing } = await db
                .from('studio_abonnements')
                .select('id')
                .eq('user_id', userId)
                .eq('societe_id', societeId)
                .single();

              if (existing) {
                // Mettre à jour
                await db
                  .from('studio_abonnements')
                  .update({
                    forfait,
                    statut:                 'actif',
                    stripe_subscription_id: subId,
                    updated_at:             new Date().toISOString(),
                  })
                  .eq('id', existing.id);
              } else {
                // Créer
                await db
                  .from('studio_abonnements')
                  .insert({
                    user_id:                userId,
                    societe_id:             societeId,
                    forfait,
                    statut:                 'actif',
                    stripe_subscription_id: subId,
                    created_at:             new Date().toISOString(),
                    updated_at:             new Date().toISOString(),
                  });
              }
              console.log(`[Stripe Webhook] Abonnement ${forfait} activé pour user ${userId}`);
            } else {
              console.warn('[Stripe Webhook] Supabase non disponible — abonnement non enregistré.');
            }
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const sub     = event.data.object;
          const subId   = sub.id;
          const db      = global.__supabaseAdmin || global.__supabase;

          if (db && subId) {
            await db
              .from('studio_abonnements')
              .update({ statut: 'résilié', updated_at: new Date().toISOString() })
              .eq('stripe_subscription_id', subId);
            console.log(`[Stripe Webhook] Abonnement ${subId} résilié.`);
          }
          break;
        }

        case 'invoice.payment_failed': {
          const inv   = event.data.object;
          const subId = inv.subscription;
          const db    = global.__supabaseAdmin || global.__supabase;

          if (db && subId) {
            await db
              .from('studio_abonnements')
              .update({ statut: 'paiement_échoué', updated_at: new Date().toISOString() })
              .eq('stripe_subscription_id', subId);
            console.log(`[Stripe Webhook] Paiement échoué pour abonnement ${subId}.`);
          }
          break;
        }

        default:
          // Événements non gérés — pas d'erreur
          break;
      }

      return res.json({ received: true });
    } catch (err) {
      console.error('[Stripe Webhook] Erreur traitement événement :', err.message);
      return res.status(500).json({ error: 'Erreur serveur webhook.' });
    }
  }
);

// ── Helpers : récupération ou création des Price Stripe TEST ───────────────

async function getOrCreateRecurringPrice(name, unit_amount, lookup_key) {
  try {
    // Chercher par lookup_key
    const existing = await stripe.prices.list({ lookup_keys: [lookup_key], limit: 1 });
    if (existing.data.length > 0) return existing.data[0].id;

    // Créer le produit + prix
    const product = await stripe.products.create({ name });
    const price   = await stripe.prices.create({
      product:    product.id,
      unit_amount,
      currency:   'eur',
      recurring:  { interval: 'month' },
      lookup_key,
    });
    return price.id;
  } catch (err) {
    throw new Error(`Impossible de créer le prix récurrent "${name}" : ${err.message}`);
  }
}

async function getOrCreateOneTimePrice(name, unit_amount, lookup_key) {
  try {
    const existing = await stripe.prices.list({ lookup_keys: [lookup_key], limit: 1 });
    if (existing.data.length > 0) return existing.data[0].id;

    const product = await stripe.products.create({ name });
    const price   = await stripe.prices.create({
      product:    product.id,
      unit_amount,
      currency:   'eur',
      lookup_key,
    });
    return price.id;
  } catch (err) {
    throw new Error(`Impossible de créer le prix unique "${name}" : ${err.message}`);
  }
}

module.exports = router;
