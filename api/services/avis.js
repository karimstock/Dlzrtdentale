// =============================================
// JADOMI — Services : Avis clients
// =============================================
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');

module.exports = function (router) {
  // LIST avis
  router.get('/avis', requireSociete(), async (req, res) => {
    try {
      const { statut, note_min } = req.query;
      let query = admin()
        .from('services_avis')
        .select('*, prestation:prestation_id(nom)')
        .eq('societe_id', req.societe.id)
        .order('created_at', { ascending: false });
      if (statut) query = query.eq('statut', statut);
      if (note_min) query = query.gte('note', parseInt(note_min));
      const { data, error } = await query;
      if (error) throw error;
      res.json({ avis: data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH avis (répondre, modérer)
  router.patch('/avis/:id', requireSociete(), async (req, res) => {
    try {
      const updates = {};
      ['reponse', 'statut'].forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
      if (updates.reponse) updates.reponse_date = new Date().toISOString();
      updates.updated_at = new Date().toISOString();
      const { data, error } = await admin()
        .from('services_avis')
        .update(updates)
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id)
        .select()
        .single();
      if (error) throw error;

      // Recalculate note moyenne
      await updateNoteMoyenne(req.societe.id);

      await auditLog({ userId: req.user.id, societeId: req.societe.id, action: 'avis_update', entity: 'services_avis', entityId: req.params.id, req });
      res.json({ avis: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE avis
  router.delete('/avis/:id', requireSociete(), async (req, res) => {
    try {
      const { error } = await admin()
        .from('services_avis')
        .delete()
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id);
      if (error) throw error;
      await updateNoteMoyenne(req.societe.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
};

async function updateNoteMoyenne(societeId) {
  try {
    const { data } = await admin()
      .from('services_avis')
      .select('note')
      .eq('societe_id', societeId)
      .eq('statut', 'publie');
    if (!data?.length) return;
    const moy = data.reduce((s, a) => s + a.note, 0) / data.length;
    await admin()
      .from('services_profils')
      .update({ note_moyenne: Math.round(moy * 10) / 10, nb_avis: data.length })
      .eq('societe_id', societeId);
  } catch (e) {
    console.warn('[services/avis] updateNoteMoyenne:', e.message);
  }
}
