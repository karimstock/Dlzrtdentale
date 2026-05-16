/**
 * JADOMI Agenda IA — Router Express
 *
 * Système intelligent de planification pour cabinet dentaire.
 * Analyse, optimisation et assistant vocal/texte pour la gestion d'agenda.
 *
 * Endpoints :
 *   - Analyse & Scoring (score sérénité, journées rouges, heatmap)
 *   - Optimisation (créneaux optimaux, suggestions de report, réorganisation)
 *   - Pauses & Protection (recommandations de pauses, protection journée rouge)
 *   - Gestion Patient (profil fiabilité, génération de messages)
 *   - Assistant Vocal/Texte (commandes naturelles, confirmation)
 *   - Configuration (règles cabinet, profil praticien)
 *   - Audit RGPD (logs d'actions IA)
 *
 * Mode simulation actif tant que le connecteur Doctolib n'est pas live.
 *
 * @author JADOMI
 * @version 1.0.0
 */

const router = require('express').Router();
const { createClient } = require('@supabase/supabase-js');

// Client Supabase avec clé service (accès complet)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Import du moteur IA d'agenda (logique métier)
let engine;
try {
  engine = require('../../lib/agenda-ia/engine');
} catch (e) {
  // En mode démo, on utilise un moteur simulé
  engine = null;
}

// =============================================================================
// MIDDLEWARE D'AUTHENTIFICATION
// =============================================================================

/**
 * Vérifie le token JWT Supabase et extrait l'utilisateur.
 * Refuse l'accès si le token est absent ou invalide.
 */
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Non autorisé', message: 'Token manquant' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Token invalide' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Erreur d\'authentification' });
  }
}

// Appliquer l'authentification à toutes les routes
router.use(authMiddleware);

// =============================================================================
// UTILITAIRES
// =============================================================================

/**
 * Enregistre une action IA dans la table d'audit (RGPD).
 */
async function logAction(userId, action, details = {}) {
  try {
    await supabase.from('agenda_ai_action_logs').insert({
      user_id: userId,
      action,
      details,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('[JADOMI Agenda IA] Erreur log action:', err.message);
  }
}

/**
 * Valide qu'une date est au format YYYY-MM-DD.
 */
function isValidDate(dateStr) {
  if (!dateStr) return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const d = new Date(dateStr);
  return d instanceof Date && !isNaN(d);
}

/**
 * Génère des données de démonstration pour une journée donnée.
 * Utilise un seed basé sur la date pour garantir la cohérence.
 */
function generateDemoDay(dateStr, practitionerId = 'default') {
  // Seed déterministe basé sur la date
  const seed = dateStr.split('-').join('');
  const seedNum = parseInt(seed) + (practitionerId.charCodeAt(0) || 0);
  const pseudo = (n) => ((seedNum * 9301 + 49297 + n * 233) % 233280) / 233280;

  const nbPatients = Math.floor(pseudo(1) * 12) + 8; // 8 à 20 patients
  const score = Math.max(10, Math.min(100, Math.floor(pseudo(2) * 60) + 40));
  const chargePercent = Math.floor((nbPatients / 20) * 100);

  // Générer les rendez-vous simulés
  const types = ['détartrage', 'consultation', 'extraction', 'prothèse', 'urgence', 'contrôle', 'implant'];
  const appointments = [];
  let heure = 8;
  let minutes = 30;

  for (let i = 0; i < nbPatients; i++) {
    const duree = [15, 20, 30, 45, 60][Math.floor(pseudo(i + 10) * 5)];
    const type = types[Math.floor(pseudo(i + 20) * types.length)];
    appointments.push({
      id: `demo-${dateStr}-${i}`,
      heure: `${String(heure).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
      duree,
      type,
      patient_id: `patient-demo-${Math.floor(pseudo(i + 30) * 1000)}`,
      patient_nom: `Patient ${i + 1}`
    });
    minutes += duree;
    if (minutes >= 60) {
      heure += Math.floor(minutes / 60);
      minutes = minutes % 60;
    }
  }

  return { nbPatients, score, chargePercent, appointments };
}

/**
 * Détermine si une journée est "rouge" (score < 40).
 */
function isRedDay(score) {
  return score < 40;
}

/**
 * Génère un label textuel pour un score de sérénité.
 */
function getScoreLabel(score) {
  if (score >= 80) return 'Excellente journée';
  if (score >= 60) return 'Journée équilibrée';
  if (score >= 40) return 'Journée chargée';
  return 'Journée rouge — attention surcharge';
}

// =============================================================================
// ANALYSE & SCORING
// =============================================================================

/**
 * GET /api/agenda-ia/analyze/:date
 * Analyse complète d'une journée spécifique.
 * Retourne score, alertes, suggestions et métriques détaillées.
 */
router.get('/analyze/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const { practitioner_id } = req.query;

    if (!isValidDate(date)) {
      return res.status(400).json({ error: 'Date invalide. Format attendu : YYYY-MM-DD' });
    }

    const demo = generateDemoDay(date, practitioner_id);

    // Alertes basées sur les métriques
    const alertes = [];
    if (demo.nbPatients > 16) alertes.push({ type: 'surcharge', message: 'Plus de 16 patients prévus' });
    if (demo.chargePercent > 90) alertes.push({ type: 'saturation', message: 'Taux de remplissage critique' });
    if (demo.score < 40) alertes.push({ type: 'journee_rouge', message: 'Journée rouge détectée' });

    // Suggestions d'amélioration
    const suggestions = [];
    if (demo.nbPatients > 14) {
      suggestions.push({ action: 'reporter', message: 'Envisager de reporter 1-2 contrôles sur un jour calme' });
    }
    if (demo.appointments.filter(a => a.type === 'urgence').length > 2) {
      suggestions.push({ action: 'redistribuer', message: 'Trop d\'urgences concentrées, redistribuer si possible' });
    }

    await logAction(req.user.id, 'analyze_day', { date, practitioner_id });

    res.json({
      mode: 'simulation',
      date,
      practitioner_id: practitioner_id || 'default',
      score: demo.score,
      alertes,
      suggestions,
      metrics: {
        nb_patients: demo.nbPatients,
        charge_percent: demo.chargePercent,
        duree_totale_min: demo.appointments.reduce((sum, a) => sum + a.duree, 0),
        types_actes: [...new Set(demo.appointments.map(a => a.type))]
      },
      journee_rouge: isRedDay(demo.score)
    });
  } catch (err) {
    console.error('[Agenda IA] Erreur analyze:', err);
    res.status(500).json({ error: 'Erreur interne lors de l\'analyse' });
  }
});

/**
 * GET /api/agenda-ia/score/:date
 * Score de sérénité uniquement (endpoint léger).
 */
router.get('/score/:date', async (req, res) => {
  try {
    const { date } = req.params;

    if (!isValidDate(date)) {
      return res.status(400).json({ error: 'Date invalide. Format attendu : YYYY-MM-DD' });
    }

    const demo = generateDemoDay(date);

    // Décomposition du score
    const breakdown = {
      charge_patients: Math.min(30, Math.floor((20 - demo.nbPatients) / 20 * 30)),
      variete_actes: Math.floor(Math.random() * 20) + 10,
      respect_pauses: Math.floor(Math.random() * 25) + 5,
      historique_fiabilite: Math.floor(Math.random() * 25) + 10
    };

    res.json({
      mode: 'simulation',
      date,
      score: demo.score,
      breakdown,
      label: getScoreLabel(demo.score)
    });
  } catch (err) {
    console.error('[Agenda IA] Erreur score:', err);
    res.status(500).json({ error: 'Erreur interne lors du calcul du score' });
  }
});

/**
 * GET /api/agenda-ia/red-days
 * Détecte les journées rouges dans une plage de dates.
 */
router.get('/red-days', async (req, res) => {
  try {
    const { start, end } = req.query;

    if (!isValidDate(start) || !isValidDate(end)) {
      return res.status(400).json({ error: 'Paramètres start et end requis au format YYYY-MM-DD' });
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    if (endDate < startDate) {
      return res.status(400).json({ error: 'La date de fin doit être après la date de début' });
    }

    // Limiter à 90 jours maximum
    const diffDays = (endDate - startDate) / (1000 * 60 * 60 * 24);
    if (diffDays > 90) {
      return res.status(400).json({ error: 'Plage limitée à 90 jours maximum' });
    }

    const redDays = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      const dateStr = current.toISOString().split('T')[0];
      // Ignorer les dimanches
      if (current.getDay() !== 0) {
        const demo = generateDemoDay(dateStr);
        if (isRedDay(demo.score)) {
          const raisons = [];
          if (demo.nbPatients > 16) raisons.push('Surcharge patients');
          if (demo.chargePercent > 90) raisons.push('Saturation horaire');
          raisons.push('Score sérénité bas');
          redDays.push({ date: dateStr, score: demo.score, raisons });
        }
      }
      current.setDate(current.getDate() + 1);
    }

    await logAction(req.user.id, 'detect_red_days', { start, end, count: redDays.length });

    res.json({ mode: 'simulation', red_days: redDays });
  } catch (err) {
    console.error('[Agenda IA] Erreur red-days:', err);
    res.status(500).json({ error: 'Erreur interne lors de la détection des journées rouges' });
  }
});

/**
 * GET /api/agenda-ia/heatmap
 * Données de heatmap pour une semaine ou un mois.
 */
router.get('/heatmap', async (req, res) => {
  try {
    const { start, end } = req.query;

    if (!isValidDate(start) || !isValidDate(end)) {
      return res.status(400).json({ error: 'Paramètres start et end requis au format YYYY-MM-DD' });
    }

    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffDays = (endDate - startDate) / (1000 * 60 * 60 * 24);

    if (diffDays > 90) {
      return res.status(400).json({ error: 'Plage limitée à 90 jours maximum' });
    }

    const heatmap = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      const dateStr = current.toISOString().split('T')[0];
      // Pas de données le dimanche
      if (current.getDay() !== 0) {
        const demo = generateDemoDay(dateStr);
        heatmap.push({
          date: dateStr,
          score: demo.score,
          nb_patients: demo.nbPatients,
          charge: demo.chargePercent
        });
      }
      current.setDate(current.getDate() + 1);
    }

    res.json({ mode: 'simulation', heatmap });
  } catch (err) {
    console.error('[Agenda IA] Erreur heatmap:', err);
    res.status(500).json({ error: 'Erreur interne lors du calcul du heatmap' });
  }
});

// =============================================================================
// OPTIMISATION
// =============================================================================

/**
 * POST /api/agenda-ia/find-best-slots
 * Trouve les créneaux optimaux pour un nouveau rendez-vous.
 * Prend en compte le type d'acte, les contraintes patient et la charge existante.
 */
router.post('/find-best-slots', async (req, res) => {
  try {
    const { patient_id, appointment_type_id, date_range, constraints } = req.body;

    if (!appointment_type_id) {
      return res.status(400).json({ error: 'appointment_type_id requis' });
    }
    if (!date_range || !date_range.start || !date_range.end) {
      return res.status(400).json({ error: 'date_range avec start et end requis' });
    }

    // Générer des créneaux optimaux simulés
    const slots = [];
    const startDate = new Date(date_range.start);
    const endDate = new Date(date_range.end);
    const current = new Date(startDate);

    while (current <= endDate && slots.length < 5) {
      const dateStr = current.toISOString().split('T')[0];
      if (current.getDay() !== 0 && current.getDay() !== 6) {
        const demo = generateDemoDay(dateStr);
        if (demo.score > 50) {
          // Trouver un créneau libre dans la journée
          const heures = ['09:00', '10:30', '14:00', '15:30', '16:45'];
          const heure = heures[Math.floor(demo.score % heures.length)];
          slots.push({
            date: dateStr,
            heure,
            score: demo.score,
            raisons: [
              'Journée avec bonne sérénité',
              'Créneau compatible avec le type d\'acte',
              demo.nbPatients < 14 ? 'Charge modérée' : 'Créneau intercalaire disponible'
            ]
          });
        }
      }
      current.setDate(current.getDate() + 1);
    }

    await logAction(req.user.id, 'find_best_slots', {
      patient_id,
      appointment_type_id,
      date_range,
      results_count: slots.length
    });

    res.json({ mode: 'simulation', slots });
  } catch (err) {
    console.error('[Agenda IA] Erreur find-best-slots:', err);
    res.status(500).json({ error: 'Erreur interne lors de la recherche de créneaux' });
  }
});

/**
 * POST /api/agenda-ia/suggest-reschedules/:date
 * Propose des reports de rendez-vous pour décharger une journée.
 */
router.post('/suggest-reschedules/:date', async (req, res) => {
  try {
    const { date } = req.params;

    if (!isValidDate(date)) {
      return res.status(400).json({ error: 'Date invalide. Format attendu : YYYY-MM-DD' });
    }

    const demo = generateDemoDay(date);
    const suggestions = [];

    // Suggérer le report des actes non urgents si la journée est chargée
    if (demo.nbPatients > 12) {
      const nonUrgents = demo.appointments.filter(a =>
        ['contrôle', 'détartrage', 'consultation'].includes(a.type)
      );

      nonUrgents.slice(0, 3).forEach((apt, i) => {
        // Trouver un jour cible plus calme
        const targetDate = new Date(date);
        targetDate.setDate(targetDate.getDate() + i + 2);
        const targetStr = targetDate.toISOString().split('T')[0];

        suggestions.push({
          appointment_id: apt.id,
          raison: `${apt.type} reportable — journée surchargée (${demo.nbPatients} patients)`,
          targets: [
            { date: targetStr, heure: '10:00', score: 75 },
            { date: targetStr, heure: '15:30', score: 70 }
          ],
          message: `Bonjour, nous souhaitons vous proposer un créneau plus confortable pour votre ${apt.type}.`
        });
      });
    }

    await logAction(req.user.id, 'suggest_reschedules', { date, suggestions_count: suggestions.length });

    res.json({ mode: 'simulation', suggestions });
  } catch (err) {
    console.error('[Agenda IA] Erreur suggest-reschedules:', err);
    res.status(500).json({ error: 'Erreur interne lors de la génération des suggestions' });
  }
});

/**
 * POST /api/agenda-ia/optimize-day/:date
 * Propose une réorganisation complète de la journée pour maximiser la sérénité.
 */
router.post('/optimize-day/:date', async (req, res) => {
  try {
    const { date } = req.params;

    if (!isValidDate(date)) {
      return res.status(400).json({ error: 'Date invalide. Format attendu : YYYY-MM-DD' });
    }

    const demo = generateDemoDay(date);
    const currentScore = demo.score;
    const optimizedScore = Math.min(95, currentScore + Math.floor(Math.random() * 20) + 10);

    // Simuler des changements d'optimisation
    const changes = [];
    if (demo.appointments.length > 2) {
      changes.push({
        type: 'reorder',
        description: 'Regrouper les actes longs le matin (meilleure concentration)',
        impact: '+5 score'
      });
      changes.push({
        type: 'add_break',
        description: 'Ajouter une pause de 15 min après le 6ème patient',
        impact: '+8 score'
      });
      if (demo.nbPatients > 14) {
        changes.push({
          type: 'suggest_report',
          description: 'Reporter 1 contrôle sur une journée plus calme',
          impact: '+7 score'
        });
      }
    }

    // Planning optimisé (réordonnancement simulé)
    const optimizedSchedule = [...demo.appointments].sort((a, b) => {
      // Les actes longs d'abord, les courts après
      return b.duree - a.duree;
    }).map((apt, i) => {
      let h = 8 + Math.floor(i * 0.7);
      let m = (i * 30) % 60;
      return { ...apt, heure_optimisee: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
    });

    await logAction(req.user.id, 'optimize_day', { date, current_score: currentScore, optimized_score: optimizedScore });

    res.json({
      mode: 'simulation',
      date,
      current_score: currentScore,
      optimized_score: optimizedScore,
      changes,
      optimized_schedule: optimizedSchedule
    });
  } catch (err) {
    console.error('[Agenda IA] Erreur optimize-day:', err);
    res.status(500).json({ error: 'Erreur interne lors de l\'optimisation' });
  }
});

/**
 * POST /api/agenda-ia/apply-suggestion/:id
 * Accepter ou refuser une suggestion de l'IA.
 */
router.post('/apply-suggestion/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    if (!action || !['accept', 'refuse'].includes(action)) {
      return res.status(400).json({ error: 'Action requise : accept ou refuse' });
    }

    await logAction(req.user.id, 'apply_suggestion', { suggestion_id: id, action });

    if (action === 'accept') {
      res.json({
        mode: 'simulation',
        success: true,
        applied_changes: {
          suggestion_id: id,
          status: 'appliqué',
          message: 'Suggestion appliquée avec succès (mode simulation)'
        }
      });
    } else {
      res.json({
        mode: 'simulation',
        success: true,
        applied_changes: {
          suggestion_id: id,
          status: 'refusé',
          message: 'Suggestion refusée'
        }
      });
    }
  } catch (err) {
    console.error('[Agenda IA] Erreur apply-suggestion:', err);
    res.status(500).json({ error: 'Erreur interne lors de l\'application' });
  }
});

// =============================================================================
// PAUSES & PROTECTION
// =============================================================================

/**
 * GET /api/agenda-ia/breaks/:date
 * Recommandations de pauses pour une journée.
 * Basé sur la charge, le type d'actes et le profil praticien.
 */
router.get('/breaks/:date', async (req, res) => {
  try {
    const { date } = req.params;

    if (!isValidDate(date)) {
      return res.status(400).json({ error: 'Date invalide. Format attendu : YYYY-MM-DD' });
    }

    const demo = generateDemoDay(date);

    // Générer des recommandations de pauses intelligentes
    const breaks = [
      {
        heure: '10:30',
        duree: 10,
        type: 'micro-pause',
        raison: 'Récupération après bloc matinal de soins'
      },
      {
        heure: '12:30',
        duree: 45,
        type: 'déjeuner',
        raison: 'Pause déjeuner — ne pas sauter même en journée chargée'
      }
    ];

    // Ajouter une pause supplémentaire si la journée est chargée
    if (demo.nbPatients > 14) {
      breaks.push({
        heure: '15:00',
        duree: 15,
        type: 'récupération',
        raison: 'Journée dense — pause recommandée pour maintenir la qualité des soins'
      });
    }

    // Pause en fin de journée si beaucoup d'actes lourds
    const actesLourds = demo.appointments.filter(a => a.duree >= 45).length;
    if (actesLourds >= 3) {
      breaks.push({
        heure: '16:30',
        duree: 10,
        type: 'décompression',
        raison: `${actesLourds} actes longs réalisés — étirements recommandés`
      });
    }

    res.json({ mode: 'simulation', date, breaks });
  } catch (err) {
    console.error('[Agenda IA] Erreur breaks:', err);
    res.status(500).json({ error: 'Erreur interne lors du calcul des pauses' });
  }
});

/**
 * POST /api/agenda-ia/protect-day/:date
 * Active la protection journée rouge : bloque les nouveaux RDV, propose des reports.
 */
router.post('/protect-day/:date', async (req, res) => {
  try {
    const { date } = req.params;

    if (!isValidDate(date)) {
      return res.status(400).json({ error: 'Date invalide. Format attendu : YYYY-MM-DD' });
    }

    const demo = generateDemoDay(date);

    const actionsPrises = [
      'Blocage des nouveaux rendez-vous non urgents',
      'Notification envoyée aux secrétaires'
    ];

    if (demo.nbPatients > 14) {
      actionsPrises.push('2 contrôles identifiés comme reportables');
      actionsPrises.push('Messages de proposition de report préparés');
    }

    // Score amélioré après protection
    const nouveauScore = Math.min(95, demo.score + 20);

    await logAction(req.user.id, 'protect_day', { date, actions: actionsPrises });

    res.json({
      mode: 'simulation',
      date,
      actions_prises: actionsPrises,
      nouveau_score: nouveauScore
    });
  } catch (err) {
    console.error('[Agenda IA] Erreur protect-day:', err);
    res.status(500).json({ error: 'Erreur interne lors de la protection' });
  }
});

// =============================================================================
// GESTION PATIENT
// =============================================================================

/**
 * GET /api/agenda-ia/patient-profile/:patient_id
 * Profil de fiabilité d'un patient (historique de présence, annulations).
 */
router.get('/patient-profile/:patient_id', async (req, res) => {
  try {
    const { patient_id } = req.params;

    if (!patient_id) {
      return res.status(400).json({ error: 'patient_id requis' });
    }

    // Données simulées basées sur l'ID patient
    const seedNum = patient_id.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0);
    const scoreFiabilite = Math.max(30, Math.min(100, (seedNum % 70) + 30));

    const historique = {
      total_rdv: Math.floor(seedNum % 20) + 5,
      presents: Math.floor((seedNum % 20) + 5) - Math.floor(seedNum % 4),
      annulations_prevues: Math.floor(seedNum % 3),
      no_show: Math.floor(seedNum % 2),
      retards_moyens_min: Math.floor(seedNum % 10)
    };

    const recommendations = [];
    if (scoreFiabilite < 50) {
      recommendations.push('Confirmer le RDV par SMS la veille ET le matin');
      recommendations.push('Privilégier les créneaux de fin de journée (moins d\'impact si absence)');
    } else if (scoreFiabilite < 70) {
      recommendations.push('Rappel SMS la veille recommandé');
    } else {
      recommendations.push('Patient fiable — aucune précaution particulière');
    }

    res.json({
      mode: 'simulation',
      patient_id,
      score_fiabilite: scoreFiabilite,
      historique,
      recommendations
    });
  } catch (err) {
    console.error('[Agenda IA] Erreur patient-profile:', err);
    res.status(500).json({ error: 'Erreur interne lors de la récupération du profil patient' });
  }
});

/**
 * POST /api/agenda-ia/generate-message
 * Génère un message personnalisé pour un patient (rappel, report, etc.).
 */
router.post('/generate-message', async (req, res) => {
  try {
    const { type, patient_id, context } = req.body;

    if (!type) {
      return res.status(400).json({ error: 'type requis (rappel, report, confirmation, annulation)' });
    }

    const typesValides = ['rappel', 'report', 'confirmation', 'annulation', 'suivi'];
    if (!typesValides.includes(type)) {
      return res.status(400).json({
        error: `Type invalide. Types acceptés : ${typesValides.join(', ')}`
      });
    }

    // Génération de messages selon le type
    const messages = {
      rappel: {
        message: 'Bonjour, nous vous rappelons votre rendez-vous demain à [heure] au cabinet. Merci de nous prévenir en cas d\'empêchement. À bientôt !',
        tone: 'professionnel_chaleureux',
        suggested_channel: 'sms'
      },
      report: {
        message: 'Bonjour, suite à une réorganisation de notre planning, nous souhaitons vous proposer un nouveau créneau pour votre rendez-vous. Seriez-vous disponible le [date] à [heure] ? N\'hésitez pas à nous contacter.',
        tone: 'attentionné',
        suggested_channel: 'sms'
      },
      confirmation: {
        message: 'Votre rendez-vous est confirmé pour le [date] à [heure]. Merci et à bientôt au cabinet !',
        tone: 'concis',
        suggested_channel: 'sms'
      },
      annulation: {
        message: 'Bonjour, nous sommes au regret de devoir annuler votre rendez-vous du [date]. Nous vous recontacterons rapidement pour fixer une nouvelle date. Veuillez nous excuser pour ce désagrément.',
        tone: 'empathique',
        suggested_channel: 'telephone'
      },
      suivi: {
        message: 'Bonjour, nous espérons que tout se passe bien suite à votre soin. N\'hésitez pas à nous contacter en cas de question. Bonne journée !',
        tone: 'bienveillant',
        suggested_channel: 'sms'
      }
    };

    const result = messages[type];

    await logAction(req.user.id, 'generate_message', { type, patient_id });

    res.json({ mode: 'simulation', ...result });
  } catch (err) {
    console.error('[Agenda IA] Erreur generate-message:', err);
    res.status(500).json({ error: 'Erreur interne lors de la génération du message' });
  }
});

// =============================================================================
// ASSISTANT VOCAL / TEXTE
// =============================================================================

/**
 * POST /api/agenda-ia/assistant
 * Traite une commande vocale ou textuelle en langage naturel.
 * Détecte l'intention et propose des actions.
 */
router.post('/assistant', async (req, res) => {
  try {
    const { transcript, context } = req.body;

    if (!transcript || transcript.trim().length === 0) {
      return res.status(400).json({ error: 'transcript requis (texte ou transcription vocale)' });
    }

    const text = transcript.toLowerCase().trim();

    // Détection d'intention simple (en production, utiliser un modèle NLU)
    let intent = 'unknown';
    let explanation = '';
    let proposedActions = [];
    let confirmationNeeded = false;

    if (text.includes('combien') && text.includes('patient')) {
      intent = 'count_patients';
      explanation = 'Comptage des patients pour la journée demandée';
      proposedActions = [{ id: 'count-1', action: 'afficher_comptage', params: { date: 'aujourd\'hui' } }];
    } else if (text.includes('décaler') || text.includes('reporter') || text.includes('déplacer')) {
      intent = 'reschedule';
      explanation = 'Demande de report de rendez-vous détectée';
      proposedActions = [{ id: 'resc-1', action: 'proposer_report', params: {} }];
      confirmationNeeded = true;
    } else if (text.includes('bloquer') || text.includes('protéger')) {
      intent = 'protect_day';
      explanation = 'Activation de la protection journée rouge';
      proposedActions = [{ id: 'prot-1', action: 'activer_protection', params: {} }];
      confirmationNeeded = true;
    } else if (text.includes('pause') || text.includes('repos')) {
      intent = 'break_request';
      explanation = 'Demande d\'insertion de pause';
      proposedActions = [{ id: 'break-1', action: 'inserer_pause', params: { duree: 15 } }];
      confirmationNeeded = true;
    } else if (text.includes('score') || text.includes('sérénité') || text.includes('comment')) {
      intent = 'get_score';
      explanation = 'Demande du score de sérénité';
      proposedActions = [{ id: 'score-1', action: 'afficher_score', params: { date: 'aujourd\'hui' } }];
    } else if (text.includes('prochain') && (text.includes('créneau') || text.includes('place'))) {
      intent = 'find_slot';
      explanation = 'Recherche du prochain créneau disponible';
      proposedActions = [{ id: 'slot-1', action: 'chercher_creneau', params: {} }];
    } else {
      intent = 'unknown';
      explanation = 'Intention non reconnue. Reformulez votre demande ou utilisez les commandes : "combien de patients", "décaler un RDV", "bloquer la journée", "prochain créneau".';
    }

    await logAction(req.user.id, 'assistant_command', { transcript, intent });

    res.json({
      mode: 'simulation',
      intent,
      explanation,
      proposed_actions: proposedActions,
      confirmation_needed: confirmationNeeded
    });
  } catch (err) {
    console.error('[Agenda IA] Erreur assistant:', err);
    res.status(500).json({ error: 'Erreur interne de l\'assistant' });
  }
});

/**
 * POST /api/agenda-ia/assistant/confirm
 * Confirme ou refuse une action proposée par l'assistant.
 */
router.post('/assistant/confirm', async (req, res) => {
  try {
    const { action_id, confirmed } = req.body;

    if (!action_id) {
      return res.status(400).json({ error: 'action_id requis' });
    }
    if (typeof confirmed !== 'boolean') {
      return res.status(400).json({ error: 'confirmed requis (true/false)' });
    }

    await logAction(req.user.id, 'assistant_confirm', { action_id, confirmed });

    if (confirmed) {
      res.json({
        mode: 'simulation',
        success: true,
        results: {
          action_id,
          status: 'exécuté',
          message: 'Action exécutée avec succès (mode simulation)'
        }
      });
    } else {
      res.json({
        mode: 'simulation',
        success: true,
        results: {
          action_id,
          status: 'annulé',
          message: 'Action annulée par l\'utilisateur'
        }
      });
    }
  } catch (err) {
    console.error('[Agenda IA] Erreur assistant/confirm:', err);
    res.status(500).json({ error: 'Erreur interne lors de la confirmation' });
  }
});

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * GET /api/agenda-ia/rules
 * Récupère les règles du cabinet (durées, contraintes, préférences).
 */
router.get('/rules', async (req, res) => {
  try {
    // En production, lecture depuis Supabase
    // Pour l'instant, règles par défaut
    const rules = {
      horaires: {
        ouverture: '08:30',
        fermeture: '19:00',
        pause_dejeuner: { debut: '12:30', duree: 60 }
      },
      contraintes: {
        max_patients_jour: 20,
        max_urgences_jour: 4,
        duree_min_pause_min: 10,
        intervalle_min_entre_actes_lourds_min: 30
      },
      preferences: {
        actes_longs_matin: true,
        controles_apres_midi: true,
        buffer_urgence_min: 30,
        nb_creneaux_urgence_reserves: 2
      },
      notifications: {
        rappel_patient_veille: true,
        rappel_patient_jour: true,
        alerte_journee_rouge: true,
        canal_prefere: 'sms'
      }
    };

    res.json({ mode: 'simulation', rules });
  } catch (err) {
    console.error('[Agenda IA] Erreur GET rules:', err);
    res.status(500).json({ error: 'Erreur interne lors de la récupération des règles' });
  }
});

/**
 * PUT /api/agenda-ia/rules
 * Met à jour les règles du cabinet.
 */
router.put('/rules', async (req, res) => {
  try {
    const newRules = req.body;

    if (!newRules || Object.keys(newRules).length === 0) {
      return res.status(400).json({ error: 'Corps de la requête vide' });
    }

    await logAction(req.user.id, 'update_rules', { rules: newRules });

    // En production, sauvegarde dans Supabase
    res.json({
      mode: 'simulation',
      success: true,
      message: 'Règles mises à jour avec succès (mode simulation)',
      rules: newRules
    });
  } catch (err) {
    console.error('[Agenda IA] Erreur PUT rules:', err);
    res.status(500).json({ error: 'Erreur interne lors de la mise à jour des règles' });
  }
});

/**
 * GET /api/agenda-ia/practitioner-profile
 * Profil praticien : fatigue, préférences, capacités.
 */
router.get('/practitioner-profile', async (req, res) => {
  try {
    // Profil par défaut (en production, lecture Supabase)
    const profile = {
      fatigue: {
        seuil_patients_alerte: 16,
        seuil_heures_alerte: 9,
        jours_consecutifs_max: 5,
        besoin_pause_apres_acte_lourd: true
      },
      preferences: {
        debut_prefere: '08:30',
        fin_preferee: '18:30',
        specialites_matin: ['chirurgie', 'implant', 'extraction'],
        specialites_apres_midi: ['contrôle', 'détartrage', 'consultation'],
        jour_admin: 'mercredi_apres_midi'
      },
      capacites: {
        actes_simultanes: false,
        assistante_requise: ['chirurgie', 'implant'],
        duree_max_acte_continu_min: 90
      }
    };

    res.json({ mode: 'simulation', profile });
  } catch (err) {
    console.error('[Agenda IA] Erreur GET practitioner-profile:', err);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

/**
 * PUT /api/agenda-ia/practitioner-profile
 * Met à jour le profil praticien.
 */
router.put('/practitioner-profile', async (req, res) => {
  try {
    const newProfile = req.body;

    if (!newProfile || Object.keys(newProfile).length === 0) {
      return res.status(400).json({ error: 'Corps de la requête vide' });
    }

    await logAction(req.user.id, 'update_practitioner_profile', { profile: newProfile });

    res.json({
      mode: 'simulation',
      success: true,
      message: 'Profil praticien mis à jour (mode simulation)',
      profile: newProfile
    });
  } catch (err) {
    console.error('[Agenda IA] Erreur PUT practitioner-profile:', err);
    res.status(500).json({ error: 'Erreur interne lors de la mise à jour du profil' });
  }
});

// =============================================================================
// AUDIT RGPD
// =============================================================================

/**
 * GET /api/agenda-ia/logs
 * Récupère les logs d'actions IA (conformité RGPD).
 * Filtrable par plage de dates.
 */
router.get('/logs', async (req, res) => {
  try {
    const { start, end } = req.query;

    if (!isValidDate(start) || !isValidDate(end)) {
      return res.status(400).json({ error: 'Paramètres start et end requis au format YYYY-MM-DD' });
    }

    // En production, lecture depuis Supabase
    // En simulation, retourner des logs fictifs
    const logs = [
      {
        id: 'log-001',
        user_id: req.user.id,
        action: 'analyze_day',
        details: { date: start },
        created_at: `${start}T09:00:00Z`
      },
      {
        id: 'log-002',
        user_id: req.user.id,
        action: 'find_best_slots',
        details: { appointment_type_id: 'consultation' },
        created_at: `${start}T10:30:00Z`
      },
      {
        id: 'log-003',
        user_id: req.user.id,
        action: 'assistant_command',
        details: { transcript: 'Combien de patients demain ?', intent: 'count_patients' },
        created_at: `${start}T14:15:00Z`
      }
    ];

    res.json({
      mode: 'simulation',
      logs,
      total: logs.length,
      period: { start, end }
    });
  } catch (err) {
    console.error('[Agenda IA] Erreur logs:', err);
    res.status(500).json({ error: 'Erreur interne lors de la récupération des logs' });
  }
});

// =============================================================================
// EXPORT
// =============================================================================

module.exports = router;
