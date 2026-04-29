// =============================================
// JADOMI Studio — Modérateur de contenu
// Validation prompts avant génération IA
// =============================================

const FORBIDDEN_TERMS = [
  'garanti', 'miraculeux', 'meilleur au monde',
  'guérison garantie', 'traitement infaillible',
  'sans douleur garanti', 'résultats immédiats',
  'zéro risque', '100% succès', 'guérit tout',
  'remplace votre dentiste', 'sans ordonnance',
  'miracle', 'révolutionnaire garanti'
];

const FORBIDDEN_CONTENT_TYPES = [
  'nude', 'violence', 'gore', 'weapon',
  'child', 'minor', 'drug', 'illegal'
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

  const lowerPrompt = prompt.toLowerCase();

  // Termes médicaux trompeurs interdits
  const found = FORBIDDEN_TERMS.filter(t => lowerPrompt.includes(t));
  if (found.length > 0) {
    throw new Error(`prompt_moderation_failed: contient "${found[0]}". Les promesses médicales trompeuses sont interdites (code de déontologie).`);
  }

  // Contenus dangereux
  const dangerousFound = FORBIDDEN_CONTENT_TYPES.filter(t => lowerPrompt.includes(t));
  if (dangerousFound.length > 0) {
    throw new Error(`prompt_content_blocked: contenu interdit détecté`);
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

module.exports = { validatePrompt, validateText };
