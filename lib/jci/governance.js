'use strict';
/**
 * JCI — Governance Layer
 *
 * Gere les niveaux d'autorite des agents.
 * Tous les agents n'ont PAS le meme pouvoir.
 *
 * Trois niveaux d'autorite (definis dans le plugin, pas ici) :
 *   "veto"    — l'agent peut bloquer une decision
 *   "execute" — l'agent peut agir sans approbation
 *   "propose" — l'agent propose, l'humain valide
 *
 * ZERO vocabulaire metier.
 */

class Governance {

  /**
   * @param {object} plugin — le plugin charge (dental.json, legal.json...)
   *   plugin.authority : { agentRole: 'veto' | 'execute' | 'propose' }
   */
  constructor(plugin) {
    this.rules = plugin?.authority || {};
    this.defaultLevel = 'propose'; // par defaut, tout passe par l'humain
  }

  /**
   * Niveau d'autorite d'un agent
   */
  getAuthority(agentRole) {
    return this.rules[agentRole] || this.defaultLevel;
  }

  /**
   * Un agent peut-il bloquer (veto) une decision ?
   */
  canVeto(agentRole) {
    return this.getAuthority(agentRole) === 'veto';
  }

  /**
   * Un agent peut-il agir sans approbation humaine ?
   */
  canExecute(agentRole) {
    return this.getAuthority(agentRole) === 'execute';
  }

  /**
   * Verifier si une decision necessite une approbation humaine
   *
   * @param {object} params
   *   opinions:   [{agent_role, position, confidence}]
   *   confidence: score global du Trust Engine
   *   vetoes:     [agentRole] — agents qui ont pose un veto
   *
   * @returns {{ needsApproval: boolean, reason: string }}
   */
  checkApproval({ opinions = [], confidence, vetoes = [] }) {
    // Regle 1 : si un agent "veto" a bloque → approbation humaine obligatoire
    for (const v of vetoes) {
      if (this.canVeto(v)) {
        return {
          needsApproval: true,
          reason: `Agent "${v}" a oppose un veto (autorite: veto)`,
        };
      }
    }

    // Regle 2 : confiance basse → approbation humaine
    if (confidence < 0.6) {
      return {
        needsApproval: true,
        reason: `Confiance ${(confidence * 100).toFixed(0)}% < 60% — validation humaine requise`,
      };
    }

    // Regle 3 : desaccord majeur entre agents (>= 40% against)
    const againstCount = opinions.filter(o => o.position === 'against').length;
    if (opinions.length > 0 && againstCount / opinions.length >= 0.4) {
      return {
        needsApproval: true,
        reason: `${againstCount}/${opinions.length} agents opposes — desaccord significatif`,
      };
    }

    // Regle 4 : verifier si TOUS les agents sont en mode "execute"
    const allExecute = opinions.every(o => this.canExecute(o.agent_role));
    if (allExecute && confidence >= 0.6) {
      return { needsApproval: false, reason: 'Tous les agents ont autorite "execute" + confiance suffisante' };
    }

    // Par defaut : approbation humaine
    return { needsApproval: true, reason: 'Mode par defaut — approbation humaine' };
  }

  /**
   * Enregistrer un veto
   * Retourne les infos pour la Governance audit trail
   */
  recordVeto(agentRole, debateId, reason) {
    return {
      type: 'veto',
      agent_role: agentRole,
      debate_id: debateId,
      reason,
      timestamp: new Date().toISOString(),
      authority: this.getAuthority(agentRole),
    };
  }

  /**
   * Lister les agents avec autorite veto (pour affichage)
   */
  getVetoAgents() {
    return Object.entries(this.rules)
      .filter(([, level]) => level === 'veto')
      .map(([role]) => role);
  }
}

module.exports = Governance;
