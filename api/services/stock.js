// =============================================
// JADOMI — Services : Gestion de stock
// =============================================
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');

module.exports = function (router) {
  // LIST stock
  router.get('/stock', requireSociete(), async (req, res) => {
    try {
      const { alerte, categorie } = req.query;
      let query = admin()
        .from('services_stock')
        .select('*')
        .eq('societe_id', req.societe.id)
        .order('nom', { ascending: true });
      if (categorie) query = query.eq('categorie', categorie);
      if (alerte === 'true') query = query.lte('quantite', admin().rpc ? 0 : 0); // will filter client-side

      const { data, error } = await query;
      if (error) throw error;
      let items = data || [];
      if (alerte === 'true') {
        items = items.filter(i => i.quantite <= (i.seuil_alerte || 5));
      }
      res.json({ stock: items });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET single
  router.get('/stock/:id', requireSociete(), async (req, res) => {
    try {
      const { data, error } = await admin()
        .from('services_stock')
        .select('*')
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id)
        .single();
      if (error) throw error;
      res.json({ item: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // CREATE
  router.post('/stock', requireSociete(), async (req, res) => {
    try {
      const { nom, reference, code_barre, categorie, quantite, seuil_alerte, prix_achat, prix_vente, fournisseur, photo_url } = req.body;
      const { data, error } = await admin()
        .from('services_stock')
        .insert({
          societe_id: req.societe.id,
          nom, reference: reference || null,
          code_barre: code_barre || null,
          categorie: categorie || null,
          quantite: quantite || 0,
          seuil_alerte: seuil_alerte || 5,
          prix_achat: prix_achat || null,
          prix_vente: prix_vente || null,
          fournisseur: fournisseur || null,
          photo_url: photo_url || null
        })
        .select()
        .single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id, action: 'stock_create', entity: 'services_stock', entityId: data.id, req });
      res.json({ item: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // UPDATE
  router.patch('/stock/:id', requireSociete(), async (req, res) => {
    try {
      const updates = {};
      ['nom', 'reference', 'code_barre', 'categorie', 'quantite', 'seuil_alerte', 'prix_achat', 'prix_vente', 'fournisseur', 'photo_url']
        .forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
      updates.updated_at = new Date().toISOString();
      const { data, error } = await admin()
        .from('services_stock')
        .update(updates)
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id)
        .select()
        .single();
      if (error) throw error;
      res.json({ item: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE
  router.delete('/stock/:id', requireSociete(), async (req, res) => {
    try {
      const { error } = await admin()
        .from('services_stock')
        .delete()
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Mouvements de stock ──
  router.get('/stock/:id/mouvements', requireSociete(), async (req, res) => {
    try {
      const { data, error } = await admin()
        .from('services_stock_mouvements')
        .select('*')
        .eq('stock_id', req.params.id)
        .eq('societe_id', req.societe.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      res.json({ mouvements: data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/stock/:id/mouvements', requireSociete(), async (req, res) => {
    try {
      const { type, quantite, motif } = req.body;
      if (!type || !quantite) return res.status(400).json({ error: 'type et quantite requis' });

      // Create mouvement
      const { data: mvt, error: mvtErr } = await admin()
        .from('services_stock_mouvements')
        .insert({
          societe_id: req.societe.id,
          stock_id: req.params.id,
          type, // 'entree' | 'sortie' | 'ajustement'
          quantite,
          motif: motif || null,
          user_id: req.user.id
        })
        .select()
        .single();
      if (mvtErr) throw mvtErr;

      // Update stock quantity
      const { data: item } = await admin()
        .from('services_stock')
        .select('quantite')
        .eq('id', req.params.id)
        .single();

      const delta = type === 'sortie' ? -Math.abs(quantite) : Math.abs(quantite);
      const newQty = (item?.quantite || 0) + delta;

      await admin()
        .from('services_stock')
        .update({ quantite: Math.max(0, newQty), updated_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id);

      // Check alert
      const { data: updated } = await admin()
        .from('services_stock')
        .select('*')
        .eq('id', req.params.id)
        .single();

      const alerte = updated && updated.quantite <= (updated.seuil_alerte || 5);
      res.json({ mouvement: mvt, stock: updated, alerte });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Alertes stock ──
  router.get('/stock-alertes', requireSociete(), async (req, res) => {
    try {
      const { data, error } = await admin()
        .from('services_stock')
        .select('*')
        .eq('societe_id', req.societe.id);
      if (error) throw error;
      const alertes = (data || []).filter(i => i.quantite <= (i.seuil_alerte || 5));
      res.json({ alertes });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
};
