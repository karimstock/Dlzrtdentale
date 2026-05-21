/**
 * JADOMI Admin Copilot — Claude Code Headless
 * Endpoint sécurisé : seul l'admin (karim_bahmed@yahoo.fr) peut l'utiliser.
 * Lance Claude Code en mode headless sur le VPS et renvoie la réponse.
 */
const express = require('express');
const router = express.Router();
const { execFile } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

const ADMIN_EMAIL = 'karim_bahmed@yahoo.fr';
const MAX_BUDGET = 5.00; // Sécurité anti-boucle (inclus dans l'abonnement Max)
const TIMEOUT_MS = 120000; // 2 min max

let _admin = null;
function admin() {
  if (!_admin) {
    _admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

// Middleware : admin seulement
async function requireAdmin(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requis' });
    const { data: { user }, error } = await admin().auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Token invalide' });
    if (user.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Accès réservé à l\'administrateur' });
    }
    req.userId = user.id;
    req.userEmail = user.email;
    next();
  } catch {
    return res.status(401).json({ error: 'Authentification échouée' });
  }
}

/**
 * POST /api/admin-copilot/message
 * Body : { message: string }
 * Réponse : { reply: string, duration_ms: number, cost_usd: number }
 */
router.post('/message', requireAdmin, async (req, res) => {
  const { message } = req.body || {};
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message requis' });
  }

  const prompt = message.trim();
  console.log(`[ADMIN-COPILOT] ${req.userEmail} : "${prompt.substring(0, 80)}..."`);

  try {
    const result = await runClaudeCode(prompt);
    console.log(`[ADMIN-COPILOT] Réponse en ${result.duration_ms}ms ($${result.cost_usd.toFixed(4)})`);
    res.json({
      reply: result.text,
      duration_ms: result.duration_ms,
      cost_usd: result.cost_usd,
      model: result.model || 'claude',
    });
  } catch (e) {
    console.error('[ADMIN-COPILOT] Erreur:', e.message);
    res.status(500).json({ error: e.message || 'Erreur Claude Code' });
  }
});

/**
 * GET /api/admin-copilot/status
 * Vérifie que Claude Code est disponible
 */
router.get('/status', requireAdmin, async (req, res) => {
  try {
    const result = await runClaudeCode('Dis juste: OK');
    res.json({ online: true, response: result.text, cost_usd: result.cost_usd });
  } catch (e) {
    res.json({ online: false, error: e.message });
  }
});

function runClaudeCode(prompt) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p', prompt,
      '--output-format', 'json',
      '--max-budget-usd', String(MAX_BUDGET),
      '--dangerously-skip-permissions',
      '--no-session-persistence',
      '--model', 'sonnet', // Sonnet = 5x plus rapide qu'Opus, suffisant pour les commandes admin
    ];

    const child = execFile('claude', args, {
      cwd: '/home/ubuntu/jadomi',
      timeout: TIMEOUT_MS,
      maxBuffer: 5 * 1024 * 1024, // 5MB
      env: { ...process.env, HOME: '/home/ubuntu' },
    }, (error, stdout, stderr) => {
      if (error && !stdout) {
        return reject(new Error(error.message || 'Claude Code timeout'));
      }

      try {
        // Essayer de parser le JSON
        const data = JSON.parse(stdout);
        if (data.is_error) {
          return reject(new Error(data.errors?.[0] || 'Erreur Claude Code'));
        }
        resolve({
          text: data.result || stdout,
          duration_ms: data.duration_ms || 0,
          cost_usd: data.total_cost_usd || 0,
          model: Object.keys(data.modelUsage || {})[0] || 'claude',
        });
      } catch {
        // Si pas du JSON, renvoyer le texte brut
        resolve({
          text: stdout.trim(),
          duration_ms: 0,
          cost_usd: 0,
          model: 'claude',
        });
      }
    });
  });
}

module.exports = router;
