// JADOMI — Showroom Créateurs : Commandes
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');
const mailer = require('../multiSocietes/mailer');

const COMMISSION_PCT = parseFloat(process.env.JADOMI_SHOWROOM_COMMISSION_PCT || '5');

async function getProfilId(societeId) {
  const { data } = await admin().from('showroom_profil')
    .select('id').eq('societe_id', societeId).maybeSingle();
  return data?.id;
}

module.exports = function (router) {
  // GET toutes les commandes du créateur
  router.get('/commandes', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.json({ success: true, commandes: [] });

      let query = admin().from('showroom_commandes')
        .select('*, produit:produit_id(nom, type, categorie, photos)')
        .eq('profil_id', profilId);

      if (req.query.statut) query = query.eq('statut', req.query.statut);
      if (req.query.type) query = query.eq('type', req.query.type);

      query = query.order('created_at', { ascending: false });
      const limit = Math.min(parseInt(req.query.limit || '50'), 200);
      query = query.limit(limit);

      const { data } = await query;
      res.json({ success: true, commandes: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // GET une commande
  router.get('/commandes/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const { data } = await admin().from('showroom_commandes')
        .select('*, produit:produit_id(*)')
        .eq('id', req.params.id).eq('profil_id', profilId).maybeSingle();
      if (!data) return res.status(404).json({ error: 'Commande introuvable' });
      res.json({ success: true, commande: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // PATCH mettre à jour le statut
  router.patch('/commandes/:id/statut', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const { statut, tracking_number, tracking_url, notes } = req.body;

      // Flow de statuts autorisés
      const flowVente = ['en_attente', 'confirmee', 'en_preparation', 'expediee', 'livree', 'terminee', 'annulee'];
      const flowLocation = ['en_attente', 'confirmee', 'caution_encaissee', 'en_cours', 'retour_initie', 'retour_recu', 'caution_restituee', 'terminee', 'annulee'];
      const flowSurMesure = ['en_attente', 'devis_envoye', 'acompte_recu', 'en_fabrication', 'terminee_fabrication', 'expediee', 'livree', 'terminee', 'annulee'];

      const { data: cmd } = await admin().from('showroom_commandes')
        .select('statut, type').eq('id', req.params.id).eq('profil_id', profilId).maybeSingle();
      if (!cmd) return res.status(404).json({ error: 'Commande introuvable' });

      const flow = cmd.type === 'location' ? flowLocation : cmd.type === 'sur_mesure' ? flowSurMesure : flowVente;
      if (!flow.includes(statut)) return res.status(400).json({ error: 'Statut invalide pour ce type de commande' });

      const updates = { statut, updated_at: new Date().toISOString() };
      if (tracking_number) updates.tracking_number = tracking_number;
      if (tracking_url) updates.tracking_url = tracking_url;
      if (notes) updates.notes_createur = notes;

      const { data, error } = await admin().from('showroom_commandes')
        .update(updates).eq('id', req.params.id).eq('profil_id', profilId)
        .select('*, produit:produit_id(nom)').single();
      if (error) throw error;

      // Email au client pour certains statuts
      if (['confirmee', 'expediee', 'livree', 'retour_initie', 'caution_restituee'].includes(statut) && data.client_email) {
        const subjects = {
          confirmee: 'Commande confirmée',
          expediee: `Commande expédiée${tracking_number ? ' — ' + tracking_number : ''}`,
          livree: 'Commande livrée',
          retour_initie: 'Retour de location initialisé',
          caution_restituee: 'Caution restituée'
        };
        await mailer.sendMail({
          to: data.client_email,
          subject: `${subjects[statut]} — JADOMI Showroom`,
          html: `<div style="font-family:sans-serif;max-width:600px;margin:auto;">
            <h2 style="color:#1a1a2e;">Commande #${data.id.slice(0,8)}</h2>
            <p>Bonjour ${data.client_prenom || data.client_nom},</p>
            <p>Votre commande <strong>${data.produit?.nom || ''}</strong> est maintenant : <strong>${statut.replace(/_/g,' ')}</strong></p>
            ${tracking_number ? '<p>Numéro de suivi : <strong>' + tracking_number + '</strong></p>' : ''}
            ${tracking_url ? '<p><a href="' + tracking_url + '">Suivre mon colis</a></p>' : ''}
            <p>Cordialement,<br>L'équipe JADOMI</p>
          </div>`
        });
      }

      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'update_statut', entity: 'showroom_commande', entityId: data.id,
        meta: { ancien: cmd.statut, nouveau: statut }, req });
      res.json({ success: true, commande: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // POST gérer la caution (location)
  router.post('/commandes/:id/caution', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const { action } = req.body; // 'encaisser' ou 'restituer'

      const { data: cmd } = await admin().from('showroom_commandes')
        .select('*').eq('id', req.params.id).eq('profil_id', profilId).eq('type', 'location').maybeSingle();
      if (!cmd) return res.status(404).json({ error: 'Commande location introuvable' });

      if (action === 'encaisser') {
        await admin().from('showroom_commandes')
          .update({ caution_encaissee: true, statut: 'caution_encaissee', updated_at: new Date().toISOString() })
          .eq('id', cmd.id);
        res.json({ success: true, message: 'Caution encaissée' });
      } else if (action === 'restituer') {
        // Rembourser la caution via Stripe si applicable
        if (cmd.stripe_caution_intent_id) {
          const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
          await stripe.refunds.create({ payment_intent: cmd.stripe_caution_intent_id });
        }
        await admin().from('showroom_commandes')
          .update({ caution_restituee: true, statut: 'caution_restituee', updated_at: new Date().toISOString() })
          .eq('id', cmd.id);

        if (cmd.client_email) {
          await mailer.sendMail({
            to: cmd.client_email,
            subject: 'Caution restituée — JADOMI Showroom',
            html: `<p>Bonjour ${cmd.client_prenom || cmd.client_nom},</p>
              <p>Votre caution de ${cmd.caution_montant}€ pour la location a été restituée.</p>
              <p>Le remboursement apparaîtra sous 3-5 jours ouvrés.</p>
              <p>Cordialement,<br>L'équipe JADOMI</p>`
          });
        }
        res.json({ success: true, message: 'Caution restituée' });
      } else {
        res.status(400).json({ error: 'action doit être encaisser ou restituer' });
      }
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // POST initier un retour (location)
  router.post('/commandes/:id/retour', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const { data: cmd } = await admin().from('showroom_commandes')
        .select('*').eq('id', req.params.id).eq('profil_id', profilId).maybeSingle();
      if (!cmd) return res.status(404).json({ error: 'Commande introuvable' });

      const updates = {
        statut: req.body.statut || 'retour_initie',
        retour_date: req.body.retour_date || new Date().toISOString(),
        retour_notes: req.body.retour_notes || null,
        retour_etat: req.body.retour_etat || null,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await admin().from('showroom_commandes')
        .update(updates).eq('id', cmd.id).select('*').single();
      if (error) throw error;

      if (cmd.client_email) {
        await mailer.sendMail({
          to: cmd.client_email,
          subject: 'Retour de location — JADOMI Showroom',
          html: `<p>Bonjour ${cmd.client_prenom || cmd.client_nom},</p>
            <p>Le retour de votre location a été ${updates.statut === 'retour_recu' ? 'réceptionné' : 'initié'}.</p>
            ${updates.retour_notes ? '<p>Notes : ' + updates.retour_notes + '</p>' : ''}
            <p>Cordialement,<br>L'équipe JADOMI</p>`
        });
      }

      res.json({ success: true, commande: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // GET stats commandes
  router.get('/commandes-stats', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.json({ success: true, stats: {} });

      const today = new Date().toISOString().slice(0, 10);
      const monthStart = today.slice(0, 7) + '-01';

      const { data: all } = await admin().from('showroom_commandes')
        .select('statut, type, prix_total, commission_jadomi, created_at')
        .eq('profil_id', profilId);

      const commandes = all || [];
      const mois = commandes.filter(c => c.created_at >= monthStart);
      const terminees = commandes.filter(c => c.statut === 'terminee');
      const termMois = mois.filter(c => c.statut === 'terminee');

      const brut = termMois.reduce((s, c) => s + Number(c.prix_total || 0), 0);
      const commission = termMois.reduce((s, c) => s + Number(c.commission_jadomi || 0), 0);

      res.json({
        success: true,
        stats: {
          total: commandes.length,
          en_attente: commandes.filter(c => c.statut === 'en_attente').length,
          en_cours: commandes.filter(c => !['terminee', 'annulee'].includes(c.statut)).length,
          terminees: terminees.length,
          mois_brut: brut,
          mois_commission: commission,
          mois_net: brut - commission,
          ventes: commandes.filter(c => c.type === 'vente').length,
          locations: commandes.filter(c => c.type === 'location').length,
          sur_mesure: commandes.filter(c => c.type === 'sur_mesure').length
        }
      });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
};
