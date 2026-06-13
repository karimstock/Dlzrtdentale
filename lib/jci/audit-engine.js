'use strict';
/**
 * JCI — Audit Engine
 *
 * Audit periodique du systeme d'intelligence collective.
 * Detecte les biais, les agents sous/sur-performants.
 * Genere un rapport automatique.
 *
 * Declenche par lib/boss/cron.js (pas de scheduler propre).
 * ZERO vocabulaire metier.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');
const ReputationEngine = require('./reputation-engine');

let _sb = null;
function sb() {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return _sb;
}

class AuditEngine {

  constructor() {
    this.reputation = new ReputationEngine();
  }

  /**
   * Audit complet — appele chaque semaine par le cron
   *
   * @param {string|null} societeId — null = audit global
   * @param {number} periodDays — nombre de jours a auditer (defaut 7)
   * @returns {object} rapport d'audit
   */
  async weeklyAudit(societeId, periodDays = 7) {
    const periodStart = new Date(Date.now() - periodDays * 86400000).toISOString();
    const periodEnd = new Date().toISOString();

    // --- 1. Recuperer les decisions de la periode ---
    let q = sb().from('jci_decisions').select('*')
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);
    if (societeId) q = q.eq('societe_id', societeId);
    const { data: decisions } = await q;
    const allDecisions = decisions || [];

    // --- 2. Calculer la precision globale ---
    const withFeedback = allDecisions.filter(d => d.correct !== null);
    const correctCount = withFeedback.filter(d => d.correct === true).length;
    const accuracy = withFeedback.length > 0 ? correctCount / withFeedback.length : null;

    // --- 3. Analyser les debats ---
    const debateIds = [...new Set(allDecisions.map(d => d.debate_id).filter(Boolean))];
    let opinionsData = [];
    if (debateIds.length > 0) {
      const { data } = await sb().from('jci_opinions').select('*')
        .in('debate_id', debateIds);
      opinionsData = data || [];
    }

    // --- 4. Detecter les biais par agent ---
    const biases = this._detectBiases(opinionsData);

    // --- 5. Recalculer les reputations ---
    const recalcResult = await this.reputation.recalculateAll();

    // --- 6. Top et bottom agents ---
    const leaderboard = await this.reputation.leaderboard(20);
    const topAgents = leaderboard.slice(0, 5);
    const bottomAgents = leaderboard.slice(-3).reverse();

    // --- 7. Statistiques decisions ---
    const stats = {
      total: allDecisions.length,
      decided: allDecisions.filter(d => d.action === 'decide').length,
      no_action: allDecisions.filter(d => d.action === 'no_action').length,
      wait: allDecisions.filter(d => d.action === 'wait').length,
      approved: allDecisions.filter(d => d.approved === true).length,
      rejected: allDecisions.filter(d => d.approved === false).length,
      pending: allDecisions.filter(d => d.approved === null).length,
      with_feedback: withFeedback.length,
    };

    // --- 8. Enregistrer le rapport ---
    const report = {
      period: { start: periodStart, end: periodEnd, days: periodDays },
      stats,
      accuracy,
      biases,
      topAgents,
      bottomAgents,
      recalculated: recalcResult.recalculated,
    };

    const { data: saved, error } = await sb().from('jci_audit_reports').insert({
      societe_id: societeId || null,
      period_start: periodStart,
      period_end: periodEnd,
      decisions_count: allDecisions.length,
      accuracy,
      biases,
      top_agents: topAgents,
      report,
    }).select().single();

    if (error) {
      console.log('[JCI-AUDIT] Save error:', error.message);
      return report;
    }

    return { ...report, report_id: saved.id };
  }

  /**
   * Detecter les biais dans les opinions
   * Un agent biaise = toujours la meme position (for/against) > 85% du temps
   */
  _detectBiases(opinions) {
    const byAgent = {};

    for (const op of opinions) {
      if (!byAgent[op.agent_role]) {
        byAgent[op.agent_role] = { for: 0, against: 0, neutral: 0, total: 0 };
      }
      byAgent[op.agent_role][op.position || 'neutral']++;
      byAgent[op.agent_role].total++;
    }

    const biases = [];
    for (const [role, counts] of Object.entries(byAgent)) {
      if (counts.total < 5) continue; // pas assez de donnees

      const forRatio = counts.for / counts.total;
      const againstRatio = counts.against / counts.total;

      if (forRatio > 0.85) {
        biases.push({
          agent: role,
          bias: 'systematically_optimistic',
          ratio: Math.round(forRatio * 100),
          sample_size: counts.total,
        });
      } else if (againstRatio > 0.85) {
        biases.push({
          agent: role,
          bias: 'systematically_pessimistic',
          ratio: Math.round(againstRatio * 100),
          sample_size: counts.total,
        });
      }
    }

    return biases;
  }

  /**
   * Recuperer un rapport d'audit
   */
  async getReport(reportId) {
    const { data, error } = await sb().from('jci_audit_reports')
      .select('*').eq('id', reportId).single();
    if (error) throw new Error(`getReport: ${error.message}`);
    return data;
  }

  /**
   * Lister les rapports d'audit
   */
  async listReports(societeId, limit = 10) {
    let q = sb().from('jci_audit_reports').select('id, societe_id, period_start, period_end, decisions_count, accuracy, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (societeId) q = q.eq('societe_id', societeId);
    const { data } = await q;
    return data || [];
  }
}

module.exports = AuditEngine;
