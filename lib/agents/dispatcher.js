// =============================================
// JADOMI — Agent Dispatcher (Chef d'orchestre)
// Reçoit un trigger et enchaîne les bons agents
//
// Workflows prédéfinis :
// 1. mail_received → classifieur → (annulation) → agenda → rédacteur
// 2. mail_received → classifieur → (facture) → extracteur → indexation
// 3. rdv_cancelled → agenda → rédacteur
// 4. stock_alert → stock → notification copilot
// 5. patient_request → patient → réponse copilot
// 6. user_command → parse intent → route agent
//
// Cascade IA : JAMAIS Claude en premier
// Local → Mistral → Claude
// =============================================

const { randomUUID } = require('crypto');
const { bus, EVENT_TYPES } = require('../shared-intelligence');
const memory = require('./memory');
const learning = require('./learning');

// Import des agents existants (brain/agents.js)
const { classifyMailIA, draftReply, extractInvoiceData, composeMail } = require('../brain/agents');
// Import du routeur IA (pour les tâches génériques)
const { route: iaRoute, LOCAL_RULES } = require('../ia-router');

// =============================================
// PRÉFÉRENCES FOURMILIÈRE PAR CABINET
// Le dentiste choisit le mode de chaque comportement :
//   'auto'    → la fourmilière agit, le dentiste est notifié après
//   'propose' → la fourmilière prépare, le dentiste valide avant action
//   'off'     → la fourmilière ne fait rien pour ce comportement
//
// Valeurs par défaut : tout en 'propose' (safe)
// =============================================

const DEFAULT_FOURMILIERE_PREFS = {
  annulation_detection: 'auto',     // Détecter les annulations dans les mails
  annulation_action: 'propose',     // Proposer l'annulation du RDV au dentiste
  recasage: 'propose',              // Chercher un candidat pour le créneau libéré
  tri_factures: 'auto',             // Trier/extraire les factures PDF
  brouillon_reponse: 'propose',     // Préparer un brouillon de réponse mail
  alerte_stock: 'auto',             // Notifier quand stock bas
  commande_stock: 'off',            // Passer commande auto (désactivé par défaut)
  resume_pre_consultation: 'auto',  // Résumé patient avant chaque RDV
  suivi_patients_perdus: 'propose', // Alerter sur patients sans RDV futur
  optimisation_planning: 'propose', // Suggestions d'optimisation de journée
};

/**
 * Charge les préférences fourmilière d'un cabinet
 * Fusionne avec les valeurs par défaut (safe)
 */
async function loadFourmilierePrefs(supabase, societeId) {
  try {
    const { data } = await supabase
      .from('cabinet_brain')
      .select('preferences')
      .eq('societe_id', societeId)
      .single();

    const prefs = (data && data.preferences && data.preferences.fourmiliere) || {};
    return { ...DEFAULT_FOURMILIERE_PREFS, ...prefs };
  } catch (_e) {
    return { ...DEFAULT_FOURMILIERE_PREFS };
  }
}

/**
 * Vérifie si un comportement est autorisé (auto ou propose)
 * Retourne { allowed, mode } — le handler décide quoi faire selon le mode
 */
function checkBehavior(prefs, behaviorKey) {
  const mode = prefs[behaviorKey] || 'propose';
  return { allowed: mode !== 'off', mode };
}

// =============================================
// DÉFINITION DES WORKFLOWS
// =============================================

const WORKFLOWS = {
  /**
   * Mail reçu → classifieur → branchement selon catégorie
   */
  mail_received: [
    { agent: 'classifieur', handler: _stepClassifyMail },
    { agent: 'router', handler: _stepRouteAfterClassification },
  ],

  /**
   * RDV annulé → chercher remplacement → recaser si autorisé → notifier patient
   */
  rdv_cancelled: [
    { agent: 'agenda', handler: _stepHandleCancelledRdv },
    { agent: 'recaseur', handler: _stepRecaserCreneau },
    { agent: 'redacteur', handler: _stepDraftCancellationReply },
  ],

  /**
   * Alerte stock → vérifier alternatives → notifier copilot
   */
  stock_alert: [
    { agent: 'stock', handler: _stepCheckStockAlternatives },
    { agent: 'notification', handler: _stepNotifyCopilot },
  ],

  /**
   * Demande patient → historique → réponse enrichie copilot
   */
  patient_request: [
    { agent: 'patient', handler: _stepGetPatientHistory },
    { agent: 'copilot', handler: _stepEnrichCopilotResponse },
  ],

  /**
   * Commande utilisateur libre → parse → route
   */
  user_command: [
    { agent: 'intent_parser', handler: _stepParseUserIntent },
    { agent: 'router', handler: _stepRouteUserCommand },
  ],
};

// =============================================
// DISPATCH PRINCIPAL
// =============================================

/**
 * Point d'entrée : lance un workflow complet
 *
 * @param {object} supabase - client Supabase
 * @param {string} societeId - UUID du cabinet
 * @param {object} trigger - déclencheur
 * @param {string} trigger.type - 'mail_received'|'rdv_cancelled'|'stock_alert'|'patient_request'|'user_command'
 * @param {object} trigger.data - données du trigger (mail, rdv, produit, etc.)
 * @param {object} [trigger.cabinetContext] - contexte cabinet (identité, contacts, préférences)
 * @returns {object} { workflowId, steps, finalOutput, error }
 */
async function dispatch(supabase, societeId, trigger) {
  const workflowId = randomUUID();
  const startTime = Date.now();

  // Charger les préférences fourmilière du cabinet
  const fourmilierePrefs = await loadFourmilierePrefs(supabase, societeId);
  // Injecter dans le trigger pour que chaque step puisse vérifier
  trigger._prefs = fourmilierePrefs;

  const result = {
    workflowId,
    triggerType: trigger.type,
    steps: [],
    finalOutput: null,
    error: null,
  };

  console.log(`[DISPATCHER] Workflow ${workflowId} démarré : ${trigger.type}`);

  // Récupérer la définition du workflow
  const workflowDef = WORKFLOWS[trigger.type];
  if (!workflowDef) {
    result.error = `Type de trigger inconnu : ${trigger.type}`;
    console.error(`[DISPATCHER] ${result.error}`);
    return result;
  }

  // Contexte partagé entre les steps (chaque step peut enrichir)
  let currentData = { ...trigger.data };
  const cabinetContext = trigger.cabinetContext || {};

  // Exécuter les steps séquentiellement
  for (let i = 0; i < workflowDef.length; i++) {
    const stepDef = workflowDef[i];
    const stepStart = Date.now();

    // 1. Charger le contexte mémoire pour cet agent
    //    SÉCURITÉ : le trustLevel dépend du modèle IA utilisé par l'agent
    //    - 'full' pour Claude ET Mistral (Anthropic US conforme RGPD, Mistral AI Paris conforme RGPD)
    //    - 'none' pour DeepSeek (serveurs chinois, JAMAIS de données cabinet/patient)
    const trustLevel = stepDef.trustLevel || _getAgentTrustLevel(stepDef.agent);
    let agentContext = '';
    try {
      agentContext = await memory.buildAgentContext(supabase, societeId, stepDef.agent, trustLevel);
    } catch (e) {
      console.warn(`[DISPATCHER] buildAgentContext failed for ${stepDef.agent}:`, e.message);
    }

    // 2. Marquer le step comme "running"
    await memory.saveWorkflowStep(supabase, {
      societeId,
      workflowId,
      agentName: stepDef.agent,
      stepOrder: i,
      input: currentData,
      status: 'running',
    });

    // 3. Exécuter le handler de l'agent
    let stepOutput = null;
    let stepError = null;
    let stepStatus = 'completed';

    try {
      stepOutput = await stepDef.handler(supabase, societeId, currentData, {
        agentContext,
        cabinetContext,
        workflowId,
        stepOrder: i,
      });
    } catch (e) {
      stepError = e.message;
      stepStatus = 'failed';
      console.error(`[DISPATCHER] Step ${i} (${stepDef.agent}) failed:`, e.message);
    }

    const durationMs = Date.now() - stepStart;

    // 4. Sauvegarder le résultat du step
    const savedStep = await memory.saveWorkflowStep(supabase, {
      societeId,
      workflowId,
      agentName: stepDef.agent,
      stepOrder: i,
      input: currentData,
      output: stepOutput || {},
      status: stepStatus,
      error: stepError,
      durationMs,
    });

    result.steps.push({
      agent: stepDef.agent,
      status: stepStatus,
      durationMs,
      output: stepOutput,
      error: stepError,
    });

    // 5. Si erreur → log, skip vers le step suivant si possible
    if (stepStatus === 'failed') {
      console.warn(`[DISPATCHER] Step ${stepDef.agent} échoué, tentative de continuer...`);
      // On ne casse pas la chaîne, le step suivant recevra currentData sans enrichissement
      continue;
    }

    // 6. Passer l'output au step suivant
    if (stepOutput) {
      currentData = { ...currentData, ...stepOutput, _previousAgent: stepDef.agent };
    }

    // Si le step demande un arrêt (workflow terminé plus tôt)
    if (stepOutput && stepOutput._stopWorkflow) {
      console.log(`[DISPATCHER] Workflow arrêté par ${stepDef.agent} (step ${i})`);
      break;
    }
  }

  result.finalOutput = currentData;
  const totalDuration = Date.now() - startTime;
  console.log(`[DISPATCHER] Workflow ${workflowId} terminé en ${totalDuration}ms (${result.steps.length} steps)`);

  // Émettre un événement de fin de workflow
  bus.emit('workflow_completed', {
    workflowId,
    societeId,
    triggerType: trigger.type,
    steps: result.steps.length,
    durationMs: totalDuration,
    success: !result.error,
  });

  return result;
}

// =============================================
// HANDLERS DES STEPS
// =============================================

/**
 * Step : Classifier un mail entrant
 */
async function _stepClassifyMail(supabase, societeId, data) {
  const mail = data.mail || data;
  const classification = await classifyMailIA(mail);
  return {
    classification,
    mail,
  };
}

/**
 * Step : Router après classification du mail
 * Branche vers extracteur (si facture) ou rédacteur (si réponse nécessaire)
 */
async function _stepRouteAfterClassification(supabase, societeId, data, options) {
  const { classification, mail } = data;
  const category = classification?.category || 'autre';
  const prefs = data._prefs || options.cabinetContext?._prefs || {};

  // Branche facture → extraction (vérifie pref tri_factures)
  if (classification?.has_invoice || category === 'facture') {
    const { allowed } = checkBehavior(prefs, 'tri_factures');
    if (!allowed) {
      return { action: 'invoice_detected_but_disabled', classification };
    }
    console.log('[DISPATCHER] Route: facture détectée → extracteur');
    const invoiceData = await extractInvoiceData(
      mail.text || mail.body_preview || '',
      mail.attachmentContent || null
    );
    return {
      action: 'invoice_extracted',
      invoiceData,
      classification,
    };
  }

  // Branche patient annulation → signaler pour workflow rdv_cancelled
  if (category === 'patient' && _detectAnnulation(mail)) {
    const { allowed } = checkBehavior(prefs, 'annulation_detection');
    if (!allowed) {
      return { action: 'cancellation_detected_but_disabled', classification };
    }
    console.log('[DISPATCHER] Route: annulation patient détectée');
    return {
      action: 'cancellation_detected',
      classification,
      needsFollowUp: true,
    };
  }

  // Branche urgent → notification prioritaire
  if (classification?.priority === 'urgent') {
    console.log('[DISPATCHER] Route: mail urgent détecté');
    return {
      action: 'urgent_notification',
      classification,
      needsImmediate: true,
    };
  }

  // Par défaut → brouillon de réponse suggéré (vérifie pref brouillon_reponse)
  if (['comptable', 'fournisseur', 'labo', 'patient', 'banque'].includes(category)) {
    const { allowed, mode } = checkBehavior(prefs, 'brouillon_reponse');
    if (!allowed) {
      return { action: 'classified_only', classification };
    }
    const draft = await draftReply(mail, null, options.cabinetContext);
    return {
      action: 'draft_suggested',
      mode,
      classification,
      suggestedReply: draft,
    };
  }

  return {
    action: 'classified_only',
    classification,
  };
}

/**
 * Step : Gérer un RDV annulé
 */
async function _stepHandleCancelledRdv(supabase, societeId, data) {
  // Récupérer les infos du RDV annulé
  const rdv = data.rdv || data;
  const date = rdv.date || rdv.date_heure ? (rdv.date_heure || rdv.date || '').substring(0, 10) : null;

  // Chercher un créneau de remplacement via l'agent-agenda (plus puissant que classifyIntent)
  let replacement = { slots: [], nearby_available: [] };
  try {
    const agendaAgent = require('./agent-agenda');
    if (date) {
      replacement = await agendaAgent.findReplacement(supabase, societeId, { date, duration: rdv.duree || 30 });
    }
  } catch (e) {
    console.warn('[DISPATCHER] agent-agenda findReplacement error:', e.message);
  }

  return {
    rdvCancelled: rdv,
    replacement,
    needsReplacement: true,
    patientName: rdv.patient_name,
    patientEmail: rdv.patient_email,
    patientTel: rdv.patient_tel,
  };
}

/**
 * Step : Rédiger le mail d'annulation/report
 */
async function _stepDraftCancellationReply(supabase, societeId, data, options) {
  const patientName = data.patientName || 'Patient';
  const rdv = data.rdvCancelled || {};

  // Générer un message patient via le routeur IA (cascade Local → Mistral → Claude)
  const { result: message } = await iaRoute('generate-message', {
    type: 'annulation',
    patient: patientName,
    details: `RDV du ${rdv.date || 'date inconnue'} annulé. Proposer un nouveau créneau.`,
  });

  return {
    action: 'cancellation_reply_drafted',
    message,
    patientName,
    patientEmail: data.patientEmail,
  };
}

/**
 * Step : Recaser le créneau libéré
 * BRANCHE SUR LE SYSTÈME EXISTANT dentiste-pro/waitlist
 * → Utilise dentiste_pro_waitlist (scoring 0-100) + dentiste_pro_urgence_slots
 * → Push + SMS aux top 5 patients → claim first-come-first-served
 * Respecte les préférences du dentiste : auto/propose/off
 */
async function _stepRecaserCreneau(supabase, societeId, data, options) {
  const prefs = options.cabinetContext?._prefs || data._prefs || {};
  const { allowed, mode } = checkBehavior(prefs, 'recasage');

  if (!allowed) {
    return { action: 'recasage_skipped', reason: 'Recasage désactivé par le praticien' };
  }

  const rdv = data.rdvCancelled || {};
  const date = rdv.date_heure ? rdv.date_heure.substring(0, 10) : rdv.date || null;
  const startTime = rdv.date_heure ? rdv.date_heure.substring(11, 16) : null;
  const duree = rdv.duree || 30;

  if (!date || !startTime) {
    return { action: 'recasage_no_date', reason: 'Date ou heure du RDV annulé inconnue' };
  }

  // Calculer l'heure de fin
  const startMinutes = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);
  const endMinutes = startMinutes + duree;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

  try {
    // Chercher le cabinet_id correspondant au societe_id
    const { data: cabinet } = await supabase
      .from('dentiste_pro_cabinets')
      .select('id')
      .eq('societe_id', societeId)
      .maybeSingle();

    const cabinetId = cabinet?.id;
    if (!cabinetId) {
      // Pas de cabinet dentiste-pro → fallback agent-agenda simple
      const agendaAgent = require('./agent-agenda');
      const result = await agendaAgent.findBestCandidateForSlot(supabase, societeId, {
        slotDate: date, slotStart: startTime, slotDurationMin: duree,
      });
      return {
        action: 'recasage_proposed_fallback',
        mode,
        best_candidate: result.best_candidate,
        candidates_count: result.candidates_count,
        message: result.message,
        requires_validation: true,
      };
    }

    // MODE PROPOSE : on prépare le recasage, le dentiste valide avant d'envoyer les notifs
    if (mode === 'propose') {
      // Vérifier s'il y a des patients en waitlist
      const { data: waitlist } = await supabase
        .from('dentiste_pro_waitlist')
        .select('*, patient:dentiste_pro_patients(id, nom, prenom, telephone)')
        .eq('cabinet_id', cabinetId)
        .eq('status', 'waiting');

      const count = (waitlist || []).length;

      return {
        action: 'recasage_pending_validation',
        mode: 'propose',
        slot: { date, start_time: startTime, end_time: endTime, duration: duree },
        waitlist_count: count,
        original_rdv_id: rdv.id || null,
        message: count > 0
          ? `Créneau libéré le ${date} à ${startTime} (${duree} min). ${count} patient(s) en liste d'attente. Lancer le recasage ?`
          : `Créneau libéré le ${date} à ${startTime} (${duree} min). Aucun patient en attente.`,
        requires_validation: true,
        // Le copilot affichera un bouton "Lancer le recasage" qui appellera
        // POST /api/dentiste-pro/waitlist/cancellation-detected
        trigger_endpoint: '/api/dentiste-pro/waitlist/cancellation-detected',
        trigger_body: { appointment_id: rdv.id, date, start_time: startTime, end_time: endTime },
      };
    }

    // MODE AUTO : déclencher directement le système existant
    // Créer l'urgence slot + notifier les top 5 patients
    const BASE_URL = process.env.BASE_URL || 'https://jadomi.fr';
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const { data: slot, error: slotErr } = await supabase
      .from('dentiste_pro_urgence_slots')
      .insert({
        cabinet_id: cabinetId,
        original_appointment_id: rdv.id || null,
        date, start_time: startTime, end_time: endTime,
        status: 'open', expires_at: expiresAt,
        notified_patient_ids: [],
      })
      .select().single();

    if (slotErr) throw slotErr;

    // Scorer les patients de la waitlist (même algo que waitlist.js)
    const { data: waitlist } = await supabase
      .from('dentiste_pro_waitlist')
      .select('*, patient:dentiste_pro_patients(id, nom, prenom, telephone, email, push_subscription)')
      .eq('cabinet_id', cabinetId)
      .eq('status', 'waiting');

    if (!waitlist || waitlist.length === 0) {
      return {
        action: 'recasage_auto_no_waitlist',
        slot: { date, start_time: startTime, duration: duree },
        urgence_slot_id: slot.id,
        message: `Créneau urgence créé (expire dans 30 min). Aucun patient en liste d'attente.`,
      };
    }

    // Scoring identique à dentiste-pro/waitlist.js
    const slotInfo = { start_time: startTime, end_time: endTime, date };
    const scored = waitlist.map(entry => ({
      ...entry,
      computed_score: _scoreFourmiliere(entry, slotInfo),
    }));
    scored.sort((a, b) => b.computed_score - a.computed_score);
    const top5 = scored.slice(0, 5);

    // Notifier (push + émettre événement pour le copilot)
    const notifiedNames = [];
    for (const entry of top5) {
      const patient = entry.patient;
      if (!patient) continue;
      notifiedNames.push(`${patient.prenom || ''} ${patient.nom || ''}`.trim());
    }

    // Mettre à jour le slot avec les IDs notifiés
    const notifiedIds = top5.map(e => e.patient?.id).filter(Boolean);
    await supabase
      .from('dentiste_pro_urgence_slots')
      .update({ notified_patient_ids: notifiedIds })
      .eq('id', slot.id);

    // Émettre l'événement pour que le système de notifications (push+SMS) se déclenche
    bus.emit('copilot_notification', {
      societeId,
      type: 'recasage',
      title: 'Recasage automatique lancé',
      message: `${notifiedNames.length} patient(s) notifié(s) pour le créneau du ${date} à ${startTime}. Premier arrivé, premier servi (30 min).`,
      data: { slot_id: slot.id, notified: notifiedNames },
    });

    return {
      action: 'recasage_auto_launched',
      mode: 'auto',
      urgence_slot_id: slot.id,
      notified_count: notifiedNames.length,
      notified_patients: notifiedNames,
      expires_at: expiresAt,
      message: `Recasage lancé : ${notifiedNames.join(', ')} notifié(s). Créneau ${startTime}-${endTime} bloqué 30 min.`,
    };
  } catch (e) {
    console.warn('[DISPATCHER] _stepRecaserCreneau error:', e.message);
    return { action: 'recasage_error', error: e.message };
  }
}

/**
 * Scoring simplifié pour la fourmilière (même logique que waitlist.js)
 */
function _scoreFourmiliere(entry, slot) {
  let score = 0;
  score += ((entry.urgency_score || 5) / 10) * 40;
  const waitMs = Date.now() - new Date(entry.wait_since || entry.created_at).getTime();
  score += Math.min((waitMs / 86400000) * 1.5, 30);
  if (entry.preferred_time_start && slot.start_time) {
    if (slot.start_time >= (entry.preferred_time_start || '00:00') &&
        slot.start_time <= (entry.preferred_time_end || '23:59')) {
      score += 20;
    }
  } else {
    score += 10; // Pas de préférence = match partiel
  }
  score += Math.max(0, 10 - (entry.proximity_km || 10));
  return Math.round(score);
}

/**
 * Step : Vérifier alternatives stock
 */
async function _stepCheckStockAlternatives(supabase, societeId, data) {
  const produit = data.produit || data;

  // Classifier le produit via l'IA pour trouver des alternatives
  const { result: category } = await iaRoute('classify-product', produit.nom || produit.name || '');

  return {
    produit,
    category: (category || '').trim(),
    alertType: data.alertType || 'low_stock',
    needsAlternative: true,
  };
}

/**
 * Step : Notifier le copilot d'une alerte
 */
async function _stepNotifyCopilot(supabase, societeId, data) {
  // Émettre l'événement pour que le copilot le capte
  bus.emit('copilot_notification', {
    societeId,
    type: data.alertType || 'info',
    title: `Alerte stock : ${(data.produit || {}).nom || 'Produit inconnu'}`,
    message: `Catégorie : ${data.category || 'inconnue'}. Alternative nécessaire.`,
    data,
  });

  return {
    action: 'copilot_notified',
    notificationType: data.alertType,
  };
}

/**
 * Step : Récupérer l'historique patient
 */
async function _stepGetPatientHistory(supabase, societeId, data) {
  const patientId = data.patientId || data.patient_id;
  if (!patientId) {
    return { patientHistory: null, message: 'Pas de patient_id fourni' };
  }

  try {
    // Charger les derniers événements du patient
    const { data: events } = await supabase
      .from('cabinet_brain_events')
      .select('*')
      .eq('societe_id', societeId)
      .order('created_at', { ascending: false })
      .limit(20);

    // Charger les documents liés
    const { data: docs } = await supabase
      .from('cabinet_brain_documents')
      .select('id, title, doc_type, metadata, created_at')
      .eq('societe_id', societeId)
      .order('created_at', { ascending: false })
      .limit(10);

    return {
      patientId,
      recentEvents: events || [],
      recentDocs: docs || [],
    };
  } catch (e) {
    console.error('[DISPATCHER] _stepGetPatientHistory error:', e.message);
    return { patientId, recentEvents: [], recentDocs: [] };
  }
}

/**
 * Step : Enrichir la réponse copilot avec le contexte patient
 */
async function _stepEnrichCopilotResponse(supabase, societeId, data, options) {
  const context = options.agentContext || '';
  const history = data.recentEvents || [];
  const docs = data.recentDocs || [];

  // Résumé pour le copilot
  const summary = [];
  if (history.length > 0) {
    summary.push(`${history.length} événements récents`);
  }
  if (docs.length > 0) {
    summary.push(`${docs.length} documents récents`);
  }

  return {
    action: 'copilot_enriched',
    patientId: data.patientId,
    contextSummary: summary.join(', ') || 'Aucun historique trouvé',
    agentContext: context.substring(0, 500), // Limiter pour ne pas exploser le prompt
  };
}

/**
 * Step : Parser l'intention d'une commande utilisateur
 */
async function _stepParseUserIntent(supabase, societeId, data) {
  const command = data.command || data.text || '';
  const intent = LOCAL_RULES.classifyIntent(command);

  return {
    command,
    intent,
    originalData: data,
  };
}

/**
 * Step : Router une commande utilisateur vers le bon agent
 */
async function _stepRouteUserCommand(supabase, societeId, data, options) {
  const { intent, command, originalData } = data;

  switch (intent) {
    case 'scheduling':
      return {
        action: 'route_to_agenda',
        intent,
        command,
        _stopWorkflow: false,
      };

    case 'billing':
    case 'pricing':
      return {
        action: 'route_to_compta',
        intent,
        command,
      };

    case 'stock':
      return {
        action: 'route_to_stock',
        intent,
        command,
      };

    case 'urgency':
      return {
        action: 'route_to_urgence',
        intent,
        command,
        priority: 'urgent',
      };

    case 'document':
      return {
        action: 'route_to_documents',
        intent,
        command,
      };

    default: {
      // Commande libre → composer un mail ou réponse générique
      const composed = await composeMail(command, options.cabinetContext);
      return {
        action: 'composed_response',
        intent,
        composed,
      };
    }
  }
}

// =============================================
// HELPERS
// =============================================

/**
 * Détecte si un mail contient une annulation de RDV
 */
function _detectAnnulation(mail) {
  const text = ((mail.subject || '') + ' ' + (mail.text || '') + ' ' + (mail.body_preview || '')).toLowerCase();
  return /\b(annul|cancel|report|déplac|empêch|impossible|plus venir|ne (peux|pourrai) pas)\b/.test(text);
}

// =============================================
// SÉCURITÉ — NIVEAU DE CONFIANCE PAR AGENT
// =============================================

/**
 * Détermine le trustLevel d'un agent selon le modèle IA qu'il utilise
 *
 * RÈGLE :
 * - Claude (Anthropic) → 'full' (conforme RGPD, serveurs US/EU)
 * - Mistral (Mistral AI Paris) → 'full' (conforme RGPD, serveurs français)
 * - DeepSeek → 'none' (serveurs chinois, JAMAIS de données sensibles)
 *
 * Les agents intent_parser utilisent DeepSeek → trustLevel 'none'
 * Tous les autres agents utilisent Mistral ou Claude → trustLevel 'full'
 */
function _getAgentTrustLevel(agentName) {
  // Agents qui utilisent DeepSeek → ZÉRO contexte
  const DEEPSEEK_AGENTS = ['intent_parser'];

  if (DEEPSEEK_AGENTS.includes(agentName)) {
    return 'none';
  }

  // Tous les autres (classifieur, redacteur, extracteur, agenda, patient, stock, etc.)
  // utilisent Mistral ou Claude → contexte complet autorisé (RGPD OK)
  return 'full';
}

// =============================================
// ÉCOUTE BUS (réactions automatiques)
// =============================================

// Quand une préférence est apprise → recharger les règles des agents
bus.on(EVENT_TYPES.PREFERENCE_APPRISE, (data) => {
  console.log(`[DISPATCHER] Nouvelle règle globale détectée : ${data.ruleName}`);
  // Les agents la chargeront automatiquement au prochain appel loadRules()
});

// Quand un mail arrive (émis par mail-sync-daemon) → déclencher le workflow mail_received
// Conditions : uniquement les mails qui méritent une action (pas spam/newsletter)
bus.on('mail_received', async (data) => {
  try {
    // Ignorer les mails non-actionnables
    if (!data || !data.societeId) return;
    if (data.category === 'spam' || data.category === 'newsletter') return;
    if (!data.needsResponse && !data.hasInvoice && data.priority !== 'urgent') return;

    console.log(`[DISPATCHER] Auto-dispatch mail_received : ${data.subject || '(sans objet)'} [${data.category}]`);

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

    await dispatch(supabase, data.societeId, {
      type: 'mail_received',
      data: {
        mail: {
          from: data.from,
          subject: data.subject,
          category: data.category,
          priority: data.priority,
          mailUid: data.mailUid,
        },
      },
    });
  } catch (e) {
    console.warn(`[DISPATCHER] Auto-dispatch mail_received error:`, e.message);
  }
});

// =============================================
// EXPORTS
// =============================================

module.exports = {
  dispatch,
  WORKFLOWS,
  DEFAULT_FOURMILIERE_PREFS,
};
