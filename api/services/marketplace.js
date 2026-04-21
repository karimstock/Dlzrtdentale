// =============================================
// JADOMI — Services : Marketplace (Produits vente + location)
// =============================================
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');
const { sendMail } = require('../multiSocietes/mailer');

module.exports = function (router) {
  // ── Produits ──

  // LIST produits
  router.get('/produits', requireSociete(), async (req, res) => {
    try {
      const { type, categorie } = req.query;
      let query = admin()
        .from('services_produits')
        .select('*')
        .eq('societe_id', req.societe.id)
        .order('nom', { ascending: true });
      if (type) query = query.eq('type', type); // 'vente' ou 'location'
      if (categorie) query = query.eq('categorie', categorie);
      const { data, error } = await query;
      if (error) throw error;
      res.json({ produits: data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // CREATE produit
  router.post('/produits', requireSociete(), async (req, res) => {
    try {
      const { nom, description, type, categorie, prix, prix_location_jour, caution,
              stock_quantite, photo_url, actif } = req.body;
      const { data, error } = await admin()
        .from('services_produits')
        .insert({
          societe_id: req.societe.id,
          nom, description,
          type: type || 'vente',
          categorie: categorie || null,
          prix: prix || 0,
          prix_location_jour: prix_location_jour || null,
          caution: caution || null,
          stock_quantite: stock_quantite || 0,
          photo_url: photo_url || null,
          actif: actif !== false
        })
        .select()
        .single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id, action: 'produit_create', entity: 'services_produits', entityId: data.id, req });
      res.json({ produit: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // UPDATE produit
  router.patch('/produits/:id', requireSociete(), async (req, res) => {
    try {
      const updates = {};
      ['nom', 'description', 'type', 'categorie', 'prix', 'prix_location_jour', 'caution',
       'stock_quantite', 'photo_url', 'actif']
        .forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
      updates.updated_at = new Date().toISOString();
      const { data, error } = await admin()
        .from('services_produits')
        .update(updates)
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id)
        .select()
        .single();
      if (error) throw error;
      res.json({ produit: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE produit
  router.delete('/produits/:id', requireSociete(), async (req, res) => {
    try {
      const { error } = await admin()
        .from('services_produits')
        .delete()
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Commandes ──

  // LIST commandes
  router.get('/commandes', requireSociete(), async (req, res) => {
    try {
      const { statut, type } = req.query;
      let query = admin()
        .from('services_commandes')
        .select('*, produit:produit_id(nom, type, prix, caution, photo_url)')
        .eq('societe_id', req.societe.id)
        .order('created_at', { ascending: false });
      if (statut) query = query.eq('statut', statut);
      if (type) query = query.eq('type', type);
      const { data, error } = await query;
      if (error) throw error;
      res.json({ commandes: data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // CREATE commande
  router.post('/commandes', requireSociete(), async (req, res) => {
    try {
      const { produit_id, type, client_nom, client_email, client_telephone,
              quantite, montant_total, caution_montant, date_debut, date_fin, notes } = req.body;
      const { data, error } = await admin()
        .from('services_commandes')
        .insert({
          societe_id: req.societe.id,
          produit_id, type: type || 'vente',
          client_nom, client_email, client_telephone,
          quantite: quantite || 1,
          montant_total: montant_total || 0,
          caution_montant: caution_montant || null,
          caution_statut: caution_montant ? 'en_attente' : null,
          date_debut: date_debut || null,
          date_fin: date_fin || null,
          notes: notes || null,
          statut: 'en_cours'
        })
        .select()
        .single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id, action: 'commande_create', entity: 'services_commandes', entityId: data.id, req });
      res.json({ commande: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH commande (statut, caution)
  router.patch('/commandes/:id', requireSociete(), async (req, res) => {
    try {
      const updates = {};
      ['statut', 'caution_statut', 'notes', 'date_retour_effectif']
        .forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
      updates.updated_at = new Date().toISOString();

      // Si retour location, gérer caution
      if (req.body.statut === 'retourne') {
        const { data: cmd } = await admin()
          .from('services_commandes')
          .select('*, produit:produit_id(nom, caution)')
          .eq('id', req.params.id)
          .eq('societe_id', req.societe.id)
          .single();
        if (cmd && !req.body.caution_statut) {
          updates.caution_statut = 'a_rembourser';
        }
        updates.date_retour_effectif = new Date().toISOString();
      }

      const { data, error } = await admin()
        .from('services_commandes')
        .update(updates)
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id)
        .select()
        .single();
      if (error) throw error;
      res.json({ commande: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE commande
  router.delete('/commandes/:id', requireSociete(), async (req, res) => {
    try {
      const { error } = await admin()
        .from('services_commandes')
        .delete()
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
};
