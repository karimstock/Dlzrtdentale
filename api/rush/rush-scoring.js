// =============================================
// JADOMI RUSH — Scoring prothesistes
// Evaluations, notes, badges
// =============================================

const express = require('express');

function createScoringRouter(supabase) {
  const router = express.Router();

  // GET /api/rush/scores — Classement anonyme des prothesistes
  router.get('/', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('v_scores_prothesistes')
        .select('*')
        .order('note_moyenne', { ascending: false })
        .limit(50);

      if (error) {
        // Vue peut ne pas exister
        if (/relation|does not exist/i.test(error.message)) {
          return res.json({ success: true, scores: [], warning: 'Vue v_scores_prothesistes non disponible' });
        }
        throw error;
      }

      // Anonymiser : jamais de vrai nom
      const scores = (data || []).map(s => ({
        id: s.id,
        alias: s.pseudo_anonyme,
        specialites: s.specialites,
        made_in: s.made_in,
        note_moyenne: parseFloat(s.note_moyenne) || 5,
        nb_travaux: s.nb_travaux || 0,
        taux_respect_delais: parseFloat(s.taux_respect_delais) || 100,
        taux_retouches: parseFloat(s.taux_retouches) || 0,
        badge: s.badge || 'nouveau'
      }));

      res.json({ success: true, scores });
    } catch (e) {
      console.error('[RUSH scores GET]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/rush/scores/:id — Score d'un prothesiste
  router.get('/:id', async (req, res) => {
    try {
      const { data } = await supabase
        .from('v_scores_prothesistes')
        .select('*')
        .eq('id', parseInt(req.params.id))
        .single();

      if (!data) return res.json({ success: true, score: null });

      res.json({
        success: true,
        score: {
          alias: data.pseudo_anonyme,
          note_moyenne: parseFloat(data.note_moyenne) || 5,
          nb_travaux: data.nb_travaux || 0,
          taux_respect_delais: parseFloat(data.taux_respect_delais) || 100,
          taux_retouches: parseFloat(data.taux_retouches) || 0,
          badge: data.badge || 'nouveau',
          specialites: data.specialites,
          made_in: data.made_in
        }
      });
    } catch (e) {
      console.error('[RUSH score detail]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/rush/evaluations — Evaluer un sous-traitant
  router.post('/evaluations', async (req, res) => {
    try {
      const { demande_id, evaluateur_id, evalue_id, note_qualite, note_delai, note_communication, commentaire, retouche } = req.body;
      if (!demande_id || !evaluateur_id || !evalue_id) {
        return res.status(400).json({ error: 'demande_id, evaluateur_id, evalue_id requis' });
      }

      const nq = parseInt(note_qualite) || 5;
      const nd = parseInt(note_delai) || 5;
      const nc = parseInt(note_communication) || 5;
      const moyenne = Math.round((nq + nd + nc) / 3 * 100) / 100;

      const { data, error } = await supabase.from('rush_evaluations').insert({
        demande_id: parseInt(demande_id),
        evaluateur_id: parseInt(evaluateur_id),
        evaluateur_type: 'prothesiste_principal',
        evalue_id: parseInt(evalue_id),
        note_qualite: nq,
        note_delai: nd,
        note_communication: nc,
        note_moyenne: moyenne,
        commentaire: commentaire || null,
        retouche_demandee: !!retouche
      }).select().single();

      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Evaluation deja soumise pour cette demande' });
        throw error;
      }

      // Mettre a jour note moyenne du prothesiste
      const { data: allEvals } = await supabase
        .from('rush_evaluations')
        .select('note_moyenne')
        .eq('evalue_id', parseInt(evalue_id));

      if (allEvals && allEvals.length > 0) {
        const avg = allEvals.reduce((s, e) => s + parseFloat(e.note_moyenne), 0) / allEvals.length;
        await supabase.from('prothesistes')
          .update({ note_moyenne: Math.round(avg * 100) / 100 })
          .eq('id', parseInt(evalue_id));
      }

      res.json({ success: true, evaluation: data });
    } catch (e) {
      console.error('[RUSH evaluation POST]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

module.exports = { createScoringRouter };
