// JADOMI — Juridique : Avis clients
const { admin, requireSociete } = require('../multiSocietes/middleware');

async function getProfilId(societeId) {
  const { data } = await admin().from('juridique_profil')
    .select('id').eq('societe_id', societeId).maybeSingle();
  return data?.id;
}

async function updateNoteMoyenne(profilId) {
  const { data } = await admin().from('juridique_avis')
    .select('note').eq('profil_id', profilId).eq('visible', true);
  const avis = data || [];
  const moyenne = avis.length ? avis.reduce((s, a) => s + a.note, 0) / avis.length : 0;
  await admin().from('juridique_profil').update({
    note_moyenne: Math.round(moyenne * 10) / 10,
    nb_avis: avis.length
  }).eq('id', profilId);
}

module.exports = function (router) {
  router.get('/avis', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.json({ success: true, avis: [] });
      const { data } = await admin().from('juridique_avis')
        .select('*').eq('profil_id', profilId).order('created_at', { ascending: false });
      res.json({ success: true, avis: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Répondre à un avis
  router.patch('/avis/:id/reponse', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const { data, error } = await admin().from('juridique_avis')
        .update({ reponse_pro: req.body.reponse_pro })
        .eq('id', req.params.id).eq('profil_id', profilId)
        .select('*').single();
      if (error) throw error;
      res.json({ success: true, avis: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // Toggle visibilité
  router.patch('/avis/:id/visible', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const { data, error } = await admin().from('juridique_avis')
        .update({ visible: req.body.visible })
        .eq('id', req.params.id).eq('profil_id', profilId)
        .select('*').single();
      if (error) throw error;
      await updateNoteMoyenne(profilId);
      res.json({ success: true, avis: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
};
