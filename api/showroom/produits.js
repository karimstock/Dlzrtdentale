// JADOMI — Showroom Créateurs : Produits (vente / location / sur_mesure)
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');

async function getProfilId(societeId) {
  const { data } = await admin().from('showroom_profil')
    .select('id').eq('societe_id', societeId).maybeSingle();
  return data?.id;
}

module.exports = function (router) {
  // GET tous les produits du créateur
  router.get('/produits', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.json({ success: true, produits: [] });

      let query = admin().from('showroom_produits')
        .select('*').eq('profil_id', profilId);

      if (req.query.type) query = query.eq('type', req.query.type);
      if (req.query.categorie) query = query.eq('categorie', req.query.categorie);
      if (req.query.collection) query = query.eq('collection', req.query.collection);
      if (req.query.actif !== undefined) query = query.eq('actif', req.query.actif === 'true');

      query = query.order('created_at', { ascending: false });
      const { data } = await query;
      res.json({ success: true, produits: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // GET un produit
  router.get('/produits/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const { data } = await admin().from('showroom_produits')
        .select('*').eq('id', req.params.id).eq('profil_id', profilId).maybeSingle();
      if (!data) return res.status(404).json({ error: 'Produit introuvable' });
      res.json({ success: true, produit: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // POST créer un produit
  router.post('/produits', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(400).json({ error: 'Créez d\'abord votre profil créateur' });

      const { nom, type, categorie, prix_vente } = req.body;
      if (!nom || !type || !categorie) return res.status(400).json({ error: 'nom, type et categorie requis' });
      if (!['vente', 'location', 'sur_mesure'].includes(type))
        return res.status(400).json({ error: 'type doit être vente, location ou sur_mesure' });

      const produit = {
        profil_id: profilId,
        nom,
        type,
        categorie,
        description: req.body.description || null,
        prix_vente: req.body.prix_vente || null,
        prix_location_jour: req.body.prix_location_jour || null,
        caution_location: req.body.caution_location || null,
        duree_location_min: req.body.duree_location_min || null,
        duree_location_max: req.body.duree_location_max || null,
        delai_sur_mesure_jours: req.body.delai_sur_mesure_jours || null,
        prix_sur_mesure_base: req.body.prix_sur_mesure_base || null,
        photos: req.body.photos || [],
        tailles: req.body.tailles || [],
        couleurs: req.body.couleurs || [],
        matieres: req.body.matieres || [],
        collection: req.body.collection || null,
        stock: req.body.stock || null,
        poids: req.body.poids || null,
        dimensions: req.body.dimensions || null,
        // Champs bijouterie
        metal: req.body.metal || null,
        pierres: req.body.pierres || null,
        poincon: req.body.poincon || null,
        certificat: req.body.certificat || null,
        gravure: req.body.gravure || false,
        taille_bague: req.body.taille_bague || null,
        // Meta
        actif: true,
        nb_vues: 0
      };

      const { data, error } = await admin().from('showroom_produits')
        .insert(produit).select('*').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'create', entity: 'showroom_produit', entityId: data.id, req });
      res.json({ success: true, produit: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // PATCH modifier un produit
  router.patch('/produits/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const updates = { ...req.body, updated_at: new Date().toISOString() };
      const { data, error } = await admin().from('showroom_produits')
        .update(updates).eq('id', req.params.id).eq('profil_id', profilId)
        .select('*').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'update', entity: 'showroom_produit', entityId: data.id, req });
      res.json({ success: true, produit: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // DELETE un produit (soft delete)
  router.delete('/produits/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const { data, error } = await admin().from('showroom_produits')
        .update({ actif: false, updated_at: new Date().toISOString() })
        .eq('id', req.params.id).eq('profil_id', profilId)
        .select('id').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'delete', entity: 'showroom_produit', entityId: data.id, req });
      res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // POST générer une description via JADOMI IA (Haiku)
  router.post('/produits/ia-description', requireSociete(), async (req, res) => {
    try {
      const { nom, categorie, type, matieres, couleurs, metal, pierres } = req.body;
      if (!nom) return res.status(400).json({ error: 'nom requis' });

      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic();

      const prompt = `Tu es un rédacteur expert en e-commerce créateur/artisan pour la plateforme JADOMI.
Rédige une description produit élégante et vendeuse en français (150-200 mots) pour :
- Nom : ${nom}
- Catégorie : ${categorie || 'Non précisée'}
- Type : ${type || 'vente'}
- Matières : ${(matieres || []).join(', ') || 'Non précisées'}
- Couleurs : ${(couleurs || []).join(', ') || 'Non précisées'}
${metal ? '- Métal : ' + metal : ''}
${pierres ? '- Pierres : ' + pierres : ''}
La description doit être poétique, raffinée, mettre en valeur le savoir-faire artisanal et le made in France.`;

      const message = await client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }]
      });

      const description = message.content[0]?.text || '';
      res.json({ success: true, description });
    } catch (e) {
      console.error('[showroom/ia-description]', e.message);
      res.status(500).json({ success: false, error: 'Erreur JADOMI IA : ' + e.message });
    }
  });

  // GET collections
  router.get('/collections', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.json({ success: true, collections: [] });
      const { data } = await admin().from('showroom_produits')
        .select('collection').eq('profil_id', profilId).not('collection', 'is', null);
      const unique = [...new Set((data || []).map(d => d.collection).filter(Boolean))];
      res.json({ success: true, collections: unique });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
};
