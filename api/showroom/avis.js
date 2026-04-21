// JADOMI — Showroom Créateurs : Avis clients
const { admin, requireSociete } = require('../multiSocietes/middleware');

async function getProfilId(societeId) {
  const { data } = await admin().from('showroom_profil')
    .select('id').eq('societe_id', societeId).maybeSingle();
  return data?.id;
}

async function updateNoteMoyenne(profilId) {
  const { data } = await admin().from('showroom_avis')
    .select('note').eq('profil_id', profilId).eq('visible', true);
  const avis = data || [];
  const moyenne = avis.length ? avis.reduce((s, a) => s + a.note, 0) / avis.length : 0;
  await admin().from('showroom_profil').update({
    note_moyenne: Math.round(moyenne * 10) / 10,
    nb_avis: avis.length
  }).eq('id', profilId);
}

module.exports = function (router) {
  // GET tous les avis du créateur
  router.get('/avis', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.json({ success: true, avis: [] });
      const { data } = await admin().from('showroom_avis')
        .select('*').eq('profil_id', profilId).order('created_at', { ascending: false });
      res.json({ success: true, avis: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Répondre à un avis
  router.patch('/avis/:id/reponse', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const { data, error } = await admin().from('showroom_avis')
        .update({ reponse_createur: req.body.reponse_createur })
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
      const { data, error } = await admin().from('showroom_avis')
        .update({ visible: req.body.visible })
        .eq('id', req.params.id).eq('profil_id', profilId)
        .select('*').single();
      if (error) throw error;
      await updateNoteMoyenne(profilId);
      res.json({ success: true, avis: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // GET stats avis
  router.get('/avis-stats', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.json({ success: true, stats: { moyenne: 0, total: 0, distribution: {} } });

      const { data } = await admin().from('showroom_avis')
        .select('note').eq('profil_id', profilId).eq('visible', true);
      const avis = data || [];
      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const a of avis) distribution[a.note] = (distribution[a.note] || 0) + 1;
      const moyenne = avis.length ? avis.reduce((s, a) => s + a.note, 0) / avis.length : 0;

      res.json({
        success: true,
        stats: {
          moyenne: Math.round(moyenne * 10) / 10,
          total: avis.length,
          distribution
        }
      });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
};
