// JADOMI — BTP : Stock & Materiaux
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');

async function getProfilId(societeId) {
  const { data } = await admin().from('btp_profil').select('id').eq('societe_id', societeId).maybeSingle();
  return data?.id;
}

module.exports = function (router) {
  // GET liste stock
  router.get('/stock', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      let q = admin().from('btp_stock').select('*').eq('profil_id', profilId).order('designation');
      if (req.query.categorie) q = q.eq('categorie', req.query.categorie);
      if (req.query.alerte === 'true') q = q.filter('quantite', 'lte', 'seuil_alerte');
      const { data, error } = await q;
      if (error) throw error;
      res.json({ success: true, stock: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // GET alertes stock bas
  router.get('/stock/alertes', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      // Items ou quantite <= seuil_alerte (via RPC ou filtre cote client)
      const { data: all, error } = await admin().from('btp_stock')
        .select('*').eq('profil_id', profilId).order('designation');
      if (error) throw error;

      const alertes = (all || []).filter(item =>
        item.seuil_alerte != null && item.quantite <= item.seuil_alerte
      );
      res.json({ success: true, alertes });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // GET mouvements stock
  router.get('/stock/mouvements', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      let q = admin().from('btp_stock_mouvements')
        .select('*, stock:stock_id(id, designation), chantier:chantier_id(id, reference, titre)')
        .eq('profil_id', profilId)
        .order('created_at', { ascending: false });

      if (req.query.chantier_id) q = q.eq('chantier_id', req.query.chantier_id);
      if (req.query.stock_id) q = q.eq('stock_id', req.query.stock_id);
      const { data, error } = await q;
      if (error) throw error;
      res.json({ success: true, mouvements: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // POST creer item stock
  router.post('/stock', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const { data, error } = await admin().from('btp_stock')
        .insert({ ...req.body, profil_id: profilId })
        .select('*').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'create', entity: 'btp_stock', entityId: data.id, req });
      res.json({ success: true, stock: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // PATCH modifier item stock
  router.patch('/stock/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const { data, error } = await admin().from('btp_stock')
        .update({ ...req.body, updated_at: new Date().toISOString() })
        .eq('id', req.params.id).eq('profil_id', profilId)
        .select('*').single();
      if (error) throw error;
      res.json({ success: true, stock: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // POST mouvement de stock
  router.post('/stock/:id/mouvement', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const { type, quantite, chantier_id, commentaire, cout_unitaire } = req.body;
      if (!type || !quantite) return res.status(400).json({ error: 'type et quantite requis' });
      if (!['entree', 'sortie', 'retour', 'inventaire'].includes(type)) {
        return res.status(400).json({ error: 'type invalide (entree, sortie, retour, inventaire)' });
      }

      // Creer le mouvement
      const { data: mouvement, error: errMvt } = await admin().from('btp_stock_mouvements')
        .insert({
          profil_id: profilId,
          stock_id: req.params.id,
          chantier_id: chantier_id || null,
          type,
          quantite,
          cout_unitaire: cout_unitaire || 0,
          cout_total: (quantite || 0) * (cout_unitaire || 0),
          commentaire: commentaire || null
        })
        .select('*').single();
      if (errMvt) throw errMvt;

      // Mettre a jour la quantite en stock
      const { data: stock } = await admin().from('btp_stock')
        .select('quantite').eq('id', req.params.id).eq('profil_id', profilId).single();
      if (!stock) return res.status(404).json({ error: 'Article non trouve' });

      let newQty = stock.quantite || 0;
      if (type === 'entree' || type === 'retour') newQty += quantite;
      else if (type === 'sortie') newQty -= quantite;
      else if (type === 'inventaire') newQty = quantite; // inventaire = set absolu

      await admin().from('btp_stock')
        .update({ quantite: newQty, updated_at: new Date().toISOString() })
        .eq('id', req.params.id);

      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'stock_movement', entity: 'btp_stock', entityId: req.params.id,
        meta: { type, quantite, mouvement_id: mouvement.id }, req });
      res.json({ success: true, mouvement, quantite_stock: newQty });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
};
