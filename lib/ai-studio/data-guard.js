// =============================================
// JADOMI DATA GUARD — Protection des données
// Filtre TOUT ce qui sort vers les API externes
// RIEN de sensible ne doit quitter le VPS
// =============================================

// Données qui ne doivent JAMAIS sortir vers une API externe
const SENSITIVE_PATTERNS = [
  // Identité fondateur
  /karim.bahmed|karim_bahmed|yahoo\.fr/gi,
  // Emails internes
  /noreply@jadomi\.fr/gi,
  // Clés API
  /sk[-_](?:test|live|prod)[a-zA-Z0-9_-]{20,}/g,
  /(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"]?[a-zA-Z0-9_-]{16,}/gi,
  // RPPS / NIR (numéros santé)
  /\b[12]\d{12}\b/g, // NIR (sécu)
  /\b1\d{10}\b/g, // RPPS
  // Numéros carte bancaire
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  // IBAN
  /FR\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{3}/gi,
];

// Données business sensibles
const BUSINESS_PATTERNS = [
  // Prix contrats
  /contrat\s*[-:]?\s*\d+%/gi,
  /remise\s*[-:]?\s*\d+%/gi,
  // Chiffre d'affaires
  /chiffre\s*d['']?affaire|CA\s*[:=]\s*\d/gi,
  // Noms de patients complets
  /patient\s*[:]\s*[A-ZÀ-Ü][a-zà-ü]+\s+[A-ZÀ-Ü][a-zà-ü]+/g,
];

/**
 * Nettoie un texte avant envoi à une API externe
 * @param {string} text - Texte à nettoyer
 * @param {string} provider - 'deepseek'|'mistral'|'claude'|'gemini'|'local'
 * @returns {{ cleaned: string, redacted: number, blocked: boolean }}
 */
function sanitizeForExternalAPI(text, provider) {
  // Local = pas de filtrage
  if (provider === 'local' || provider === 'ollama') {
    return { cleaned: text, redacted: 0, blocked: false };
  }

  let cleaned = text;
  let redacted = 0;

  // Toujours filtrer les données sensibles (tous les providers)
  for (const pattern of SENSITIVE_PATTERNS) {
    const matches = cleaned.match(pattern);
    if (matches) {
      redacted += matches.length;
      cleaned = cleaned.replace(pattern, '[CONFIDENTIEL]');
    }
  }

  // Pour les providers hors UE (DeepSeek, Gemini), filtrer aussi le business
  if (['deepseek', 'gemini'].includes(provider)) {
    for (const pattern of BUSINESS_PATTERNS) {
      const matches = cleaned.match(pattern);
      if (matches) {
        redacted += matches.length;
        cleaned = cleaned.replace(pattern, '[DONNÉE PROTÉGÉE]');
      }
    }
  }

  // Bloquer si trop de données sensibles détectées
  const blocked = redacted > 10;
  if (blocked) {
    console.warn(`[DATA-GUARD] BLOQUÉ : ${redacted} éléments sensibles détectés pour ${provider}`);
  } else if (redacted > 0) {
    console.log(`[DATA-GUARD] ${redacted} éléments masqués avant envoi à ${provider}`);
  }

  return { cleaned, redacted, blocked };
}

/**
 * Vérifie si un prompt contient des données patient identifiables
 * @param {string} text
 * @returns {boolean}
 */
function containsPatientData(text) {
  // Nom + prénom + données médicales
  const hasName = /(?:M\.|Mme|Dr|Patient)\s+[A-ZÀ-Ü][a-zà-ü]+/g.test(text);
  const hasMedical = /diagnostic|traitement|prescription|ordonnance|antécédent/i.test(text);
  return hasName && hasMedical;
}

/**
 * Recommande le meilleur provider selon la sensibilité des données
 * @param {string} text - Le prompt à envoyer
 * @param {string} task - Le type de tâche
 * @returns {string} 'local'|'ollama'|'mistral'|'claude'
 */
function recommendProvider(text, task) {
  // Données patient identifiables → LOCAL UNIQUEMENT
  if (containsPatientData(text)) return 'local';

  // Factures, prix, contrats → Ollama ou Claude (pas DeepSeek/Mistral)
  if (/facture|prix|contrat|fournisseur|remise/i.test(text)) return 'ollama';

  // Création de contenu (flyer, texte marketing) → n'importe qui (pas de données sensibles)
  if (['copywriting', 'design', 'marketing'].includes(task)) return 'any';

  // Classification produit → Ollama (c'est local et ça suffit)
  if (task === 'classify') return 'ollama';

  // Par défaut → Ollama d'abord
  return 'ollama';
}

// ═══ POLITIQUE DEEPSEEK — CE QU'IL PEUT ET NE PEUT PAS VOIR ═══
//
// AUTORISÉ (créatif générique, aucune donnée JADOMI) :
//   - Rédiger des titres marketing "Écris un titre pour un flyer dentaire"
//   - Proposer des layouts "Propose un layout 4 pages A4 premium"
//   - Copywriting générique "Écris un slogan pour un cabinet"
//   - Améliorer des prompts "Reformule ce prompt pour Vidu"
//   - Suggestions design "Propose des couleurs pour un thème médical"
//
// INTERDIT (données business, patient, stratégie) :
//   - Prix, remises, contrats fournisseurs
//   - Noms/refs produits spécifiques du catalogue JADOMI
//   - Données patient (nom, prénom, diagnostic, traitement)
//   - Emails, téléphones, adresses du fondateur
//   - Stratégie tarifaire, projections CA, valo
//   - Contenu scrappé de sites fournisseurs (prix concurrence)
//   - Codes CCAM, numéros RPPS, NIR
//
// SI DONNÉE SENSIBLE DÉTECTÉE → fallback Ollama (local, 0€, 0 fuite)

module.exports = {
  sanitizeForExternalAPI,
  containsPatientData,
  recommendProvider,
  SENSITIVE_PATTERNS,
  BUSINESS_PATTERNS
};
