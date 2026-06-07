// =============================================
// JADOMI IA ROUTER — Routeur intelligent
//
// 3 niveaux :
//   1. REGLES LOCALES (0€) — regex, lookup, calculs
//   2. OLLAMA LOCAL (0€) — modèle 3B CPU pour NLP basique
//   3. CLAUDE API (payant) — tâches complexes uniquement
//
// Objectif : réduire les coûts IA de 70-80%
// =============================================

const http = require('http');
const { JADOMI_BASE_PROMPT, JADOMI_KNOWLEDGE, validateResponse } = require('./ai-studio/jadomi-brain');
const { sanitizeForExternalAPI, recommendProvider } = require('./ai-studio/data-guard');

const OLLAMA_URL = 'http://127.0.0.1:11434';
// Qwen3.6 35B-A3B (MoE) = cerveau principal — 20 tok/s sur le RISE-M, JSON fiable, 100% local
// IMPORTANT : modèle "thinking" → think:false obligatoire pour les tâches directes
// Llama 3.1 8B = fallback rapide (12 tok/s, suffisant pour textes courts)
const OLLAMA_MODEL = 'qwen3.6:35b-a3b';
const OLLAMA_MODEL_FAST = 'llama3.1:8b';

// =============================================
// NIVEAU 1 : REGLES LOCALES (0€, instantané)
// =============================================

const LOCAL_RULES = {
  // Détection d'actes dentaires depuis du texte
  detectActes(text) {
    const lower = text.toLowerCase();
    const actes = [];
    const patterns = [
      { pattern: /\bcomposite\b/i, categorie: 'conservateur', acte: 'soin_carie_1face', label: 'composite' },
      { pattern: /\bd[eé]tartrage\b/i, categorie: 'parodontologie', acte: 'detartrage', label: 'détartrage' },
      { pattern: /\bextraction\b/i, categorie: 'chirurgie', acte: 'extraction_simple', label: 'extraction' },
      { pattern: /\bendo(?:dontie)?\b/i, categorie: 'endodontie', acte: 'endo_mono', label: 'endodontie' },
      { pattern: /\bcouronne\b/i, categorie: 'prothese_conjointe', acte: 'couronne_empreinte', label: 'couronne' },
      { pattern: /\bbridge\b/i, categorie: 'prothese_conjointe', acte: 'bridge_empreinte', label: 'bridge' },
      { pattern: /\bsurfa[cç]age\b/i, categorie: 'parodontologie', acte: 'surfacage_1secteur', label: 'surfaçage' },
      { pattern: /\binlay\b/i, categorie: 'conservateur', acte: 'inlay_onlay_empreinte', label: 'inlay' },
      { pattern: /\bonlay\b/i, categorie: 'conservateur', acte: 'inlay_onlay_empreinte', label: 'onlay' },
      { pattern: /\bscellement\b/i, categorie: 'conservateur', acte: 'scellement_sillon', label: 'scellement' },
      { pattern: /\bpulpotomie\b/i, categorie: 'endodontie', acte: 'pulpotomie', label: 'pulpotomie' },
      { pattern: /\bimplant\b/i, categorie: 'chirurgie', acte: 'implant_pose', label: 'implant' },
      { pattern: /\bblanchiment\b/i, categorie: 'esthetique', acte: 'blanchiment_fauteuil', label: 'blanchiment' },
      { pattern: /\bgreffe\b/i, categorie: 'parodontologie', acte: 'greffe_gingivale', label: 'greffe' },
      { pattern: /\bcarie\b/i, categorie: 'conservateur', acte: 'soin_carie_1face', label: 'carie' },
      { pattern: /\bradio\b/i, categorie: 'consultation', acte: 'radio_retro', label: 'radio' },
      { pattern: /\bcone\s*beam\b/i, categorie: 'consultation', acte: 'cone_beam', label: 'cone beam' },
      { pattern: /\bproth[eè]se\b/i, categorie: 'prothese_adjointe', acte: 'empreinte_pap', label: 'prothèse' },
    ];
    for (const p of patterns) {
      if (p.pattern.test(text)) {
        actes.push({ categorie: p.categorie, acte: p.acte, label: p.label });
      }
    }
    return actes;
  },

  // Détection numéros de dents FDI
  detectDents(text) {
    const dents = [];
    // Mots en lettres
    const vocaux = {
      'onze':11,'douze':12,'treize':13,'quatorze':14,'quinze':15,'seize':16,
      'dix-sept':17,'dix sept':17,'dix-huit':18,'dix huit':18,
      'vingt et un':21,'vingt-et-un':21,'vingt deux':22,'vingt-deux':22,
      'vingt trois':23,'vingt-trois':23,'vingt quatre':24,'vingt-quatre':24,
      'vingt cinq':25,'vingt-cinq':25,'vingt six':26,'vingt-six':26,
      'vingt sept':27,'vingt-sept':27,'vingt huit':28,'vingt-huit':28,
      'trente et un':31,'trente-et-un':31,'trente deux':32,'trente-deux':32,
      'trente trois':33,'trente-trois':33,'trente quatre':34,'trente-quatre':34,
      'trente cinq':35,'trente-cinq':35,'trente six':36,'trente-six':36,
      'trente sept':37,'trente-sept':37,'trente huit':38,'trente-huit':38,
      'quarante et un':41,'quarante-et-un':41,'quarante deux':42,'quarante-deux':42,
      'quarante trois':43,'quarante-trois':43,'quarante quatre':44,'quarante-quatre':44,
      'quarante cinq':45,'quarante-cinq':45,'quarante six':46,'quarante-six':46,
      'quarante sept':47,'quarante-sept':47,'quarante huit':48,'quarante-huit':48,
    };
    const lower = text.toLowerCase();
    for (const [word, num] of Object.entries(vocaux)) {
      if (lower.includes(word) && !dents.includes(num)) dents.push(num);
    }
    // Chiffres
    const numPattern = /\b(\d{2})\b/g;
    let m;
    while ((m = numPattern.exec(text)) !== null) {
      const n = parseInt(m[1]);
      if (n >= 11 && n <= 48 && n % 10 >= 1 && n % 10 <= 8 && !dents.includes(n)) {
        dents.push(n);
      }
    }
    return dents.sort((a, b) => a - b);
  },

  // Alertes médicales depuis questionnaire
  detectAlertesMedicales(reponses) {
    const alertes = [];
    if (reponses.allergie_penicilline) alertes.push({ type: 'ALLERGIE_PENICILLINE', severity: 'critical', message: 'Contre-indication amoxicilline' });
    if (reponses.allergie_latex) alertes.push({ type: 'ALLERGIE_LATEX', severity: 'high', message: 'Utiliser gants nitrile' });
    if (reponses.allergie_anesthesique) alertes.push({ type: 'ALLERGIE_ANESTHESIQUE', severity: 'critical', message: 'Vérifier type anesthésique' });
    if (reponses.anticoagulant || reponses.avk || reponses.antiplaquettaire) alertes.push({ type: 'RISQUE_HEMORRAGIQUE', severity: 'high', message: 'Protocole hémorragie, vérifier INR' });
    if (reponses.bisphosphonates) alertes.push({ type: 'RISQUE_ONM', severity: 'critical', message: 'Éviter extractions, risque ostéonécrose' });
    if (reponses.valvulopathie || reponses.prothese_cardiaque) alertes.push({ type: 'ENDOCARDITE', severity: 'critical', message: 'Antibioprophylaxie amoxicilline 2g avant geste' });
    if (reponses.grossesse) alertes.push({ type: 'GROSSESSE', severity: 'high', message: 'Médicaments contre-indiqués' });
    if (reponses.diabete) alertes.push({ type: 'DIABETE', severity: 'medium', message: 'Suivi cicatrisation' });
    if (reponses.immunodepression) alertes.push({ type: 'IMMUNODEPRESSION', severity: 'high', message: 'Risque infectieux majoré' });
    if (reponses.radiotherapie_cervicofaciale) alertes.push({ type: 'RADIOTHERAPIE', severity: 'critical', message: 'Risque ostéoradionécrose' });
    return alertes;
  },

  // Suggestion passeport selon l'acte
  suggestPasseport(acte) {
    const map = {
      'blanchiment_fauteuil': 'blanchiment', 'blanchiment_empreinte': 'blanchiment', 'blanchiment_livraison': 'blanchiment',
      'implant_pose': 'implant', 'implant_pilier': 'implant', 'comblement_osseux': 'implant',
      'facette_empreinte': 'facettes', 'facette_pose': 'facettes',
      'pose_multi_attache': 'orthodontie', 'depose_appareil': 'orthodontie', 'controle_aligneurs': 'orthodontie',
      'pac_livraison': 'rehabilitation', 'pap_livraison': 'rehabilitation',
    };
    return map[acte] || null;
  },

  // Suggestion durée depuis le catalogue
  suggestDuree(categorie, acte) {
    try {
      const catalogue = require('../api/dentiste-pro/agenda').CATALOGUE_ACTES;
      if (catalogue && catalogue[categorie] && catalogue[categorie].actes[acte]) {
        return catalogue[categorie].actes[acte].duree;
      }
    } catch (e) { /* ignore */ }
    return null;
  },

  // Classification simple de texte (intention)
  classifyIntent(text) {
    const lower = text.toLowerCase();
    if (/\b(bonjour|salut|hello|bonsoir)\b/.test(lower)) return 'greeting';
    if (/\b(rdv|rendez|créneau|disponib|annul|report|déplac)\b/.test(lower)) return 'scheduling';
    if (/\b(prix|tarif|co[uû]t|combien|devis)\b/.test(lower)) return 'pricing';
    if (/\b(douleur|urgence|mal|saign|gonfl|infect)\b/.test(lower)) return 'urgency';
    if (/\b(facture|paiement|règlement|remboursement|mutuelle)\b/.test(lower)) return 'billing';
    if (/\b(document|attestation|certificat|ordonnance|arrêt)\b/.test(lower)) return 'document';
    if (/\b(stock|commande|produit|fournisseur|prix)\b/.test(lower)) return 'stock';
    return 'general';
  },
};

// =============================================
// NIVEAU 2 : OLLAMA LOCAL (0€, ~2-5 sec)
// =============================================

async function ollamaGenerate(prompt, options = {}) {
  const maxTokens = options.maxTokens || 500;
  const temperature = options.temperature || 0.3;
  // Choisir le modèle : Qwen3.6 MoE pour raisonnement, Llama 8B pour rapide
  const model = options.fast ? OLLAMA_MODEL_FAST : (options.model || OLLAMA_MODEL);

  return new Promise((resolve, reject) => {
    const payload = {
      model: model,
      prompt: prompt,
      stream: false,
      // Qwen3.6 est un modèle "thinking" : sans ce flag il raisonne 2000+ tokens
      // avant de répondre (2 min au lieu de 5 s). Toujours false sauf demande explicite.
      think: options.think === true,
      options: {
        num_predict: maxTokens,
        temperature: temperature,
      },
    };
    // System prompt (JADOMI Brain) : ton, vouvoiement, règles métier
    if (options.system) payload.system = options.system;
    // Sortie JSON garantie : 'json' ou un schéma JSON complet (grammaire contrainte Ollama)
    if (options.json) payload.format = options.json === true ? 'json' : options.json;
    const body = JSON.stringify(payload);

    const req = http.request(OLLAMA_URL + '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // 35B MoE : ~10 s de chargement à froid + génération 20 tok/s → 30 s trop court
      timeout: options.timeout || 120000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.response || '');
        } catch (e) {
          reject(new Error('Ollama parse error'));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Ollama timeout')); });
    req.write(body);
    req.end();
  });
}

// ═══ Schémas JSON imposés à Qwen (grammaire contrainte = zéro parsing raté) ═══
const OLLAMA_SCHEMAS = {
  extractStructured: {
    type: 'object',
    properties: {
      actes: { type: 'array', items: { type: 'string' } },
      dents: { type: 'array', items: { type: 'integer' } },
      materiaux: { type: 'array', items: { type: 'string' } },
      complications: { type: 'array', items: { type: 'string' } },
      prescriptions: { type: 'array', items: { type: 'string' } },
    },
    required: ['actes', 'dents', 'materiaux', 'complications', 'prescriptions'],
  },
  classifyProduct: {
    type: 'object',
    properties: {
      categorie: { type: 'string', enum: ['endodontie', 'restauration', 'prothese', 'chirurgie', 'prevention', 'sterilisation', 'empreinte', 'orthodontie', 'anesthesie', 'radiographie', 'hygiene', 'consommable', 'equipement', 'autre'] },
    },
    required: ['categorie'],
  },
  matchProducts: {
    type: 'object',
    properties: {
      match: { type: 'boolean' },
      score: { type: 'integer', minimum: 0, maximum: 100 },
      raison: { type: 'string' },
    },
    required: ['match', 'score', 'raison'],
  },
  normalizeProduct: {
    type: 'object',
    properties: {
      marque: { type: 'string' },
      gamme: { type: 'string' },
      conditionnement: { type: 'string' },
      nom_normalise: { type: 'string' },
    },
    required: ['marque', 'gamme', 'conditionnement', 'nom_normalise'],
  },
};

// Tâches Ollama pré-définies — Qwen3.6 MoE guidé : few-shot + schéma JSON imposé
const OLLAMA_TASKS = {
  // Résumer des notes de consultation → Llama 8B (rapide, suffisant)
  async summarizeNotes(notes) {
    const prompt = `Résume ces notes de consultation dentaire en 2-3 phrases concises en français. Notes:\n${notes}\n\nRésumé:`;
    return ollamaGenerate(prompt, { maxTokens: 200, fast: true });
  },

  // Extraire les données structurées d'une transcription → Qwen3.6 (schéma imposé + exemple)
  async extractStructured(transcript) {
    const prompt = `Tu es l'assistant clinique JADOMI. Extrais les informations de cette transcription de soin dentaire.
Règles : numéros de dents en notation FDI (11-48), actes en termes courts, ne rien inventer — liste vide si absent.

EXEMPLE
Transcription : "Composite sur la 26 face occlusale, anesthésie articaïne, le patient a saigné un peu, je prescris du paracétamol"
Réponse : {"actes":["composite"],"dents":[26],"materiaux":["composite","articaïne"],"complications":["saignement léger"],"prescriptions":["paracétamol"]}

Transcription : "${transcript}"`;
    return ollamaGenerate(prompt, { maxTokens: 400, temperature: 0.1, json: OLLAMA_SCHEMAS.extractStructured });
  },

  // Classifier un produit dentaire → Qwen3.6 (enum imposé = catégorie toujours valide)
  async classifyProduct(productName) {
    const prompt = `Classe ce produit dentaire dans une catégorie.

EXEMPLES
"Lime K-File 25mm assortiment" → {"categorie":"endodontie"}
"Gants nitrile non poudrés taille M" → {"categorie":"consommable"}
"Alginate chromatique 453g" → {"categorie":"empreinte"}

Produit : "${productName}"`;
    const res = await ollamaGenerate(prompt, { maxTokens: 30, temperature: 0.1, json: OLLAMA_SCHEMAS.classifyProduct });
    try { return JSON.parse(res).categorie; } catch { return res; }
  },

  // Cross-matcher 2 produits → Qwen3.6 (raisonnement + schéma imposé)
  async matchProducts(prodA, prodB) {
    const prompt = `Tu es l'expert comparateur JADOMI (172 000 produits dentaires, 16 fournisseurs).
Compare ces 2 produits : même produit exact (même marque, même gamme, même conditionnement) ou pas ?
Attention : même gamme mais conditionnement différent = pas un match exact (score 60-80).
Marques différentes mais produit équivalent = pas un match (score 30-50).

Produit A : ${prodA}
Produit B : ${prodB}`;
    return ollamaGenerate(prompt, { maxTokens: 250, temperature: 0.1, json: OLLAMA_SCHEMAS.matchProducts });
  },

  // Normaliser un nom produit → Qwen3.6 (schéma imposé + exemples réels fournisseurs)
  async normalizeProduct(rawName) {
    const prompt = `Tu es l'expert catalogue JADOMI. Normalise ce nom de produit dentaire brut issu d'un scraping fournisseur.

EXEMPLES
"COMPOSITE 3M ESPE FILTEK Z250 SER. 8 SERINGUES4G" → {"marque":"3M ESPE","gamme":"Filtek Z250","conditionnement":"8 seringues de 4 g","nom_normalise":"3M ESPE Filtek Z250 - 8 seringues 4 g"}
"gants latex poudres t.7/8 x100 medistock" → {"marque":"Medistock","gamme":"Gants latex poudrés","conditionnement":"boîte de 100, taille 7/8","nom_normalise":"Medistock Gants latex poudrés T7/8 x100"}

Produit brut : "${rawName}"`;
    return ollamaGenerate(prompt, { maxTokens: 200, temperature: 0.1, json: OLLAMA_SCHEMAS.normalizeProduct });
  },

  // Générer un message patient → Qwen3.6 + cerveau JADOMI (vouvoiement premium garanti)
  async generatePatientMessage(type, patientName, details) {
    const prompts = {
      rappel: `Écris un SMS de rappel de rendez-vous pour ${patientName}. Détails : ${details}. 2 phrases maximum.`,
      annulation: `Écris un SMS d'annulation de rendez-vous pour ${patientName}. Détails : ${details}. Proposer de replanifier, 3 phrases maximum.`,
      confirmation: `Écris un SMS de confirmation de rendez-vous pour ${patientName}. Détails : ${details}. 2 phrases maximum.`,
      suivi: `Écris un SMS de suivi post-opératoire pour ${patientName}. Détails : ${details}. Rappeler les consignes, 3 phrases maximum.`,
    };
    const system = `${JADOMI_BASE_PROMPT}\n\nTu rédiges des SMS pour les patients d'un cabinet dentaire. Vouvoiement strict, zéro emoji, orthographe parfaite avec tous les accents. Réponds uniquement avec le texte du SMS, sans guillemets ni commentaire.`;
    return ollamaGenerate(prompts[type] || prompts.rappel, { maxTokens: 150, system });
  },

  // ═══ RAG : recherche sémantique catalogue (238K produits, 100% local) ═══
  // require lazy : ne charge better-sqlite3 que si la tâche est utilisée
  async searchCatalog(query, limit = 10) {
    const rag = require('./rag');
    return rag.searchProducts(query, limit);
  },

  // Question catalogue → RAG (vraies données) + Qwen3.6 (réponse informée)
  // Le modèle ne devine plus : il répond avec les produits réels sous les yeux.
  async answerCatalog(question) {
    const rag = require('./rag');
    const context = await rag.buildContext(question, 8);
    if (!context) return ollamaGenerate(question, { maxTokens: 300 });
    const system = `${JADOMI_BASE_PROMPT}\n\nTu es l'expert catalogue du comparateur JADOMI (238 000 produits dentaires, 16 fournisseurs). Tu réponds UNIQUEMENT à partir des données catalogue fournies — jamais d'invention de produit ou de prix. Si les données ne suffisent pas, dis-le. Vouvoiement, zéro emoji, accents parfaits.`;
    const prompt = `${context}\n\nQUESTION DU PRATICIEN : ${question}\n\nRéponds de façon concise et utile (compare les prix si pertinent).`;
    return ollamaGenerate(prompt, { maxTokens: 500, system, timeout: 180000 });
  },
};

// =============================================
// NIVEAU 2.5 : MISTRAL API (low-cost, IA française)
// mistral-small-latest : 0.20$/M — chat, messages, traduction
// pixtral-12b-2409 : 0.15$/M — vision, OCR, photos
// mistral-large-latest : 1.50$/M — raisonnement complexe
// =============================================

// mistralGenerate(prompt, options) — rétrocompatible
// mistralGenerate(systemPrompt, userPrompt, options) — mode agent custom
async function mistralGenerate(promptOrSystem, optionsOrUser, maybeOptions) {
  let systemPrompt, userPrompt, options;
  if (typeof optionsOrUser === 'string') {
    // Mode agent : mistralGenerate(system, user, opts)
    systemPrompt = promptOrSystem;
    userPrompt = optionsOrUser;
    options = maybeOptions || {};
  } else {
    // Mode legacy : mistralGenerate(prompt, opts)
    systemPrompt = JADOMI_BASE_PROMPT;
    userPrompt = promptOrSystem;
    options = optionsOrUser || {};
  }

  const { Mistral } = require('@mistralai/mistralai');
  if (!process.env.MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY non défini');
  const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

  // DATA GUARD : filtrer les données sensibles avant envoi à Mistral
  const guard = sanitizeForExternalAPI(userPrompt, 'mistral');
  if (guard.blocked) throw new Error('DATA-GUARD: trop de données sensibles pour Mistral');

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: guard.cleaned }
  ];

  const response = await client.chat.complete({
    model: options.model || 'mistral-small-latest',
    messages,
    maxTokens: options.maxTokens || 500,
    temperature: options.temperature !== undefined ? options.temperature : undefined,
    responseFormat: options.json ? { type: 'json_object' } : undefined,
  });

  return response.choices?.[0]?.message?.content || '';
}

async function mistralVision(base64Image, prompt, options = {}) {
  const { Mistral } = require('@mistralai/mistralai');
  if (!process.env.MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY non défini');
  const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

  const response = await client.chat.complete({
    model: options.model || 'pixtral-12b-2409',
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', imageUrl: `data:image/jpeg;base64,${base64Image}` },
        { type: 'text', text: prompt },
      ],
    }],
    maxTokens: options.maxTokens || 300,
  });

  return response.choices?.[0]?.message?.content || '';
}

// =============================================
// NIVEAU 3 : CLAUDE API (premium, tâches complexes)
// =============================================

async function claudeGenerate(prompt, options = {}) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // DATA GUARD : filtrer les données sensibles avant envoi à Claude
  const guard = sanitizeForExternalAPI(prompt, 'claude');
  if (guard.blocked) throw new Error('DATA-GUARD: trop de données sensibles pour Claude');

  const response = await client.messages.create({
    model: options.model || 'claude-sonnet-4-6',
    max_tokens: options.maxTokens || 1000,
    system: JADOMI_BASE_PROMPT,
    messages: [{ role: 'user', content: guard.cleaned }],
  });

  return response.content[0].text;
}

// =============================================
// ROUTEUR PRINCIPAL
// =============================================

async function route(task, input, options = {}) {
  const startTime = Date.now();
  let level = 'local';
  let result = null;
  let cost = 0;

  try {
    switch (task) {
      // ── Tâches 100% locales (0€) ──
      case 'detect-actes':
        result = LOCAL_RULES.detectActes(input);
        break;
      case 'detect-dents':
        result = LOCAL_RULES.detectDents(input);
        break;
      case 'detect-alertes':
        result = LOCAL_RULES.detectAlertesMedicales(input);
        break;
      case 'suggest-passeport':
        result = LOCAL_RULES.suggestPasseport(input);
        break;
      case 'suggest-duree':
        result = LOCAL_RULES.suggestDuree(input.categorie, input.acte);
        break;
      case 'classify-intent':
        result = LOCAL_RULES.classifyIntent(input);
        break;

      // ── Tâches Ollama (0€, ~2-5 sec) ──
      case 'summarize-notes':
        level = 'ollama';
        result = await OLLAMA_TASKS.summarizeNotes(input);
        break;
      case 'extract-structured':
        level = 'ollama';
        result = await OLLAMA_TASKS.extractStructured(input);
        break;
      case 'classify-product':
        level = 'ollama';
        result = await OLLAMA_TASKS.classifyProduct(input);
        break;
      case 'generate-message':
        level = 'ollama';
        result = await OLLAMA_TASKS.generatePatientMessage(input.type, input.patient, input.details);
        break;

      // ── Tâches Mistral (low-cost, IA française) ──
      case 'translate-medical':
        level = 'mistral';
        result = await mistralGenerate(input, { ...options, model: 'mistral-small-latest' });
        cost = 0.0002;
        break;
      case 'generate-message':
        // Upgrade : Mistral Small au lieu d'Ollama si disponible
        if (process.env.MISTRAL_API_KEY) {
          level = 'mistral';
          const msgPrompts = {
            rappel: `Écris un SMS de rappel de rendez-vous pour ${input.patient}. Détails: ${input.details}. Ton professionnel, vouvoiement, 2 phrases max.`,
            annulation: `Écris un SMS d'annulation de rendez-vous pour ${input.patient}. Détails: ${input.details}. Ton professionnel, vouvoiement, proposer de replanifier, 3 phrases max.`,
            confirmation: `Écris un SMS de confirmation de rendez-vous pour ${input.patient}. Détails: ${input.details}. Ton professionnel, vouvoiement, 2 phrases max.`,
            suivi: `Écris un SMS de suivi post-opératoire pour ${input.patient}. Détails: ${input.details}. Ton professionnel, vouvoiement, rappeler les consignes, 3 phrases max.`,
          };
          result = await mistralGenerate(msgPrompts[input.type] || msgPrompts.rappel, { maxTokens: 150 });
          cost = 0.0001;
        } else {
          level = 'ollama';
          result = await OLLAMA_TASKS.generatePatientMessage(input.type, input.patient, input.details);
        }
        break;
      case 'analyze-photo':
        // Vision : Pixtral (5x moins cher que Claude)
        if (process.env.MISTRAL_API_KEY && options.image) {
          level = 'mistral-pixtral';
          result = await mistralVision(options.image, input, { maxTokens: options.maxTokens || 300 });
          cost = 0.0005;
        } else {
          level = 'claude';
          result = await claudeGenerate(input, options);
          cost = 0.003;
        }
        break;

      // ── Tâches Claude API (premium, complexes) ──
      case 'generate-document':
      case 'generate-cr-implant':
        level = 'claude';
        result = await claudeGenerate(input, options);
        cost = 0.003;
        break;

      default:
        // Par défaut : essayer local → mistral → ollama → claude
        result = LOCAL_RULES.classifyIntent(input);
        if (result === 'general') {
          if (process.env.MISTRAL_API_KEY) {
            level = 'mistral';
            result = await mistralGenerate(input, { maxTokens: 300 });
            cost = 0.0002;
          } else {
            level = 'ollama';
            result = await ollamaGenerate(input, { maxTokens: 300 });
          }
        }
    }
  } catch (error) {
    // Fallback cascade : Mistral → Ollama → Claude
    if (level === 'mistral' || level === 'mistral-pixtral') {
      console.warn('[ia-router] Mistral failed, falling back to Ollama:', error.message);
      level = 'ollama-fallback';
      try {
        result = await ollamaGenerate(input, { maxTokens: 300 });
      } catch (e2) {
        console.warn('[ia-router] Ollama failed too, falling back to Claude:', e2.message);
        level = 'claude-fallback';
        try {
          result = await claudeGenerate(input, options);
          cost = 0.003;
        } catch (e3) {
          result = { error: 'IA indisponible', message: e3.message };
        }
      }
    } else if (level === 'ollama') {
      console.warn('[ia-router] Ollama failed, trying Mistral then Claude:', error.message);
      if (process.env.MISTRAL_API_KEY) {
        level = 'mistral-fallback';
        try {
          result = await mistralGenerate(input, { maxTokens: 300 });
          cost = 0.0002;
        } catch (e2) {
          level = 'claude-fallback';
          try { result = await claudeGenerate(input, options); cost = 0.003; }
          catch (e3) { result = { error: 'IA indisponible', message: e3.message }; }
        }
      } else {
        level = 'claude-fallback';
        try { result = await claudeGenerate(input, options); cost = 0.003; }
        catch (e2) { result = { error: 'IA indisponible', message: e2.message }; }
      }
    } else {
      result = { error: error.message };
    }
  }

  const duration = Date.now() - startTime;
  console.log(`[ia-router] ${task} → ${level} (${duration}ms, $${cost})`);

  return { result, level, duration, cost };
}

// =============================================
// HEALTH CHECK
// =============================================

async function healthCheck() {
  const status = { local: true, ollama: false, mistral: false, claude: false };

  // Test Ollama
  try {
    const res = await ollamaGenerate('test', { maxTokens: 5 });
    status.ollama = !!res;
  } catch (e) {
    status.ollama = false;
  }

  // Test Mistral
  status.mistral = !!process.env.MISTRAL_API_KEY;

  // Test Claude
  status.claude = !!process.env.ANTHROPIC_API_KEY;

  return status;
}

module.exports = {
  route,
  healthCheck,
  LOCAL_RULES,
  OLLAMA_TASKS,
  ollamaGenerate,
  mistralGenerate,
  mistralVision,
  claudeGenerate,
};
