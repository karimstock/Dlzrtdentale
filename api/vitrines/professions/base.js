// =============================================
// JADOMI — Module Mon site internet
// professions/base.js — Helpers communs
// =============================================

/**
 * Extrait le nom de famille du professionnel depuis les sources disponibles.
 * Priorite : user_metadata (Supabase Auth) > societe.nom_dirigeant
 * Le nom de la societe n'est JAMAIS utilise comme nom de personne.
 */
function extractPersonName(userData, societeData) {
  const meta = (userData && userData.user_metadata) || {};
  // user_metadata.nom = nom de famille, user_metadata.prenom = prenom
  const nom = meta.nom || meta.last_name || meta.lastName
    || (societeData && societeData.nom_dirigeant) || '';
  const prenom = meta.prenom || meta.first_name || meta.firstName
    || (societeData && societeData.prenom_dirigeant) || '';
  return { nom, prenom };
}

/**
 * Formate le titre de politesse + nom du professionnel.
 * Ex: "Dr. Dupont" ou "M. Martin"
 * Fallback sans nom : "Docteur," / "Monsieur,"
 */
function formatProfessionalName(professionConfig, userData, societeData) {
  const { titre_politesse, titre_source } = professionConfig;
  const { nom, prenom } = extractPersonName(userData, societeData);

  if (titre_source === 'lastname') {
    // "Dr. Dupont" ou fallback "Docteur,"
    if (nom) return `${titre_politesse} ${nom}`;
    return titre_politesse === 'Dr.' ? 'Docteur' : titre_politesse;
  }
  // "M. Jean Dupont" ou fallback "Monsieur,"
  const full = [prenom, nom].filter(Boolean).join(' ');
  if (full) return `${titre_politesse} ${full}`;
  return titre_politesse;
}

/**
 * Construit le system prompt Claude a partir de la config profession,
 * des donnees societe, et des donnees user (Supabase Auth).
 * @param {object} professionConfig
 * @param {object} societeData - table societes
 * @param {string} mode - 'creation' | 'edition'
 * @param {object} [userData] - req.user (Supabase Auth, contient user_metadata)
 */
function buildSystemPrompt(professionConfig, societeData, mode, userData) {
  const { vocabulaire, system_prompt_intro } = professionConfig;

  const nomComplet = formatProfessionalName(professionConfig, userData, societeData);
  const nomCabinet = (societeData && societeData.nom) || '';
  const ville = (societeData && (societeData.ville || societeData.adresse_ville)) || '';
  const metier = professionConfig.description_courte || '';

  let prompt = system_prompt_intro;

  // Injection du contexte connu
  prompt += `\n\nCONTEXTE CONNU DU PROFESSIONNEL :
- Nom : ${nomComplet}
- ${vocabulaire.lieu} : ${nomCabinet}
- Ville : ${ville}
- Metier : ${metier}`;

  if (mode === 'edition') {
    prompt += `\n\nMODE EDITION :
Tu interviens sur un site deja cree. Le professionnel souhaite modifier des elements.
Quand tu identifies une modification precise, encadre-la avec :
<ACTION type="edit_text" section="[section_type]" field="[field_path]">
[nouveau contenu]
</ACTION>
ou
<ACTION type="regenerate_section" section="[section_type]">
[instructions pour la regeneration]
</ACTION>`;
  }

  return prompt;
}

/**
 * Parse le bloc <EXTRACTED_DATA> depuis la reponse Claude
 */
function parseExtractedData(text) {
  const match = text.match(/<EXTRACTED_DATA>\s*([\s\S]*?)\s*<\/EXTRACTED_DATA>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (err) {
    console.error('[vitrines/base] Erreur parse EXTRACTED_DATA:', err.message);
    return null;
  }
}

/**
 * Parse les balises <REQUEST_UPLOAD> depuis la reponse Claude
 * Retourne un array d'objets { type, category, required, multiple }
 */
function parseUploadRequests(text) {
  const requests = [];
  const regex = /<REQUEST_UPLOAD\s+type=['"](photo|video)['"][\s]+category=['"]([^'"]+)['"](?:\s+required=['"]([^'"]+)['"])?(?:\s+multiple=['"]([^'"]+)['"])?\s*\/>/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    requests.push({
      type: m[1],
      category: m[2],
      required: m[3] === 'true',
      multiple: m[4] === 'true'
    });
  }
  return requests;
}

/**
 * Retire les balises <REQUEST_UPLOAD .../> du texte visible
 */
function stripUploadTags(text) {
  return text.replace(/<REQUEST_UPLOAD\s[^>]*\/>/g, '').trim();
}

/**
 * Parse les actions depuis la reponse Claude (mode edition)
 */
function parseActions(text) {
  const actions = [];
  const regex = /<ACTION\s+type="([^"]+)"\s+section="([^"]+)"(?:\s+field="([^"]*)")?\s*>([\s\S]*?)<\/ACTION>/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    actions.push({
      type: m[1],
      section: m[2],
      field: m[3] || null,
      content: m[4].trim()
    });
  }
  return actions;
}

/**
 * Formate le message de bienvenue initial.
 * @param {object} professionConfig
 * @param {object} societeData - table societes
 * @param {object} [userData] - req.user (Supabase Auth)
 */
function formatGreeting(professionConfig, societeData, userData) {
  const { vocabulaire } = professionConfig;

  const nomComplet = formatProfessionalName(professionConfig, userData, societeData);
  const nomCabinet = (societeData && societeData.nom) || '';
  const ville = (societeData && (societeData.ville || societeData.adresse_ville)) || '';

  // Si la profession a un greeting personnalise (ex: avocat)
  if (professionConfig.custom_greeting) {
    return professionConfig.custom_greeting(nomComplet, nomCabinet, ville);
  }

  const lieu = vocabulaire.lieu || 'etablissement';

  // "votre cabinet Precision Dentaire a Roubaix"
  const lieuRef = nomCabinet
    ? `votre ${lieu} ${nomCabinet}${ville ? ' a ' + ville : ''}`
    : `votre ${lieu}${ville ? ' a ' + ville : ''}`;

  return `Bonjour ${nomComplet},\n\nJe suis votre assistant JADOMI pour la creation de votre site internet. Je connais deja ${lieuRef}, nous allons pouvoir avancer efficacement.\n\nAvez-vous deja un site internet actuellement ?`;
}

/**
 * Slugs reserves (domaines systeme)
 */
const RESERVED_SLUGS = [
  'www', 'api', 'app', 'admin', 'mail', 'dashboard', 'auth',
  'support', 'blog', 'docs', 'help', 'contact', 'billing',
  'login', 'signup', 'register', 'static', 'assets', 'public'
];

/**
 * Normalise une chaine en slug URL-safe
 */
function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
}

/**
 * Genere un slug a partir du nom de societe.
 * Ex: "Precision Dentaire" → "precision-dentaire"
 * Si deja pris, le suffixe -2, -3... sera gere par ensureUniqueSlug().
 */
function generateSlug(nomSociete, ville) {
  // Slug propre depuis le nom de societe uniquement
  let base = slugify(nomSociete || '');

  // Fallback : nom + ville si le nom seul est trop court ou reserve
  if (!base || base.length < 3 || RESERVED_SLUGS.includes(base)) {
    base = slugify([nomSociete, ville].filter(Boolean).join(' '));
  }

  // Dernier fallback
  if (!base || base.length < 3) {
    base = 'mon-site-' + Math.random().toString(36).substring(2, 6);
  }

  return base;
}

/**
 * S'assure que le slug est unique dans vitrines_sites.
 * Si "precision-dentaire" existe, essaie "precision-dentaire-2", etc.
 * @param {function} adminClient - admin() Supabase
 * @param {string} slug
 * @returns {string} slug unique
 */
async function ensureUniqueSlug(adminClient, slug) {
  // Verifier les reserves
  if (RESERVED_SLUGS.includes(slug)) {
    slug = slug + '-site';
  }

  const { data } = await adminClient
    .from('vitrines_sites')
    .select('slug')
    .eq('slug', slug)
    .maybeSingle();

  if (!data) return slug;

  // Slug pris, incrementer
  for (let i = 2; i <= 99; i++) {
    const candidate = slug + '-' + i;
    const { data: check } = await adminClient
      .from('vitrines_sites')
      .select('slug')
      .eq('slug', candidate)
      .maybeSingle();
    if (!check) return candidate;
  }

  // Fallback ultime
  return slug + '-' + Date.now().toString(36);
}

module.exports = {
  buildSystemPrompt,
  parseExtractedData,
  parseUploadRequests,
  stripUploadTags,
  parseActions,
  formatGreeting,
  generateSlug,
  ensureUniqueSlug,
  RESERVED_SLUGS
};
