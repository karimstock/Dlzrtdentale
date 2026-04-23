// =============================================
// JADOMI Studio — Moderateur de contenu
// Validation prompts avant generation IA
// =============================================

const FORBIDDEN_TERMS = [
  'garanti', 'miraculeux', 'meilleur au monde',
  'guerison garantie', 'traitement infaillible',
  'sans douleur garanti', 'resultats immediats',
  'zero risque', '100% succes', 'guerit tout',
  'remplace votre dentiste', 'sans ordonnance',
  'miracle', 'revolutionnaire garanti'
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

  // Termes medicaux trompeurs interdits
  const found = FORBIDDEN_TERMS.filter(t => lowerPrompt.includes(t));
  if (found.length > 0) {
    throw new Error(`prompt_moderation_failed: contient "${found[0]}". Les promesses medicales trompeuses sont interdites (code de deontologie).`);
  }

  // Contenus dangereux
  const dangerousFound = FORBIDDEN_CONTENT_TYPES.filter(t => lowerPrompt.includes(t));
  if (dangerousFound.length > 0) {
    throw new Error(`prompt_content_blocked: contenu interdit detecte`);
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
