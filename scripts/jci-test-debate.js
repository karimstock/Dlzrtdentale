'use strict';
/**
 * Test end-to-end JCI — debat complet avec le plugin dental.
 * Valide : plugin-loader -> decision-engine -> debate-engine -> trust -> governance
 *          -> persistance Supabase (jci_debates, jci_opinions, jci_decisions).
 * Aucun appel LLM : les opinions sont soumises directement (le moteur orchestre, il ne genere pas).
 */
const path = require('path');
const { loadPlugin } = require(path.resolve(__dirname, '../lib/jci/plugin-loader'));
const DecisionEngine = require(path.resolve(__dirname, '../lib/jci/decision-engine'));
const DebateEngine = require(path.resolve(__dirname, '../lib/jci/debate-engine'));

const SOCIETE = '00000000-0000-0000-0000-00000000c1c1'; // societe de test JCI
const QUESTION = "Faut-il commander 50 boites de composite Filtek maintenant alors que le fournisseur annonce +18% le mois prochain ?";

(async () => {
  const plugin = loadPlugin('dental');
  console.log(`[1] Plugin charge : ${plugin.label} — ${plugin.agents.length} agents, ${plugin.contradictory_roles.length} contradicteurs`);

  const engine = new DecisionEngine(plugin);
  const debateEng = new DebateEngine({
    maxRounds: plugin.debate.maxRounds,
    minAgents: plugin.debate.minAgents,
    trust: plugin.trust,
  });

  // --- Lancer la decision (cree le debat) ---
  const started = await engine.decide(SOCIETE, {
    question: QUESTION,
    context: { data_quality: 0.8, budget: 4200, stock_actuel: 6 },
    urgency: 'medium',
  });
  console.log(`[2] Decision lancee :`, started.status, '| debate_id =', started.debate_id);
  const debateId = started.debate_id;
  if (!debateId) throw new Error('Pas de debate_id — echec creation debat');

  // --- Phase independante : chaque agent donne son avis SEUL ---
  const opinions = [
    { agent_role: 'stock_analyst',  position: 'for',     confidence: 0.8, opinion: "Stock a 6 boites, consommation 12/mois. Rupture dans 2 semaines. Commander maintenant." },
    { agent_role: 'cost_optimizer', position: 'for',     confidence: 0.9, opinion: "Hausse +18% confirmee. Economie de 756 EUR en commandant avant. Tresorerie OK." },
    { agent_role: 'supply_chain',   position: 'neutral', confidence: 0.6, opinion: "Delai fournisseur 5j. Pas de risque rupture si commande cette semaine, mais alternative Voco moins chere existe." },
    { agent_role: 'patient_tracker',position: 'against', confidence: 0.5, opinion: "Peu de gros soins composite planifies ce trimestre, le sur-stock risque de perimer." },
  ];
  for (const op of opinions) await debateEng.submitOpinion(debateId, op);
  console.log(`[3] ${opinions.length} opinions independantes soumises`);

  // --- Phase contradiction ---
  await debateEng.submitContradiction(debateId, {
    agent_role: 'risk_assessor',
    opinion: "Risque peremption faible (DLU 24 mois). Risque financier maitrise. Pas de veto.",
    targets: ['patient_tracker'],
  });
  await debateEng.submitContradiction(debateId, {
    agent_role: 'pessimist',
    opinion: "Et si la hausse +18% n'est qu'une menace commerciale jamais appliquee ? On immobilise 4200 EUR pour rien.",
    targets: ['cost_optimizer'],
  });
  console.log(`[4] 2 contradictions soumises (dont risk_assessor = veto possible)`);

  // --- Phase debat ---
  await debateEng.submitDebateRound(debateId, {
    agent_role: 'cost_optimizer', position: 'for', round: 2, responding_to: ['pessimist'],
    opinion: "La hausse est dans la newsletter officielle datee. Probabilite >90%. L'economie couvre largement le risque.",
  });
  console.log(`[5] 1 tour de debat soumis`);

  // --- Synthese ---
  const synthesis = await debateEng.synthesize(debateId);
  console.log(`[6] Synthese : ${synthesis.positions.for} pour / ${synthesis.positions.against} contre / ${synthesis.positions.neutral} neutre`);
  console.log(`    Trust  : confidence=${(synthesis.trust.confidence * 100).toFixed(0)}% action=${synthesis.trust.action}`);
  console.log(`    Contradictions=${synthesis.contradictions_count} | tours=${synthesis.debate_rounds}`);

  // --- Finaliser ---
  const final = await engine.finalizeDecision(SOCIETE, debateId,
    "Commander 40 boites Filtek maintenant (avant la hausse), garder marge pour test alternative Voco.");
  console.log(`[7] DECISION FINALE :`);
  console.log(`    action          : ${final.action}`);
  console.log(`    confidence      : ${(final.confidence * 100).toFixed(0)}%`);
  console.log(`    needs_approval  : ${final.needs_approval} (${final.approval_reason || 'n/a'})`);
  console.log(`    decision_id     : ${final.decision_id}`);
  console.log(`\n✅ Pipeline JCI end-to-end OK — toutes les tables Supabase ont repondu.`);
  process.exit(0);
})().catch(e => { console.error('❌ ECHEC:', e.message); console.error(e.stack); process.exit(1); });
