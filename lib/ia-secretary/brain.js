// =============================================
// JADOMI — Cerveau Secrétaire IA
// Connaissances métier + moteur d'analyse déterministe
// Fonctionne SANS IA pour les règles, AVEC OpenAI pour le NLP
// =============================================

// ===== Connaissances par métier =====
const METIER_KNOWLEDGE = {
  dentiste: {
    nom: 'Cabinet dentaire',
    actes: {
      controle:              { duree_min: 15, duree_max: 30, prix_secu: 23,     fatigue: 1, necessite_after: null },
      detartrage:            { duree_min: 20, duree_max: 30, prix_secu: 28.92,  fatigue: 2, necessite_after: null },
      soin:                  { duree_min: 30, duree_max: 45, prix_secu: 80,     fatigue: 3, necessite_after: 'controle_post_op' },
      endodontie:            { duree_min: 45, duree_max: 90, prix_secu: 200,    fatigue: 5, necessite_after: 'radio_controle' },
      prothese_conjointe:    { duree_min: 30, duree_max: 60, prix_secu: 300,    fatigue: 3, necessite_after: 'essayage' },
      prothese_adjointe:     { duree_min: 30, duree_max: 45, prix_secu: 250,    fatigue: 2, necessite_after: 'equilibrage' },
      chirurgie:             { duree_min: 30, duree_max: 60, prix_secu: 150,    fatigue: 5, necessite_after: 'controle_post_op' },
      urgence:               { duree_min: 15, duree_max: 45, prix_secu: 50,     fatigue: 4, necessite_after: null },
      blanchiment:           { duree_min: 45, duree_max: 60, prix_libre: 350,   fatigue: 1, necessite_after: null },
      premiere_consultation: { duree_min: 30, duree_max: 45, prix_secu: 23,     fatigue: 1, necessite_after: 'bilan_radio' },
      empreinte:             { duree_min: 15, duree_max: 30, prix_secu: 0,      fatigue: 2, necessite_after: 'pose' },
      radio_panoramique:     { duree_min: 10, duree_max: 15, prix_secu: 20,     fatigue: 1, necessite_after: null },
    },
    regles_or: [
      'JAMAIS 2 endodonties consécutives — épuisant pour le praticien, risque d\'erreur',
      'JAMAIS chirurgie en dernier créneau — risque de dépassement sans créneau tampon',
      'TOUJOURS un créneau urgence par demi-journée (15-30 min non programmé)',
      'Pause déjeuner MINIMUM 45 min (idéal 1h-1h30)',
      'Alterner actes lourds (endo, chirurgie) et légers (contrôle, détartrage)',
      'Première consultation en début de demi-journée (patient stressé = mieux le matin)',
      'Empreinte prothèse JAMAIS en fin de journée (matériau sensible à la fatigue)',
      'Contrôle post-op entre 7 et 14 jours après chirurgie/endo',
      'Maximum 8h de travail clinique par jour pour la qualité de vie',
      'Regrouper les actes similaires par blocs (2-3 détartrages puis soins)',
      'Patient anxieux = premier RDV du matin (moins d\'attente = moins de stress)',
      'Temps de stérilisation entre patients : 10-15 min minimum',
      'Vendredi après-midi : éviter chirurgie (week-end = pas de recours si complication)',
    ],
    plans_traitement: {
      carie_simple:      ['radio_panoramique', 'soin'],
      couronne:          ['premiere_consultation', 'radio_panoramique', 'soin', 'empreinte', 'prothese_conjointe'],
      extraction_implant:['premiere_consultation', 'radio_panoramique', 'chirurgie', 'controle', 'chirurgie', 'empreinte', 'prothese_conjointe'],
      parodontite:       ['premiere_consultation', 'detartrage', 'soin', 'soin', 'controle'],
      prothese_complete: ['premiere_consultation', 'empreinte', 'prothese_adjointe', 'prothese_adjointe', 'controle'],
      blanchiment_complet: ['detartrage', 'blanchiment', 'blanchiment', 'controle'],
    },
    horaires_ideaux: {
      debut_matin: '09:00',       // ajustable par praticien
      debut_matin_septembre: '09:30', // rentrée scolaire
      fin_matin: '12:30',
      debut_aprem: '14:00',
      fin_aprem: '19:00',
      pause_dejeuner_min: 45,
      nb_fauteuils: 3,
      creneau_urgence_par_demi_journee: true,
    },
    kpis: {
      ca_objectif_jour: 1500,
      taux_occupation_ideal: 85,
      nb_rdv_ideal_jour: 18,
      taux_noshow_acceptable: 5,
    },
  },

  medecin_generaliste: {
    nom: 'Cabinet médecin généraliste',
    actes: {
      consultation:        { duree_min: 15, duree_max: 25, prix_secu: 26.50, fatigue: 2 },
      consultation_longue: { duree_min: 30, duree_max: 45, prix_secu: 54,    fatigue: 3 },
      vaccination:         { duree_min: 10, duree_max: 15, prix_secu: 26.50, fatigue: 1 },
      ecg:                 { duree_min: 15, duree_max: 20, prix_secu: 40,    fatigue: 2 },
      certificat_sport:    { duree_min: 15, duree_max: 20, prix_secu: 26.50, fatigue: 1 },
      urgence:             { duree_min: 15, duree_max: 30, prix_secu: 26.50, fatigue: 4 },
      suivi_chronique:     { duree_min: 20, duree_max: 30, prix_secu: 26.50, fatigue: 2 },
      pediatrie:           { duree_min: 20, duree_max: 30, prix_secu: 30,    fatigue: 2 },
      geriatrie:           { duree_min: 25, duree_max: 40, prix_secu: 30,    fatigue: 3 },
      teleconsultation:    { duree_min: 15, duree_max: 20, prix_secu: 26.50, fatigue: 1 },
    },
    regles_or: [
      'Consultations longues en début de matinée ou début d\'après-midi',
      'Garder 2-3 créneaux urgence par demi-journée',
      'Vaccinations en fin de matinée (observation 15 min après)',
      'Pédiatrie tôt le matin (enfants plus calmes)',
      'Gériatrie pas en premier (patients arrivent plus lentement)',
      'Téléconsultation en fin de journée possible (moins de fatigue physique)',
      'Maximum 30 patients par jour pour qualité de consultation',
      'Pause de 5 min toutes les 2h minimum',
    ],
    horaires_ideaux: {
      debut_matin: '08:00',
      fin_matin: '12:00',
      debut_aprem: '14:00',
      fin_aprem: '18:30',
      pause_dejeuner_min: 60,
      nb_salles: 2,
    },
    kpis: {
      ca_objectif_jour: 800,
      taux_occupation_ideal: 90,
      nb_rdv_ideal_jour: 25,
    },
  },

  kinesitherapeute: {
    nom: 'Cabinet kinésithérapie',
    actes: {
      reeducation:         { duree_min: 30, duree_max: 30, prix_secu: 18.60, fatigue: 3 },
      bilan:               { duree_min: 45, duree_max: 60, prix_secu: 45,    fatigue: 2 },
      drainage_lymphatique:{ duree_min: 30, duree_max: 45, prix_secu: 18.60, fatigue: 2 },
      reeducation_respi:   { duree_min: 20, duree_max: 30, prix_secu: 18.60, fatigue: 3 },
      domicile:            { duree_min: 30, duree_max: 45, prix_secu: 23,    fatigue: 4 },
      electrotherapie:     { duree_min: 15, duree_max: 20, prix_secu: 10,    fatigue: 1 },
      post_operatoire:     { duree_min: 45, duree_max: 60, prix_secu: 23,    fatigue: 4 },
    },
    regles_or: [
      'Bilans en début de journée (concentration maximale pour évaluation)',
      'Post-opératoire le matin (patient plus reposé, meilleure mobilisation)',
      'Domiciles regroupés géographiquement (tournées optimisées)',
      'Électrothérapie en parallèle d\'un autre patient possible',
      'Maximum 25-30 patients/jour pour qualité de soin',
      'Alternance debout/assis entre les patients',
      'Drainage lymphatique après 14h (digestion terminée)',
    ],
    horaires_ideaux: {
      debut_matin: '08:00',
      fin_matin: '12:00',
      debut_aprem: '14:00',
      fin_aprem: '19:00',
      pause_dejeuner_min: 60,
    },
    kpis: {
      ca_objectif_jour: 500,
      taux_occupation_ideal: 90,
      nb_rdv_ideal_jour: 25,
    },
  },

  orthodontiste: {
    nom: 'Cabinet orthodontie',
    actes: {
      premiere_consultation: { duree_min: 30, duree_max: 45, prix_libre: 50,  fatigue: 2 },
      pose_bagues:           { duree_min: 60, duree_max: 90, prix_libre: 800, fatigue: 5 },
      activation:            { duree_min: 15, duree_max: 20, prix_libre: 100, fatigue: 1 },
      depose_bagues:         { duree_min: 30, duree_max: 45, prix_libre: 200, fatigue: 3 },
      contention:            { duree_min: 20, duree_max: 30, prix_libre: 150, fatigue: 2 },
      empreinte_gouttiere:   { duree_min: 20, duree_max: 30, prix_libre: 100, fatigue: 2 },
      urgence_bracket:       { duree_min: 10, duree_max: 20, prix_libre: 0,   fatigue: 2 },
      photos_moulages:       { duree_min: 15, duree_max: 20, prix_libre: 0,   fatigue: 1 },
    },
    regles_or: [
      'Poses de bagues le matin (acte long, concentration maximale)',
      'Activations en série (actes rapides, enchaîner)',
      'Première consultation en début de demi-journée',
      'Urgences brackets intercalées entre les activations',
      'Photos/moulages groupés',
      'Dépose bagues le matin aussi (acte délicat)',
    ],
    horaires_ideaux: {
      debut_matin: '09:00',
      fin_matin: '12:30',
      debut_aprem: '14:00',
      fin_aprem: '18:30',
      pause_dejeuner_min: 60,
      nb_fauteuils: 4,
    },
    kpis: {
      ca_objectif_jour: 2000,
      taux_occupation_ideal: 80,
      nb_rdv_ideal_jour: 20,
    },
  },

  sage_femme: {
    nom: 'Cabinet sage-femme',
    actes: {
      suivi_grossesse:            { duree_min: 30, duree_max: 45, prix_secu: 28,    fatigue: 2 },
      preparation_accouchement:   { duree_min: 45, duree_max: 60, prix_secu: 33.60, fatigue: 2 },
      reeducation_perinee:        { duree_min: 30, duree_max: 30, prix_secu: 22,    fatigue: 3 },
      consultation_contraception: { duree_min: 30, duree_max: 30, prix_secu: 25,    fatigue: 2 },
      frottis:                    { duree_min: 15, duree_max: 20, prix_secu: 25,    fatigue: 2 },
      suivi_postnatal:            { duree_min: 30, duree_max: 45, prix_secu: 28,    fatigue: 2 },
      echographie:                { duree_min: 20, duree_max: 30, prix_secu: 45,    fatigue: 2 },
    },
    regles_or: [
      'Préparation accouchement en groupe possible (optimiser le temps)',
      'Suivi grossesse régulier : planifier les 7 consultations obligatoires',
      'Rééducation périnée = 10 séances à espacer de 1 semaine',
      'Échographies à heures fixes (réglage matériel)',
      'Consultations contraception ouvertes à tous horaires',
    ],
    horaires_ideaux: {
      debut_matin: '08:30',
      fin_matin: '12:30',
      debut_aprem: '14:00',
      fin_aprem: '18:00',
      pause_dejeuner_min: 60,
    },
    kpis: {
      ca_objectif_jour: 500,
      nb_rdv_ideal_jour: 15,
    },
  },

  // === INFIRMIER LIBÉRAL (IDEL) ===
  infirmier: {
    label: 'Infirmier(e) libéral(e)',
    actes: [
      { code: 'pansement', label: 'Pansement', duree: 15, type: 'soin', fatigue: 1 },
      { code: 'injection', label: 'Injection / Perfusion', duree: 20, type: 'soin', fatigue: 2 },
      { code: 'prise_sang', label: 'Prise de sang', duree: 10, type: 'soin', fatigue: 1 },
      { code: 'glycemie', label: 'Glycémie / Surveillance diabète', duree: 10, type: 'soin', fatigue: 1 },
      { code: 'toilette', label: 'Toilette / Aide à la personne', duree: 30, type: 'lourd', fatigue: 4 },
      { code: 'perfusion', label: 'Pose/Surveillance perfusion', duree: 45, type: 'lourd', fatigue: 3 },
      { code: 'chimio', label: 'Chimiothérapie à domicile', duree: 60, type: 'lourd', fatigue: 5 },
      { code: 'education', label: 'Éducation thérapeutique', duree: 30, type: 'consultation', fatigue: 2 },
      { code: 'vaccination', label: 'Vaccination', duree: 15, type: 'soin', fatigue: 1 },
      { code: 'ablation_fils', label: 'Ablation fils / Agrafes', duree: 15, type: 'soin', fatigue: 1 },
      { code: 'sonde', label: 'Sondage urinaire', duree: 20, type: 'soin', fatigue: 3 },
      { code: 'stomie', label: 'Soins de stomie', duree: 20, type: 'soin', fatigue: 2 },
      { code: 'bilan_sang', label: 'Bilan sanguin complet', duree: 15, type: 'soin', fatigue: 1 },
      { code: 'palliatif', label: 'Soins palliatifs', duree: 45, type: 'lourd', fatigue: 5 },
    ],
    regles_or: [
      'Tournées domicile géo-optimisées (regrouper par quartier/rue)',
      'Soins lourds (toilette, chimio, palliatif) en début de tournée quand énergie maximale',
      'Jamais 3 toilettes consécutives — alterner avec soins légers',
      'Pause 10 min après chaque soin palliatif (charge émotionnelle)',
      'Temps de trajet inclus entre patients (15-20 min en ville, 30 min rural)',
      'Patients insulino-dépendants : horaires fixes impératifs (glycémie)',
      'Rotation des 3 jours pour équité entre praticiens',
      'Max 15 patients/tournée (fatigue + qualité)',
      'Urgences : 1 créneau libre par demi-journée',
    ],
    horaires_ideaux: {
      debut_matin: '06:30',
      fin_matin: '12:00',
      debut_aprem: '14:00',
      fin_aprem: '19:00',
      pause_dejeuner_min: 60,
      creneau_urgence_par_demi_journee: true,
    },
    kpis: {
      ca_objectif_jour: 400,
      taux_occupation_ideal: 85,
      nb_rdv_ideal_jour: 15,
      no_show_acceptable: 3,
    },
  },
};

// ===== Utilitaires horaires =====

/**
 * Convertit "HH:MM" en minutes depuis minuit
 */
function timeToMin(t) {
  if (!t) return 0;
  const parts = String(t).split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
}

/**
 * Convertit des minutes depuis minuit en "HH:MM"
 */
function minToTime(m) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * Retourne le jour de la semaine en français (0=dimanche)
 */
function jourSemaine(dateStr) {
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  return jours[new Date(dateStr).getDay()];
}

/**
 * Normalise le type d'acte en clé interne
 */
function normalizeActe(label) {
  if (!label) return 'consultation';
  const l = String(label).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const map = {
    'controle': 'controle', 'contrôle': 'controle', 'visite de controle': 'controle',
    'detartrage': 'detartrage', 'détartrage': 'detartrage',
    'soin': 'soin', 'soins': 'soin', 'carie': 'soin', 'composite': 'soin',
    'endodontie': 'endodontie', 'endo': 'endodontie', 'traitement de canal': 'endodontie', 'devitalisation': 'endodontie',
    'chirurgie': 'chirurgie', 'extraction': 'chirurgie', 'avulsion': 'chirurgie',
    'urgence': 'urgence',
    'premiere consultation': 'premiere_consultation', '1ere consultation': 'premiere_consultation',
    'empreinte': 'empreinte',
    'couronne': 'prothese_conjointe', 'bridge': 'prothese_conjointe', 'prothese conjointe': 'prothese_conjointe',
    'prothese adjointe': 'prothese_adjointe', 'appareil': 'prothese_adjointe', 'dentier': 'prothese_adjointe',
    'blanchiment': 'blanchiment',
    'radio': 'radio_panoramique', 'radio panoramique': 'radio_panoramique', 'pano': 'radio_panoramique',
    'consultation': 'consultation', 'consultation longue': 'consultation_longue',
    'vaccination': 'vaccination', 'vaccin': 'vaccination',
    'ecg': 'ecg', 'electrocardiogramme': 'ecg',
    'certificat': 'certificat_sport', 'certificat sport': 'certificat_sport',
    'reeducation': 'reeducation', 'kine': 'reeducation',
    'bilan': 'bilan',
    'drainage': 'drainage_lymphatique', 'drainage lymphatique': 'drainage_lymphatique',
    'domicile': 'domicile',
    'activation': 'activation',
    'pose bagues': 'pose_bagues', 'pose': 'pose_bagues',
    'depose bagues': 'depose_bagues', 'depose': 'depose_bagues',
    'suivi grossesse': 'suivi_grossesse', 'grossesse': 'suivi_grossesse',
    'preparation accouchement': 'preparation_accouchement',
    'reeducation perinee': 'reeducation_perinee', 'perinee': 'reeducation_perinee',
    'echographie': 'echographie', 'echo': 'echographie',
    'frottis': 'frottis',
    'teleconsultation': 'teleconsultation', 'teleconsult': 'teleconsultation',
    'pediatrie': 'pediatrie',
    'geriatrie': 'geriatrie',
  };
  return map[l] || l.replace(/\s+/g, '_');
}

// ===== Profil praticien — l'IA apprend les habitudes =====

/**
 * Détecte l'heure de début réelle du praticien à partir de son historique.
 * Si le praticien commence TOUJOURS à 9h ou 9h30, c'est une contrainte perso
 * (enfants, transport), PAS un problème d'organisation.
 * @param {Array} historique_rdvs — RDV des 30 derniers jours [{ heure }]
 * @returns {string} heure de début habituelle (ex: "09:00")
 */
function detecterDebutHabituel(historique_rdvs) {
  if (!historique_rdvs || historique_rdvs.length === 0) return null;
  const premiersRDV = {};
  // Compter la fréquence de chaque heure de début
  for (const rdv of historique_rdvs) {
    if (!rdv.heure) continue;
    const h = rdv.heure.substring(0, 5); // "09:00"
    premiersRDV[h] = (premiersRDV[h] || 0) + 1;
  }
  // L'heure la plus fréquente = habitude du praticien
  const sorted = Object.entries(premiersRDV).sort((a, b) => b[1] - a[1]);
  return sorted.length > 0 ? sorted[0][0] : null;
}

/**
 * Fusionne les horaires métier avec le profil du praticien.
 * Les contraintes perso (enfants, transport) priment sur les horaires "idéaux".
 * @param {Object} horaires — horaires idéaux du métier
 * @param {Object} profil — { debut_reel, contraintes_perso[], mois_special }
 * @returns {Object} horaires ajustés
 */
function ajusterHoraires(horaires, profil) {
  const ajustes = { ...horaires };
  if (profil) {
    // Le praticien a une heure de début réelle → on l'utilise
    if (profil.debut_reel) {
      ajustes.debut_matin = profil.debut_reel;
    }
    // Septembre = rentrée scolaire, certains praticiens commencent plus tard
    if (profil.mois_special && profil.debut_matin_special) {
      const now = new Date();
      if (now.getMonth() === profil.mois_special) {
        ajustes.debut_matin = profil.debut_matin_special;
      }
    }
  }
  return ajustes;
}

// ===== Analyse d'une journée (déterministe) =====

/**
 * Analyse une journée de RDV et retourne alertes, score, statistiques
 * @param {string} metier — clé du métier (dentiste, medecin_generaliste, etc.)
 * @param {Array} rdvs — tableau de RDV [{ heure, duree, acte, patient, ... }]
 * @param {Object} [profil] — profil praticien { debut_reel, contraintes_perso[] }
 * @returns {{ score: number, alertes: Array, stats: Object, suggestions: Array }}
 */
function analyzeDay(metier, rdvs, profil) {
  const knowledge = METIER_KNOWLEDGE[metier];
  if (!knowledge) {
    return { score: 0, alertes: [{ type: 'erreur', message: `Métier inconnu : ${metier}` }], stats: {}, suggestions: [] };
  }

  const alertes = [];
  const suggestions = [];
  // Fusionner horaires métier + profil praticien
  const horaires = ajusterHoraires(knowledge.horaires_ideaux, profil);
  const kpis = knowledge.kpis || {};
  let score = 100;

  // Trier les RDV par heure
  const sorted = [...rdvs].sort((a, b) => timeToMin(a.heure) - timeToMin(b.heure));

  // Détecter l'heure de début habituelle si pas de profil
  if (!profil && sorted.length > 0) {
    // Le premier RDV du jour EST l'heure de début du praticien — pas une alerte
    horaires.debut_matin = sorted[0].heure;
  }

  // --- Statistiques ---
  let totalDuree = 0;
  let totalCA = 0;
  let fatigueTotale = 0;
  const actesCount = {};

  for (const rdv of sorted) {
    const duree = rdv.duree || 30;
    totalDuree += duree;
    const acteKey = normalizeActe(rdv.acte);
    actesCount[acteKey] = (actesCount[acteKey] || 0) + 1;
    const acteDef = knowledge.actes[acteKey];
    if (acteDef) {
      totalCA += acteDef.prix_secu || acteDef.prix_libre || 0;
      fatigueTotale += acteDef.fatigue || 0;
    }
  }

  // Amplitude de travail
  const debutMin = horaires.debut_matin ? timeToMin(horaires.debut_matin) : 480;
  const finMin = horaires.fin_aprem ? timeToMin(horaires.fin_aprem) : 1140;
  const amplitudeMax = finMin - debutMin - (horaires.pause_dejeuner_min || 60);

  // --- Règles de vérification ---

  // 1. RDV trop tôt ou trop tard
  for (const rdv of sorted) {
    const hm = timeToMin(rdv.heure);
    if (hm < debutMin) {
      alertes.push({ type: 'warning', message: `RDV de ${rdv.patient || 'inconnu'} à ${rdv.heure} avant l'heure d'ouverture (${horaires.debut_matin})` });
      score -= 5;
    }
    const rdvFin = hm + (rdv.duree || 30);
    if (rdvFin > finMin) {
      alertes.push({ type: 'warning', message: `RDV de ${rdv.patient || 'inconnu'} finit à ${minToTime(rdvFin)}, après la fermeture (${horaires.fin_aprem})` });
      score -= 5;
    }
  }

  // 2. Chevauchements
  for (let i = 0; i < sorted.length - 1; i++) {
    const fin_i = timeToMin(sorted[i].heure) + (sorted[i].duree || 30);
    const debut_next = timeToMin(sorted[i + 1].heure);
    if (fin_i > debut_next) {
      alertes.push({
        type: 'error',
        message: `Chevauchement : ${sorted[i].patient || 'RDV'} (fin ${minToTime(fin_i)}) et ${sorted[i + 1].patient || 'RDV'} (début ${sorted[i + 1].heure})`
      });
      score -= 15;
    }
  }

  // 3. Pause déjeuner
  const finMatin = horaires.fin_matin ? timeToMin(horaires.fin_matin) : 720;
  const debutAprem = horaires.debut_aprem ? timeToMin(horaires.debut_aprem) : 840;
  const rdvsDejeuner = sorted.filter(r => {
    const h = timeToMin(r.heure);
    const fin = h + (r.duree || 30);
    return (h >= finMatin - 30 && h < debutAprem) || (fin > finMatin && fin <= debutAprem + 30);
  });
  // Vérifier s'il y a un gap suffisant pour la pause
  let pauseOk = false;
  for (let i = 0; i < sorted.length - 1; i++) {
    const fin_i = timeToMin(sorted[i].heure) + (sorted[i].duree || 30);
    const debut_next = timeToMin(sorted[i + 1].heure);
    if (fin_i >= finMatin - 60 && debut_next <= debutAprem + 60) {
      const gap = debut_next - fin_i;
      if (gap >= (horaires.pause_dejeuner_min || 45)) {
        pauseOk = true;
        break;
      }
    }
  }
  // Si le dernier RDV du matin finit avant fin_matin et le premier de l'après-midi est après debut_aprem
  if (!pauseOk && sorted.length > 0) {
    const matinRdvs = sorted.filter(r => timeToMin(r.heure) < finMatin);
    const apremRdvs = sorted.filter(r => timeToMin(r.heure) >= debutAprem);
    if (matinRdvs.length > 0 && apremRdvs.length > 0) {
      const dernierMatin = matinRdvs[matinRdvs.length - 1];
      const finDernierMatin = timeToMin(dernierMatin.heure) + (dernierMatin.duree || 30);
      const premierAprem = timeToMin(apremRdvs[0].heure);
      if (premierAprem - finDernierMatin >= (horaires.pause_dejeuner_min || 45)) {
        pauseOk = true;
      }
    }
    if (matinRdvs.length === 0 || apremRdvs.length === 0) pauseOk = true; // Demi-journée seulement
  }
  if (sorted.length === 0) pauseOk = true;
  if (!pauseOk) {
    alertes.push({ type: 'warning', message: `Pause déjeuner insuffisante (minimum ${horaires.pause_dejeuner_min || 45} min requis)` });
    score -= 10;
  }

  // 4. Règles spécifiques dentiste
  if (metier === 'dentiste') {
    // Endodonties consécutives
    for (let i = 0; i < sorted.length - 1; i++) {
      if (normalizeActe(sorted[i].acte) === 'endodontie' && normalizeActe(sorted[i + 1].acte) === 'endodontie') {
        alertes.push({ type: 'error', message: 'Deux endodonties consécutives détectées — risque d\'épuisement et d\'erreur' });
        score -= 15;
      }
    }
    // Chirurgie en dernier créneau
    if (sorted.length > 0 && normalizeActe(sorted[sorted.length - 1].acte) === 'chirurgie') {
      alertes.push({ type: 'warning', message: 'Chirurgie programmée en dernier créneau — pas de tampon en cas de dépassement' });
      score -= 10;
    }
    // Empreinte en fin de journée
    if (sorted.length > 0) {
      const derniers = sorted.slice(-2);
      for (const r of derniers) {
        if (normalizeActe(r.acte) === 'empreinte') {
          alertes.push({ type: 'warning', message: 'Empreinte en fin de journée — qualité réduite par la fatigue' });
          score -= 5;
        }
      }
    }
    // Vendredi après-midi chirurgie
    if (sorted.length > 0 && sorted[0].date) {
      const jour = jourSemaine(sorted[0].date);
      if (jour === 'vendredi') {
        const apremChir = sorted.filter(r => timeToMin(r.heure) >= debutAprem && normalizeActe(r.acte) === 'chirurgie');
        if (apremChir.length > 0) {
          alertes.push({ type: 'warning', message: 'Chirurgie le vendredi après-midi — pas de recours pour le patient en cas de complication le week-end' });
          score -= 10;
        }
      }
    }
  }

  // 5. Créneau urgence manquant
  if (knowledge.horaires_ideaux.creneau_urgence_par_demi_journee || metier === 'medecin_generaliste') {
    const matinRdvs = sorted.filter(r => timeToMin(r.heure) < finMatin);
    const apremRdvs = sorted.filter(r => timeToMin(r.heure) >= debutAprem);
    // Vérifier s'il y a un trou de >= 15 min dans chaque demi-journée
    const checkUrgenceGap = (rdvsList) => {
      if (rdvsList.length <= 1) return true; // Assez de place
      for (let i = 0; i < rdvsList.length - 1; i++) {
        const fin_i = timeToMin(rdvsList[i].heure) + (rdvsList[i].duree || 30);
        const debut_next = timeToMin(rdvsList[i + 1].heure);
        if (debut_next - fin_i >= 15) return true;
      }
      return false;
    };
    if (matinRdvs.length > 3 && !checkUrgenceGap(matinRdvs)) {
      suggestions.push('Aucun créneau urgence disponible le matin — prévoir 15-30 min libres');
      score -= 5;
    }
    if (apremRdvs.length > 3 && !checkUrgenceGap(apremRdvs)) {
      suggestions.push('Aucun créneau urgence disponible l\'après-midi — prévoir 15-30 min libres');
      score -= 5;
    }
  }

  // 6. Fatigue excessive
  if (fatigueTotale > sorted.length * 3.5) {
    alertes.push({ type: 'warning', message: `Journée très chargée en actes lourds (fatigue cumulée : ${fatigueTotale})` });
    score -= 10;
  }

  // 7. Nombre de RDV vs idéal
  if (kpis.nb_rdv_ideal_jour && sorted.length > kpis.nb_rdv_ideal_jour * 1.2) {
    suggestions.push(`${sorted.length} RDV prévus, au-dessus de l'idéal de ${kpis.nb_rdv_ideal_jour} — risque de retard en chaîne`);
    score -= 5;
  }

  // 8. CA prévisionnel
  if (kpis.ca_objectif_jour && totalCA < kpis.ca_objectif_jour * 0.6) {
    suggestions.push(`CA prévisionnel (${totalCA.toFixed(0)} €) très en dessous de l'objectif (${kpis.ca_objectif_jour} €) — revoir le mix d'actes`);
  }

  // Taux d'occupation
  const tauxOccupation = amplitudeMax > 0 ? Math.round((totalDuree / amplitudeMax) * 100) : 0;
  if (kpis.taux_occupation_ideal && tauxOccupation > 95) {
    suggestions.push('Taux d\'occupation > 95% — aucune marge pour les urgences ou retards');
    score -= 5;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    note: score >= 80 ? 'Excellent' : score >= 60 ? 'Correct' : score >= 40 ? 'À améliorer' : 'Critique',
    alertes,
    suggestions,
    stats: {
      nb_rdv: sorted.length,
      duree_totale_min: totalDuree,
      ca_previsionnel: Math.round(totalCA * 100) / 100,
      fatigue_cumulee: fatigueTotale,
      taux_occupation: tauxOccupation,
      actes_repartition: actesCount,
      amplitude_travail: `${minToTime(sorted.length > 0 ? timeToMin(sorted[0].heure) : debutMin)} - ${minToTime(sorted.length > 0 ? timeToMin(sorted[sorted.length - 1].heure) + (sorted[sorted.length - 1].duree || 30) : finMin)}`,
    },
  };
}

// ===== Optimisation d'une journée (déterministe) =====

/**
 * Réorganise les RDV selon les règles d'or du métier
 * @param {string} metier
 * @param {Array} rdvs
 * @param {Object} constraints — { preserve_fixed: boolean, patient_constraints: {} }
 * @returns {{ planning_optimise: Array, changements: Array, score_avant: number, score_apres: number }}
 */
function optimizeDay(metier, rdvs, constraints = {}) {
  const knowledge = METIER_KNOWLEDGE[metier];
  if (!knowledge) return { planning_optimise: rdvs, changements: [], score_avant: 0, score_apres: 0 };

  const horaires = knowledge.horaires_ideaux;
  const avant = analyzeDay(metier, rdvs);
  const changements = [];

  // Séparer RDV fixes (à ne pas bouger) et flexibles
  const fixed = constraints.preserve_fixed ? rdvs.filter(r => r.fixed) : [];
  const flexible = constraints.preserve_fixed ? rdvs.filter(r => !r.fixed) : [...rdvs];

  // Classer les RDV flexibles par priorité/type
  const scored = flexible.map(r => {
    const acteKey = normalizeActe(r.acte);
    const acteDef = knowledge.actes[acteKey] || {};
    return {
      ...r,
      _acteKey: acteKey,
      _fatigue: acteDef.fatigue || 2,
      _duree: r.duree || acteDef.duree_min || 30,
      _priority: acteKey === 'urgence' ? 10 :
                 acteKey === 'premiere_consultation' ? 8 :
                 acteKey === 'bilan' ? 8 :
                 acteKey === 'pose_bagues' ? 7 :
                 acteKey === 'chirurgie' ? 7 :
                 acteKey === 'endodontie' ? 7 :
                 acteKey === 'post_operatoire' ? 7 :
                 (acteDef.fatigue || 0) >= 4 ? 6 :
                 (acteDef.fatigue || 0) >= 3 ? 4 :
                 2,
    };
  });

  // Stratégie : actes lourds le matin, légers l'après-midi, alterner lourd/léger
  const lourds = scored.filter(r => r._fatigue >= 4).sort((a, b) => b._priority - a._priority);
  const moyens = scored.filter(r => r._fatigue === 3).sort((a, b) => b._priority - a._priority);
  const legers = scored.filter(r => r._fatigue <= 2).sort((a, b) => b._priority - a._priority);

  // Créer le planning optimisé
  const planning = [];
  let cursor = timeToMin(horaires.debut_matin || '08:30');
  const finMatin = timeToMin(horaires.fin_matin || '12:30');
  const debutAprem = timeToMin(horaires.debut_aprem || '14:00');
  const finAprem = timeToMin(horaires.fin_aprem || '19:00');
  let demiJournee = 'matin'; // matin ou aprem

  // Pool d'actes à placer, en alternant lourd/léger
  const pool = [];
  const maxLourds = Math.max(lourds.length, moyens.length);
  for (let i = 0; i < maxLourds; i++) {
    if (i < lourds.length) pool.push(lourds[i]);
    if (i < legers.length) pool.push(legers[i]);
    if (i < moyens.length) pool.push(moyens[i]);
    if (i + maxLourds < legers.length) pool.push(legers[i + maxLourds]);
  }
  // Ajouter les légers restants
  for (let i = maxLourds; i < legers.length; i++) {
    if (!pool.includes(legers[i])) pool.push(legers[i]);
  }

  // Placer dans les créneaux
  let urgenceSlotMatin = false;
  let urgenceSlotAprem = false;

  for (const rdv of pool) {
    // Insérer créneau urgence si nécessaire
    if (demiJournee === 'matin' && !urgenceSlotMatin && cursor >= timeToMin(horaires.debut_matin || '08:30') + 90) {
      cursor += 15; // 15 min tampon urgence
      urgenceSlotMatin = true;
    }
    if (demiJournee === 'aprem' && !urgenceSlotAprem && cursor >= debutAprem + 90) {
      cursor += 15;
      urgenceSlotAprem = true;
    }

    // Transition matin → après-midi
    if (demiJournee === 'matin' && cursor + rdv._duree > finMatin) {
      demiJournee = 'aprem';
      cursor = debutAprem;
    }

    // Vérifier qu'on ne dépasse pas la fin de journée
    if (cursor + rdv._duree > finAprem) {
      changements.push(`${rdv.patient || 'RDV'} ne rentre plus dans la journée après optimisation`);
      continue;
    }

    const ancienneHeure = rdv.heure;
    const nouvelleHeure = minToTime(cursor);
    planning.push({
      ...rdv,
      heure: nouvelleHeure,
      duree: rdv._duree,
    });

    if (ancienneHeure !== nouvelleHeure) {
      changements.push(`${rdv.patient || rdv._acteKey} : ${ancienneHeure} → ${nouvelleHeure}`);
    }

    cursor += rdv._duree;
    // Ajouter temps de stérilisation/transition
    cursor += metier === 'dentiste' ? 10 : 5;
  }

  // Nettoyer les propriétés internes
  for (const p of planning) {
    delete p._acteKey;
    delete p._fatigue;
    delete p._duree;
    delete p._priority;
  }

  const apres = analyzeDay(metier, planning);

  return {
    planning_optimise: planning,
    changements,
    score_avant: avant.score,
    score_apres: apres.score,
    alertes_restantes: apres.alertes,
  };
}

// ===== Trouver le meilleur créneau =====

/**
 * Trouve les meilleurs créneaux pour un acte donné
 * @param {string} metier
 * @param {Array} rdvs — agenda existant de la journée
 * @param {string} acte — type d'acte
 * @param {Object} contraintes — { urgence: boolean, apres_heure, avant_heure, duree_override }
 * @returns {Array} — 3 meilleurs créneaux avec score
 */
function findBestSlot(metier, rdvs, acte, contraintes = {}) {
  const knowledge = METIER_KNOWLEDGE[metier];
  if (!knowledge) return [];

  const acteKey = normalizeActe(acte);
  const acteDef = knowledge.actes[acteKey] || {};
  const duree = contraintes.duree_override || acteDef.duree_min || 30;
  const horaires = knowledge.horaires_ideaux;

  const debutMatin = timeToMin(horaires.debut_matin || '08:30');
  const finMatin = timeToMin(horaires.fin_matin || '12:30');
  const debutAprem = timeToMin(horaires.debut_aprem || '14:00');
  const finAprem = timeToMin(horaires.fin_aprem || '19:00');

  // Trouver tous les gaps dans la journée
  const sorted = [...rdvs].sort((a, b) => timeToMin(a.heure) - timeToMin(b.heure));
  const gaps = [];

  // Gap avant le premier RDV du matin
  if (sorted.length === 0) {
    gaps.push({ debut: debutMatin, fin: finMatin });
    gaps.push({ debut: debutAprem, fin: finAprem });
  } else {
    const premierDebut = timeToMin(sorted[0].heure);
    if (premierDebut > debutMatin && premierDebut - debutMatin >= duree) {
      gaps.push({ debut: debutMatin, fin: premierDebut });
    }

    for (let i = 0; i < sorted.length - 1; i++) {
      const fin_i = timeToMin(sorted[i].heure) + (sorted[i].duree || 30);
      const debut_next = timeToMin(sorted[i + 1].heure);
      if (debut_next - fin_i >= duree) {
        gaps.push({ debut: fin_i, fin: debut_next });
      }
    }

    // Gap après le dernier RDV
    const dernierFin = timeToMin(sorted[sorted.length - 1].heure) + (sorted[sorted.length - 1].duree || 30);
    if (dernierFin < finMatin && finMatin - dernierFin >= duree) {
      gaps.push({ debut: dernierFin, fin: finMatin });
    }
    if (dernierFin < debutAprem) {
      gaps.push({ debut: debutAprem, fin: finAprem });
    } else if (dernierFin < finAprem && finAprem - dernierFin >= duree) {
      gaps.push({ debut: dernierFin, fin: finAprem });
    }
  }

  // Scorer chaque créneau possible
  const slots = [];
  for (const gap of gaps) {
    // Peut-on placer l'acte dans ce gap ?
    if (gap.fin - gap.debut < duree) continue;

    const debutSlot = gap.debut;
    let scoreSlot = 50; // Base

    // Bonus matin pour actes lourds
    if ((acteDef.fatigue || 0) >= 4 && debutSlot < finMatin) scoreSlot += 20;
    // Bonus début de demi-journée pour première consultation
    if (acteKey === 'premiere_consultation' || acteKey === 'bilan') {
      if (debutSlot === debutMatin || debutSlot === debutAprem) scoreSlot += 15;
    }
    // Malus fin de journée pour chirurgie/empreinte
    if ((acteKey === 'chirurgie' || acteKey === 'empreinte') && debutSlot + duree > finAprem - 60) {
      scoreSlot -= 20;
    }
    // Contrainte urgence = le plus tôt possible
    if (contraintes.urgence) scoreSlot += Math.max(0, 30 - Math.floor((debutSlot - debutMatin) / 10));
    // Contraintes horaires du patient
    if (contraintes.apres_heure && debutSlot < timeToMin(contraintes.apres_heure)) continue;
    if (contraintes.avant_heure && debutSlot + duree > timeToMin(contraintes.avant_heure)) continue;

    slots.push({
      heure: minToTime(debutSlot),
      fin: minToTime(debutSlot + duree),
      duree,
      score: Math.min(100, Math.max(0, scoreSlot)),
      raison: scoreSlot >= 70 ? 'Créneau idéal selon les règles métier' :
              scoreSlot >= 50 ? 'Créneau acceptable' :
              'Créneau possible mais non optimal',
    });
  }

  // Trier par score décroissant, retourner les 3 meilleurs
  return slots.sort((a, b) => b.score - a.score).slice(0, 3);
}

// ===== Plan de traitement =====

/**
 * Génère un plan de traitement avec dates suggérées
 * @param {string} metier
 * @param {Object} patient — { nom, contraintes }
 * @param {Array} actes_necessaires — liste des actes à planifier
 * @param {Array} agenda_existant — agenda des jours à venir (par jour)
 * @returns {{ plan: Array, duree_totale: string, nb_seances: number }}
 */
function planTreatment(metier, patient, actes_necessaires, agenda_existant = []) {
  const knowledge = METIER_KNOWLEDGE[metier];
  if (!knowledge) return { plan: [], duree_totale: '0', nb_seances: 0 };

  // Si c'est un plan prédéfini, utiliser la séquence optimale
  const planKey = actes_necessaires.length === 1 ? normalizeActe(actes_necessaires[0]) : null;
  let sequence = [];
  if (planKey && knowledge.plans_traitement && knowledge.plans_traitement[planKey]) {
    sequence = [...knowledge.plans_traitement[planKey]];
  } else {
    sequence = actes_necessaires.map(a => normalizeActe(a));
  }

  const plan = [];
  let joursOffset = 0;
  const today = new Date();

  for (let i = 0; i < sequence.length; i++) {
    const acteKey = sequence[i];
    const acteDef = knowledge.actes[acteKey] || {};
    const duree = acteDef.duree_min || 30;

    // Espacement entre les séances
    if (i > 0) {
      const prevActe = sequence[i - 1];
      if (prevActe === 'chirurgie') joursOffset += 10; // 10 jours post-chirurgie
      else if (prevActe === 'endodontie') joursOffset += 7;
      else if (prevActe === 'empreinte') joursOffset += 14; // Temps labo
      else if (prevActe === 'detartrage') joursOffset += 3;
      else joursOffset += 7; // Par défaut 1 semaine
    }

    const dateSugg = new Date(today);
    dateSugg.setDate(dateSugg.getDate() + joursOffset);
    // Éviter dimanche
    if (dateSugg.getDay() === 0) dateSugg.setDate(dateSugg.getDate() + 1);
    // Éviter samedi (sauf si pratique)
    if (dateSugg.getDay() === 6) dateSugg.setDate(dateSugg.getDate() + 2);

    plan.push({
      seance: i + 1,
      acte: acteKey,
      description: acteKey.replace(/_/g, ' '),
      duree_prevue: duree,
      date_suggeree: dateSugg.toISOString().slice(0, 10),
      prix_estime: acteDef.prix_secu || acteDef.prix_libre || 0,
      notes: acteDef.necessite_after ? `Prévoir ${acteDef.necessite_after} ensuite` : '',
    });
  }

  const totalPrix = plan.reduce((s, p) => s + p.prix_estime, 0);
  const totalDuree = plan.reduce((s, p) => s + p.duree_prevue, 0);

  return {
    patient: patient?.nom || 'Patient',
    plan,
    nb_seances: plan.length,
    duree_totale_min: totalDuree,
    cout_estime: Math.round(totalPrix * 100) / 100,
    duree_traitement: `${joursOffset} jours environ`,
  };
}

// ===== Détection de trous =====

/**
 * Détecte les trous exploitables dans un planning
 * @param {string} metier
 * @param {Array} rdvs
 * @returns {Array} — gaps avec durée et suggestion
 */
function detectGaps(metier, rdvs) {
  const knowledge = METIER_KNOWLEDGE[metier];
  if (!knowledge) return [];

  const horaires = knowledge.horaires_ideaux;
  const debutMatin = timeToMin(horaires.debut_matin || '08:30');
  const finMatin = timeToMin(horaires.fin_matin || '12:30');
  const debutAprem = timeToMin(horaires.debut_aprem || '14:00');
  const finAprem = timeToMin(horaires.fin_aprem || '19:00');

  const sorted = [...rdvs].sort((a, b) => timeToMin(a.heure) - timeToMin(b.heure));
  const gaps = [];

  // Fonction pour trouver les actes qui rentrent dans un gap
  const actesQuiRentrent = (dureeDispo) => {
    const suggestions = [];
    for (const [key, def] of Object.entries(knowledge.actes)) {
      if (def.duree_min <= dureeDispo) {
        suggestions.push({ acte: key, duree: def.duree_min, prix: def.prix_secu || def.prix_libre || 0 });
      }
    }
    return suggestions.sort((a, b) => b.prix - a.prix).slice(0, 3);
  };

  // Début de journée
  if (sorted.length > 0) {
    const premierDebut = timeToMin(sorted[0].heure);
    if (premierDebut > debutMatin + 15) {
      const dureeGap = premierDebut - debutMatin;
      gaps.push({
        debut: minToTime(debutMatin),
        fin: sorted[0].heure,
        duree: dureeGap,
        demi_journee: 'matin',
        actes_possibles: actesQuiRentrent(dureeGap),
      });
    }
  }

  // Entre les RDV
  for (let i = 0; i < sorted.length - 1; i++) {
    const fin_i = timeToMin(sorted[i].heure) + (sorted[i].duree || 30);
    const debut_next = timeToMin(sorted[i + 1].heure);
    const dureeGap = debut_next - fin_i;

    // Ignorer la pause déjeuner
    if (fin_i >= finMatin - 15 && debut_next <= debutAprem + 15) continue;
    // Gap significatif (> 15 min)
    if (dureeGap >= 15) {
      gaps.push({
        debut: minToTime(fin_i),
        fin: minToTime(debut_next),
        duree: dureeGap,
        demi_journee: fin_i < finMatin ? 'matin' : 'après-midi',
        actes_possibles: actesQuiRentrent(dureeGap),
      });
    }
  }

  // Fin de journée
  if (sorted.length > 0) {
    const dernierFin = timeToMin(sorted[sorted.length - 1].heure) + (sorted[sorted.length - 1].duree || 30);
    if (dernierFin < finAprem - 15) {
      const demiJ = dernierFin < finMatin ? 'matin' : 'après-midi';
      const finDemiJ = dernierFin < finMatin ? finMatin : finAprem;
      const dureeGap = finDemiJ - dernierFin;
      if (dureeGap >= 15) {
        gaps.push({
          debut: minToTime(dernierFin),
          fin: minToTime(finDemiJ),
          duree: dureeGap,
          demi_journee: demiJ,
          actes_possibles: actesQuiRentrent(dureeGap),
        });
      }
    }
  }

  return gaps;
}

// ===== Score no-show =====

/**
 * Calcule un score de risque de no-show pour un patient
 * @param {Object} patient — { nb_rdv_total, nb_noshow, dernier_noshow, anciennete_mois, age }
 * @returns {{ score: number, niveau: string, facteurs: Array }}
 */
function scoreNoShow(patient) {
  if (!patient) return { score: 0, niveau: 'inconnu', facteurs: ['Données patient manquantes'] };

  let score = 10; // Base : tout le monde a un petit risque
  const facteurs = [];

  // Historique no-show
  const nbNoshow = patient.nb_noshow || 0;
  const nbTotal = patient.nb_rdv_total || 1;
  const tauxNoshow = nbNoshow / nbTotal;

  if (tauxNoshow > 0.3) {
    score += 40;
    facteurs.push(`Taux de no-show élevé : ${Math.round(tauxNoshow * 100)}%`);
  } else if (tauxNoshow > 0.15) {
    score += 25;
    facteurs.push(`Taux de no-show modéré : ${Math.round(tauxNoshow * 100)}%`);
  } else if (tauxNoshow > 0) {
    score += 10;
    facteurs.push(`Quelques absences passées (${nbNoshow}/${nbTotal})`);
  }

  // Ancienneté
  const anciennete = patient.anciennete_mois || 0;
  if (anciennete < 3) {
    score += 15;
    facteurs.push('Nouveau patient (< 3 mois)');
  } else if (anciennete > 24) {
    score -= 10;
    facteurs.push('Patient fidèle (> 2 ans)');
  }

  // Dernier no-show récent
  if (patient.dernier_noshow) {
    const daysSince = Math.floor((Date.now() - new Date(patient.dernier_noshow).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince < 30) {
      score += 20;
      facteurs.push(`No-show récent (il y a ${daysSince} jours)`);
    } else if (daysSince < 90) {
      score += 10;
      facteurs.push(`No-show dans les 3 derniers mois`);
    }
  }

  // Âge (les 18-25 ans ont plus tendance au no-show statistiquement)
  if (patient.age) {
    if (patient.age >= 18 && patient.age <= 25) {
      score += 10;
      facteurs.push('Tranche d\'âge 18-25 ans (statistiquement plus d\'absences)');
    } else if (patient.age >= 60) {
      score -= 5;
      facteurs.push('Patient senior (généralement ponctuel)');
    }
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    niveau: score >= 60 ? 'élevé' : score >= 35 ? 'modéré' : 'faible',
    facteurs,
    recommandation: score >= 60 ? 'Envoyer un rappel SMS 24h + 1h avant, demander confirmation'
                   : score >= 35 ? 'Rappel SMS classique 24h avant'
                   : 'Rappel standard suffisant',
  };
}

// =============================================
// TRIAGE URGENCE — Arbre décisionnel secrétaire IA
// Défauts raisonnables → praticien ajuste → IA apprend
// =============================================

const URGENCE_MOTIFS_DEFAUT = {
  // --- Douleurs ---
  infection_abces: {
    label: 'Infection / Abcès',
    questions: ['Avez-vous un gonflement ?', 'Avez-vous de la fièvre ?', 'Difficulté à avaler ou ouvrir la bouche ?'],
    keywords: ['gonflé', 'gonflement', 'abcès', 'pus', 'fièvre', 'infection', 'enflé', 'chaud'],
    duree_defaut: 15,
    niveau: 'critique',
    delai_max_h: 4,
    note_agenda: 'Infection/abcès — prescription ATB + drainage éventuel',
  },
  pulpite: {
    label: 'Pulpite (douleur vive spontanée)',
    questions: ['La douleur est-elle spontanée ou provoquée ?', 'La douleur vous réveille-t-elle la nuit ?', 'Le chaud ou le froid aggrave ?'],
    keywords: ['douleur spontanée', 'réveille la nuit', 'insupportable', 'lancinant', 'pulsatile', 'très mal'],
    duree_defaut: 30,
    niveau: 'haute',
    delai_max_h: 24,
    note_agenda: 'Pulpite — douleur spontanée/nocturne, dévitalisation probable',
  },
  douleur_provoquee: {
    label: 'Douleur provoquée (chaud/froid/mastication)',
    questions: ['La douleur apparaît quand vous mangez ?', 'Chaud ou froid la déclenche ?', 'Depuis quand ?'],
    keywords: ['mal quand je mange', 'froid', 'chaud', 'sensible', 'provoquée', 'mastication'],
    duree_defaut: 20,
    niveau: 'moderee',
    delai_max_h: 72,
    note_agenda: 'Douleur provoquée — diagnostic + radio à prévoir',
  },

  // --- Fractures ---
  fracture_dent_douleur: {
    label: 'Fracture dent avec douleur',
    questions: ['Gros ou petit morceau cassé ?', 'Voyez-vous du rose/rouge au niveau de la fracture ?', 'Avez-vous mal ?'],
    keywords: ['cassé', 'fracture', 'morceau', 'bout de dent', 'douleur', 'mal'],
    duree_defaut: 30,
    niveau: 'haute',
    delai_max_h: 24,
    note_agenda: 'Fracture dentaire + douleur — évaluation vitalité + soin',
  },
  fracture_dent_cosmetique: {
    label: 'Fracture dent cosmétique (pas de douleur)',
    questions: ['Avez-vous mal ?', 'C\'est une dent de devant ?', 'Petit éclat ou gros morceau ?'],
    keywords: ['cassé', 'éclat', 'bout', 'coin', 'pas mal', 'esthétique', 'devant'],
    duree_defaut: 20,
    niveau: 'basse',
    delai_max_h: 168,
    note_agenda: 'Fracture cosmétique — composite',
  },
  fracture_appareil_amovible: {
    label: 'Fracture appareil amovible (prothèse)',
    questions: ['L\'appareil est cassé en deux ou juste une dent partie ?', 'Vous arrivez à manger sans ?'],
    keywords: ['appareil cassé', 'dentier cassé', 'prothèse cassée', 'dent tombée appareil', 'amovible', 'cassé en deux', 'appareil dentaire cassé', 'dentier fendu', 'stellite cassé'],
    duree_defaut: 15,
    niveau: 'moderee',
    delai_max_h: 48,
    note_agenda: 'Fracture appareil amovible — réparation ou empreinte réparation labo',
  },

  // --- Descellements ---
  descellement_couronne: {
    label: 'Descellement couronne unitaire',
    questions: ['La couronne est complètement partie ?', 'Avez-vous mal en dessous ?', 'Vous l\'avez conservée ?'],
    keywords: ['couronne', 'descellée', 'tombée', 'décollée', 'couronne partie'],
    duree_defaut: 15,
    niveau: 'moderee',
    delai_max_h: 48,
    note_agenda: 'Descellement couronne unitaire — rescellement',
  },
  descellement_bridge_court: {
    label: 'Descellement bridge courte portée (2-3 éléments)',
    questions: ['Combien de dents sur le bridge ?', 'Il bouge ou il est complètement parti ?', 'Douleur ?'],
    keywords: ['bridge', 'descellé', 'bouge', '3 dents', 'petit bridge'],
    duree_defaut: 20,
    niveau: 'moderee',
    delai_max_h: 48,
    note_agenda: 'Descellement bridge court — rescellement + vérification piliers',
  },
  descellement_bridge_long: {
    label: 'Descellement bridge longue étendue (4+ éléments)',
    questions: ['C\'est un grand bridge ?', 'Combien de dents environ ?', 'Il est complètement parti ou il bouge ?'],
    keywords: ['grand bridge', 'bridge complet', 'long bridge', '4 dents', '5 dents', '6 dents', 'grande prothèse', 'gros bridge', 'bridge longue'],
    duree_defaut: 30,
    niveau: 'haute',
    delai_max_h: 24,
    note_agenda: 'Descellement bridge longue étendue — rescellement + évaluation piliers + radio',
  },

  // --- Post-opératoire ---
  hemorragie_post_extraction: {
    label: 'Hémorragie post-extraction',
    questions: ['L\'extraction date de quand ?', 'Le saignement est abondant ou léger ?', 'Prenez-vous des anticoagulants ?'],
    keywords: ['saigne', 'hémorragie', 'sang', 'extraction', 'arraché', 'coule'],
    duree_defaut: 15,
    niveau: 'critique',
    delai_max_h: 2,
    note_agenda: 'Hémorragie post-extraction — compression + suture hémostatique',
  },
  alveolite: {
    label: 'Alvéolite post-extraction',
    questions: ['L\'extraction date de combien de jours ?', 'Mauvais goût dans la bouche ?', 'Douleur intense qui irradie ?'],
    keywords: ['extraction', 'alvéolite', 'mauvais goût', 'douleur intense', '3 jours après', 'arraché'],
    duree_defaut: 20,
    niveau: 'haute',
    delai_max_h: 24,
    note_agenda: 'Alvéolite probable — curetage alvéolaire + pansement',
  },

  // --- Trauma ---
  trauma_choc: {
    label: 'Traumatisme (choc, chute, accident)',
    questions: ['Que s\'est-il passé ?', 'Des dents bougent ?', 'Vous arrivez à fermer la bouche normalement ?'],
    keywords: ['choc', 'chute', 'accident', 'coup', 'trauma', 'tombé', 'bouge', 'sport'],
    duree_defaut: 30,
    niveau: 'critique',
    delai_max_h: 4,
    note_agenda: 'Traumatisme — radio panoramique + bilan complet',
  },
  dent_expulsee: {
    label: 'Dent expulsée (avulsion)',
    questions: ['La dent est complètement sortie ?', 'Vous l\'avez récupérée ?', 'Mettez-la dans du lait ou sous la langue !'],
    keywords: ['dent tombée complete', 'dent partie racine', 'expulsée', 'avulsion', 'sortie completement', 'arrachée accident', 'dent par terre'],
    duree_defaut: 45,
    niveau: 'critique',
    delai_max_h: 1,
    note_agenda: 'AVULSION DENTAIRE — réimplantation urgente si < 1h',
  },

  // --- Prothèse ---
  prothese_blesse: {
    label: 'Prothèse amovible qui blesse',
    questions: ['Où est-ce que ça blesse ?', 'C\'est une prothèse récente ou ancienne ?', 'Arrivez-vous à manger ?'],
    keywords: ['blesse', 'gencive', 'appareil fait mal', 'frotte', 'muqueuse', 'ulcère'],
    duree_defaut: 15,
    niveau: 'basse',
    delai_max_h: 72,
    note_agenda: 'Prothèse amovible blessante — retouche / équilibration',
  },

  // --- Orthodontie ---
  fil_ortho_pique: {
    label: 'Fil orthodontique qui pique / bracket décollé',
    questions: ['Un bracket est décollé ou un fil dépasse ?', 'Ça vous blesse la joue ?'],
    keywords: ['fil', 'bracket', 'pique', 'ortho', 'bague', 'appareil ortho', 'joue blessée'],
    duree_defaut: 15,
    niveau: 'basse',
    delai_max_h: 72,
    note_agenda: 'Urgence ortho — fil/bracket à repositionner',
  },

  // --- Divers ---
  perte_obturation: {
    label: 'Perte d\'obturation (plombage tombé)',
    questions: ['Avez-vous mal ?', 'C\'est un plombage ancien ?', 'Vous sentez un trou avec la langue ?'],
    keywords: ['plombage', 'obturation', 'tombé', 'trou', 'composite parti', 'amalgame'],
    duree_defaut: 20,
    niveau: 'moderee',
    delai_max_h: 72,
    note_agenda: 'Perte obturation — reconstitution',
  },

  autre_urgence: {
    label: 'Autre motif urgent',
    questions: ['Pouvez-vous décrire votre problème ?', 'Avez-vous mal ?', 'Depuis quand ?'],
    keywords: [],
    duree_defaut: 20,
    niveau: 'moderee',
    delai_max_h: 48,
    note_agenda: 'Urgence à qualifier — motif à préciser',
  },
};

const NIVEAUX_URGENCE = {
  critique: { badge: '🔴', label: 'Critique', color: '#ef4444', delai: 'Aujourd\'hui' },
  haute:    { badge: '🟠', label: 'Haute', color: '#f97316', delai: 'Sous 24h' },
  moderee:  { badge: '🟡', label: 'Modérée', color: '#eab308', delai: 'Sous 2-3 jours' },
  basse:    { badge: '🟢', label: 'Basse', color: '#22c55e', delai: 'Dans la semaine' },
};

/**
 * Triage urgence — Classifie le motif du patient à partir de son texte libre
 * @param {string} textePatient — ce que le patient décrit ("j'ai mal", "ma couronne est tombée"...)
 * @param {Object} [overrides] — durées personnalisées par le praticien { infection_abces: 10, pulpite: 25, ... }
 * @param {Object} [historique] — historique des actes réalisés pour apprentissage { infection_abces: [12,15,14], ... }
 * @returns {{ motif, label, niveau, badge, duree, delai, note_agenda, questions_suivantes }}
 */
function triageUrgence(textePatient, overrides = {}, historique = {}) {
  const lower = (textePatient || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let bestMatch = null;
  let bestScore = 0;

  for (const [code, motif] of Object.entries(URGENCE_MOTIFS_DEFAUT)) {
    let score = 0;
    let nbMatch = 0;
    for (const kw of motif.keywords) {
      const kwNorm = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (lower.includes(kwNorm)) {
        // Keywords multi-mots comptent plus (plus spécifiques)
        const bonus = kw.split(' ').length >= 2 ? 5 : 2;
        score += bonus;
        nbMatch++;
      }
    }
    // Bonus quand plusieurs keywords matchent (précision)
    if (nbMatch >= 2) score += nbMatch * 3;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = code;
    }
  }

  // Fallback si rien ne matche
  if (!bestMatch || bestScore === 0) bestMatch = 'autre_urgence';

  const motif = URGENCE_MOTIFS_DEFAUT[bestMatch];
  const niv = NIVEAUX_URGENCE[motif.niveau];

  // 3 niveaux de durée : historique > override praticien > défaut
  let duree = motif.duree_defaut;
  if (overrides[bestMatch]) {
    duree = overrides[bestMatch];
  }
  if (historique[bestMatch] && historique[bestMatch].length >= 3) {
    // Moyenne des 10 derniers actes similaires
    const recent = historique[bestMatch].slice(-10);
    duree = Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
  }

  return {
    motif: bestMatch,
    label: motif.label,
    niveau: motif.niveau,
    badge: niv.badge,
    color: niv.color,
    duree,
    duree_source: historique[bestMatch]?.length >= 3 ? 'apprentissage' : (overrides[bestMatch] ? 'praticien' : 'defaut'),
    delai: niv.delai,
    delai_max_h: motif.delai_max_h,
    note_agenda: `${niv.badge} URG ${niv.label} — ${motif.note_agenda}`,
    questions_suivantes: motif.questions,
  };
}

/**
 * Retourne l'arbre complet des motifs d'urgence (pour l'UI de config praticien)
 * @param {Object} [overrides] — durées personnalisées par le praticien
 * @returns {Array} Liste des motifs avec durées
 */
function getUrgenceMotifs(overrides = {}) {
  return Object.entries(URGENCE_MOTIFS_DEFAUT).map(([code, motif]) => ({
    code,
    label: motif.label,
    niveau: motif.niveau,
    badge: NIVEAUX_URGENCE[motif.niveau].badge,
    duree_defaut: motif.duree_defaut,
    duree_praticien: overrides[code] || null,
    duree_active: overrides[code] || motif.duree_defaut,
    delai: NIVEAUX_URGENCE[motif.niveau].delai,
    note_agenda: motif.note_agenda,
  }));
}

// =============================================
// SCORE PATIENT — Fiabilité globale
// Historique : ponctualité, absences, annulations
// Score 0-100 (100 = patient parfait)
// =============================================

/**
 * Calcule le score de fiabilité d'un patient
 * @param {Object} historique — { rdvs: [{ date, statut, absence_type, heure_prevue, heure_arrivee, annule_avant_min }] }
 * @returns {{ score, niveau, couleur, detail, recommandation }}
 */
function scorePatient(historique) {
  const rdvs = historique.rdvs || [];
  if (rdvs.length === 0) {
    return { score: 50, niveau: 'nouveau', couleur: '#9ca3af', detail: { total: 0 }, recommandation: 'Nouveau patient — pas encore d\'historique' };
  }

  let points = 100;
  const detail = {
    total: rdvs.length,
    presents: 0,
    a_lheure: 0,
    en_retard: 0,
    retard_moyen_min: 0,
    absences_noshow: 0,
    absences_excuse: 0,
    annulations: 0,
    annul_tardives: 0,   // < 2h avant
    annul_correctes: 0,  // > 24h avant
    annul_moyennes: 0,   // 2h-24h avant
  };

  let totalRetard = 0;

  for (const rdv of rdvs) {
    const statut = rdv.statut || 'present';
    const absType = rdv.absence_type || '';

    if (statut === 'absent') {
      if (absType === 'noshow') {
        detail.absences_noshow++;
        points -= 15; // Gros malus
      } else if (absType === 'excuse') {
        detail.absences_excuse++;
        points -= 3; // Petit malus (il a prévenu)
      }
      // annule_cabinet = neutre
    } else if (statut === 'annule') {
      detail.annulations++;
      const avantMin = rdv.annule_avant_min || 0;
      if (avantMin < 120) {
        // Annulation < 2h avant = tardive
        detail.annul_tardives++;
        points -= 10;
      } else if (avantMin < 1440) {
        // Annulation 2h-24h = moyen
        detail.annul_moyennes++;
        points -= 4;
      } else {
        // Annulation > 24h = correct
        detail.annul_correctes++;
        points -= 1;
      }
    } else {
      // Présent
      detail.presents++;

      // Ponctualité
      if (rdv.heure_prevue && rdv.heure_arrivee) {
        const prevue = new Date(rdv.heure_prevue).getTime();
        const arrivee = new Date(rdv.heure_arrivee).getTime();
        const retardMin = Math.round((arrivee - prevue) / 60000);

        if (retardMin <= 0) {
          detail.a_lheure++;
          points += 1; // Bonus ponctualité
        } else if (retardMin <= 5) {
          detail.a_lheure++; // 5 min de tolérance
        } else {
          detail.en_retard++;
          totalRetard += retardMin;
          if (retardMin <= 10) points -= 2;
          else if (retardMin <= 20) points -= 5;
          else points -= 8; // > 20 min de retard
        }
      } else {
        detail.a_lheure++; // Pas de données = on compte comme à l'heure
      }
    }
  }

  // Retard moyen
  detail.retard_moyen_min = detail.en_retard > 0 ? Math.round(totalRetard / detail.en_retard) : 0;

  // Pourcentages
  detail.pct_presence = Math.round(detail.presents / detail.total * 100);
  detail.pct_ponctualite = detail.presents > 0 ? Math.round(detail.a_lheure / detail.presents * 100) : 0;
  detail.pct_noshow = Math.round(detail.absences_noshow / detail.total * 100);

  // Bonus fidélité (> 10 RDV = patient régulier)
  if (detail.total >= 10) points += 5;
  if (detail.total >= 20) points += 5;

  // Clamp 0-100
  const score = Math.max(0, Math.min(100, Math.round(points)));

  // Niveau et couleur
  let niveau, couleur, recommandation;
  if (score >= 85) {
    niveau = 'excellent';
    couleur = '#10b981';
    recommandation = 'Patient fiable — créneaux premium, rappel standard';
  } else if (score >= 70) {
    niveau = 'bon';
    couleur = '#3b82f6';
    recommandation = 'Bon patient — rappel SMS 24h';
  } else if (score >= 50) {
    niveau = 'moyen';
    couleur = '#f59e0b';
    recommandation = 'Patient à surveiller — rappel SMS 24h + 2h avant, créneaux en fin de demi-journée';
  } else if (score >= 30) {
    niveau = 'risque';
    couleur = '#f97316';
    recommandation = 'Patient à risque — rappel SMS + appel, confirmation obligatoire, ne pas réserver créneau premium';
  } else {
    niveau = 'problematique';
    couleur = '#ef4444';
    recommandation = 'Patient problématique — confirmation obligatoire 48h avant, prévoir remplacement, discussion avec le patient recommandée';
  }

  return { score, niveau, couleur, detail, recommandation };
}

// ===== Exports =====
module.exports = {
  METIER_KNOWLEDGE,
  URGENCE_MOTIFS_DEFAUT,
  NIVEAUX_URGENCE,
  analyzeDay,
  optimizeDay,
  findBestSlot,
  planTreatment,
  detectGaps,
  scoreNoShow,
  scorePatient,
  triageUrgence,
  getUrgenceMotifs,
  normalizeActe,
  timeToMin,
  minToTime,
};
