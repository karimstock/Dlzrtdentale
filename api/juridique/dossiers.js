// JADOMI — Juridique : Gestion des dossiers clients
const { admin, requireSociete } = require('../multiSocietes/middleware');

async function getProfilId(societeId) {
  const { data } = await admin().from('juridique_profil')
    .select('id').eq('societe_id', societeId).maybeSingle();
  return data?.id;
}

module.exports = function (router) {
  router.get('/dossiers', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.json({ success: true, dossiers: [] });
      let query = admin().from('juridique_dossiers')
        .select('*').eq('profil_id', profilId).order('created_at', { ascending: false });
      if (req.query.statut) query = query.eq('statut', req.query.statut);
      if (req.query.search) query = query.or(`client_nom.ilike.%${req.query.search}%,titre_dossier.ilike.%${req.query.search}%`);
      const { data } = await query;
      res.json({ success: true, dossiers: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  router.get('/dossiers/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const { data: dossier } = await admin().from('juridique_dossiers')
        .select('*').eq('id', req.params.id).eq('profil_id', profilId).single();
      if (!dossier) return res.status(404).json({ error: 'not_found' });

      // Récupérer les réservations liées au même client email
      const { data: reservations } = dossier.client_email
        ? await admin().from('juridique_reservations')
            .select('*, offre:offre_id(titre, type)')
            .eq('profil_id', profilId).eq('client_email', dossier.client_email)
            .order('date_rdv', { ascending: false })
        : { data: [] };

      res.json({ success: true, dossier, reservations: reservations || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  router.post('/dossiers', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(400).json({ error: 'Profil requis' });
      const { data, error } = await admin().from('juridique_dossiers')
        .insert({ ...req.body, profil_id: profilId }).select('*').single();
      if (error) throw error;
      res.json({ success: true, dossier: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  router.patch('/dossiers/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const { data, error } = await admin().from('juridique_dossiers')
        .update({ ...req.body, updated_at: new Date().toISOString() })
        .eq('id', req.params.id).eq('profil_id', profilId)
        .select('*').single();
      if (error) throw error;
      res.json({ success: true, dossier: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
};
