// =============================================
// JADOMI — Community Forum API
// Entraide entre professionnels
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// --- Supabase admin singleton ---
let _admin = null;
function admin() {
  if (!_admin) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants');
    _admin = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

// --- Auth middleware (same pattern as billing, multiSocietes) ---
async function authMiddleware(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'missing_token' });
    const { data, error } = await admin().auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'invalid_token' });
    req.user = data.user;
    next();
  } catch (e) {
    console.error('[forum/auth]', e.message);
    res.status(401).json({ error: 'auth_error' });
  }
}

// --- XSS sanitizer (strip HTML tags, keep plain text) ---
// Strips any HTML tags but preserves the text content.
// Frontend must still escape when rendering (escHtml / textContent).
function sanitize(str) {
  if (!str) return '';
  return String(str)
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
}

// --- Display name from email ---
function displayNameFromEmail(email) {
  if (!email) return 'Professionnel';
  const local = email.split('@')[0] || '';
  // Capitalize first letter of each part separated by . or _
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) {
    return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
  }
  return local.charAt(0).toUpperCase() + local.slice(1);
}

// --- Simple in-memory rate limiter ---
const rateLimits = new Map();
function rateLimit(key, maxPerHour) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  if (!rateLimits.has(key)) rateLimits.set(key, []);
  const entries = rateLimits.get(key).filter(t => now - t < windowMs);
  rateLimits.set(key, entries);
  if (entries.length >= maxPerHour) return false;
  entries.push(now);
  return true;
}
// Cleanup old entries every 30 min
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimits) {
    const filtered = v.filter(t => now - t < 3600000);
    if (filtered.length === 0) rateLimits.delete(k);
    else rateLimits.set(k, filtered);
  }
}, 1800000).unref();

// --- Notification helper (reuse existing pattern) ---
let _pushNotification = null;
function getPushNotification() {
  if (!_pushNotification) {
    try {
      const notifModule = require('../multiSocietes/notifications');
      _pushNotification = notifModule.pushNotification || null;
    } catch (e) {
      console.warn('[forum] pushNotification unavailable:', e.message);
      _pushNotification = () => null;
    }
  }
  return _pushNotification;
}

// --- Valid tags ---
const VALID_TAGS = ['stock', 'urgent', 'astuce', 'bug', 'resolu', 'facturation', 'juridique', 'patient', 'question', 'partage'];

// --- Get societe_id and type for user ---
async function getSocieteId(userId) {
  try {
    const { data } = await admin()
      .from('user_societe_roles')
      .select('societe_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    return data?.societe_id || null;
  } catch (e) {
    return null;
  }
}

// --- Get societe type (profession) for user ---
async function getSocieteType(userId) {
  try {
    const { data } = await admin()
      .from('user_societe_roles')
      .select('societe_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (!data?.societe_id) return null;
    const { data: soc } = await admin()
      .from('societes')
      .select('type')
      .eq('id', data.societe_id)
      .maybeSingle();
    return soc?.type || null;
  } catch (e) {
    return null;
  }
}

// --- Profession label map ---
const PROFESSION_LABELS = {
  'cabinet_dentaire': 'Chirurgien-dentiste',
  'sci': 'SCI / Immobilier',
  'societe_commerciale': 'Entreprise'
};

// --- Validate tags ---
function validateTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.filter(t => typeof t === 'string' && VALID_TAGS.includes(t)).slice(0, 3);
}

// --- Markdown to safe HTML ---
function renderMarkdown(text) {
  if (!text) return '';
  // Escape HTML first
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Bold **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic *text*
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Code `text`
  html = html.replace(/`(.+?)`/g, '<code style="background:rgba(255,255,255,.08);padding:2px 6px;border-radius:4px;font-size:.85em">$1</code>');
  // Line breaks
  html = html.replace(/\n/g, '<br>');
  return html;
}

// =============================================
// GET /categories — list categories with topic counts
// =============================================
router.get('/categories', async (req, res) => {
  try {
    const { data: cats, error } = await admin()
      .from('forum_categories')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;

    // Count topics per category (efficient: one count query per category via Promise.all)
    const countPromises = (cats || []).map(async (c) => {
      const { count } = await admin()
        .from('forum_topics')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', c.id);
      return { ...c, topics_count: count || 0 };
    });

    const result = await Promise.all(countPromises);

    res.json(result);
  } catch (e) {
    console.error('[forum/categories]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// GET /topics — list topics (filterable, paginated)
// ?category=slug&solved=true|false&search=query&sort=recent|popular|unsolved&limit=20&offset=0
// =============================================
router.get('/topics', async (req, res) => {
  try {
    const { category, solved, search, sort, tag, limit: rawLimit, offset: rawOffset } = req.query;
    const limit = Math.min(parseInt(rawLimit) || 20, 50);
    const offset = parseInt(rawOffset) || 0;

    let query = admin()
      .from('forum_topics')
      .select('*, forum_categories(name, slug, icon, color)', { count: 'exact' });

    // Filter by category slug
    if (category) {
      const { data: cat } = await admin()
        .from('forum_categories')
        .select('id')
        .eq('slug', category)
        .maybeSingle();
      if (cat) query = query.eq('category_id', cat.id);
    }

    // Filter by solved status
    if (solved === 'true') query = query.eq('is_solved', true);
    if (solved === 'false') query = query.eq('is_solved', false);

    // Filter by tag
    if (tag && VALID_TAGS.includes(tag)) {
      query = query.contains('tags', JSON.stringify([tag]));
    }

    // Search in title and content (escape special PostgREST chars)
    if (search && search.trim()) {
      const term = search.trim()
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_')
        .replace(/,/g, '')
        .replace(/\(/g, '')
        .replace(/\)/g, '')
        .replace(/\./g, '');
      if (term.length > 0) {
        query = query.or(`title.ilike.%${term}%,content.ilike.%${term}%`);
      }
    }

    // Sort
    if (sort === 'popular') {
      query = query.order('views_count', { ascending: false });
    } else if (sort === 'unsolved') {
      query = query.eq('is_solved', false).order('created_at', { ascending: false });
    } else {
      // Default: recent, pinned first
      query = query.order('is_pinned', { ascending: false }).order('created_at', { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ topics: data || [], total: count || 0, limit, offset });
  } catch (e) {
    console.error('[forum/topics]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// GET /topics/:id — topic detail with replies
// =============================================
router.get('/topics/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: topic, error } = await admin()
      .from('forum_topics')
      .select('*, forum_categories(name, slug, icon, color)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!topic) return res.status(404).json({ error: 'Discussion introuvable' });

    // Fetch replies
    const { data: replies } = await admin()
      .from('forum_replies')
      .select('*')
      .eq('topic_id', id)
      .order('is_solution', { ascending: false })
      .order('created_at', { ascending: true });

    res.json({ topic, replies: replies || [] });
  } catch (e) {
    console.error('[forum/topics/:id]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// POST /topics — create topic (auth required)
// =============================================
router.post('/topics', authMiddleware, async (req, res) => {
  try {
    const email = req.user.email;
    if (!rateLimit('topic:' + email, 5)) {
      return res.status(429).json({ error: 'Limite atteinte : 5 discussions par heure' });
    }

    const { category_id, title, content, tags: rawTags } = req.body;
    if (!category_id || !title?.trim() || !content?.trim()) {
      return res.status(400).json({ error: 'Champs obligatoires : cat\u00e9gorie, titre, contenu' });
    }
    if (title.trim().length > 200) {
      return res.status(400).json({ error: 'Le titre ne doit pas d\u00e9passer 200 caract\u00e8res' });
    }
    if (content.trim().length > 10000) {
      return res.status(400).json({ error: 'Le contenu ne doit pas d\u00e9passer 10 000 caract\u00e8res' });
    }

    const tags = validateTags(rawTags || []);
    const societeId = await getSocieteId(req.user.id);
    const displayName = displayNameFromEmail(email);

    const { data, error } = await admin()
      .from('forum_topics')
      .insert({
        category_id: parseInt(category_id),
        author_societe_id: societeId,
        author_user_id: req.user.id,
        author_email: email,
        author_display_name: sanitize(displayName),
        title: sanitize(title.trim()),
        content: sanitize(content.trim()),
        tags: JSON.stringify(tags)
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[forum/post-topic]', e.message);
    res.status(500).json({ error: 'Erreur lors de la cr\u00e9ation' });
  }
});

// =============================================
// PATCH /topics/:id — edit own topic
// =============================================
router.patch('/topics/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const email = req.user.email;

    // Check ownership
    const { data: existing } = await admin()
      .from('forum_topics')
      .select('author_email')
      .eq('id', id)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Discussion introuvable' });
    if (existing.author_email !== email) return res.status(403).json({ error: 'Modification interdite' });

    const updates = {};
    if (req.body.title) updates.title = sanitize(req.body.title.trim().slice(0, 200));
    if (req.body.content) updates.content = sanitize(req.body.content.trim().slice(0, 10000));
    if (req.body.tags) updates.tags = JSON.stringify(validateTags(req.body.tags));
    updates.updated_at = new Date().toISOString();

    const { data, error } = await admin()
      .from('forum_topics')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[forum/patch-topic]', e.message);
    res.status(500).json({ error: 'Erreur lors de la modification' });
  }
});

// =============================================
// DELETE /topics/:id — delete own topic
// =============================================
router.delete('/topics/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const email = req.user.email;

    const { data: existing } = await admin()
      .from('forum_topics')
      .select('author_email')
      .eq('id', id)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Discussion introuvable' });
    if (existing.author_email !== email) return res.status(403).json({ error: 'Suppression interdite' });

    // Real delete (cascade removes replies + upvotes)
    const { error } = await admin()
      .from('forum_topics')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[forum/delete-topic]', e.message);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

// =============================================
// POST /topics/:id/replies — add reply
// =============================================
router.post('/topics/:id/replies', authMiddleware, async (req, res) => {
  try {
    const email = req.user.email;
    if (!rateLimit('reply:' + email, 20)) {
      return res.status(429).json({ error: 'Limite atteinte : 20 r\u00e9ponses par heure' });
    }

    const { id } = req.params;
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Contenu obligatoire' });
    if (content.trim().length > 5000) return res.status(400).json({ error: 'R\u00e9ponse limit\u00e9e \u00e0 5 000 caract\u00e8res' });

    // Check topic exists
    const { data: topic } = await admin()
      .from('forum_topics')
      .select('id, is_locked, replies_count, author_user_id, author_email, title')
      .eq('id', id)
      .maybeSingle();
    if (!topic) return res.status(404).json({ error: 'Discussion introuvable' });
    if (topic.is_locked) return res.status(403).json({ error: 'Discussion verrouill\u00e9e' });

    const societeId = await getSocieteId(req.user.id);
    const displayName = displayNameFromEmail(email);

    const { data, error } = await admin()
      .from('forum_replies')
      .insert({
        topic_id: id,
        author_societe_id: societeId,
        author_user_id: req.user.id,
        author_email: email,
        author_display_name: sanitize(displayName),
        content: sanitize(content.trim())
      })
      .select()
      .single();

    if (error) throw error;

    // Update topic replies count and last_reply_at
    await admin()
      .from('forum_topics')
      .update({
        replies_count: topic.replies_count + 1 || 1,
        last_reply_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    // Recount to be accurate
    const { count } = await admin()
      .from('forum_replies')
      .select('id', { count: 'exact', head: true })
      .eq('topic_id', id);
    if (count !== undefined) {
      await admin()
        .from('forum_topics')
        .update({ replies_count: count })
        .eq('id', id);
    }

    // Send notification to topic author (if not self-replying)
    if (topic.author_user_id && topic.author_user_id !== req.user.id) {
      const push = getPushNotification();
      if (push) {
        push({
          user_id: topic.author_user_id,
          type: 'forum_reply',
          urgence: 'normale',
          titre: 'Nouvelle reponse a votre discussion',
          message: displayName + ' a repondu a "' + (topic.title || '').slice(0, 80) + '"',
          cta_label: 'Voir la discussion',
          cta_url: '/support/communaute#topic-' + id,
          entity_type: 'forum_topic',
          entity_id: id
        }).catch(() => {});
      }
    }

    res.status(201).json(data);
  } catch (e) {
    console.error('[forum/post-reply]', e.message);
    res.status(500).json({ error: 'Erreur lors de la r\u00e9ponse' });
  }
});

// =============================================
// PATCH /replies/:id — edit own reply
// =============================================
router.patch('/replies/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const email = req.user.email;

    const { data: existing } = await admin()
      .from('forum_replies')
      .select('author_email')
      .eq('id', id)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: 'R\u00e9ponse introuvable' });
    if (existing.author_email !== email) return res.status(403).json({ error: 'Modification interdite' });

    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Contenu obligatoire' });

    const { data, error } = await admin()
      .from('forum_replies')
      .update({
        content: sanitize(content.trim().slice(0, 5000)),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[forum/patch-reply]', e.message);
    res.status(500).json({ error: 'Erreur lors de la modification' });
  }
});

// =============================================
// POST /replies/:id/upvote — toggle upvote
// =============================================
router.post('/replies/:id/upvote', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const email = req.user.email;

    // Check if already upvoted
    const { data: existing } = await admin()
      .from('forum_upvotes')
      .select('id')
      .eq('reply_id', id)
      .eq('user_email', email)
      .maybeSingle();

    if (existing) {
      // Remove upvote
      await admin().from('forum_upvotes').delete().eq('id', existing.id);
      // Decrement
      const { data: reply } = await admin()
        .from('forum_replies')
        .select('upvotes_count')
        .eq('id', id)
        .maybeSingle();
      if (reply) {
        await admin()
          .from('forum_replies')
          .update({ upvotes_count: Math.max(0, (reply.upvotes_count || 1) - 1) })
          .eq('id', id);
      }
      res.json({ upvoted: false });
    } else {
      // Add upvote
      await admin().from('forum_upvotes').insert({ reply_id: id, user_email: email });
      // Increment
      const { data: reply } = await admin()
        .from('forum_replies')
        .select('upvotes_count')
        .eq('id', id)
        .maybeSingle();
      if (reply) {
        await admin()
          .from('forum_replies')
          .update({ upvotes_count: (reply.upvotes_count || 0) + 1 })
          .eq('id', id);
      }
      res.json({ upvoted: true });
    }
  } catch (e) {
    console.error('[forum/upvote]', e.message);
    res.status(500).json({ error: 'Erreur lors du vote' });
  }
});

// =============================================
// POST /replies/:id/solution — mark as solution (topic author only)
// =============================================
router.post('/replies/:id/solution', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const email = req.user.email;

    // Get the reply to find the topic
    const { data: reply } = await admin()
      .from('forum_replies')
      .select('topic_id, is_solution, author_user_id, author_display_name')
      .eq('id', id)
      .maybeSingle();
    if (!reply) return res.status(404).json({ error: 'R\u00e9ponse introuvable' });

    // Check topic ownership
    const { data: topic } = await admin()
      .from('forum_topics')
      .select('author_email, title')
      .eq('id', reply.topic_id)
      .maybeSingle();
    if (!topic) return res.status(404).json({ error: 'Discussion introuvable' });
    if (topic.author_email !== email) {
      return res.status(403).json({ error: 'Seul l\'auteur de la discussion peut marquer une solution' });
    }

    const newValue = !reply.is_solution;

    // If marking as solution, unmark any previous solution in same topic
    if (newValue) {
      await admin()
        .from('forum_replies')
        .update({ is_solution: false })
        .eq('topic_id', reply.topic_id);
    }

    // Toggle solution
    await admin()
      .from('forum_replies')
      .update({ is_solution: newValue })
      .eq('id', id);

    // Update topic solved status
    await admin()
      .from('forum_topics')
      .update({ is_solved: newValue, updated_at: new Date().toISOString() })
      .eq('id', reply.topic_id);

    // Send notification to reply author when marked as solution
    if (newValue && reply.author_user_id && reply.author_user_id !== req.user.id) {
      const push = getPushNotification();
      if (push) {
        push({
          user_id: reply.author_user_id,
          type: 'forum_solution',
          urgence: 'normale',
          titre: 'Votre reponse a ete marquee comme solution',
          message: 'Votre reponse dans "' + (topic.title || '').slice(0, 80) + '" a ete acceptee comme solution',
          cta_label: 'Voir la discussion',
          cta_url: '/support/communaute#topic-' + reply.topic_id,
          entity_type: 'forum_topic',
          entity_id: reply.topic_id
        }).catch(() => {});
      }
    }

    res.json({ is_solution: newValue });
  } catch (e) {
    console.error('[forum/solution]', e.message);
    res.status(500).json({ error: 'Erreur lors du marquage' });
  }
});

// --- View dedup (in-memory, prevents same IP from inflating views) ---
const viewedRecently = new Map(); // key: topicId:ip, value: timestamp
setInterval(() => {
  const now = Date.now();
  for (const [k, t] of viewedRecently) {
    if (now - t > 3600000) viewedRecently.delete(k);
  }
}, 600000).unref();

// =============================================
// POST /topics/:id/view — increment view count (deduped per IP per hour)
// =============================================
router.post('/topics/:id/view', async (req, res) => {
  try {
    const { id } = req.params;
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const viewKey = id + ':' + ip;

    // Skip if already viewed recently
    if (viewedRecently.has(viewKey)) {
      return res.json({ ok: true, cached: true });
    }

    const { data: topic } = await admin()
      .from('forum_topics')
      .select('views_count')
      .eq('id', id)
      .maybeSingle();
    if (!topic) return res.status(404).json({ error: 'Discussion introuvable' });

    await admin()
      .from('forum_topics')
      .update({ views_count: (topic.views_count || 0) + 1 })
      .eq('id', id);

    viewedRecently.set(viewKey, Date.now());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// GET /stats — forum statistics
// =============================================
router.get('/stats', async (req, res) => {
  try {
    const { count: totalTopics } = await admin()
      .from('forum_topics')
      .select('id', { count: 'exact', head: true });

    const { count: totalReplies } = await admin()
      .from('forum_replies')
      .select('id', { count: 'exact', head: true });

    const { count: solvedTopics } = await admin()
      .from('forum_topics')
      .select('id', { count: 'exact', head: true })
      .eq('is_solved', true);

    const solvedPct = totalTopics > 0 ? Math.round((solvedTopics / totalTopics) * 100) : 0;

    // Active users (unique authors in last 30 days) - limited fetch for safety
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: recentAuthors } = await admin()
      .from('forum_topics')
      .select('author_email')
      .gte('created_at', thirtyDaysAgo)
      .limit(500);
    const { data: recentReplyAuthors } = await admin()
      .from('forum_replies')
      .select('author_email')
      .gte('created_at', thirtyDaysAgo)
      .limit(500);

    const uniqueEmails = new Set();
    (recentAuthors || []).forEach(a => uniqueEmails.add(a.author_email));
    (recentReplyAuthors || []).forEach(a => uniqueEmails.add(a.author_email));

    res.json({
      total_topics: totalTopics || 0,
      total_replies: totalReplies || 0,
      solved_pct: solvedPct,
      active_users: uniqueEmails.size
    });
  } catch (e) {
    console.error('[forum/stats]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// GET /reputation/:email — user reputation score
// +10 topic, +5 reply, +15 solution, +2 upvote received
// =============================================
router.get('/reputation/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);

    // Count topics by this user
    const { count: topicCount } = await admin()
      .from('forum_topics')
      .select('id', { count: 'exact', head: true })
      .eq('author_email', email);

    // Count replies by this user
    const { count: replyCount } = await admin()
      .from('forum_replies')
      .select('id', { count: 'exact', head: true })
      .eq('author_email', email);

    // Count solutions by this user
    const { count: solutionCount } = await admin()
      .from('forum_replies')
      .select('id', { count: 'exact', head: true })
      .eq('author_email', email)
      .eq('is_solution', true);

    // Sum upvotes received on this user's replies
    const { data: userReplies } = await admin()
      .from('forum_replies')
      .select('upvotes_count')
      .eq('author_email', email);
    const totalUpvotes = (userReplies || []).reduce((sum, r) => sum + (r.upvotes_count || 0), 0);

    const reputation = (topicCount || 0) * 10 + (replyCount || 0) * 5 + (solutionCount || 0) * 15 + totalUpvotes * 2;

    res.json({
      email,
      reputation,
      topics: topicCount || 0,
      replies: replyCount || 0,
      solutions: solutionCount || 0,
      upvotes_received: totalUpvotes
    });
  } catch (e) {
    console.error('[forum/reputation]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// GET /leaderboard — top 10 contributors by reputation
// =============================================
router.get('/leaderboard', async (req, res) => {
  try {
    // Get all unique authors from topics and replies (last 90 days for performance)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();

    const { data: topicAuthors } = await admin()
      .from('forum_topics')
      .select('author_email, author_display_name')
      .gte('created_at', ninetyDaysAgo)
      .limit(500);

    const { data: replyAuthors } = await admin()
      .from('forum_replies')
      .select('author_email, author_display_name')
      .gte('created_at', ninetyDaysAgo)
      .limit(500);

    // Collect unique emails
    const authorMap = {};
    (topicAuthors || []).forEach(a => { authorMap[a.author_email] = a.author_display_name; });
    (replyAuthors || []).forEach(a => { authorMap[a.author_email] = a.author_display_name; });

    // Calculate reputation for each
    const leaderPromises = Object.entries(authorMap).map(async ([email, name]) => {
      const { count: topicCount } = await admin()
        .from('forum_topics')
        .select('id', { count: 'exact', head: true })
        .eq('author_email', email);

      const { count: replyCount } = await admin()
        .from('forum_replies')
        .select('id', { count: 'exact', head: true })
        .eq('author_email', email);

      const { count: solutionCount } = await admin()
        .from('forum_replies')
        .select('id', { count: 'exact', head: true })
        .eq('author_email', email)
        .eq('is_solution', true);

      const { data: userReplies } = await admin()
        .from('forum_replies')
        .select('upvotes_count')
        .eq('author_email', email);
      const totalUpvotes = (userReplies || []).reduce((sum, r) => sum + (r.upvotes_count || 0), 0);

      const reputation = (topicCount || 0) * 10 + (replyCount || 0) * 5 + (solutionCount || 0) * 15 + totalUpvotes * 2;

      return { email, display_name: name, reputation, solutions: solutionCount || 0 };
    });

    const leaders = await Promise.all(leaderPromises);
    leaders.sort((a, b) => b.reputation - a.reputation);

    res.json(leaders.slice(0, 10));
  } catch (e) {
    console.error('[forum/leaderboard]', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================
// GET /topics/:id/related — 3 related topics
// Same category + keyword matching in title
// =============================================
router.get('/topics/:id/related', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: topic } = await admin()
      .from('forum_topics')
      .select('id, category_id, title')
      .eq('id', id)
      .maybeSingle();
    if (!topic) return res.json([]);

    // Extract keywords from title (words > 3 chars, exclude common French words)
    const stopWords = ['pour', 'dans', 'avec', 'sans', 'plus', 'mais', 'cette', 'votre', 'comment', 'quoi', 'quel', 'quelle', 'sont', 'nous', 'vous', 'leur', 'elle', 'elles'];
    const keywords = (topic.title || '')
      .toLowerCase()
      .replace(/[^a-z\u00e0-\u00ff\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.includes(w));

    // First try: same category topics
    const { data: sameCat } = await admin()
      .from('forum_topics')
      .select('id, title, replies_count, is_solved, created_at, author_display_name')
      .eq('category_id', topic.category_id)
      .neq('id', id)
      .order('created_at', { ascending: false })
      .limit(20);

    // Score by keyword overlap in title
    const scored = (sameCat || []).map(t => {
      const titleLower = (t.title || '').toLowerCase();
      let score = 0;
      keywords.forEach(kw => { if (titleLower.includes(kw)) score += 1; });
      return { ...t, _score: score };
    });

    // Sort by score desc, then recency
    scored.sort((a, b) => b._score - a._score || new Date(b.created_at) - new Date(a.created_at));

    const related = scored.slice(0, 3).map(({ _score, ...rest }) => rest);
    res.json(related);
  } catch (e) {
    console.error('[forum/related]', e.message);
    res.json([]);
  }
});

// =============================================
// GET /tags — list valid tags
// =============================================
router.get('/tags', (req, res) => {
  res.json(VALID_TAGS);
});

// =============================================
// GET /profession/:email — profession badge for user
// =============================================
router.get('/profession/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);

    // Find user_id from auth
    const { data: userData } = await admin().auth.admin.listUsers({ page: 1, perPage: 1 });
    // Fallback: look up via user_societe_roles + societes
    const { data: roles } = await admin()
      .from('user_societe_roles')
      .select('societe_id, societes(type)')
      .limit(1);

    // Alternative approach: find societe by topic author email
    const { data: topicData } = await admin()
      .from('forum_topics')
      .select('author_societe_id')
      .eq('author_email', email)
      .limit(1)
      .maybeSingle();

    if (topicData?.author_societe_id) {
      const { data: soc } = await admin()
        .from('societes')
        .select('type')
        .eq('id', topicData.author_societe_id)
        .maybeSingle();
      if (soc?.type) {
        return res.json({ profession: PROFESSION_LABELS[soc.type] || null, type: soc.type });
      }
    }

    // Try from replies
    const { data: replyData } = await admin()
      .from('forum_replies')
      .select('author_societe_id')
      .eq('author_email', email)
      .not('author_societe_id', 'is', null)
      .limit(1)
      .maybeSingle();

    if (replyData?.author_societe_id) {
      const { data: soc } = await admin()
        .from('societes')
        .select('type')
        .eq('id', replyData.author_societe_id)
        .maybeSingle();
      if (soc?.type) {
        return res.json({ profession: PROFESSION_LABELS[soc.type] || null, type: soc.type });
      }
    }

    res.json({ profession: null, type: null });
  } catch (e) {
    console.error('[forum/profession]', e.message);
    res.json({ profession: null, type: null });
  }
});

// =============================================
// GET /markdown-preview — render markdown preview
// =============================================
router.post('/markdown-preview', (req, res) => {
  const { text } = req.body;
  res.json({ html: renderMarkdown(sanitize(text || '')) });
});

module.exports = router;
