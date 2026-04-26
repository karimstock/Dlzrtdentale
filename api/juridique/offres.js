// JADOMI — Juridique : Offres de consultation
const { admin, requireSociete } = require('../multiSocietes/middleware');

async function getProfilId(societeId) {
  const { data } = await admin().from('juridique_profil')
    .select('id').eq('societe_id', societeId).maybeSingle();
  return data?.id;
}

module.exports = function (router) {
  router.get('/offres', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.json({ success: true, offres: [] });
      const { data } = await admin().from('juridique_offres')
        .select('*').eq('profil_id', profilId).order('ordre');
      res.json({ success: true, offres: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: 'Erreur interne' }); }
  });

  router.post('/offres', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(400).json({ error: 'Créez d\'abord votre profil professionnel' });
      const _aof = ['titre', 'description', 'type', 'duree_minutes', 'prix', 'mode_consultation', 'visio_disponible', 'actif'];
      const _sof = {}; for (const k of _aof) { if (req.body[k] !== undefined) _sof[k] = req.body[k]; }
      const { data, error } = await admin().from('juridique_offres')
        .insert({ ..._sof, profil_id: profilId }).select('*').single();
      if (error) throw error;
      res.json({ success: true, offre: data });
    } catch (e) { res.status(400).json({ success: false, error: 'Erreur validation' }); }
  });

  router.patch('/offres/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const { data, error } = await admin().from('juridique_offres')
        .update((() => { const _aof2 = ['titre', 'description', 'type', 'duree_minutes', 'prix', 'mode_consultation', 'visio_disponible', 'actif']; const o = { updated_at: new Date().toISOString() }; for (const k of _aof2) { if (req.body[k] !== undefined) o[k] = req.body[k]; } return o; })()).eq('id', req.params.id).eq('profil_id', profilId)
        .select('*').single();
      if (error) throw error;
      res.json({ success: true, offre: data });
    } catch (e) { res.status(400).json({ success: false, error: 'Erreur validation' }); }
  });

  router.delete('/offres/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      await admin().from('juridique_offres')
        .update({ actif: false }).eq('id', req.params.id).eq('profil_id', profilId);
      res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, error: 'Erreur validation' }); }
  });
};
