/**
 * JADOMI — API Push Notifications
 * POST /api/push/subscribe   — Enregistrer un abonnement push (public, rate limited)
 * POST /api/push/send        — Envoyer une notification push (interne, scheduler uniquement)
 * DELETE /api/push/unsubscribe — Supprimer un abonnement push (public)
 * GET /api/push/vapid-public  — Recuperer la cle publique VAPID (public)
 */
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'contact@jadomi.fr';

let _admin = null;
function admin() {
  if (!_admin) {
    if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant');
    _admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

/**
 * Charge web-push et configure VAPID (lazy)
 * Retourne null si les cles VAPID ne sont pas configurees
 */
let _webpush = null;
function getWebPush() {
  if (_webpush) return _webpush;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('[Push] VAPID_PUBLIC_KEY ou VAPID_PRIVATE_KEY manquant — push desactive');
    return null;
  }
  try {
    const webpush = require('web-push');
    webpush.setVapidDetails(
      'mailto:' + VAPID_EMAIL,
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );
    _webpush = webpush;
    return _webpush;
  } catch (e) {
    console.error('[Push] Erreur chargement web-push:', e.message);
    return null;
  }
}

// ── GET /api/push/vapid-public — Cle publique VAPID (pour le frontend) ──
router.get('/vapid-public', (req, res) => {
  if (!VAPID_PUBLIC_KEY) {
    return res.status(503).json({ error: 'Push notifications non configurees' });
  }
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// ── POST /api/push/subscribe — Enregistrer un abonnement push ──
router.post('/subscribe', async (req, res) => {
  try {
    const { endpoint, keys, patient_email, patient_telephone } = req.body;

    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: 'endpoint et keys (p256dh, auth) requis' });
    }

    // Validation basique de l'endpoint (doit etre une URL)
    try {
      new URL(endpoint);
    } catch (_) {
      return res.status(400).json({ error: 'endpoint invalide' });
    }

    // Upsert : si l'endpoint existe deja, on met a jour les cles
    const { error } = await admin().from('push_subscriptions').upsert({
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      patient_email: patient_email || null,
      patient_telephone: patient_telephone || null,
      user_agent: req.headers['user-agent'] || null,
      created_at: new Date().toISOString()
    }, { onConflict: 'endpoint' });

    if (error) {
      console.error('[Push] Erreur subscribe:', error.message);
      return res.status(500).json({ error: 'Erreur serveur' });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[Push] Erreur subscribe:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── DELETE /api/push/unsubscribe — Supprimer un abonnement push ──
router.delete('/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ error: 'endpoint requis' });
    }

    const { error } = await admin().from('push_subscriptions').delete().eq('endpoint', endpoint);
    if (error) {
      console.error('[Push] Erreur unsubscribe:', error.message);
      return res.status(500).json({ error: 'Erreur serveur' });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[Push] Erreur unsubscribe:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /api/push/send — Envoyer une notification (usage interne) ──
router.post('/send', async (req, res) => {
  try {
    const wp = getWebPush();
    if (!wp) {
      return res.status(503).json({ error: 'Push non configure (VAPID keys manquantes)' });
    }

    const { subscription, title, body, url, tag, actions } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'subscription requise' });
    }

    const payload = JSON.stringify({
      title: title || 'JADOMI',
      body: body || '',
      url: url || '/',
      tag: tag || 'jadomi-rappel',
      actions: actions || []
    });

    await wp.sendNotification(subscription, payload);
    res.json({ ok: true });
  } catch (e) {
    console.error('[Push] Erreur send:', e.message);
    // 410 Gone = subscription expired, cleanup
    if (e.statusCode === 410 || e.statusCode === 404) {
      try {
        await admin().from('push_subscriptions').delete().eq('endpoint', req.body.subscription.endpoint);
      } catch (_) {}
      return res.status(410).json({ error: 'Abonnement expire, supprime' });
    }
    res.status(500).json({ error: 'Erreur envoi push' });
  }
});

/**
 * Fonction utilitaire : envoyer un push a un patient par email ou telephone
 * Utilisee par le rappels-scheduler (pas une route HTTP)
 * @returns {{ success: boolean, error?: string }}
 */
async function sendPushToPatient({ email, telephone, title, body, url, tag }) {
  const wp = getWebPush();
  if (!wp) {
    return { success: false, error: 'VAPID non configure' };
  }

  try {
    // Chercher les subscriptions du patient
    let query = admin().from('push_subscriptions').select('*');
    if (email) {
      query = query.eq('patient_email', email);
    } else if (telephone) {
      query = query.eq('patient_telephone', telephone);
    } else {
      return { success: false, error: 'Ni email ni telephone fourni' };
    }

    const { data: subs, error } = await query;
    if (error || !subs || subs.length === 0) {
      return { success: false, error: 'Aucun abonnement push trouve' };
    }

    const payload = JSON.stringify({
      title: title || 'JADOMI',
      body: body || '',
      url: url || '/',
      tag: tag || 'jadomi-rappel'
    });

    let sent = 0;
    for (const sub of subs) {
      try {
        await wp.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        }, payload);
        sent++;
      } catch (e) {
        // Cleanup expired subscriptions
        if (e.statusCode === 410 || e.statusCode === 404) {
          try {
            await admin().from('push_subscriptions').delete().eq('id', sub.id);
          } catch (_) {}
        }
        console.warn('[Push] Erreur envoi a', sub.endpoint.substring(0, 50) + '...:', e.message);
      }
    }

    return { success: sent > 0, sent, total: subs.length };
  } catch (e) {
    console.error('[Push] Erreur sendPushToPatient:', e.message);
    return { success: false, error: e.message };
  }
}

module.exports = router;
module.exports.sendPushToPatient = sendPushToPatient;
