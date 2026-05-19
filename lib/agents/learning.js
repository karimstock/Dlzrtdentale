// =============================================
// JADOMI — Agents Learning Engine
// Transforme les corrections utilisateur en règles
//
// Boucle de feedback :
// 1. L'agent fait une action
// 2. L'utilisateur corrige (ou valide)
// 3. Le learning engine enregistre la correction
// 4. Il génère/met à jour une règle
// 5. La prochaine fois, l'agent utilise la règle
//
// Propagation :
// - Règle locale (cabinet) → quand confidence >= 95% → globale
// - Règle globale → émise sur le bus shared-intelligence
// - Tous les agents la chargent au prochain appel loadRules()
// =============================================

const { bus, EVENT_TYPES } = require('../shared-intelligence');

/**
 * Enregistre une correction utilisateur et génère/met à jour une règle
 *
 * @param {object} supabase - client Supabase
 * @param {string} societeId - UUID du cabinet
 * @param {object} correction
 * @param {string} correction.agentName - quel agent s'est trompé
 * @param {object} correction.original - ce que l'agent avait proposé
 * @param {object} correction.corrected - ce que l'utilisateur a corrigé
 * @param {object} correction.context - contexte additionnel (mail_id, document_id, etc.)
 * @param {string} [correction.category] - catégorie de la règle ('mail', 'compta', etc.)
 * @returns {object} { event, rule } - l'événement et la règle créés/mis à jour
 */
async function recordCorrection(supabase, societeId, correction) {
  const { agentName, original, corrected, context, category } = correction;
  const result = { event: null, rule: null };

  try {
    // 1. Enregistrer l'événement de correction
    const eventData = {
      societe_id: societeId,
      event_type: 'rule_corrected',
      context: {
        agent: agentName,
        original: original || {},
        corrected: corrected || {},
        ...(context || {}),
      },
      user_correction: JSON.stringify(corrected),
    };

    const { data: event, error: eventErr } = await supabase
      .from('cabinet_brain_events')
      .insert(eventData)
      .select()
      .single();

    if (eventErr) {
      console.error('[AGENTS:LEARNING] recordCorrection event error:', eventErr.message);
    } else {
      result.event = event;
    }

    // 2. Chercher si une règle similaire existe déjà pour cet agent + cette correction
    const ruleSignature = _buildRuleSignature(agentName, original, corrected);
    const { data: existingRules } = await supabase
      .from('cabinet_brain_rules')
      .select('*')
      .eq('societe_id', societeId)
      .eq('agent_source', agentName)
      .is('disabled_at', null);

    const existingRule = (existingRules || []).find(r => {
      const conditions = r.conditions || {};
      return conditions.signature === ruleSignature;
    });

    if (existingRule) {
      // 3a. Règle existante → augmenter la confidence
      const newConfidence = Math.min((existingRule.confidence || 0.5) + 0.1, 1.0);
      const { data: updated, error: updateErr } = await supabase
        .from('cabinet_brain_rules')
        .update({
          confidence: newConfidence,
          times_applied: (existingRule.times_applied || 0) + 1,
          last_applied_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingRule.id)
        .select()
        .single();

      if (updateErr) {
        console.error('[AGENTS:LEARNING] update rule error:', updateErr.message);
      } else {
        result.rule = updated;
        // Vérifier si la règle doit passer en global
        if (newConfidence >= 0.95 && existingRule.scope !== 'global') {
          await propagateRule(supabase, updated);
        }
      }
    } else {
      // 3b. Nouvelle règle → créer
      const ruleName = _generateRuleName(agentName, original, corrected);
      const ruleText = _generateRuleText(agentName, original, corrected);

      const newRule = {
        societe_id: societeId,
        category: category || _guessCategory(agentName),
        rule_name: ruleName,
        rule_text: ruleText,
        conditions: {
          signature: ruleSignature,
          trigger: `${agentName}_output`,
          match: { original_pattern: original },
        },
        actions: [{
          action: 'correct_output',
          params: { corrected },
        }],
        confidence: 0.5,  // Confiance initiale : 50%
        source: 'learned',
        scope: 'local',
        agent_source: agentName,
        times_applied: 1,
        last_applied_at: new Date().toISOString(),
        active: true,
      };

      const { data: created, error: createErr } = await supabase
        .from('cabinet_brain_rules')
        .insert(newRule)
        .select()
        .single();

      if (createErr) {
        console.error('[AGENTS:LEARNING] create rule error:', createErr.message);
      } else {
        result.rule = created;
      }
    }
  } catch (e) {
    console.error('[AGENTS:LEARNING] recordCorrection exception:', e.message);
  }

  return result;
}

/**
 * Applique un feedback sur une règle (l'action de la règle était-elle correcte ?)
 *
 * @param {object} supabase - client Supabase
 * @param {string} ruleId - UUID de la règle
 * @param {boolean} wasCorrect - true si l'action était correcte, false sinon
 * @returns {object|null} la règle mise à jour
 */
async function applyFeedback(supabase, ruleId, wasCorrect) {
  try {
    // Charger la règle
    const { data: rule, error: loadErr } = await supabase
      .from('cabinet_brain_rules')
      .select('*')
      .eq('id', ruleId)
      .single();

    if (loadErr || !rule) {
      console.error('[AGENTS:LEARNING] applyFeedback load error:', loadErr?.message);
      return null;
    }

    const updates = {
      updated_at: new Date().toISOString(),
      last_applied_at: new Date().toISOString(),
    };

    if (wasCorrect) {
      // Bonne action : confidence +5%, times_applied++
      updates.confidence = Math.min((rule.confidence || 0.5) + 0.05, 1.0);
      updates.times_applied = (rule.times_applied || 0) + 1;
    } else {
      // Mauvaise action : confidence -15%, times_corrected++
      updates.confidence = Math.max((rule.confidence || 0.5) - 0.15, 0);
      updates.times_corrected = (rule.times_corrected || 0) + 1;
      updates.times_corrected_learning = (rule.times_corrected_learning || 0) + 1;
    }

    // Si confidence tombe à 0 → désactiver la règle
    if (updates.confidence <= 0) {
      updates.disabled_at = new Date().toISOString();
      updates.active = false;
      console.log(`[AGENTS:LEARNING] Règle ${rule.rule_name} désactivée (confidence=0)`);
    }

    const { data: updated, error: updateErr } = await supabase
      .from('cabinet_brain_rules')
      .update(updates)
      .eq('id', ruleId)
      .select()
      .single();

    if (updateErr) {
      console.error('[AGENTS:LEARNING] applyFeedback update error:', updateErr.message);
      return null;
    }

    // Si confidence >= 95% et scope=local → propager en global
    if (updated.confidence >= 0.95 && updated.scope !== 'global') {
      await propagateRule(supabase, updated);
    }

    return updated;
  } catch (e) {
    console.error('[AGENTS:LEARNING] applyFeedback exception:', e.message);
    return null;
  }
}

/**
 * Propage une règle en scope 'global' et émet l'événement sur le bus
 * Quand une règle atteint 95% de confidence, elle devient universelle
 *
 * @param {object} supabase - client Supabase
 * @param {object} rule - la règle à propager
 */
async function propagateRule(supabase, rule) {
  try {
    // Passer la règle en global
    const { error } = await supabase
      .from('cabinet_brain_rules')
      .update({
        scope: 'global',
        updated_at: new Date().toISOString(),
      })
      .eq('id', rule.id);

    if (error) {
      console.error('[AGENTS:LEARNING] propagateRule error:', error.message);
      return;
    }

    // Émettre sur le bus shared-intelligence
    bus.emit(EVENT_TYPES.PREFERENCE_APPRISE, {
      type: 'rule_promoted_global',
      ruleId: rule.id,
      ruleName: rule.rule_name,
      agentSource: rule.agent_source,
      confidence: rule.confidence,
      societeId: rule.societe_id,
    });

    console.log(`[AGENTS:LEARNING] Règle promue en global : "${rule.rule_name}" (confidence=${rule.confidence})`);
  } catch (e) {
    console.error('[AGENTS:LEARNING] propagateRule exception:', e.message);
  }
}

/**
 * Nettoie les règles obsolètes :
 * - confidence < 10% ET dernière application > 30 jours → désactivée
 * Appelé par le cron quotidien
 *
 * @param {object} supabase - client Supabase
 * @param {string} societeId - UUID du cabinet
 * @returns {number} nombre de règles désactivées
 */
async function pruneRules(supabase, societeId) {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    // Charger les règles candidates au pruning
    const { data: candidates, error: loadErr } = await supabase
      .from('cabinet_brain_rules')
      .select('id, rule_name, confidence, last_applied_at')
      .eq('societe_id', societeId)
      .is('disabled_at', null)
      .eq('active', true)
      .lt('confidence', 0.1);

    if (loadErr || !candidates || candidates.length === 0) {
      return 0;
    }

    // Filtrer celles dont last_applied_at > 30 jours (ou jamais appliquées)
    const toPrune = candidates.filter(r =>
      !r.last_applied_at || r.last_applied_at < thirtyDaysAgo
    );

    if (toPrune.length === 0) return 0;

    const ids = toPrune.map(r => r.id);

    const { error: updateErr } = await supabase
      .from('cabinet_brain_rules')
      .update({
        disabled_at: new Date().toISOString(),
        active: false,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids);

    if (updateErr) {
      console.error('[AGENTS:LEARNING] pruneRules error:', updateErr.message);
      return 0;
    }

    console.log(`[AGENTS:LEARNING] Pruning : ${toPrune.length} règle(s) désactivée(s) pour ${societeId}`);
    for (const r of toPrune) {
      console.log(`  - "${r.rule_name}" (confidence=${r.confidence})`);
    }

    return toPrune.length;
  } catch (e) {
    console.error('[AGENTS:LEARNING] pruneRules exception:', e.message);
    return 0;
  }
}

// =============================================
// HELPERS INTERNES
// =============================================

/**
 * Génère une signature unique pour identifier une règle
 * Basée sur l'agent + un hash simplifié des données
 */
function _buildRuleSignature(agentName, original, corrected) {
  const key = `${agentName}:${JSON.stringify(original || {})}→${JSON.stringify(corrected || {})}`;
  // Hash simple (pas crypto, juste pour déduplication)
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convertir en 32bit integer
  }
  return `${agentName}_${Math.abs(hash).toString(36)}`;
}

/**
 * Génère un nom lisible pour la règle
 */
function _generateRuleName(agentName, original, corrected) {
  if (agentName === 'classifieur' && corrected && corrected.category) {
    const origCat = (original && original.category) || '?';
    return `Corriger ${origCat} → ${corrected.category}`;
  }
  if (agentName === 'redacteur' && corrected && corrected.ton) {
    return `Ajuster le ton : ${corrected.ton}`;
  }
  if (agentName === 'extracteur' && corrected && corrected.field) {
    return `Corriger extraction : ${corrected.field}`;
  }
  return `Correction ${agentName} (apprise)`;
}

/**
 * Génère une description textuelle de la règle
 */
function _generateRuleText(agentName, original, corrected) {
  const origStr = JSON.stringify(original || {}).substring(0, 150);
  const corrStr = JSON.stringify(corrected || {}).substring(0, 150);
  return `L'agent "${agentName}" proposait ${origStr} mais l'utilisateur a corrigé en ${corrStr}. Appliquer la correction à l'avenir.`;
}

/**
 * Devine la catégorie de règle depuis le nom de l'agent
 */
function _guessCategory(agentName) {
  const map = {
    classifieur: 'mail',
    redacteur: 'mail',
    extracteur: 'compta',
    compositeur: 'mail',
    agenda: 'agenda',
    stock: 'fournisseur',
    patient: 'patient',
  };
  return map[agentName] || 'general';
}

module.exports = {
  recordCorrection,
  applyFeedback,
  propagateRule,
  pruneRules,
};
