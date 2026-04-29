// =============================================
// JADOMI — Support Ticket System API
// Routes /api/support/*
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { authSupabase } = require('../multiSocietes/middleware');

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

const ADMIN_EMAIL = 'contact@jadomi.fr';
const VALID_CATEGORIES = ['bug', 'question', 'demande_fonctionnalite', 'facturation', 'technique', 'autre'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const VALID_STATUSES = ['ouvert', 'en_cours', 'resolu', 'ferme'];

// --- Rate limiter: 10 tickets/hour per user ---
const ticketCreationLimits = new Map();
function checkTicketRateLimit(email) {
  const now = Date.now();
  const key = email.toLowerCase();
  if (!ticketCreationLimits.has(key)) {
    ticketCreationLimits.set(key, []);
  }
  const timestamps = ticketCreationLimits.get(key).filter(t => now - t < 3600000);
  ticketCreationLimits.set(key, timestamps);
  if (timestamps.length >= 10) return false;
  timestamps.push(now);
  return true;
}

// Cleanup stale rate limit entries every 30 min
const _rateLimitCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of ticketCreationLimits.entries()) {
    const valid = timestamps.filter(t => now - t < 3600000);
    if (valid.length === 0) ticketCreationLimits.delete(key);
    else ticketCreationLimits.set(key, valid);
  }
}, 1800000);
_rateLimitCleanup.unref();

// --- Input validation helpers ---
function sanitize(str, maxLen) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(str) {
  return typeof str === 'string' && UUID_REGEX.test(str);
}

// =============================================
// USER ROUTES (auth required)
// =============================================

// POST /api/support/tickets — Create a new ticket
router.post('/tickets', authSupabase(), async (req, res) => {
  try {
    const email = req.user.email;
    if (!checkTicketRateLimit(email)) {
      return res.status(429).json({ error: 'Limite atteinte : 10 tickets par heure maximum.' });
    }

    const societeId = req.headers['x-societe-id'] || req.body.societe_id;
    if (!societeId) return res.status(400).json({ error: 'societe_id manquant' });
    if (!isValidUUID(societeId)) return res.status(400).json({ error: 'societe_id invalide.' });

    const subject = sanitize(req.body.subject, 200);
    const description = sanitize(req.body.description, 5000);
    const category = VALID_CATEGORIES.includes(req.body.category) ? req.body.category : 'autre';
    const priority = VALID_PRIORITIES.includes(req.body.priority) ? req.body.priority : 'medium';

    if (!subject || subject.length < 3) {
      return res.status(400).json({ error: 'Le sujet doit contenir au moins 3 caractères.' });
    }
    if (!description || description.length < 10) {
      return res.status(400).json({ error: 'La description doit contenir au moins 10 caractères.' });
    }

    // Verify user belongs to societe
    const { data: role } = await admin()
      .from('user_societe_roles')
      .select('role')
      .eq('user_id', req.user.id)
      .eq('societe_id', societeId)
      .maybeSingle();
    if (!role) return res.status(403).json({ error: 'Accès interdit à cette société.' });

    const { data: ticket, error } = await admin()
      .from('support_tickets')
      .insert({
        societe_id: societeId,
        user_email: email,
        subject,
        description,
        category,
        priority
      })
      .select()
      .single();

    if (error) throw error;

    // Auto-create first message from description
    await admin().from('support_ticket_messages').insert({
      ticket_id: ticket.id,
      sender_type: 'user',
      sender_email: email,
      message: description
    });

    res.status(201).json({ ticket });
  } catch (e) {
    console.error('[support/create]', e.message);
    res.status(500).json({ error: 'Erreur lors de la création du ticket.' });
  }
});

// GET /api/support/tickets — List user's tickets
router.get('/tickets', authSupabase(), async (req, res) => {
  try {
    const email = req.user.email;
    const societeId = req.headers['x-societe-id'];

    let query = admin()
      .from('support_tickets')
      .select('*')
      .eq('user_email', email)
      .order('created_at', { ascending: false });

    if (societeId) {
      if (!isValidUUID(societeId)) return res.status(400).json({ error: 'societe_id invalide.' });
      query = query.eq('societe_id', societeId);
    }
    if (req.query.status && VALID_STATUSES.includes(req.query.status)) {
      query = query.eq('status', req.query.status);
    }
    if (req.query.category && VALID_CATEGORIES.includes(req.query.category)) {
      query = query.eq('category', req.query.category);
    }

    const limit = Math.max(1, Math.min(parseInt(req.query.limit) || 50, 100));
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ tickets: data || [], count: data ? data.length : 0 });
  } catch (e) {
    console.error('[support/list]', e.message);
    res.status(500).json({ error: 'Erreur lors de la récupération des tickets.' });
  }
});

// GET /api/support/tickets/stats — User's ticket stats
router.get('/tickets/stats', authSupabase(), async (req, res) => {
  try {
    const email = req.user.email;
    const societeId = req.headers['x-societe-id'];

    let query = admin()
      .from('support_tickets')
      .select('id, status, created_at, resolved_at')
      .eq('user_email', email);
    if (societeId) {
      if (!isValidUUID(societeId)) return res.status(400).json({ error: 'societe_id invalide.' });
      query = query.eq('societe_id', societeId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const tickets = data || [];
    const open = tickets.filter(t => t.status === 'ouvert' || t.status === 'en_cours').length;
    const resolved = tickets.filter(t => t.status === 'resolu' || t.status === 'ferme').length;

    // Avg resolution time (in hours)
    const resolvedWithTime = tickets.filter(t => t.resolved_at);
    let avgResolutionHours = null;
    if (resolvedWithTime.length > 0) {
      const total = resolvedWithTime.reduce((sum, t) => {
        return sum + (new Date(t.resolved_at) - new Date(t.created_at));
      }, 0);
      avgResolutionHours = Math.round(total / resolvedWithTime.length / 3600000 * 10) / 10;
    }

    res.json({ total: tickets.length, open, resolved, avgResolutionHours });
  } catch (e) {
    console.error('[support/stats]', e.message);
    res.status(500).json({ error: 'Erreur lors du calcul des statistiques.' });
  }
});

// GET /api/support/tickets/:id — Get ticket detail + messages
router.get('/tickets/:id', authSupabase(), async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return res.status(400).json({ error: 'Identifiant de ticket invalide.' });
    const email = req.user.email;
    const isAdmin = email === ADMIN_EMAIL;

    const { data: ticket, error } = await admin()
      .from('support_tickets')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !ticket) return res.status(404).json({ error: 'Ticket introuvable.' });
    if (!isAdmin && ticket.user_email !== email) {
      return res.status(403).json({ error: 'Accès interdit.' });
    }

    const { data: messages } = await admin()
      .from('support_ticket_messages')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true });

    const { data: satisfaction } = await admin()
      .from('support_ticket_satisfaction')
      .select('*')
      .eq('ticket_id', ticket.id)
      .maybeSingle();

    res.json({ ticket, messages: messages || [], satisfaction: satisfaction || null });
  } catch (e) {
    console.error('[support/detail]', e.message);
    res.status(500).json({ error: 'Erreur lors de la récupération du ticket.' });
  }
});

// POST /api/support/tickets/:id/messages — Add message to ticket
router.post('/tickets/:id/messages', authSupabase(), async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return res.status(400).json({ error: 'Identifiant de ticket invalide.' });
    const email = req.user.email;
    const message = sanitize(req.body.message, 5000);
    if (!message || message.length < 1) {
      return res.status(400).json({ error: 'Le message ne peut pas être vide.' });
    }

    const { data: ticket } = await admin()
      .from('support_tickets')
      .select('id, user_email, status')
      .eq('id', req.params.id)
      .single();

    if (!ticket) return res.status(404).json({ error: 'Ticket introuvable.' });
    if (ticket.user_email !== email) {
      return res.status(403).json({ error: 'Accès interdit.' });
    }
    if (ticket.status === 'ferme') {
      return res.status(400).json({ error: 'Ce ticket est fermé. Veuillez le rouvrir avant de répondre.' });
    }

    const { data: msg, error } = await admin()
      .from('support_ticket_messages')
      .insert({
        ticket_id: ticket.id,
        sender_type: 'user',
        sender_email: email,
        message
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ message: msg });
  } catch (e) {
    console.error('[support/message]', e.message);
    res.status(500).json({ error: 'Erreur lors de l\'envoi du message.' });
  }
});

// POST /api/support/tickets/:id/close — Close ticket
router.post('/tickets/:id/close', authSupabase(), async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return res.status(400).json({ error: 'Identifiant de ticket invalide.' });
    const email = req.user.email;
    const { data: ticket } = await admin()
      .from('support_tickets')
      .select('id, user_email, status')
      .eq('id', req.params.id)
      .single();

    if (!ticket) return res.status(404).json({ error: 'Ticket introuvable.' });
    if (ticket.user_email !== email && email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Accès interdit.' });
    }
    if (ticket.status === 'ferme') {
      return res.status(400).json({ error: 'Ce ticket est déjà fermé.' });
    }

    const { data, error } = await admin()
      .from('support_tickets')
      .update({ status: 'ferme', resolved_at: new Date().toISOString() })
      .eq('id', ticket.id)
      .select()
      .single();

    if (error) throw error;

    // System message
    await admin().from('support_ticket_messages').insert({
      ticket_id: ticket.id,
      sender_type: 'system',
      sender_email: 'system',
      message: 'Le ticket a été fermé par ' + (email === ADMIN_EMAIL ? 'l\'administrateur' : 'l\'utilisateur') + '.'
    });

    res.json({ ticket: data });
  } catch (e) {
    console.error('[support/close]', e.message);
    res.status(500).json({ error: 'Erreur lors de la fermeture du ticket.' });
  }
});

// POST /api/support/tickets/:id/reopen — Reopen ticket
router.post('/tickets/:id/reopen', authSupabase(), async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return res.status(400).json({ error: 'Identifiant de ticket invalide.' });
    const email = req.user.email;
    const { data: ticket } = await admin()
      .from('support_tickets')
      .select('id, user_email, status')
      .eq('id', req.params.id)
      .single();

    if (!ticket) return res.status(404).json({ error: 'Ticket introuvable.' });
    if (ticket.user_email !== email && email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Accès interdit.' });
    }
    if (ticket.status !== 'ferme' && ticket.status !== 'resolu') {
      return res.status(400).json({ error: 'Ce ticket n\'est pas fermé.' });
    }

    const { data, error } = await admin()
      .from('support_tickets')
      .update({ status: 'ouvert', resolved_at: null })
      .eq('id', ticket.id)
      .select()
      .single();

    if (error) throw error;

    await admin().from('support_ticket_messages').insert({
      ticket_id: ticket.id,
      sender_type: 'system',
      sender_email: 'system',
      message: 'Le ticket a été rouvert par ' + (email === ADMIN_EMAIL ? 'l\'administrateur' : 'l\'utilisateur') + '.'
    });

    res.json({ ticket: data });
  } catch (e) {
    console.error('[support/reopen]', e.message);
    res.status(500).json({ error: 'Erreur lors de la réouverture du ticket.' });
  }
});

// POST /api/support/tickets/:id/satisfaction — Rate a resolved ticket
router.post('/tickets/:id/satisfaction', authSupabase(), async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return res.status(400).json({ error: 'Identifiant de ticket invalide.' });
    const email = req.user.email;
    const { data: ticket } = await admin()
      .from('support_tickets')
      .select('id, user_email, status')
      .eq('id', req.params.id)
      .single();

    if (!ticket) return res.status(404).json({ error: 'Ticket introuvable.' });
    if (ticket.user_email !== email) {
      return res.status(403).json({ error: 'Accès interdit.' });
    }
    if (ticket.status !== 'resolu' && ticket.status !== 'ferme') {
      return res.status(400).json({ error: 'Vous ne pouvez noter qu\'un ticket résolu ou fermé.' });
    }

    const rating = parseInt(req.body.rating);
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'La note doit être entre 1 et 5.' });
    }

    const comment = sanitize(req.body.comment || '', 1000);

    // Upsert satisfaction
    const { data: existing } = await admin()
      .from('support_ticket_satisfaction')
      .select('id')
      .eq('ticket_id', ticket.id)
      .maybeSingle();

    let result;
    if (existing) {
      const { data, error } = await admin()
        .from('support_ticket_satisfaction')
        .update({ rating, comment })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await admin()
        .from('support_ticket_satisfaction')
        .insert({ ticket_id: ticket.id, rating, comment })
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    res.json({ satisfaction: result });
  } catch (e) {
    console.error('[support/satisfaction]', e.message);
    res.status(500).json({ error: 'Erreur lors de l\'envoi de la note.' });
  }
});

// =============================================
// ADMIN ROUTES (admin email only)
// =============================================
function requireAdmin() {
  return (req, res, next) => {
    if (!req.user || req.user.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Accès réservé à l\'administrateur.' });
    }
    next();
  };
}

// GET /api/support/admin/tickets — All tickets with filters
router.get('/admin/tickets', authSupabase(), requireAdmin(), async (req, res) => {
  try {
    let query = admin()
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });

    if (req.query.status && VALID_STATUSES.includes(req.query.status)) {
      query = query.eq('status', req.query.status);
    }
    if (req.query.category && VALID_CATEGORIES.includes(req.query.category)) {
      query = query.eq('category', req.query.category);
    }
    if (req.query.priority && VALID_PRIORITIES.includes(req.query.priority)) {
      query = query.eq('priority', req.query.priority);
    }
    if (req.query.from) {
      const fromDate = new Date(req.query.from);
      if (!isNaN(fromDate.getTime())) query = query.gte('created_at', fromDate.toISOString());
    }
    if (req.query.to) {
      const toDate = new Date(req.query.to);
      if (!isNaN(toDate.getTime())) query = query.lte('created_at', toDate.toISOString());
    }

    const limit = Math.max(1, Math.min(parseInt(req.query.limit) || 50, 200));
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ tickets: data || [] });
  } catch (e) {
    console.error('[support/admin/list]', e.message);
    res.status(500).json({ error: 'Erreur admin liste tickets.' });
  }
});

// GET /api/support/admin/stats — Admin dashboard stats
router.get('/admin/stats', authSupabase(), requireAdmin(), async (req, res) => {
  try {
    const { data: tickets, error } = await admin()
      .from('support_tickets')
      .select('id, status, created_at, resolved_at');
    if (error) throw error;

    const all = tickets || [];
    const open = all.filter(t => t.status === 'ouvert').length;
    const enCours = all.filter(t => t.status === 'en_cours').length;
    const resolu = all.filter(t => t.status === 'resolu').length;
    const ferme = all.filter(t => t.status === 'ferme').length;

    const resolvedWithTime = all.filter(t => t.resolved_at);
    let avgResolutionHours = null;
    if (resolvedWithTime.length > 0) {
      const total = resolvedWithTime.reduce((sum, t) => {
        return sum + (new Date(t.resolved_at) - new Date(t.created_at));
      }, 0);
      avgResolutionHours = Math.round(total / resolvedWithTime.length / 3600000 * 10) / 10;
    }

    // Average satisfaction
    const { data: sats } = await admin()
      .from('support_ticket_satisfaction')
      .select('rating');
    let avgSatisfaction = null;
    if (sats && sats.length > 0) {
      avgSatisfaction = Math.round(sats.reduce((s, r) => s + r.rating, 0) / sats.length * 10) / 10;
    }

    res.json({
      total: all.length, open, enCours, resolu, ferme,
      avgResolutionHours, avgSatisfaction,
      satisfactionCount: sats ? sats.length : 0
    });
  } catch (e) {
    console.error('[support/admin/stats]', e.message);
    res.status(500).json({ error: 'Erreur stats admin.' });
  }
});

// PATCH /api/support/admin/tickets/:id — Update status/priority/assigned
router.patch('/admin/tickets/:id', authSupabase(), requireAdmin(), async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return res.status(400).json({ error: 'Identifiant de ticket invalide.' });
    const updates = {};
    if (req.body.status && VALID_STATUSES.includes(req.body.status)) {
      updates.status = req.body.status;
      if (req.body.status === 'resolu' || req.body.status === 'ferme') {
        updates.resolved_at = new Date().toISOString();
      }
      if (req.body.status === 'ouvert' || req.body.status === 'en_cours') {
        updates.resolved_at = null;
      }
    }
    if (req.body.priority && VALID_PRIORITIES.includes(req.body.priority)) {
      updates.priority = req.body.priority;
    }
    if (typeof req.body.assigned_to === 'string') {
      updates.assigned_to = sanitize(req.body.assigned_to, 200);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucune modification fournie.' });
    }

    const { data, error } = await admin()
      .from('support_tickets')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Ticket introuvable.' });

    // System message for status change
    if (updates.status) {
      await admin().from('support_ticket_messages').insert({
        ticket_id: req.params.id,
        sender_type: 'system',
        sender_email: 'system',
        message: 'Statut modifié en "' + updates.status + '" par l\'administrateur.'
      });
    }

    res.json({ ticket: data });
  } catch (e) {
    console.error('[support/admin/update]', e.message);
    res.status(500).json({ error: 'Erreur mise à jour ticket.' });
  }
});

// POST /api/support/admin/tickets/:id/messages — Admin reply
router.post('/admin/tickets/:id/messages', authSupabase(), requireAdmin(), async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return res.status(400).json({ error: 'Identifiant de ticket invalide.' });
    const message = sanitize(req.body.message, 5000);
    if (!message || message.length < 1) {
      return res.status(400).json({ error: 'Le message ne peut pas être vide.' });
    }

    // Verify ticket exists
    const { data: ticket } = await admin()
      .from('support_tickets')
      .select('id, status')
      .eq('id', req.params.id)
      .single();

    if (!ticket) return res.status(404).json({ error: 'Ticket introuvable.' });

    // If ticket is ouvert, move to en_cours
    if (ticket.status === 'ouvert') {
      await admin()
        .from('support_tickets')
        .update({ status: 'en_cours' })
        .eq('id', ticket.id);
    }

    const { data: msg, error } = await admin()
      .from('support_ticket_messages')
      .insert({
        ticket_id: ticket.id,
        sender_type: 'admin',
        sender_email: ADMIN_EMAIL,
        message
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ message: msg });
  } catch (e) {
    console.error('[support/admin/reply]', e.message);
    res.status(500).json({ error: 'Erreur envoi réponse admin.' });
  }
});

module.exports = router;
