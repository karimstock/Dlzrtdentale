// =============================================
// JADOMI LABO — Routes dentistes clients
// =============================================

const express = require('express');
const router = express.Router();
const { admin } = require('../../api/multiSocietes/middleware');
const { rechercherCabinet } = require('../../services/api-entreprises');

// GET /api/labo/dentistes — Liste dentistes
router.get('/', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { search, actif } = req.query;
    let query = admin()
      .from('dentistes_clients')
      .select('*')
      .eq('prothesiste_id', req.prothesisteId)
      .order('nom');

    if (actif !== 'all') query = query.eq('est_actif', true);
    if (search) query = query.or(`nom.ilike.%${search}%,prenom.ilike.%${search}%,raison_sociale_cabinet.ilike.%${search}%,email.ilike.%${search}%`);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ dentistes: data || [] });
  } catch (e) {
    console.error('[LABO dentistes GET]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/labo/dentistes/recherche-cabinet — Recherche API DINUM
router.get('/recherche-cabinet', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 3) return res.json({ total: 0, resultats: [] });

    const result = await rechercherCabinet(q);
    res.json(result);
  } catch (e) {
    console.error('[LABO recherche cabinet]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/labo/dentistes — Ajouter dentiste
router.post('/', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const b = req.body;
    if (!b.nom || !b.email) return res.status(400).json({ error: 'nom et email requis' });

    const { data, error } = await admin()
      .from('dentistes_clients')
      .insert({
        prothesiste_id: req.prothesisteId,
        reference_client: b.reference_client,
        titre: b.titre || 'Dr',
        nom: b.nom,
        prenom: b.prenom,
        raison_sociale_cabinet: b.raison_sociale_cabinet,
        siren: b.siren,
        siret: b.siret,
        adresse_ligne1: b.adresse_ligne1,
        adresse_ligne2: b.adresse_ligne2,
        code_postal: b.code_postal,
        ville: b.ville,
        telephone: b.telephone,
        email: b.email,
        rpps: b.rpps,
        source_creation: b.source_creation || 'manuel',
        notes: b.notes
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Email déjà utilisé pour ce labo' });
      throw error;
    }
    res.json({ success: true, dentiste: data });
  } catch (e) {
    console.error('[LABO dentistes POST]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/labo/dentistes/:id — Modifier dentiste
router.put('/:id', async (req, res) => {
  try {
    const updates = {};
    const allowed = [
      'reference_client', 'titre', 'nom', 'prenom', 'raison_sociale_cabinet',
      'siren', 'siret', 'adresse_ligne1', 'adresse_ligne2', 'code_postal',
      'ville', 'telephone', 'email', 'rpps', 'notes', 'est_actif'
    ];
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    const { data, error } = await admin()
      .from('dentistes_clients')
      .update(updates)
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, dentiste: data });
  } catch (e) {
    console.error('[LABO dentistes PUT]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/labo/dentistes/:id — Detail dentiste
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await admin()
      .from('dentistes_clients')
      .select('*')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Dentiste non trouve' });
    res.json({ dentiste: data });
  } catch (e) {
    console.error('[LABO dentiste detail]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
