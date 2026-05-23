// =============================================
// JADOMI AVOCAT — Knowledge Graph & Mémoire Stratégique Collective
// Graphe de relations juridiques prud'homal + apprentissage anonymisé
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { dispatch } = require('../../lib/legal-providers/legal-ia-router');

let _admin = null;
function admin() {
  if (!_admin) {
    _admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

// === AUTH MIDDLEWARE ===
async function requireAvocat(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requis' });
    const { data: { user }, error } = await admin().auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Token invalide' });
    req.userId = user.id;
    const societeId = req.headers['x-societe-id'];
    if (societeId) {
      const { data: role } = await admin().from('user_societe_roles').select('societe_id').eq('user_id', user.id).eq('societe_id', societeId).single();
      if (role) req.societeId = role.societe_id;
    }
    if (!req.societeId) {
      const { data: first } = await admin().from('user_societe_roles').select('societe_id').eq('user_id', user.id).limit(1).single();
      if (first) req.societeId = first.societe_id;
    }
    if (!req.societeId) return res.status(400).json({ error: 'Aucune organisation' });
    next();
  } catch { return res.status(401).json({ error: 'Authentification échouée' }); }
}

// ================================================
// POST /graph/build/:dossierId — Construire le graphe de relations
// ================================================
router.post('/graph/build/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const db = admin();

    // Charger les données du dossier
    const [piecesRes, timelineRes, contradictionsRes, analysesRes] = await Promise.all([
      db.from('avocat_pieces').select('*').eq('dossier_id', dossierId).eq('societe_id', req.societeId),
      db.from('avocat_timeline').select('*').eq('dossier_id', dossierId).eq('societe_id', req.societeId).order('date_evenement', { ascending: true }),
      db.from('avocat_contradictions').select('*').eq('dossier_id', dossierId).eq('societe_id', req.societeId),
      db.from('avocat_analyses').select('*').eq('dossier_id', dossierId).eq('societe_id', req.societeId).neq('type', 'knowledge_graph')
    ]);

    const pieces = piecesRes.data || [];
    const timeline = timelineRes.data || [];
    const contradictions = contradictionsRes.data || [];
    const analyses = analysesRes.data || [];

    // Construire le contexte pour l'IA
    const contexte = {
      pieces: pieces.map(p => ({ titre: p.titre || p.nom, type: p.type, description: p.description })),
      timeline: timeline.map(t => ({ date: t.date_evenement, evenement: t.titre || t.description, type: t.type })),
      contradictions: contradictions.map(c => ({ description: c.description, source: c.source, gravite: c.gravite })),
      analyses: analyses.map(a => ({ type: a.type, resume: typeof a.resultat === 'string' ? a.resultat.substring(0, 500) : JSON.stringify(a.resultat).substring(0, 500) }))
    };

    const systemPrompt = "Tu es un expert en droit prud'homal français. Tu analyses des dossiers juridiques et construis des graphes de relations. Réponds uniquement en JSON valide.";
    const userPrompt = `À partir des faits suivants, construis un graphe de relations juridiques.\n\nContexte du dossier :\n${JSON.stringify(contexte, null, 2)}\n\nRetourne un JSON strictement au format :\n{"nodes":[{"id":"n1","label":"...","type":"personne|entreprise|evenement|document|article_loi|juridiction","importance":1}],"edges":[{"source":"n1","target":"n2","relation":"...","type":"causal|temporel|juridique|contradictoire","poids":1}]}`;

    const { result, provider } = await dispatch('summarize_jurisprudence', systemPrompt, userPrompt, { maxTokens: 2000, json: true });

    // Parser le résultat
    let graphe;
    try {
      graphe = typeof result === 'string' ? JSON.parse(result) : result;
    } catch {
      // Tenter d'extraire le JSON du texte
      const jsonMatch = (result || '').match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        graphe = JSON.parse(jsonMatch[0]);
      } else {
        return res.status(500).json({ error: 'Impossible de parser le graphe généré' });
      }
    }

    // Valider la structure minimale
    if (!graphe.nodes || !Array.isArray(graphe.nodes)) {
      graphe = { nodes: [], edges: [] };
    }
    if (!graphe.edges || !Array.isArray(graphe.edges)) {
      graphe.edges = [];
    }

    // Stocker dans avocat_analyses
    const { data: saved, error: saveErr } = await db.from('avocat_analyses').insert({
      dossier_id: dossierId,
      societe_id: req.societeId,
      user_id: req.userId,
      type: 'knowledge_graph',
      resultat: graphe,
      provider: provider || 'unknown',
      created_at: new Date().toISOString()
    }).select().single();

    if (saveErr) {
      console.error('[knowledge-graph] Erreur sauvegarde:', saveErr.message);
      return res.status(500).json({ error: 'Erreur lors de la sauvegarde du graphe' });
    }

    res.json({ ok: true, graphe, id: saved.id });
  } catch (err) {
    console.error('[knowledge-graph] build error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la construction du graphe' });
  }
});

// ================================================
// GET /graph/:dossierId — Récupérer le dernier graphe
// ================================================
router.get('/graph/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const { data, error } = await admin()
      .from('avocat_analyses')
      .select('*')
      .eq('dossier_id', dossierId)
      .eq('societe_id', req.societeId)
      .eq('type', 'knowledge_graph')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return res.json({ ok: true, graphe: null, message: 'Aucun graphe trouvé pour ce dossier' });
    }

    res.json({ ok: true, graphe: data.resultat, id: data.id, created_at: data.created_at });
  } catch (err) {
    console.error('[knowledge-graph] get error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la récupération du graphe' });
  }
});

// ================================================
// POST /graph/relations — Relations d'un noeud spécifique
// ================================================
router.post('/graph/relations', requireAvocat, async (req, res) => {
  try {
    const { dossier_id, node_id } = req.body;
    if (!dossier_id || !node_id) {
      return res.status(400).json({ error: 'dossier_id et node_id sont requis' });
    }

    const { data, error } = await admin()
      .from('avocat_analyses')
      .select('resultat')
      .eq('dossier_id', dossier_id)
      .eq('societe_id', req.societeId)
      .eq('type', 'knowledge_graph')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data || !data.resultat) {
      return res.json({ ok: true, node: null, relations: [], message: 'Aucun graphe trouvé' });
    }

    const graphe = data.resultat;
    const node = (graphe.nodes || []).find(n => n.id === node_id);
    const relations = (graphe.edges || []).filter(e => e.source === node_id || e.target === node_id);

    // Enrichir les relations avec les labels des noeuds connectés
    const relationsEnrichies = relations.map(rel => {
      const autreId = rel.source === node_id ? rel.target : rel.source;
      const autreNode = (graphe.nodes || []).find(n => n.id === autreId);
      return {
        ...rel,
        autre_noeud: autreNode || { id: autreId, label: 'Inconnu' },
        direction: rel.source === node_id ? 'sortante' : 'entrante'
      };
    });

    res.json({ ok: true, node: node || null, relations: relationsEnrichies });
  } catch (err) {
    console.error('[knowledge-graph] relations error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la recherche des relations' });
  }
});

// ================================================
// POST /memoire/apprendre/:dossierId — Apprendre d'un dossier clos
// ================================================
router.post('/memoire/apprendre/:dossierId', requireAvocat, async (req, res) => {
  try {
    const { dossierId } = req.params;
    const db = admin();

    // Vérifier que le dossier est clos ou archivé
    const { data: dossier, error: dErr } = await db
      .from('avocat_dossiers')
      .select('*')
      .eq('id', dossierId)
      .eq('societe_id', req.societeId)
      .single();

    if (dErr || !dossier) {
      return res.status(404).json({ error: 'Dossier introuvable' });
    }

    const statutsValides = ['clos', 'archive', 'archivé', 'fermé'];
    if (!statutsValides.includes((dossier.statut || '').toLowerCase())) {
      return res.status(400).json({ error: 'Seuls les dossiers clos ou archivés peuvent être analysés pour la mémoire collective' });
    }

    // Charger les données du dossier
    const [analysesRes, scoresRes, piecesRes] = await Promise.all([
      db.from('avocat_analyses').select('type, resultat').eq('dossier_id', dossierId).eq('societe_id', req.societeId),
      db.from('avocat_dossier_scores').select('*').eq('dossier_id', dossierId).eq('societe_id', req.societeId),
      db.from('avocat_pieces').select('titre, type, description').eq('dossier_id', dossierId).eq('societe_id', req.societeId)
    ]);

    const analyses = analysesRes.data || [];
    const scores = scoresRes.data || [];
    const pieces = piecesRes.data || [];

    const contexte = {
      domaine: dossier.domaine || dossier.type_contentieux || 'prud\'homal',
      type_contentieux: dossier.type_contentieux || dossier.categorie || '',
      analyses_resume: analyses.map(a => ({
        type: a.type,
        extrait: typeof a.resultat === 'string' ? a.resultat.substring(0, 300) : JSON.stringify(a.resultat).substring(0, 300)
      })),
      scores: scores.map(s => ({ critere: s.critere, score: s.score, commentaire: s.commentaire })),
      types_pieces: pieces.map(p => p.type).filter(Boolean),
      issue: dossier.issue || dossier.resultat || ''
    };

    const systemPrompt = "Tu es un expert en droit prud'homal. Tu analyses des dossiers clos pour en extraire des enseignements stratégiques ANONYMISÉS. JAMAIS de noms, prénoms, emails, numéros de téléphone, adresses ou informations personnelles. Réponds uniquement en JSON valide.";
    const userPrompt = `Analyse ce dossier prud'homal clos. Extrais les enseignements stratégiques ANONYMISÉS.\n\nContexte anonymisé :\n${JSON.stringify(contexte, null, 2)}\n\nRetourne un JSON strictement au format :\n{"domaine":"...","type_contentieux":"...","strategies_gagnantes":["..."],"strategies_perdantes":["..."],"preuves_decisives":["..."],"arguments_efficaces":["..."],"arguments_faibles":["..."],"score_issue":0,"lecons":["..."],"mots_cles":["..."]}`;

    const { result } = await dispatch('summarize_dossier', systemPrompt, userPrompt, { maxTokens: 1500, json: true });

    let enseignements;
    try {
      enseignements = typeof result === 'string' ? JSON.parse(result) : result;
    } catch {
      const jsonMatch = (result || '').match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        enseignements = JSON.parse(jsonMatch[0]);
      } else {
        return res.status(500).json({ error: 'Impossible de parser les enseignements' });
      }
    }

    // Vérification anti-données personnelles basique
    const texteComplet = JSON.stringify(enseignements);
    const regexEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const regexTel = /(?:0[1-9]|\\+33)[\\s.-]?\\d{2}[\\s.-]?\\d{2}[\\s.-]?\\d{2}[\\s.-]?\\d{2}/g;
    if (regexEmail.test(texteComplet) || regexTel.test(texteComplet)) {
      return res.status(400).json({ error: 'Les enseignements contiennent des données personnelles. Anonymisation insuffisante.' });
    }

    // Stocker dans la mémoire collective
    const { data: saved, error: saveErr } = await db.from('avocat_memoire_collective').insert({
      societe_id: req.societeId,
      dossier_id: dossierId,
      domaine: enseignements.domaine || contexte.domaine,
      type_contentieux: enseignements.type_contentieux || contexte.type_contentieux,
      enseignements: enseignements,
      score_issue: enseignements.score_issue || 0,
      anonymise: true,
      created_at: new Date().toISOString()
    }).select().single();

    if (saveErr) {
      console.error('[knowledge-graph] memoire save error:', saveErr.message);
      return res.status(500).json({ error: 'Erreur lors de la sauvegarde en mémoire collective' });
    }

    res.json({ ok: true, enseignements, id: saved.id });
  } catch (err) {
    console.error('[knowledge-graph] apprendre error:', err.message);
    res.status(500).json({ error: 'Erreur lors de l\'apprentissage du dossier' });
  }
});

// ================================================
// GET /memoire/rechercher — Rechercher dans la mémoire collective
// ================================================
router.get('/memoire/rechercher', requireAvocat, async (req, res) => {
  try {
    const { domaine, type_contentieux, mots_cles } = req.query;
    const db = admin();

    let query = db
      .from('avocat_memoire_collective')
      .select('*')
      .eq('societe_id', req.societeId)
      .eq('anonymise', true)
      .order('score_issue', { ascending: false });

    if (domaine) {
      query = query.ilike('domaine', `%${domaine}%`);
    }
    if (type_contentieux) {
      query = query.ilike('type_contentieux', `%${type_contentieux}%`);
    }

    const { data, error } = await query.limit(50);

    if (error) {
      console.error('[knowledge-graph] rechercher error:', error.message);
      return res.status(500).json({ error: 'Erreur lors de la recherche' });
    }

    let resultats = data || [];

    // Filtrage par mots-clés côté serveur
    if (mots_cles) {
      const motsClesArray = mots_cles.split(',').map(m => m.trim().toLowerCase()).filter(Boolean);
      if (motsClesArray.length > 0) {
        resultats = resultats.filter(r => {
          const texte = JSON.stringify(r.enseignements).toLowerCase();
          return motsClesArray.some(mot => texte.includes(mot));
        });
      }
    }

    // Trier par pertinence (nombre de mots-clés trouvés)
    if (mots_cles) {
      const motsClesArray = mots_cles.split(',').map(m => m.trim().toLowerCase()).filter(Boolean);
      resultats.sort((a, b) => {
        const texteA = JSON.stringify(a.enseignements).toLowerCase();
        const texteB = JSON.stringify(b.enseignements).toLowerCase();
        const scoreA = motsClesArray.filter(m => texteA.includes(m)).length;
        const scoreB = motsClesArray.filter(m => texteB.includes(m)).length;
        return scoreB - scoreA;
      });
    }

    res.json({
      ok: true,
      resultats: resultats.map(r => ({
        id: r.id,
        domaine: r.domaine,
        type_contentieux: r.type_contentieux,
        score_issue: r.score_issue,
        enseignements: r.enseignements,
        created_at: r.created_at
      })),
      total: resultats.length
    });
  } catch (err) {
    console.error('[knowledge-graph] rechercher error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la recherche en mémoire collective' });
  }
});

// ================================================
// GET /memoire/tendances — Analyse des patterns collectifs
// ================================================
router.get('/memoire/tendances', requireAvocat, async (req, res) => {
  try {
    const db = admin();
    const { data, error } = await db
      .from('avocat_memoire_collective')
      .select('domaine, type_contentieux, score_issue, enseignements')
      .eq('societe_id', req.societeId)
      .eq('anonymise', true);

    if (error) {
      console.error('[knowledge-graph] tendances error:', error.message);
      return res.status(500).json({ error: 'Erreur lors de l\'analyse des tendances' });
    }

    const items = data || [];
    if (items.length === 0) {
      return res.json({ ok: true, tendances: null, message: 'Aucune donnée en mémoire collective' });
    }

    // Analyse par type de contentieux
    const parType = {};
    items.forEach(item => {
      const type = item.type_contentieux || item.domaine || 'Autre';
      if (!parType[type]) {
        parType[type] = { count: 0, scores: [], strategies_gagnantes: {}, preuves_decisives: {}, arguments_efficaces: {} };
      }
      parType[type].count++;
      parType[type].scores.push(item.score_issue || 0);

      const ens = item.enseignements || {};
      (ens.strategies_gagnantes || []).forEach(s => {
        parType[type].strategies_gagnantes[s] = (parType[type].strategies_gagnantes[s] || 0) + 1;
      });
      (ens.preuves_decisives || []).forEach(p => {
        parType[type].preuves_decisives[p] = (parType[type].preuves_decisives[p] || 0) + 1;
      });
      (ens.arguments_efficaces || []).forEach(a => {
        parType[type].arguments_efficaces[a] = (parType[type].arguments_efficaces[a] || 0) + 1;
      });
    });

    // Construire le résumé des tendances
    const tendances = Object.entries(parType).map(([type, data]) => {
      const scoreMoyen = data.scores.length > 0
        ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
        : 0;

      const topStrategies = Object.entries(data.strategies_gagnantes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([strategie, count]) => ({ strategie, frequence: count }));

      const topPreuves = Object.entries(data.preuves_decisives)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([preuve, count]) => ({ preuve, frequence: count }));

      const topArguments = Object.entries(data.arguments_efficaces)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([argument, count]) => ({ argument, frequence: count }));

      return {
        type_contentieux: type,
        nombre_dossiers: data.count,
        score_moyen_issue: scoreMoyen,
        taux_succes: data.scores.filter(s => s >= 60).length + '/' + data.scores.length,
        strategies_les_plus_efficaces: topStrategies,
        preuves_les_plus_decisives: topPreuves,
        arguments_les_plus_efficaces: topArguments
      };
    }).sort((a, b) => b.nombre_dossiers - a.nombre_dossiers);

    res.json({ ok: true, tendances, total_dossiers: items.length });
  } catch (err) {
    console.error('[knowledge-graph] tendances error:', err.message);
    res.status(500).json({ error: 'Erreur lors de l\'analyse des tendances' });
  }
});

// ================================================
// GET /memoire/stats — Statistiques de la mémoire collective
// ================================================
router.get('/memoire/stats', requireAvocat, async (req, res) => {
  try {
    const db = admin();
    const { data, error } = await db
      .from('avocat_memoire_collective')
      .select('domaine, type_contentieux, score_issue, created_at')
      .eq('societe_id', req.societeId)
      .eq('anonymise', true);

    if (error) {
      console.error('[knowledge-graph] stats error:', error.message);
      return res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
    }

    const items = data || [];
    const domaines = [...new Set(items.map(i => i.domaine).filter(Boolean))];
    const typesContentieux = [...new Set(items.map(i => i.type_contentieux).filter(Boolean))];
    const scores = items.map(i => i.score_issue || 0);
    const scoreMoyen = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

    // Dernier apprentissage
    const dernierApprentissage = items.length > 0
      ? items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0].created_at
      : null;

    res.json({
      ok: true,
      stats: {
        nombre_dossiers_analyses: items.length,
        domaines_couverts: domaines,
        nombre_domaines: domaines.length,
        types_contentieux: typesContentieux,
        nombre_types: typesContentieux.length,
        score_moyen_issue: scoreMoyen,
        score_min: scores.length > 0 ? Math.min(...scores) : 0,
        score_max: scores.length > 0 ? Math.max(...scores) : 0,
        dernier_apprentissage: dernierApprentissage
      }
    });
  } catch (err) {
    console.error('[knowledge-graph] stats error:', err.message);
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
  }
});

module.exports = router;
