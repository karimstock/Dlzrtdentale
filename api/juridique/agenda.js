// JADOMI — Juridique : Agenda & disponibilités
const { admin, requireSociete } = require('../multiSocietes/middleware');
const mailer = require('../multiSocietes/mailer');

async function getProfilId(societeId) {
  const { data } = await admin().from('juridique_profil')
    .select('id').eq('societe_id', societeId).maybeSingle();
  return data?.id;
}

module.exports = function (router) {
  // --- Disponibilités ---
  router.get('/agenda/disponibilites', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.json({ success: true, disponibilites: [] });
      const { data } = await admin().from('juridique_disponibilites')
        .select('*').eq('profil_id', profilId).order('jour_semaine');
      res.json({ success: true, disponibilites: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  router.post('/agenda/disponibilites', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(400).json({ error: 'Profil requis' });
      const { data, error } = await admin().from('juridique_disponibilites')
        .insert({ ...req.body, profil_id: profilId }).select('*').single();
      if (error) throw error;
      res.json({ success: true, disponibilite: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  router.put('/agenda/disponibilites', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(400).json({ error: 'Profil requis' });
      // Bulk replace: delete all then insert
      await admin().from('juridique_disponibilites').delete().eq('profil_id', profilId);
      const rows = (req.body.disponibilites || []).map(d => ({ ...d, profil_id: profilId }));
      if (rows.length) {
        const { error } = await admin().from('juridique_disponibilites').insert(rows);
        if (error) throw error;
      }
      const { data } = await admin().from('juridique_disponibilites')
        .select('*').eq('profil_id', profilId).order('jour_semaine');
      res.json({ success: true, disponibilites: data || [] });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  router.delete('/agenda/disponibilites/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      await admin().from('juridique_disponibilites')
        .delete().eq('id', req.params.id).eq('profil_id', profilId);
      res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // --- Blocages ---
  router.get('/agenda/blocages', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.json({ success: true, blocages: [] });
      const { data } = await admin().from('juridique_blocages')
        .select('*').eq('profil_id', profilId).order('date_debut', { ascending: false });
      res.json({ success: true, blocages: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  router.post('/agenda/blocages', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(400).json({ error: 'Profil requis' });
      const { data, error } = await admin().from('juridique_blocages')
        .insert({ ...req.body, profil_id: profilId }).select('*').single();
      if (error) throw error;
      res.json({ success: true, blocage: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  router.delete('/agenda/blocages/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      await admin().from('juridique_blocages')
        .delete().eq('id', req.params.id).eq('profil_id', profilId);
      res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // --- Bloquer journée entière (annule tous les RDV) ---
  router.post('/agenda/bloquer-journee', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(400).json({ error: 'Profil requis' });
      const { date, motif } = req.body;
      if (!date) return res.status(400).json({ error: 'date requise' });

      // Créer le blocage
      await admin().from('juridique_blocages').insert({
        profil_id: profilId, date_debut: date, date_fin: date,
        motif: motif || 'Journée bloquée', journee_entiere: true
      });

      // Récupérer et annuler les RDV de ce jour
      const { data: rdvs } = await admin().from('juridique_reservations')
        .select('*').eq('profil_id', profilId).eq('date_rdv', date)
        .in('statut', ['en_attente', 'confirme']);

      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      let annules = 0, rembourses = 0;

      for (const rdv of (rdvs || [])) {
        // Annuler la réservation
        await admin().from('juridique_reservations')
          .update({ statut: 'annule_pro' }).eq('id', rdv.id);

        // Rembourser via Stripe si paiement effectué
        if (rdv.stripe_payment_intent_id) {
          try {
            await stripe.refunds.create({ payment_intent: rdv.stripe_payment_intent_id });
            await admin().from('juridique_reservations')
              .update({ statut: 'rembourse' }).eq('id', rdv.id);
            rembourses++;
          } catch (e) { console.error('[Juridique] Remboursement échoué:', e.message); }
        }

        // Email au client
        try {
          const { data: profil } = await admin().from('juridique_profil')
            .select('titre, nom, prenom').eq('id', profilId).single();
          const nomPro = `${profil.titre || ''} ${profil.prenom} ${profil.nom}`.trim();
          await mailer.sendMail({
            to: rdv.client_email,
            subject: `Annulation de votre consultation — JADOMI`,
            html: `<p>Bonjour ${rdv.client_prenom || rdv.client_nom},</p>
              <p>Votre consultation avec ${nomPro} prévue le ${date} a été annulée par le professionnel.</p>
              <p>${rdv.stripe_payment_intent_id ? `Vous serez remboursé(e) de ${rdv.prix_total}€ sous 3-5 jours ouvrés.` : ''}</p>
              <p>Nous vous invitons à réserver un nouveau créneau sur sa page.</p>
              <p>Cordialement,<br>L'équipe JADOMI</p>`
          });
        } catch (e) { console.error('[Juridique] Email annulation échoué:', e.message); }

        annules++;
      }

      res.json({ success: true, annules, rembourses });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
};
