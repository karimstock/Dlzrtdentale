// =============================================
// JADOMI LABO — Routes teintiers (lecture seule)
// =============================================

const express = require('express');
const router = express.Router();
const { admin } = require('../../api/multiSocietes/middleware');

// GET /api/labo/teintiers — Liste tous les systemes de teintiers
router.get('/', async (req, res) => {
  try {
    const { type } = req.query; // dent | gencive

    let query = admin()
      .from('teintiers')
      .select('*')
      .order('code_systeme')
      .order('ordre_affichage');

    if (type) query = query.eq('type', type);

    const { data, error } = await query;
    if (error) throw error;

    // Grouper par systeme
    const systemes = {};
    for (const t of (data || [])) {
      if (!systemes[t.code_systeme]) {
        systemes[t.code_systeme] = {
          code: t.code_systeme,
          nom: t.nom_systeme,
          fabricant: t.fabricant,
          type: t.type,
          teintes: []
        };
      }
      systemes[t.code_systeme].teintes.push({
        id: t.id,
        code: t.code_teinte,
        description: t.description,
        groupe: t.groupe,
        couleur_hex: t.couleur_hex
      });
    }

    res.json({ systemes: Object.values(systemes) });
  } catch (e) {
    console.error('[LABO teintiers]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/labo/teintiers/:code — Teintes d'un systeme
router.get('/:code', async (req, res) => {
  try {
    const { data, error } = await admin()
      .from('teintiers')
      .select('*')
      .eq('code_systeme', req.params.code)
      .order('ordre_affichage');

    if (error) throw error;
    if (!data || data.length === 0) return res.status(404).json({ error: 'Système non trouvé' });

    res.json({
      code: data[0].code_systeme,
      nom: data[0].nom_systeme,
      fabricant: data[0].fabricant,
      type: data[0].type,
      teintes: data.map(t => ({
        id: t.id,
        code: t.code_teinte,
        description: t.description,
        groupe: t.groupe,
        couleur_hex: t.couleur_hex
      }))
    });
  } catch (e) {
    console.error('[LABO teintier detail]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
