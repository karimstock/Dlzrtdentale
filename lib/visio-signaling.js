// =============================================
// JADOMI — Serveur de signaling WebRTC
// Visioconférence P2P native, 100% JADOMI, zéro tiers
// RGPD : seul le signaling (JSON) passe par le serveur
// Les flux vidéo/audio sont peer-to-peer direct
//
// Passe 94-98 — 23 mai 2026
// =============================================
const WebSocket = require('ws');

// Rooms actives : Map<roomId, Set<{ws, role, name}>>
const rooms = new Map();

/**
 * Attache le serveur de signaling WebSocket au serveur HTTP existant
 * @param {http.Server} server — le serveur HTTP Express
 */
function attachSignaling(server) {
  const wss = new WebSocket.Server({ noServer: true });

  // Upgrade HTTP → WebSocket sur /ws/visio
  server.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
      if (url.pathname === '/ws/visio') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      }
      // Ne pas détruire le socket pour les autres paths (autres WebSockets du projet)
    } catch (e) {
      console.error('[visio-signaling] Upgrade error:', e.message);
    }
  });

  wss.on('connection', (ws) => {
    let currentRoom = null;
    let peerInfo = { role: 'unknown', name: 'Participant' };

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString());

        switch (msg.type) {
          case 'join': {
            currentRoom = msg.room;
            peerInfo.role = msg.role || 'participant';
            peerInfo.name = msg.name || 'Participant';

            if (!rooms.has(currentRoom)) rooms.set(currentRoom, new Set());
            const room = rooms.get(currentRoom);

            if (room.size >= 2) {
              ws.send(JSON.stringify({ type: 'error', message: 'Cette salle est pleine (2 participants maximum).' }));
              return;
            }

            room.add({ ws, ...peerInfo });

            // Notifier l'autre participant
            for (const peer of room) {
              if (peer.ws !== ws && peer.ws.readyState === WebSocket.OPEN) {
                peer.ws.send(JSON.stringify({ type: 'peer-joined', name: peerInfo.name, role: peerInfo.role }));
              }
            }

            ws.send(JSON.stringify({
              type: 'joined',
              room: currentRoom,
              peers: room.size - 1,
              message: room.size === 1 ? 'En attente de l\'autre participant...' : 'Connexion en cours...'
            }));

            console.log(`[visio] ${peerInfo.name} (${peerInfo.role}) a rejoint ${currentRoom} (${room.size}/2)`);
            break;
          }

          case 'offer':
          case 'answer':
          case 'ice-candidate': {
            // Relayer au pair dans la même room
            const room = rooms.get(currentRoom);
            if (room) {
              for (const peer of room) {
                if (peer.ws !== ws && peer.ws.readyState === WebSocket.OPEN) {
                  peer.ws.send(JSON.stringify(msg));
                }
              }
            }
            break;
          }

          case 'chat': {
            // Relayer un message chat
            const room = rooms.get(currentRoom);
            if (room) {
              for (const peer of room) {
                if (peer.ws !== ws && peer.ws.readyState === WebSocket.OPEN) {
                  peer.ws.send(JSON.stringify({
                    type: 'chat',
                    from: peerInfo.name,
                    text: (msg.text || '').substring(0, 2000),
                    timestamp: Date.now()
                  }));
                }
              }
            }
            break;
          }

          case 'file-signal': {
            // Signaler un transfert de fichier (metadata)
            const room = rooms.get(currentRoom);
            if (room) {
              for (const peer of room) {
                if (peer.ws !== ws && peer.ws.readyState === WebSocket.OPEN) {
                  peer.ws.send(JSON.stringify({
                    type: 'file-signal',
                    fileName: msg.fileName,
                    fileSize: msg.fileSize,
                    fileType: msg.fileType,
                    from: peerInfo.name
                  }));
                }
              }
            }
            break;
          }

          case 'screen-share-started':
          case 'screen-share-stopped': {
            const room = rooms.get(currentRoom);
            if (room) {
              for (const peer of room) {
                if (peer.ws !== ws && peer.ws.readyState === WebSocket.OPEN) {
                  peer.ws.send(JSON.stringify({ type: msg.type, from: peerInfo.name }));
                }
              }
            }
            break;
          }

          case 'recording-request':
          case 'recording-consent':
          case 'recording-started':
          case 'recording-stopped': {
            const room = rooms.get(currentRoom);
            if (room) {
              for (const peer of room) {
                if (peer.ws !== ws && peer.ws.readyState === WebSocket.OPEN) {
                  peer.ws.send(JSON.stringify({ ...msg, from: peerInfo.name }));
                }
              }
            }
            break;
          }
        }
      } catch (e) {
        // Ignorer les messages malformés
      }
    });

    ws.on('close', () => {
      if (currentRoom && rooms.has(currentRoom)) {
        const room = rooms.get(currentRoom);
        // Supprimer ce peer
        for (const peer of room) {
          if (peer.ws === ws) { room.delete(peer); break; }
        }
        // Notifier l'autre
        for (const peer of room) {
          if (peer.ws.readyState === WebSocket.OPEN) {
            peer.ws.send(JSON.stringify({ type: 'peer-left', name: peerInfo.name }));
          }
        }
        if (room.size === 0) rooms.delete(currentRoom);
        console.log(`[visio] ${peerInfo.name} a quitté ${currentRoom}`);
      }
    });

    ws.on('error', () => {}); // Ignorer les erreurs WS silencieusement
  });

  // Heartbeat toutes les 30s pour détecter les connexions mortes
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(heartbeat));

  console.log('[JADOMI] Signaling WebRTC monté sur /ws/visio (P2P natif, zéro tiers)');
  return wss;
}

/**
 * Retourne les stats des rooms actives
 */
function getStats() {
  const stats = { rooms_actives: rooms.size, participants: 0, rooms: [] };
  for (const [id, peers] of rooms) {
    stats.participants += peers.size;
    stats.rooms.push({ id, participants: peers.size });
  }
  return stats;
}

module.exports = { attachSignaling, getStats };
