/**
 * JADOMI Agenda IA — Connecteur IA Multi-Provider
 *
 * Architecture optimale :
 * - Claude Sonnet 4 : Raisonnement complexe (analyse planning, optimisation, assistant vocal)
 * - Claude Haiku 4.5 : Tâches rapides (classification, scoring, messages patients)
 * - OpenAI GPT-4o-mini : Embeddings + classification rapide (fallback)
 * - OpenAI Whisper : Transcription vocale (STT)
 * - OpenAI TTS : Synthèse vocale (réponses assistant)
 *
 * Stratégie : Claude en priorité (meilleur raisonnement médical),
 * OpenAI en complément pour audio et embeddings.
 */

'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');

// === CLIENTS ===
const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// === MODÈLES ===
const MODELS = {
  // Raisonnement complexe : analyse planning, optimisation, suggestions
  reasoning: 'claude-sonnet-4-6',
  // Tâches rapides : scoring, classification, messages courts
  fast: 'claude-haiku-4-5-20251001',
  // Fallback OpenAI si quota Claude atteint
  fallback: 'gpt-4o-mini',
  // Transcription vocale
  stt: 'whisper-1',
  // Synthèse vocale
  tts: 'tts-1',
  // Embeddings (pour matching patients/actes futur)
  embeddings: 'text-embedding-3-small'
};

const { JADOMI_BASE_PROMPT, JADOMI_KNOWLEDGE } = require('../ai-studio/jadomi-brain');

// === SYSTEM PROMPTS (enrichis par JADOMI Brain) ===
const SYSTEM_PROMPTS = {
  analyzer: `${JADOMI_BASE_PROMPT}

Tu es l'IA d'analyse de planning de JADOMI, un agenda médical intelligent pour cabinets dentaires.

RÔLE : Analyser un planning journalier et produire un diagnostic précis.

CONTEXTE CLINIQUE :
- Cabinet dentaire en zone modeste (tarifs Sécu, pas de dépassements)
- Revenu = VOLUME (23+ patients/jour est normal et souhaitable)
- Optimiser = MEILLEUR ORDRE, pas moins de patients
- 1 fauteuil principal, assistant(e) dentaire
- Actes lourds : endodontie, extraction chirurgicale, implant, chirurgie paro
- Actes moyens : prothèse (empreinte, pose), composite complexe
- Actes légers : contrôle, détartrage, composite simple, urgence rapide

RÈGLES D'ANALYSE :
1. Score de sérénité 0-100 (pas de décimales)
2. Journée rouge = score < 50
3. Toujours expliquer POURQUOI (transparence)
4. Ne jamais suggérer de réduire le nombre de patients
5. Suggérer des réorganisations, pas des annulations
6. Considérer : pauses, enchaînements, fatigue, urgences, retards prévisibles
7. Les pauses sont une RESSOURCE MÉDICALE, pas du temps perdu

FORMAT DE RÉPONSE : JSON strict, pas de markdown.`,

  optimizer: `Tu es l'IA d'optimisation de planning de JADOMI.

MISSION : Réorganiser un planning pour maximiser la sérénité du praticien SANS réduire le nombre de patients.

PRINCIPES D'OPTIMISATION :
1. Actes lourds le matin (énergie maximale)
2. Actes légers l'après-midi (fatigue accumulée)
3. Pause 5min toutes les 90min minimum
4. Pause 10-15min après chirurgie/endo
5. Patient anxieux : pas après un acte stressant
6. Patient souvent en retard : fin de demi-journée
7. Urgences : garder 1 créneau libre par demi-journée
8. Jamais 2 actes lourds consécutifs sans pause
9. Varier les types d'actes (éviter monotonie = fatigue mentale)
10. Protéger le déjeuner (12h-14h minimum 45min)

CONTRAINTES ABSOLUES :
- Même nombre de patients avant/après
- Respecter les horaires d'ouverture du cabinet
- Ne pas déplacer les urgences déjà confirmées
- Le praticien décide, l'IA propose

FORMAT : JSON strict avec score_avant, score_apres, changements[].`,

  assistant: `Tu es l'assistant vocal intelligent de JADOMI, le secrétaire IA du cabinet dentaire.

PERSONNALITÉ :
- Professionnel, calme, efficace
- Tu comprends le jargon dentaire
- Tu proposes toujours plusieurs options
- Tu expliques ton raisonnement
- Tu ne décides jamais seul pour les actions sensibles

CAPACITÉS :
- Trouver des créneaux optimaux
- Analyser la charge d'une journée/semaine
- Proposer des déplacements de RDV
- Générer des messages patients
- Expliquer pourquoi un jour est chargé
- Suggérer des pauses
- Équilibrer entre praticiens (multi-praticien)

RÈGLES :
- Vouvoiement avec la secrétaire
- Toujours confirmer avant d'agir
- Proposer 2-3 options quand possible
- Être transparent sur les limites
- Ne jamais inventer des données

FORMAT : JSON avec intent, explanation, proposed_actions[].`,

  messenger: `Tu es le rédacteur de messages patients de JADOMI.

TON : Professionnel, bienveillant, diplomatique, rassurant.
LANGUE : Français, vouvoiement obligatoire.
STYLE : Phrases courtes, claires, sans jargon médical inutile.

RÈGLES ABSOLUES :
- Jamais de ton accusateur ou culpabilisant
- Jamais mentionner de "score" ou "profil" patient
- Toujours proposer une solution (nouveau créneau)
- Respecter le RGPD (pas de données sensibles dans SMS/email)
- Signer "Cabinet dentaire [nom]" ou "L'équipe JADOMI"
- Maximum 160 caractères pour SMS, 500 pour email

TYPES DE MESSAGES :
- Déplacement de RDV (proposer alternative)
- Rappel de ponctualité (doux, pas accusateur)
- Confirmation renforcée (patient à risque d'absence)
- Nouveau créneau proposé
- Message qualité de soin (après absence répétée)

FORMAT : JSON avec message, canal_suggere (sms/email), ton_utilise.`
};

// === FONCTIONS PRINCIPALES ===

/**
 * Analyse un planning journalier avec Claude (raisonnement)
 * @param {Object} dayData - Données du planning
 * @returns {Object} Analyse complète avec score et suggestions
 */
async function analyzePlanning(dayData) {
  const prompt = `Analyse ce planning dentaire et produis un diagnostic complet.

PLANNING DU ${dayData.date} :
${JSON.stringify(dayData.appointments, null, 2)}

PROFIL PRATICIEN :
${JSON.stringify(dayData.practitionerProfile || {}, null, 2)}

RÈGLES CABINET :
${JSON.stringify(dayData.rules || {}, null, 2)}

Produis un JSON avec :
{
  "score_serenite": number (0-100),
  "journee_rouge": boolean,
  "label": "Sereine" | "Acceptable" | "Tendue" | "Rouge" | "Critique",
  "metrics": { "nb_patients", "duree_totale_min", "taux_remplissage_pct", "temps_pause_total_min", "nb_actes_lourds", "nb_urgences" },
  "alertes": [{ "type": "danger|warning|info", "message": string, "impact_score": number }],
  "suggestions": [{ "priorite": 1-5, "action": string, "raison": string, "gain_score_estime": number }],
  "breakdown": { "charge": number, "pauses": number, "enchainements": number, "fatigue": number, "urgences": number }
}`;

  return await callClaude(MODELS.reasoning, SYSTEM_PROMPTS.analyzer, prompt);
}

/**
 * Optimise un planning (réorganisation sans suppression)
 * @param {Object} dayData - Planning actuel
 * @returns {Object} Planning optimisé avec justifications
 */
async function optimizePlanning(dayData) {
  const prompt = `Optimise ce planning dentaire. MÊME nombre de patients, MEILLEUR ordre.

PLANNING ACTUEL (${dayData.date}) :
${JSON.stringify(dayData.appointments, null, 2)}

PROFIL PRATICIEN :
${JSON.stringify(dayData.practitionerProfile || {}, null, 2)}

Produis un JSON avec :
{
  "score_avant": number,
  "score_apres": number,
  "gain": number,
  "planning_optimise": [{ "heure_debut", "heure_fin", "patient", "acte", "duree", "raison_placement": string }],
  "changements": [{ "patient", "avant": "HH:MM", "apres": "HH:MM", "raison" }],
  "pauses_inserees": [{ "heure", "duree_min", "raison" }],
  "explication": string
}`;

  return await callClaude(MODELS.reasoning, SYSTEM_PROMPTS.optimizer, prompt);
}

/**
 * Traite une commande vocale/texte de la secrétaire
 * @param {string} transcript - Texte ou transcription vocale
 * @param {Object} context - État actuel du cabinet
 * @returns {Object} Intent + actions proposées
 */
async function processAssistantCommand(transcript, context) {
  const prompt = `La secrétaire dit : "${transcript}"

CONTEXTE ACTUEL :
- Date : ${context.date || new Date().toISOString().split('T')[0]}
- Praticien : ${context.practitioner || 'Dr Principal'}
- Nb patients aujourd'hui : ${context.nb_patients || '?'}
- Score sérénité : ${context.score || '?'}/100
- Prochains créneaux libres : ${JSON.stringify(context.free_slots || [])}

PLANNING DU JOUR :
${JSON.stringify(context.appointments || [], null, 2)}

Analyse la demande et produis un JSON :
{
  "intent": "find_slot|reschedule|analyze|optimize|add_break|generate_message|redistribute|cancel|info",
  "confidence": number (0-1),
  "explanation": string (ce que tu as compris, en français),
  "proposed_actions": [{
    "type": string,
    "description": string,
    "data": object,
    "confirmation_needed": boolean,
    "risque": "bas|moyen|haut"
  }],
  "response_text": string (réponse parlée à la secrétaire),
  "alternatives": [string] (si plusieurs interprétations possibles)
}`;

  return await callClaude(MODELS.reasoning, SYSTEM_PROMPTS.assistant, prompt);
}

/**
 * Génère un message patient diplomatique
 * @param {Object} params - Type, contexte, patient
 * @returns {Object} Message formaté
 */
async function generatePatientMessage(params) {
  const prompt = `Génère un message patient.

TYPE : ${params.type}
PATIENT : ${params.patient_name || 'Patient'}
CONTEXTE : ${params.context || ''}
CABINET : ${params.cabinet_name || 'Cabinet dentaire'}
CANAL : ${params.canal || 'sms'}
${params.nouveau_creneau ? `NOUVEAU CRÉNEAU PROPOSÉ : ${params.nouveau_creneau}` : ''}
${params.historique ? `HISTORIQUE : ${params.historique}` : ''}

Produis un JSON :
{
  "message": string,
  "objet_email": string (si email),
  "canal_suggere": "sms|email|appel",
  "ton_utilise": string,
  "longueur": number (caractères),
  "variante_plus_ferme": string (optionnel, si absences répétées)
}`;

  return await callClaude(MODELS.fast, SYSTEM_PROMPTS.messenger, prompt);
}

/**
 * Scoring rapide d'un créneau (Haiku pour la vitesse)
 * @param {Object} slot - Créneau candidat
 * @param {Object} context - Contexte du jour
 * @returns {Object} Score et raisons
 */
async function scoreSlot(slot, context) {
  const prompt = `Score ce créneau de 0 à 100 pour placer "${slot.acte}" (${slot.duree}min) à ${slot.heure}.

CONTEXTE JOURNÉE :
- Patients avant : ${context.before_count || 0}
- Dernier acte avant : ${context.last_act || 'aucun'}
- Prochain acte après : ${context.next_act || 'aucun'}
- Heure : ${slot.heure}
- Score sérénité actuel jour : ${context.day_score || 75}
- Pause depuis : ${context.minutes_since_break || '?'} min
- Fiabilité patient : ${slot.patient_reliability || 80}/100

Réponds en JSON :
{ "score": number, "raisons_positives": [string], "raisons_negatives": [string], "recommandation": string }`;

  return await callClaude(MODELS.fast, SYSTEM_PROMPTS.analyzer, prompt);
}

/**
 * Transcription vocale (Whisper)
 * @param {Buffer} audioBuffer - Audio file buffer
 * @returns {string} Transcription texte
 */
async function transcribeAudio(audioBuffer) {
  try {
    const file = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });
    const response = await openai.audio.transcriptions.create({
      model: MODELS.stt,
      file: file,
      language: 'fr',
      prompt: 'Contexte : cabinet dentaire, secrétaire médicale, rendez-vous, patients, planning, détartrage, endodontie, prothèse, extraction, contrôle'
    });
    return response.text;
  } catch (err) {
    console.error('[JADOMI-AI] Erreur transcription:', err.message);
    return null;
  }
}

/**
 * Synthèse vocale (TTS) — réponse de l'assistant
 * @param {string} text - Texte à synthétiser
 * @returns {Buffer} Audio MP3
 */
async function synthesizeSpeech(text) {
  try {
    const response = await openai.audio.speech.create({
      model: MODELS.tts,
      voice: 'nova', // Voix féminine professionnelle, idéale secrétaire
      input: text,
      speed: 1.0
    });
    return Buffer.from(await response.arrayBuffer());
  } catch (err) {
    console.error('[JADOMI-AI] Erreur TTS:', err.message);
    return null;
  }
}

/**
 * Classification rapide d'intent (Haiku, ultra-rapide)
 * @param {string} text - Commande texte
 * @returns {Object} Intent classifié
 */
async function classifyIntent(text) {
  const prompt = `Classifie cette commande de secrétaire dentaire en UNE catégorie.

Commande : "${text}"

Catégories :
- find_slot : chercher un créneau
- reschedule : déplacer un RDV
- analyze : analyser planning
- optimize : optimiser journée
- add_break : ajouter pause
- generate_message : créer message patient
- redistribute : répartir entre praticiens
- cancel : annuler RDV
- info : question d'information
- lighten : alléger une journée

Réponds UNIQUEMENT en JSON : { "intent": string, "confidence": number, "entities": { "patient": string|null, "date": string|null, "duree": number|null, "acte": string|null } }`;

  return await callClaude(MODELS.fast, null, prompt);
}

// === HELPER : Appel Claude avec retry et parsing JSON ===
async function callClaude(model, systemPrompt, userPrompt, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const messages = [{ role: 'user', content: userPrompt }];
      const params = {
        model,
        max_tokens: 4096,
        messages
      };
      if (systemPrompt) params.system = systemPrompt;

      const response = await claude.messages.create(params);
      const text = response.content[0]?.text || '';

      // Extraire le JSON de la réponse
      return parseAIResponse(text);
    } catch (err) {
      if (attempt === maxRetries) {
        console.error(`[JADOMI-AI] Échec Claude (${model}) après ${maxRetries + 1} tentatives:`, err.message);
        // Fallback OpenAI si Claude échoue
        if (model !== MODELS.fallback) {
          return await callOpenAIFallback(systemPrompt, userPrompt);
        }
        throw err;
      }
      // Attendre avant retry (backoff exponentiel)
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

// === HELPER : Fallback OpenAI ===
async function callOpenAIFallback(systemPrompt, userPrompt) {
  try {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userPrompt });

    const response = await openai.chat.completions.create({
      model: MODELS.fallback,
      messages,
      max_tokens: 4096,
      temperature: 0.3
    });

    const text = response.choices[0]?.message?.content || '';
    return parseAIResponse(text);
  } catch (err) {
    console.error('[JADOMI-AI] Fallback OpenAI échoué:', err.message);
    return { error: 'Service IA temporairement indisponible', fallback: true };
  }
}

// === HELPER : Parse JSON depuis réponse IA ===
function parseAIResponse(text) {
  // Essayer parse direct
  try {
    return JSON.parse(text);
  } catch (e) {
    // Extraire JSON d'un bloc code
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[1].trim()); } catch (e2) {}
    }
    // Extraire premier objet JSON
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]); } catch (e3) {}
    }
    // Retourner le texte brut si pas de JSON
    return { raw_response: text, parse_error: true };
  }
}

// === HELPER : Vérification santé des providers ===
async function healthCheck() {
  const results = { claude: false, openai: false, timestamp: new Date().toISOString() };

  try {
    await claude.messages.create({
      model: MODELS.fast,
      max_tokens: 10,
      messages: [{ role: 'user', content: 'ping' }]
    });
    results.claude = true;
  } catch (e) { results.claude_error = e.message; }

  try {
    await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 10
    });
    results.openai = true;
  } catch (e) { results.openai_error = e.message; }

  return results;
}

// === EXPORTS ===
module.exports = {
  // Fonctions principales
  analyzePlanning,
  optimizePlanning,
  processAssistantCommand,
  generatePatientMessage,
  scoreSlot,
  classifyIntent,

  // Audio
  transcribeAudio,
  synthesizeSpeech,

  // Utils
  healthCheck,

  // Config (pour debug/admin)
  MODELS,
  SYSTEM_PROMPTS
};
