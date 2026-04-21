// =============================================
// JADOMI RUSH — Filtrage anonymat IA
// Detecte et masque infos personnelles dans messages
// Utilise JADOMI IA (Claude Haiku)
// =============================================

const Anthropic = require('@anthropic-ai/sdk');

// Regex patterns pour detection rapide
const PATTERNS = {
  telephone: /(?:\+33|0033|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g,
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  url: /https?:\/\/[^\s]+/g,
  cp_complet: /\b\d{5}\b/g, // code postal seul = risque identification
};

// Pre-filtre regex rapide
function preFilterRegex(texte) {
  if (!texte) return { texte, detections: [] };
  const detections = [];
  let filtre = texte;

  // Telephone
  const tels = filtre.match(PATTERNS.telephone);
  if (tels) {
    detections.push({ type: 'telephone', values: tels });
    filtre = filtre.replace(PATTERNS.telephone, '[INFO MASQUEE]');
  }

  // Email
  const emails = filtre.match(PATTERNS.email);
  if (emails) {
    detections.push({ type: 'email', values: emails });
    filtre = filtre.replace(PATTERNS.email, '[INFO MASQUEE]');
  }

  // URLs
  const urls = filtre.match(PATTERNS.url);
  if (urls) {
    detections.push({ type: 'url', values: urls });
    filtre = filtre.replace(PATTERNS.url, '[INFO MASQUEE]');
  }

  return { texte: filtre, detections };
}

// Filtre IA avance (noms propres, adresses, references identifiantes)
let _anthropic = null;
function getClient() {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

async function filterIA(texte) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { texte, iaApplied: false, detections: [] };
  }

  try {
    const client = getClient();
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Tu es un filtre d'anonymat pour une plateforme de sous-traitance entre prothesistes dentaires.
Les prothesistes ne doivent JAMAIS connaitre l'identite de l'autre.

Analyse ce message et remplace par [INFO MASQUEE] :
- Noms propres de personnes ou entreprises
- Adresses postales (rue, numero)
- Numeros de telephone
- Adresses email
- Noms de villes specifiques (garde le departement si present)
- Toute reference permettant d'identifier un laboratoire

NE MASQUE PAS :
- Termes techniques dentaires (teintes, materiaux, marques de produits dentaires)
- Descriptions de travaux
- Prix et delais

Reponds UNIQUEMENT avec le message filtre, sans commentaire.
Si rien a masquer, reponds avec le message original tel quel.

Message a filtrer :
"${texte.replace(/"/g, '\\"')}"`
      }]
    });

    const filtre = msg.content[0]?.text || texte;
    const hasChanges = filtre !== texte;

    return {
      texte: filtre.trim(),
      iaApplied: true,
      detections: hasChanges ? [{ type: 'ia_filter', masked: true }] : []
    };
  } catch (e) {
    console.error('[anonymat-filter] IA error:', e.message);
    return { texte, iaApplied: false, detections: [] };
  }
}

// Pipeline complet : regex + IA
async function filtrerMessage(texte) {
  if (!texte) return { contenu_filtre: '', filtre_applique: false, infos_masquees: false, tentative_identification: false };

  // Etape 1 : pre-filtre regex
  const { texte: texteRegex, detections: detectionsRegex } = preFilterRegex(texte);

  // Etape 2 : filtre IA
  const { texte: texteIA, iaApplied, detections: detectionsIA } = await filterIA(texteRegex);

  const allDetections = [...detectionsRegex, ...detectionsIA];
  const hasDetections = allDetections.length > 0;
  const tentative = detectionsRegex.some(d => d.type === 'telephone' || d.type === 'email');

  return {
    contenu_filtre: texteIA,
    filtre_applique: hasDetections || iaApplied,
    infos_masquees: hasDetections,
    tentative_identification: tentative,
    detections: allDetections
  };
}

// Verifier si un message doit etre bloque (trop d'infos personnelles)
function doitBloquer(detections) {
  if (!detections || detections.length === 0) return false;
  const telOrEmail = detections.filter(d => d.type === 'telephone' || d.type === 'email');
  return telOrEmail.length > 0;
}

// Generer alias gemme stable pour un prothesiste
const GEMMES = [
  'Emeraude', 'Saphir', 'Rubis', 'Topaze', 'Amethyste', 'Opale',
  'Jade', 'Onyx', 'Grenat', 'Turquoise', 'Aigue-Marine', 'Citrine',
  'Peridot', 'Tanzanite', 'Morganite', 'Alexandrite', 'Spinelle',
  'Tourmaline', 'Zircon', 'Lapis-Lazuli', 'Cornaline', 'Agate',
  'Jaspe', 'Obsidienne', 'Quartz', 'Diamant', 'Perle', 'Ambre',
  'Chrysoprase', 'Kunzite', 'Larimar', 'Rhodonite', 'Sodalite',
  'Beryl', 'Iolite', 'Prehnite', 'Fluorite', 'Calcedoine',
  'Aventurine', 'Moldavite'
];

function genererAlias(prothesisteId) {
  // Hash stable du prothesiste_id pour toujours donner le meme alias
  const crypto = require('crypto');
  const hash = crypto.createHash('md5').update(String(prothesisteId)).digest('hex');
  const idx = parseInt(hash.slice(0, 8), 16) % GEMMES.length;
  return `Labo ${GEMMES[idx]}`;
}

module.exports = {
  filtrerMessage,
  doitBloquer,
  genererAlias,
  preFilterRegex,
  GEMMES
};
