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
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  router.post('/offres', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(400).json({ error: 'Créez d\'abord votre profil professionnel' });
      const { data, error } = await admin().from('juridique_offres')
        .insert({ ...req.body, profil_id: profilId }).select('*').single();
      if (error) throw error;
      res.json({ success: true, offre: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  router.patch('/offres/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const { data, error } = await admin().from('juridique_offres')
        .update(req.body).eq('id', req.params.id).eq('profil_id', profilId)
        .select('*').single();
      if (error) throw error;
      res.json({ success: true, offre: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  router.delete('/offres/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      await admin().from('juridique_offres')
        .update({ actif: false }).eq('id', req.params.id).eq('profil_id', profilId);
      res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
};
