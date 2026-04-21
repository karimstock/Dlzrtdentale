// JADOMI — BTP : Chantiers (module central)
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');

async function getProfilId(societeId) {
  const { data } = await admin().from('btp_profil').select('id').eq('societe_id', societeId).maybeSingle();
  return data?.id;
}

async function generateReference(profilId, year) {
  const { count } = await admin().from('btp_chantiers')
    .select('id', { count: 'exact', head: true })
    .eq('profil_id', profilId)
    .gte('created_at', `${year}-01-01`)
    .lt('created_at', `${year + 1}-01-01`);
  const seq = ((count || 0) + 1).toString().padStart(3, '0');
  return `CH-${year}-${seq}`;
}

module.exports = function (router) {
  // GET liste chantiers avec filtres
  router.get('/chantiers', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      let q = admin().from('btp_chantiers')
        .select('*, client:client_id(id, nom, prenom, telephone)')
        .eq('profil_id', profilId)
        .order('date_debut', { ascending: false });

      if (req.query.statut) q = q.eq('statut', req.query.statut);
      if (req.query.date_debut_from) q = q.gte('date_debut', req.query.date_debut_from);
      if (req.query.date_debut_to) q = q.lte('date_debut', req.query.date_debut_to);
      if (req.query.ouvrier) {
        q = q.contains('ouvriers_ids', [req.query.ouvrier]);
      }

      const { data, error } = await q;
      if (error) throw error;
      res.json({ success: true, chantiers: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // GET agenda view
  router.get('/chantiers/agenda', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const { from, to, ouvrier_id } = req.query;
      if (!from || !to) return res.status(400).json({ error: 'from et to requis' });

      let q = admin().from('btp_chantiers')
        .select('id, reference, titre, statut, date_debut, date_fin, adresse, ouvriers_ids, client:client_id(id, nom, prenom)')
        .eq('profil_id', profilId)
        .lte('date_debut', to)
        .or(`date_fin.gte.${from},date_fin.is.null`);

      if (ouvrier_id) {
        q = q.contains('ouvriers_ids', [ouvrier_id]);
      }

      const { data, error } = await q;
      if (error) throw error;
      res.json({ success: true, chantiers: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // POST creer chantier
  router.post('/chantiers', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const year = new Date().getFullYear();
      const reference = await generateReference(profilId, year);

      const { data, error } = await admin().from('btp_chantiers')
        .insert({ ...req.body, profil_id: profilId, reference })
        .select('*').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'create', entity: 'btp_chantiers', entityId: data.id, req });
      res.json({ success: true, chantier: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // GET detail chantier complet
  router.get('/chantiers/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const { data: chantier, error } = await admin().from('btp_chantiers')
        .select('*, client:client_id(*)')
        .eq('id', req.params.id).eq('profil_id', profilId).single();
      if (error) throw error;

      const [devisRes, facturesRes, rapportsRes] = await Promise.all([
        admin().from('btp_devis').select('*').eq('chantier_id', req.params.id).order('created_at', { ascending: false }),
        admin().from('btp_factures').select('*').eq('chantier_id', req.params.id).order('created_at', { ascending: false }),
        admin().from('btp_rapports').select('*').eq('chantier_id', req.params.id).order('date_intervention', { ascending: false })
      ]);

      res.json({
        success: true,
        chantier,
        devis: devisRes.data || [],
        factures: facturesRes.data || [],
        rapports: rapportsRes.data || []
      });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // PATCH modifier chantier
  router.patch('/chantiers/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const { data, error } = await admin().from('btp_chantiers')
        .update({ ...req.body, updated_at: new Date().toISOString() })
        .eq('id', req.params.id).eq('profil_id', profilId)
        .select('*').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'update', entity: 'btp_chantiers', entityId: data.id, req });
      res.json({ success: true, chantier: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // PATCH changer statut chantier
  router.patch('/chantiers/:id/statut', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const { statut } = req.body;
      if (!statut) return res.status(400).json({ error: 'statut requis' });

      const updates = { statut, updated_at: new Date().toISOString() };

      // Logique specifique par statut
      if (statut === 'termine') {
        // Calculer duree reelle depuis les rapports
        const { data: rapports } = await admin().from('btp_rapports')
          .select('duree_heures').eq('chantier_id', req.params.id);
        if (rapports && rapports.length > 0) {
          updates.duree_reelle = rapports.reduce((sum, r) => sum + (r.duree_heures || 0), 0);
        }

        // Calculer cout materiaux depuis mouvements de stock
        const { data: mouvements } = await admin().from('btp_stock_mouvements')
          .select('cout_total').eq('chantier_id', req.params.id).eq('type', 'sortie');
        if (mouvements && mouvements.length > 0) {
          updates.cout_materiaux = mouvements.reduce((sum, m) => sum + (m.cout_total || 0), 0);
        }

        // Calculer marge si montant total disponible
        const { data: chantier } = await admin().from('btp_chantiers')
          .select('montant_total_ht').eq('id', req.params.id).single();
        if (chantier?.montant_total_ht && updates.cout_materiaux !== undefined) {
          updates.marge = chantier.montant_total_ht - (updates.cout_materiaux || 0);
        }

        updates.date_fin_reelle = new Date().toISOString();
      }

      if (statut === 'facture') {
        const { data: facture } = await admin().from('btp_factures')
          .select('id').eq('chantier_id', req.params.id).limit(1).maybeSingle();
        if (!facture) return res.status(400).json({ error: 'Aucune facture associee a ce chantier' });
      }

      const { data, error } = await admin().from('btp_chantiers')
        .update(updates).eq('id', req.params.id).eq('profil_id', profilId)
        .select('*').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'status_change', entity: 'btp_chantiers', entityId: data.id,
        meta: { statut }, req });
      res.json({ success: true, chantier: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
};
