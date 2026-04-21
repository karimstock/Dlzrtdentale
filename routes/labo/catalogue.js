// =============================================
// JADOMI LABO — Routes catalogue produits
// =============================================

const express = require('express');
const router = express.Router();
const { admin } = require('../../api/multiSocietes/middleware');

// GET /api/labo/catalogue — Liste produits
router.get('/', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { categorie, sous_categorie, search, actif } = req.query;
    let query = admin()
      .from('catalogue_produits')
      .select('*')
      .eq('prothesiste_id', req.prothesisteId)
      .order('categorie').order('ordre_affichage');

    if (actif !== 'all') query = query.eq('est_actif', true);
    if (categorie) query = query.eq('categorie', categorie);
    if (sous_categorie) query = query.eq('sous_categorie', sous_categorie);
    if (search) query = query.or(`nom.ilike.%${search}%,description.ilike.%${search}%`);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ produits: data || [] });
  } catch (e) {
    console.error('[LABO catalogue GET]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/labo/catalogue/categories — Liste categories distinctes
router.get('/categories', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { data, error } = await admin()
      .from('catalogue_produits')
      .select('categorie, sous_categorie')
      .eq('prothesiste_id', req.prothesisteId)
      .eq('est_actif', true);

    if (error) throw error;

    const categories = {};
    for (const row of (data || [])) {
      if (!categories[row.categorie]) categories[row.categorie] = new Set();
      if (row.sous_categorie) categories[row.categorie].add(row.sous_categorie);
    }

    const result = Object.entries(categories).map(([cat, subs]) => ({
      categorie: cat,
      sous_categories: [...subs]
    }));

    res.json({ categories: result });
  } catch (e) {
    console.error('[LABO categories]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/labo/catalogue — Ajouter produit
router.post('/', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const b = req.body;
    const { data, error } = await admin()
      .from('catalogue_produits')
      .insert({
        prothesiste_id: req.prothesisteId,
        categorie: b.categorie,
        sous_categorie: b.sous_categorie,
        nom: b.nom,
        description: b.description,
        code_ccam: b.code_ccam,
        prix_unitaire: b.prix_unitaire,
        tva_applicable: b.tva_applicable || false,
        taux_tva: b.taux_tva || 0,
        type_produit: b.type_produit,
        necessite_teinte: b.necessite_teinte || false,
        necessite_teinte_gingivale: b.necessite_teinte_gingivale || false,
        necessite_materiau: b.necessite_materiau || false,
        source_ajout: b.source_ajout || 'manuel',
        ordre_affichage: b.ordre_affichage || 0
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, produit: data });
  } catch (e) {
    console.error('[LABO catalogue POST]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/labo/catalogue/:id — Modifier produit
router.put('/:id', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const updates = {};
    const allowed = [
      'categorie', 'sous_categorie', 'nom', 'description', 'code_ccam',
      'prix_unitaire', 'tva_applicable', 'taux_tva', 'type_produit',
      'necessite_teinte', 'necessite_teinte_gingivale', 'necessite_materiau',
      'est_actif', 'ordre_affichage'
    ];
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    const { data, error } = await admin()
      .from('catalogue_produits')
      .update(updates)
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, produit: data });
  } catch (e) {
    console.error('[LABO catalogue PUT]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/labo/catalogue/:id — Desactiver produit
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await admin()
      .from('catalogue_produits')
      .update({ est_actif: false })
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId);

    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error('[LABO catalogue DELETE]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
