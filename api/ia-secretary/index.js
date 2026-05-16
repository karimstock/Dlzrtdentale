// =============================================
// JADOMI — Secrétaire IA : API endpoints
// Analyse, optimisation et pilotage des agendas
// Auth Supabase + rate limiting
// =============================================
const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const brain = require('../../lib/ia-secretary/brain');

// ===== Supabase Auth middleware (même pattern que ia-doc) =====
function requireAuth() {
  const { authSupabase, requireSociete } = require('../multiSocietes/middleware');
  return async (req, res, next) => {
    authSupabase()(req, res, (err) => {
      if (err) return;
      if (res.headersSent) return;
      requireSociete()(req, res, (err2) => {
        if (err2) return;
        if (res.headersSent) return;
        next();
      });
    });
  };
}

// ===== Rate limiter (in-memory, 60 req/min/user) =====
const rateBuckets = new Map();
const RATE_LIMIT = 60;
const RATE_WINDOW = 60 * 1000;

function rateLimit() {
  return (req, res, next) => {
    const userId = req.user?.id || req.ip;
    const now = Date.now();
    let bucket = rateBuckets.get(userId);
    if (!bucket || now - bucket.start > RATE_WINDOW) {
      bucket = { start: now, count: 0 };
      rateBuckets.set(userId, bucket);
    }
    bucket.count++;
    if (bucket.count > RATE_LIMIT) {
      return res.status(429).json({ error: 'Trop de requêtes. Veuillez patienter.' });
    }
    next();
  };
}

// Nettoyage périodique des buckets
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now - bucket.start > RATE_WINDOW * 2) rateBuckets.delete(key);
  }
}, 5 * 60 * 1000);

// ===== OpenAI client (lazy singleton) =====
let _openai = null;
function openai() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY manquant');
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// ===== System prompt pour la secrétaire IA =====
function getSystemPrompt(metier) {
  const knowledge = brain.METIER_KNOWLEDGE[metier];
  const nomMetier = knowledge ? knowledge.nom : 'Cabinet médical';
  const regles = knowledge ? knowledge.regles_or.join('\n- ') : '';
  return `Vous êtes une secrétaire médicale IA experte pour un ${nomMetier}.
Vous connaissez parfaitement les règles de gestion d'agenda suivantes :
- ${regles}

Vous répondez toujours en français, de manière professionnelle et concise.
Vous ne prenez JAMAIS de décision médicale, uniquement de la gestion de planning.
Quand vous proposez des actions, vous les structurez en JSON exploitable.
Vouvoiement obligatoire dans tous les messages destinés aux patients.`;
}

// =============================================
// POST /analyze-day — Analyse intelligente d'une journée
// =============================================
router.post('/analyze-day', requireAuth(), rateLimit(), async (req, res) => {
  try {
    const { date, agenda_data, metier = 'dentiste' } = req.body;

    if (!agenda_data || !Array.isArray(agenda_data)) {
      return res.status(400).json({ error: 'agenda_data (array de RDV) requis' });
    }

    // Analyse déterministe (brain.js)
    const analyse = brain.analyzeDay(metier, agenda_data);

    // Si peu de problèmes, pas besoin d'IA
    if (analyse.alertes.length <= 1 && analyse.suggestions.length <= 1) {
      return res.json({
        date: date || new Date().toISOString().slice(0, 10),
        metier,
        ...analyse,
        ia_enrichi: false,
      });
    }

    // Enrichissement IA pour les cas complexes
    try {
      const completion = await openai().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: getSystemPrompt(metier) },
          { role: 'user', content: `Analysez cette journée du ${date || 'aujourd\'hui'} et donnez des conseils personnalisés.

Planning :
${JSON.stringify(agenda_data, null, 2)}

Alertes détectées automatiquement :
${analyse.alertes.map(a => `[${a.type}] ${a.message}`).join('\n')}

Statistiques : ${analyse.stats.nb_rdv} RDV, CA prévisionnel ${analyse.stats.ca_previsionnel}€, taux occupation ${analyse.stats.taux_occupation}%

Donnez 2-3 conseils concrets et actionnables pour améliorer cette journée. Format JSON : { "conseils": ["...", "..."], "score_commentaire": "..." }` }
        ],
        temperature: 0.3,
        max_tokens: 500,
      });

      let iaResponse = {};
      try {
        const content = completion.choices[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) iaResponse = JSON.parse(jsonMatch[0]);
      } catch (e) { /* Parse silencieux */ }

      return res.json({
        date: date || new Date().toISOString().slice(0, 10),
        metier,
        ...analyse,
        ia_enrichi: true,
        conseils_ia: iaResponse.conseils || [],
        commentaire_ia: iaResponse.score_commentaire || '',
      });
    } catch (aiErr) {
      // Fallback sans IA si OpenAI échoue
      console.warn('[IA-Secretary] OpenAI indisponible, réponse déterministe seule:', aiErr.message);
      return res.json({
        date: date || new Date().toISOString().slice(0, 10),
        metier,
        ...analyse,
        ia_enrichi: false,
      });
    }
  } catch (err) {
    console.error('[IA-Secretary] analyze-day error:', err);
    return res.status(500).json({ error: 'Erreur interne lors de l\'analyse' });
  }
});

// =============================================
// POST /analyze-week — Analyse d'une semaine complète
// =============================================
router.post('/analyze-week', requireAuth(), rateLimit(), async (req, res) => {
  try {
    const { semaine, metier = 'dentiste' } = req.body;

    if (!semaine || !Array.isArray(semaine)) {
      return res.status(400).json({ error: 'semaine (array de jours avec agenda) requis. Format : [{ date, rdvs: [] }, ...]' });
    }

    const knowledge = brain.METIER_KNOWLEDGE[metier];
    if (!knowledge) {
      return res.status(400).json({ error: `Métier inconnu : ${metier}. Disponibles : ${Object.keys(brain.METIER_KNOWLEDGE).join(', ')}` });
    }

    // Analyser chaque jour
    const joursAnalyses = semaine.map(jour => ({
      date: jour.date,
      ...brain.analyzeDay(metier, jour.rdvs || []),
    }));

    // Tendances hebdomadaires
    const totalRdv = joursAnalyses.reduce((s, j) => s + j.stats.nb_rdv, 0);
    const totalCA = joursAnalyses.reduce((s, j) => s + j.stats.ca_previsionnel, 0);
    const scoreMoyen = Math.round(joursAnalyses.reduce((s, j) => s + j.score, 0) / joursAnalyses.length);
    const joursPlusCharges = [...joursAnalyses].sort((a, b) => b.stats.nb_rdv - a.stats.nb_rdv);
    const joursProblematiques = joursAnalyses.filter(j => j.score < 60);

    const recommandations = [];
    // Équilibre de charge
    const ecartType = Math.sqrt(joursAnalyses.reduce((s, j) => s + Math.pow(j.stats.nb_rdv - totalRdv / joursAnalyses.length, 2), 0) / joursAnalyses.length);
    if (ecartType > 5) {
      recommandations.push('Charge très inégale entre les jours — redistribuer les RDV pour un meilleur équilibre');
    }
    // CA hebdo
    const kpis = knowledge.kpis || {};
    if (kpis.ca_objectif_jour && totalCA < kpis.ca_objectif_jour * joursAnalyses.length * 0.7) {
      recommandations.push(`CA hebdomadaire prévisionnel (${Math.round(totalCA)}€) en dessous de l'objectif — revoir le mix d'actes`);
    }
    // Jours problématiques
    if (joursProblematiques.length > 0) {
      recommandations.push(`${joursProblematiques.length} jour(s) avec un score critique — vérifier les alertes`);
    }

    return res.json({
      metier,
      nb_jours: joursAnalyses.length,
      score_moyen: scoreMoyen,
      note_semaine: scoreMoyen >= 80 ? 'Excellente semaine' : scoreMoyen >= 60 ? 'Semaine correcte' : 'Semaine à revoir',
      total_rdv: totalRdv,
      ca_previsionnel_semaine: Math.round(totalCA * 100) / 100,
      jours: joursAnalyses,
      jour_plus_charge: joursPlusCharges[0]?.date || null,
      jour_plus_leger: joursPlusCharges[joursPlusCharges.length - 1]?.date || null,
      recommandations,
    });
  } catch (err) {
    console.error('[IA-Secretary] analyze-week error:', err);
    return res.status(500).json({ error: 'Erreur interne lors de l\'analyse hebdomadaire' });
  }
});

// =============================================
// POST /optimize — Proposer un planning optimisé
// =============================================
router.post('/optimize', requireAuth(), rateLimit(), async (req, res) => {
  try {
    const { date, current_rdvs, constraints = {}, metier = 'dentiste' } = req.body;

    if (!current_rdvs || !Array.isArray(current_rdvs)) {
      return res.status(400).json({ error: 'current_rdvs (array de RDV) requis' });
    }

    const result = brain.optimizeDay(metier, current_rdvs, constraints);

    return res.json({
      date: date || new Date().toISOString().slice(0, 10),
      metier,
      ...result,
      nb_changements: result.changements.length,
      amelioration: result.score_apres - result.score_avant,
    });
  } catch (err) {
    console.error('[IA-Secretary] optimize error:', err);
    return res.status(500).json({ error: 'Erreur interne lors de l\'optimisation' });
  }
});

// =============================================
// POST /plan-treatment — Planifier un plan de traitement
// =============================================
router.post('/plan-treatment', requireAuth(), rateLimit(), async (req, res) => {
  try {
    const { patient, actes_necessaires, agenda_existant = [], metier = 'dentiste' } = req.body;

    if (!actes_necessaires || !Array.isArray(actes_necessaires) || actes_necessaires.length === 0) {
      return res.status(400).json({ error: 'actes_necessaires (array d\'actes) requis' });
    }

    const plan = brain.planTreatment(metier, patient, actes_necessaires, agenda_existant);

    return res.json({
      metier,
      ...plan,
    });
  } catch (err) {
    console.error('[IA-Secretary] plan-treatment error:', err);
    return res.status(500).json({ error: 'Erreur interne lors de la planification' });
  }
});

// =============================================
// POST /find-slot — Trouver un créneau intelligent
// =============================================
router.post('/find-slot', requireAuth(), rateLimit(), async (req, res) => {
  try {
    const { acte, duree, urgence, contraintes_patient = {}, agenda_jour, metier = 'dentiste' } = req.body;

    if (!acte) {
      return res.status(400).json({ error: 'acte (type d\'acte) requis' });
    }
    if (!agenda_jour || !Array.isArray(agenda_jour)) {
      return res.status(400).json({ error: 'agenda_jour (array de RDV existants) requis' });
    }

    const contraintes = {
      ...contraintes_patient,
      urgence: urgence || false,
      duree_override: duree || null,
    };

    const slots = brain.findBestSlot(metier, agenda_jour, acte, contraintes);

    if (slots.length === 0) {
      return res.json({
        metier,
        acte,
        slots: [],
        message: 'Aucun créneau disponible pour cet acte aujourd\'hui — essayer un autre jour',
      });
    }

    return res.json({
      metier,
      acte,
      duree_prevue: slots[0]?.duree || duree || 30,
      slots,
      recommandation: slots[0]?.raison || '',
    });
  } catch (err) {
    console.error('[IA-Secretary] find-slot error:', err);
    return res.status(500).json({ error: 'Erreur interne lors de la recherche de créneau' });
  }
});

// =============================================
// POST /detect-gaps — Détecter les trous et proposer des remplissages
// =============================================
router.post('/detect-gaps', requireAuth(), rateLimit(), async (req, res) => {
  try {
    const { date_range, agenda, metier = 'dentiste' } = req.body;

    if (!agenda || !Array.isArray(agenda)) {
      return res.status(400).json({ error: 'agenda (array de RDV) requis' });
    }

    const gaps = brain.detectGaps(metier, agenda);

    // Calculer le temps perdu
    const tempsPerdu = gaps.reduce((s, g) => s + g.duree, 0);
    const knowledge = brain.METIER_KNOWLEDGE[metier];
    const caPerdu = knowledge && knowledge.kpis ?
      Math.round((tempsPerdu / 60) * (knowledge.kpis.ca_objectif_jour || 500) / 8) : 0;

    return res.json({
      metier,
      date_range: date_range || 'aujourd\'hui',
      nb_gaps: gaps.length,
      temps_perdu_min: tempsPerdu,
      ca_potentiel_perdu: caPerdu,
      gaps,
      conseil: gaps.length > 3
        ? 'Beaucoup de trous détectés — envisager de regrouper les RDV ou d\'ouvrir des créneaux en ligne'
        : gaps.length > 0
          ? 'Quelques créneaux récupérables — contacter les patients en liste d\'attente'
          : 'Planning bien optimisé, pas de trous significatifs',
    });
  } catch (err) {
    console.error('[IA-Secretary] detect-gaps error:', err);
    return res.status(500).json({ error: 'Erreur interne lors de la détection de trous' });
  }
});

// =============================================
// POST /command — Commande vocale libre (NLP → action)
// =============================================
router.post('/command', requireAuth(), rateLimit(), async (req, res) => {
  try {
    const { text, context = {}, metier = 'dentiste' } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text (commande en langage naturel) requis' });
    }

    const knowledge = brain.METIER_KNOWLEDGE[metier];
    const actesDisponibles = knowledge ? Object.keys(knowledge.actes).join(', ') : '';

    const completion = await openai().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `${getSystemPrompt(metier)}

Vous recevez des commandes vocales en langage naturel pour gérer l'agenda.
Vous devez les transformer en actions structurées.

Actions possibles :
- deplacer_rdv : { patient, nouvelle_heure, nouvelle_date? }
- annuler_rdv : { patient, heure?, date?, motif? }
- creer_rdv : { patient, acte, heure?, date?, duree? }
- bloquer_creneau : { debut, fin, date?, motif }
- rechercher_creneau : { acte, duree, contraintes? }
- noter_absence : { debut, fin, date_debut, date_fin?, motif }
- rappeler_patient : { patient, message? }
- lister_rdv : { date?, patient? }
- autre : { description }

Actes disponibles pour ce métier : ${actesDisponibles}

Répondez UNIQUEMENT en JSON avec ce format :
{
  "action": "nom_action",
  "params": { ... },
  "confirmation_message": "Message de confirmation à lire au praticien",
  "requires_validation": true/false
}

Si la commande est ambiguë, demandez une clarification via confirmation_message et mettez requires_validation: true.`
        },
        {
          role: 'user',
          content: `Commande : "${text}"
${context.agenda_actuel ? `\nAgenda actuel :\n${JSON.stringify(context.agenda_actuel, null, 2)}` : ''}
${context.date ? `\nDate concernée : ${context.date}` : ''}`
        }
      ],
      temperature: 0.2,
      max_tokens: 500,
    });

    const content = completion.choices[0]?.message?.content || '';
    let result = {};
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) result = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return res.json({
        action: 'erreur_parsing',
        params: {},
        confirmation_message: 'Je n\'ai pas compris votre demande. Pouvez-vous reformuler ?',
        requires_validation: true,
        raw: content,
      });
    }

    return res.json({
      action: result.action || 'autre',
      params: result.params || {},
      confirmation_message: result.confirmation_message || 'Action comprise.',
      requires_validation: result.requires_validation !== false,
      metier,
    });
  } catch (err) {
    console.error('[IA-Secretary] command error:', err);
    if (err.message?.includes('OPENAI_API_KEY')) {
      return res.status(503).json({ error: 'Service IA indisponible (configuration manquante)' });
    }
    return res.status(500).json({ error: 'Erreur interne lors du traitement de la commande' });
  }
});

// =============================================
// GET /metiers — Liste des métiers supportés (utilitaire)
// =============================================
router.get('/metiers', requireAuth(), rateLimit(), (req, res) => {
  const metiers = Object.entries(brain.METIER_KNOWLEDGE).map(([key, val]) => ({
    id: key,
    nom: val.nom,
    nb_actes: Object.keys(val.actes).length,
    nb_regles: val.regles_or.length,
  }));
  return res.json({ metiers });
});

// =============================================
// GET /knowledge/:metier — Détail des connaissances d'un métier
// =============================================
router.get('/knowledge/:metier', requireAuth(), rateLimit(), (req, res) => {
  const metier = req.params.metier;
  const knowledge = brain.METIER_KNOWLEDGE[metier];
  if (!knowledge) {
    return res.status(404).json({ error: `Métier inconnu : ${metier}` });
  }
  return res.json({ metier, ...knowledge });
});

// =============================================
// POST /score-noshow — Score de risque no-show patient
// =============================================
router.post('/score-noshow', requireAuth(), rateLimit(), (req, res) => {
  try {
    const { patient } = req.body;
    if (!patient) {
      return res.status(400).json({ error: 'patient (objet avec historique) requis' });
    }
    const result = brain.scoreNoShow(patient);
    return res.json(result);
  } catch (err) {
    console.error('[IA-Secretary] score-noshow error:', err);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /api/ia-secretary/triage — Triage urgence patient (texte libre → motif + durée + niveau)
router.post('/triage', requireAuth(), rateLimit(), (req, res) => {
  try {
    const { texte, overrides, historique } = req.body;
    if (!texte) return res.status(400).json({ error: 'texte (description du problème) requis' });
    const result = brain.triageUrgence(texte, overrides || {}, historique || {});
    return res.json(result);
  } catch (err) {
    console.error('[IA-Secretary] triage error:', err);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// GET /api/ia-secretary/urgence-motifs — Liste des motifs d'urgence configurables
router.get('/urgence-motifs', requireAuth(), (req, res) => {
  try {
    const motifs = brain.getUrgenceMotifs(req.query.overrides ? JSON.parse(req.query.overrides) : {});
    return res.json(motifs);
  } catch (err) {
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = router;
