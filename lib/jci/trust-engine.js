'use strict';
/**
 * JCI — Trust Engine
 *
 * Calcule la confiance d'une decision.
 * Peut dire "je ne sais pas" — c'est une decision valide.
 * Peut dire "attendre" — ne rien faire est parfois optimal.
 *
 * ZERO vocabulaire metier.
 */

class TrustEngine {

  /**
   * @param {object} opts - { threshold } depuis le plugin
   *   threshold: en-dessous de ce score → no_action (defaut 0.4)
   */
  constructor(opts) {
    this.threshold = opts?.threshold || 0.4;
  }

  /**
   * Calcule le score de confiance d'une decision
   *
   * @param {object} params
   *   opinions:          [{confidence, position}] — avis des agents
   *   contradictions:    [{strength, resolved}] — objections soulevees
   *   dataQuality:       0-1 — completude des donnees d'entree
   *   agentReputations:  [{role, precision, weight}] — historique agents
   *
   * @returns {{ confidence: number, action: string, reasons: string[] }}
   *   action: 'decide' | 'no_action' | 'wait'
   */
  score({ opinions = [], contradictions = [], dataQuality = 0.5, agentReputations = [] }) {
    const reasons = [];

    // --- 1. Consensus pondere par reputation ---
    let weightedSum = 0;
    let totalWeight = 0;

    for (const op of opinions) {
      const rep = agentReputations.find(r => r.role === op.agent_role);
      const w = rep?.weight || 1.0;
      const positionScore = op.position === 'for' ? 1 : op.position === 'against' ? -1 : 0;
      weightedSum += positionScore * (op.confidence || 0.5) * w;
      totalWeight += w;
    }

    const consensusScore = totalWeight > 0 ? Math.abs(weightedSum / totalWeight) : 0;

    // --- 2. Contradictions non resolues ---
    const unresolvedCount = contradictions.filter(c => !c.resolved).length;
    const contradictionPenalty = unresolvedCount * 0.15; // -15% par contradiction non resolue

    if (unresolvedCount > 0) {
      reasons.push(`${unresolvedCount} contradiction(s) non resolue(s)`);
    }

    // --- 3. Qualite des donnees ---
    if (dataQuality < 0.3) {
      reasons.push('Donnees insuffisantes pour une decision fiable');
    }

    // --- 4. Nombre d'opinions ---
    if (opinions.length < 2) {
      reasons.push('Trop peu d\'agents pour une decision collective');
    }

    // --- 5. Score final ---
    const raw = (consensusScore * 0.4) + (dataQuality * 0.3) + ((1 - contradictionPenalty) * 0.3);
    const confidence = Math.max(0, Math.min(1, raw));

    // --- 6. Decision d'action ---
    let action;
    if (confidence < this.threshold) {
      action = 'no_action';
      reasons.push(`Confiance ${(confidence * 100).toFixed(0)}% < seuil ${(this.threshold * 100).toFixed(0)}%`);
    } else if (confidence < this.threshold + 0.15 && unresolvedCount > 0) {
      action = 'wait';
      reasons.push('Confiance limite avec contradictions ouvertes — recommandation : attendre');
    } else {
      action = 'decide';
    }

    return { confidence, action, reasons };
  }

  /**
   * "Je ne sais pas" structure
   * Enregistre que le systeme a choisi de NE PAS agir.
   * C'est une decision valide, pas un echec.
   */
  formatAbstention(confidence, reasons) {
    return {
      decision: null,
      confidence,
      action: 'no_action',
      explanation: 'Le systeme ne dispose pas d\'assez d\'elements pour recommander une action.',
      reasons,
    };
  }

  /**
   * "Attendre" structure
   */
  formatWait(confidence, reasons) {
    return {
      decision: null,
      confidence,
      action: 'wait',
      explanation: 'La meilleure action est d\'attendre plus d\'informations.',
      reasons,
    };
  }
}

module.exports = TrustEngine;
