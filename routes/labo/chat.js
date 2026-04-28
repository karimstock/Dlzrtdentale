// =============================================
// JADOMI LABO — Chat dentiste-prothesiste
// Messagerie temps reel entre labos et dentistes
// =============================================

const express = require('express');
const router = express.Router();
const portailRouter = express.Router();
const { admin } = require('../../api/multiSocietes/middleware');

// =============================================
// HELPER: Validate dentist portal token
// =============================================
async function validateDentisteToken(token) {
  if (!token) return null;

  const { data: dentistes } = await admin()
    .from('dentistes_clients')
    .select('id, nom, prenom, prothesiste_id, notes')
    .not('notes', 'is', null);

  if (!dentistes) return null;

  for (const d of dentistes) {
    try {
      const notes = typeof d.notes === 'string' ? JSON.parse(d.notes) : d.notes;
      if (notes?.portal_token === token) {
        const expires = new Date(notes.portal_expires);
        if (expires > new Date()) {
          return { id: d.id, nom: d.nom, prenom: d.prenom, prothesiste_id: d.prothesiste_id };
        }
      }
    } catch (_) { /* skip malformed notes */ }
  }
  return null;
}

// =============================================
// LAB-SIDE ENDPOINTS (auth via labo middleware)
// =============================================

// GET /chat/conversations — List conversations
router.get('/conversations', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(400).json({ error: 'Profil prothesiste requis' });

    let query = admin()
      .from('labo_conversations')
      .select(`
        id, sujet, statut, dernier_message_at, created_at,
        case_production_id,
        dentiste_id,
        dentistes_clients!inner(id, nom, prenom, cabinet_nom)
      `)
      .eq('prothesiste_id', req.prothesisteId)
      .order('dernier_message_at', { ascending: false });

    if (req.query.dentiste_id) query = query.eq('dentiste_id', req.query.dentiste_id);
    if (req.query.case_id) query = query.eq('case_production_id', req.query.case_id);

    const { data: conversations, error } = await query;
    if (error) throw error;

    // Get last message + unread count for each conversation
    const enriched = await Promise.all((conversations || []).map(async (conv) => {
      const { data: lastMsg } = await admin()
        .from('labo_messages')
        .select('contenu, auteur_type, auteur_nom, type, created_at')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { count } = await admin()
        .from('labo_messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .eq('lu_labo', false)
        .eq('auteur_type', 'dentiste');

      return {
        ...conv,
        dentiste: conv.dentistes_clients,
        dentistes_clients: undefined,
        dernier_message: lastMsg || null,
        non_lus: count || 0
      };
    }));

    res.json({ conversations: enriched });
  } catch (e) {
    console.error('[LABO chat conversations]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// GET /chat/conversations/:id/messages — Get messages (paginated)
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(400).json({ error: 'Profil prothesiste requis' });

    // Verify conversation belongs to this lab
    const { data: conv } = await admin()
      .from('labo_conversations')
      .select('id')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .maybeSingle();

    if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });

    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;

    const { data: messages, error, count } = await admin()
      .from('labo_messages')
      .select('*', { count: 'exact' })
      .eq('conversation_id', req.params.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      messages: messages || [],
      page,
      total: count || 0,
      pages: Math.ceil((count || 0) / limit)
    });
  } catch (e) {
    console.error('[LABO chat messages]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /chat/conversations — Create conversation
router.post('/conversations', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(400).json({ error: 'Profil prothesiste requis' });

    const { dentiste_id, case_production_id, sujet } = req.body;
    if (!dentiste_id) return res.status(400).json({ error: 'dentiste_id requis' });

    // Verify dentist belongs to this lab
    const { data: dentiste } = await admin()
      .from('dentistes_clients')
      .select('id')
      .eq('id', dentiste_id)
      .eq('prothesiste_id', req.prothesisteId)
      .maybeSingle();

    if (!dentiste) return res.status(404).json({ error: 'Dentiste non trouve' });

    const { data: conv, error } = await admin()
      .from('labo_conversations')
      .insert({
        prothesiste_id: req.prothesisteId,
        dentiste_id,
        case_production_id: case_production_id || null,
        sujet: sujet || null
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ conversation: conv });
  } catch (e) {
    console.error('[LABO chat create conv]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /chat/conversations/:id/messages — Send message (lab side)
router.post('/conversations/:id/messages', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(400).json({ error: 'Profil prothesiste requis' });

    // Verify conversation belongs to this lab
    const { data: conv } = await admin()
      .from('labo_conversations')
      .select('id')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .maybeSingle();

    if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });

    const { contenu, pieces_jointes, type } = req.body;
    if (!contenu) return res.status(400).json({ error: 'contenu requis' });

    const { data: message, error } = await admin()
      .from('labo_messages')
      .insert({
        conversation_id: req.params.id,
        auteur_type: 'labo',
        auteur_nom: req.prothesiste?.nom_laboratoire || 'Laboratoire',
        contenu,
        pieces_jointes: pieces_jointes || [],
        type: type || 'text',
        lu_labo: true,
        lu_dentiste: false
      })
      .select()
      .single();

    if (error) throw error;

    // Update dernier_message_at
    await admin()
      .from('labo_conversations')
      .update({ dernier_message_at: new Date().toISOString() })
      .eq('id', req.params.id);

    res.status(201).json({ message });
  } catch (e) {
    console.error('[LABO chat send msg]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /chat/conversations/:id/lire — Mark messages as read (lab side)
router.post('/conversations/:id/lire', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(400).json({ error: 'Profil prothesiste requis' });

    // Verify conversation belongs to this lab
    const { data: conv } = await admin()
      .from('labo_conversations')
      .select('id')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .maybeSingle();

    if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });

    const { error } = await admin()
      .from('labo_messages')
      .update({ lu_labo: true })
      .eq('conversation_id', req.params.id)
      .eq('lu_labo', false);

    if (error) throw error;

    res.json({ success: true });
  } catch (e) {
    console.error('[LABO chat lire]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// GET /chat/unread — Total unread count
router.get('/unread', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(400).json({ error: 'Profil prothesiste requis' });

    // Get all conversation IDs for this lab
    const { data: convs } = await admin()
      .from('labo_conversations')
      .select('id')
      .eq('prothesiste_id', req.prothesisteId)
      .eq('statut', 'active');

    if (!convs || convs.length === 0) return res.json({ unread: 0 });

    const convIds = convs.map(c => c.id);

    const { count, error } = await admin()
      .from('labo_messages')
      .select('id', { count: 'exact', head: true })
      .in('conversation_id', convIds)
      .eq('lu_labo', false)
      .eq('auteur_type', 'dentiste');

    if (error) throw error;

    res.json({ unread: count || 0 });
  } catch (e) {
    console.error('[LABO chat unread]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// =============================================
// DENTIST-SIDE ENDPOINTS (auth via magic link token)
// =============================================

// Middleware: validate token on all portail-chat routes
portailRouter.use(async (req, res, next) => {
  try {
    const token = req.query.token || req.headers['x-portal-token'];
    if (!token) return res.status(401).json({ error: 'Token requis' });

    const dentiste = await validateDentisteToken(token);
    if (!dentiste) return res.status(401).json({ error: 'Token invalide ou expire' });

    req.dentisteId = dentiste.id;
    req.dentisteNom = `Dr ${dentiste.prenom || ''} ${dentiste.nom || ''}`.trim();
    req.dentisteProthesisteId = dentiste.prothesiste_id;
    next();
  } catch (e) {
    console.error('[PORTAIL chat auth]', e.message);
    res.status(500).json({ error: 'Erreur authentification' });
  }
});

// GET /portail-chat/conversations — Dentist's conversations
portailRouter.get('/conversations', async (req, res) => {
  try {
    const { data: conversations, error } = await admin()
      .from('labo_conversations')
      .select(`
        id, sujet, statut, dernier_message_at, created_at,
        case_production_id
      `)
      .eq('dentiste_id', req.dentisteId)
      .eq('prothesiste_id', req.dentisteProthesisteId)
      .order('dernier_message_at', { ascending: false });

    if (error) throw error;

    // Get last message + unread count for each conversation
    const enriched = await Promise.all((conversations || []).map(async (conv) => {
      const { data: lastMsg } = await admin()
        .from('labo_messages')
        .select('contenu, auteur_type, auteur_nom, type, created_at')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { count } = await admin()
        .from('labo_messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .eq('lu_dentiste', false)
        .eq('auteur_type', 'labo');

      return {
        ...conv,
        dernier_message: lastMsg || null,
        non_lus: count || 0
      };
    }));

    res.json({ conversations: enriched });
  } catch (e) {
    console.error('[PORTAIL chat conversations]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// GET /portail-chat/conversations/:id/messages — Dentist reads messages
portailRouter.get('/conversations/:id/messages', async (req, res) => {
  try {
    // Verify conversation belongs to this dentist
    const { data: conv } = await admin()
      .from('labo_conversations')
      .select('id')
      .eq('id', req.params.id)
      .eq('dentiste_id', req.dentisteId)
      .maybeSingle();

    if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });

    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;

    const { data: messages, error, count } = await admin()
      .from('labo_messages')
      .select('*', { count: 'exact' })
      .eq('conversation_id', req.params.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      messages: messages || [],
      page,
      total: count || 0,
      pages: Math.ceil((count || 0) / limit)
    });
  } catch (e) {
    console.error('[PORTAIL chat messages]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /portail-chat/conversations/:id/messages — Dentist sends message
portailRouter.post('/conversations/:id/messages', async (req, res) => {
  try {
    // Verify conversation belongs to this dentist
    const { data: conv } = await admin()
      .from('labo_conversations')
      .select('id')
      .eq('id', req.params.id)
      .eq('dentiste_id', req.dentisteId)
      .maybeSingle();

    if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });

    const { contenu, pieces_jointes, type } = req.body;
    if (!contenu) return res.status(400).json({ error: 'contenu requis' });

    const { data: message, error } = await admin()
      .from('labo_messages')
      .insert({
        conversation_id: req.params.id,
        auteur_type: 'dentiste',
        auteur_nom: req.dentisteNom,
        contenu,
        pieces_jointes: pieces_jointes || [],
        type: type || 'text',
        lu_labo: false,
        lu_dentiste: true
      })
      .select()
      .single();

    if (error) throw error;

    // Update dernier_message_at
    await admin()
      .from('labo_conversations')
      .update({ dernier_message_at: new Date().toISOString() })
      .eq('id', req.params.id);

    res.status(201).json({ message });
  } catch (e) {
    console.error('[PORTAIL chat send msg]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// POST /portail-chat/conversations/:id/lire — Dentist marks as read
portailRouter.post('/conversations/:id/lire', async (req, res) => {
  try {
    // Verify conversation belongs to this dentist
    const { data: conv } = await admin()
      .from('labo_conversations')
      .select('id')
      .eq('id', req.params.id)
      .eq('dentiste_id', req.dentisteId)
      .maybeSingle();

    if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });

    const { error } = await admin()
      .from('labo_messages')
      .update({ lu_dentiste: true })
      .eq('conversation_id', req.params.id)
      .eq('lu_dentiste', false);

    if (error) throw error;

    res.json({ success: true });
  } catch (e) {
    console.error('[PORTAIL chat lire]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = { chatRouter: router, portailChatRouter: portailRouter };
