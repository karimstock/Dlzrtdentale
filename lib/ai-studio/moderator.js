// =============================================
// JADOMI Studio — Modérateur de contenu STRICT
// Validation prompts avant TOUTE génération IA
// Politique : ZÉRO TOLÉRANCE
// =============================================

const FORBIDDEN_MEDICAL = [
  'garanti', 'miraculeux', 'meilleur au monde',
  'guérison garantie', 'traitement infaillible',
  'sans douleur garanti', 'résultats immédiats',
  'zéro risque', '100% succès', 'guérit tout',
  'remplace votre dentiste', 'sans ordonnance',
  'miracle', 'révolutionnaire garanti'
];

// ── CONTENUS BANNIS — ZÉRO TOLÉRANCE ──
const BANNED_CONTENT = [
  // Pédocriminalité
  'child porn', 'cp', 'pédophil', 'pedophil', 'minor sex', 'enfant nu',
  'child abuse', 'underage', 'mineur nu', 'lolita', 'preteen',
  // Sexuel / Pornographique
  'nude', 'naked', 'porn', 'xxx', 'hentai', 'nsfw', 'sexuel explicite',
  'acte sexuel', 'orgasme', 'masturbat', 'érotique', 'erotic',
  'strip', 'fetish', 'bdsm', 'escort',
  // Racisme
  'nègre', 'nigger', 'negro', 'race supérieure', 'suprémaciste',
  'white power', 'supremacist', 'ethnic cleansing', 'nettoyage ethnique',
  // Homophobie
  'homophob', 'anti-gay', 'anti gay', 'faggot', 'pédé',
  'contre les homosexuel', 'sodomite',
  // Misogynie / Violence femmes
  'frapper une femme', 'battre sa femme', 'viol', 'rape',
  'objectification', 'femme soumise', 'femme objet',
  // Haine nationale / religieuse
  'islamophob', 'antisémit', 'antisemit', 'anti-arabe',
  'mort aux', 'exterminer', 'génocide', 'genocide',
  // Violence graphique
  'gore', 'torture', 'mutilation', 'décapitation', 'beheading',
  'dismember', 'massacre', 'snuff',
  // Terrorisme
  'terroris', 'bombe', 'bomb', 'attentat', 'jihad', 'radicalisation',
  'how to make a weapon', 'fabriquer une arme',
  // Drogues
  'cocaïne', 'cocaine', 'héroïne', 'heroin', 'methamphet', 'crack',
  'fabriquer de la drogue', 'drug recipe',
  // Harcèlement
  'harcel', 'stalking', 'doxxing', 'dox', 'swatting',
  // Armes
  'weapon', 'firearm', 'arme à feu', 'fusil', 'gun', 'assault rifle'
];

// ── CATÉGORIES BANNIES (pour détection IA image/vidéo) ──
const BANNED_CATEGORIES = [
  'nude', 'violence', 'gore', 'weapon', 'child', 'minor',
  'drug', 'illegal', 'hate', 'terror', 'sexual', 'racist',
  'pornographic', 'extremist'
];

function validatePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('prompt_required');
  }
  if (prompt.length < 5) {
    throw new Error('prompt_too_short');
  }
  if (prompt.length > 4000) {
    throw new Error('prompt_too_long');
  }

  const lower = prompt.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const lowerOriginal = prompt.toLowerCase();

  // Termes médicaux trompeurs
  const medicalFound = FORBIDDEN_MEDICAL.filter(t => lowerOriginal.includes(t));
  if (medicalFound.length > 0) {
    throw new Error(`prompt_moderation_failed: contient "${medicalFound[0]}". Les promesses médicales trompeuses sont interdites (code de déontologie).`);
  }

  // Contenus bannis — ZÉRO TOLÉRANCE
  const bannedFound = BANNED_CONTENT.filter(t => {
    const termNorm = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return lower.includes(termNorm) || lowerOriginal.includes(t);
  });
  if (bannedFound.length > 0) {
    // Log la tentative pour audit
    try {
      const fs = require('fs');
      fs.appendFileSync('/tmp/jadomi-moderation-blocked.log',
        `[${new Date().toISOString()}] BLOCKED: "${bannedFound[0]}" in prompt (${prompt.length} chars)\n`
      );
    } catch(e) {}
    throw new Error('content_policy_violation: contenu interdit par la politique JADOMI. Cette tentative a été enregistrée.');
  }

  // Catégories dangereuses
  const catFound = BANNED_CATEGORIES.filter(t => lower.includes(t));
  if (catFound.length > 0) {
    throw new Error('content_policy_violation: catégorie de contenu interdite.');
  }

  return true;
}

function validateText(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('text_required');
  }
  if (text.length < 2) {
    throw new Error('text_too_short');
  }
  if (text.length > 10000) {
    throw new Error('text_too_long (max 10000 chars)');
  }
  return true;
}

// System prompt de modération pour agents DeepSeek
// Importer le brain JADOMI pour le system prompt enrichi
const { JADOMI_BASE_PROMPT } = require('./jadomi-brain');

const MODERATION_SYSTEM_PROMPT = JADOMI_BASE_PROMPT + `

REFUS OBLIGATOIRE — Si on te demande du contenu interdit, réponds :
"Je ne peux pas générer ce type de contenu. JADOMI est une plateforme professionnelle pour les professionnels de santé."
Ne jamais expliquer pourquoi en détail. Refuser fermement et proposer une alternative.`;

module.exports = { validatePrompt, validateText, MODERATION_SYSTEM_PROMPT, BANNED_CONTENT, BANNED_CATEGORIES };
