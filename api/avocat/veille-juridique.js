// =============================================
// JADOMI AVOCAT — Veille Juridique Automatique
// Surveille les nouvelles décisions pour chaque dossier actif
// Alimente la mémoire juridique par dossier
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { veilleJuridique, veilleTousDossiers, enrichWithLegalData } = require('../../lib/legal-providers/legal-rag');
const { sessionFormation, sessionFormationGlobale } = require('../../lib/legal-providers/legal-formateurs');

let _admin = null;
function admin() {
  if (!_admin) {
    _admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

// === AUTH MIDDLEWARE ===
async function requireAvocat(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requis' });
    const { data: { user }, error } = await admin().auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Token invalide' });
    req.userId = user.id;
    const societeId = req.headers['x-societe-id'];
    if (societeId) {
      const { data: role } = await admin().from('user_societe_roles')
        .select('societe_id').eq('user_id', user.id).eq('societe_id', societeId).single();
      if (role) req.societeId = role.societe_id;
    }
    if (!req.societeId) {
      const { data: first } = await admin().from('user_societe_roles')
        .select('societe_id').eq('user_id', user.id).limit(1).single();
      if (first) req.societeId = first.societe_id;
    }
    if (!req.societeId) return res.status(400).json({ error: 'Aucune organisation' });
    next();
  } catch {
    return res.status(401).json({ error: 'Authentification échouée' });
  }
}

// ================================================
// POST /veille/:dossierId — Lancer la veille pour un dossier
// ================================================
router.post('/veille/:dossierId', requireAvocat, async (req, res) => {
  try {
    const result = await veilleJuridique(req.params.dossierId, req.societeId);
    return res.json(result);
  } catch (err) {
    console.error('[veille-juridique]', err.message);
    return res.status(500).json({ error: 'Erreur veille juridique' });
  }
});

// ================================================
// POST /veille-globale — Veille tous les dossiers actifs
// ================================================
router.post('/veille-globale', requireAvocat, async (req, res) => {
  try {
    const result = await veilleTousDossiers(req.societeId);
    return res.json(result);
  } catch (err) {
    console.error('[veille-juridique/globale]', err.message);
    return res.status(500).json({ error: 'Erreur veille globale' });
  }
});

// ================================================
// GET /memoire/:dossierId — Mémoire juridique d'un dossier
// ================================================
router.get('/memoire/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { data, error } = await admin().from('legal_dossier_memory')
      .select('*')
      .eq('dossier_id', req.params.dossierId)
      .order('score_pertinence', { ascending: false });

    if (error) return res.status(500).json({ error: 'Erreur récupération mémoire' });

    const byType = {};
    (data || []).forEach(m => {
      if (!byType[m.type]) byType[m.type] = [];
      byType[m.type].push(m);
    });

    return res.json({
      total: (data || []).length,
      par_type: byType,
      items: data || []
    });
  } catch (err) {
    console.error('[veille-juridique/memoire]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// POST /memoire/:dossierId — Ajouter manuellement une référence
// ================================================
router.post('/memoire/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { type, titre, contenu, source_ref, score_pertinence } = req.body || {};
    if (!titre) return res.status(400).json({ error: 'Titre requis' });

    const { data, error } = await admin().from('legal_dossier_memory').insert({
      dossier_id: req.params.dossierId,
      societe_id: req.societeId,
      type: type || 'note_avocat',
      titre,
      contenu: contenu || null,
      source_ref: source_ref || null,
      source_provider: 'manuel',
      score_pertinence: score_pertinence || 80,
      validated_by: req.userId,
      validated_at: new Date().toISOString()
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  } catch (err) {
    console.error('[veille-juridique/memoire POST]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// PATCH /memoire/:id/valider — Valider/scorer une référence
// ================================================
router.patch('/memoire/:id/valider', requireAvocat, async (req, res) => {
  try {
    const { score_pertinence } = req.body || {};
    const { error } = await admin().from('legal_dossier_memory')
      .update({
        validated_by: req.userId,
        validated_at: new Date().toISOString(),
        score_pertinence: score_pertinence || 90
      })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// DELETE /memoire/:id — Supprimer une référence
// ================================================
router.delete('/memoire/:id', requireAvocat, async (req, res) => {
  try {
    const { error } = await admin().from('legal_dossier_memory')
      .delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// PATCH /dossier/:dossierId/keywords — Mettre à jour les mots-clés de veille
// ================================================
router.patch('/dossier/:dossierId/keywords', requireAvocat, async (req, res) => {
  try {
    const { keywords } = req.body || {};
    if (!Array.isArray(keywords)) return res.status(400).json({ error: 'keywords (tableau) requis' });

    const { error } = await admin().from('avocat_dossiers')
      .update({ veille_keywords: keywords })
      .eq('id', req.params.dossierId)
      .eq('avocat_societe_id', req.societeId);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, keywords });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// GET /historique-veille/:dossierId — Historique des veilles
// ================================================
router.get('/historique-veille/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { data, error } = await admin().from('legal_veille_log')
      .select('*')
      .eq('dossier_id', req.params.dossierId)
      .order('checked_at', { ascending: false })
      .limit(20);

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// POST /enrich — Enrichir une question avec des sources réelles (pour le chat IA)
// ================================================
router.post('/enrich', requireAvocat, async (req, res) => {
  try {
    const { question, dossier_id } = req.body || {};
    if (!question) return res.status(400).json({ error: 'question requis' });

    const dossierContext = dossier_id ? { dossierId: dossier_id } : null;
    const result = await enrichWithLegalData(question, dossierContext);

    return res.json({
      keywords: result.keywords,
      sources_count: result.sources.length,
      sources: result.sources,
      context_for_ia: result.context
    });
  } catch (err) {
    console.error('[veille-juridique/enrich]', err.message);
    return res.status(500).json({ error: 'Erreur enrichissement' });
  }
});

// ================================================
// POST /formateurs — Lancer une session de formation IA (3 formateurs)
// ================================================
router.post('/formateurs', requireAvocat, async (req, res) => {
  try {
    const result = await sessionFormation(req.societeId);
    return res.json(result);
  } catch (err) {
    console.error('[veille-juridique/formateurs]', err.message);
    return res.status(500).json({ error: 'Erreur session formation' });
  }
});

// ================================================
// POST /formateurs-globale — Lancer la formation pour TOUS les cabinets (admin)
// ================================================
router.post('/formateurs-globale', requireAvocat, async (req, res) => {
  try {
    const result = await sessionFormationGlobale();
    return res.json(result);
  } catch (err) {
    console.error('[veille-juridique/formateurs-globale]', err.message);
    return res.status(500).json({ error: 'Erreur formation globale' });
  }
});

module.exports = router;
