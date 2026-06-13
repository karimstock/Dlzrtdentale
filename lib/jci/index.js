'use strict';
/**
 * JCI — JADOMI Core Intelligence
 *
 * Systeme d'exploitation d'intelligence collective.
 * Moteur generique, zero vocabulaire metier.
 * Les metiers sont des plugins JSON au-dessus.
 *
 * Briques :
 *   graph      — Knowledge Graph generique (nodes + edges)
 *   debate     — Moteur de contradiction structuree (7 phases)
 *   trust      — Score de confiance + "no action"
 *   reputation — Score/poids par agent, auto-ajustement
 *   governance — Niveaux d'autorite, veto, escalade
 *   audit      — Audit periodique, biais, rapport
 *   decision   — Cycle de vie complet d'une decision
 *   plugins    — Chargeur de configs metier
 */

module.exports = {
  GraphEngine:      require('./graph-engine'),
  DebateEngine:     require('./debate-engine'),
  TrustEngine:      require('./trust-engine'),
  ReputationEngine: require('./reputation-engine'),
  Governance:       require('./governance'),
  AuditEngine:      require('./audit-engine'),
  DecisionEngine:   require('./decision-engine'),
  plugins:          require('./plugin-loader'),
};
