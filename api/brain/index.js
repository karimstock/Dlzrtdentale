// =============================================
// JADOMI CABINET BRAIN — API endpoints
// Mémoire structurée du cabinet : identité, documents,
// règles, tâches, événements, recherche, digest
// =============================================
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { buildSystemPrompt, validateResponse } = require('../../lib/ai-studio/jadomi-brain');
const { SharedIntelligence, EVENT_TYPES } = require('../../lib/shared-intelligence');
const { sanitizeForExternalAPI, recommendProvider } = require('../../lib/ai-studio/data-guard');

// ===== Auth middleware (même pattern que ia-secretary) =====
function requireAuth() {
  const { authSupabase, requireSociete } = require('../multiSocietes/middleware');
  return async (req, res, next) => {
    authSupabase()(req, res, (err) => {
      if (err) return;
      if (res.headersSent) return;
      requireSociete()(req, res, (err2) => {
        if (err2) return;
        if (res.headersSent) return;
        next();
      });
    });
  };
}

// ===== Supabase client (lazy) =====
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const { createClient } = require('@supabase/supabase-js');
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
    );
  }
  return _supabase;
}

// ===== Rate limiter =====
const rateBuckets = new Map();
const RATE_LIMIT = 60;
const RATE_WINDOW = 60 * 1000;

function rateLimit() {
  return (req, res, next) => {
    const userId = req.user?.id || req.ip;
    const now = Date.now();
    let bucket = rateBuckets.get(userId);
    if (!bucket || now - bucket.start > RATE_WINDOW) {
      bucket = { start: now, count: 0 };
      rateBuckets.set(userId, bucket);
    }
    bucket.count++;
    if (bucket.count > RATE_LIMIT) {
      return res.status(429).json({ error: 'Trop de requêtes. Veuillez patienter.' });
    }
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now - bucket.start > RATE_WINDOW * 2) rateBuckets.delete(key);
  }
}, 5 * 60 * 1000);

// Appliquer auth + rate limit à toutes les routes
router.use(requireAuth(), rateLimit());

// =============================================
// 1. IDENTITÉ CABINET (GET / PUT)
// =============================================

// GET /api/brain/identity — Récupérer l'identité du cabinet
router.get('/identity', async (req, res) => {
  try {
    const societeId = req.societe?.id || req.societeId;
    if (!societeId) return res.status(400).json({ error: 'Société manquante' });

    const db = getSupabase();
    const { data, error } = await db
      .from('cabinet_brain')
      .select('*')
      .eq('societe_id', societeId)
      .maybeSingle();

    if (error) throw error;

    // Créer le brain si inexistant
    if (!data) {
      const { data: newBrain, error: insertErr } = await db
        .from('cabinet_brain')
        .insert({ societe_id: societeId })
        .select()
        .single();
      if (insertErr) throw insertErr;
      return res.json(newBrain);
    }

    res.json(data);
  } catch (e) {
    console.error('[BRAIN] GET identity error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/brain/identity — Mettre à jour l'identité
router.put('/identity', async (req, res) => {
  try {
    const societeId = req.societe?.id || req.societeId;
    if (!societeId) return res.status(400).json({ error: 'Société manquante' });

    const { identity, team, contacts, preferences } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (identity !== undefined) updates.identity = identity;
    if (team !== undefined) updates.team = team;
    if (contacts !== undefined) updates.contacts = contacts;
    if (preferences !== undefined) updates.preferences = preferences;

    const db = getSupabase();

    // Upsert : créer si n'existe pas
    const { data: existing } = await db
      .from('cabinet_brain')
      .select('id')
      .eq('societe_id', societeId)
      .maybeSingle();

    let result;
    if (existing) {
      const { data, error } = await db
        .from('cabinet_brain')
        .update(updates)
        .eq('societe_id', societeId)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await db
        .from('cabinet_brain')
        .insert({ societe_id: societeId, ...updates })
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    // Enregistrer l'événement
    await logEvent(db, societeId, req.user?.id, 'preference_changed', {
      fields_updated: Object.keys(updates).filter(k => k !== 'updated_at')
    });

    res.json(result);
  } catch (e) {
    console.error('[BRAIN] PUT identity error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// 2. DOCUMENTS (CRUD + recherche)
// =============================================

// GET /api/brain/documents — Liste des documents du cabinet
router.get('/documents', async (req, res) => {
  try {
    const societeId = req.societe?.id || req.societeId;
    const { type, source, search, limit: lim, offset } = req.query;

    const db = getSupabase();
    let query = db
      .from('cabinet_brain_documents')
      .select('id, title, doc_type, source, metadata, classification, file_size, mime_type, created_at', { count: 'exact' })
      .eq('societe_id', societeId)
      .order('created_at', { ascending: false });

    if (type) query = query.eq('doc_type', type);
    if (source) query = query.eq('source', source);
    if (search) query = query.or(`title.ilike.%${search}%,content_text.ilike.%${search}%`);

    query = query.range(
      parseInt(offset) || 0,
      (parseInt(offset) || 0) + (parseInt(lim) || 50) - 1
    );

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ documents: data, total: count });
  } catch (e) {
    console.error('[BRAIN] GET documents error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/brain/documents — Indexer un document
router.post('/documents', async (req, res) => {
  try {
    const societeId = req.societe?.id || req.societeId;
    const { title, doc_type, source, content_text, metadata, storage_path, file_size, mime_type } = req.body;

    if (!title) return res.status(400).json({ error: 'Titre requis' });

    const db = getSupabase();

    // Calculer checksum si contenu fourni
    let checksum = null;
    if (content_text) {
      checksum = crypto.createHash('sha256').update(content_text).digest('hex');
    }

    const { data, error } = await db
      .from('cabinet_brain_documents')
      .insert({
        societe_id: societeId,
        title,
        doc_type: doc_type || 'autre',
        source: source || 'upload',
        content_text,
        metadata: metadata || {},
        storage_path,
        file_size,
        mime_type,
        checksum,
        classification: {}
      })
      .select()
      .single();

    if (error) {
      // Doublon checksum
      if (error.code === '23505' && error.message.includes('checksum')) {
        return res.status(409).json({ error: 'Document déjà indexé (même contenu)' });
      }
      throw error;
    }

    // Enregistrer l'événement
    await logEvent(db, societeId, req.user?.id, 'document_filed', {
      document_id: data.id, doc_type, source, title
    });

    res.status(201).json(data);
  } catch (e) {
    console.error('[BRAIN] POST documents error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/brain/documents/:id
router.delete('/documents/:id', async (req, res) => {
  try {
    const societeId = req.societe?.id || req.societeId;
    const db = getSupabase();

    const { error } = await db
      .from('cabinet_brain_documents')
      .delete()
      .eq('id', req.params.id)
      .eq('societe_id', societeId);

    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[BRAIN] DELETE documents error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/brain/search — Recherche hybride full-text
router.get('/search', async (req, res) => {
  try {
    const societeId = req.societe?.id || req.societeId;
    const { q, limit: lim } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Requête trop courte (min 2 caractères)' });
    }

    const db = getSupabase();
    const { data, error } = await db.rpc('search_brain_documents', {
      p_societe_id: societeId,
      p_query: q.trim(),
      p_limit: parseInt(lim) || 20
    });

    if (error) throw error;
    res.json({ results: data || [], query: q.trim() });
  } catch (e) {
    console.error('[BRAIN] search error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// 3. RÈGLES (CRUD)
// =============================================

// GET /api/brain/rules
router.get('/rules', async (req, res) => {
  try {
    const societeId = req.societe?.id || req.societeId;
    const { category, active } = req.query;

    const db = getSupabase();
    let query = db
      .from('cabinet_brain_rules')
      .select('*')
      .eq('societe_id', societeId)
      .order('category')
      .order('created_at', { ascending: false });

    if (category) query = query.eq('category', category);
    if (active !== undefined) query = query.eq('active', active === 'true');

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[BRAIN] GET rules error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/brain/rules — Créer une règle
router.post('/rules', async (req, res) => {
  try {
    const societeId = req.societe?.id || req.societeId;
    const { category, rule_name, rule_text, conditions, actions, source } = req.body;

    if (!rule_name || !rule_text) {
      return res.status(400).json({ error: 'Nom et description de la règle requis' });
    }

    const db = getSupabase();
    const { data, error } = await db
      .from('cabinet_brain_rules')
      .insert({
        societe_id: societeId,
        category: category || 'general',
        rule_name,
        rule_text,
        conditions: conditions || {},
        actions: actions || [],
        source: source || 'user_configured',
        confidence: source === 'learned' ? 0.7 : 1.0
      })
      .select()
      .single();

    if (error) throw error;

    await logEvent(db, societeId, req.user?.id, 'rule_created', {
      rule_id: data.id, category, rule_name
    });

    res.status(201).json(data);
  } catch (e) {
    console.error('[BRAIN] POST rules error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/brain/rules/:id — Modifier une règle
router.put('/rules/:id', async (req, res) => {
  try {
    const societeId = req.societe?.id || req.societeId;
    const updates = {};
    const allowed = ['category', 'rule_name', 'rule_text', 'conditions', 'actions', 'active', 'confidence'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date().toISOString();

    const db = getSupabase();
    const { data, error } = await db
      .from('cabinet_brain_rules')
      .update(updates)
      .eq('id', req.params.id)
      .eq('societe_id', societeId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[BRAIN] PUT rules error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/brain/rules/:id
router.delete('/rules/:id', async (req, res) => {
  try {
    const societeId = req.societe?.id || req.societeId;
    const db = getSupabase();

    const { error } = await db
      .from('cabinet_brain_rules')
      .delete()
      .eq('id', req.params.id)
      .eq('societe_id', societeId);

    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[BRAIN] DELETE rules error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/brain/rules/:id/correct — L'utilisateur corrige une règle
router.post('/rules/:id/correct', async (req, res) => {
  try {
    const societeId = req.societe?.id || req.societeId;
    const { correction } = req.body;

    const db = getSupabase();

    // Récupérer la règle
    const { data: rule, error: fetchErr } = await db
      .from('cabinet_brain_rules')
      .select('*')
      .eq('id', req.params.id)
      .eq('societe_id', societeId)
      .single();

    if (fetchErr || !rule) return res.status(404).json({ error: 'Règle introuvable' });

    // Baisser la confiance
    let newConfidence = Math.max(0, (rule.confidence || 1.0) - 0.2);
    const active = newConfidence >= 0.3;

    const { data, error } = await db
      .from('cabinet_brain_rules')
      .update({
        confidence: newConfidence,
        active,
        times_corrected: (rule.times_corrected || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    // Logger la correction
    await logEvent(db, societeId, req.user?.id, 'rule_corrected', {
      rule_id: rule.id, rule_name: rule.rule_name,
      old_confidence: rule.confidence, new_confidence: newConfidence,
      correction, deactivated: !active
    });

    res.json({ ...data, message: active ? 'Confiance réduite' : 'Règle désactivée (confiance trop basse)' });
  } catch (e) {
    console.error('[BRAIN] POST rules correct error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// 4. TÂCHES (CRUD)
// =============================================

// GET /api/brain/tasks
router.get('/tasks', async (req, res) => {
  try {
    const societeId = req.societe?.id || req.societeId;
    const { status, category, priority, limit: lim } = req.query;

    const db = getSupabase();
    let query = db
      .from('cabinet_brain_tasks')
      .select('*')
      .eq('societe_id', societeId)
      .order('priority_order', { ascending: true, nullsFirst: false })
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(parseInt(lim) || 100);

    if (status) query = query.eq('status', status);
    if (category) query = query.eq('category', category);
    if (priority) query = query.eq('priority', priority);

    const { data, error } = await query;
    if (error) throw error;

    // Ajouter un tri par priorité manuellement (pas de colonne priority_order en base)
    const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    const sorted = (data || []).sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 2;
      const pb = priorityOrder[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    res.json(sorted);
  } catch (e) {
    console.error('[BRAIN] GET tasks error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/brain/tasks — Créer une tâche
router.post('/tasks', async (req, res) => {
  try {
    const societeId = req.societe?.id || req.societeId;
    const { title, description, category, priority, due_date, assigned_to, source_type, source_id, source_context } = req.body;

    if (!title) return res.status(400).json({ error: 'Titre requis' });

    const db = getSupabase();
    const { data, error } = await db
      .from('cabinet_brain_tasks')
      .insert({
        societe_id: societeId,
        title,
        description,
        category: category || 'general',
        priority: priority || 'normal',
        due_date,
        assigned_to,
        created_by: req.body.created_by || 'user',
        source_type,
        source_id,
        source_context: source_context || {}
      })
      .select()
      .single();

    if (error) throw error;

    await logEvent(db, societeId, req.user?.id, 'task_created', {
      task_id: data.id, title, category, priority, created_by: data.created_by
    });

    res.status(201).json(data);
  } catch (e) {
    console.error('[BRAIN] POST tasks error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/brain/tasks/:id — Modifier une tâche
router.put('/tasks/:id', async (req, res) => {
  try {
    const societeId = req.societe?.id || req.societeId;
    const updates = {};
    const allowed = ['title', 'description', 'category', 'priority', 'due_date', 'assigned_to', 'status'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date().toISOString();

    // Marquer completed_at si passage en done
    if (updates.status === 'done') {
      updates.completed_at = new Date().toISOString();
    }

    const db = getSupabase();
    const { data, error } = await db
      .from('cabinet_brain_tasks')
      .update(updates)
      .eq('id', req.params.id)
      .eq('societe_id', societeId)
      .select()
      .single();

    if (error) throw error;

    if (updates.status === 'done') {
      await logEvent(db, societeId, req.user?.id, 'task_completed', {
        task_id: data.id, title: data.title
      });
    }

    res.json(data);
  } catch (e) {
    console.error('[BRAIN] PUT tasks error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/brain/tasks/:id
router.delete('/tasks/:id', async (req, res) => {
  try {
    const societeId = req.societe?.id || req.societeId;
    const db = getSupabase();

    const { error } = await db
      .from('cabinet_brain_tasks')
      .delete()
      .eq('id', req.params.id)
      .eq('societe_id', societeId);

    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[BRAIN] DELETE tasks error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// 5. ÉVÉNEMENTS (lecture + stats)
// =============================================

// GET /api/brain/events — Journal d'activité
router.get('/events', async (req, res) => {
  try {
    const societeId = req.societe?.id || req.societeId;
    const { type, days, limit: lim } = req.query;

    const db = getSupabase();
    let query = db
      .from('cabinet_brain_events')
      .select('*')
      .eq('societe_id', societeId)
      .order('created_at', { ascending: false })
      .limit(parseInt(lim) || 50);

    if (type) query = query.eq('event_type', type);
    if (days) {
      const since = new Date(Date.now() - parseInt(days) * 86400000).toISOString();
      query = query.gte('created_at', since);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[BRAIN] GET events error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// 6. STATISTIQUES + DIGEST
// =============================================

// GET /api/brain/stats — Statistiques du Brain
router.get('/stats', async (req, res) => {
  try {
    const societeId = req.societe?.id || req.societeId;
    const db = getSupabase();

    const { data, error } = await db.rpc('get_brain_stats', {
      p_societe_id: societeId
    });

    if (error) throw error;
    res.json(data || {});
  } catch (e) {
    console.error('[BRAIN] stats error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/brain/digest — Résumé quotidien du cabinet
router.get('/digest', async (req, res) => {
  try {
    const societeId = req.societe?.id || req.societeId;
    const db = getSupabase();

    // Récupérer les données pour le digest
    const today = new Date().toISOString().split('T')[0];

    const [tasksRes, eventsRes, docsRes, rulesRes] = await Promise.all([
      // Tâches en attente
      db.from('cabinet_brain_tasks')
        .select('id, title, priority, due_date, category')
        .eq('societe_id', societeId)
        .in('status', ['todo', 'in_progress'])
        .order('priority')
        .limit(10),
      // Événements des dernières 24h
      db.from('cabinet_brain_events')
        .select('event_type, context, created_at')
        .eq('societe_id', societeId)
        .gte('created_at', new Date(Date.now() - 86400000).toISOString())
        .order('created_at', { ascending: false })
        .limit(20),
      // Documents récents (48h)
      db.from('cabinet_brain_documents')
        .select('id, title, doc_type, source, created_at')
        .eq('societe_id', societeId)
        .gte('created_at', new Date(Date.now() - 2 * 86400000).toISOString())
        .order('created_at', { ascending: false })
        .limit(10),
      // Règles déclenchées récemment
      db.from('cabinet_brain_rules')
        .select('id, rule_name, category, times_triggered, last_triggered_at')
        .eq('societe_id', societeId)
        .eq('active', true)
        .not('last_triggered_at', 'is', null)
        .order('last_triggered_at', { ascending: false })
        .limit(5)
    ]);

    const tasks = tasksRes.data || [];
    const events = eventsRes.data || [];
    const docs = docsRes.data || [];
    const rules = rulesRes.data || [];

    // Construire le digest
    const urgentTasks = tasks.filter(t => t.priority === 'urgent' || t.priority === 'high');
    const overdueTasks = tasks.filter(t => t.due_date && t.due_date < today);

    const digest = {
      date: today,
      resume: {
        taches_en_attente: tasks.length,
        taches_urgentes: urgentTasks.length,
        taches_en_retard: overdueTasks.length,
        documents_recents: docs.length,
        evenements_24h: events.length,
        regles_actives: rules.length
      },
      taches_urgentes: urgentTasks,
      taches_en_retard: overdueTasks,
      documents_recents: docs,
      derniers_evenements: events.slice(0, 5),
      message: buildDigestMessage(tasks, urgentTasks, overdueTasks, docs, events)
    };

    res.json(digest);
  } catch (e) {
    console.error('[BRAIN] digest error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// 7. ASK — Question en langage naturel au Brain
// =============================================

// POST /api/brain/ask — Poser une question au Brain
router.post('/ask', async (req, res) => {
  try {
    const societeId = req.societe?.id || req.societeId;
    const { question } = req.body;

    if (!question || question.trim().length < 3) {
      return res.status(400).json({ error: 'Question trop courte' });
    }

    const db = getSupabase();

    // Récupérer le contexte du cabinet
    const { data: brain } = await db
      .from('cabinet_brain')
      .select('identity, preferences, contacts')
      .eq('societe_id', societeId)
      .maybeSingle();

    // Rechercher des documents pertinents
    let relevantDocs = [];
    try {
      const { data: searchResults } = await db.rpc('search_brain_documents', {
        p_societe_id: societeId,
        p_query: question.trim(),
        p_limit: 5
      });
      relevantDocs = searchResults || [];
    } catch (_) { /* search function may not exist yet */ }

    // Construire le prompt avec le contexte Brain
    const brainContext = brain ? `
CONTEXTE DU CABINET :
${brain.identity ? JSON.stringify(brain.identity) : 'Non renseigné'}

CONTACTS : ${brain.contacts ? JSON.stringify(brain.contacts) : 'Aucun'}

PRÉFÉRENCES : ${brain.preferences ? JSON.stringify(brain.preferences) : 'Par défaut'}
` : '';

    const docsContext = relevantDocs.length > 0 ? `
DOCUMENTS PERTINENTS :
${relevantDocs.map(d => `- ${d.title} (${d.doc_type}) : ${d.content_preview || ''}`).join('\n')}
` : '';

    const systemPrompt = buildSystemPrompt('stock', `
Vous êtes le Cabinet Brain JADOMI — le cerveau intelligent du cabinet.
Vous répondez aux questions du praticien en vous basant sur les données du cabinet.
${brainContext}
${docsContext}
Si vous ne trouvez pas l'information, dites-le honnêtement.
Ne jamais inventer de données.`);

    // Utiliser le router IA (Mistral d'abord, Claude en fallback)
    const iaRouter = require('../../lib/ia-router');
    const { sanitized } = sanitizeForExternalAPI(question, 'mistral');

    let answer;
    try {
      const result = await iaRouter.mistralGenerate(systemPrompt, sanitized || question, { temperature: 0.3 });
      answer = result;
    } catch (_) {
      // Fallback Claude
      try {
        const result = await iaRouter.claudeGenerate(systemPrompt, question, { temperature: 0.3 });
        answer = result;
      } catch (e2) {
        answer = 'Je ne peux pas répondre pour le moment. Le service IA est temporairement indisponible.';
      }
    }

    // Valider la réponse
    const validation = validateResponse(answer);
    if (!validation.ok) {
      console.warn('[BRAIN] Response violations:', validation.violations);
      answer = 'Je prépare une réponse adaptée. Veuillez reformuler votre question.';
    }

    // Logger l'événement
    await logEvent(db, societeId, req.user?.id, 'search_performed', {
      question: question.substring(0, 200),
      docs_found: relevantDocs.length
    });

    res.json({ answer, sources: relevantDocs.map(d => ({ id: d.id, title: d.title, type: d.doc_type })) });
  } catch (e) {
    console.error('[BRAIN] ask error:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// HELPERS
// =============================================

async function logEvent(db, societeId, userId, eventType, context) {
  try {
    await db.from('cabinet_brain_events').insert({
      societe_id: societeId,
      user_id: userId || null,
      event_type: eventType,
      context: context || {}
    });
  } catch (e) {
    console.error('[BRAIN] logEvent error:', e.message);
  }
}

function buildDigestMessage(tasks, urgentTasks, overdueTasks, docs, events) {
  const parts = [];

  if (urgentTasks.length > 0) {
    parts.push(`${urgentTasks.length} tâche${urgentTasks.length > 1 ? 's' : ''} urgente${urgentTasks.length > 1 ? 's' : ''}`);
  }
  if (overdueTasks.length > 0) {
    parts.push(`${overdueTasks.length} tâche${overdueTasks.length > 1 ? 's' : ''} en retard`);
  }
  if (docs.length > 0) {
    parts.push(`${docs.length} nouveau${docs.length > 1 ? 'x' : ''} document${docs.length > 1 ? 's' : ''}`);
  }
  if (tasks.length > 0 && urgentTasks.length === 0) {
    parts.push(`${tasks.length} tâche${tasks.length > 1 ? 's' : ''} en attente`);
  }

  if (parts.length === 0) {
    return 'Tout est en ordre. Aucune action urgente.';
  }

  return parts.join(' · ');
}

// =============================================
// MAIL COPILOT — sous-routeur
// =============================================
try {
  router.use('/mail', require('./mail-copilot'));
} catch (e) {
  console.warn('[BRAIN] Mail Copilot non chargé:', e.message);
}

module.exports = router;
