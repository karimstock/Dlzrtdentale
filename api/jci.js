'use strict';
/**
 * JCI — REST API
 *
 * Points d'entree HTTP pour le moteur d'intelligence collective.
 * Monte dans server.js : app.use('/api/jci', require('./api/jci'))
 *
 * Routes :
 *   GET  /plugins                    — lister les plugins disponibles
 *   GET  /plugins/:name              — detail d'un plugin
 *
 *   POST /decide                     — lancer une decision
 *   POST /decide/:debateId/opinion   — soumettre une opinion
 *   POST /decide/:debateId/contradict — soumettre une contradiction
 *   POST /decide/:debateId/finalize  — finaliser une decision
 *   POST /decisions/:id/feedback     — feedback post-decision
 *   POST /decisions/:id/approve      — approuver une decision
 *   POST /decisions/:id/reject       — rejeter une decision
 *   GET  /decisions                  — lister les decisions
 *
 *   GET  /debates                    — lister les debats
 *   GET  /debates/:id               — detail d'un debat + opinions
 *
 *   POST /graph/nodes               — ajouter un node
 *   GET  /graph/nodes               — lister les nodes
 *   POST /graph/edges               — ajouter une edge
 *   GET  /graph/edges               — lister les edges
 *   GET  /graph/neighbors/:nodeId   — voisinage d'un node
 *   GET  /graph/stats               — stats du graphe
 *
 *   GET  /reputation                — leaderboard agents
 *   GET  /reputation/:role          — reputation d'un agent
 *
 *   POST /audit                     — lancer un audit
 *   GET  /audit/reports             — lister les rapports
 *   GET  /audit/reports/:id         — detail d'un rapport
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const { loadPlugin, listPlugins } = require('../lib/jci/plugin-loader');
const GraphEngine = require('../lib/jci/graph-engine');
const DebateEngine = require('../lib/jci/debate-engine');
const DecisionEngine = require('../lib/jci/decision-engine');
const ReputationEngine = require('../lib/jci/reputation-engine');
const AuditEngine = require('../lib/jci/audit-engine');

// Instances
const graph = new GraphEngine();
const reputation = new ReputationEngine();
const audit = new AuditEngine();

// === AUTH MIDDLEWARE ===
let _admin = null;
function admin() {
  if (!_admin) {
    _admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

async function requireAuth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requis' });
    const { data: { user }, error } = await admin().auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Token invalide' });
    req.userId = user.id;

    // Societe (meme pattern que le reste du projet)
    const societeId = req.headers['x-societe-id'];
    if (societeId) {
      const { data: role } = await admin().from('user_societe_roles')
        .select('societe_id').eq('user_id', user.id).eq('societe_id', societeId).single();
      if (role) req.societeId = role.societe_id;
    }
    if (!req.societeId) {
      const { data: first } = await admin().from('user_societe_roles')
        .select('societe_id').eq('user_id', user.id).limit(1).single();
      if (first) req.societeId = first.societe_id;
    }
    if (!req.societeId) return res.status(400).json({ error: 'Aucune organisation' });
    next();
  } catch { return res.status(401).json({ error: 'Authentification echouee' }); }
}

// ═══════════════════════════════════════
// PLUGINS
// ═══════════════════════════════════════

router.get('/plugins', (req, res) => {
  try {
    const names = listPlugins();
    const plugins = names.map(name => {
      try {
        const p = loadPlugin(name);
        return { name: p.name, label: p.label, version: p.version, agents: p.agents?.length || 0 };
      } catch { return { name, error: 'invalide' }; }
    });
    res.json({ plugins });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/plugins/:name', (req, res) => {
  try {
    const plugin = loadPlugin(req.params.name);
    res.json(plugin);
  } catch (e) { res.status(404).json({ error: e.message }); }
});

// ═══════════════════════════════════════
// DECISIONS
// ═══════════════════════════════════════

router.post('/decide', requireAuth, async (req, res) => {
  try {
    const { question, context, urgency, plugin: pluginName, agents } = req.body;
    if (!question) return res.status(400).json({ error: 'question requise' });

    // Charger le plugin si specifie
    let plugin = null;
    if (pluginName) {
      try { plugin = loadPlugin(pluginName); } catch { /* pas grave */ }
    }

    const engine = new DecisionEngine(plugin);
    const result = await engine.decide(req.societeId, { question, context, urgency, agents });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/decide/:debateId/opinion', requireAuth, async (req, res) => {
  try {
    const { agent_role, opinion, position, confidence, data } = req.body;
    const debate = new DebateEngine();
    const result = await debate.submitOpinion(req.params.debateId, {
      agent_role, opinion, position, confidence, data
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/decide/:debateId/contradict', requireAuth, async (req, res) => {
  try {
    const { agent_role, opinion, targets, data } = req.body;
    const debate = new DebateEngine();
    const result = await debate.submitContradiction(req.params.debateId, {
      agent_role, opinion, targets, data
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/decide/:debateId/finalize', requireAuth, async (req, res) => {
  try {
    const { decision, plugin: pluginName } = req.body;
    let plugin = null;
    if (pluginName) {
      try { plugin = loadPlugin(pluginName); } catch { /* */ }
    }
    const engine = new DecisionEngine(plugin);
    const result = await engine.finalizeDecision(req.societeId, req.params.debateId, decision);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/decisions/:id/feedback', requireAuth, async (req, res) => {
  try {
    const { outcome, correct, notes } = req.body;
    const engine = new DecisionEngine();
    const result = await engine.feedback(req.params.id, { outcome, correct, notes });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/decisions/:id/approve', requireAuth, async (req, res) => {
  try {
    const engine = new DecisionEngine();
    const result = await engine.approve(req.params.id);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/decisions/:id/reject', requireAuth, async (req, res) => {
  try {
    const { reason } = req.body;
    const engine = new DecisionEngine();
    const result = await engine.reject(req.params.id, reason);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/decisions', requireAuth, async (req, res) => {
  try {
    const { action, approved, limit } = req.query;
    const engine = new DecisionEngine();
    const decisions = await engine.listDecisions(req.societeId, {
      action, approved: approved !== undefined ? approved === 'true' : undefined, limit: parseInt(limit) || 20
    });
    res.json({ decisions });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════
// DEBATES
// ═══════════════════════════════════════

router.get('/debates', requireAuth, async (req, res) => {
  try {
    const { status, limit } = req.query;
    const debate = new DebateEngine();
    const debates = await debate.listDebates(req.societeId, { status, limit: parseInt(limit) || 20 });
    res.json({ debates });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/debates/:id', requireAuth, async (req, res) => {
  try {
    const debate = new DebateEngine();
    const d = await debate.getDebate(req.params.id);
    if (!d) return res.status(404).json({ error: 'Debat introuvable' });
    const opinions = await debate.getOpinions(req.params.id);
    res.json({ ...d, opinions });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════
// KNOWLEDGE GRAPH
// ═══════════════════════════════════════

router.post('/graph/nodes', requireAuth, async (req, res) => {
  try {
    const { type, label, data } = req.body;
    const node = await graph.addNode(req.societeId, { type, label, data });
    res.json(node);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/graph/nodes', requireAuth, async (req, res) => {
  try {
    const { type, search, limit } = req.query;
    const nodes = await graph.getNodes(req.societeId, { type, search, limit: parseInt(limit) || 50 });
    res.json({ nodes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/graph/edges', requireAuth, async (req, res) => {
  try {
    const { from_node, to_node, relation, weight, data } = req.body;
    const edge = await graph.addEdge(req.societeId, { from_node, to_node, relation, weight, data });
    res.json(edge);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/graph/edges', requireAuth, async (req, res) => {
  try {
    const { nodeId, relation, direction } = req.query;
    const edges = await graph.getEdges(req.societeId, { nodeId, relation, direction });
    res.json({ edges });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/graph/neighbors/:nodeId', requireAuth, async (req, res) => {
  try {
    const depth = parseInt(req.query.depth) || 1;
    const result = await graph.neighbors(req.societeId, req.params.nodeId, depth);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/graph/stats', requireAuth, async (req, res) => {
  try {
    const stats = await graph.stats(req.societeId);
    res.json({ stats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════
// REPUTATION
// ═══════════════════════════════════════

router.get('/reputation', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const board = await reputation.leaderboard(limit);
    res.json({ leaderboard: board });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/reputation/:role', async (req, res) => {
  try {
    const rep = await reputation.getReputation(req.params.role);
    if (!rep) return res.status(404).json({ error: 'Agent inconnu' });
    res.json(rep);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════
// AUDIT
// ═══════════════════════════════════════

router.post('/audit', requireAuth, async (req, res) => {
  try {
    const { periodDays } = req.body;
    const result = await audit.weeklyAudit(req.societeId, periodDays || 7);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/audit/reports', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const reports = await audit.listReports(req.societeId, limit);
    res.json({ reports });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/audit/reports/:id', requireAuth, async (req, res) => {
  try {
    const report = await audit.getReport(req.params.id);
    res.json(report);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
