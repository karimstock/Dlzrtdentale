// JADOMI — Showroom Créateurs : Favoris (requiert auth)
const { admin } = require('../multiSocietes/middleware');

module.exports = function (router) {
  // GET liste des favoris de l'utilisateur
  router.get('/favoris', async (req, res) => {
    try {
      const { data } = await admin().from('showroom_favoris')
        .select('*, produit:produit_id(id, nom, photos, prix_vente, prix_location_jour, categorie, type, profil:profil_id(nom_boutique, slug))')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false });
      res.json({ success: true, favoris: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // POST ajouter un favori
  router.post('/favoris', async (req, res) => {
    try {
      const { produit_id } = req.body;
      if (!produit_id) return res.status(400).json({ error: 'produit_id requis' });

      // Vérifier doublon
      const { data: existing } = await admin().from('showroom_favoris')
        .select('id').eq('user_id', req.user.id).eq('produit_id', produit_id).maybeSingle();
      if (existing) return res.json({ success: true, message: 'Déjà en favoris', favori: existing });

      const { data, error } = await admin().from('showroom_favoris')
        .insert({ user_id: req.user.id, produit_id })
        .select('*').single();
      if (error) throw error;
      res.json({ success: true, favori: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // DELETE retirer un favori
  router.delete('/favoris/:produitId', async (req, res) => {
    try {
      await admin().from('showroom_favoris')
        .delete().eq('user_id', req.user.id).eq('produit_id', req.params.produitId);
      res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // GET vérifier si un produit est en favoris
  router.get('/favoris/check/:produitId', async (req, res) => {
    try {
      const { data } = await admin().from('showroom_favoris')
        .select('id').eq('user_id', req.user.id).eq('produit_id', req.params.produitId).maybeSingle();
      res.json({ success: true, is_favori: !!data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
};
