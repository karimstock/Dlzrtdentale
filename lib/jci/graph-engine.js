'use strict';
/**
 * JCI — Knowledge Graph Engine
 *
 * Graphe generique : nodes types + edges types.
 * ZERO mot metier en dur. Les types viennent du plugin charge.
 * Utilise pgvector existant (lib/brain/vector-store.js) pour la recherche semantique.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

let _sb = null;
function sb() {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return _sb;
}

class GraphEngine {

  // ═══════════════════════════════════════
  // NODES
  // ═══════════════════════════════════════

  /**
   * Ajouter un node au graphe
   * @param {string} societeId
   * @param {object} node - { type, label, data }
   * @returns {object} node cree
   */
  async addNode(societeId, { type, label, data }) {
    if (!type || !label) throw new Error('type et label requis');
    const { data: node, error } = await sb().from('jci_nodes').insert({
      societe_id: societeId,
      type,
      label,
      data: data || {},
    }).select().single();
    if (error) throw new Error(`addNode: ${error.message}`);
    return node;
  }

  /**
   * Ajouter plusieurs nodes en batch
   */
  async addNodes(societeId, nodes) {
    const rows = nodes.map(n => ({
      societe_id: societeId,
      type: n.type,
      label: n.label,
      data: n.data || {},
    }));
    const { data, error } = await sb().from('jci_nodes').insert(rows).select();
    if (error) throw new Error(`addNodes: ${error.message}`);
    return data;
  }

  /**
   * Recuperer des nodes avec filtres
   */
  async getNodes(societeId, { type, search, limit } = {}) {
    let q = sb().from('jci_nodes').select('*').eq('societe_id', societeId);
    if (type) q = q.eq('type', type);
    if (search) q = q.ilike('label', `%${search}%`);
    q = q.order('created_at', { ascending: false });
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw new Error(`getNodes: ${error.message}`);
    return data || [];
  }

  /**
   * Recuperer un node par ID
   */
  async getNode(nodeId) {
    const { data, error } = await sb().from('jci_nodes').select('*').eq('id', nodeId).single();
    if (error) throw new Error(`getNode: ${error.message}`);
    return data;
  }

  /**
   * Mettre a jour un node
   */
  async updateNode(nodeId, updates) {
    const { data, error } = await sb().from('jci_nodes')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', nodeId).select().single();
    if (error) throw new Error(`updateNode: ${error.message}`);
    return data;
  }

  /**
   * Supprimer un node (cascade supprime les edges)
   */
  async deleteNode(nodeId) {
    const { error } = await sb().from('jci_nodes').delete().eq('id', nodeId);
    if (error) throw new Error(`deleteNode: ${error.message}`);
    return true;
  }

  // ═══════════════════════════════════════
  // EDGES
  // ═══════════════════════════════════════

  /**
   * Ajouter une relation entre deux nodes
   */
  async addEdge(societeId, { from_node, to_node, relation, weight, data }) {
    if (!from_node || !to_node || !relation) throw new Error('from_node, to_node, relation requis');
    const { data: edge, error } = await sb().from('jci_edges').insert({
      societe_id: societeId,
      from_node,
      to_node,
      relation,
      weight: weight || 1.0,
      data: data || {},
    }).select().single();
    if (error) throw new Error(`addEdge: ${error.message}`);
    return edge;
  }

  /**
   * Recuperer les edges d'un node
   * @param {string} direction - 'outgoing' | 'incoming' | 'both'
   */
  async getEdges(societeId, { nodeId, relation, direction } = {}) {
    if (!nodeId) {
      // Toutes les edges de la societe
      let q = sb().from('jci_edges').select('*').eq('societe_id', societeId);
      if (relation) q = q.eq('relation', relation);
      const { data, error } = await q;
      if (error) throw new Error(`getEdges: ${error.message}`);
      return data || [];
    }

    const dir = direction || 'both';
    let results = [];

    if (dir === 'outgoing' || dir === 'both') {
      let q = sb().from('jci_edges').select('*').eq('from_node', nodeId);
      if (relation) q = q.eq('relation', relation);
      const { data } = await q;
      if (data) results.push(...data);
    }

    if (dir === 'incoming' || dir === 'both') {
      let q = sb().from('jci_edges').select('*').eq('to_node', nodeId);
      if (relation) q = q.eq('relation', relation);
      const { data } = await q;
      if (data) results.push(...data);
    }

    return results;
  }

  /**
   * Supprimer une edge
   */
  async deleteEdge(edgeId) {
    const { error } = await sb().from('jci_edges').delete().eq('id', edgeId);
    if (error) throw new Error(`deleteEdge: ${error.message}`);
    return true;
  }

  // ═══════════════════════════════════════
  // QUERIES AVANCEES
  // ═══════════════════════════════════════

  /**
   * Voisinage d'un node a N niveaux de profondeur
   * Retourne les nodes connectes + les edges du chemin
   */
  async neighbors(societeId, nodeId, depth = 1) {
    const visited = new Set();
    const nodes = [];
    const edges = [];
    let frontier = [nodeId];

    for (let d = 0; d < depth; d++) {
      const nextFrontier = [];
      for (const nid of frontier) {
        if (visited.has(nid)) continue;
        visited.add(nid);

        const nodeEdges = await this.getEdges(societeId, { nodeId: nid, direction: 'both' });
        for (const e of nodeEdges) {
          edges.push(e);
          const neighbor = e.from_node === nid ? e.to_node : e.from_node;
          if (!visited.has(neighbor)) {
            nextFrontier.push(neighbor);
          }
        }
      }

      // Charger les nodes du frontier
      if (nextFrontier.length > 0) {
        for (const nid of nextFrontier) {
          try {
            const n = await this.getNode(nid);
            if (n) nodes.push(n);
          } catch { /* node supprime */ }
        }
      }

      frontier = nextFrontier;
    }

    return { nodes, edges };
  }

  /**
   * Cluster connecte : tous les nodes accessibles depuis un point
   */
  async cluster(societeId, nodeId) {
    return this.neighbors(societeId, nodeId, 10); // profondeur max raisonnable
  }

  /**
   * Comptage par type de node
   */
  async stats(societeId) {
    const { data, error } = await sb().from('jci_nodes')
      .select('type')
      .eq('societe_id', societeId);
    if (error) return {};

    const counts = {};
    for (const row of (data || [])) {
      counts[row.type] = (counts[row.type] || 0) + 1;
    }
    return counts;
  }
}

module.exports = GraphEngine;
