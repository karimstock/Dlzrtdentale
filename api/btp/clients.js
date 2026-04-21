// JADOMI — BTP : Clients
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');

async function getProfilId(societeId) {
  const { data } = await admin().from('btp_profil').select('id').eq('societe_id', societeId).maybeSingle();
  return data?.id;
}

module.exports = function (router) {
  // GET liste clients avec recherche
  router.get('/clients', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      let q = admin().from('btp_clients').select('*').eq('profil_id', profilId).order('nom');
      if (req.query.search) {
        const s = `%${req.query.search}%`;
        q = q.or(`nom.ilike.${s},prenom.ilike.${s},email.ilike.${s},telephone.ilike.${s},ville.ilike.${s}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      res.json({ success: true, clients: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // POST creer client
  router.post('/clients', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const { data, error } = await admin().from('btp_clients')
        .insert({ ...req.body, profil_id: profilId })
        .select('*').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'create', entity: 'btp_clients', entityId: data.id, req });
      res.json({ success: true, client: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // PATCH modifier client
  router.patch('/clients/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const { data, error } = await admin().from('btp_clients')
        .update({ ...req.body, updated_at: new Date().toISOString() })
        .eq('id', req.params.id).eq('profil_id', profilId)
        .select('*').single();
      if (error) throw error;
      res.json({ success: true, client: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // GET detail client avec historique chantiers
  router.get('/clients/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const { data: client, error } = await admin().from('btp_clients')
        .select('*').eq('id', req.params.id).eq('profil_id', profilId).single();
      if (error) throw error;

      const { data: chantiers } = await admin().from('btp_chantiers')
        .select('id, reference, titre, statut, date_debut, date_fin, montant_total_ttc')
        .eq('client_id', req.params.id).eq('profil_id', profilId)
        .order('date_debut', { ascending: false });

      res.json({ success: true, client, chantiers: chantiers || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
};
