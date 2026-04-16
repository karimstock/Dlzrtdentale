// =============================================
// JADOMI — Notifications temps réel
// Routes /api/notifications/*
// =============================================
const express = require('express');
const { admin, authSupabase, auditLog } = require('./middleware');

// Helper réutilisable pour pousser une notification depuis d'autres modules
async function pushNotification({
  user_id, societe_id = null, type, urgence = 'normale',
  titre, message = null, cta_label = null, cta_url = null,
  entity_type = null, entity_id = null
}) {
  if (!user_id || !type || !titre) return null;
  try {
    const { data, error } = await admin().from('notifications').insert({
      user_id, societe_id, type, urgence,
      titre, message, cta_label, cta_url,
      entity_type, entity_id
    }).select('*').single();
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn('[pushNotification] skip:', e.message);
    return null;
  }
}

// Diffuse une notification à tous les membres d'une société (rôle filtré optionnel)
async function pushNotificationSociete({
  societe_id, roles = null, ...rest
}) {
  try {
    let q = admin().from('user_societe_roles').select('user_id, role').eq('societe_id', societe_id);
    if (roles && roles.length) q = q.in('role', roles);
    const { data, error } = await q;
    if (error) throw error;
    for (const r of data || []) {
      await pushNotification({ ...rest, user_id: r.user_id, societe_id });
    }
  } catch (e) { console.warn('[pushNotificationSociete] skip:', e.message); }
}

function mountNotifications(app) {
  const router = express.Router();
  router.use(authSupabase());

  // Liste des notifications (filtres: lu/urgence)
  router.get('/', async (req, res) => {
    try {
      const onlyUnread = req.query.unread === '1';
      const limit = Math.min(100, parseInt(req.query.limit || '30', 10) || 30);
      let qb = admin().from('notifications').select('*', { count: 'exact' })
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false }).limit(limit);
      if (onlyUnread) qb = qb.eq('lu', false);
      const { data, count, error } = await qb;
      if (error) throw error;

      // Compteur urgentes non lues
      const { count: nbUrgentes } = await admin().from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', req.user.id).eq('lu', false).eq('urgence', 'urgente');

      res.json({
        success: true,
        notifications: data || [],
        total: count || 0,
        nb_urgentes: nbUrgentes || 0
      });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Badge seul : nombre non lues + nb urgentes
  router.get('/badge', async (req, res) => {
    try {
      const [{ count: total }, { count: urgentes }] = await Promise.all([
        admin().from('notifications').select('id', { count: 'exact', head: true })
          .eq('user_id', req.user.id).eq('lu', false),
        admin().from('notifications').select('id', { count: 'exact', head: true })
          .eq('user_id', req.user.id).eq('lu', false).eq('urgence', 'urgente')
      ]);
      res.json({ success: true, total: total || 0, urgentes: urgentes || 0 });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Marquer une notif comme lue
  router.patch('/:id/lu', async (req, res) => {
    try {
      const { data, error } = await admin().from('notifications')
        .update({ lu: true, lu_at: new Date().toISOString() })
        .eq('id', req.params.id).eq('user_id', req.user.id)
        .select('*').single();
      if (error) throw error;
      res.json({ success: true, notification: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Tout marquer lu
  router.post('/mark-all-read', async (req, res) => {
    try {
      await admin().from('notifications')
        .update({ lu: true, lu_at: new Date().toISOString() })
        .eq('user_id', req.user.id).eq('lu', false);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Supprimer une notif
  router.delete('/:id', async (req, res) => {
    try {
      await admin().from('notifications').delete()
        .eq('id', req.params.id).eq('user_id', req.user.id);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.use('/api/notifications', router);
  console.log('[JADOMI] Routes /api/notifications montées');
}

module.exports = mountNotifications;
module.exports.pushNotification = pushNotification;
module.exports.pushNotificationSociete = pushNotificationSociete;
