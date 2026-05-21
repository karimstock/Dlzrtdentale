/**
 * JADOMI Admin Copilot — Claude Code Headless avec streaming SSE
 * Stream les événements en temps réel vers le client (tool calls, tokens, résultat)
 */
const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

const ADMIN_EMAIL = 'karim_bahmed@yahoo.fr';
const MAX_BUDGET = 5.00;
const TIMEOUT_MS = 120000;

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
    req.userEmail = user.email;
    next();
  } catch { return res.status(401).json({ error: 'Auth échouée' }); }
}

/**
 * POST /api/admin-copilot/stream
 * SSE streaming — envoie les événements Claude Code en temps réel
 */
router.post('/stream', requireAdmin, (req, res) => {
  const { message } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message requis' });
  }

  console.log(`[ADMIN-COPILOT] Stream: "${message.substring(0, 60)}..."`);

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const args = [
    '-p', message.trim(),
    '--output-format', 'stream-json',
    '--verbose',
    '--model', 'sonnet',
    '--max-budget-usd', String(MAX_BUDGET),
    '--dangerously-skip-permissions',
    '--no-session-persistence',
  ];

  const child = spawn('claude', args, {
    cwd: '/home/ubuntu/jadomi',
    env: { ...process.env, HOME: '/home/ubuntu' },
    timeout: TIMEOUT_MS,
  });

  let buffer = '';

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Garder la dernière ligne incomplète

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        const sseEvent = transformEvent(event);
        if (sseEvent) {
          res.write(`data: ${JSON.stringify(sseEvent)}\n\n`);
        }
      } catch { /* ligne incomplète, ignorer */ }
    }
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) {
      res.write(`data: ${JSON.stringify({ type: 'log', text })}\n\n`);
    }
  });

  child.on('close', (code) => {
    res.write(`data: ${JSON.stringify({ type: 'done', exitCode: code })}\n\n`);
    res.end();
  });

  child.on('error', (err) => {
    res.write(`data: ${JSON.stringify({ type: 'error', text: err.message })}\n\n`);
    res.end();
  });

  // Timeout
  const timer = setTimeout(() => {
    child.kill('SIGTERM');
    res.write(`data: ${JSON.stringify({ type: 'error', text: 'Timeout (2 min)' })}\n\n`);
    res.end();
  }, TIMEOUT_MS);

  child.on('close', () => clearTimeout(timer));

  // Client disconnect
  req.on('close', () => {
    child.kill('SIGTERM');
    clearTimeout(timer);
  });
});

/**
 * POST /api/admin-copilot/message
 * Mode classique (non-streaming) — fallback
 */
router.post('/message', requireAdmin, (req, res) => {
  const { message } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message requis' });
  }

  console.log(`[ADMIN-COPILOT] Message: "${message.substring(0, 60)}..."`);

  const args = [
    '-p', message.trim(),
    '--output-format', 'json',
    '--model', 'sonnet',
    '--max-budget-usd', String(MAX_BUDGET),
    '--dangerously-skip-permissions',
    '--no-session-persistence',
  ];

  const child = spawn('claude', args, {
    cwd: '/home/ubuntu/jadomi',
    env: { ...process.env, HOME: '/home/ubuntu' },
    timeout: TIMEOUT_MS,
  });

  let stdout = '';
  child.stdout.on('data', (d) => { stdout += d.toString(); });
  child.on('close', () => {
    try {
      const data = JSON.parse(stdout);
      res.json({
        reply: data.result || stdout.trim(),
        duration_ms: data.duration_ms || 0,
        cost_usd: data.total_cost_usd || 0,
        tokens: data.usage || {},
        model: Object.keys(data.modelUsage || {})[0] || 'sonnet',
      });
    } catch {
      res.json({ reply: stdout.trim(), duration_ms: 0, cost_usd: 0 });
    }
  });
  child.on('error', (e) => res.status(500).json({ error: e.message }));
});

/**
 * GET /api/admin-copilot/status
 */
router.get('/status', requireAdmin, (req, res) => {
  const child = spawn('claude', ['-p', 'dis OK', '--output-format', 'text', '--model', 'sonnet',
    '--dangerously-skip-permissions', '--no-session-persistence'], {
    cwd: '/home/ubuntu/jadomi', env: { ...process.env, HOME: '/home/ubuntu' }, timeout: 15000,
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d.toString(); });
  child.on('close', (code) => {
    res.json({ online: code === 0 && out.trim().length > 0, response: out.trim() });
  });
  child.on('error', () => res.json({ online: false }));
});

/**
 * Transforme un événement stream-json Claude Code en événement simplifié pour l'app
 */
function transformEvent(event) {
  switch (event.type) {
    case 'system':
      if (event.subtype === 'init') {
        return {
          type: 'init',
          model: event.model,
          tools: (event.tools || []).length,
          mcp: (event.mcp_servers || []).filter(s => s.status === 'connected').length,
        };
      }
      return null; // Skip hooks etc.

    case 'assistant':
      if (event.message?.content) {
        const textParts = event.message.content.filter(p => p.type === 'text');
        const toolParts = event.message.content.filter(p => p.type === 'tool_use');

        const parts = [];
        for (const t of textParts) {
          if (t.text) parts.push({ type: 'text', text: t.text });
        }
        for (const t of toolParts) {
          parts.push({
            type: 'tool_call',
            tool: t.name,
            input: summarizeToolInput(t.name, t.input),
          });
        }

        const usage = event.message.usage || {};
        return {
          type: 'assistant',
          parts,
          tokens: {
            input: usage.input_tokens || 0,
            output: usage.output_tokens || 0,
            cache_read: usage.cache_read_input_tokens || 0,
            cache_create: usage.cache_creation_input_tokens || 0,
          },
        };
      }
      return null;

    case 'tool_result':
      return {
        type: 'tool_result',
        tool: event.tool_name || 'unknown',
        success: !event.is_error,
        preview: (event.content || '').toString().substring(0, 200),
      };

    case 'result':
      return {
        type: 'result',
        text: event.result || '',
        duration_ms: event.duration_ms || 0,
        cost_usd: event.total_cost_usd || 0,
        tokens: event.usage || {},
        model: Object.keys(event.modelUsage || {})[0] || 'sonnet',
        turns: event.num_turns || 1,
      };

    default:
      return null;
  }
}

function summarizeToolInput(name, input) {
  if (!input) return '';
  switch (name) {
    case 'Read': return input.file_path || '';
    case 'Edit': return input.file_path || '';
    case 'Write': return input.file_path || '';
    case 'Bash': return (input.command || '').substring(0, 80);
    case 'Grep': return `"${input.pattern}" ${input.path || ''}`.substring(0, 80);
    case 'Glob': return input.pattern || '';
    case 'WebSearch': return input.query || '';
    case 'WebFetch': return input.url || '';
    case 'Agent': return input.description || '';
    default: return JSON.stringify(input).substring(0, 60);
  }
}

module.exports = router;
