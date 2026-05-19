// =============================================
// JADOMI — Agents Memory Layer
// Mémoire partagée Supabase pour la fourmilière
//
// Chaque agent peut :
// - Lire les règles apprises (globales + locales)
// - Lire les erreurs passées (corrections utilisateur)
// - Sauvegarder ses résultats dans le workflow
// - Construire son contexte enrichi pour le system prompt
// =============================================

/**
 * Charge les règles actives pour un agent donné
 * Combine les règles globales (scope='global') et les règles locales du cabinet
 * Triées par confidence décroissante, exclut les règles désactivées
 *
 * @param {object} supabase - client Supabase
 * @param {string} societeId - UUID du cabinet
 * @param {string} agentName - nom de l'agent ('classifieur', 'redacteur', etc.)
 * @returns {Array} règles triées par confidence DESC
 */
async function loadRules(supabase, societeId, agentName) {
  try {
    const { data, error } = await supabase
      .from('cabinet_brain_rules')
      .select('*')
      .or(`societe_id.eq.${societeId},scope.eq.global`)
      .is('disabled_at', null)
      .eq('active', true)
      .order('confidence', { ascending: false });

    if (error) {
      console.error('[AGENTS:MEMORY] loadRules error:', error.message);
      return [];
    }

    // Filtrer : règles globales + règles de cet agent + règles générales (sans agent_source)
    return (data || []).filter(rule =>
      rule.scope === 'global' ||
      !rule.agent_source ||
      rule.agent_source === agentName
    );
  } catch (e) {
    console.error('[AGENTS:MEMORY] loadRules exception:', e.message);
    return [];
  }
}

/**
 * Charge les dernières corrections utilisateur (erreurs passées)
 * Sert à injecter dans le contexte agent pour ne pas répéter les mêmes erreurs
 *
 * @param {object} supabase - client Supabase
 * @param {string} societeId - UUID du cabinet
 * @param {number} limit - nombre max de corrections à charger
 * @returns {Array} événements de correction récents
 */
async function loadRecentErrors(supabase, societeId, limit = 20) {
  try {
    const { data, error } = await supabase
      .from('cabinet_brain_events')
      .select('*')
      .eq('societe_id', societeId)
      .not('user_correction', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[AGENTS:MEMORY] loadRecentErrors error:', error.message);
      return [];
    }

    return data || [];
  } catch (e) {
    console.error('[AGENTS:MEMORY] loadRecentErrors exception:', e.message);
    return [];
  }
}

/**
 * Sauvegarde un step de workflow dans agents_workflow
 *
 * @param {object} supabase - client Supabase
 * @param {object} data - données du step
 * @param {string} data.societeId - UUID du cabinet
 * @param {string} data.workflowId - UUID du workflow (chaîne d'agents)
 * @param {string} data.agentName - nom de l'agent
 * @param {number} data.stepOrder - ordre dans la chaîne
 * @param {object} data.input - entrée de l'agent
 * @param {object} data.output - sortie de l'agent
 * @param {string} data.status - 'pending'|'running'|'completed'|'failed'|'skipped'
 * @param {string} [data.error] - message d'erreur si failed
 * @param {number} [data.durationMs] - durée d'exécution en ms
 * @returns {object|null} le step inséré ou null en cas d'erreur
 */
async function saveWorkflowStep(supabase, data) {
  try {
    const row = {
      societe_id: data.societeId,
      workflow_id: data.workflowId,
      agent_name: data.agentName,
      step_order: data.stepOrder || 0,
      input: data.input || {},
      output: data.output || {},
      status: data.status || 'pending',
      error: data.error || null,
      duration_ms: data.durationMs || null,
      completed_at: (data.status === 'completed' || data.status === 'failed')
        ? new Date().toISOString()
        : null,
    };

    const { data: inserted, error } = await supabase
      .from('agents_workflow')
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error('[AGENTS:MEMORY] saveWorkflowStep error:', error.message);
      return null;
    }

    return inserted;
  } catch (e) {
    console.error('[AGENTS:MEMORY] saveWorkflowStep exception:', e.message);
    return null;
  }
}

/**
 * Récupère tous les steps d'un workflow (pour que l'agent suivant
 * sache ce que le précédent a fait)
 *
 * @param {object} supabase - client Supabase
 * @param {string} workflowId - UUID du workflow
 * @returns {Array} steps ordonnés par step_order ASC
 */
async function getWorkflowContext(supabase, workflowId) {
  try {
    const { data, error } = await supabase
      .from('agents_workflow')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('step_order', { ascending: true });

    if (error) {
      console.error('[AGENTS:MEMORY] getWorkflowContext error:', error.message);
      return [];
    }

    return data || [];
  } catch (e) {
    console.error('[AGENTS:MEMORY] getWorkflowContext exception:', e.message);
    return [];
  }
}

/**
 * Construit le bloc de contexte texte injectable dans le system prompt d'un agent
 * Combine : identité cabinet + règles apprises + erreurs passées
 *
 * SÉCURITÉ — 2 niveaux de confiance :
 *   'full'     → Claude (Anthropic) ET Mistral (Mistral AI, Paris) — conformes RGPD
 *                Reçoit TOUT : identité, contacts, noms patients, mails, données médicales
 *   'none'     → DeepSeek / tout modèle non-conforme (serveurs chinois)
 *                Reçoit : RIEN. Zéro contexte cabinet. Intent parsing pur uniquement.
 *
 * RÈGLE ABSOLUE : les données de santé (noms patients, mails, téléphones, actes,
 * historique RDV, factures) ne sortent JAMAIS vers DeepSeek (serveurs chinois).
 * Claude et Mistral (tous deux conformes RGPD) reçoivent le contexte complet.
 *
 * @param {object} supabase - client Supabase
 * @param {string} societeId - UUID du cabinet
 * @param {string} agentName - nom de l'agent
 * @param {string} [trustLevel='full'] - 'full' (Claude/Mistral, RGPD OK), 'none' (DeepSeek, zéro données)
 * @returns {string} bloc de contexte texte pour le system prompt
 */
async function buildAgentContext(supabase, societeId, agentName, trustLevel = 'full') {

  // ── DeepSeek / non-conforme → ZÉRO contexte ──
  if (trustLevel === 'none') {
    return '';
  }

  const parts = [];

  // ── 1. Identité du cabinet (FULL uniquement) ──
  if (trustLevel === 'full') {
    try {
      const { data: brain } = await supabase
        .from('cabinet_brain')
        .select('identity, contacts, preferences, team')
        .eq('societe_id', societeId)
        .single();

      if (brain) {
        const id = brain.identity || {};
        parts.push('=== IDENTITÉ DU CABINET ===');
        if (id.nom_cabinet) parts.push(`Cabinet : ${id.nom_cabinet}`);
        if (id.ville) parts.push(`Ville : ${id.ville}`);
        if (id.tel) parts.push(`Téléphone : ${id.tel}`);

        if (brain.contacts && brain.contacts.length > 0) {
          parts.push('\n=== CONTACTS CONNUS ===');
          for (const c of brain.contacts) {
            parts.push(`- ${c.role || 'contact'} : ${c.nom || ''}${c.email ? ' (' + c.email + ')' : ''}`);
          }
        }

        if (brain.preferences) {
          const prefs = brain.preferences;
          if (prefs.ton_mail) parts.push(`\nTon des mails : ${prefs.ton_mail}`);
        }
      }
    } catch (e) {
      // Pas de brain configuré — pas grave, on continue
    }
  }

  // ── 2. Règles apprises ──
  const rules = await loadRules(supabase, societeId, agentName);
  if (rules.length > 0) {
    parts.push('\n=== RÈGLES APPRISES ===');
    const topRules = rules.slice(0, 15);
    for (const r of topRules) {
      const scope = r.scope === 'global' ? '[GLOBAL]' : '[LOCAL]';
      parts.push(`${scope} ${r.rule_name} (confiance: ${Math.round((r.confidence || 0) * 100)}%)`);
      if (r.rule_text) parts.push(`  → ${r.rule_text}`);
    }
  }

  // ── 3. Erreurs passées (corrections utilisateur) ──
  const errors = await loadRecentErrors(supabase, societeId, 10);
  if (errors.length > 0) {
    parts.push('\n=== CORRECTIONS PASSÉES (ne pas répéter ces erreurs) ===');
    for (const e of errors) {
      const ctx = e.context || {};
      const correction = e.user_correction || '';
      if (correction) {
        parts.push(`- ${e.event_type} : "${correction}"`);
        if (ctx.original) parts.push(`  (IA avait proposé : ${JSON.stringify(ctx.original).substring(0, 100)})`);
      }
    }
  }

  return parts.join('\n');
}

module.exports = {
  loadRules,
  loadRecentErrors,
  saveWorkflowStep,
  getWorkflowContext,
  buildAgentContext,
};
