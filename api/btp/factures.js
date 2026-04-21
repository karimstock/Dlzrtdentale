// JADOMI — BTP : Factures
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');
const mailer = require('../multiSocietes/mailer');

async function getProfilId(societeId) {
  const { data } = await admin().from('btp_profil').select('id').eq('societe_id', societeId).maybeSingle();
  return data?.id;
}

async function generateNumero(profilId, year) {
  const { count } = await admin().from('btp_factures')
    .select('id', { count: 'exact', head: true })
    .eq('profil_id', profilId)
    .gte('created_at', `${year}-01-01`)
    .lt('created_at', `${year + 1}-01-01`);
  const seq = ((count || 0) + 1).toString().padStart(3, '0');
  return `FACT-${year}-${seq}`;
}

module.exports = function (router) {
  // GET liste factures
  router.get('/factures', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      let q = admin().from('btp_factures')
        .select('*, chantier:chantier_id(id, reference, titre), client:client_id(id, nom, prenom)')
        .eq('profil_id', profilId)
        .order('created_at', { ascending: false });

      if (req.query.statut) q = q.eq('statut', req.query.statut);
      if (req.query.type_facture) q = q.eq('type_facture', req.query.type_facture);
      const { data, error } = await q;
      if (error) throw error;
      res.json({ success: true, factures: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // POST creer facture
  router.post('/factures', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const year = new Date().getFullYear();
      const numero = await generateNumero(profilId, year);

      let insertData = {
        ...req.body,
        profil_id: profilId,
        numero,
        statut: req.body.statut || 'brouillon'
      };

      // Pour les factures de situation : tracker avancement et deduire acomptes
      if (req.body.type_facture === 'situation' || req.body.type_facture === 'finale') {
        if (req.body.chantier_id) {
          // Recuperer les acomptes deja verses
          const { data: acomptes } = await admin().from('btp_factures')
            .select('total_ttc')
            .eq('chantier_id', req.body.chantier_id)
            .eq('profil_id', profilId)
            .eq('type_facture', 'acompte')
            .eq('statut', 'payee');
          const acomptes_verses = (acomptes || []).reduce((s, a) => s + (a.total_ttc || 0), 0);
          insertData.acomptes_verses = acomptes_verses;

          if (req.body.pct_avancement) {
            insertData.pct_avancement = req.body.pct_avancement;
          }
        }
      }

      const { data, error } = await admin().from('btp_factures')
        .insert(insertData).select('*').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'create', entity: 'btp_factures', entityId: data.id, req });
      res.json({ success: true, facture: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // GET detail facture
  router.get('/factures/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const { data, error } = await admin().from('btp_factures')
        .select('*, chantier:chantier_id(*), client:client_id(*), devis:devis_id(*)')
        .eq('id', req.params.id).eq('profil_id', profilId).single();
      if (error) throw error;
      res.json({ success: true, facture: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // PATCH marquer facture comme payee
  router.patch('/factures/:id/paiement', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const { mode_paiement } = req.body;
      const { data, error } = await admin().from('btp_factures')
        .update({
          statut: 'payee',
          date_paiement: new Date().toISOString(),
          mode_paiement: mode_paiement || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', req.params.id).eq('profil_id', profilId)
        .select('*').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'payment', entity: 'btp_factures', entityId: data.id,
        meta: { mode_paiement }, req });
      res.json({ success: true, facture: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // POST envoyer facture par email
  router.post('/factures/:id/envoyer', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const { data: facture, error } = await admin().from('btp_factures')
        .select('*, client:client_id(*)')
        .eq('id', req.params.id).eq('profil_id', profilId).single();
      if (error) throw error;

      if (!facture.client?.email) return res.status(400).json({ error: 'Le client n\'a pas d\'adresse email' });

      await mailer.send({
        to: facture.client.email,
        subject: `Facture ${facture.numero}`,
        html: `<p>Bonjour ${facture.client.prenom || ''} ${facture.client.nom || ''},</p>
               <p>Veuillez trouver ci-joint votre facture <strong>${facture.numero}</strong> d'un montant de <strong>${facture.total_ttc} EUR TTC</strong>.</p>
               <p>Cordialement,</p>`
      });

      const { data: updated } = await admin().from('btp_factures')
        .update({ statut: 'envoyee', date_envoi: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .select('*').single();

      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'send', entity: 'btp_factures', entityId: facture.id, req });
      res.json({ success: true, facture: updated });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // GET PDF facture (placeholder — retourne JSON)
  router.get('/factures/:id/pdf', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const { data: facture, error } = await admin().from('btp_factures')
        .select('*, chantier:chantier_id(*), client:client_id(*)')
        .eq('id', req.params.id).eq('profil_id', profilId).single();
      if (error) throw error;

      const { data: profil } = await admin().from('btp_profil')
        .select('*').eq('id', profilId).single();

      // Placeholder: retourner les donnees pour generation PDF
      res.json({
        success: true,
        pdf_data: {
          profil,
          facture,
          generated_at: new Date().toISOString(),
          note: 'Generation PDF a implementer — JADOMI IA'
        }
      });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
};
