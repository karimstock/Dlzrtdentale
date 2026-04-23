// =============================================
// JADOMI — Module Mon site internet
// professions/index.js — Registry des 18 professions
// =============================================

const registry = {};

function register(config) {
  registry[config.id] = config;
}

// --- Sante (7) ---
register(require('./dentiste'));
register(require('./prothesiste'));
register(require('./medecin'));
register(require('./kine'));
register(require('./osteopathe'));
register(require('./orthoptiste'));
register(require('./sage_femme'));

// --- Professions liberales (4) ---
register(require('./avocat'));
register(require('./notaire'));
register(require('./expert_comptable'));
register(require('./architecte'));

// --- Beaute & bien-etre (2) ---
register(require('./coiffeur'));
register(require('./estheticienne'));

// --- Commerce (4) ---
register(require('./boutique_mode'));
register(require('./bijoutier'));
register(require('./fleuriste'));
register(require('./maroquinier'));

// --- Restauration (2) ---
register(require('./restaurant'));
register(require('./traiteur'));

// --- Artisanat (1) ---
register(require('./plombier'));

/**
 * Retourne la config d'une profession par son id
 */
function getProfession(professionId) {
  return registry[professionId] || null;
}

/**
 * Liste toutes les professions enregistrees
 */
function listProfessions() {
  return Object.values(registry).map(p => ({
    id: p.id,
    label: p.label,
    label_plural: p.label_plural,
    category: p.category
  }));
}

/**
 * Verifie si une profession est enregistree
 */
function isProfessionAvailable(professionId) {
  return !!registry[professionId];
}

module.exports = {
  getProfession,
  listProfessions,
  isProfessionAvailable
};
