// JADOMI — Juridique : Gestion des réservations
const { admin, requireSociete } = require('../multiSocietes/middleware');
const mailer = require('../multiSocietes/mailer');

async function getProfilId(societeId) {
  const { data } = await admin().from('juridique_profil')
    .select('id').eq('societe_id', societeId).maybeSingle();
  return data?.id;
}

module.exports = function (router) {
  // Liste des réservations
  router.get('/reservations', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.json({ success: true, reservations: [] });

      let query = admin().from('juridique_reservations')
        .select('*, offre:offre_id(titre, type, duree_minutes)')
        .eq('profil_id', profilId)
        .order('date_rdv', { ascending: false });

      if (req.query.date) query = query.eq('date_rdv', req.query.date);
      if (req.query.statut) query = query.eq('statut', req.query.statut);
      if (req.query.from) query = query.gte('date_rdv', req.query.from);
      if (req.query.to) query = query.lte('date_rdv', req.query.to);

      const { data } = await query;
      res.json({ success: true, reservations: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Détail d'une réservation
  router.get('/reservations/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const { data } = await admin().from('juridique_reservations')
        .select('*, offre:offre_id(titre, type, duree_minutes, prix)')
        .eq('id', req.params.id).eq('profil_id', profilId).single();
      if (!data) return res.status(404).json({ error: 'not_found' });
      res.json({ success: true, reservation: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Changer le statut
  router.patch('/reservations/:id/statut', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const { statut } = req.body;
      if (!statut) return res.status(400).json({ error: 'statut requis' });

      const { data: rdv } = await admin().from('juridique_reservations')
        .select('*').eq('id', req.params.id).eq('profil_id', profilId).single();
      if (!rdv) return res.status(404).json({ error: 'not_found' });

      const commissionPct = parseFloat(process.env.JADOMI_JURIDIQUE_COMMISSION_PCT || '5');

      // Annulation par le pro → remboursement
      if (statut === 'annule_pro' && rdv.stripe_payment_intent_id) {
        try {
          const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
          const refund = await stripe.refunds.create({ payment_intent: rdv.stripe_payment_intent_id });
          await admin().from('juridique_reservations')
            .update({ statut: 'rembourse', stripe_refund_id: refund.id }).eq('id', rdv.id);

          // Email au client
          await mailer.sendMail({
            to: rdv.client_email,
            subject: 'Annulation et remboursement — JADOMI',
            html: `<p>Bonjour ${rdv.client_prenom || rdv.client_nom},</p>
              <p>Votre consultation a été annulée par le professionnel.
              Vous êtes remboursé(e) de ${rdv.prix_total}€ sous 3-5 jours ouvrés.</p>
              <p>Cordialement,<br>L'équipe JADOMI</p>`
          });
          return res.json({ success: true, reservation: { ...rdv, statut: 'rembourse' } });
        } catch (e) {
          console.error('[Juridique] Remboursement échoué:', e.message);
        }
      }

      // Terminé → créer l'entrée en comptabilité
      if (statut === 'termine') {
        const commission = Number(rdv.prix_total) * commissionPct / 100;
        const net = Number(rdv.prix_total) - commission;
        await admin().from('juridique_honoraires').insert({
          profil_id: profilId,
          reservation_id: rdv.id,
          designation: `Consultation ${rdv.date_rdv}`,
          date_acte: rdv.date_rdv,
          montant_brut: rdv.prix_total,
          commission_jadomi: commission,
          montant_net: net,
          mode_paiement: rdv.stripe_payment_intent_id ? 'stripe' : 'cb'
        });

        // Email demande d'avis au client
        try {
          await mailer.sendMail({
            to: rdv.client_email,
            subject: 'Votre avis compte — JADOMI',
            html: `<p>Bonjour ${rdv.client_prenom || rdv.client_nom},</p>
              <p>Merci pour votre consultation. Votre avis est important !</p>
              <p>Laissez un avis sur la page du professionnel pour aider d'autres personnes.</p>
              <p>Cordialement,<br>L'équipe JADOMI</p>`
          });
        } catch (_) {}
      }

      const { data, error } = await admin().from('juridique_reservations')
        .update({ statut }).eq('id', req.params.id).eq('profil_id', profilId)
        .select('*').single();
      if (error) throw error;
      res.json({ success: true, reservation: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // Ajouter des notes
  router.patch('/reservations/:id/notes', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const { data, error } = await admin().from('juridique_reservations')
        .update({ notes_pro: req.body.notes_pro })
        .eq('id', req.params.id).eq('profil_id', profilId)
        .select('*').single();
      if (error) throw error;
      res.json({ success: true, reservation: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
};
