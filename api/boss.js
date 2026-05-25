/**
 * JADOMI Boss — API pour piloter la queue de tâches depuis JADOMI Code
 */
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const ADMIN_EMAIL = 'karim_bahmed@yahoo.fr';
let _sb = null;
function sb() {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  return _sb;
}

async function requireAdmin(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requis' });
    const { data: { user }, error } = await sb().auth.getUser(token);
    if (error || !user || user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only' });
    next();
  } catch { return res.status(401).json({ error: 'Auth' }); }
}

// POST /api/boss/add — Ajouter une tâche à la queue
router.post('/add', requireAdmin, async (req, res) => {
  const { team, title, prompt, model, priority, needs_approval, parent_id } = req.body || {};
  if (!title || !prompt) return res.status(400).json({ error: 'title et prompt requis' });

  const { data, error } = await sb().from('jadomi_task_queue').insert({
    team: team || 'dev',
    title,
    prompt,
    model: model || 'sonnet',
    priority: priority || 5,
    needs_approval: needs_approval !== false, // default true = safe
    parent_id: parent_id || null,
    status: parent_id ? 'paused' : 'pending',
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  console.log(`[BOSS] Tâche ajoutée: [${team||'dev'}] "${title}" (priority ${priority||5})`);
  res.json({ success: true, task: data });
});

// POST /api/boss/batch — Ajouter plusieurs tâches (pipeline)
router.post('/batch', requireAdmin, async (req, res) => {
  const { tasks } = req.body || {};
  if (!tasks || !tasks.length) return res.status(400).json({ error: 'tasks array requis' });

  const results = [];
  let prevId = null;

  for (const t of tasks) {
    const { data, error } = await sb().from('jadomi_task_queue').insert({
      team: t.team || 'dev',
      title: t.title,
      prompt: t.prompt,
      model: t.model || 'sonnet',
      priority: t.priority || 5,
      needs_approval: t.needs_approval !== false,
      parent_id: t.depends_on_previous ? prevId : null,
      status: t.depends_on_previous && prevId ? 'paused' : 'pending',
    }).select().single();

    if (data) { results.push(data); prevId = data.id; }
  }

  console.log(`[BOSS] Batch: ${results.length} tâches ajoutées`);
  res.json({ success: true, tasks: results });
});

// GET /api/boss/queue — Voir la queue
router.get('/queue', requireAdmin, async (req, res) => {
  const { data } = await sb().from('jadomi_task_queue')
    .select('id,team,title,status,priority,needs_approval,tokens_used,duration_ms,result_summary,error,created_at,started_at,completed_at')
    .order('created_at', { ascending: false })
    .limit(30);
  res.json({ tasks: data || [] });
});

// POST /api/boss/approve/:id — Approuver une tâche en review
router.post('/approve/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { data, error } = await sb().from('jadomi_task_queue').update({
    status: 'done',
    approved_at: new Date().toISOString()
  }).eq('id', id).eq('status', 'review').select().single();

  if (error || !data) return res.status(400).json({ error: 'Tâche non trouvée ou pas en review' });

  // Unblock children
  await sb().from('jadomi_task_queue').update({ status: 'pending' }).eq('parent_id', id).eq('status', 'paused');

  console.log(`[BOSS] Approuvé: "${data.title}"`);
  res.json({ success: true, task: data });
});

// POST /api/boss/reject/:id — Rejeter une tâche + feedback loop (learnings)
router.post('/reject/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};
  const rejectReason = reason || 'par le fondateur';

  // 1. Fetch the task before updating (for learning context)
  const { data: task } = await sb().from('jadomi_task_queue')
    .select('*').eq('id', id).single();

  // 2. Update task status
  await sb().from('jadomi_task_queue').update({
    status: 'failed',
    error: 'Rejeté: ' + rejectReason,
    completed_at: new Date().toISOString()
  }).eq('id', id);

  // 3. Feedback loop — save learnings from rejection
  if (task) {
    const memory = require('../lib/boss/collective-memory');
    const team = task.team || 'general';

    // Learning 1: error — record what was rejected and why
    await memory.recordLearning({
      team,
      type: 'error',
      title: 'Rejet humain: ' + task.title,
      description: 'Raison du rejet: ' + rejectReason + '\nPrompt original: ' + (task.prompt || '').substring(0, 300),
      tags: ['rejet', 'humain', team],
      confidence: 0.95,
      taskId: task.id,
    });

    // Learning 2: rule — extract avoidance pattern for this team
    await memory.recordLearning({
      team,
      type: 'rule',
      title: 'Règle après rejet [' + team + ']: éviter ce pattern',
      description: 'Pour les tâches de type ' + team + ', éviter: ' + rejectReason + ' (tâche rejetée: ' + task.title + ')',
      tags: ['rule', 'rejet', team],
      confidence: 0.9,
      taskId: task.id,
    });

    console.log(`[BOSS] Rejeté + 2 learnings enregistrés: "${task.title}" — ${rejectReason}`);
  }

  res.json({ success: true });
});

// POST /api/boss/pause — Pause le daemon (met toutes les pending en paused)
router.post('/pause', requireAdmin, async (req, res) => {
  const { data } = await sb().from('jadomi_task_queue').update({ status: 'paused' }).eq('status', 'pending').select('id');
  res.json({ success: true, paused: (data || []).length });
});

// POST /api/boss/resume — Reprend (remet les paused sans parent en pending)
router.post('/resume', requireAdmin, async (req, res) => {
  const { data } = await sb().from('jadomi_task_queue').update({ status: 'pending' }).eq('status', 'paused').is('parent_id', null).select('id');
  res.json({ success: true, resumed: (data || []).length });
});

// GET /api/boss/stats — Stats rapides
router.get('/stats', requireAdmin, async (req, res) => {
  const counts = {};
  for (const s of ['pending', 'running', 'review', 'done', 'failed', 'paused']) {
    const { count } = await sb().from('jadomi_task_queue').select('*', { count: 'exact', head: true }).eq('status', s);
    counts[s] = count || 0;
  }
  res.json(counts);
});

// POST /api/boss/save-session — Sauvegarde auto de session
router.post('/save-session', requireAdmin, async (req, res) => {
  try {
    const { session_name, messages } = req.body || {};
    if (!messages || !messages.length) return res.status(400).json({ error: 'messages requis' });

    const sessionMemory = require('../lib/brain/session-memory');
    await sessionMemory.summarizeAndSave(messages, session_name || 'Session anonyme');
    res.json({ success: true });
  } catch (e) {
    console.error('[BOSS] save-session error:', e.message);
    res.json({ success: false, error: e.message });
  }
});

// GET /api/boss/learnings — 10 derniers learnings
router.get('/learnings', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await sb().from('jadomi_learnings')
      .select('id,team,type,title,description,confidence,created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ learnings: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/boss/analytics — Stats agregees pour le dashboard
router.get('/analytics', requireAdmin, async (req, res) => {
  try {
    const { data: allTasks } = await sb().from('jadomi_task_queue')
      .select('id,team,status,tokens_used,duration_ms,created_at');

    const tasks = allTasks || [];
    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'done').length;
    const running = tasks.filter(t => t.status === 'running').length;
    const successRate = total > 0 ? Math.round((done / total) * 1000) / 10 : 0;

    const durations = tasks.filter(t => t.duration_ms > 0).map(t => t.duration_ms);
    const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 1000 * 10) / 10 : 0;

    const totalTokens = tasks.reduce((sum, t) => sum + (t.tokens_used || 0), 0);

    const byStatus = {};
    for (const s of ['pending', 'running', 'review', 'done', 'failed', 'paused']) {
      byStatus[s] = tasks.filter(t => t.status === s).length;
    }

    const byTeam = {};
    for (const t of tasks) {
      const team = t.team || 'dev';
      byTeam[team] = (byTeam[team] || 0) + 1;
    }

    const { count: learningsCount } = await sb().from('jadomi_learnings').select('*', { count: 'exact', head: true });

    res.json({
      total, done, running, successRate, avgDuration, totalTokens,
      learningsCount: learningsCount || 0,
      byStatus, byTeam
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/boss/schedules — Liste des planifications cron
router.get('/schedules', requireAdmin, async (req, res) => {
  try {
    const cron = require('../lib/boss/cron');
    res.json({ schedules: cron.getSchedules() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/boss/schedules — Ajouter/modifier une planification
router.post('/schedules', requireAdmin, async (req, res) => {
  try {
    const { name, team, cron: cronExpr, prompt, priority } = req.body || {};
    if (!name || !cronExpr || !prompt) return res.status(400).json({ error: 'name, cron et prompt requis' });

    const cronMod = require('../lib/boss/cron');
    const schedules = cronMod.addSchedule({ name, team, cron: cronExpr, prompt, priority });
    console.log(`[BOSS] Planification ajoutée/modifiée: "${name}" (${cronExpr})`);
    res.json({ success: true, schedules });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
