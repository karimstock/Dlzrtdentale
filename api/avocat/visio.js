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
    const clientUrl = `https://jadomi.fr/visio/${room.room_id}?role=client`;
    const dateRdv = req.body.date_rdv || '';
    const heureRdv = req.body.heure_rdv || '';
    const nomAvocat = req.body.nom_avocat || 'votre avocat';

    // Mettre a jour l'email client dans la salle
    await admin()
      .from('avocat_visio_rooms')
      .update({ client_email: email })
      .eq('id', room.id);

    // Envoi d'email via emailService (noreply@jadomi.fr)
    let emailSent = false;
    try {
      const emailService = require('../emailService');
      if (emailService && typeof emailService.sendMail === 'function') {
        // Tracker d'ouverture — pixel invisible unique
        const trackId = require('crypto').randomUUID();
        const trackPixel = `<img src="https://jadomi.fr/api/avocat/visio/track/${trackId}" width="1" height="1" style="display:none" alt="">`;

        // Sauvegarder le tracker dans la room
        try {
          await admin().from('avocat_visio_rooms')
            .update({ client_email: email, metadata: { track_id: trackId, invited_at: new Date().toISOString(), opened: false, opened_at: null } })
            .eq('room_id', req.params.roomId);
        } catch (e) { console.warn('[visio] Track save error:', e.message); }

        const dateInfo = dateRdv ? `<p style="color:#1a1a1a;font-size:15px;font-weight:600;margin:16px 0;">Date : ${dateRdv}${heureRdv ? ' \u00e0 ' + heureRdv : ''}</p>` : '';

        await emailService.sendMail({
          to: email,
          subject: `Consultation vid\u00e9o avec ${nomAvocat} \u2014 JADOMI`,
          html: `
            <div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
              <div style="background:linear-gradient(135deg,#0A1628,#132040);padding:28px 32px;text-align:center;">
                <div style="font-size:22px;font-weight:700;color:#C9A961;letter-spacing:-0.5px;">JADOMI</div>
                <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:4px;">Consultation vidéo sécurisée</div>
              </div>
              <div style="padding:32px;">
                <p style="color:#1a1a1a;font-size:15px;line-height:1.7;margin-bottom:16px;">
                  Bonjour${nom_client ? ' ' + nom_client : ''},
                </p>
                <p style="color:#4a4a4a;font-size:14px;line-height:1.7;margin-bottom:8px;">
                  Maître ${nomAvocat} vous invite à une consultation en visioconférence sur la plateforme JADOMI.
                </p>
                ${dateInfo}
                <p style="color:#4a4a4a;font-size:14px;line-height:1.7;margin-bottom:4px;">
                  <strong>Objet :</strong> ${room.titre}
                </p>
                <div style="text-align:center;margin:32px 0;">
                  <a href="${clientUrl}" style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#0A1628,#132040);color:#C9A961;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;letter-spacing:0.2px;">
                    Rejoindre la consultation
                  </a>
                </div>
                <div style="background:#f8f7f4;border-radius:8px;padding:16px;margin:24px 0;">
                  <p style="color:#1a1a1a;font-size:13px;font-weight:600;margin-bottom:8px;">Comment ça marche :</p>
                  <p style="color:#6b7280;font-size:12px;line-height:1.6;margin:0;">
                    1. Cliquez sur le bouton ci-dessus à l'heure du rendez-vous<br>
                    2. Autorisez l'accès à votre caméra et microphone<br>
                    3. Votre avocat vous rejoindra dans la salle de consultation<br>
                    4. Vous pourrez échanger des documents pendant l'appel
                  </p>
                </div>
                <p style="color:#9ca3af;font-size:11px;line-height:1.5;margin-top:24px;">
                  Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
                  <a href="${clientUrl}" style="color:#0A1628;word-break:break-all;">${clientUrl}</a>
                </p>
                <p style="color:#9ca3af;font-size:11px;line-height:1.5;margin-top:8px;">
                  La consultation est chiffrée de bout en bout. Aucun enregistrement n'est effectué sans votre consentement.
                </p>
              </div>
              <div style="background:#f9fafb;padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb;">
                <p style="color:#9ca3af;font-size:11px;margin:0;">JADOMI \u2014 Plateforme s\u00e9curis\u00e9e pour cabinets d'avocats</p>
              </div>
              ${trackPixel}
            </div>
          `
        });
        emailSent = true;
      }
    } catch (emailErr) {
      console.warn('[visio] Envoi email échoué:', emailErr.message);
    }

    res.json({
      client_url: clientUrl,
      email_sent: emailSent,
      message: emailSent ? 'Invitation envoyée à ' + email : 'Lien généré (email non envoyé)'
    });
  } catch (err) {
    console.error('[visio] POST /rooms/:roomId/invite erreur:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ================================================
// GET /track/:trackId — Pixel tracker d'ouverture email (PUBLIC, pas d'auth)
// ================================================
router.get('/track/:trackId', async (req, res) => {
  try {
    // Marquer comme ouvert dans la room
    const { data: rooms } = await admin().from('avocat_visio_rooms')
      .select('id, metadata')
      .filter('metadata->>track_id', 'eq', req.params.trackId);

    if (rooms && rooms.length > 0) {
      const room = rooms[0];
      const meta = room.metadata || {};
      if (!meta.opened) {
        meta.opened = true;
        meta.opened_at = new Date().toISOString();
        meta.opened_ip = req.ip;
        await admin().from('avocat_visio_rooms')
          .update({ metadata: meta })
          .eq('id', room.id);
        console.log('[visio] Email ouvert — track:', req.params.trackId);
      }
    }
  } catch (e) {
    console.warn('[visio] Track error:', e.message);
  }

  // Retourner un pixel transparent 1x1
  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.set({ 'Content-Type': 'image/gif', 'Content-Length': pixel.length, 'Cache-Control': 'no-store, no-cache' });
  res.end(pixel);
});

// ================================================
// GET /statut-invitation/:roomId — L'avocat vérifie si le client a ouvert l'email
// ================================================
router.get('/statut-invitation/:roomId', requireAvocat, async (req, res) => {
  try {
    const { data: room } = await admin().from('avocat_visio_rooms')
      .select('room_id, client_email, metadata, statut, created_at')
      .eq('societe_id', req.societeId)
      .eq('room_id', req.params.roomId)
      .single();

    if (!room) return res.status(404).json({ error: 'Salle non trouv\u00e9e' });

    const meta = room.metadata || {};
    res.json({
      room_id: room.room_id,
      client_email: room.client_email,
      invitation_envoyee: !!meta.invited_at,
      invitation_date: meta.invited_at || null,
      email_ouvert: !!meta.opened,
      ouvert_le: meta.opened_at || null,
      statut_salle: room.statut
    });
  } catch (err) {
    console.error('[visio] statut-invitation error:', err.message);
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
