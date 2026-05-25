/**
 * JADOMI Code — Mode Multi-Agents (Orchestrateur + Workers parallèles)
 *
 * Flow:
 * 1. User envoie une tâche complexe
 * 2. Orchestrateur (haiku, rapide) découpe en sous-tâches JSON
 * 3. N workers (sonnet) exécutent en parallèle, chacun streame via SSE
 * 4. Frontend affiche N panneaux en temps réel
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
let brain;
try { brain = require('../lib/brain'); } catch(e) { brain = null; }

const ADMIN_EMAIL = 'karim_bahmed@yahoo.fr';
const MAX_WORKERS = 4;
const TIMEOUT_MS = 180000; // 3 min per worker

let _admin = null;
function admin() {
  if (!_admin) {
    _admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

async function requireAdmin(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requis' });
    const { data: { user }, error } = await admin().auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Token invalide' });
    if (user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only' });
    req.userId = user.id;
    next();
  } catch { return res.status(401).json({ error: 'Auth échouée' }); }
}

/**
 * POST /api/admin-copilot/multi/plan
 * Phase 1: L'orchestrateur analyse la tâche et retourne un plan de sous-tâches
 */
router.post('/plan', requireAdmin, async (req, res) => {
  const { task, context } = req.body || {};
  if (!task) return res.status(400).json({ error: 'Task requis' });

  // Build smart context from Brain
  let brainContext = '';
  if (brain && brain.buildContext) {
    try { brainContext = await brain.buildContext(task); } catch(e) { brainContext = ''; }
  }

  const planPrompt = `Tu es un orchestrateur de projet. Analyse cette tâche et décompose-la en sous-tâches INDÉPENDANTES qui peuvent être exécutées EN PARALLÈLE par des agents séparés.

TÂCHE: ${task}

${context ? 'CONTEXTE: ' + context : ''}

Réponds UNIQUEMENT en JSON valide, sans markdown, sans explication :
{
  "plan_summary": "résumé en 1 ligne",
  "tasks": [
    {
      "id": 1,
      "title": "titre court",
      "prompt": "instruction détaillée et autonome pour l'agent (il n'a pas le contexte des autres tâches)",
      "model": "sonnet",
      "priority": "high|medium|low"
    }
  ]
}

Règles:
- Maximum ${MAX_WORKERS} sous-tâches
- Chaque tâche doit être AUTONOME (l'agent ne voit pas les autres)
- Inclure dans chaque prompt les chemins de fichiers si nécessaire
- Projet: /home/ubuntu/jadomi
- Préférer sonnet pour le code, haiku pour les recherches rapides

MICRO-TÂCHES OBLIGATOIRES:
- Chaque tâche doit toucher UNE SEULE section d'un fichier, pas le fichier entier
- Si le fichier cible fait plus de 50K caractères, découpe en micro-tâches par section (ex: slides 1-10, slides 11-20)
- Chaque tâche doit être faisable en moins de 5 minutes
- Maximum 20 lignes de code modifiées par tâche
- Préfère LIRE une partie ciblée (offset+limit) plutôt que tout le fichier
- Dans le prompt de chaque tâche, précise la ligne de début et de fin à modifier (ex: "lignes 120-140 du fichier X")

${brainContext}`;

  console.log(`[MULTI] Planning: "${task.substring(0, 60)}..." (brain: ${brainContext.length} chars)`);

  const child = spawn('claude', [
    '-p', planPrompt,
    '--output-format', 'text',
    '--model', 'haiku',
    '--dangerously-skip-permissions',
    '--no-session-persistence',
  ], {
    cwd: '/home/ubuntu/jadomi',
    env: { ...process.env, HOME: '/home/ubuntu', ANTHROPIC_API_KEY: '' },
    timeout: 30000,
  });

  let stdout = '';
  child.stdout.on('data', d => { stdout += d.toString(); });
  child.stderr.on('data', () => {}); // ignore

  child.on('close', () => {
    try {
      // Extract JSON from response
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return res.json({ error: 'Plan invalide', raw: stdout.substring(0, 500) });
      }
      const plan = JSON.parse(jsonMatch[0]);
      // Limit tasks
      if (plan.tasks && plan.tasks.length > MAX_WORKERS) {
        plan.tasks = plan.tasks.slice(0, MAX_WORKERS);
      }
      console.log(`[MULTI] Plan: ${plan.tasks?.length || 0} tasks`);
      res.json(plan);
    } catch (e) {
      res.json({ error: 'Parse error', raw: stdout.substring(0, 500) });
    }
  });
  child.on('error', e => res.status(500).json({ error: e.message }));
});

/**
 * POST /api/admin-copilot/multi/worker
 * Phase 2: Exécute UNE sous-tâche en streaming SSE
 * Le frontend appelle cet endpoint N fois en parallèle (1 par worker)
 */
router.post('/worker', requireAdmin, async (req, res) => {
  const { prompt, model, workerId } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Prompt requis' });

  const useModel = ['haiku', 'sonnet', 'opus'].includes(model) ? model : 'sonnet';

  // Build smart context for this specific worker
  let workerPrompt = prompt;
  if (brain && brain.buildWorkerPrompt) {
    try { workerPrompt = await brain.buildWorkerPrompt({ prompt }); } catch(e) { /* fallback to raw prompt */ }
  }

  console.log(`[MULTI] Worker #${workerId || '?'} (${useModel}): "${prompt.substring(0, 60)}..." [ctx: ${workerPrompt.length} chars]`);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Content-Encoding': 'identity',
  });

  // Send worker ID as first event
  res.write(`data: ${JSON.stringify({ type: 'worker_start', workerId, model: useModel })}\n\n`);

  const args = [
    '-p', workerPrompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--model', useModel,
    '--max-budget-usd', '5',
    '--dangerously-skip-permissions',
    '--no-session-persistence',
  ];

  const child = spawn('claude', args, {
    cwd: '/home/ubuntu/jadomi',
    env: { ...process.env, HOME: '/home/ubuntu', ANTHROPIC_API_KEY: '' },
    timeout: TIMEOUT_MS,
  });

  let buffer = '';
  child.stdout.on('data', chunk => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        const simplified = simplifyEvent(event, workerId);
        if (simplified) res.write(`data: ${JSON.stringify(simplified)}\n\n`);
      } catch {}
    }
  });

  child.stderr.on('data', chunk => {
    const text = chunk.toString().trim();
    if (text) res.write(`data: ${JSON.stringify({ type: 'log', workerId, text })}\n\n`);
  });

  child.on('close', code => {
    res.write(`data: ${JSON.stringify({ type: 'worker_done', workerId, exitCode: code })}\n\n`);
    res.end();
  });
  child.on('error', err => {
    res.write(`data: ${JSON.stringify({ type: 'error', workerId, text: err.message })}\n\n`);
    res.end();
  });

  const timer = setTimeout(() => {
    child.kill('SIGTERM');
    res.write(`data: ${JSON.stringify({ type: 'error', workerId, text: 'Timeout (3 min)' })}\n\n`);
    res.end();
  }, TIMEOUT_MS);

  child.on('close', () => clearTimeout(timer));
  req.on('close', () => { child.kill('SIGTERM'); clearTimeout(timer); });
});

function simplifyEvent(event, workerId) {
  switch (event.type) {
    case 'system':
      if (event.subtype === 'init') return { type: 'init', workerId, model: event.model, tools: (event.tools || []).length };
      return null;
    case 'assistant':
      if (!event.message?.content) return null;
      const parts = [];
      for (const p of event.message.content) {
        if (p.type === 'text' && p.text) parts.push({ type: 'text', text: p.text });
        if (p.type === 'tool_use') parts.push({ type: 'tool_call', tool: p.name, input: summarize(p.name, p.input) });
      }
      const usage = event.message.usage || {};
      return { type: 'assistant', workerId, parts, tokens: { input: usage.input_tokens || 0, output: usage.output_tokens || 0 } };
    case 'tool_result':
      return { type: 'tool_result', workerId, tool: event.tool_name, success: !event.is_error, preview: (event.content || '').toString().substring(0, 150) };
    case 'result':
      return { type: 'result', workerId, text: event.result || '', duration_ms: event.duration_ms, cost_usd: event.total_cost_usd, tokens: event.usage, model: Object.keys(event.modelUsage || {})[0] };
    default: return null;
  }
}

function summarize(name, input) {
  if (!input) return '';
  switch (name) {
    case 'Read': return input.file_path || '';
    case 'Edit': return input.file_path || '';
    case 'Write': return input.file_path || '';
    case 'Bash': return (input.command || '').substring(0, 80);
    case 'Grep': return `"${input.pattern}" ${input.path || ''}`.substring(0, 80);
    case 'Glob': return input.pattern || '';
    case 'Agent': return input.description || '';
    default: return JSON.stringify(input).substring(0, 60);
  }
}

/**
 * POST /api/admin-copilot/multi/auto-split
 * Fix #5: Auto-detect large files and split a task into micro-tasks by section
 */
router.post('/auto-split', requireAdmin, async (req, res) => {
  const { description, files } = req.body || {};
  if (!description) return res.status(400).json({ error: 'description requis' });

  const projectRoot = '/home/ubuntu/jadomi';
  const targetFiles = Array.isArray(files) ? files : [];

  // Extract file paths from description if none provided
  if (targetFiles.length === 0) {
    const fileMatches = description.match(/(?:\/home\/ubuntu\/jadomi\/|\.\/)?[\w\-./]+\.\w{1,5}/g);
    if (fileMatches) {
      for (const f of fileMatches) {
        const abs = f.startsWith('/') ? f : path.join(projectRoot, f);
        targetFiles.push(abs);
      }
    }
  }

  const result = { description, splits: [], needsSplit: false };

  for (const filePath of targetFiles) {
    try {
      const stat = fs.statSync(filePath);
      const sizeChars = stat.size;
      if (sizeChars <= 50000) {
        result.splits.push({ file: filePath, size: sizeChars, split: false, reason: 'Fichier <= 50K' });
        continue;
      }

      result.needsSplit = true;
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      // Scan for section markers (HTML comments, JS doc blocks, slide markers, function defs)
      const sectionMarkers = [];
      const sectionRegex = /^(?:\s*\/\*\*|\s*<!--\s*(?:SECTION|SLIDE|PART|BLOC|Phase|Step|Étape)|^\s*(?:function|class|router\.|app\.)\s|^\s*\/\/\s*={3,}|^\s*\/\/\s*-{3,}|^\s*#{1,3}\s)/;
      for (let i = 0; i < lines.length; i++) {
        if (sectionRegex.test(lines[i])) {
          sectionMarkers.push({ line: i + 1, text: lines[i].trim().substring(0, 80) });
        }
      }

      // Build sub-tasks from section markers (or chunk every 200 lines)
      const subTasks = [];
      if (sectionMarkers.length >= 2) {
        for (let i = 0; i < sectionMarkers.length; i++) {
          const start = sectionMarkers[i].line;
          const end = (i + 1 < sectionMarkers.length) ? sectionMarkers[i + 1].line - 1 : lines.length;
          subTasks.push({
            title: `${path.basename(filePath)} — section L${start}-L${end}`,
            prompt: `Modifie UNIQUEMENT les lignes ${start} à ${end} du fichier ${filePath}. Utilise Read avec offset=${start - 1} et limit=${end - start + 1}. ${description}`,
            offsetStart: start,
            offsetEnd: end,
            sectionHint: sectionMarkers[i].text
          });
        }
      } else {
        // No markers found — chunk every 200 lines
        const chunkSize = 200;
        for (let start = 1; start <= lines.length; start += chunkSize) {
          const end = Math.min(start + chunkSize - 1, lines.length);
          subTasks.push({
            title: `${path.basename(filePath)} — lignes L${start}-L${end}`,
            prompt: `Modifie UNIQUEMENT les lignes ${start} à ${end} du fichier ${filePath}. Utilise Read avec offset=${start - 1} et limit=${end - start + 1}. ${description}`,
            offsetStart: start,
            offsetEnd: end,
            sectionHint: null
          });
        }
      }

      result.splits.push({
        file: filePath,
        size: sizeChars,
        totalLines: lines.length,
        split: true,
        sectionsFound: sectionMarkers.length,
        subTasks
      });
    } catch (e) {
      result.splits.push({ file: filePath, split: false, error: e.message });
    }
  }

  res.json(result);
});


/**
 * POST /api/admin-copilot/multi/pipeline
 * Fix #7: Create a chain of dependent tasks (pipeline)
 * Each step depends on the previous one (parent_id chaining, status 'paused' until parent done)
 */
router.post('/pipeline', requireAdmin, async (req, res) => {
  const { steps } = req.body || {};
  if (!Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ error: 'steps[] requis (tableau non vide)' });
  }

  const sb = admin();
  const createdTasks = [];
  let previousId = null;

  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step.title || !step.prompt) {
        return res.status(400).json({ error: `Step ${i}: title et prompt requis` });
      }

      const isFirst = (i === 0);
      const taskRow = {
        title: step.title,
        prompt: step.prompt,
        team: step.team || 'dev',
        status: isFirst ? 'pending' : 'paused',
        parent_id: previousId,
        pipeline_index: i,
        priority: step.priority || 'medium',
        created_by: req.userId,
        created_at: new Date().toISOString()
      };

      const { data, error } = await sb
        .from('jadomi_task_queue')
        .insert(taskRow)
        .select('id, title, status, parent_id, pipeline_index')
        .single();

      if (error) {
        console.error(`[PIPELINE] Insert step ${i} failed:`, error.message);
        return res.status(500).json({ error: `Insert step ${i} échoué: ${error.message}`, created: createdTasks });
      }

      createdTasks.push(data);
      previousId = data.id;
    }

    console.log(`[PIPELINE] Created ${createdTasks.length} chained tasks`);
    res.json({
      pipeline: true,
      count: createdTasks.length,
      tasks: createdTasks
    });
  } catch (e) {
    console.error('[PIPELINE] Error:', e.message);
    res.status(500).json({ error: e.message, created: createdTasks });
  }
});


module.exports = router;
