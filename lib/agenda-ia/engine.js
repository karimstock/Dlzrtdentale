/**
 * JADOMI Agenda IA - Moteur d'optimisation intelligent
 * Cabinet dentaire - Optimisation de l'ordre des rendez-vous
 *
 * REGLE FONDAMENTALE : On n'optimise JAMAIS pour MOINS de patients.
 * On optimise pour un MEILLEUR ORDRE. Revenue = volume.
 * Toutes les suggestions sont de l'aide a la decision, jamais automatiques.
 */

'use strict';

// ============================================================
// CONSTANTES ET POIDS (ajustables par cabinet via rules)
// ============================================================

/** Poids du score de serenite */
const POIDS_SCORE = {
  nb_patients_vs_max: 15,
  actes_lourds_consecutifs: 20,
  adequation_pauses: 20,
  disponibilite_urgence: 10,
  retards_prevus: 15,
  fiabilite_patients: 10,
  courbe_fatigue: 10
};

/** Seuils par defaut */
const SEUILS = {
  patients_jour_min: 23,
  patients_jour_max: 30,
  score_journee_rouge: 50,
  duree_pause_mini_minutes: 5,
  intervalle_pause_max_minutes: 90,
  pause_apres_acte_lourd_minutes: 10,
  pause_apres_chirurgie_minutes: 15,
  heure_debut_journee: '08:00',
  heure_fin_journee: '19:00',
  debut_dejeuner: '12:00',
  fin_dejeuner: '14:00',
  actes_lourds_consecutifs_max: 2,
  nb_urgences_slots_min: 2,
  retard_moyen_nouveau_patient_minutes: 8,
  retard_moyen_patient_peu_fiable_minutes: 12,
  seuil_patient_peu_fiable: 0.6,
  nouveaux_patients_max_par_jour: 5
};

/** Types d'actes et leurs proprietes */
const TYPES_ACTES = {
  chirurgie: { lourd: true, duree_min: 45, energie: 'haute', matin_prefere: true },
  extraction: { lourd: true, duree_min: 30, energie: 'haute', matin_prefere: true },
  endodontie: { lourd: true, duree_min: 45, energie: 'haute', matin_prefere: true },
  prothese_pose: { lourd: true, duree_min: 30, energie: 'moyenne', matin_prefere: true },
  soin_carie: { lourd: false, duree_min: 20, energie: 'moyenne', matin_prefere: false },
  detartrage: { lourd: false, duree_min: 20, energie: 'basse', matin_prefere: false },
  controle: { lourd: false, duree_min: 15, energie: 'basse', matin_prefere: false },
  consultation: { lourd: false, duree_min: 15, energie: 'basse', matin_prefere: false },
  urgence: { lourd: false, duree_min: 30, energie: 'haute', matin_prefere: false },
  administratif: { lourd: false, duree_min: 10, energie: 'basse', matin_prefere: false }
};

/** Intentions reconnues par la commande vocale */
const INTENTS_VOCAUX = {
  placer_rdv: ['place', 'mets', 'programme', 'planifie', 'ajoute'],
  trouver_creneau: ['trouve', 'cherche', 'propose', 'disponible'],
  alleger_jour: ['allege', 'decharge', 'reduis', 'libere'],
  analyser: ['analyse', 'regarde', 'evalue', 'check', 'verifie'],
  deplacer: ['deplace', 'bouge', 'recale', 'repousse', 'avance']
};

// ============================================================
// UTILITAIRES
// ============================================================

/**
 * Convertit une heure "HH:MM" en minutes depuis minuit
 * @param {string} heure - Format "HH:MM"
 * @returns {number}
 */
function heureEnMinutes(heure) {
  const [h, m] = heure.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Convertit des minutes depuis minuit en "HH:MM"
 * @param {number} minutes
 * @returns {string}
 */
function minutesEnHeure(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Verifie si un acte est considere comme lourd
 * @param {object} appointment
 * @returns {boolean}
 */
function estActeLourd(appointment) {
  const type = TYPES_ACTES[appointment.type_acte];
  if (!type) return appointment.duree >= 45;
  return type.lourd;
}

/**
 * Calcule la duree en minutes entre deux heures
 * @param {string} debut - "HH:MM"
 * @param {string} fin - "HH:MM"
 * @returns {number}
 */
function dureeEntreHeures(debut, fin) {
  return heureEnMinutes(fin) - heureEnMinutes(debut);
}

/**
 * Fusionne les seuils par defaut avec les regles du cabinet
 * @param {object} rules - Regles personnalisees
 * @returns {object}
 */
function mergeRules(rules) {
  return { ...SEUILS, ...(rules || {}) };
}

// ============================================================
// FONCTIONS PRINCIPALES
// ============================================================

/**
 * Analyse une journee de rendez-vous et retourne un diagnostic complet.
 * Ne propose JAMAIS de reduire le nombre de patients.
 *
 * @param {Array} appointments - Liste des RDV du jour [{heure_debut, heure_fin, type_acte, patient, duree}]
 * @param {object} practitionerProfile - Profil praticien {nom, specialite, preferences, heures_travail}
 * @param {object} rules - Regles du cabinet (seuils personnalises)
 * @returns {object} Diagnostic complet de la journee
 */
function analyzeDay(appointments, practitionerProfile, rules) {
  const config = mergeRules(rules);
  const sorted = [...appointments].sort((a, b) => heureEnMinutes(a.heure_debut) - heureEnMinutes(b.heure_debut));

  const metrics = _calculerMetrics(sorted, config);
  const score = calculateSerenityScore({ appointments: sorted, metrics, config, practitionerProfile });
  const alertes = _genererAlertes(sorted, metrics, config);
  const suggestions = _genererSuggestions(sorted, metrics, config, practitionerProfile);

  return {
    score_serenite: score.total,
    alertes,
    suggestions,
    journee_rouge: score.total < config.score_journee_rouge,
    metrics,
    details_score: score.details
  };
}

/**
 * Trouve les 3 meilleurs creneaux pour un patient et type d'acte donnes.
 * Optimise le placement sans jamais refuser de rendez-vous.
 *
 * @param {object} patientProfile - {nom, fiabilite, anxieux, nouveau, historique}
 * @param {string} appointmentType - Type d'acte (cle de TYPES_ACTES)
 * @param {object} dateRange - {debut: "YYYY-MM-DD", fin: "YYYY-MM-DD"}
 * @param {object} existingAppointments - Map {date: [appointments]}
 * @param {object} practitionerProfile - Profil praticien
 * @returns {Array} Top 3 creneaux classes par score composite
 */
function findBestSlots(patientProfile, appointmentType, dateRange, existingAppointments, practitionerProfile) {
  const typeActe = TYPES_ACTES[appointmentType] || TYPES_ACTES.consultation;
  const duree = typeActe.duree_min;
  const slots = [];

  const dateDebut = new Date(dateRange.debut);
  const dateFin = new Date(dateRange.fin);

  for (let d = new Date(dateDebut); d <= dateFin; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const jourSemaine = d.getDay();

    // Pas de dimanche (sauf si le praticien travaille)
    if (jourSemaine === 0) continue;

    const rdvJour = existingAppointments[dateStr] || [];
    const creneauxLibres = _trouverCreneauxLibres(rdvJour, duree, practitionerProfile);

    for (const creneau of creneauxLibres) {
      const score = _scorerCreneau(creneau, rdvJour, patientProfile, typeActe, practitionerProfile);
      slots.push({
        date: dateStr,
        heure_debut: creneau.debut,
        heure_fin: creneau.fin,
        score: score.total,
        raisons: score.raisons,
        risques: score.risques,
        alternative: null
      });
    }
  }

  // Trier par score decroissant, retourner top 3
  slots.sort((a, b) => b.score - a.score);
  const top3 = slots.slice(0, 3);

  // Ajouter une alternative au premier choix
  if (top3.length > 1) {
    top3[0].alternative = top3[1];
  }

  return top3;
}

/**
 * Identifie les rendez-vous deplacables pour alleger une journee surchargee.
 * Ne supprime AUCUN rendez-vous, propose uniquement des deplacements.
 *
 * @param {Array} dayAppointments - RDV du jour surcharge
 * @param {object} practitionerProfile - Profil praticien
 * @param {object} weekAppointments - Map {date: [appointments]} de la semaine
 * @returns {Array} Liste de propositions de deplacement
 */
function suggestReschedules(dayAppointments, practitionerProfile, weekAppointments) {
  const sorted = [...dayAppointments].sort((a, b) => heureEnMinutes(a.heure_debut) - heureEnMinutes(b.heure_debut));
  const propositions = [];

  // Types deplacables par ordre de priorite
  const typesDeplacables = ['administratif', 'detartrage', 'controle', 'soin_carie'];

  for (const rdv of sorted) {
    if (!typesDeplacables.includes(rdv.type_acte)) continue;

    // Trouver des jours cibles moins charges
    const joursCibles = _trouverJoursLegers(weekAppointments, practitionerProfile);

    if (joursCibles.length === 0) continue;

    const priorite = typesDeplacables.indexOf(rdv.type_acte) + 1; // 1 = plus deplacable
    const raison = _raisonDeplacement(rdv, sorted);
    const message = generatePatientMessage({
      type: 'reschedule',
      patient: rdv.patient,
      raison: raison,
      jours_proposes: joursCibles
    });

    propositions.push({
      appointment: rdv,
      raison,
      jours_cibles: joursCibles.slice(0, 3),
      priorite,
      message_patient: message
    });
  }

  // Trier par priorite (1 = plus facile a deplacer)
  propositions.sort((a, b) => a.priorite - b.priorite);
  return propositions;
}

/**
 * Detecte les journees rouges (score < 50) sur une semaine.
 *
 * @param {object} weekAppointments - Map {date: [appointments]}
 * @param {object} practitionerProfile - Profil praticien
 * @returns {Array} Journees problematiques avec actions proposees
 */
function detectRedDays(weekAppointments, practitionerProfile) {
  const joursRouges = [];

  for (const [date, appointments] of Object.entries(weekAppointments)) {
    const analyse = analyzeDay(appointments, practitionerProfile, null);

    if (analyse.journee_rouge) {
      joursRouges.push({
        date,
        score: analyse.score_serenite,
        raisons: analyse.alertes.filter(a => a.severity === 'haute').map(a => a.message),
        actions_proposees: analyse.suggestions.map(s => s.action || s.message)
      });
    }
  }

  joursRouges.sort((a, b) => a.score - b.score);
  return joursRouges;
}

/**
 * Algorithme central de calcul du score de serenite.
 * Base 100, deductions transparentes, bonus possibles.
 *
 * @param {object} dayData - {appointments, metrics, config, practitionerProfile}
 * @returns {object} {total, details: [{facteur, impact, explication}]}
 */
function calculateSerenityScore(dayData) {
  const { appointments, metrics, config, practitionerProfile } = dayData;
  const cfg = config || mergeRules(null);
  let score = 100;
  const details = [];

  // --- DEDUCTIONS ---

  // 1. Surcharge (mais attention: sous-charge aussi = probleme de revenue)
  if (metrics.nb_patients > cfg.patients_jour_max) {
    const exces = metrics.nb_patients - cfg.patients_jour_max;
    const deduction = Math.min(exces * 3, POIDS_SCORE.nb_patients_vs_max);
    score -= deduction;
    details.push({
      facteur: 'surcharge_patients',
      impact: -deduction,
      explication: `${metrics.nb_patients} patients (max recommande: ${cfg.patients_jour_max})`
    });
  }

  // 2. Actes lourds consecutifs
  const consecutifs = _compterActesLourdsConsecutifs(appointments);
  if (consecutifs > cfg.actes_lourds_consecutifs_max) {
    const deduction = Math.min((consecutifs - cfg.actes_lourds_consecutifs_max) * 7, POIDS_SCORE.actes_lourds_consecutifs);
    score -= deduction;
    details.push({
      facteur: 'actes_lourds_consecutifs',
      impact: -deduction,
      explication: `${consecutifs} actes lourds sans pause (max: ${cfg.actes_lourds_consecutifs_max})`
    });
  }

  // 3. Pauses insuffisantes
  if (metrics.temps_pause < 30) {
    const deduction = Math.min(Math.round((30 - metrics.temps_pause) * 0.8), POIDS_SCORE.adequation_pauses);
    score -= deduction;
    details.push({
      facteur: 'pauses_insuffisantes',
      impact: -deduction,
      explication: `Seulement ${metrics.temps_pause}min de pause (minimum 30min recommande)`
    });
  }

  // 4. Pas de creneau urgence
  if (metrics.nb_urgences === 0) {
    const hasSlotUrgence = _verifierSlotUrgence(appointments, cfg);
    if (!hasSlotUrgence) {
      const deduction = POIDS_SCORE.disponibilite_urgence;
      score -= deduction;
      details.push({
        facteur: 'pas_de_slot_urgence',
        impact: -deduction,
        explication: 'Aucun creneau disponible pour urgences'
      });
    }
  }

  // 5. Retards prevus
  if (metrics.retards_prevus > 15) {
    const deduction = Math.min(Math.round(metrics.retards_prevus / 3), POIDS_SCORE.retards_prevus);
    score -= deduction;
    details.push({
      facteur: 'retards_prevus',
      impact: -deduction,
      explication: `${metrics.retards_prevus}min de retard cumule prevu`
    });
  }

  // 6. Fiabilite patients
  const fiabiliteMoyenne = _fiabiliteMoyenne(appointments);
  if (fiabiliteMoyenne < 0.75) {
    const deduction = Math.min(Math.round((0.75 - fiabiliteMoyenne) * 30), POIDS_SCORE.fiabilite_patients);
    score -= deduction;
    details.push({
      facteur: 'fiabilite_patients',
      impact: -deduction,
      explication: `Fiabilite moyenne ${Math.round(fiabiliteMoyenne * 100)}% (seuil: 75%)`
    });
  }

  // 7. Courbe de fatigue (actes lourds en fin de journee)
  const penaliteFatigue = _calculerPenaliteFatigue(appointments);
  if (penaliteFatigue > 0) {
    const deduction = Math.min(penaliteFatigue, POIDS_SCORE.courbe_fatigue);
    score -= deduction;
    details.push({
      facteur: 'fatigue_fin_journee',
      impact: -deduction,
      explication: 'Actes lourds programmes en fin de journee (fatigue accrue)'
    });
  }

  // 8. Trop de nouveaux patients
  const nbNouveaux = appointments.filter(a => a.patient && a.patient.nouveau).length;
  if (nbNouveaux > cfg.nouveaux_patients_max_par_jour) {
    const deduction = Math.min((nbNouveaux - cfg.nouveaux_patients_max_par_jour) * 3, 8);
    score -= deduction;
    details.push({
      facteur: 'trop_nouveaux_patients',
      impact: -deduction,
      explication: `${nbNouveaux} nouveaux patients (charge administrative accrue)`
    });
  }

  // 9. Cluster de patients anxieux
  const clusterAnxieux = _detecterClusterAnxieux(appointments);
  if (clusterAnxieux > 2) {
    const deduction = Math.min((clusterAnxieux - 2) * 4, 8);
    score -= deduction;
    details.push({
      facteur: 'cluster_patients_anxieux',
      impact: -deduction,
      explication: `${clusterAnxieux} patients anxieux consecutifs (charge emotionnelle)`
    });
  }

  // --- BONUS ---

  // Pauses bien reparties
  if (metrics.temps_pause >= 45) {
    const bonus = 5;
    score += bonus;
    details.push({
      facteur: 'pauses_adequates',
      impact: +bonus,
      explication: 'Pauses bien reparties dans la journee'
    });
  }

  // Bonne variete d'actes
  const variete = _calculerVariete(appointments);
  if (variete > 0.6) {
    const bonus = 3;
    score += bonus;
    details.push({
      facteur: 'bonne_variete',
      impact: +bonus,
      explication: 'Bonne alternance entre types d\'actes'
    });
  }

  // Apres-midi leger
  const apremLeger = _estApremLeger(appointments);
  if (apremLeger) {
    const bonus = 4;
    score += bonus;
    details.push({
      facteur: 'aprem_leger',
      impact: +bonus,
      explication: 'Apres-midi avec actes moins exigeants'
    });
  }

  // Creneau urgence preserve
  if (_verifierSlotUrgence(appointments, cfg)) {
    const bonus = 3;
    score += bonus;
    details.push({
      facteur: 'slot_urgence_disponible',
      impact: +bonus,
      explication: 'Creneau urgence disponible'
    });
  }

  // Clamp entre 0 et 100
  score = Math.max(0, Math.min(100, Math.round(score)));

  return { total: score, details };
}

/**
 * Genere les recommandations de pauses optimales.
 *
 * @param {Array} appointments - Liste des RDV
 * @param {object} practitionerProfile - Profil praticien
 * @returns {Array} Pauses recommandees [{heure, duree, type, raison}]
 */
function generateBreakRecommendations(appointments, practitionerProfile) {
  const sorted = [...appointments].sort((a, b) => heureEnMinutes(a.heure_debut) - heureEnMinutes(b.heure_debut));
  const pauses = [];
  let dernierePause = heureEnMinutes(sorted[0]?.heure_debut || '08:00');

  for (let i = 0; i < sorted.length; i++) {
    const rdv = sorted[i];
    const finRdv = heureEnMinutes(rdv.heure_fin);
    const debutRdv = heureEnMinutes(rdv.heure_debut);

    // Pause apres chirurgie (15min)
    if (rdv.type_acte === 'chirurgie' || rdv.type_acte === 'extraction') {
      pauses.push({
        heure: rdv.heure_fin,
        duree: 15,
        type: 'post_chirurgie',
        raison: `Recuperation apres ${rdv.type_acte}`
      });
      dernierePause = finRdv;
      continue;
    }

    // Pause apres acte > 45min (10min)
    if (rdv.duree >= 45) {
      pauses.push({
        heure: rdv.heure_fin,
        duree: 10,
        type: 'post_acte_long',
        raison: `Pause apres acte de ${rdv.duree}min`
      });
      dernierePause = finRdv;
      continue;
    }

    // Pause reguliere toutes les 60-90min (5min)
    if (finRdv - dernierePause >= 75) {
      pauses.push({
        heure: rdv.heure_fin,
        duree: 5,
        type: 'reguliere',
        raison: `${Math.round((finRdv - dernierePause) / 60)}h sans pause`
      });
      dernierePause = finRdv;
    }
  }

  // Pause dejeuner protegee
  const debutDej = heureEnMinutes(SEUILS.debut_dejeuner);
  const finDej = heureEnMinutes(SEUILS.fin_dejeuner);
  const rdvPendantDej = sorted.filter(r => {
    const debut = heureEnMinutes(r.heure_debut);
    return debut >= debutDej && debut < finDej;
  });

  if (rdvPendantDej.length === 0) {
    pauses.push({
      heure: SEUILS.debut_dejeuner,
      duree: 60,
      type: 'dejeuner',
      raison: 'Pause dejeuner protegee'
    });
  } else {
    pauses.push({
      heure: SEUILS.debut_dejeuner,
      duree: 30,
      type: 'dejeuner_reduit',
      raison: 'Pause dejeuner minimum (RDV midi programmes)'
    });
  }

  // Trier par heure
  pauses.sort((a, b) => heureEnMinutes(a.heure) - heureEnMinutes(b.heure));
  return pauses;
}

/**
 * Propose un planning reordonne qui maximise la serenite
 * tout en gardant TOUS les patients.
 *
 * @param {Array} appointments - RDV du jour
 * @param {object} practitionerProfile - Profil praticien
 * @param {object} constraints - {heure_debut, heure_fin, pause_dejeuner, rdv_fixes}
 * @returns {object} {optimized_schedule, score_avant, score_apres, changements}
 */
function optimizeDay(appointments, practitionerProfile, constraints) {
  const config = mergeRules(constraints);

  // Score avant optimisation
  const analyseAvant = analyzeDay(appointments, practitionerProfile, constraints);
  const scoreAvant = analyseAvant.score_serenite;

  // Separer RDV fixes et deplacables
  const rdvFixes = appointments.filter(a => constraints && constraints.rdv_fixes && constraints.rdv_fixes.includes(a.id));
  const rdvMobiles = appointments.filter(a => !rdvFixes.includes(a));

  // Classer les RDV mobiles par strategie
  const lourds = rdvMobiles.filter(a => estActeLourd(a));
  const anxieux = rdvMobiles.filter(a => a.patient && a.patient.anxieux && !estActeLourd(a));
  const peuFiables = rdvMobiles.filter(a => a.patient && a.patient.fiabilite < SEUILS.seuil_patient_peu_fiable && !estActeLourd(a) && !(a.patient.anxieux));
  const legers = rdvMobiles.filter(a => !estActeLourd(a) && !(a.patient && a.patient.anxieux) && !(a.patient && a.patient.fiabilite < SEUILS.seuil_patient_peu_fiable));

  // Strategie d'ordonnancement:
  // Matin: actes lourds (praticien frais) avec pauses intercalees
  // Fin matin: patients peu fiables (si absent, pas de trou avant midi)
  // Apres-midi: actes legers + anxieux avec buffer
  const heureDebut = heureEnMinutes(config.heure_debut_journee || '08:00');
  const heureFin = heureEnMinutes(config.heure_fin_journee || '19:00');
  const debutAprem = heureEnMinutes(config.fin_dejeuner || '14:00');

  let curseur = heureDebut;
  const planningOptimise = [];
  const changements = [];

  // Matin: actes lourds avec alternance
  const matinLourds = [...lourds].sort((a, b) => b.duree - a.duree);
  let compteurLourds = 0;

  for (const rdv of matinLourds) {
    if (curseur >= heureEnMinutes(config.debut_dejeuner || '12:00')) break;

    const nouvelleHeure = minutesEnHeure(curseur);
    if (nouvelleHeure !== rdv.heure_debut) {
      changements.push({
        rdv_id: rdv.id,
        patient: rdv.patient?.nom,
        ancien_horaire: rdv.heure_debut,
        nouvel_horaire: nouvelleHeure,
        raison: 'Acte lourd place le matin (praticien frais)'
      });
    }
    planningOptimise.push({ ...rdv, heure_debut: nouvelleHeure, heure_fin: minutesEnHeure(curseur + rdv.duree) });
    curseur += rdv.duree;
    compteurLourds++;

    // Pause apres 2 lourds consecutifs ou apres chirurgie
    if (compteurLourds >= 2 || rdv.type_acte === 'chirurgie') {
      curseur += 10;
      compteurLourds = 0;
    }
  }

  // Fin de matin: patients peu fiables
  for (const rdv of peuFiables) {
    if (curseur >= heureEnMinutes(config.debut_dejeuner || '12:00')) break;

    const nouvelleHeure = minutesEnHeure(curseur);
    if (nouvelleHeure !== rdv.heure_debut) {
      changements.push({
        rdv_id: rdv.id,
        patient: rdv.patient?.nom,
        ancien_horaire: rdv.heure_debut,
        nouvel_horaire: nouvelleHeure,
        raison: 'Profil organisationnel : place en fin de demi-journee'
      });
    }
    planningOptimise.push({ ...rdv, heure_debut: nouvelleHeure, heure_fin: minutesEnHeure(curseur + rdv.duree) });
    curseur += rdv.duree;
  }

  // Pause dejeuner
  curseur = Math.max(curseur, debutAprem);

  // Apres-midi: patients anxieux (avec buffer) puis legers
  for (const rdv of anxieux) {
    if (curseur >= heureFin) break;
    curseur += 5; // buffer avant patient anxieux

    const nouvelleHeure = minutesEnHeure(curseur);
    if (nouvelleHeure !== rdv.heure_debut) {
      changements.push({
        rdv_id: rdv.id,
        patient: rdv.patient?.nom,
        ancien_horaire: rdv.heure_debut,
        nouvel_horaire: nouvelleHeure,
        raison: 'Patient anxieux : creneau calme avec tampon'
      });
    }
    planningOptimise.push({ ...rdv, heure_debut: nouvelleHeure, heure_fin: minutesEnHeure(curseur + rdv.duree) });
    curseur += rdv.duree + 5; // buffer apres
  }

  // Legers
  for (const rdv of legers) {
    if (curseur >= heureFin) break;

    const nouvelleHeure = minutesEnHeure(curseur);
    if (nouvelleHeure !== rdv.heure_debut) {
      changements.push({
        rdv_id: rdv.id,
        patient: rdv.patient?.nom,
        ancien_horaire: rdv.heure_debut,
        nouvel_horaire: nouvelleHeure,
        raison: 'Acte leger place l\'apres-midi'
      });
    }
    planningOptimise.push({ ...rdv, heure_debut: nouvelleHeure, heure_fin: minutesEnHeure(curseur + rdv.duree) });
    curseur += rdv.duree;

    // Pause reguliere toutes les 90 min
    const dernierePauseIdx = planningOptimise.length;
    if (dernierePauseIdx % 5 === 0) {
      curseur += 5;
    }
  }

  // Ajouter les RDV fixes a leurs positions d'origine
  for (const rdv of rdvFixes) {
    planningOptimise.push(rdv);
  }

  // Retrier par heure
  planningOptimise.sort((a, b) => heureEnMinutes(a.heure_debut) - heureEnMinutes(b.heure_debut));

  // Score apres
  const analyseApres = analyzeDay(planningOptimise, practitionerProfile, constraints);

  return {
    optimized_schedule: planningOptimise,
    score_avant: scoreAvant,
    score_apres: analyseApres.score_serenite,
    changements
  };
}

/**
 * Genere des messages patients professionnels, calmes et RGPD-safe.
 * Toujours en vouvoiement, jamais agressif.
 *
 * @param {object} context - {type, patient, raison, jours_proposes, ...}
 * @returns {string} Message pret a envoyer
 */
function generatePatientMessage(context) {
  const prenom = context.patient?.prenom || 'Patient';
  const nom = context.patient?.nom || '';
  const civilite = context.patient?.civilite || 'Madame, Monsieur';

  switch (context.type) {
    case 'reschedule':
      return _messageReschedule(civilite, prenom, nom, context);

    case 'punctuality_reminder':
      return _messagePonctualite(civilite, prenom, nom, context);

    case 'reinforced_confirmation':
      return _messageConfirmationRenforcee(civilite, prenom, nom, context);

    case 'new_slot_proposal':
      return _messageNouveauCreneau(civilite, prenom, nom, context);

    case 'absence_warning':
      return _messageAbsenceRepetee(civilite, prenom, nom, context);

    default:
      return `${civilite},\n\nNous vous contactons au sujet de votre rendez-vous. Merci de nous rappeler au cabinet.\n\nCordialement,\nCabinet dentaire JADOMI`;
  }
}

/**
 * Interprete une commande vocale de la secretaire en actions structurees.
 *
 * @param {string} transcript - Texte transcrit de la commande vocale
 * @param {object} currentState - Etat actuel {date_affichee, patient_selectionne, vue}
 * @returns {object} {intent, entities, proposed_actions, explanation}
 */
function processVoiceCommand(transcript, currentState) {
  const texte = transcript.toLowerCase().trim();
  const intent = _detecterIntent(texte);
  const entities = _extraireEntites(texte);
  const proposedActions = _genererActions(intent, entities, currentState);
  const explanation = _expliquerAction(intent, entities);

  return {
    intent,
    entities,
    proposed_actions: proposedActions,
    explanation
  };
}

// ============================================================
// FONCTIONS INTERNES
// ============================================================

/**
 * Calcule les metriques brutes d'une journee
 */
function _calculerMetrics(appointments, config) {
  const nbPatients = appointments.length;
  let dureeTotale = 0;
  let tempsPause = 0;
  let nbActesLourds = 0;
  let nbUrgences = 0;
  let retardsPrevus = 0;

  for (let i = 0; i < appointments.length; i++) {
    const rdv = appointments[i];
    dureeTotale += rdv.duree || 0;

    if (estActeLourd(rdv)) nbActesLourds++;
    if (rdv.type_acte === 'urgence') nbUrgences++;

    // Temps entre RDV = pause potentielle
    if (i > 0) {
      const finPrecedent = heureEnMinutes(appointments[i - 1].heure_fin);
      const debutActuel = heureEnMinutes(rdv.heure_debut);
      const ecart = debutActuel - finPrecedent;
      if (ecart > 0) tempsPause += ecart;
    }

    // Retards prevus
    if (rdv.patient) {
      if (rdv.patient.nouveau) {
        retardsPrevus += config.retard_moyen_nouveau_patient_minutes;
      } else if (rdv.patient.fiabilite < config.seuil_patient_peu_fiable) {
        retardsPrevus += config.retard_moyen_patient_peu_fiable_minutes;
      }
    }
  }

  // Taux de remplissage
  const heuresOuverture = dureeEntreHeures(config.heure_debut_journee, config.heure_fin_journee);
  const pauseDej = dureeEntreHeures(config.debut_dejeuner, config.fin_dejeuner);
  const tempsDisponible = heuresOuverture - pauseDej;
  const tauxRemplissage = tempsDisponible > 0 ? Math.round((dureeTotale / tempsDisponible) * 100) : 0;

  return {
    nb_patients: nbPatients,
    duree_totale: dureeTotale,
    taux_remplissage: tauxRemplissage,
    temps_pause: tempsPause,
    nb_actes_lourds: nbActesLourds,
    nb_urgences: nbUrgences,
    retards_prevus: retardsPrevus
  };
}

/**
 * Genere les alertes pour une journee
 */
function _genererAlertes(appointments, metrics, config) {
  const alertes = [];

  if (metrics.nb_patients > config.patients_jour_max) {
    alertes.push({
      type: 'surcharge',
      message: `${metrics.nb_patients} patients programmes (maximum recommande: ${config.patients_jour_max})`,
      severity: 'haute'
    });
  }

  if (metrics.temps_pause < 20) {
    alertes.push({
      type: 'pauses',
      message: 'Pauses largement insuffisantes : risque de fatigue et d\'erreur',
      severity: 'haute'
    });
  } else if (metrics.temps_pause < 30) {
    alertes.push({
      type: 'pauses',
      message: 'Pauses un peu courtes pour cette charge de travail',
      severity: 'moyenne'
    });
  }

  const consecutifs = _compterActesLourdsConsecutifs(appointments);
  if (consecutifs > config.actes_lourds_consecutifs_max) {
    alertes.push({
      type: 'actes_lourds',
      message: `${consecutifs} actes lourds consecutifs sans pause intercalaire`,
      severity: 'haute'
    });
  }

  if (metrics.retards_prevus > 20) {
    alertes.push({
      type: 'retards',
      message: `${metrics.retards_prevus}min de retards cumules prevus (profils organisationnels)`,
      severity: 'moyenne'
    });
  }

  if (!_verifierSlotUrgence(appointments, config) && metrics.taux_remplissage > 90) {
    alertes.push({
      type: 'urgence',
      message: 'Aucun creneau disponible pour urgences aujourd\'hui',
      severity: 'moyenne'
    });
  }

  return alertes;
}

/**
 * Genere les suggestions d'amelioration
 */
function _genererSuggestions(appointments, metrics, config, practitionerProfile) {
  const suggestions = [];

  // Suggestion de reordonnancement
  const actesLourdAprem = appointments.filter(a => {
    return estActeLourd(a) && heureEnMinutes(a.heure_debut) >= heureEnMinutes(config.fin_dejeuner);
  });
  if (actesLourdAprem.length > 0) {
    suggestions.push({
      type: 'reordonnancement',
      message: `${actesLourdAprem.length} acte(s) lourd(s) en apres-midi. Proposition: deplacer le matin pour un meilleur confort.`,
      action: 'optimizeDay',
      priorite: 'haute'
    });
  }

  // Suggestion de pause
  if (metrics.temps_pause < 30) {
    suggestions.push({
      type: 'pause',
      message: 'Inserer des micro-pauses de 5min entre les actes lourds',
      action: 'generateBreakRecommendations',
      priorite: 'moyenne'
    });
  }

  // Suggestion urgence
  if (!_verifierSlotUrgence(appointments, config)) {
    suggestions.push({
      type: 'urgence',
      message: 'Prevoir un creneau de 30min pour les urgences (conseil: 11h30 ou 17h)',
      action: 'slot_urgence',
      priorite: 'basse'
    });
  }

  return suggestions;
}

/**
 * Compte le nombre maximum d'actes lourds consecutifs
 */
function _compterActesLourdsConsecutifs(appointments) {
  let max = 0;
  let current = 0;
  for (const rdv of appointments) {
    if (estActeLourd(rdv)) {
      current++;
      max = Math.max(max, current);
    } else {
      current = 0;
    }
  }
  return max;
}

/**
 * Verifie si un slot urgence est disponible
 */
function _verifierSlotUrgence(appointments, config) {
  const sorted = [...appointments].sort((a, b) => heureEnMinutes(a.heure_debut) - heureEnMinutes(b.heure_debut));

  for (let i = 0; i < sorted.length - 1; i++) {
    const fin = heureEnMinutes(sorted[i].heure_fin);
    const debutSuivant = heureEnMinutes(sorted[i + 1].heure_debut);
    if (debutSuivant - fin >= 30) return true;
  }

  // Verifier en fin de journee
  if (sorted.length > 0) {
    const derniereFin = heureEnMinutes(sorted[sorted.length - 1].heure_fin);
    const finJournee = heureEnMinutes(config.heure_fin_journee || '19:00');
    if (finJournee - derniereFin >= 30) return true;
  }

  return sorted.length === 0;
}

/**
 * Calcule la fiabilite moyenne des patients
 */
function _fiabiliteMoyenne(appointments) {
  const fiabilites = appointments
    .filter(a => a.patient && typeof a.patient.fiabilite === 'number')
    .map(a => a.patient.fiabilite);

  if (fiabilites.length === 0) return 1;
  return fiabilites.reduce((sum, f) => sum + f, 0) / fiabilites.length;
}

/**
 * Calcule la penalite de fatigue (actes lourds en fin de journee)
 */
function _calculerPenaliteFatigue(appointments) {
  let penalite = 0;
  const seuilAprem = heureEnMinutes('16:00');

  for (const rdv of appointments) {
    if (estActeLourd(rdv) && heureEnMinutes(rdv.heure_debut) >= seuilAprem) {
      penalite += 4;
    }
  }
  return penalite;
}

/**
 * Detecte les clusters de patients anxieux consecutifs
 */
function _detecterClusterAnxieux(appointments) {
  let max = 0;
  let current = 0;
  for (const rdv of appointments) {
    if (rdv.patient && rdv.patient.anxieux) {
      current++;
      max = Math.max(max, current);
    } else {
      current = 0;
    }
  }
  return max;
}

/**
 * Calcule la variete des actes (indice de Shannon simplifie)
 */
function _calculerVariete(appointments) {
  if (appointments.length === 0) return 0;
  const types = {};
  for (const rdv of appointments) {
    types[rdv.type_acte] = (types[rdv.type_acte] || 0) + 1;
  }
  const nbTypes = Object.keys(types).length;
  const maxTypes = Object.keys(TYPES_ACTES).length;
  return nbTypes / maxTypes;
}

/**
 * Verifie si l'apres-midi est compose d'actes legers
 */
function _estApremLeger(appointments) {
  const aprem = appointments.filter(a => heureEnMinutes(a.heure_debut) >= heureEnMinutes('14:00'));
  if (aprem.length === 0) return true;
  const lourdsAprem = aprem.filter(a => estActeLourd(a));
  return lourdsAprem.length <= 1;
}

/**
 * Trouve les creneaux libres dans une journee
 */
function _trouverCreneauxLibres(rdvJour, dureeNecessaire, practitionerProfile) {
  const heureDebut = heureEnMinutes(practitionerProfile?.heures_travail?.debut || '08:00');
  const heureFin = heureEnMinutes(practitionerProfile?.heures_travail?.fin || '19:00');
  const sorted = [...rdvJour].sort((a, b) => heureEnMinutes(a.heure_debut) - heureEnMinutes(b.heure_debut));
  const creneaux = [];

  let curseur = heureDebut;
  for (const rdv of sorted) {
    const debutRdv = heureEnMinutes(rdv.heure_debut);
    if (debutRdv - curseur >= dureeNecessaire) {
      creneaux.push({ debut: minutesEnHeure(curseur), fin: minutesEnHeure(curseur + dureeNecessaire) });
    }
    curseur = Math.max(curseur, heureEnMinutes(rdv.heure_fin));
  }

  if (heureFin - curseur >= dureeNecessaire) {
    creneaux.push({ debut: minutesEnHeure(curseur), fin: minutesEnHeure(curseur + dureeNecessaire) });
  }

  return creneaux;
}

/**
 * Score un creneau specifique selon tous les facteurs
 */
function _scorerCreneau(creneau, rdvJour, patientProfile, typeActe, practitionerProfile) {
  let total = 0;
  const raisons = [];
  const risques = [];

  const heureMin = heureEnMinutes(creneau.debut);
  const nbRdvJour = rdvJour.length;

  // 1. Equilibre charge journee (0-15)
  if (nbRdvJour < SEUILS.patients_jour_min) {
    total += 15;
    raisons.push('Journee peu chargee, bon equilibre');
  } else if (nbRdvJour < SEUILS.patients_jour_max) {
    total += 10;
  } else {
    total += 3;
    risques.push('Journee deja bien chargee');
  }

  // 2. Moment de la journee (0-15)
  if (typeActe.matin_prefere && heureMin < heureEnMinutes('12:00')) {
    total += 15;
    raisons.push('Acte complexe place le matin (praticien frais)');
  } else if (!typeActe.matin_prefere && heureMin >= heureEnMinutes('14:00')) {
    total += 12;
    raisons.push('Acte leger place l\'apres-midi');
  } else if (typeActe.matin_prefere && heureMin >= heureEnMinutes('14:00')) {
    total += 5;
    risques.push('Acte complexe en apres-midi (fatigue possible)');
  } else {
    total += 8;
  }

  // 3. Energie praticien (0-10)
  if (heureMin >= heureEnMinutes('17:00') && typeActe.energie === 'haute') {
    total += 2;
    risques.push('Fin de journee pour un acte exigeant');
  } else if (heureMin < heureEnMinutes('11:00') && typeActe.energie === 'haute') {
    total += 10;
    raisons.push('Debut de journee, pleine energie');
  } else {
    total += 7;
  }

  // 4. Fiabilite patient (0-10)
  if (patientProfile && patientProfile.fiabilite < SEUILS.seuil_patient_peu_fiable) {
    // Placer en fin de demi-journee
    if (heureMin >= heureEnMinutes('11:00') && heureMin < heureEnMinutes('12:00')) {
      total += 10;
      raisons.push('Profil organisationnel: creneau en fin de matinee');
    } else if (heureMin >= heureEnMinutes('18:00')) {
      total += 10;
      raisons.push('Profil organisationnel: creneau en fin de journee');
    } else {
      total += 4;
    }
  } else {
    total += 8;
  }

  // 5. Buffer post-acte (0-10)
  const rdvSuivant = rdvJour.find(r => heureEnMinutes(r.heure_debut) >= heureEnMinutes(creneau.fin));
  if (typeActe.lourd) {
    if (!rdvSuivant || heureEnMinutes(rdvSuivant.heure_debut) - heureEnMinutes(creneau.fin) >= 10) {
      total += 10;
      raisons.push('Temps de recuperation disponible apres l\'acte');
    } else {
      total += 3;
      risques.push('Pas de buffer apres un acte lourd');
    }
  } else {
    total += 8;
  }

  // 6. Changement de contexte (0-10)
  const rdvAvant = [...rdvJour].filter(r => heureEnMinutes(r.heure_fin) <= heureEnMinutes(creneau.debut)).pop();
  if (rdvAvant && rdvAvant.type_acte === typeActe) {
    total += 10;
    raisons.push('Meme type d\'acte que le precedent (continuite)');
  } else {
    total += 6;
  }

  // 7. Preservation urgence (0-10)
  const slotUrgencePreserve = _verifierSlotUrgence([...rdvJour, { heure_debut: creneau.debut, heure_fin: creneau.fin }], SEUILS);
  if (slotUrgencePreserve) {
    total += 10;
  } else {
    total += 2;
    risques.push('Ce creneau supprimerait le dernier slot urgence');
  }

  // Normaliser sur 100
  total = Math.round((total / 80) * 100);

  return { total, raisons, risques };
}

/**
 * Trouve les jours les moins charges de la semaine
 */
function _trouverJoursLegers(weekAppointments, practitionerProfile) {
  const jours = Object.entries(weekAppointments)
    .map(([date, rdvs]) => ({ date, nb: rdvs.length }))
    .filter(j => j.nb < SEUILS.patients_jour_max - 3)
    .sort((a, b) => a.nb - b.nb);

  return jours.map(j => j.date);
}

/**
 * Determine la raison d'un deplacement
 */
function _raisonDeplacement(rdv, journee) {
  if (journee.length > SEUILS.patients_jour_max) {
    return 'Journee tres chargee, votre rendez-vous sera plus confortable un autre jour';
  }
  if (_compterActesLourdsConsecutifs(journee) > SEUILS.actes_lourds_consecutifs_max) {
    return 'Meilleure disponibilite du praticien un autre jour';
  }
  return 'Optimisation du planning pour un meilleur confort';
}

// --- Messages patients ---

function _messageReschedule(civilite, prenom, nom, context) {
  const jours = context.jours_proposes || [];
  const joursTexte = jours.slice(0, 2).join(' ou le ');
  return `${civilite} ${nom},

Nous nous permettons de vous contacter concernant votre prochain rendez-vous au cabinet.

Afin de vous offrir les meilleures conditions de prise en charge, nous souhaiterions vous proposer un nouveau creneau : ${joursTexte ? 'le ' + joursTexte : 'a une date qui vous conviendrait'}.

Pourriez-vous nous confirmer votre disponibilite par retour ou en nous appelant au cabinet ?

Nous vous remercions de votre comprehension.

Cordialement,
Cabinet dentaire JADOMI
contact@jadomi.fr`;
}

function _messagePonctualite(civilite, prenom, nom, context) {
  return `${civilite} ${nom},

Nous vous rappelons votre rendez-vous prevu au cabinet. Afin de garantir le bon deroulement de votre seance et de celle des patients suivants, nous vous remercions de bien vouloir vous presenter 5 minutes avant l'heure convenue.

En cas d'empechement, merci de nous prevenir le plus tot possible afin que nous puissions proposer ce creneau a un autre patient.

A bientot au cabinet.

Cordialement,
Cabinet dentaire JADOMI
contact@jadomi.fr`;
}

function _messageConfirmationRenforcee(civilite, prenom, nom, context) {
  return `${civilite} ${nom},

Nous vous confirmons votre rendez-vous au cabinet. Pourriez-vous nous confirmer votre presence par retour de message ou en nous appelant ?

En l'absence de confirmation 24h avant, nous nous permettrons de vous recontacter.

Merci et a bientot.

Cordialement,
Cabinet dentaire JADOMI
contact@jadomi.fr`;
}

function _messageNouveauCreneau(civilite, prenom, nom, context) {
  return `${civilite} ${nom},

Un creneau vient de se liberer au cabinet et nous avons pense a vous. Souhaitez-vous en beneficier ?

Merci de nous contacter rapidement si cela vous interesse.

Cordialement,
Cabinet dentaire JADOMI
contact@jadomi.fr`;
}

function _messageAbsenceRepetee(civilite, prenom, nom, context) {
  return `${civilite} ${nom},

Nous avons constate que vos derniers rendez-vous n'ont pas pu avoir lieu. Nous comprenons que des imprevu peuvent survenir.

Afin de mieux organiser votre suivi, nous vous invitons a nous contacter pour convenir ensemble d'un creneau qui corresponde a vos disponibilites.

Notre equipe reste a votre disposition.

Cordialement,
Cabinet dentaire JADOMI
contact@jadomi.fr`;
}

// --- Commande vocale ---

/**
 * Detecte l'intention dans un texte
 */
function _detecterIntent(texte) {
  for (const [intent, mots] of Object.entries(INTENTS_VOCAUX)) {
    for (const mot of mots) {
      if (texte.includes(mot)) return intent;
    }
  }
  return 'inconnu';
}

/**
 * Extrait les entites d'un texte (durees, jours, patients, etc.)
 */
function _extraireEntites(texte) {
  const entities = {};

  // Duree
  const dureeMatch = texte.match(/(\d+)\s*min/);
  if (dureeMatch) entities.duree = parseInt(dureeMatch[1]);

  // Nombre de RDV
  const nbMatch = texte.match(/(\d+)\s*(?:rdv|rendez)/i);
  if (nbMatch) entities.nombre_rdv = parseInt(nbMatch[1]);

  // Patient
  const patientMatch = texte.match(/(?:mme|monsieur|m\.|madame)\s+([a-zA-ZÀ-ÿ]+)/i);
  if (patientMatch) entities.patient_nom = patientMatch[1];

  // Jours de la semaine
  const jours = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const joursFound = jours.filter(j => texte.includes(j));
  if (joursFound.length > 0) entities.jours = joursFound;

  // Moment de la journee
  if (texte.includes('matin')) entities.moment = 'matin';
  else if (texte.includes('apres-midi') || texte.includes('aprem')) entities.moment = 'apres-midi';

  // Qualificatifs patient
  if (texte.includes('anxieux') || texte.includes('anxieuse')) entities.patient_anxieux = true;
  if (texte.includes('calme')) entities.ambiance = 'calme';

  // Semaine
  if (texte.includes('semaine prochaine')) entities.periode = 'semaine_prochaine';
  else if (texte.includes('cette semaine')) entities.periode = 'cette_semaine';

  return entities;
}

/**
 * Genere les actions proposees a partir de l'intent et des entites
 */
function _genererActions(intent, entities, currentState) {
  const actions = [];

  switch (intent) {
    case 'placer_rdv':
      actions.push({
        action: 'findBestSlots',
        params: {
          patient: entities.patient_nom,
          duree: entities.duree || 30,
          jours_preferes: entities.jours || [],
          moment: entities.moment || null,
          nombre: entities.nombre_rdv || 1
        }
      });
      break;

    case 'trouver_creneau':
      actions.push({
        action: 'findBestSlots',
        params: {
          patient: entities.patient_nom,
          anxieux: entities.patient_anxieux || false,
          ambiance: entities.ambiance || 'normal',
          moment: entities.moment || null
        }
      });
      break;

    case 'alleger_jour':
      actions.push({
        action: 'suggestReschedules',
        params: {
          date: entities.jours ? entities.jours[0] : currentState?.date_affichee
        }
      });
      break;

    case 'analyser':
      actions.push({
        action: 'analyzeDay',
        params: {
          periode: entities.periode || 'semaine_prochaine'
        }
      });
      break;

    case 'deplacer':
      actions.push({
        action: 'suggestReschedules',
        params: {
          patient: entities.patient_nom,
          jours_cibles: entities.jours || []
        }
      });
      break;

    default:
      actions.push({
        action: 'clarification_needed',
        params: { texte_original: entities }
      });
  }

  return actions;
}

/**
 * Formule une explication de l'action detectee
 */
function _expliquerAction(intent, entities) {
  switch (intent) {
    case 'placer_rdv':
      return `Je vais chercher les meilleurs creneaux${entities.patient_nom ? ` pour ${entities.patient_nom}` : ''}${entities.duree ? ` (${entities.duree}min)` : ''}${entities.jours ? ` les ${entities.jours.join(', ')}` : ''}${entities.moment ? ` le ${entities.moment}` : ''}.`;

    case 'trouver_creneau':
      return `Je recherche un creneau${entities.patient_anxieux ? ' calme pour un patient anxieux' : ''}${entities.moment ? ` le ${entities.moment}` : ''}.`;

    case 'alleger_jour':
      return `Je vais identifier les rendez-vous deplacables pour alleger${entities.jours ? ` ${entities.jours[0]}` : ' la journee'}.`;

    case 'analyser':
      return `Je lance l'analyse${entities.periode === 'semaine_prochaine' ? ' de la semaine prochaine' : ' de la periode'}.`;

    case 'deplacer':
      return `Je cherche un nouveau creneau${entities.patient_nom ? ` pour ${entities.patient_nom}` : ''}.`;

    default:
      return 'Je n\'ai pas bien compris la demande. Pouvez-vous reformuler ?';
  }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Fonctions principales
  analyzeDay,
  findBestSlots,
  suggestReschedules,
  detectRedDays,
  calculateSerenityScore,
  generateBreakRecommendations,
  optimizeDay,
  generatePatientMessage,
  processVoiceCommand,

  // Constantes (exportees pour personnalisation)
  POIDS_SCORE,
  SEUILS,
  TYPES_ACTES,
  INTENTS_VOCAUX,

  // Utilitaires (exportes pour tests)
  heureEnMinutes,
  minutesEnHeure,
  estActeLourd
};
