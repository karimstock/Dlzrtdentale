// =============================================
// JADOMI AVOCAT — Chatbot IA Formation Déficab
// RAG Légifrance + Judilibre enrichi
// Streaming SSE pour UX réactive
// Accès via cookie deficab_auth uniquement
// =============================================
const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const rateLimit = require('express-rate-limit');
const { enrichWithLegalData } = require('../../lib/legal-providers/legal-rag');

let _knowledgeLoaded = false;
let DEFICAB_SYSTEM_PROMPT = '';

try {
  const kb = require('../../data/formation-deficab-knowledge');
  DEFICAB_SYSTEM_PROMPT = kb.DEFICAB_SYSTEM_PROMPT || '';
  _knowledgeLoaded = true;
} catch (err) {
  console.warn('[formation-deficab-ia] Knowledge base non trouvée, fonctionnement dégradé');
}

let _anthropic = null;
function getAnthropic() {
  if (!_anthropic) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY non définie');
    _anthropic = new Anthropic({ apiKey: key });
  }
  return _anthropic;
}
const MODEL = 'claude-sonnet-4-6';

// === RATE LIMITING : 20 messages/min par IP ===
const deficabLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de messages. Réessayez dans une minute.' }
});

// === AUTH MIDDLEWARE : cookie deficab_auth ===
function requireDeficabAuth(req, res, next) {
  const cookie = req.cookies && req.cookies.deficab_auth;
  if (cookie !== 'ok') {
    return res.status(401).json({ error: 'Accès réservé à la formation Déficab' });
  }
  next();
}

// ================================================
// GET /health — Vérifier que le module est chargé
// ================================================
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    module: 'formation-deficab-ia',
    knowledge_loaded: _knowledgeLoaded,
    model: MODEL,
    timestamp: new Date().toISOString()
  });
});

// ================================================
// POST /message — Chat IA Déficab enrichi par RAG
// Streaming SSE
// ================================================
router.post('/message', deficabLimiter, requireDeficabAuth, async (req, res) => {
  const startTime = Date.now();

  try {
    const { message, conversation } = req.body || {};

    if (!message || typeof message !== 'string' || message.trim().length < 2) {
      return res.status(400).json({ error: 'Message trop court (2 caractères minimum)' });
    }
    if (message.length > 3000) {
      return res.status(400).json({ error: 'Message trop long (3000 caractères maximum)' });
    }

    // 1. Enrichir avec des sources juridiques réelles (RAG)
    let enrichment = { sources: [], context: '', keywords: [] };
    try {
      enrichment = await enrichWithLegalData(message);
    } catch (err) {
      console.warn('[formation-deficab-ia] RAG indisponible:', err.message);
    }

    // 2. Construire le system prompt enrichi
    let systemPrompt = DEFICAB_SYSTEM_PROMPT || 'Tu es un assistant IA spécialisé en droit du travail et prud\'hommes pour la formation Déficab. Réponds de manière précise, professionnelle, sans emoji. Vouvoiement obligatoire.';

    if (enrichment.context) {
      systemPrompt += '\n\n' + enrichment.context;
    }

    // 3. Construire les messages (historique + message actuel)
    const messages = [];

    if (conversation && Array.isArray(conversation)) {
      const trimmed = conversation.slice(-20);
      for (const m of trimmed) {
        if (m.role && m.content) {
          messages.push({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: String(m.content)
          });
        }
      }
    }

    messages.push({ role: 'user', content: message.trim() });

    // 4. Streaming SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let fullReply = '';

    try {
      const stream = await getAnthropic().messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        stream: true
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta && event.delta.text) {
          const text = event.delta.text;
          fullReply += text;
          if (!res.writableEnded) {
            res.write('data: ' + JSON.stringify({ type: 'text', content: text }) + '\n\n');
          }
        }
      }

      const durationMs = Date.now() - startTime;
      const sources = enrichment.sources.map(s => ({
        type: s.type,
        titre: s.article || s.numero || s.titre || '',
        ref: s.type === 'code'
          ? (s.code + ' — Art. ' + s.article)
          : s.type === 'judilibre'
            ? ('Cass. ' + s.chambre + ', ' + s.date + ', n° ' + s.numero)
            : (s.titre || '')
      }));

      if (!res.writableEnded) {
        res.write('data: ' + JSON.stringify({
          type: 'done',
          reply: fullReply,
          sources,
          sources_count: sources.length,
          duration_ms: durationMs
        }) + '\n\n');
        res.write('data: [DONE]\n\n');
        res.end();
      }
    } catch (streamErr) {
      console.error('[formation-deficab-ia] Erreur Claude streaming:', streamErr.message);
      if (!res.writableEnded) {
        res.write('data: ' + JSON.stringify({ type: 'error', error: 'Erreur du chatbot: ' + streamErr.message }) + '\n\n');
        res.write('data: [DONE]\n\n');
        res.end();
      }
    }

  } catch (err) {
    console.error('[formation-deficab-ia]', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Erreur interne' });
    }
    if (!res.writableEnded) {
      res.write('data: ' + JSON.stringify({ type: 'error', error: 'Erreur interne' }) + '\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
});

module.exports = router;
