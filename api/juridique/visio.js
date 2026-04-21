// JADOMI — Juridique : WebRTC signaling pour visio
const { admin } = require('../multiSocietes/middleware');

// In-memory signaling store (suffisant pour peer-to-peer)
const signalingRooms = new Map();

// Nettoyage auto des rooms expirées (toutes les 30 min)
setInterval(() => {
  const now = Date.now();
  for (const [token, room] of signalingRooms) {
    if (now - room.created > 3600000 * 3) signalingRooms.delete(token);
  }
}, 1800000);

module.exports = function (router) {
  // Valider un token visio et récupérer les infos de la salle
  router.get('/visio/room/:token', async (req, res) => {
    try {
      const { data: rdv } = await admin().from('juridique_reservations')
        .select('*, offre:offre_id(titre, type, duree_minutes)')
        .eq('visio_token', req.params.token)
        .in('statut', ['confirme', 'en_cours'])
        .maybeSingle();

      if (!rdv) return res.status(404).json({ error: 'Salle introuvable ou expirée' });

      // Vérifier fenêtre temporelle (+30 min après l'heure prévue)
      if (rdv.date_rdv && rdv.heure_rdv) {
        const rdvTime = new Date(`${rdv.date_rdv}T${rdv.heure_rdv}`);
        const expiry = new Date(rdvTime.getTime() + (rdv.duree_minutes + 30) * 60000);
        if (Date.now() > expiry.getTime()) {
          return res.status(410).json({ error: 'Cette consultation visio a expiré' });
        }
      }

      // Initialiser la room si nécessaire
      if (!signalingRooms.has(req.params.token)) {
        signalingRooms.set(req.params.token, {
          created: Date.now(),
          messages: [],
          chat: []
        });
      }

      res.json({
        success: true,
        room: {
          token: req.params.token,
          client_nom: `${rdv.client_prenom || ''} ${rdv.client_nom}`.trim(),
          duree_minutes: rdv.duree_minutes || rdv.offre?.duree_minutes || 60,
          date_rdv: rdv.date_rdv,
          heure_rdv: rdv.heure_rdv,
          titre: rdv.offre?.titre || 'Consultation'
        }
      });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Envoyer un message de signaling
  router.post('/visio/signal/:token', async (req, res) => {
    try {
      const room = signalingRooms.get(req.params.token);
      if (!room) return res.status(404).json({ error: 'Room introuvable' });

      const { type, data, from } = req.body;
      room.messages.push({ type, data, from, timestamp: Date.now() });

      // Garder seulement les 100 derniers messages
      if (room.messages.length > 100) room.messages = room.messages.slice(-50);

      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Récupérer les messages de signaling (polling)
  router.get('/visio/signal/:token', async (req, res) => {
    try {
      const room = signalingRooms.get(req.params.token);
      if (!room) return res.status(404).json({ error: 'Room introuvable' });

      const since = parseInt(req.query.since || '0');
      const from = req.query.from; // identité du demandeur pour filtrer
      const messages = room.messages.filter(m =>
        m.timestamp > since && (!from || m.from !== from)
      );

      res.json({ success: true, messages });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Chat textuel pendant la visio
  router.post('/visio/chat/:token', async (req, res) => {
    try {
      const room = signalingRooms.get(req.params.token);
      if (!room) return res.status(404).json({ error: 'Room introuvable' });

      room.chat.push({
        from: req.body.from,
        message: req.body.message,
        timestamp: Date.now()
      });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  router.get('/visio/chat/:token', async (req, res) => {
    try {
      const room = signalingRooms.get(req.params.token);
      if (!room) return res.json({ success: true, chat: [] });

      const since = parseInt(req.query.since || '0');
      const chat = room.chat.filter(m => m.timestamp > since);
      res.json({ success: true, chat });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
};
