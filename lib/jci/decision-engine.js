'use strict';
/**
 * JCI — Decision Engine
 *
 * Orchestrateur central du cycle de vie d'une decision.
 * C'est le point d'entree principal de JCI.
 *
 * Flux :
 *   1. Enrichir le contexte via le Knowledge Graph
 *   2. Choisir : debat complet ou agent seul ?
 *   3. Lancer le Debate Engine
 *   4. Trust Engine score le resultat
 *   5. Governance check (veto ? approbation ?)
 *   6. Enregistrer la decision
 *   7. Enregistrer dans la Collective Memory existante
 *
 * ZERO vocabulaire metier. Les agents et le contexte viennent du plugin.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

const GraphEngine = require('./graph-engine');
const DebateEngine = require('./debate-engine');
const TrustEngine = require('./trust-engine');
const ReputationEngine = require('./reputation-engine');
const Governance = require('./governance');

// Connexion a la Collective Memory existante (lib/boss/collective-memory.js)
let collectiveMemory;
try { collectiveMemory = require('../boss/collective-memory'); } catch { collectiveMemory = null; }

// Connexion au bus d'evenements existant (lib/shared-intelligence.js)
let sharedIntel;
try { sharedIntel = require('../shared-intelligence'); } catch { sharedIntel = null; }

let _sb = null;
function sb() {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return _sb;
}

class DecisionEngine {

  /**
   * @param {object} plugin — config metier chargee (dental.json, legal.json...)
   */
  constructor(plugin) {
    this.plugin = plugin || {};
    this.graph = new GraphEngine();
    this.debate = new DebateEngine({
      maxRounds: plugin?.debate?.maxRounds,
      minAgents: plugin?.debate?.minAgents,
      trust: plugin?.trust,
    });
    this.trust = new TrustEngine(plugin?.trust);
    this.reputation = new ReputationEngine();
    this.governance = new Governance(plugin);
  }

  // ═══════════════════════════════════════
  // POINT D'ENTREE PRINCIPAL
  // ═══════════════════════════════════════

  /**
   * Lancer une decision
   *
   * @param {string} societeId
   * @param {object} params
   *   question:  string — la question a trancher
   *   context:   object — donnees contextuelles
   *   urgency:   'low' | 'medium' | 'high' | 'critical'
   *   agents:    [{role, prompt}] — override les agents du plugin
   *
   * @returns {object} decision prise (ou abstention)
   */
  async decide(societeId, { question, context, urgency, agents }) {
    urgency = urgency || 'medium';

    // --- 1. Enrichir le contexte via le Knowledge Graph ---
    let graphContext = {};
    try {
      // Chercher des nodes pertinents dans le graphe
      const keywords = question.split(/\s+/).filter(w => w.length > 3).slice(0, 5);
      for (const kw of keywords) {
        const nodes = await this.graph.getNodes(societeId, { search: kw, limit: 5 });
        if (nodes.length > 0) {
          graphContext[kw] = nodes.map(n => ({ type: n.type, label: n.label }));
        }
      }
    } catch { /* pas grave si le graph est vide */ }

    const enrichedContext = {
      ...(context || {}),
      graph: graphContext,
      urgency,
      data_quality: context?.data_quality || 0.5,
    };

    // --- 2. Mode rapide pour urgence critique ---
    if (urgency === 'critical') {
      return this._quickDecision(societeId, question, enrichedContext);
    }

    // --- 3. Debat complet ---
    const debateAgents = agents || this.plugin.agents || [];
    const contradictors = this.plugin.contradictory_roles || [];

    if (debateAgents.length < (this.plugin.debate?.minAgents || 3)) {
      // Pas assez d'agents definis → decision simple
      return this._quickDecision(societeId, question, enrichedContext);
    }

    // Creer le debat
    const debate = await this.debate.createDebate(societeId, {
      question,
      context: enrichedContext,
      agents: debateAgents,
      contradictors,
    });

    return {
      debate_id: debate.id,
      status: 'debate_started',
      phase: 'question',
      message: `Debat lance avec ${debateAgents.length} agents + ${contradictors.length} contradicteurs`,
      agents: debateAgents.map(a => a.role),
      contradictors: contradictors.map(c => c.role),
    };
  }

  /**
   * Finaliser une decision apres un debat complet
   *
   * @param {string} societeId
   * @param {string} debateId
   * @param {string} decidedAction — la decision prise (texte libre)
   */
  async finalizeDecision(societeId, debateId, decidedAction) {
    // Synthetiser le debat
    const synthesis = await this.debate.synthesize(debateId);

    // Trust Engine
    const trustResult = synthesis.trust;

    // Si confiance trop basse → abstention
    if (trustResult.action === 'no_action') {
      const abstention = this.trust.formatAbstention(trustResult.confidence, trustResult.reasons);
      await this._saveDecision(societeId, debateId, {
        decision: 'ABSTENTION',
        confidence: trustResult.confidence,
        action: 'no_action',
      });
      return abstention;
    }

    // Si wait → attendre
    if (trustResult.action === 'wait') {
      const wait = this.trust.formatWait(trustResult.confidence, trustResult.reasons);
      await this._saveDecision(societeId, debateId, {
        decision: 'ATTENDRE',
        confidence: trustResult.confidence,
        action: 'wait',
      });
      return wait;
    }

    // Governance check
    const vetoes = synthesis.dissenting
      .filter(d => this.governance.canVeto(d.agent))
      .map(d => d.agent);

    const approval = this.governance.checkApproval({
      opinions: synthesis.dissenting.map(d => ({ agent_role: d.agent, position: 'against' })),
      confidence: trustResult.confidence,
      vetoes,
    });

    // Sauvegarder
    const decision = await this._saveDecision(societeId, debateId, {
      decision: decidedAction || 'Voir synthese du debat',
      confidence: trustResult.confidence,
      action: 'decide',
      approved: approval.needsApproval ? null : true, // null = en attente
    });

    // Finaliser le debat
    await this.debate.finalize(debateId, {
      decision: decidedAction,
      confidence: trustResult.confidence,
      action: 'decide',
    });

    // Enregistrer dans la Collective Memory existante
    if (collectiveMemory) {
      try {
        await collectiveMemory.recordLearning({
          team: 'jci',
          type: 'pattern',
          title: `Decision JCI: ${synthesis.question}`,
          description: `Decision: ${decidedAction}. Confiance: ${(trustResult.confidence * 100).toFixed(0)}%. Positions: ${synthesis.positions.for} pour, ${synthesis.positions.against} contre.`,
          tags: ['jci', 'decision'],
          confidence: trustResult.confidence,
        });
      } catch { /* pas critique */ }
    }

    // Emettre sur le bus existant
    if (sharedIntel?.bus) {
      try {
        sharedIntel.bus.emit('jci_decision', {
          societe_id: societeId,
          debate_id: debateId,
          decision: decidedAction,
          confidence: trustResult.confidence,
          needs_approval: approval.needsApproval,
        });
      } catch { /* pas critique */ }
    }

    return {
      decision_id: decision.id,
      debate_id: debateId,
      decision: decidedAction,
      confidence: trustResult.confidence,
      action: 'decide',
      needs_approval: approval.needsApproval,
      approval_reason: approval.reason,
      synthesis,
    };
  }

  // ═══════════════════════════════════════
  // FEEDBACK — La decision etait-elle bonne ?
  // ═══════════════════════════════════════

  /**
   * Enregistrer le feedback apres constatation du resultat
   * C'est le "Lessons Learned Engine" du prompt JCI
   */
  async feedback(decisionId, { outcome, correct, notes }) {
    // Mettre a jour la decision
    await sb().from('jci_decisions').update({
      outcome: outcome || {},
      correct,
      feedback_at: new Date().toISOString(),
    }).eq('id', decisionId);

    // Recuperer la decision pour avoir le debate_id
    const { data: decision } = await sb().from('jci_decisions')
      .select('*').eq('id', decisionId).single();

    if (!decision) return { updated: false };

    // Mettre a jour la reputation de chaque agent du debat
    if (decision.debate_id) {
      const opinions = await this.debate.getOpinions(decision.debate_id, { phase: 'independent' });
      for (const op of opinions) {
        // L'agent avait-il raison ? (position 'for' + correct = raison, position 'against' + !correct = raison)
        const agentCorrect = (op.position === 'for' && correct) || (op.position === 'against' && !correct);
        await this.reputation.recordOutcome(op.agent_role, {
          debateId: decision.debate_id,
          prediction: op.opinion,
          actual: JSON.stringify(outcome),
          correct: agentCorrect,
        });
      }
    }

    // Enregistrer la lecon dans la Collective Memory
    if (collectiveMemory) {
      try {
        await collectiveMemory.recordLearning({
          team: 'jci',
          type: correct ? 'success' : 'error',
          title: `Feedback: ${decision.decision}`,
          description: `Resultat: ${correct ? 'correct' : 'incorrect'}. ${notes || ''}`,
          tags: ['jci', 'feedback', correct ? 'success' : 'error'],
          confidence: correct ? 0.9 : 0.3,
        });
      } catch { /* pas critique */ }
    }

    return { updated: true, correct, decision_id: decisionId };
  }

  // ═══════════════════════════════════════
  // APPROUVER / REJETER
  // ═══════════════════════════════════════

  async approve(decisionId) {
    await sb().from('jci_decisions').update({ approved: true }).eq('id', decisionId);
    return { approved: true };
  }

  async reject(decisionId, reason) {
    await sb().from('jci_decisions').update({
      approved: false,
      outcome: { rejected_reason: reason },
    }).eq('id', decisionId);
    return { approved: false, reason };
  }

  // ═══════════════════════════════════════
  // INTERNES
  // ═══════════════════════════════════════

  /**
   * Decision rapide sans debat (urgence critique ou pas assez d'agents)
   */
  async _quickDecision(societeId, question, context) {
    const decision = await this._saveDecision(societeId, null, {
      decision: `Decision rapide (urgence): ${question}`,
      confidence: 0.3, // confiance basse par defaut en mode rapide
      action: 'decide',
      approved: null, // toujours approbation humaine en mode rapide
    });

    return {
      decision_id: decision.id,
      debate_id: null,
      decision: question,
      confidence: 0.3,
      action: 'decide',
      needs_approval: true,
      approval_reason: 'Decision rapide sans debat — validation humaine obligatoire',
      mode: 'quick',
    };
  }

  /**
   * Sauvegarder une decision en base
   */
  async _saveDecision(societeId, debateId, { decision, confidence, action, approved }) {
    const { data, error } = await sb().from('jci_decisions').insert({
      societe_id: societeId,
      debate_id: debateId,
      decision,
      confidence,
      action: action || 'decide',
      approved: approved !== undefined ? approved : null,
    }).select().single();

    if (error) throw new Error(`saveDecision: ${error.message}`);
    return data;
  }

  /**
   * Lister les decisions d'une societe
   */
  async listDecisions(societeId, { action, approved, limit } = {}) {
    let q = sb().from('jci_decisions').select('*').eq('societe_id', societeId);
    if (action) q = q.eq('action', action);
    if (approved !== undefined) q = q.eq('approved', approved);
    q = q.order('created_at', { ascending: false });
    if (limit) q = q.limit(limit);
    const { data } = await q;
    return data || [];
  }
}

module.exports = DecisionEngine;
