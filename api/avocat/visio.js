// =============================================
// JADOMI AVOCAT — Visioconference via Jitsi Meet
// Salles de visio avocat-client, invitations, embed
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

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
  } catch { return res.status(401).json({ error: 'Authentification echouee' }); }
}

// === HELPERS ===

/**
 * Verifie que la table avocat_visio_rooms existe.
 * Si non, log un avertissement (la migration SQL sera faite separement).
 */
async function ensureTable() {
  try {
    await admin().from('avocat_visio_rooms').select('id').limit(1);
  } catch {
    console.warn('[visio] Table avocat_visio_rooms non trouvee — creation necessaire via SQL');
  }
}

// Lancer la verification au chargement du module
ensureTable();

/**
 * Genere l'URL Jitsi Meet avec les options de configuration.
 */
function buildJitsiUrl(roomId, displayName) {
  const base = `https://meet.jit.si/${roomId}`;
  const configParams = [
    'config.startWithAudioMuted=true',
    'config.startWithVideoMuted=false',
    'config.prejoinPageEnabled=true',
    'config.disableDeepLinking=true',
    'interfaceConfig.SHOW_JITSI_WATERMARK=false',
    'interfaceConfig.SHOW_BRAND_WATERMARK=false'
  ];
  if (displayName) {
    configParams.push(`userInfo.displayName=${encodeURIComponent(displayName)}`);
  }
  return `${base}#${configParams.join('&')}`;
}

// ================================================
// POST /rooms — Creer une nouvelle salle de visio
// ================================================
router.post('/rooms', requireAvocat, async (req, res) => {
  try {
    const { titre, dossier_id, client_email } = req.body;
    const societeId = req.societeId;
    const roomId = `jadomi-${societeId.substring(0, 8)}-${Date.now()}`;
    const roomUrl = buildJitsiUrl(roomId, 'Avocat');
    const clientUrl = buildJitsiUrl(roomId, 'Client');

    const insertData = {
      societe_id: societeId,
      room_id: roomId,
      room_url: roomUrl,
      titre: titre || 'Consultation visio',
      statut: 'active',
      created_by: req.userId,
      created_at: new Date().toISOString()
    };
    if (dossier_id) insertData.dossier_id = dossier_id;
    if (client_email) insertData.client_email = client_email;

    const { data, error } = await admin()
      .from('avocat_visio_rooms')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[visio] Erreur creation salle:', error.message);
      return res.status(500).json({ error: 'Impossible de creer la salle de visio' });
    }

    // Lien propre jadomi.fr/visio/ROOM_ID (pas le lien Jitsi brut)
    const shortUrl = `https://jadomi.fr/visio/${roomId}`;
    const shortClientUrl = `https://jadomi.fr/visio/${roomId}?role=client`;

    res.json({
      room_id: roomId,
      room_url: shortUrl,
      client_url: shortClientUrl,
      jitsi_url: roomUrl,
      titre: data.titre
    });
  } catch (err) {
    console.error('[visio] POST /rooms erreur:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ================================================
// GET /rooms — Lister les salles du cabinet
// ================================================
router.get('/rooms', requireAvocat, async (req, res) => {
  try {
    const { data, error } = await admin()
      .from('avocat_visio_rooms')
      .select('*')
      .eq('societe_id', req.societeId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[visio] Erreur liste salles:', error.message);
      return res.status(500).json({ error: 'Impossible de recuperer les salles' });
    }

    res.json({ rooms: data || [] });
  } catch (err) {
    console.error('[visio] GET /rooms erreur:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ================================================
// GET /rooms/:roomId — Detail d'une salle
// ================================================
router.get('/rooms/:roomId', requireAvocat, async (req, res) => {
  try {
    const { data, error } = await admin()
      .from('avocat_visio_rooms')
      .select('*')
      .eq('societe_id', req.societeId)
      .eq('room_id', req.params.roomId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Salle non trouvee' });
    }

    // Ajouter le lien client pour faciliter le partage
    data.client_url = buildJitsiUrl(data.room_id, 'Client');

    res.json(data);
  } catch (err) {
    console.error('[visio] GET /rooms/:roomId erreur:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ================================================
// PATCH /rooms/:roomId/end — Terminer une salle
// ================================================
router.patch('/rooms/:roomId/end', requireAvocat, async (req, res) => {
  try {
    const { data, error } = await admin()
      .from('avocat_visio_rooms')
      .update({
        statut: 'terminee',
        ended_at: new Date().toISOString()
      })
      .eq('societe_id', req.societeId)
      .eq('room_id', req.params.roomId)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Salle non trouvee ou deja terminee' });
    }

    res.json({ message: 'La salle de visio a ete terminee avec succes.', room: data });
  } catch (err) {
    console.error('[visio] PATCH /rooms/:roomId/end erreur:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ================================================
// POST /rooms/:roomId/invite — Inviter un client
// ================================================
router.post('/rooms/:roomId/invite', requireAvocat, async (req, res) => {
  try {
    const { email, nom_client } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'L\'adresse email est requise pour envoyer une invitation.' });
    }

    // Verifier que la salle existe et appartient au cabinet
    const { data: room, error: roomError } = await admin()
      .from('avocat_visio_rooms')
      .select('*')
      .eq('societe_id', req.societeId)
      .eq('room_id', req.params.roomId)
      .single();

    if (roomError || !room) {
      return res.status(404).json({ error: 'Salle non trouvee' });
    }

    if (room.statut === 'terminee') {
      return res.status(400).json({ error: 'Cette salle de visio est deja terminee.' });
    }

    const displayName = nom_client || 'Client';
    const clientUrl = buildJitsiUrl(room.room_id, displayName);

    // Mettre a jour l'email client dans la salle
    await admin()
      .from('avocat_visio_rooms')
      .update({ client_email: email })
      .eq('id', room.id);

    // Tenter l'envoi d'email via emailService si disponible
    let emailSent = false;
    try {
      const emailService = require('../emailService');
      if (emailService && typeof emailService.sendEmail === 'function') {
        await emailService.sendEmail({
          to: email,
          subject: `Invitation a une consultation visio — ${room.titre}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #1a1a1a; margin-bottom: 16px;">Consultation visio</h2>
              <p style="color: #4a4a4a; line-height: 1.6;">
                Bonjour${nom_client ? ' ' + nom_client : ''},
              </p>
              <p style="color: #4a4a4a; line-height: 1.6;">
                Vous etes invite(e) a rejoindre une consultation en visioconference.
              </p>
              <p style="color: #4a4a4a; line-height: 1.6;">
                <strong>Objet :</strong> ${room.titre}
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${clientUrl}" style="display: inline-block; padding: 14px 32px; background-color: #1a1a1a; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 500;">
                  Rejoindre la visio
                </a>
              </div>
              <p style="color: #8a8a8a; font-size: 13px; line-height: 1.5;">
                Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
                <a href="${clientUrl}" style="color: #1a1a1a;">${clientUrl}</a>
              </p>
              <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;">
              <p style="color: #8a8a8a; font-size: 12px;">
                JADOMI — Plateforme de gestion pour cabinets d'avocats
              </p>
            </div>
          `
        });
        emailSent = true;
      }
    } catch (emailErr) {
      console.warn('[visio] Envoi email echoue:', emailErr.message);
    }

    res.json({
      client_url: clientUrl,
      email_sent: emailSent
    });
  } catch (err) {
    console.error('[visio] POST /rooms/:roomId/invite erreur:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ================================================
// GET /embed/:roomId — HTML iframe pour integration
// ================================================
router.get('/embed/:roomId', async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const displayName = req.query.name || '';
    const jitsiUrl = buildJitsiUrl(roomId, displayName);

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Visioconference — JADOMI</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #0a0a0a; }
    iframe { width: 100%; height: 100%; border: 0; }
  </style>
</head>
<body>
  <iframe
    src="${jitsiUrl}"
    allow="camera;microphone;display-capture;autoplay;clipboard-write"
    allowfullscreen
  ></iframe>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('[visio] GET /embed/:roomId erreur:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
