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
   * RDV annulé → chercher remplacement → notifier patient
   */
  rdv_cancelled: [
    { agent: 'agenda', handler: _stepHandleCancelledRdv },
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

  // Branche facture → extraction
  if (classification?.has_invoice || category === 'facture') {
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

  // Par défaut → brouillon de réponse suggéré
  if (['comptable', 'fournisseur', 'labo', 'patient', 'banque'].includes(category)) {
    const draft = await draftReply(mail, null, options.cabinetContext);
    return {
      action: 'draft_suggested',
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

  // Chercher un créneau de remplacement via l'IA locale
  const suggestion = LOCAL_RULES.classifyIntent(
    `annulation rendez-vous ${rdv.patient_name || ''} ${rdv.date || ''}`
  );

  return {
    rdvCancelled: rdv,
    suggestion,
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

// =============================================
// EXPORTS
// =============================================

module.exports = {
  dispatch,
  WORKFLOWS,
};
