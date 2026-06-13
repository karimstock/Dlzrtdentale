'use strict';
/**
 * JCI — Reputation Engine
 *
 * Chaque agent a un score de fiabilite et un poids.
 * Le systeme ajuste automatiquement l'influence de chaque agent
 * en fonction de son historique de predictions correctes/incorrectes.
 *
 * Utilise EMA (Exponential Moving Average) pour que les performances
 * recentes comptent plus que les anciennes.
 *
 * ZERO vocabulaire metier.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

let _sb = null;
function sb() {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return _sb;
}

// Facteur EMA : les 20 dernieres decisions comptent le plus
const EMA_ALPHA = 0.1;

// Poids min/max pour eviter qu'un agent devienne invisible ou omnipotent
const WEIGHT_MIN = 0.2;
const WEIGHT_MAX = 3.0;

class ReputationEngine {

  /**
   * Enregistrer le resultat d'un agent sur une decision
   *
   * @param {string} agentRole — ex: "optimist", "risk", "stock_analyst"
   * @param {object} outcome
   *   debateId:   UUID du debat
   *   prediction: ce que l'agent a predit
   *   actual:     ce qui s'est passe
   *   correct:    boolean — l'agent avait-il raison ?
   */
  async recordOutcome(agentRole, { debateId, prediction, actual, correct }) {
    // Recuperer ou creer la reputation
    let rep = await this.getReputation(agentRole);

    if (!rep) {
      // Premier outcome pour cet agent
      const { data, error } = await sb().from('jci_agent_reputation').insert({
        agent_role: agentRole,
        precision_score: correct ? 1.0 : 0.0,
        weight: 1.0,
        outcomes_count: 1,
        correct_count: correct ? 1 : 0,
        trend: 'stable',
        last_recalc: new Date().toISOString(),
      }).select().single();
      if (error) console.log('[JCI-REP] Insert error:', error.message);
      return data;
    }

    // EMA update
    const newPrecision = (EMA_ALPHA * (correct ? 1 : 0)) + ((1 - EMA_ALPHA) * rep.precision_score);
    const newCount = rep.outcomes_count + 1;
    const newCorrect = rep.correct_count + (correct ? 1 : 0);

    // Ajuster le poids : precision haute → poids plus eleve
    const newWeight = Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, newPrecision * 2));

    // Tendance
    let trend = 'stable';
    if (newPrecision > rep.precision_score + 0.05) trend = 'up';
    else if (newPrecision < rep.precision_score - 0.05) trend = 'down';

    const { data, error } = await sb().from('jci_agent_reputation')
      .update({
        precision_score: Math.round(newPrecision * 1000) / 1000,
        weight: Math.round(newWeight * 1000) / 1000,
        outcomes_count: newCount,
        correct_count: newCorrect,
        trend,
        last_recalc: new Date().toISOString(),
      })
      .eq('agent_role', agentRole)
      .select().single();

    if (error) console.log('[JCI-REP] Update error:', error.message);
    return data;
  }

  /**
   * Recuperer la reputation d'un agent
   * @returns {{ precision_score, weight, outcomes_count, correct_count, trend } | null}
   */
  async getReputation(agentRole) {
    const { data, error } = await sb().from('jci_agent_reputation')
      .select('*')
      .eq('agent_role', agentRole)
      .single();
    if (error || !data) return null;
    return data;
  }

  /**
   * Recuperer toutes les reputations pour injection dans le Trust Engine
   * @returns {Array<{ role, precision, weight }>}
   */
  async getAllReputations() {
    const { data, error } = await sb().from('jci_agent_reputation')
      .select('agent_role, precision_score, weight, outcomes_count, trend')
      .order('weight', { ascending: false });
    if (error) return [];
    return (data || []).map(r => ({
      role: r.agent_role,
      precision: r.precision_score,
      weight: r.weight,
      count: r.outcomes_count,
      trend: r.trend,
    }));
  }

  /**
   * Recalculer tous les poids (appele par l'Audit Engine)
   * Utile si on change la formule ou apres un import de donnees
   */
  async recalculateAll() {
    const { data: all } = await sb().from('jci_agent_reputation').select('*');
    if (!all || all.length === 0) return { recalculated: 0 };

    let count = 0;
    for (const rep of all) {
      const rawPrecision = rep.outcomes_count > 0
        ? rep.correct_count / rep.outcomes_count
        : 0.5;
      const newWeight = Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, rawPrecision * 2));

      await sb().from('jci_agent_reputation').update({
        precision_score: Math.round(rawPrecision * 1000) / 1000,
        weight: Math.round(newWeight * 1000) / 1000,
        last_recalc: new Date().toISOString(),
      }).eq('id', rep.id);

      count++;
    }

    return { recalculated: count };
  }

  /**
   * Leaderboard — top agents par poids
   */
  async leaderboard(limit = 10) {
    const { data, error } = await sb().from('jci_agent_reputation')
      .select('agent_role, precision_score, weight, outcomes_count, correct_count, trend')
      .order('weight', { ascending: false })
      .limit(limit);
    if (error) return [];
    return data || [];
  }
}

module.exports = ReputationEngine;
