'use strict';
/**
 * JCI — Plugin Schema Validation
 *
 * Valide la structure d'un plugin metier (fichier JSON).
 * Un plugin DOIT definir : name, node_types, edge_types, agents.
 * Un plugin PEUT definir : contradictory_roles, authority, trust, debate.
 *
 * ZERO vocabulaire metier dans ce fichier.
 * Les types sont des strings libres — le moteur ne les interprete pas.
 */

/**
 * Valide un objet plugin
 * @param {object} plugin — le contenu du JSON
 * @returns {string[]} liste d'erreurs (vide = valide)
 */
function validatePlugin(plugin) {
  const errors = [];

  if (!plugin || typeof plugin !== 'object') {
    return ['Le plugin doit etre un objet JSON'];
  }

  // --- Champs obligatoires ---
  if (!plugin.name || typeof plugin.name !== 'string') {
    errors.push('Champ "name" requis (string)');
  }

  if (!Array.isArray(plugin.node_types) || plugin.node_types.length === 0) {
    errors.push('Champ "node_types" requis (array non vide de strings)');
  } else {
    for (const nt of plugin.node_types) {
      if (typeof nt !== 'string') errors.push(`node_type invalide: ${JSON.stringify(nt)} — doit etre un string`);
    }
  }

  if (!Array.isArray(plugin.edge_types) || plugin.edge_types.length === 0) {
    errors.push('Champ "edge_types" requis (array non vide)');
  } else {
    for (const et of plugin.edge_types) {
      if (!et.type) errors.push('Chaque edge_type doit avoir un champ "type"');
      if (!et.from) errors.push(`edge_type "${et.type}": champ "from" requis`);
      if (!et.to) errors.push(`edge_type "${et.type}": champ "to" requis`);
      // Verifier que from/to existent dans node_types
      if (plugin.node_types && et.from && !plugin.node_types.includes(et.from)) {
        errors.push(`edge_type "${et.type}": from "${et.from}" n'existe pas dans node_types`);
      }
      if (plugin.node_types && et.to && !plugin.node_types.includes(et.to)) {
        errors.push(`edge_type "${et.type}": to "${et.to}" n'existe pas dans node_types`);
      }
    }
  }

  if (!Array.isArray(plugin.agents) || plugin.agents.length === 0) {
    errors.push('Champ "agents" requis (array non vide)');
  } else {
    for (const a of plugin.agents) {
      if (!a.role) errors.push('Chaque agent doit avoir un champ "role"');
      if (!a.prompt) errors.push(`Agent "${a.role}": champ "prompt" requis`);
    }
  }

  // --- Champs optionnels ---
  if (plugin.contradictory_roles) {
    if (!Array.isArray(plugin.contradictory_roles)) {
      errors.push('"contradictory_roles" doit etre un array');
    } else {
      for (const c of plugin.contradictory_roles) {
        if (!c.role) errors.push('Chaque contradictory_role doit avoir un champ "role"');
        if (!c.prompt) errors.push(`Contradictory "${c.role}": champ "prompt" requis`);
      }
    }
  }

  if (plugin.authority) {
    if (typeof plugin.authority !== 'object') {
      errors.push('"authority" doit etre un objet { role: "veto"|"execute"|"propose" }');
    } else {
      const validLevels = ['veto', 'execute', 'propose'];
      for (const [role, level] of Object.entries(plugin.authority)) {
        if (!validLevels.includes(level)) {
          errors.push(`authority "${role}": niveau "${level}" invalide — doit etre: ${validLevels.join(', ')}`);
        }
      }
    }
  }

  if (plugin.trust) {
    if (typeof plugin.trust !== 'object') {
      errors.push('"trust" doit etre un objet');
    } else if (plugin.trust.threshold !== undefined) {
      if (typeof plugin.trust.threshold !== 'number' || plugin.trust.threshold < 0 || plugin.trust.threshold > 1) {
        errors.push('"trust.threshold" doit etre un nombre entre 0 et 1');
      }
    }
  }

  if (plugin.debate) {
    if (typeof plugin.debate !== 'object') {
      errors.push('"debate" doit etre un objet');
    } else {
      if (plugin.debate.maxRounds !== undefined && (typeof plugin.debate.maxRounds !== 'number' || plugin.debate.maxRounds < 1)) {
        errors.push('"debate.maxRounds" doit etre un nombre >= 1');
      }
      if (plugin.debate.minAgents !== undefined && (typeof plugin.debate.minAgents !== 'number' || plugin.debate.minAgents < 2)) {
        errors.push('"debate.minAgents" doit etre un nombre >= 2');
      }
    }
  }

  return errors;
}

module.exports = { validatePlugin };
