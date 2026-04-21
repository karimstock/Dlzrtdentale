// =============================================
// JADOMI RUSH — Routes transport
// Estimation cout + delai transport
// =============================================

const express = require('express');
const { estimerTransport, POIDS_PAR_TYPE } = require('../../services/transport-calculator');

function createTransportRouter(supabase) {
  const router = express.Router();

  // POST /api/rush/transport/estimer — Estimer transport
  router.post('/estimer', async (req, res) => {
    try {
      const { cp_depart, cp_arrivee, type_travail, quantite } = req.body;
      if (!cp_depart || !cp_arrivee) {
        return res.status(400).json({ error: 'cp_depart et cp_arrivee requis' });
      }

      const estimation = estimerTransport({
        cpDepart: cp_depart,
        cpArrivee: cp_arrivee,
        typeTravail: type_travail,
        quantite: parseInt(quantite) || 1
      });

      res.json({ success: true, estimation });
    } catch (e) {
      console.error('[RUSH transport estimer]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/rush/transport/expedition — Marquer comme expedie
  router.post('/expedition', async (req, res) => {
    try {
      const { demande_id, numero_suivi, transporteur } = req.body;
      if (!demande_id || !numero_suivi) {
        return res.status(400).json({ error: 'demande_id et numero_suivi requis' });
      }

      await supabase.from('rush_demandes').update({
        statut: 'expedie',
        statut_detail: 'expedie',
        numero_suivi,
        date_expedition: new Date().toISOString()
      }).eq('id', demande_id);

      res.json({ success: true, message: 'Expedition enregistree', numero_suivi });
    } catch (e) {
      console.error('[RUSH expedition]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/rush/transport/reception — Marquer comme recu
  router.post('/reception', async (req, res) => {
    try {
      const { demande_id } = req.body;
      if (!demande_id) return res.status(400).json({ error: 'demande_id requis' });

      await supabase.from('rush_demandes').update({
        statut: 'en_verification',
        statut_detail: 'en_verification',
        date_livraison: new Date().toISOString()
      }).eq('id', demande_id);

      res.json({
        success: true,
        message: 'Reception confirmee — vous avez 48h pour valider ou signaler un probleme'
      });
    } catch (e) {
      console.error('[RUSH reception]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/rush/transport/types — Liste types de travaux + poids estimes
  router.get('/types', (req, res) => {
    res.json({ success: true, types: POIDS_PAR_TYPE });
  });

  return router;
}

module.exports = { createTransportRouter };
