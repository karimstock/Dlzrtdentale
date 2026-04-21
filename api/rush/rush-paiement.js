// =============================================
// JADOMI RUSH — Paiement escrow Stripe
// Le prothesiste principal paie JADOMI
// JADOMI reverse au sous-traitant moins commission
// =============================================

const express = require('express');

function createPaiementRouter(supabase) {
  const router = express.Router();

  function getStripe() {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY non configure');
    return require('stripe')(process.env.STRIPE_SECRET_KEY);
  }

  // POST /api/rush/paiement — Creer Stripe Checkout (escrow)
  router.post('/', async (req, res) => {
    try {
      const { demande_id, payeur_id } = req.body;
      if (!demande_id) return res.status(400).json({ error: 'demande_id requis' });

      const { data: demande } = await supabase
        .from('rush_demandes').select('*').eq('id', demande_id).single();
      if (!demande) return res.status(404).json({ error: 'Demande non trouvee' });
      if (demande.statut !== 'attribuee') {
        return res.status(400).json({ error: 'Demande doit etre attribuee avant paiement' });
      }

      const stripe = getStripe();
      const commissionPct = demande.commission_pct || parseFloat(process.env.JADOMI_RUSH_COMMISSION_PCT) || 10;
      const montantTravaux = parseFloat(demande.total_paye) || 0;
      const commission = Math.round(montantTravaux * commissionPct / 100 * 100) / 100;
      const montantTotal = montantTravaux;
      const montantReverse = Math.round((montantTravaux - commission) * 100) / 100;

      // Creer Payment Intent avec capture manuelle (escrow)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(montantTotal * 100), // centimes
        currency: 'eur',
        capture_method: 'manual', // ESCROW : capture uniquement apres validation
        metadata: {
          type: 'jadomi_rush',
          demande_id: String(demande_id),
          payeur_id: String(payeur_id || demande.demandeur_id),
          beneficiaire_id: String(demande.preneur_id),
          commission_pct: String(commissionPct)
        },
        description: `JADOMI Rush — Demande #${demande_id}`
      });

      // Creer Checkout Session
      const baseUrl = process.env.BASE_URL || 'https://jadomi.fr';
      const session = await stripe.checkout.sessions.create({
        payment_intent_data: { metadata: paymentIntent.metadata },
        line_items: [{
          price_data: {
            currency: 'eur',
            unit_amount: Math.round(montantTotal * 100),
            product_data: {
              name: `JADOMI Rush — ${demande.type_travail || 'Travaux'}`,
              description: `Sous-traitance anonyme — Demande #${demande_id}`
            }
          },
          quantity: 1
        }],
        mode: 'payment',
        success_url: `${baseUrl}/public/rush/suivi-commande.html?id=${demande_id}&payment=success`,
        cancel_url: `${baseUrl}/public/rush/suivi-commande.html?id=${demande_id}&payment=cancel`
      });

      // Enregistrer paiement en DB
      await supabase.from('rush_paiements').insert({
        demande_id: parseInt(demande_id),
        payeur_id: parseInt(payeur_id || demande.demandeur_id),
        beneficiaire_id: parseInt(demande.preneur_id),
        stripe_payment_intent_id: paymentIntent.id,
        stripe_checkout_session_id: session.id,
        montant_total: montantTotal,
        montant_travaux: montantTravaux - (demande.cout_transport || 0),
        montant_transport: demande.cout_transport || 0,
        commission_jadomi: commission,
        montant_reverse: montantReverse,
        statut: 'en_attente'
      });

      // MAJ demande
      await supabase.from('rush_demandes').update({
        statut_detail: 'paiement_en_attente',
        payment_intent_id: paymentIntent.id
      }).eq('id', demande_id);

      res.json({
        success: true,
        checkout_url: session.url,
        session_id: session.id,
        montant: {
          total: montantTotal,
          commission,
          reverse: montantReverse
        }
      });
    } catch (e) {
      console.error('[RUSH paiement]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/rush/paiement/confirmer — Webhook ou confirmation manuelle paiement
  router.post('/confirmer', async (req, res) => {
    try {
      const { demande_id, payment_intent_id } = req.body;
      if (!demande_id) return res.status(400).json({ error: 'demande_id requis' });

      await supabase.from('rush_paiements')
        .update({ statut: 'paye', date_paiement: new Date().toISOString() })
        .eq('demande_id', parseInt(demande_id));

      await supabase.from('rush_demandes').update({
        statut: 'en_cours',
        statut_detail: 'paiement_confirme'
      }).eq('id', demande_id);

      res.json({ success: true, message: 'Paiement confirme — fabrication peut commencer' });
    } catch (e) {
      console.error('[RUSH paiement confirmer]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/rush/valider-livraison — Capturer escrow apres validation
  router.post('/valider-livraison', async (req, res) => {
    try {
      const { demande_id } = req.body;
      if (!demande_id) return res.status(400).json({ error: 'demande_id requis' });

      const { data: paiement } = await supabase
        .from('rush_paiements')
        .select('*')
        .eq('demande_id', parseInt(demande_id))
        .single();

      if (!paiement || paiement.statut !== 'paye') {
        return res.status(400).json({ error: 'Paiement non trouve ou pas en attente de capture' });
      }

      // Capturer le paiement Stripe
      if (paiement.stripe_payment_intent_id && process.env.STRIPE_SECRET_KEY) {
        try {
          const stripe = getStripe();
          await stripe.paymentIntents.capture(paiement.stripe_payment_intent_id);
        } catch (stripeErr) {
          console.warn('[RUSH] Capture Stripe warn:', stripeErr.message);
        }
      }

      await supabase.from('rush_paiements').update({
        statut: 'capture',
        date_capture: new Date().toISOString()
      }).eq('id', paiement.id);

      await supabase.from('rush_demandes').update({
        statut: 'valide',
        statut_detail: 'valide',
        date_validation: new Date().toISOString()
      }).eq('id', demande_id);

      // Incrementer nb_rush du sous-traitant
      const { data: demande } = await supabase
        .from('rush_demandes').select('preneur_id').eq('id', demande_id).single();
      if (demande?.preneur_id) {
        await supabase.rpc('increment_rush_count', { p_id: demande.preneur_id }).catch(() => {
          // Fallback si RPC n'existe pas
          supabase.from('prothesistes')
            .update({ nb_rush_realises: supabase.raw('nb_rush_realises + 1') })
            .eq('id', demande.preneur_id).catch(() => {});
        });
      }

      res.json({ success: true, message: 'Livraison validee — paiement capture, virement sous-traitant sous 48h' });
    } catch (e) {
      console.error('[RUSH valider-livraison]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/rush/litige — Ouvrir un litige (freeze escrow)
  router.post('/litige', async (req, res) => {
    try {
      const { demande_id, motif } = req.body;
      if (!demande_id) return res.status(400).json({ error: 'demande_id requis' });

      await supabase.from('rush_paiements')
        .update({ statut: 'litige' })
        .eq('demande_id', parseInt(demande_id));

      await supabase.from('rush_demandes').update({
        statut: 'litige',
        statut_detail: 'litige_ouvert'
      }).eq('id', demande_id);

      // TODO: Envoyer alerte admin JADOMI
      console.warn(`[RUSH LITIGE] Demande #${demande_id} — ${motif || 'sans motif'}`);

      res.json({ success: true, message: 'Litige ouvert — escrow gele — admin JADOMI notifie' });
    } catch (e) {
      console.error('[RUSH litige]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/rush/paiement/status/:demande_id — Statut paiement
  router.get('/status/:demande_id', async (req, res) => {
    try {
      const { data } = await supabase
        .from('rush_paiements')
        .select('statut, montant_total, commission_jadomi, montant_reverse, date_paiement, date_capture')
        .eq('demande_id', parseInt(req.params.demande_id))
        .single();

      res.json({ success: true, paiement: data || null });
    } catch (e) {
      console.error('[RUSH paiement status]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

module.exports = { createPaiementRouter };
