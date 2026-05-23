// =============================================
// JADOMI AVOCAT EXPERT — Scoring multi-critères dossier prud'homal
// Calcul de 5 scores : preuves, cohérence, risques, stratégie, global
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { dispatch } = require('../../lib/legal-providers/legal-ia-router');

// === Supabase admin client (service role) ===
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

// === HELPERS ===

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function daysBetween(dateStr1, dateStr2) {
  return Math.abs(Math.floor((new Date(dateStr1).getTime() - new Date(dateStr2).getTime()) / (1000 * 60 * 60 * 24)));
}

// ================================================
// Score 1 — Preuves (0-100)
// ================================================
async function calculerScorePreuves(dossierId, societeId) {
  const details = { base: 0, bonus_importance: 0, bonus_ocr: 0, malus_manquantes: 0 };

  // Pièces du dossier
  const { data: pieces } = await admin().from('avocat_pieces')
    .select('id, importance, texte_extrait')
    .eq('dossier_id', dossierId)
    .eq('societe_id', societeId);

  const nbPieces = (pieces || []).length;
  // Nombre attendu estimé : 10 pièces pour un dossier prud'homal standard
  const nbAttendu = 10;
  details.base = clamp(Math.round((nbPieces / nbAttendu) * 50), 0, 50);

  // Pièces importance élevée : +15 chacune (max 45)
  const elevees = (pieces || []).filter(p => p.importance === 'elevee');
  details.bonus_importance = clamp(elevees.length * 15, 0, 45);

  // Pièces avec texte extrait (qualité OCR) : +5 chacune
  const avecTexte = (pieces || []).filter(p => p.texte_extrait != null && p.texte_extrait !== '');
  details.bonus_ocr = avecTexte.length * 5;

  // Pièces manquantes priorité élevée : -20 chacune
  const { data: manquantes } = await admin().from('avocat_pieces_manquantes')
    .select('id, priorite')
    .eq('dossier_id', dossierId)
    .eq('priorite', 'elevee');

  details.malus_manquantes = (manquantes || []).length * -20;

  const score = clamp(details.base + details.bonus_importance + details.bonus_ocr + details.malus_manquantes, 0, 100);
  return { score, details };
}

// ================================================
// Score 2 — Cohérence chronologique (0-100)
// ================================================
async function calculerScoreCoherence(dossierId) {
  const details = { base: 0, malus_contradictions: 0, bonus_confiance: 0 };

  // Timeline events
  const { data: events } = await admin().from('avocat_timeline_events')
    .select('id, score_confiance')
    .eq('dossier_id', dossierId);

  const nbEvents = (events || []).length;
  details.base = nbEvents > 5 ? 80 : Math.round((nbEvents / 5) * 80);

  // Contradictions non résolues
  const { data: contradictions } = await admin().from('avocat_contradictions')
    .select('id, gravite, statut')
    .eq('dossier_id', dossierId)
    .neq('statut', 'resolu');

  let malusContradictions = 0;
  for (const c of (contradictions || [])) {
    if (c.gravite === 'critique') malusContradictions -= 25;
    else if (c.gravite === 'elevee') malusContradictions -= 15;
    else if (c.gravite === 'moyenne') malusContradictions -= 8;
  }
  details.malus_contradictions = malusContradictions;

  // Events avec score_confiance > 80 : +2 chacun (max 20)
  const fiables = (events || []).filter(e => e.score_confiance > 80);
  details.bonus_confiance = clamp(fiables.length * 2, 0, 20);

  const score = clamp(details.base + details.malus_contradictions + details.bonus_confiance, 0, 100);
  return { score, details };
}

// ================================================
// Score 3 — Risques procéduraux (0-100)
// ================================================
async function calculerScoreRisques(dossierId) {
  const details = { base: 100, malus_prescription: 0, malus_pieces_manquantes: 0, malus_pas_timeline: 0, malus_pas_contradictions: 0 };

  // Vérifier prescription : date_ouverture > 2 ans ET pas clos
  const { data: dossier } = await admin().from('avocat_dossiers')
    .select('date_ouverture, statut')
    .eq('id', dossierId)
    .single();

  if (dossier && dossier.date_ouverture && dossier.statut !== 'clos') {
    const joursDepuis = daysBetween(dossier.date_ouverture, new Date().toISOString());
    if (joursDepuis > 730) { // 2 ans = 730 jours
      details.malus_prescription = -40;
    }
  }

  // Pièces manquantes confirmées
  const { data: manquantes } = await admin().from('avocat_pieces_manquantes')
    .select('id, statut')
    .eq('dossier_id', dossierId)
    .in('statut', ['confirmee', 'en_attente']);

  details.malus_pieces_manquantes = (manquantes || []).length * -10;

  // Pas de timeline
  const { data: events, count: evtCount } = await admin().from('avocat_timeline_events')
    .select('id', { count: 'exact', head: true })
    .eq('dossier_id', dossierId);

  if (!evtCount || evtCount === 0) {
    details.malus_pas_timeline = -30;
  }

  // Pas de contradictions analysées
  const { data: contrad, count: cCount } = await admin().from('avocat_contradictions')
    .select('id', { count: 'exact', head: true })
    .eq('dossier_id', dossierId);

  if (!cCount || cCount === 0) {
    details.malus_pas_contradictions = -15;
  }

  const score = clamp(
    details.base + details.malus_prescription + details.malus_pieces_manquantes +
    details.malus_pas_timeline + details.malus_pas_contradictions,
    0, 100
  );
  return { score, details };
}

// ================================================
// Score 4 — Force stratégique (0-100)
// ================================================
async function calculerScoreStrategie(dossierId) {
  const details = { bonus_jurisprudences: 0, bonus_preparation: 0, bonus_analyse_complete: 0, bonus_veille: 0, bonus_sources: 0 };

  // Jurisprudences pertinentes (legal_dossier_memory)
  const { data: memories } = await admin().from('legal_dossier_memory')
    .select('id, score_pertinence')
    .eq('dossier_id', dossierId);

  details.bonus_jurisprudences = clamp((memories || []).length * 5, 0, 30);

  // Sources vérifiées (score_pertinence > 70) : +3 chacune (max 15)
  const sourcesVerifiees = (memories || []).filter(m => m.score_pertinence > 70);
  details.bonus_sources = clamp(sourcesVerifiees.length * 3, 0, 15);

  // Analyses existantes
  const { data: analyses } = await admin().from('avocat_analyses')
    .select('type_analyse')
    .eq('dossier_id', dossierId);

  const typesAnalyse = (analyses || []).map(a => a.type_analyse);
  if (typesAnalyse.includes('preparation_audience')) {
    details.bonus_preparation = 20;
  }
  if (typesAnalyse.includes('analyse_complete')) {
    details.bonus_analyse_complete = 25;
  }

  // Veille keywords définis
  const { data: dossier } = await admin().from('avocat_dossiers')
    .select('veille_keywords')
    .eq('id', dossierId)
    .single();

  if (dossier && dossier.veille_keywords && dossier.veille_keywords.length > 0) {
    details.bonus_veille = 10;
  }

  const score = clamp(
    details.bonus_jurisprudences + details.bonus_sources +
    details.bonus_preparation + details.bonus_analyse_complete + details.bonus_veille,
    0, 100
  );
  return { score, details };
}

// ================================================
// Score 5 — Solidité globale (moyenne pondérée)
// ================================================
function calculerScoreGlobal(preuves, coherence, risques, strategie) {
  return Math.round(
    preuves * 0.30 + coherence * 0.20 + risques * 0.25 + strategie * 0.25
  );
}

// ================================================
// POST /calculer/:dossierId — Calcul complet
// ================================================
router.post('/calculer/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const societeId = req.societeId;

    // Vérifier que le dossier existe et appartient à la société
    const { data: dossier } = await admin().from('avocat_dossiers')
      .select('id')
      .eq('id', dossierId)
      .eq('avocat_societe_id', societeId)
      .single();

    if (!dossier) {
      return res.status(404).json({ error: 'Dossier introuvable ou accès refusé' });
    }

    // Calculer les 5 scores
    const [preuves, coherence, risques, strategie] = await Promise.all([
      calculerScorePreuves(dossierId, societeId),
      calculerScoreCoherence(dossierId),
      calculerScoreRisques(dossierId),
      calculerScoreStrategie(dossierId)
    ]);

    const scoreGlobal = calculerScoreGlobal(
      preuves.score, coherence.score, risques.score, strategie.score
    );

    const details = {
      preuves: preuves.details,
      coherence: coherence.details,
      risques: risques.details,
      strategie: strategie.details,
      ponderations: { preuves: '30%', coherence: '20%', risques: '25%', strategie: '25%' }
    };

    const now = new Date().toISOString();

    // Upsert : update si existe, insert sinon
    const { data: existing } = await admin().from('avocat_dossier_scores')
      .select('id')
      .eq('dossier_id', dossierId)
      .single();

    let result;
    if (existing) {
      const { data, error } = await admin().from('avocat_dossier_scores')
        .update({
          societe_id: societeId,
          score_preuves: preuves.score,
          score_coherence: coherence.score,
          score_risques: risques.score,
          score_strategie: strategie.score,
          score_global: scoreGlobal,
          details,
          calculated_at: now
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await admin().from('avocat_dossier_scores')
        .insert({
          dossier_id: dossierId,
          societe_id: societeId,
          score_preuves: preuves.score,
          score_coherence: coherence.score,
          score_risques: risques.score,
          score_strategie: strategie.score,
          score_global: scoreGlobal,
          details,
          calculated_at: now
        })
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    return res.json({
      success: true,
      scoring: {
        score_preuves: preuves.score,
        score_coherence: coherence.score,
        score_risques: risques.score,
        score_strategie: strategie.score,
        score_global: scoreGlobal,
        details,
        calculated_at: now
      }
    });
  } catch (err) {
    console.error('[scoring-dossier] Erreur calcul:', err.message);
    return res.status(500).json({ error: 'Erreur lors du calcul du scoring', details: err.message });
  }
});

// ================================================
// GET /scores/:dossierId — Dernier scoring
// ================================================
router.get('/scores/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;

    // Vérifier accès
    const { data: dossier } = await admin().from('avocat_dossiers')
      .select('id')
      .eq('id', dossierId)
      .eq('avocat_societe_id', req.societeId)
      .single();

    if (!dossier) {
      return res.status(404).json({ error: 'Dossier introuvable ou accès refusé' });
    }

    const { data: scoring, error } = await admin().from('avocat_dossier_scores')
      .select('*')
      .eq('dossier_id', dossierId)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !scoring) {
      return res.status(404).json({ error: 'Aucun scoring disponible pour ce dossier. Lancez un calcul via POST /calculer.' });
    }

    return res.json({ success: true, scoring });
  } catch (err) {
    console.error('[scoring-dossier] Erreur lecture scores:', err.message);
    return res.status(500).json({ error: 'Erreur lors de la récupération du scoring', details: err.message });
  }
});

// ================================================
// GET /scores-batch — Scores de tous les dossiers actifs
// ================================================
router.get('/scores-batch', requireAvocat, async (req, res) => {
  try {
    const societeId = req.query.societe_id || req.societeId;

    if (!societeId) {
      return res.status(400).json({ error: 'Paramètre societe_id requis' });
    }

    // Dossiers actifs
    const { data: dossiers } = await admin().from('avocat_dossiers')
      .select('id, titre, statut')
      .eq('avocat_societe_id', societeId)
      .in('statut', ['en_cours', 'en_attente', 'nouveau']);

    if (!dossiers || dossiers.length === 0) {
      return res.json({ success: true, dossiers: [] });
    }

    const dossierIds = dossiers.map(d => d.id);

    // Récupérer les scores existants
    const { data: scores } = await admin().from('avocat_dossier_scores')
      .select('*')
      .in('dossier_id', dossierIds);

    // Mapper scores par dossier_id
    const scoresMap = {};
    for (const s of (scores || [])) {
      scoresMap[s.dossier_id] = s;
    }

    const result = dossiers.map(d => ({
      dossier_id: d.id,
      titre: d.titre,
      statut: d.statut,
      scoring: scoresMap[d.id] || null
    }));

    // Trier par score global croissant (les plus faibles en premier)
    result.sort((a, b) => {
      const sa = a.scoring ? a.scoring.score_global : -1;
      const sb = b.scoring ? b.scoring.score_global : -1;
      return sa - sb;
    });

    return res.json({ success: true, dossiers: result });
  } catch (err) {
    console.error('[scoring-dossier] Erreur scores-batch:', err.message);
    return res.status(500).json({ error: 'Erreur lors de la récupération des scores', details: err.message });
  }
});

// ================================================
// POST /recommandations/:dossierId — Recommandations IA
// ================================================
router.post('/recommandations/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;

    // Vérifier accès
    const { data: dossier } = await admin().from('avocat_dossiers')
      .select('id')
      .eq('id', dossierId)
      .eq('avocat_societe_id', req.societeId)
      .single();

    if (!dossier) {
      return res.status(404).json({ error: 'Dossier introuvable ou accès refusé' });
    }

    // Récupérer le scoring existant
    const { data: scoring } = await admin().from('avocat_dossier_scores')
      .select('*')
      .eq('dossier_id', dossierId)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single();

    if (!scoring) {
      return res.status(400).json({ error: 'Aucun scoring disponible. Veuillez d\'abord calculer le scoring via POST /calculer.' });
    }

    const systemPrompt = `Vous êtes un assistant juridique spécialisé en droit prud'homal français. Vous analysez les scores d'un dossier et fournissez des recommandations concrètes et actionnables pour améliorer la solidité du dossier. Utilisez le vouvoiement. Pas d'emoji. Répondez en français avec les accents corrects.`;

    const userPrompt = `Voici les scores d'un dossier prud'homal.
Score preuves : ${scoring.score_preuves}/100
Score cohérence chronologique : ${scoring.score_coherence}/100
Score risques procéduraux : ${scoring.score_risques}/100
Score force stratégique : ${scoring.score_strategie}/100
Score global : ${scoring.score_global}/100

Détails : ${JSON.stringify(scoring.details)}

Générez 3 à 5 recommandations concrètes et actionnables pour améliorer ce dossier. Format : liste numérotée, chaque recommandation en 1-2 phrases. Priorité aux actions les plus impactantes.`;

    const iaResult = await dispatch('summarize_dossier', systemPrompt, userPrompt);

    return res.json({
      success: true,
      recommandations: iaResult.result || iaResult,
      scoring_utilise: {
        score_preuves: scoring.score_preuves,
        score_coherence: scoring.score_coherence,
        score_risques: scoring.score_risques,
        score_strategie: scoring.score_strategie,
        score_global: scoring.score_global,
        calculated_at: scoring.calculated_at
      }
    });
  } catch (err) {
    console.error('[scoring-dossier] Erreur recommandations IA:', err.message);
    return res.status(500).json({ error: 'Erreur lors de la génération des recommandations', details: err.message });
  }
});

module.exports = router;
