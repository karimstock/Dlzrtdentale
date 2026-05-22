// =============================================
// JADOMI AVOCAT — Assistant IA Juridique enrichi
// RAG Légifrance + Judilibre + Mémoire dossier
// Cite les VRAIS articles et décisions, jamais de faux
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { enrichWithLegalData } = require('../../lib/legal-providers/legal-rag');
const legalRouter = require('../../lib/legal-providers/legal-ia-router');

let _admin = null;
function admin() {
  if (!_admin) {
    _admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

// === AUTH MIDDLEWARE ===
async function requireAvocat(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requis' });
    const { data: { user }, error } = await admin().auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Token invalide' });
    req.userId = user.id;
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
  } catch {
    return res.status(401).json({ error: 'Authentification échouée' });
  }
}

const SYSTEM_PROMPT = `Tu es l'assistant juridique JADOMI pour un cabinet d'avocat français.

RÈGLES ABSOLUES :
1. Tu utilises UNIQUEMENT les sources juridiques fournies dans le contexte ci-dessous (balises [SOURCE]).
2. Tu ne GÉNÈRES JAMAIS de faux numéro d'article, de fausse jurisprudence, ou de fausse référence.
3. Si une source est fournie, tu la cites EXACTEMENT comme indiqué.
4. Si aucune source pertinente n'est disponible, tu dis clairement "Je n'ai pas trouvé de source vérifiée pour cette question" et tu recommandes de vérifier sur Doctrine.fr ou LexisNexis.
5. Tu structures tes réponses complexes en format IRAC : Issue, Rule, Application, Conclusion.
6. Tu utilises le vouvoiement.
7. Tu affiches TOUJOURS un niveau de confiance.
8. Tu termines TOUJOURS par : "Cette analyse ne se substitue pas à un conseil juridique personnalisé."
9. Pas d'emoji. Concis, précis, professionnel.
10. Tu cites les articles exacts (ex: "Article 1240 du Code civil") et les décisions exactes (ex: "Cass. soc., 21 novembre 2012, n° 10-17.978").

FORMAT DE CITATION :
- Article de code : "Article [num] du [Code] — [extrait pertinent]"
- Décision : "Cass. [chambre], [date], n° [numéro] — [solution] : [extrait]"
- Si la source vient de la mémoire du dossier : "Selon la référence conservée dans votre dossier : [...]"

IMPORTANT : Les sources ci-dessous sont des données RÉELLES provenant de Légifrance et de la Cour de cassation (Judilibre). Elles sont fiables mais doivent être vérifiées par l'avocat dans leur contexte d'application.`;

const MODEL = 'claude-sonnet-4-6-20250514';

// ================================================
// POST /message — Chat IA juridique enrichi par RAG
// ================================================
router.post('/message', requireAvocat, async (req, res) => {
  try {
    const { message, conversation, dossier_id } = req.body || {};
    if (!message || message.trim().length < 2) {
      return res.status(400).json({ error: 'Message trop court' });
    }

    // 1. Enrichir avec des sources juridiques réelles
    const dossierContext = dossier_id ? { dossierId: dossier_id } : null;
    const enrichment = await enrichWithLegalData(message, dossierContext);

    // 2. Construire le system prompt enrichi
    let systemPrompt = SYSTEM_PROMPT;
    if (enrichment.context) {
      systemPrompt += '\n\n' + enrichment.context;
    } else {
      systemPrompt += '\n\nAucune source juridique trouvée pour cette question. Réponds avec prudence et recommande de vérifier les sources.';
    }

    // 3. Construire les messages
    const messages = [];

    // Historique de conversation (max 10 derniers messages)
    if (conversation && Array.isArray(conversation)) {
      conversation.slice(-10).forEach(m => {
        messages.push({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content || m.text || ''
        });
      });
    }

    // Message actuel
    messages.push({ role: 'user', content: message });

    // 4. Déterminer le provider selon la complexité
    const startTime = Date.now();
    let reply = '';
    let usedProvider = 'claude';

    // Questions simples (définition, article précis) → Mistral (RGPD, pas cher)
    // Questions complexes (analyse, IRAC, contradictions) → Claude
    const isSimple = message.length < 100 &&
      !/(analyse|irac|contrad|compar|risqu|audience|prépare|résumé dossier)/i.test(message) &&
      /(article|définition|qu'est-ce|c'est quoi|délai|prescription)/i.test(message);

    const userPrompt = messages.map(m => m.role + ': ' + m.content).join('\n');

    if (isSimple) {
      // Mistral pour les questions simples (RGPD + 12x moins cher)
      try {
        const { result, provider } = await legalRouter.dispatch('summarize_dossier', systemPrompt, userPrompt, { maxTokens: 2000 });
        reply = result;
        usedProvider = provider;
      } catch {
        // Fallback Claude si Mistral échoue
        const { result } = await legalRouter.dispatch('legal_chat', systemPrompt, userPrompt, { maxTokens: 4096 });
        reply = result;
        usedProvider = 'claude';
      }
    } else {
      // Claude pour les analyses complexes
      const { result, provider } = await legalRouter.dispatch('legal_chat', systemPrompt, userPrompt, { maxTokens: 4096 });
      reply = result;
      usedProvider = provider;
    }

    const durationMs = Date.now() - startTime;

    // 5. Retourner la réponse enrichie
    return res.json({
      reply,
      sources: enrichment.sources.map(s => ({
        type: s.type,
        titre: s.article || s.numero || s.titre || '',
        ref: s.type === 'code'
          ? (s.code + ' — Art. ' + s.article)
          : s.type === 'judilibre'
            ? ('Cass. ' + s.chambre + ', ' + s.date + ', n° ' + s.numero)
            : (s.titre || ''),
        pertinence: s.pertinence || null
      })),
      sources_count: enrichment.sources.length,
      keywords: enrichment.keywords,
      provider: usedProvider,
      duration_ms: durationMs,
      cost_estimate: legalRouter.estimateCost(usedProvider, message.length * 2, (reply || '').length)
    });
  } catch (err) {
    console.error('[ia-juridique/message]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = router;
