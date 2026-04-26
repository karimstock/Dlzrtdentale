// JADOMI — BTP : Ouvriers
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');

async function getProfilId(societeId) {
  const { data } = await admin().from('btp_profil').select('id').eq('societe_id', societeId).maybeSingle();
  return data?.id;
}

module.exports = function (router) {
  // GET liste ouvriers
  router.get('/ouvriers', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      let q = admin().from('btp_ouvriers').select('*').eq('profil_id', profilId).order('nom');
      if (req.query.actif !== undefined) q = q.eq('actif', req.query.actif === 'true');
      const { data, error } = await q;
      if (error) throw error;
      res.json({ success: true, ouvriers: data });
    } catch (e) { res.status(500).json({ success: false, error: 'Erreur interne' }); }
  });

  // POST creer ouvrier
  router.post('/ouvriers', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const _ao = ['nom', 'prenom', 'telephone', 'email', 'poste', 'taux_horaire', 'statut'];
      const _so = {}; for (const k of _ao) { if (req.body[k] !== undefined) _so[k] = req.body[k]; }
      const { data, error } = await admin().from('btp_ouvriers')
        .insert({ ..._so, profil_id: profilId })
        .select('*').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'create', entity: 'btp_ouvriers', entityId: data.id, req });
      res.json({ success: true, ouvrier: data });
    } catch (e) { res.status(400).json({ success: false, error: 'Erreur validation' }); }
  });

  // PATCH modifier ouvrier
  router.patch('/ouvriers/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const _ao2 = ['nom', 'prenom', 'telephone', 'email', 'poste', 'taux_horaire', 'statut'];
      const _uo = { updated_at: new Date().toISOString() }; for (const k of _ao2) { if (req.body[k] !== undefined) _uo[k] = req.body[k]; }
      const { data, error } = await admin().from('btp_ouvriers')
        .update(_uo)
        .eq('id', req.params.id).eq('profil_id', profilId)
        .select('*').single();
      if (error) throw error;
      res.json({ success: true, ouvrier: data });
    } catch (e) { res.status(400).json({ success: false, error: 'Erreur validation' }); }
  });

  // DELETE soft delete ouvrier (actif=false)
  router.delete('/ouvriers/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const { data, error } = await admin().from('btp_ouvriers')
        .update({ actif: false, updated_at: new Date().toISOString() })
        .eq('id', req.params.id).eq('profil_id', profilId)
        .select('*').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'soft_delete', entity: 'btp_ouvriers', entityId: data.id, req });
      res.json({ success: true, ouvrier: data });
    } catch (e) { res.status(400).json({ success: false, error: 'Erreur validation' }); }
  });
};
