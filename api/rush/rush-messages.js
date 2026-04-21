// =============================================
// JADOMI RUSH — Messagerie securisee anonyme
// Filtrage IA avant chaque envoi
// =============================================

const express = require('express');
const { filtrerMessage, doitBloquer, genererAlias } = require('../../services/anonymat-filter');

function createMessagesRouter(supabase) {
  const router = express.Router();

  // POST /api/rush/messages — Envoyer un message filtre
  router.post('/', async (req, res) => {
    try {
      const { demande_id, expediteur_id, expediteur_type, contenu } = req.body;
      if (!demande_id || !expediteur_id || !contenu) {
        return res.status(400).json({ error: 'demande_id, expediteur_id, contenu requis' });
      }

      // Filtrer le message
      const filtrage = await filtrerMessage(contenu);

      // Verifier si le message doit etre bloque
      if (doitBloquer(filtrage.detections)) {
        return res.status(403).json({
          error: 'Message bloque',
          raison: 'JADOMI IA protege votre anonymat — le message contient des informations personnelles (telephone, email). Retirez ces informations et reessayez.',
          detections: filtrage.detections.map(d => d.type)
        });
      }

      const alias = genererAlias(expediteur_id);

      const { data, error } = await supabase.from('rush_messages').insert({
        demande_id: parseInt(demande_id),
        expediteur_id: parseInt(expediteur_id),
        expediteur_type: expediteur_type || 'prothesiste_principal',
        alias_expediteur: alias,
        contenu_original: contenu,
        contenu_filtre: filtrage.contenu_filtre,
        filtre_applique: filtrage.filtre_applique,
        infos_masquees: filtrage.infos_masquees,
        tentative_identification: filtrage.tentative_identification
      }).select().single();

      if (error) throw error;

      // Ne pas renvoyer le contenu original — uniquement le filtre
      res.json({
        success: true,
        message: {
          id: data.id,
          alias_expediteur: alias,
          contenu: data.contenu_filtre,
          filtre_applique: data.filtre_applique,
          infos_masquees: data.infos_masquees,
          created_at: data.created_at
        },
        avertissement: filtrage.infos_masquees
          ? 'JADOMI IA a masque certaines informations pour proteger votre anonymat.'
          : null
      });
    } catch (e) {
      console.error('[RUSH messages POST]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/rush/messages/:demande_id — Liste messages d'une demande
  router.get('/:demande_id', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('rush_messages')
        .select('id, alias_expediteur, expediteur_type, contenu_filtre, filtre_applique, infos_masquees, pieces_jointes, created_at, lu')
        .eq('demande_id', parseInt(req.params.demande_id))
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Renommer contenu_filtre en contenu pour le client
      const messages = (data || []).map(m => ({
        ...m,
        contenu: m.contenu_filtre,
        contenu_filtre: undefined
      }));

      res.json({ success: true, messages });
    } catch (e) {
      console.error('[RUSH messages GET]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/rush/messages/:id/lu — Marquer comme lu
  router.patch('/:id/lu', async (req, res) => {
    try {
      await supabase.from('rush_messages')
        .update({ lu: true })
        .eq('id', req.params.id);

      res.json({ success: true });
    } catch (e) {
      console.error('[RUSH messages lu]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

module.exports = { createMessagesRouter };
