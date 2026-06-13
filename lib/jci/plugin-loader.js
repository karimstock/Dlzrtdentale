'use strict';
/**
 * JCI — Plugin Loader
 *
 * Charge les configurations metier depuis les fichiers JSON.
 * Un plugin = un fichier JSON avec les types de nodes, edges, agents, regles.
 * ZERO code metier. Juste du JSON.
 *
 * Usage :
 *   const { loadPlugin, listPlugins } = require('./plugin-loader');
 *   const dental = loadPlugin('dental');
 *   const engine = new DecisionEngine(dental);
 */

const fs = require('fs');
const path = require('path');
const { validatePlugin } = require('./plugins/_schema');

const PLUGINS_DIR = path.join(__dirname, 'plugins');

// Cache en memoire (les plugins changent rarement)
const _cache = {};

/**
 * Charger un plugin par nom
 * @param {string} name — nom sans extension (ex: 'dental', 'legal')
 * @returns {object} config du plugin
 */
function loadPlugin(name) {
  if (_cache[name]) return _cache[name];

  const file = path.join(PLUGINS_DIR, `${name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Plugin "${name}" introuvable dans ${PLUGINS_DIR}`);
  }

  let plugin;
  try {
    plugin = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`Plugin "${name}" JSON invalide: ${e.message}`);
  }

  // Validation de la structure
  const errors = validatePlugin(plugin);
  if (errors.length > 0) {
    throw new Error(`Plugin "${name}" invalide:\n  ${errors.join('\n  ')}`);
  }

  _cache[name] = plugin;
  return plugin;
}

/**
 * Lister tous les plugins disponibles
 * @returns {string[]} noms des plugins
 */
function listPlugins() {
  try {
    return fs.readdirSync(PLUGINS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  } catch {
    return [];
  }
}

/**
 * Charger tous les plugins d'un coup
 * @returns {object} { dental: {...}, legal: {...}, ... }
 */
function loadAll() {
  const result = {};
  for (const name of listPlugins()) {
    try {
      result[name] = loadPlugin(name);
    } catch (e) {
      console.log(`[JCI-PLUGINS] Erreur chargement ${name}:`, e.message);
    }
  }
  return result;
}

/**
 * Vider le cache (utile apres modification d'un plugin)
 */
function clearCache() {
  Object.keys(_cache).forEach(k => delete _cache[k]);
}

module.exports = { loadPlugin, listPlugins, loadAll, clearCache };
