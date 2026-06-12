// =============================================
// JADOMI AVOCAT — Données juridiques (Légifrance + Judilibre)
// Endpoints de recherche pour le dashboard avocat
// Sources : PISTE OAuth2 → Légifrance v2.4 + Judilibre v1.0
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const legifrance = require('../../lib/legal-providers/legifrance');
const judilibre = require('../../lib/legal-providers/judilibre');

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
      const { data: role } = await admin().from('user_societe_roles')
        .select('societe_id').eq('user_id', user.id).eq('societe_id', societeId).single();
      if (role) req.societeId = role.societe_id;
    }
    if (!req.societeId) {
      const { data: first } = await admin().from('user_societe_roles')
        .select('societe_id').eq('user_id', user.id).limit(1).single();
      if (first) req.societeId = first.societe_id;
    }
    if (!req.societeId) return res.status(400).json({ error: 'Aucune organisation' });
    next();
  } catch {
    return res.status(401).json({ error: 'Authentification échouée' });
  }
}

// ================================================
// LÉGIFRANCE — Recherche dans les codes
// GET /codes/search?q=&code=&page=&pageSize=
// ================================================
router.get('/codes/search', requireAvocat, async (req, res) => {
  try {
    const { q, code, page, pageSize } = req.query;
    if (!q) return res.status(400).json({ error: 'Paramètre q requis' });

    const result = await legifrance.searchCode(q, {
      codeId: code || null,
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 10
    });

    // Cache en base si résultats
    if (result.results && result.results.length > 0) {
      cacheResults('code', q, result).catch(() => {});
    }

    return res.json(result);
  } catch (err) {
    console.error('[legal-data/codes/search]', err.message);
    return res.status(502).json({ error: 'Erreur Légifrance : ' + err.message });
  }
});

// ================================================
// LÉGIFRANCE — Article par ID
// GET /codes/article/:id
// ================================================
router.get('/codes/article/:id', requireAvocat, async (req, res) => {
  try {
    const result = await legifrance.getArticle(req.params.id);
    return res.json(result);
  } catch (err) {
    console.error('[legal-data/codes/article]', err.message);
    return res.status(502).json({ error: 'Erreur Légifrance : ' + err.message });
  }
});

// ================================================
// LÉGIFRANCE — Liste des codes disponibles
// GET /codes/list
// ================================================
router.get('/codes/list', requireAvocat, async (req, res) => {
  try {
    const result = await legifrance.listCodes();
    return res.json(result);
  } catch (err) {
    console.error('[legal-data/codes/list]', err.message);
    return res.status(502).json({ error: 'Erreur Légifrance : ' + err.message });
  }
});

// ================================================
// LÉGIFRANCE — Table des matières d'un code
// GET /codes/:codeId/tdm
// ================================================
router.get('/codes/:codeId/tdm', requireAvocat, async (req, res) => {
  try {
    const result = await legifrance.getCodeTDM(req.params.codeId);
    return res.json(result);
  } catch (err) {
    console.error('[legal-data/codes/tdm]', err.message);
    return res.status(502).json({ error: 'Erreur Légifrance : ' + err.message });
  }
});

// ================================================
// LÉGIFRANCE — Texte de loi par ID
// GET /textes/:id
// ================================================
router.get('/textes/:id', requireAvocat, async (req, res) => {
  try {
    const result = await legifrance.getTexte(req.params.id);
    return res.json(result);
  } catch (err) {
    console.error('[legal-data/textes]', err.message);
    return res.status(502).json({ error: 'Erreur Légifrance : ' + err.message });
  }
});

// ================================================
// LÉGIFRANCE — Recherche jurisprudence judiciaire
// GET /jurisprudence/judiciaire?q=&page=&dateDebut=&dateFin=
// ================================================
router.get('/jurisprudence/judiciaire', requireAvocat, async (req, res) => {
  try {
    const { q, page, pageSize, dateDebut, dateFin } = req.query;
    if (!q) return res.status(400).json({ error: 'Paramètre q requis' });

    const result = await legifrance.searchJurisprudenceJudiciaire(q, {
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 10,
      dateDebut: dateDebut || null,
      dateFin: dateFin || null
    });

    if (result.results && result.results.length > 0) {
      cacheResults('jurisprudence_judiciaire', q, result).catch(() => {});
    }

    return res.json(result);
  } catch (err) {
    console.error('[legal-data/jurisprudence/judiciaire]', err.message);
    return res.status(502).json({ error: 'Erreur Légifrance : ' + err.message });
  }
});

// ================================================
// LÉGIFRANCE — Recherche jurisprudence administrative
// GET /jurisprudence/admin?q=&page=
// ================================================
router.get('/jurisprudence/admin', requireAvocat, async (req, res) => {
  try {
    const { q, page, pageSize } = req.query;
    if (!q) return res.status(400).json({ error: 'Paramètre q requis' });

    const result = await legifrance.searchJurisprudenceAdmin(q, {
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 10
    });

    return res.json(result);
  } catch (err) {
    console.error('[legal-data/jurisprudence/admin]', err.message);
    return res.status(502).json({ error: 'Erreur Légifrance : ' + err.message });
  }
});

// ================================================
// LÉGIFRANCE — Journal Officiel
// GET /jorf?page=&limit=
// ================================================
router.get('/jorf', requireAvocat, async (req, res) => {
  try {
    const { page, limit } = req.query;
    const result = await legifrance.getJournalOfficiel({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20
    });
    return res.json(result);
  } catch (err) {
    console.error('[legal-data/jorf]', err.message);
    return res.status(502).json({ error: 'Erreur Légifrance : ' + err.message });
  }
});

// ================================================
// LÉGIFRANCE — Recherche LODA (textes législatifs/réglementaires)
// GET /loda/search?q=&page=
// ================================================
router.get('/loda/search', requireAvocat, async (req, res) => {
  try {
    const { q, page, pageSize } = req.query;
    if (!q) return res.status(400).json({ error: 'Paramètre q requis' });

    const result = await legifrance.searchLoda(q, {
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 10
    });

    return res.json(result);
  } catch (err) {
    console.error('[legal-data/loda]', err.message);
    return res.status(502).json({ error: 'Erreur Légifrance : ' + err.message });
  }
});

// ================================================
// JUDILIBRE — Recherche décisions Cour de cassation
// GET /judilibre/search?q=&chambre=&dateDebut=&dateFin=&matiere=&solution=&page=
// ================================================
router.get('/judilibre/search', requireAvocat, async (req, res) => {
  try {
    const { q, chambre, dateDebut, dateFin, matiere, solution, page, pageSize } = req.query;
    if (!q) return res.status(400).json({ error: 'Paramètre q requis' });

    const result = await judilibre.search(q, {
      chambre: chambre || null,
      dateDebut: dateDebut || null,
      dateFin: dateFin || null,
      matiere: matiere || null,
      solution: solution || null,
      page: parseInt(page) || 0,
      pageSize: parseInt(pageSize) || 10
    });

    if (result.results && result.results.length > 0) {
      cacheResults('judilibre', q, result).catch(() => {});
    }

    return res.json(result);
  } catch (err) {
    console.error('[legal-data/judilibre/search]', err.message);
    return res.status(502).json({ error: 'Erreur Judilibre : ' + err.message });
  }
});

// ================================================
// JUDILIBRE — Décision par ID (texte intégral)
// GET /judilibre/decision/:id
// ================================================
router.get('/judilibre/decision/:id', requireAvocat, async (req, res) => {
  try {
    const result = await judilibre.getDecision(req.params.id);
    return res.json(result);
  } catch (err) {
    console.error('[legal-data/judilibre/decision]', err.message);
    return res.status(502).json({ error: 'Erreur Judilibre : ' + err.message });
  }
});

// ================================================
// JUDILIBRE — Taxonomie (chambres, matières, solutions)
// GET /judilibre/taxonomy?key=
// ================================================
router.get('/judilibre/taxonomy', requireAvocat, async (req, res) => {
  try {
    const result = await judilibre.getTaxonomy(req.query.key || null);
    return res.json(result);
  } catch (err) {
    console.error('[legal-data/judilibre/taxonomy]', err.message);
    return res.status(502).json({ error: 'Erreur Judilibre : ' + err.message });
  }
});

// ================================================
// JUDILIBRE — Statistiques
// GET /judilibre/stats
// ================================================
router.get('/judilibre/stats', requireAvocat, async (req, res) => {
  try {
    const result = await judilibre.getStats();
    return res.json(result);
  } catch (err) {
    console.error('[legal-data/judilibre/stats]', err.message);
    return res.status(502).json({ error: 'Erreur Judilibre : ' + err.message });
  }
});

// ================================================
// RECHERCHE UNIFIÉE — Codes + Jurisprudence en un seul appel
// GET /search?q=&sources=codes,judilibre,jurisprudence&page=
// ================================================
router.get('/search', requireAvocat, async (req, res) => {
  try {
    const { q, sources, page } = req.query;
    if (!q) return res.status(400).json({ error: 'Paramètre q requis' });

    const sourceList = (sources || 'codes,judilibre').split(',').map(s => s.trim());
    const pageNum = parseInt(page) || 1;

    const promises = {};

    if (sourceList.includes('codes')) {
      promises.codes = legifrance.searchCode(q, { page: pageNum, pageSize: 5 }).catch(e => ({ error: e.message }));
    }
    if (sourceList.includes('judilibre')) {
      promises.judilibre = judilibre.search(q, { page: pageNum - 1, pageSize: 5 }).catch(e => ({ error: e.message }));
    }
    if (sourceList.includes('jurisprudence')) {
      promises.jurisprudence = legifrance.searchJurisprudenceJudiciaire(q, { page: pageNum, pageSize: 5 }).catch(e => ({ error: e.message }));
    }
    if (sourceList.includes('loda')) {
      promises.loda = legifrance.searchLoda(q, { page: pageNum, pageSize: 5 }).catch(e => ({ error: e.message }));
    }

    const keys = Object.keys(promises);
    const values = await Promise.all(Object.values(promises));
    const results = {};
    keys.forEach((k, i) => { results[k] = values[i]; });

    return res.json({
      query: q,
      sources: sourceList,
      results
    });
  } catch (err) {
    console.error('[legal-data/search]', err.message);
    return res.status(500).json({ error: 'Erreur recherche unifiée : ' + err.message });
  }
});

// ================================================
// SYNC JUDILIBRE — Synchronisation transactionalHistory
// POST /judilibre/sync — lance la sync (admin only)
// GET  /judilibre/sync/status — dernier rapport
// POST /judilibre/purge — purge décisions spécifiques
// ================================================
const { syncJudilibre, purgeAndRefresh } = require('../../lib/legal-providers/judilibre-sync');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'karim_bahmed@yahoo.fr';

async function requireAdmin(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requis' });
    const { data: { user }, error } = await admin().auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Token invalide' });
    if (user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Accès réservé admin' });
    req.userId = user.id;
    next();
  } catch {
    return res.status(401).json({ error: 'Authentification échouée' });
  }
}

let _lastSyncReport = null;

router.post('/judilibre/sync', requireAdmin, async (req, res) => {
  try {
    const hoursBack = parseInt(req.body.hoursBack) || 24;
    const report = await syncJudilibre(hoursBack);
    _lastSyncReport = { ...report, timestamp: new Date().toISOString() };
    return res.json({ status: 'ok', report });
  } catch (err) {
    console.error('[legal-data/judilibre/sync]', err.message);
    return res.status(500).json({ error: 'Erreur sync : ' + err.message });
  }
});

router.get('/judilibre/sync/status', requireAdmin, async (req, res) => {
  return res.json({
    lastSync: _lastSyncReport,
    cacheStats: await getCacheStats()
  });
});

router.post('/judilibre/purge', requireAdmin, async (req, res) => {
  try {
    const { decisionIds } = req.body;
    if (!decisionIds || !Array.isArray(decisionIds) || !decisionIds.length) {
      return res.status(400).json({ error: 'decisionIds[] requis' });
    }
    const report = await purgeAndRefresh(decisionIds);
    return res.json({ status: 'ok', report });
  } catch (err) {
    console.error('[legal-data/judilibre/purge]', err.message);
    return res.status(500).json({ error: 'Erreur purge : ' + err.message });
  }
});

async function getCacheStats() {
  try {
    const { count } = await admin().from('legal_data_cache')
      .select('*', { count: 'exact', head: true })
      .eq('source', 'judilibre');
    return { judilibre_cached: count || 0 };
  } catch { return { judilibre_cached: 'erreur' }; }
}

// ================================================
// HEALTH CHECK — Vérifier la connexion PISTE
// GET /health
// ================================================
router.get('/health', requireAvocat, async (req, res) => {
  try {
    const start = Date.now();
    const stats = await judilibre.getStats();
    const duration = Date.now() - start;
    return res.json({
      status: 'ok',
      piste_connected: true,
      judilibre_stats: stats,
      response_ms: duration
    });
  } catch (err) {
    return res.json({
      status: 'error',
      piste_connected: false,
      error: err.message
    });
  }
});

// ================================================
// CACHE — Stocke les résultats en base pour IA RAG
// ================================================
async function cacheResults(source, query, data) {
  try {
    const items = data.results || [];
    if (!items.length) return;

    const rows = items.slice(0, 20).map(item => ({
      source,
      query,
      external_id: item.id || item.textId || item.numero || null,
      titre: item.title || item.titre || item.titreLong || null,
      contenu_extrait: JSON.stringify(item).substring(0, 5000),
      metadata: {
        date: item.date || item.dateDecision || null,
        type: item.type || item.nature || null,
        source_url: item.url || null
      }
    }));

    await admin().from('legal_data_cache').upsert(rows, {
      onConflict: 'source,external_id',
      ignoreDuplicates: true
    });
  } catch (err) {
    console.error('[legal-data/cache]', err.message);
  }
}

module.exports = router;
