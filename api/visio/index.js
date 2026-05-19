// =============================================
// JADOMI — Visio universelle : API de visioconference pour tous les professionnels
// Dentistes, avocats, prothesistes, kines, etc.
// Deux modes : client JADOMI (JWT) ou client externe (lien + nom, zero friction)
// =============================================
const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { admin, authSupabase, requireSociete } = require('../multiSocietes/middleware');

// --- Email service (best-effort) ---
let sendMail = null;
try {
  const emailService = require('../emailService');
  sendMail = emailService.sendMail;
} catch (_) {
  console.warn('[visio] emailService non disponible — invitations email désactivées');
}

const BASE_URL = process.env.BASE_URL || 'https://jadomi.fr';

// =============================================
// In-memory signaling store (peer-to-peer)
// =============================================
const signalingRooms = new Map();

// Nettoyage automatique toutes les 30 minutes : supprime les rooms > 4h
setInterval(() => {
  const now = Date.now();
  for (const [token, room] of signalingRooms) {
    if (now - room.created > 4 * 3600000) signalingRooms.delete(token);
  }
}, 30 * 60000);

// Initialise la room in-memory si absente
function ensureSignalingRoom(token) {
  if (!signalingRooms.has(token)) {
    signalingRooms.set(token, { created: Date.now(), messages: [], chat: [] });
  }
  return signalingRooms.get(token);
}

// =============================================
// Helpers
// =============================================

function generateToken() {
  return crypto.randomUUID();
}

function appendAuditLog(existingLog, entry) {
  const log = Array.isArray(existingLog) ? existingLog : [];
  log.push({ ...entry, timestamp: new Date().toISOString() });
  return log;
}

function isRoomExpired(session) {
  if (!session.created_at) return false;
  const created = new Date(session.created_at).getTime();
  const durationMs = ((session.duration_minutes || 60) + 60) * 60000; // duree + 60min buffer
  return Date.now() > created + durationMs;
}

// Middleware compose : authSupabase + requireSociete
function requireAuth() {
  return [authSupabase(), requireSociete()];
}

// =============================================
// Email d'invitation
// =============================================
async function sendInviteEmail({ guestName, guestEmail, hostName, token }) {
  if (!sendMail || !guestEmail) return false;
  try {
    const url = `${BASE_URL}/visio/${token}`;
    await sendMail({
      to: guestEmail,
      subject: 'Invitation à une consultation vidéo — JADOMI',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #111; font-weight: 600;">Consultation vidéo JADOMI</h2>
          <p style="color: #333; line-height: 1.6;">
            Bonjour ${guestName || ''},<br><br>
            ${hostName || 'Votre professionnel'} vous invite à une consultation vidéo sur JADOMI.
          </p>
          <p style="margin: 24px 0;">
            <a href="${url}" style="display: inline-block; background: #111; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 500;">
              Rejoindre la consultation
            </a>
          </p>
          <p style="color: #666; font-size: 14px; line-height: 1.5;">
            Aucun compte ni installation n'est nécessaire.<br>
            Lien direct : <a href="${url}" style="color: #111;">${url}</a>
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">JADOMI — Plateforme de santé connectée</p>
        </div>
      `,
      text: `Bonjour ${guestName || ''},\n\n${hostName || 'Votre professionnel'} vous invite à une consultation vidéo.\nRejoindre : ${url}\n\nAucun compte ni installation n'est nécessaire.\n\n— JADOMI`
    });
    return true;
  } catch (e) {
    console.error('[visio] Erreur envoi email invitation:', e.message);
    return false;
  }
}

// =============================================
// 1. POST /rooms — Creer une salle de visio
// =============================================
router.post('/rooms', ...requireAuth(), async (req, res) => {
  try {
    const {
      appointment_id = null,
      guest_name = null,
      guest_email = null,
      guest_phone = null,
      duration_minutes = 60,
      room_type = 'consultation',
      profession_type = null,
      send_invite = false
    } = req.body || {};

    const token = generateToken();
    const hostName = req.user.user_metadata?.full_name
      || req.user.user_metadata?.name
      || req.user.email;

    const session = {
      societe_id: req.societe.id,
      token,
      host_user_id: req.user.id,
      host_name: hostName,
      guest_name,
      guest_email,
      guest_phone,
      appointment_id,
      status: 'waiting',
      duration_minutes,
      room_type,
      profession_type: profession_type || req.societe.type || null,
      recording_consent_host: false,
      recording_consent_guest: false,
      audit_log: [{ action: 'room_created', timestamp: new Date().toISOString(), ip: req.ip }]
    };

    const { data, error } = await admin().from('visio_sessions').insert(session).select().single();
    if (error) throw error;

    // Envoyer l'invitation si demande
    let inviteSent = false;
    if (send_invite && guest_email) {
      inviteSent = await sendInviteEmail({ guestName: guest_name, guestEmail: guest_email, hostName, token });
      if (inviteSent) {
        const updated = appendAuditLog(data.audit_log, { action: 'invite_email_sent', to: guest_email, ip: req.ip });
        await admin().from('visio_sessions').update({ audit_log: updated }).eq('id', data.id);
      }
    }

    res.json({
      success: true,
      token,
      url: `${BASE_URL}/visio/${token}`,
      room: data,
      invite_sent: inviteSent
    });
  } catch (e) {
    console.error('[visio] POST /rooms error:', e.message);
    res.status(500).json({ success: false, error: 'Erreur lors de la création de la salle' });
  }
});

// =============================================
// 2. POST /rooms/:token/start — Le professionnel demarre la session
// =============================================
router.post('/rooms/:token/start', ...requireAuth(), async (req, res) => {
  try {
    const { token } = req.params;

    const { data: session, error: fetchErr } = await admin().from('visio_sessions')
      .select('*')
      .eq('token', token)
      .eq('societe_id', req.societe.id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!session) return res.status(404).json({ error: 'Salle introuvable' });
    if (session.host_user_id !== req.user.id) return res.status(403).json({ error: 'Seul le professionnel hôte peut démarrer la session' });
    if (session.status === 'ended' || session.status === 'expired') {
      return res.status(410).json({ error: 'Cette session est terminée' });
    }

    const auditLog = appendAuditLog(session.audit_log, { action: 'host_started', ip: req.ip });

    const { data, error } = await admin().from('visio_sessions')
      .update({ status: 'active', started_at: new Date().toISOString(), audit_log: auditLog })
      .eq('id', session.id)
      .select()
      .single();

    if (error) throw error;

    ensureSignalingRoom(token);

    res.json({ success: true, room: data });
  } catch (e) {
    console.error('[visio] POST /rooms/:token/start error:', e.message);
    res.status(500).json({ success: false, error: 'Erreur lors du démarrage' });
  }
});

// =============================================
// 3. POST /rooms/:token/end — Terminer la session
// =============================================
router.post('/rooms/:token/end', async (req, res) => {
  try {
    const { token } = req.params;

    const { data: session, error: fetchErr } = await admin().from('visio_sessions')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!session) return res.status(404).json({ error: 'Salle introuvable' });
    if (session.status === 'ended') return res.json({ success: true, message: 'Session déjà terminée' });

    const now = new Date();
    let actualDuration = null;
    if (session.started_at) {
      actualDuration = Math.round((now.getTime() - new Date(session.started_at).getTime()) / 1000);
    }

    const endedBy = req.body?.role || 'unknown';
    const auditLog = appendAuditLog(session.audit_log, { action: 'session_ended', ended_by: endedBy, ip: req.ip });

    const { data, error } = await admin().from('visio_sessions')
      .update({
        status: 'ended',
        ended_at: now.toISOString(),
        actual_duration_seconds: actualDuration,
        audit_log: auditLog
      })
      .eq('id', session.id)
      .select()
      .single();

    if (error) throw error;

    // Nettoyer la room in-memory
    signalingRooms.delete(token);

    res.json({ success: true, room: data });
  } catch (e) {
    console.error('[visio] POST /rooms/:token/end error:', e.message);
    res.status(500).json({ success: false, error: 'Erreur lors de la fermeture' });
  }
});

// =============================================
// 4. GET /rooms — Lister mes sessions de visio
// =============================================
router.get('/rooms', ...requireAuth(), async (req, res) => {
  try {
    const { status, from, to } = req.query;

    let query = admin().from('visio_sessions')
      .select('*')
      .eq('societe_id', req.societe.id)
      .eq('host_user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (status) query = query.eq('status', status);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ success: true, sessions: data || [] });
  } catch (e) {
    console.error('[visio] GET /rooms error:', e.message);
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération des sessions' });
  }
});

// =============================================
// 5. GET /rooms/:token/join — Le client rejoint la salle (PAS d'auth requise)
// =============================================
router.get('/rooms/:token/join', async (req, res) => {
  try {
    const { token } = req.params;
    const guestName = req.query.name || null;

    const { data: session, error: fetchErr } = await admin().from('visio_sessions')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!session) return res.status(404).json({ error: 'Salle introuvable ou lien invalide' });

    // Verifier l'expiration
    if (isRoomExpired(session) || session.status === 'expired') {
      return res.status(410).json({ error: 'Cette consultation a expiré. Veuillez contacter votre professionnel pour obtenir un nouveau lien.' });
    }

    if (session.status === 'ended') {
      return res.status(410).json({ error: 'Cette consultation est terminée.' });
    }

    // Mettre a jour le nom de l'invite si fourni
    const updates = {};
    if (guestName && !session.guest_name) {
      updates.guest_name = guestName;
    }

    const auditLog = appendAuditLog(session.audit_log, {
      action: 'guest_joined',
      name: guestName || session.guest_name || 'anonyme',
      ip: req.ip
    });
    updates.audit_log = auditLog;

    await admin().from('visio_sessions').update(updates).eq('id', session.id);

    ensureSignalingRoom(token);

    if (session.status === 'waiting') {
      return res.json({
        success: true,
        status: 'waiting',
        message: 'Le professionnel n\'a pas encore démarré la consultation. Veuillez patienter.',
        room: {
          token,
          host_name: session.host_name,
          room_type: session.room_type,
          duration_minutes: session.duration_minutes,
          guest_name: guestName || session.guest_name
        }
      });
    }

    // status === 'active'
    res.json({
      success: true,
      status: 'active',
      room: {
        token,
        host_name: session.host_name,
        room_type: session.room_type,
        duration_minutes: session.duration_minutes,
        started_at: session.started_at,
        guest_name: guestName || session.guest_name
      }
    });
  } catch (e) {
    console.error('[visio] GET /rooms/:token/join error:', e.message);
    res.status(500).json({ success: false, error: 'Erreur lors de la connexion à la salle' });
  }
});

// =============================================
// 6. POST /rooms/:token/consent — Enregistrer le consentement d'enregistrement
// =============================================
router.post('/rooms/:token/consent', async (req, res) => {
  try {
    const { token } = req.params;
    const { role, consented } = req.body || {};

    if (!role || !['host', 'guest'].includes(role)) {
      return res.status(400).json({ error: 'Le champ "role" doit être "host" ou "guest"' });
    }
    if (typeof consented !== 'boolean') {
      return res.status(400).json({ error: 'Le champ "consented" doit être un booléen' });
    }

    const { data: session, error: fetchErr } = await admin().from('visio_sessions')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!session) return res.status(404).json({ error: 'Salle introuvable' });

    const field = role === 'host' ? 'recording_consent_host' : 'recording_consent_guest';
    const auditLog = appendAuditLog(session.audit_log, {
      action: 'recording_consent',
      role,
      consented,
      ip: req.ip
    });

    const { error } = await admin().from('visio_sessions')
      .update({ [field]: consented, audit_log: auditLog })
      .eq('id', session.id);

    if (error) throw error;

    res.json({ success: true });
  } catch (e) {
    console.error('[visio] POST /rooms/:token/consent error:', e.message);
    res.status(500).json({ success: false, error: 'Erreur lors de l\'enregistrement du consentement' });
  }
});

// =============================================
// 7. POST /signal/:token — Envoyer un message de signaling
// =============================================
router.post('/signal/:token', (req, res) => {
  try {
    const room = ensureSignalingRoom(req.params.token);
    const { type, data, from } = req.body;
    room.messages.push({ type, data, from, timestamp: Date.now() });

    // Garder seulement les 100 derniers messages
    if (room.messages.length > 100) room.messages = room.messages.slice(-50);

    res.json({ success: true });
  } catch (e) {
    console.error('[visio] POST /signal/:token error:', e.message);
    res.status(500).json({ success: false, error: 'Erreur signaling' });
  }
});

// =============================================
// 8. GET /signal/:token — Recevoir les messages de signaling (polling)
// =============================================
router.get('/signal/:token', (req, res) => {
  try {
    const room = signalingRooms.get(req.params.token);
    if (!room) return res.json({ success: true, messages: [] });

    const since = parseInt(req.query.since || '0', 10);
    const from = req.query.from;
    const messages = room.messages.filter(m =>
      m.timestamp > since && (!from || m.from !== from)
    );

    res.json({ success: true, messages });
  } catch (e) {
    console.error('[visio] GET /signal/:token error:', e.message);
    res.status(500).json({ success: false, error: 'Erreur signaling' });
  }
});

// =============================================
// 9. POST /chat/:token — Envoyer un message de chat
// =============================================
router.post('/chat/:token', (req, res) => {
  try {
    const room = ensureSignalingRoom(req.params.token);
    const { from, message } = req.body;

    if (!from || !message) {
      return res.status(400).json({ error: 'Les champs "from" et "message" sont requis' });
    }

    room.chat.push({ from, message, timestamp: Date.now() });

    // Garder les 200 derniers messages de chat
    if (room.chat.length > 200) room.chat = room.chat.slice(-100);

    res.json({ success: true });
  } catch (e) {
    console.error('[visio] POST /chat/:token error:', e.message);
    res.status(500).json({ success: false, error: 'Erreur chat' });
  }
});

// =============================================
// 10. GET /chat/:token — Recevoir les messages de chat (polling)
// =============================================
router.get('/chat/:token', (req, res) => {
  try {
    const room = signalingRooms.get(req.params.token);
    if (!room) return res.json({ success: true, chat: [] });

    const since = parseInt(req.query.since || '0', 10);
    const chat = room.chat.filter(m => m.timestamp > since);

    res.json({ success: true, chat });
  } catch (e) {
    console.error('[visio] GET /chat/:token error:', e.message);
    res.status(500).json({ success: false, error: 'Erreur chat' });
  }
});

// =============================================
// 11. POST /rooms/:token/invite — Envoyer/renvoyer une invitation
// =============================================
router.post('/rooms/:token/invite', ...requireAuth(), async (req, res) => {
  try {
    const { token } = req.params;
    const { email, phone, method = 'email' } = req.body || {};

    const { data: session, error: fetchErr } = await admin().from('visio_sessions')
      .select('*')
      .eq('token', token)
      .eq('societe_id', req.societe.id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!session) return res.status(404).json({ error: 'Salle introuvable' });
    if (session.host_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Seul le professionnel hôte peut envoyer une invitation' });
    }

    const results = { email_sent: false, sms_sent: false };

    // Mettre a jour les coordonnees de l'invite si fournies
    const updates = {};
    if (email) updates.guest_email = email;
    if (phone) updates.guest_phone = phone;

    // Envoi email
    if ((method === 'email' || method === 'both') && (email || session.guest_email)) {
      const targetEmail = email || session.guest_email;
      results.email_sent = await sendInviteEmail({
        guestName: session.guest_name || '',
        guestEmail: targetEmail,
        hostName: session.host_name,
        token
      });
    }

    // SMS : placeholder pour integration future (Twilio, OVH SMS, etc.)
    if ((method === 'sms' || method === 'both') && (phone || session.guest_phone)) {
      // TODO: integrer un provider SMS (Twilio, OVH, etc.)
      console.log(`[visio] SMS invite a implementer pour ${phone || session.guest_phone}`);
      results.sms_sent = false;
    }

    const auditLog = appendAuditLog(session.audit_log, {
      action: 'invite_sent',
      method,
      email: email || session.guest_email || null,
      phone: phone || session.guest_phone || null,
      results,
      ip: req.ip
    });
    updates.audit_log = auditLog;

    await admin().from('visio_sessions').update(updates).eq('id', session.id);

    res.json({ success: true, ...results });
  } catch (e) {
    console.error('[visio] POST /rooms/:token/invite error:', e.message);
    res.status(500).json({ success: false, error: 'Erreur lors de l\'envoi de l\'invitation' });
  }
});

// =============================================
// 12. POST /rooms/:token/transcription-start — Activer la transcription (consentement)
// =============================================
router.post('/rooms/:token/transcription-start', async (req, res) => {
  try {
    const { token } = req.params;

    const { data: session, error: fetchErr } = await admin().from('visio_sessions')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!session) return res.status(404).json({ error: 'Salle introuvable' });

    const auditLog = appendAuditLog(session.audit_log, { action: 'transcription_started', ip: req.ip });

    await admin().from('visio_sessions')
      .update({ audit_log: auditLog })
      .eq('id', session.id);

    // Initialise le tableau transcript dans la room in-memory
    const room = ensureSignalingRoom(token);
    if (!room.transcript) room.transcript = [];

    res.json({ success: true });
  } catch (e) {
    console.error('[visio] POST /rooms/:token/transcription-start error:', e.message);
    res.status(500).json({ success: false, error: 'Erreur lors de l\'activation de la transcription' });
  }
});

// =============================================
// 13. POST /rooms/:token/transcription-chunk — Recevoir un fragment de transcription
// =============================================
router.post('/rooms/:token/transcription-chunk', (req, res) => {
  try {
    const { token } = req.params;
    const { text, speaker, timestamp } = req.body || {};

    if (!text || !speaker) {
      return res.status(400).json({ error: 'Les champs "text" et "speaker" sont requis' });
    }

    const room = ensureSignalingRoom(token);
    if (!room.transcript) room.transcript = [];

    room.transcript.push({ text, speaker, timestamp: timestamp || Date.now() });

    // Garder les 2000 derniers fragments max
    if (room.transcript.length > 2000) room.transcript = room.transcript.slice(-1500);

    res.json({ success: true });
  } catch (e) {
    console.error('[visio] POST /rooms/:token/transcription-chunk error:', e.message);
    res.status(500).json({ success: false, error: 'Erreur lors de l\'enregistrement du fragment' });
  }
});

// =============================================
// 14. POST /rooms/:token/generate-summary — Générer un compte-rendu IA (Mistral)
// =============================================
let mistralGenerate = null;
try {
  const iaRouter = require('../../lib/ia-router');
  mistralGenerate = iaRouter.mistralGenerate;
} catch (_) {
  console.warn('[visio] ia-router non disponible — génération de résumé désactivée');
}

router.post('/rooms/:token/generate-summary', ...requireAuth(), async (req, res) => {
  try {
    const { token } = req.params;

    // Vérifier que l'utilisateur est le host
    const { data: session, error: fetchErr } = await admin().from('visio_sessions')
      .select('*')
      .eq('token', token)
      .eq('societe_id', req.societe.id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!session) return res.status(404).json({ error: 'Salle introuvable' });
    if (session.host_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Seul le professionnel hôte peut générer le compte-rendu' });
    }

    // Récupérer la transcription depuis la room in-memory
    const room = signalingRooms.get(token);
    if (!room || !room.transcript || room.transcript.length === 0) {
      return res.status(400).json({ error: 'Aucune transcription disponible pour cette session' });
    }

    if (!mistralGenerate) {
      return res.status(503).json({ error: 'Service de génération IA indisponible' });
    }

    // Construire la transcription complète
    const fullTranscript = room.transcript.map(c => {
      const time = new Date(c.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const role = c.speaker === 'host' ? 'Professionnel' : 'Client';
      return `[${time}] ${role} : ${c.text}`;
    }).join('\n');

    // Calculer la durée
    let duration = '';
    if (session.started_at) {
      const durationSec = Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000);
      const dMin = Math.floor(durationSec / 60);
      const dSec = durationSec % 60;
      duration = dMin + ' min ' + dSec + ' sec';
    }

    const dateStr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

    const systemPrompt = `Tu es un assistant de cabinet professionnel. Génère un compte-rendu structuré de cette consultation. Format :
## Compte-rendu de consultation
**Date :** ${dateStr}
**Durée :** ${duration || 'Non renseignée'}
**Participants :** ${session.host_name || 'Professionnel'} et ${session.guest_name || 'Client'}

### Objet de la consultation
(1-2 phrases)

### Points discutés
(liste à puces)

### Décisions prises
(liste à puces, ou "Aucune décision formelle")

### Actions à mener
(qui fait quoi, quand)

### Prochaine étape
(1 phrase)

RÈGLES : vouvoiement, ton professionnel, JAMAIS inventer d'informations absentes de la transcription. Si un point n'est pas clair, l'indiquer.`;

    const userPrompt = `Transcription de la consultation :\n${fullTranscript}`;

    const summary = await mistralGenerate(systemPrompt, userPrompt, { maxTokens: 2000 });

    // Audit log
    const auditLog = appendAuditLog(session.audit_log, { action: 'summary_generated', transcript_length: room.transcript.length, ip: req.ip });
    await admin().from('visio_sessions').update({ audit_log: auditLog }).eq('id', session.id);

    res.json({
      success: true,
      summary: summary || '',
      transcript_length: room.transcript.length
    });
  } catch (e) {
    console.error('[visio] POST /rooms/:token/generate-summary error:', e.message);
    res.status(500).json({ success: false, error: 'Erreur lors de la génération du compte-rendu' });
  }
});

// =============================================
// 15. POST /rooms/:token/save-summary — Sauvegarder le compte-rendu dans cabinet_brain_documents
// =============================================
router.post('/rooms/:token/save-summary', ...requireAuth(), async (req, res) => {
  try {
    const { token } = req.params;
    const { summary, dossier_id, patient_id, client_id } = req.body || {};

    if (!summary) {
      return res.status(400).json({ error: 'Le champ "summary" est requis' });
    }

    // Vérifier la session
    const { data: session, error: fetchErr } = await admin().from('visio_sessions')
      .select('*')
      .eq('token', token)
      .eq('societe_id', req.societe.id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!session) return res.status(404).json({ error: 'Salle introuvable' });

    const dateStr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

    let duration = null;
    if (session.started_at) {
      duration = Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000);
    }

    const document = {
      societe_id: req.societe.id,
      title: 'Compte-rendu visio du ' + dateStr,
      doc_type: 'compte_rendu_visio',
      content_text: summary,
      metadata: {
        visio_token: token,
        duration_seconds: duration,
        participants: { host: session.host_name, guest: session.guest_name },
        generated_at: new Date().toISOString()
      },
      created_by: req.user.id
    };

    // Liens optionnels
    if (patient_id) document.patient_id = patient_id;
    if (client_id) document.client_id = client_id;
    if (dossier_id) document.metadata.dossier_id = dossier_id;

    const { data, error } = await admin().from('cabinet_brain_documents').insert(document).select('id').single();
    if (error) throw error;

    // Audit log
    const auditLog = appendAuditLog(session.audit_log, { action: 'summary_saved', document_id: data.id, ip: req.ip });
    await admin().from('visio_sessions').update({ audit_log: auditLog }).eq('id', session.id);

    res.json({ success: true, document_id: data.id });
  } catch (e) {
    console.error('[visio] POST /rooms/:token/save-summary error:', e.message);
    res.status(500).json({ success: false, error: 'Erreur lors de la sauvegarde du compte-rendu' });
  }
});

module.exports = router;
