'use strict';
/**
 * JCI — Debate Engine
 *
 * Moteur de contradiction structuree en 7 phases.
 * Le consensus rapide est INTERDIT.
 * La contradiction est ENCOURAGEE.
 *
 * Phases :
 *   1. question       — poser la question
 *   2. independent    — chaque agent analyse SEUL (pas d'acces aux autres)
 *   3. publish        — publication de tous les avis
 *   4. contradiction  — agents contradictoires challengent
 *   5. debate         — echanges argumentes (max N tours)
 *   6. synthesis      — Meta Agent synthetise
 *   7. decision       — decision finale (ou "no action")
 *
 * S'integre avec le Boss daemon existant pour spawner les agents.
 * ZERO vocabulaire metier.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');
const TrustEngine = require('./trust-engine');
const ReputationEngine = require('./reputation-engine');

let _sb = null;
function sb() {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return _sb;
}

const PHASES = ['question', 'independent', 'publish', 'contradiction', 'debate', 'synthesis', 'decision'];

class DebateEngine {

  /**
   * @param {object} opts — depuis le plugin
   *   maxRounds: tours de debat max (defaut 3)
   *   minAgents: minimum d'opinions (defaut 3)
   */
  constructor(opts) {
    this.maxRounds = opts?.maxRounds || 3;
    this.minAgents = opts?.minAgents || 3;
    this.trust = new TrustEngine(opts?.trust);
    this.reputation = new ReputationEngine();
  }

  // ═══════════════════════════════════════
  // PHASE 1 — CREER UN DEBAT
  // ═══════════════════════════════════════

  /**
   * Creer un nouveau debat
   *
   * @param {string} societeId
   * @param {object} params
   *   question:       string — la question a debattre
   *   context:        object — contexte libre (donnees, historique, etc.)
   *   agents:         [{role, prompt}] — agents qui participent
   *   contradictors:  [{role, prompt}] — agents contradictoires
   *
   * @returns {object} debat cree avec id
   */
  async createDebate(societeId, { question, context, agents, contradictors }) {
    if (!question) throw new Error('question requise');
    if (!agents || agents.length < this.minAgents) {
      throw new Error(`Minimum ${this.minAgents} agents requis, ${agents?.length || 0} fournis`);
    }

    const { data: debate, error } = await sb().from('jci_debates').insert({
      societe_id: societeId,
      question,
      context: {
        ...(context || {}),
        agents: agents.map(a => a.role),
        contradictors: (contradictors || []).map(c => c.role),
      },
      phase: 'question',
      status: 'active',
    }).select().single();

    if (error) throw new Error(`createDebate: ${error.message}`);
    return debate;
  }

  // ═══════════════════════════════════════
  // PHASE 2 — ANALYSES INDEPENDANTES
  // ═══════════════════════════════════════

  /**
   * Enregistrer l'opinion d'un agent (phase independent)
   * Chaque agent analyse SEUL — pas d'acces aux opinions des autres.
   */
  async submitOpinion(debateId, { agent_role, opinion, position, confidence, data }) {
    if (!opinion) throw new Error('opinion requise');
    if (!['for', 'against', 'neutral'].includes(position)) {
      throw new Error('position doit etre: for, against, neutral');
    }

    const { data: saved, error } = await sb().from('jci_opinions').insert({
      debate_id: debateId,
      agent_role,
      phase: 'independent',
      round: 1,
      opinion,
      position,
      confidence: confidence || 0.5,
      data: data || {},
    }).select().single();

    if (error) throw new Error(`submitOpinion: ${error.message}`);

    // Avancer la phase si assez d'opinions
    await this._checkPhaseAdvance(debateId);

    return saved;
  }

  // ═══════════════════════════════════════
  // PHASE 3 — PUBLICATION (automatique)
  // ═══════════════════════════════════════

  /**
   * Recuperer toutes les opinions d'un debat
   * Disponible apres la phase 'publish'
   */
  async getOpinions(debateId, { phase, round } = {}) {
    let q = sb().from('jci_opinions').select('*').eq('debate_id', debateId);
    if (phase) q = q.eq('phase', phase);
    if (round) q = q.eq('round', round);
    q = q.order('created_at', { ascending: true });
    const { data } = await q;
    return data || [];
  }

  // ═══════════════════════════════════════
  // PHASE 4 — CONTRADICTION
  // ═══════════════════════════════════════

  /**
   * Soumettre une contradiction
   * L'agent contradictoire recoit TOUTES les opinions et doit trouver les failles.
   */
  async submitContradiction(debateId, { agent_role, opinion, targets, data }) {
    const { data: saved, error } = await sb().from('jci_opinions').insert({
      debate_id: debateId,
      agent_role,
      phase: 'contradiction',
      round: 1,
      opinion,
      position: 'against', // contradicteurs sont toujours "against" par definition
      confidence: 0.7,
      data: { targets: targets || [], ...(data || {}) },
    }).select().single();

    if (error) throw new Error(`submitContradiction: ${error.message}`);
    return saved;
  }

  // ═══════════════════════════════════════
  // PHASE 5 — DEBAT (tours d'echanges)
  // ═══════════════════════════════════════

  /**
   * Soumettre une reponse dans le debat
   * Un agent repond a une contradiction ou a un autre agent
   */
  async submitDebateRound(debateId, { agent_role, opinion, position, round, responding_to, data }) {
    if (round > this.maxRounds) {
      throw new Error(`Maximum ${this.maxRounds} tours de debat atteint`);
    }

    const { data: saved, error } = await sb().from('jci_opinions').insert({
      debate_id: debateId,
      agent_role,
      phase: 'debate',
      round: round || 2,
      opinion,
      position: position || 'neutral',
      confidence: 0.6,
      data: { responding_to, ...(data || {}) },
    }).select().single();

    if (error) throw new Error(`submitDebateRound: ${error.message}`);
    return saved;
  }

  // ═══════════════════════════════════════
  // PHASE 6 — SYNTHESE
  // ═══════════════════════════════════════

  /**
   * Generer la synthese du debat
   * Collecte toutes les opinions, calcule la confiance, prepare la decision
   */
  async synthesize(debateId) {
    const debate = await this.getDebate(debateId);
    if (!debate) throw new Error('Debat introuvable');

    // Toutes les opinions de toutes les phases
    const allOpinions = await this.getOpinions(debateId);

    // Separer par phase
    const independent = allOpinions.filter(o => o.phase === 'independent');
    const contradictions = allOpinions.filter(o => o.phase === 'contradiction');
    const debateRounds = allOpinions.filter(o => o.phase === 'debate');

    // Reputations des agents participants
    const agentRoles = [...new Set(allOpinions.map(o => o.agent_role))];
    const reputations = [];
    for (const role of agentRoles) {
      const rep = await this.reputation.getReputation(role);
      if (rep) reputations.push({ role, precision: rep.precision_score, weight: rep.weight });
      else reputations.push({ role, precision: 0.5, weight: 1.0 });
    }

    // Calculer confiance via Trust Engine
    const trustResult = this.trust.score({
      opinions: allOpinions,
      contradictions: contradictions.map(c => ({
        strength: c.confidence,
        resolved: debateRounds.some(d => (d.data?.responding_to || []).includes(c.agent_role)),
      })),
      dataQuality: debate.context?.data_quality || 0.5,
      agentReputations: reputations,
    });

    // Compter les positions finales (derniere opinion de chaque agent)
    const finalPositions = {};
    for (const op of [...independent, ...debateRounds]) {
      finalPositions[op.agent_role] = op.position;
    }
    const forCount = Object.values(finalPositions).filter(p => p === 'for').length;
    const againstCount = Object.values(finalPositions).filter(p => p === 'against').length;

    // Mettre a jour la phase du debat
    await sb().from('jci_debates').update({
      phase: 'synthesis',
    }).eq('id', debateId);

    return {
      debate_id: debateId,
      question: debate.question,
      opinions_count: allOpinions.length,
      positions: { for: forCount, against: againstCount, neutral: Object.keys(finalPositions).length - forCount - againstCount },
      contradictions_count: contradictions.length,
      debate_rounds: debateRounds.length,
      trust: trustResult,
      reputations,
      dissenting: allOpinions.filter(o => o.position === 'against').map(o => ({
        agent: o.agent_role,
        opinion: o.opinion,
        phase: o.phase,
      })),
    };
  }

  // ═══════════════════════════════════════
  // PHASE 7 — DECISION
  // ═══════════════════════════════════════

  /**
   * Finaliser le debat avec une decision
   */
  async finalize(debateId, { decision, confidence, action }) {
    await sb().from('jci_debates').update({
      phase: 'decision',
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', debateId);

    return { debate_id: debateId, decision, confidence, action };
  }

  // ═══════════════════════════════════════
  // UTILITAIRES
  // ═══════════════════════════════════════

  /**
   * Recuperer un debat par ID
   */
  async getDebate(debateId) {
    const { data, error } = await sb().from('jci_debates')
      .select('*').eq('id', debateId).single();
    if (error) return null;
    return data;
  }

  /**
   * Lister les debats d'une societe
   */
  async listDebates(societeId, { status, limit } = {}) {
    let q = sb().from('jci_debates').select('*').eq('societe_id', societeId);
    if (status) q = q.eq('status', status);
    q = q.order('created_at', { ascending: false });
    if (limit) q = q.limit(limit);
    const { data } = await q;
    return data || [];
  }

  /**
   * Avancer automatiquement la phase si conditions remplies
   */
  async _checkPhaseAdvance(debateId) {
    const debate = await this.getDebate(debateId);
    if (!debate || debate.phase !== 'question') return;

    const opinions = await this.getOpinions(debateId, { phase: 'independent' });
    const expectedAgents = debate.context?.agents?.length || this.minAgents;

    if (opinions.length >= expectedAgents) {
      // Tous les agents ont donne leur avis → passer a publish
      await sb().from('jci_debates').update({ phase: 'publish' }).eq('id', debateId);
    }
  }
}

module.exports = DebateEngine;
