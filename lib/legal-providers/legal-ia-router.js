// =============================================
// JADOMI — Legal IA Router (multi-provider)
// Dispatch intelligent : Ollama → DeepSeek → Mistral → Claude
// Règle : utiliser le provider le MOINS CHER capable de la tâche
//
// NIVEAU 0 : Ollama local (0€) — extraction mots-clés, classification
// NIVEAU 1 : DeepSeek (0.14€/M) — résumé jurisprudence, filtrage pertinence
//            ⚠ JAMAIS de données client/dossier (serveurs chinois)
// NIVEAU 2 : Mistral (0.25€/M) — analyse juridique simple, résumé dossier
//            ✅ RGPD compliant (hébergé en France)
// NIVEAU 3 : Claude (3€/M) — analyse complexe, contradictions, audience
//            ✅ Seul capable de raisonnement juridique avancé
// =============================================

const http = require('http');

const OLLAMA_URL = 'http://127.0.0.1:11434';
const OLLAMA_MODEL = 'qwen2.5:14b';

// ================================================
// TÂCHES JURIDIQUES → Provider optimal
// ================================================
const TASK_ROUTING = {
  // Niveau 0 : Ollama (0€)
  'extract_keywords':    { provider: 'ollama',   fallback: 'deepseek' },
  'classify_document':   { provider: 'ollama',   fallback: 'mistral'  },
  'detect_dates':        { provider: 'ollama',   fallback: 'deepseek' },

  // Niveau 1 : DeepSeek (ultra-cheap, JAMAIS données sensibles)
  'summarize_jurisprudence': { provider: 'deepseek', fallback: 'mistral'  },
  'filter_relevance':        { provider: 'deepseek', fallback: 'mistral'  },
  'format_citation':         { provider: 'deepseek', fallback: 'mistral'  },
  'translate_legal':         { provider: 'deepseek', fallback: 'mistral'  },

  // Niveau 2 : Mistral (RGPD, données client OK)
  'summarize_dossier':       { provider: 'mistral',  fallback: 'claude'   },
  'classify_piece':          { provider: 'mistral',  fallback: 'claude'   },
  'extract_timeline_simple': { provider: 'mistral',  fallback: 'claude'   },
  'generate_keywords':       { provider: 'mistral',  fallback: 'claude'   },
  'veille_filter':           { provider: 'mistral',  fallback: 'claude'   },

  // Niveau 3 : Claude (analyse complexe uniquement)
  'analyze_contradictions':  { provider: 'claude',   fallback: null       },
  'analyze_risks':           { provider: 'claude',   fallback: null       },
  'prepare_audience':        { provider: 'claude',   fallback: null       },
  'legal_chat':              { provider: 'claude',   fallback: null       },
  'full_analysis':           { provider: 'claude',   fallback: null       },
};

// ================================================
// PROVIDER : Ollama local (0€)
// ================================================
async function callOllama(prompt, options = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: options.model || OLLAMA_MODEL,
      prompt: prompt,
      stream: false,
      options: { temperature: options.temperature || 0.1, num_predict: options.maxTokens || 300 }
    });

    const req = http.request(OLLAMA_URL + '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.response || '');
        } catch { resolve(data); }
      });
    });

    req.on('error', () => reject(new Error('Ollama indisponible')));
    req.on('timeout', () => { req.destroy(); reject(new Error('Ollama timeout')); });
    req.write(body);
    req.end();
  });
}

// ================================================
// PROVIDER : DeepSeek (0.14€/M tokens)
// ⚠ JAMAIS de données sensibles (serveurs chinois)
// ================================================
async function callDeepSeek(systemPrompt, userPrompt, options = {}) {
  if (!process.env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY manquant');

  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + process.env.DEEPSEEK_API_KEY
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: options.maxTokens || 500,
      temperature: options.temperature || 0.1
    })
  });

  if (!resp.ok) throw new Error('DeepSeek erreur ' + resp.status);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

// ================================================
// PROVIDER : Mistral (0.25€/M, RGPD France)
// ================================================
async function callMistral(systemPrompt, userPrompt, options = {}) {
  if (!process.env.MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY manquant');

  const { Mistral } = require('@mistralai/mistralai');
  const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

  const response = await client.chat.complete({
    model: options.model || 'mistral-small-latest',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    maxTokens: options.maxTokens || 1000,
    temperature: options.temperature || 0.2,
    responseFormat: options.json ? { type: 'json_object' } : undefined
  });

  return response.choices?.[0]?.message?.content || '';
}

// ================================================
// PROVIDER : Claude (3€/M, analyse complexe)
// ================================================
async function callClaude(systemPrompt, userPrompt, options = {}) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY manquant');

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: options.model || 'claude-sonnet-4-6',
      max_tokens: options.maxTokens || 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!resp.ok) throw new Error('Claude erreur ' + resp.status);
  const data = await resp.json();
  let text = '';
  for (const block of (data.content || [])) {
    if (block.type === 'text') text += block.text;
  }
  return text;
}

// ================================================
// DISPATCH INTELLIGENT — Choisit le bon provider
// ================================================
async function dispatch(task, systemPrompt, userPrompt, options = {}) {
  const routing = TASK_ROUTING[task];
  if (!routing) {
    console.warn('[legal-ia-router] Tâche inconnue:', task, '→ fallback Claude');
    return { provider: 'claude', result: await callClaude(systemPrompt, userPrompt, options) };
  }

  const provider = routing.provider;
  const startTime = Date.now();

  try {
    let result;
    switch (provider) {
      case 'ollama':
        result = await callOllama(systemPrompt + '\n\n' + userPrompt, options);
        break;
      case 'deepseek':
        result = await callDeepSeek(systemPrompt, userPrompt, options);
        break;
      case 'mistral':
        result = await callMistral(systemPrompt, userPrompt, options);
        break;
      case 'claude':
        result = await callClaude(systemPrompt, userPrompt, options);
        break;
    }

    const duration = Date.now() - startTime;
    console.log('[legal-ia-router]', task, '→', provider, '(' + duration + 'ms)');
    return { provider, result, duration };

  } catch (err) {
    console.warn('[legal-ia-router]', task, '→', provider, 'FAILED:', err.message);

    // Fallback
    if (routing.fallback) {
      console.log('[legal-ia-router] Fallback →', routing.fallback);
      try {
        let result;
        switch (routing.fallback) {
          case 'deepseek':
            result = await callDeepSeek(systemPrompt, userPrompt, options);
            break;
          case 'mistral':
            result = await callMistral(systemPrompt, userPrompt, options);
            break;
          case 'claude':
            result = await callClaude(systemPrompt, userPrompt, options);
            break;
        }
        return { provider: routing.fallback, result, fallback: true, duration: Date.now() - startTime };
      } catch (fbErr) {
        console.error('[legal-ia-router] Fallback', routing.fallback, 'FAILED:', fbErr.message);
        throw fbErr;
      }
    }
    throw err;
  }
}

// ================================================
// FONCTIONS SPÉCIALISÉES pré-routées
// ================================================

/** Extraction mots-clés juridiques (Ollama → 0€) */
async function extractKeywords(text) {
  const prompt = `Extrais les mots-clés juridiques de ce texte. Retourne UNIQUEMENT un JSON : {"keywords":["mot1","mot2",...]}
Texte : ${text.substring(0, 1000)}`;
  const { result } = await dispatch('extract_keywords', 'Tu extrais des mots-clés juridiques français.', prompt, { maxTokens: 200 });
  try {
    const match = result.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]).keywords || [] : [];
  } catch { return []; }
}

/** Classification de document (Ollama → 0€) */
async function classifyDocument(text) {
  const prompt = `Classifie ce document juridique. Retourne UNIQUEMENT un JSON : {"type":"contrat|jugement|courrier|conclusion|attestation|facture|mail|autre","domaine":"civil|penal|travail|commercial|administratif|famille|immobilier|autre","confiance":0-100}
Document : ${text.substring(0, 800)}`;
  const { result } = await dispatch('classify_document', 'Tu classifies des documents juridiques français.', prompt, { maxTokens: 150 });
  try {
    const match = result.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { type: 'autre', domaine: 'autre', confiance: 0 };
  } catch { return { type: 'autre', domaine: 'autre', confiance: 0 }; }
}

/** Résumé de jurisprudence (DeepSeek → 0.14€/M, pas de données sensibles) */
async function summarizeJurisprudence(decisionText) {
  const system = `Résume cette décision de justice en 3 phrases maximum. Indique : juridiction, date, numéro, solution, principe juridique retenu. Format concis.`;
  const { result, provider } = await dispatch('summarize_jurisprudence', system, decisionText.substring(0, 3000), { maxTokens: 300 });
  return { summary: result, provider };
}

/** Filtrage pertinence de résultats (DeepSeek → 0.14€/M) */
async function filterRelevance(query, results) {
  const system = `Pour la requête juridique suivante, note chaque résultat de 0 à 100 selon sa pertinence. Retourne UNIQUEMENT un JSON : {"scores":[{"index":0,"score":85,"raison":"..."},...]}.`;
  const user = `Requête : "${query}"\n\nRésultats :\n${results.map((r, i) => `[${i}] ${r.titre || r.text || ''}`).join('\n')}`;
  const { result } = await dispatch('filter_relevance', system, user, { maxTokens: 500, json: true });
  try {
    const match = result.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]).scores || [] : [];
  } catch { return []; }
}

/** Résumé de dossier (Mistral → RGPD, données client OK) */
async function summarizeDossier(piecesText, dossierInfo) {
  const system = `Tu es un assistant juridique. Résume ce dossier en identifiant : contexte, parties, faits essentiels, points forts, points faibles. Maximum 500 mots. Français, vouvoiement, professionnel.`;
  const user = `Dossier : ${dossierInfo.titre || 'Sans titre'} (${dossierInfo.domaine || 'non précisé'})\n\nPièces :\n${piecesText.substring(0, 8000)}`;
  const { result, provider } = await dispatch('summarize_dossier', system, user, { maxTokens: 1500 });
  return { summary: result, provider };
}

/** Génération de mots-clés de veille (Mistral → RGPD) */
async function generateVeilleKeywords(dossierTitre, domaine, piecesText) {
  const system = `Génère 5-8 mots-clés juridiques pour surveiller les nouvelles décisions pertinentes pour ce dossier. Retourne UNIQUEMENT un JSON : {"keywords":["mot1","mot2",...]}`;
  const user = `Dossier : "${dossierTitre}" — Domaine : ${domaine || 'non précisé'}\nExtraits pièces : ${(piecesText || '').substring(0, 2000)}`;
  const { result } = await dispatch('generate_keywords', system, user, { maxTokens: 200, json: true });
  try {
    const match = result.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]).keywords || [] : [];
  } catch { return []; }
}

/** Filtrage veille — pertinence d'une décision pour un dossier (Mistral → RGPD) */
async function veilleFilterDecision(decision, dossierContext) {
  const system = `Évalue si cette décision de justice est pertinente pour le dossier décrit. Retourne UNIQUEMENT un JSON : {"pertinent":true/false,"score":0-100,"raison":"..."}`;
  const user = `Dossier : "${dossierContext.titre}" (${dossierContext.domaine})\nDécision : ${(decision.text || decision.summary || '').substring(0, 2000)}`;
  const { result } = await dispatch('veille_filter', system, user, { maxTokens: 150, json: true });
  try {
    const match = result.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { pertinent: false, score: 0 };
  } catch { return { pertinent: false, score: 0 }; }
}

// ================================================
// COÛT ESTIMÉ par provider
// ================================================
const COST_PER_1M_TOKENS = {
  ollama: 0,
  deepseek: 0.14,
  mistral: 0.25,
  claude: 3.00
};

function estimateCost(provider, inputTokens, outputTokens) {
  const totalTokens = (inputTokens || 0) + (outputTokens || 0);
  return (totalTokens / 1000000) * (COST_PER_1M_TOKENS[provider] || 0);
}

module.exports = {
  dispatch,
  callOllama,
  callDeepSeek,
  callMistral,
  callClaude,
  extractKeywords,
  classifyDocument,
  summarizeJurisprudence,
  filterRelevance,
  summarizeDossier,
  generateVeilleKeywords,
  veilleFilterDecision,
  estimateCost,
  TASK_ROUTING,
  COST_PER_1M_TOKENS
};
