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

// === RATE LIMITING : 20 msg/min + 50 msg/jour par IP ===
const deficabLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de messages. Réessayez dans une minute.' }
});
const deficabDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Vous avez atteint la limite de 50 questions par jour. Reprenez demain, bonne soirée !' }
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
router.post('/message', deficabDailyLimiter, deficabLimiter, requireDeficabAuth, async (req, res) => {
  const startTime = Date.now();

  try {
    const { message, conversation } = req.body || {};

    if (!message || typeof message !== 'string' || message.trim().length < 2) {
      return res.status(400).json({ error: 'Message trop court (2 caractères minimum)' });
    }
    if (message.length > 3000) {
      return res.status(400).json({ error: 'Message trop long (3000 caractères maximum)' });
    }

    // 0. Réponses gratuites — bavardage intercepté AVANT tout appel IA
    const msgLower = message.trim().toLowerCase().replace(/[^a-zàâéèêëïîôùûüç\s]/g, '');
    const GRATIS = {
      greetings: {
        match: /^(salut|hello|bonjour|bonsoir|coucou|hey|hi|yo|slt|bjr|bsr|cc)(\s|$)/,
        reply: "Bonjour Maître. Je suis à votre disposition pour toute question sur le régime social et fiscal des indemnités de rupture. N'hésitez pas à me poser une question précise."
      },
      howAreYou: {
        match: /^(ça va|sa va|comment vas|comment tu vas|comment allez|quoi de neuf|la forme)/,
        reply: "Très bien, merci. Je suis prêt à répondre à vos questions sur la formation Déficab. Quel point souhaitez-vous approfondir ?"
      },
      thanks: {
        match: /^(merci|thanks|thx|ok merci|super merci|parfait merci)/,
        reply: "Je vous en prie. N'hésitez pas si vous avez d'autres questions sur les indemnités de rupture."
      },
      bye: {
        match: /^(au revoir|bye|bonne nuit|bonne soirée|à bientôt|a plus|ciao|salut$)/,
        reply: "Bonne continuation, Maître. Je reste disponible si besoin."
      },
      whoAreYou: {
        match: /^(tu es qui|t es qui|qui es tu|cest quoi|c est quoi jadomi)/,
        reply: "Je suis l'assistant JADOMI spécialisé dans le régime social et fiscal des indemnités de rupture, formé sur la méthode de Maître Boudin (Déficab). Posez-moi vos questions sur les calculs d'exonération, les montages transactionnels, les PV de conciliation, ou tout point de la formation."
      }
    };
    for (const [, g] of Object.entries(GRATIS)) {
      if (g.match.test(msgLower)) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.flushHeaders();
        res.write('data: ' + JSON.stringify({ type: 'text', content: g.reply }) + '\n\n');
        res.write('data: ' + JSON.stringify({ type: 'done', reply: g.reply, sources: [], sources_count: 0, duration_ms: 0, free: true }) + '\n\n');
        res.write('data: [DONE]\n\n');
        return res.end();
      }
    }

    // 0b. Recadrage gratuit — hors sujet intercepté AVANT tout appel IA
    const LEGAL_KEYWORDS = /indemnit|licenci|rupture|transaction|exon[eé]r|fiscal|social|csg|crds|pass|igr|ifc|convention|salari[eé]|employeur|pr[eé]avis|faute|grave|cdi|cdd|prud|conciliation|audience|bar[eè]me|macron|différ[eé]|chomage|are |asp |cotisation|patron|contribution|r[eé]mun[eé]r|brut|net |impot|impos|ir |css |urssaf|boss |code.*travail|l\.?1234|l\.?1235|r\.?1234|art\.|cass\.|arr[eê]t|jurisprud|boudin|d[eé]ficab|formation|rupture.*conv|rc |mise.*retraite|d[eé]part|d[eé]mission|prise.*acte|at.?mp|accident|maladie.*pro|plafond|seuil|ventil|montage|optimis|n[eé]goci|transiger|protocole|homolog|ex[eé]cution|contrat|clause|pr[eé]judice|dommage|moral|harc[eè]le|discrimin|ill[eé]gal|nul/i;
    if (!LEGAL_KEYWORDS.test(message) && message.length < 200) {
      const recadrage = "Je suis spécialisé dans le régime social et fiscal des indemnités de rupture du contrat de travail. Je ne suis pas en mesure de vous aider sur d'autres sujets.\n\nVoici des exemples de questions que vous pouvez me poser :\n- Comment calculer l'exonération IR sur une transaction ?\n- Quel régime pour une RC post-réforme 2023 ?\n- Faute grave + transaction, comment ça marche ?\n- PV de conciliation vs transaction, quel montage choisir ?";
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.flushHeaders();
      res.write('data: ' + JSON.stringify({ type: 'text', content: recadrage }) + '\n\n');
      res.write('data: ' + JSON.stringify({ type: 'done', reply: recadrage, sources: [], sources_count: 0, duration_ms: 0, free: true }) + '\n\n');
      res.write('data: [DONE]\n\n');
      return res.end();
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
