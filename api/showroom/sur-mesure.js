// JADOMI — Showroom Créateurs : Sur-mesure (demandes, devis, acompte 30%)
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');
const mailer = require('../multiSocietes/mailer');

const ACOMPTE_PCT = 30; // 30% d'acompte requis

async function getProfilId(societeId) {
  const { data } = await admin().from('showroom_profil')
    .select('id').eq('societe_id', societeId).maybeSingle();
  return data?.id;
}

module.exports = function (router) {
  // GET toutes les demandes sur mesure
  router.get('/sur-mesure', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.json({ success: true, demandes: [] });

      let query = admin().from('showroom_sur_mesure')
        .select('*, produit_ref:produit_id(nom, photos)')
        .eq('profil_id', profilId);

      if (req.query.statut) query = query.eq('statut', req.query.statut);
      query = query.order('created_at', { ascending: false });

      const { data } = await query;
      res.json({ success: true, demandes: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // GET une demande
  router.get('/sur-mesure/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const { data } = await admin().from('showroom_sur_mesure')
        .select('*, produit_ref:produit_id(nom, photos, categorie)')
        .eq('id', req.params.id).eq('profil_id', profilId).maybeSingle();
      if (!data) return res.status(404).json({ error: 'Demande introuvable' });
      res.json({ success: true, demande: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // POST envoyer un devis
  router.post('/sur-mesure/:id/devis', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const { prix_devis, delai_jours, description_devis, conditions } = req.body;

      if (!prix_devis || !delai_jours)
        return res.status(400).json({ error: 'prix_devis et delai_jours requis' });

      const acompte = Math.round(Number(prix_devis) * ACOMPTE_PCT) / 100;

      const { data, error } = await admin().from('showroom_sur_mesure')
        .update({
          prix_devis: Number(prix_devis),
          acompte_montant: acompte,
          acompte_pct: ACOMPTE_PCT,
          delai_jours: parseInt(delai_jours),
          description_devis: description_devis || null,
          conditions: conditions || null,
          statut: 'devis_envoye',
          devis_date: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', req.params.id).eq('profil_id', profilId)
        .select('*').single();
      if (error) throw error;

      // Envoyer le devis par email
      if (data.client_email) {
        const { data: profil } = await admin().from('showroom_profil')
          .select('nom_boutique').eq('id', profilId).maybeSingle();

        await mailer.sendMail({
          to: data.client_email,
          subject: `Devis sur-mesure — ${profil?.nom_boutique || 'JADOMI Showroom'}`,
          html: `<div style="font-family:sans-serif;max-width:600px;margin:auto;">
            <h2 style="color:#1a1a2e;">Votre devis sur-mesure</h2>
            <p>Bonjour ${data.client_prenom || data.client_nom},</p>
            <p>Suite à votre demande, voici notre devis :</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
              <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Description</td><td style="padding:8px;border-bottom:1px solid #eee;">${description_devis || data.description}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Prix total</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:700;">${prix_devis} €</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Acompte (${ACOMPTE_PCT}%)</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:700;">${acompte} €</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Délai estimé</td><td style="padding:8px;border-bottom:1px solid #eee;">${delai_jours} jours</td></tr>
            </table>
            ${conditions ? '<p style="font-size:13px;color:#666;"><strong>Conditions :</strong> ' + conditions + '</p>' : ''}
            <p>Pour accepter ce devis et régler l'acompte, rendez-vous sur votre espace JADOMI.</p>
            <p>Cordialement,<br>${profil?.nom_boutique || 'JADOMI Showroom'}</p>
          </div>`
        });
      }

      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'devis_sur_mesure', entity: 'showroom_sur_mesure', entityId: data.id,
        meta: { prix_devis, acompte, delai_jours }, req });
      res.json({ success: true, demande: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // PATCH mettre à jour le statut
  router.patch('/sur-mesure/:id/statut', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const { statut, notes } = req.body;

      const flowSM = ['nouvelle', 'devis_envoye', 'devis_accepte', 'acompte_recu', 'en_fabrication', 'terminee_fabrication', 'expediee', 'livree', 'terminee', 'refusee', 'annulee'];
      if (!flowSM.includes(statut))
        return res.status(400).json({ error: 'Statut invalide' });

      const updates = { statut, updated_at: new Date().toISOString() };
      if (notes) updates.notes_createur = notes;

      const { data, error } = await admin().from('showroom_sur_mesure')
        .update(updates).eq('id', req.params.id).eq('profil_id', profilId)
        .select('*').single();
      if (error) throw error;

      res.json({ success: true, demande: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // POST confirmer l'acompte (appelé après paiement Stripe)
  router.post('/sur-mesure/:id/acompte', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const { stripe_payment_intent_id } = req.body;

      const { data, error } = await admin().from('showroom_sur_mesure')
        .update({
          acompte_paye: true,
          acompte_date: new Date().toISOString(),
          stripe_acompte_intent_id: stripe_payment_intent_id || null,
          statut: 'acompte_recu',
          updated_at: new Date().toISOString()
        })
        .eq('id', req.params.id).eq('profil_id', profilId)
        .select('*').single();
      if (error) throw error;

      res.json({ success: true, demande: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
};
