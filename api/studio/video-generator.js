// =============================================
// JADOMI Studio — Video Generator API (Vidu)
// Endpoints pour generation video IA via Vidu
// Anti-gaspillage : estimation + confirmation obligatoire
// =============================================

const express = require('express');
const router = express.Router();
const https = require('https');
const fs = require('fs');
require('dotenv').config();

const VIDU_KEY = process.env.VIDU_API_KEY;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const SPENDING_LOG = '/tmp/vidu-spending.log';

// ── Helper : HTTPS request (pas axios) ──
function viduRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.vidu.com',
      path: '/ent/v2' + path,
      method,
      headers: {
        'Authorization': 'Bearer ' + VIDU_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    };
    if (payload) {
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error('Vidu API ' + res.statusCode + ': ' + (parsed.message || data.substring(0, 300))));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error('Vidu API parse error: ' + data.substring(0, 300)));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Vidu API timeout')); });
    if (payload) req.end(payload);
    else req.end();
  });
}

function deepseekRequest(messages) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'deepseek-chat',
      messages: messages,
      max_tokens: 500,
      temperature: 0.7,
    });
    const options = {
      hostname: 'api.deepseek.com',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + DEEPSEEK_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error('DeepSeek API ' + res.statusCode + ': ' + (parsed.error?.message || data.substring(0, 300))));
          } else {
            const content = parsed.choices && parsed.choices[0] && parsed.choices[0].message
              ? parsed.choices[0].message.content
              : '';
            resolve(content);
          }
        } catch (e) {
          reject(new Error('DeepSeek parse error: ' + data.substring(0, 300)));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('DeepSeek API timeout')); });
    req.end(payload);
  });
}

// ── Pricing Vidu (identique au provider) ──
function estimateCost(options) {
  const duration = options.duration || 5;
  const model = options.model || 'q3-turbo';
  const resolution = options.resolution || '720p';
  const type = options.type || 'text2video';

  const pricing = {
    'q3-pro-1080p':   { credits: 30, usd: 0.15, offCredits: 15, offUsd: 0.075 },
    'q3-pro-720p':    { credits: 25, usd: 0.125, offCredits: 13, offUsd: 0.065 },
    'q3-pro-540p':    { credits: 10, usd: 0.05, offCredits: 5, offUsd: 0.025 },
    'q3-turbo-1080p': { credits: 14, usd: 0.07, offCredits: 7, offUsd: 0.035 },
    'q3-turbo-720p':  { credits: 12, usd: 0.06, offCredits: 6, offUsd: 0.03 },
    'q3-turbo-540p':  { credits: 8, usd: 0.04, offCredits: 4, offUsd: 0.02 },
  };

  const key = model + '-' + resolution;
  const rate = pricing[key] || pricing['q3-turbo-720p'];

  const usd = duration * rate.usd;
  const credits = duration * rate.credits;
  const offPeakUsd = duration * (rate.offUsd || rate.usd);
  const tokens_jadomi = Math.max(10, Math.ceil(usd / 0.05));

  return {
    credits,
    usd: Math.round(usd * 1000) / 1000,
    tokens_jadomi,
    off_peak_usd: Math.round(offPeakUsd * 1000) / 1000,
    duration,
    model,
    resolution,
  };
}

// ── Logging ──
function logSpending(entry) {
  try {
    const line = JSON.stringify({
      ...entry,
      timestamp: new Date().toISOString(),
    }) + '\n';
    fs.appendFileSync(SPENDING_LOG, line);
  } catch (e) {
    console.error('[VIDU] Log spending error:', e.message);
  }
}

// ═══════════════════════════════════════════
// ENDPOINTS
// ═══════════════════════════════════════════

// POST /estimate — Calcul du cout AVANT generation
router.post('/estimate', (req, res) => {
  try {
    const { type, duration, resolution, model } = req.body;
    const cost = estimateCost({ type, duration, resolution, model });
    res.json({ ok: true, ...cost });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /improve-prompt — Amelioration du prompt via DeepSeek
router.post('/improve-prompt', async (req, res) => {
  try {
    if (!DEEPSEEK_KEY) {
      return res.status(500).json({ ok: false, error: 'DeepSeek API key non configuree' });
    }
    const { prompt, type, style } = req.body;
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ ok: false, error: 'Prompt requis' });
    }

    const isScript = type === 'script';
    const systemPrompt = isScript
      ? 'Tu es un copywriter expert en publicite dentaire et medicale. Genere un script video professionnel de 30 secondes. Le script doit etre en vouvoiement, percutant, avec des phrases courtes. Format : une phrase par ligne. 50-80 mots maximum. En francais. Ne retourne que le script, rien d\'autre.'
      : 'Tu es un expert en creation video IA (Vidu AI). L\'utilisateur te donne un prompt brut pour une video. Ameliore-le pour qu\'il soit parfait pour la generation video IA. Le prompt doit decrire seconde par seconde ce qui se passe. 40-60 mots max. En francais. Retourne UNIQUEMENT le prompt ameliore, rien d\'autre.';

    const userMsg = isScript
      ? 'Genere un script video pour : ' + prompt + (style ? ' | Style : ' + style : '')
      : 'Mon prompt brut : ' + prompt + (style ? ' | Style visuel souhaite : ' + style : '');

    const improved = await deepseekRequest([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg },
    ]);

    const tips = [];
    if (!isScript) {
      tips.push('Decrivez chaque seconde de la video pour un meilleur resultat.');
      tips.push('Privilegiez des mouvements de camera precis (zoom, travelling, rotation).');
      tips.push('Ajoutez des details d\'eclairage (lumiere doree, contre-jour, studio).');
    }

    res.json({
      ok: true,
      original: prompt,
      improved: improved.trim(),
      tips,
    });
  } catch (e) {
    console.error('[VIDU] improve-prompt error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /generate — Lancement de la generation Vidu
router.post('/generate', async (req, res) => {
  try {
    if (!VIDU_KEY) {
      return res.status(500).json({ ok: false, error: 'Vidu API key non configuree' });
    }

    const { type, prompt, image_url, duration, resolution, model } = req.body;
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ ok: false, error: 'Prompt requis' });
    }

    // Calcul du cout
    const genType = type || (image_url ? 'img2video' : 'text2video');
    const dur = Math.min(duration || 5, 16); // max 16s securite
    const res720 = resolution || '720';
    const mdl = model || 'q3-turbo';
    const cost = estimateCost({ type: genType, duration: dur, resolution: res720 + 'p', model: mdl });

    // Securite anti-gaspillage : bloquer > 2$
    if (cost.usd > 2) {
      return res.status(400).json({
        ok: false,
        error: 'Cout trop eleve ($' + cost.usd + '). Reduisez la duree ou la resolution.',
        cost,
      });
    }

    // Construction du body Vidu
    const viduBody = {
      type: genType === 'img2video' ? 'img2video' : 'text2video',
      model_version: mdl === 'q3-pro' ? 'q3-pro' : 'q3-turbo',
      input: {
        prompts: [{ type: 'text', content: prompt.trim() }],
      },
      output_params: {
        duration: dur,
        resolution: res720,
        aspect_ratio: '16:9',
      },
    };

    // Ajout image si img2video
    if (genType === 'img2video' && image_url) {
      viduBody.input.prompts.unshift({
        type: 'image',
        content: image_url,
      });
    }

    // Appel Vidu
    const result = await viduRequest('POST', '/tasks', viduBody);
    const taskId = result.task_id || result.id || result.generation_id;

    if (!taskId) {
      console.error('[VIDU] Pas de task_id dans la reponse:', JSON.stringify(result).substring(0, 500));
      return res.status(500).json({ ok: false, error: 'Vidu n\'a pas retourne de task_id', raw: result });
    }

    // Log la depense
    logSpending({
      task_id: taskId,
      type: genType,
      duration: dur,
      resolution: res720,
      model: mdl,
      credits: cost.credits,
      usd: cost.usd,
      tokens_jadomi: cost.tokens_jadomi,
      prompt: prompt.substring(0, 200),
    });

    res.json({
      ok: true,
      task_id: taskId,
      estimated_cost: cost,
      status: 'processing',
    });
  } catch (e) {
    console.error('[VIDU] generate error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /status/:taskId — Poll du statut
router.get('/status/:taskId', async (req, res) => {
  try {
    if (!VIDU_KEY) {
      return res.status(500).json({ ok: false, error: 'Vidu API key non configuree' });
    }

    const { taskId } = req.params;
    if (!taskId) {
      return res.status(400).json({ ok: false, error: 'taskId requis' });
    }

    const result = await viduRequest('GET', '/tasks/' + taskId);

    // Normaliser le statut
    const rawStatus = result.state || result.status || 'unknown';
    let status = 'processing';
    if (rawStatus === 'completed' || rawStatus === 'success') status = 'completed';
    else if (rawStatus === 'failed' || rawStatus === 'error') status = 'failed';
    else if (rawStatus === 'queued' || rawStatus === 'pending') status = 'queued';

    const response = {
      ok: true,
      status,
      raw_status: rawStatus,
      progress: result.progress || (status === 'completed' ? 100 : status === 'failed' ? 0 : null),
    };

    if (status === 'completed') {
      response.video_url = result.video_url || (result.output && result.output.video_url) || (result.result && result.result.video_url) || null;
      response.thumbnail_url = result.thumbnail_url || (result.output && result.output.thumbnail_url) || null;
    }

    if (status === 'failed') {
      response.error = result.error || result.message || 'Generation echouee';
    }

    res.json(response);
  } catch (e) {
    console.error('[VIDU] status error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /history — Historique des generations
router.get('/history', (req, res) => {
  try {
    if (!fs.existsSync(SPENDING_LOG)) {
      return res.json({ ok: true, history: [] });
    }

    const raw = fs.readFileSync(SPENDING_LOG, 'utf8');
    const lines = raw.trim().split('\n').filter(l => l.trim());
    const history = [];

    for (let i = lines.length - 1; i >= 0 && history.length < 50; i--) {
      try {
        history.push(JSON.parse(lines[i]));
      } catch (e) {
        // Ligne corrompue, ignorer
      }
    }

    res.json({ ok: true, history });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /balance — Solde credits Vidu
router.get('/balance', async (req, res) => {
  try {
    if (!VIDU_KEY) {
      return res.status(500).json({ ok: false, error: 'Vidu API key non configuree' });
    }

    // Recuperation du solde via l'API Vidu v2
    try {
      const result = await viduRequest('GET', '/credits');
      const metered = (result.remains || []).find(r => r.type === 'metered');
      res.json({
        ok: true,
        credit_remain: metered?.credit_remain ?? 0,
        concurrency_limit: metered?.concurrency_limit ?? 0,
        current_concurrency: metered?.current_concurrency ?? 0,
        queue_count: result.queue_count ?? 0,
      });
    } catch (apiErr) {
      // Fallback : calculer depuis les logs
      let totalSpent = 0;
      if (fs.existsSync(SPENDING_LOG)) {
        const raw = fs.readFileSync(SPENDING_LOG, 'utf8');
        const lines = raw.trim().split('\n').filter(l => l.trim());
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            totalSpent += entry.credits || 0;
          } catch (e) { /* ignore */ }
        }
      }
      res.json({
        ok: true,
        balance: null,
        total_spent_credits: totalSpent,
        note: 'Solde API indisponible, total depense calcule depuis les logs',
      });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;

// NanoBanana callback — reçoit les images générées
router.post('/callback', express.json({limit: '50mb'}), (req, res) => {
  const fs = require('fs');
  const data = req.body;
  console.log('[NanoBanana] Callback reçu:', JSON.stringify(data).substring(0, 500));
  
  // Sauvegarder le callback complet
  fs.appendFileSync('/tmp/nanobanana-callbacks.json', JSON.stringify(data) + '\n');
  
  // Si il y a des images, les télécharger
  if (data.output && data.output.image_urls) {
    data.output.image_urls.forEach((url, i) => {
      const https = require('https');
      const file = fs.createWriteStream('/home/ubuntu/jadomi/public/studio/generated/zendo-images/nano-' + Date.now() + '-' + i + '.png');
      https.get(url, r => r.pipe(file));
      console.log('[NanoBanana] Image sauvée:', url.substring(0, 80));
    });
  }
  
  res.json({ ok: true });
});
