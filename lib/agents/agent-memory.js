// =============================================
// JADOMI — Agent Memory System
// Mémoire persistante 3 couches pour la fourmilière
//
// Court terme : Prompt caching Anthropic (5 min TTL, -90% coût)
// Moyen terme : agent_sessions (30 jours, résumés interactions)
// Long terme : agent_learnings (permanent, patterns appris)
//
// Boucle d'apprentissage :
// 1. Agent lit ses learnings avant chaque tâche
// 2. Agent exécute la tâche
// 3. Si correction utilisateur → INSERT learning (confidence 0.5)
// 4. Si validation implicite → UPDATE confidence +0.1
// 5. Si confidence > 0.8 et times_validated > 3 → promouvoir en rule
// =============================================

const { createClient } = require('@supabase/supabase-js');

let _admin = null;
function admin() {
  if (!_admin) {
    _admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

// ================================================
// LECTURE — Charger les learnings d'un agent
// ================================================
async function loadLearnings(societeId, agentType, options = {}) {
  const minConfidence = options.minConfidence || 0.3;
  const limit = options.limit || 20;

  const { data, error } = await admin().from('agent_learnings')
    .select('id, learning_type, context, learning, confidence, times_applied, times_validated')
    .eq('societe_id', societeId)
    .eq('agent_type', agentType)
    .is('disabled_at', null)
    .gte('confidence', minConfidence)
    .order('confidence', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[agent-memory] Erreur loadLearnings:', error.message);
    return [];
  }

  return data || [];
}

// ================================================
// ÉCRITURE — Enregistrer un apprentissage
// ================================================
async function recordLearning(societeId, agentType, learning) {
  const { data, error } = await admin().from('agent_learnings')
    .insert({
      societe_id: societeId,
      agent_type: agentType,
      learning_type: learning.type || 'pattern',
      context: learning.context || null,
      learning: learning.text,
      confidence: learning.confidence || 0.5,
      source: learning.source || 'auto_detected'
    })
    .select()
    .single();

  if (error) {
    console.warn('[agent-memory] Erreur recordLearning:', error.message);
    return null;
  }

  return data;
}

// ================================================
// CORRECTION — L'utilisateur corrige l'agent
// ================================================
async function recordCorrection(societeId, agentType, correction) {
  return recordLearning(societeId, agentType, {
    type: 'correction',
    context: correction.context,
    text: correction.text,
    confidence: 0.7, // Les corrections utilisateur ont une haute confiance
    source: 'user_correction'
  });
}

// ================================================
// VALIDATION — L'utilisateur accepte (implicitement) le résultat
// ================================================
async function recordValidation(learningId) {
  const { data: current } = await admin().from('agent_learnings')
    .select('confidence, times_validated, times_applied')
    .eq('id', learningId)
    .single();

  if (!current) return;

  const newConfidence = Math.min(1, (current.confidence || 0.5) + 0.05);
  const newValidated = (current.times_validated || 0) + 1;
  const newApplied = (current.times_applied || 0) + 1;

  await admin().from('agent_learnings')
    .update({
      confidence: newConfidence,
      times_validated: newValidated,
      times_applied: newApplied,
      updated_at: new Date().toISOString()
    })
    .eq('id', learningId);

  // Auto-promotion en rule si assez validé
  if (newConfidence >= 0.8 && newValidated >= 3) {
    await promoteToRule(learningId);
  }
}

// ================================================
// REJET — L'utilisateur rejette la suggestion
// ================================================
async function recordRejection(learningId) {
  const { data: current } = await admin().from('agent_learnings')
    .select('confidence, times_rejected')
    .eq('id', learningId)
    .single();

  if (!current) return;

  const newConfidence = Math.max(0, (current.confidence || 0.5) - 0.15);
  const newRejected = (current.times_rejected || 0) + 1;

  const updates = {
    confidence: newConfidence,
    times_rejected: newRejected,
    updated_at: new Date().toISOString()
  };

  // Désactiver si trop rejeté ou confidence trop basse
  if (newConfidence < 0.1 || newRejected >= 5) {
    updates.disabled_at = new Date().toISOString();
  }

  await admin().from('agent_learnings')
    .update(updates)
    .eq('id', learningId);
}

// ================================================
// PROMOTION — Learning → Rule dans cabinet_brain_rules
// ================================================
async function promoteToRule(learningId) {
  const { data: learning } = await admin().from('agent_learnings')
    .select('*')
    .eq('id', learningId)
    .single();

  if (!learning || learning.promoted_to_rule) return;

  // Insérer dans cabinet_brain_rules
  await admin().from('cabinet_brain_rules').insert({
    societe_id: learning.societe_id,
    scope: learning.agent_type,
    rule_text: learning.learning,
    agent_source: 'auto_promoted',
    confidence: learning.confidence
  }).catch(() => {}); // Ignorer si doublon

  // Marquer comme promu
  await admin().from('agent_learnings')
    .update({
      promoted_to_rule: true,
      promoted_at: new Date().toISOString()
    })
    .eq('id', learningId);

  console.log('[agent-memory] Learning promu en rule:', learning.learning.substring(0, 60));
}

// ================================================
// SESSION — Enregistrer une session agent (moyen terme)
// ================================================
async function recordSession(societeId, agentType, session) {
  await admin().from('agent_sessions').insert({
    societe_id: societeId,
    agent_type: agentType,
    user_id: session.userId || null,
    summary: session.summary || null,
    decisions_made: session.decisions || [],
    tools_used: session.tools || [],
    tokens_used: session.tokensUsed || 0,
    duration_ms: session.durationMs || 0,
    success: session.success !== false
  }).catch(err => {
    console.warn('[agent-memory] Erreur recordSession:', err.message);
  });
}

// ================================================
// CONTEXTE — Construire le bloc mémoire pour le system prompt
// (Compatible avec Anthropic prompt caching)
// ================================================
async function buildMemoryContext(societeId, agentType) {
  const learnings = await loadLearnings(societeId, agentType, { minConfidence: 0.4, limit: 15 });

  if (!learnings.length) return '';

  let context = '\n\n--- MÉMOIRE AGENT (apprentissages validés) ---\n';
  context += 'Ces règles sont issues de tes interactions passées avec ce cabinet. Applique-les.\n\n';

  // Grouper par type
  const grouped = {};
  for (const l of learnings) {
    if (!grouped[l.learning_type]) grouped[l.learning_type] = [];
    grouped[l.learning_type].push(l);
  }

  const typeLabels = {
    preference: 'Préférences du cabinet',
    correction: 'Corrections à retenir',
    pattern: 'Patterns détectés',
    rule: 'Règles établies',
    shortcut: 'Raccourcis',
    error_to_avoid: 'Erreurs à éviter'
  };

  for (const [type, items] of Object.entries(grouped)) {
    context += `[${typeLabels[type] || type}]\n`;
    for (const item of items) {
      const conf = Math.round(item.confidence * 100);
      context += `- ${item.learning} (confiance: ${conf}%, validé ${item.times_validated}x)\n`;
    }
    context += '\n';
  }

  context += '--- FIN MÉMOIRE ---\n';
  return context;
}

// ================================================
// PROMPT CACHING — Construire le system prompt avec cache Anthropic
// ================================================
function buildCachedSystemPrompt(basePrompt, memoryContext, brainRules) {
  // Le bloc caché est le contexte stable (brain + memory)
  // Le bloc non-caché est le prompt variable
  return [
    {
      type: 'text',
      text: basePrompt,
      cache_control: { type: 'ephemeral' } // Caché 5 min
    },
    {
      type: 'text',
      text: (brainRules || '') + (memoryContext || '')
    }
  ];
}

// ================================================
// STATS — Statistiques d'apprentissage d'un agent
// ================================================
async function getAgentStats(societeId, agentType) {
  const { data: learnings } = await admin().from('agent_learnings')
    .select('learning_type, confidence, times_applied, times_validated, times_rejected, promoted_to_rule, disabled_at')
    .eq('societe_id', societeId)
    .eq('agent_type', agentType);

  const all = learnings || [];
  const active = all.filter(l => !l.disabled_at);
  const promoted = all.filter(l => l.promoted_to_rule);
  const disabled = all.filter(l => l.disabled_at);

  const avgConfidence = active.length
    ? Math.round(active.reduce((s, l) => s + l.confidence, 0) / active.length * 100) / 100
    : 0;

  return {
    total: all.length,
    active: active.length,
    promoted: promoted.length,
    disabled: disabled.length,
    avg_confidence: avgConfidence,
    by_type: active.reduce((acc, l) => {
      acc[l.learning_type] = (acc[l.learning_type] || 0) + 1;
      return acc;
    }, {}),
    total_applications: active.reduce((s, l) => s + (l.times_applied || 0), 0)
  };
}

module.exports = {
  loadLearnings,
  recordLearning,
  recordCorrection,
  recordValidation,
  recordRejection,
  promoteToRule,
  recordSession,
  buildMemoryContext,
  buildCachedSystemPrompt,
  getAgentStats
};
