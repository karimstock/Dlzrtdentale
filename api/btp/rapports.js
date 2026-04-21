// JADOMI — BTP : Rapports d'intervention
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');

async function getProfilId(societeId) {
  const { data } = await admin().from('btp_profil').select('id').eq('societe_id', societeId).maybeSingle();
  return data?.id;
}

module.exports = function (router) {
  // GET liste rapports
  router.get('/rapports', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      let q = admin().from('btp_rapports')
        .select('*, chantier:chantier_id(id, reference, titre)')
        .eq('profil_id', profilId)
        .order('date_intervention', { ascending: false });

      if (req.query.chantier_id) q = q.eq('chantier_id', req.query.chantier_id);
      const { data, error } = await q;
      if (error) throw error;
      res.json({ success: true, rapports: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // POST creer rapport
  router.post('/rapports', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const { data: rapport, error } = await admin().from('btp_rapports')
        .insert({ ...req.body, profil_id: profilId })
        .select('*').single();
      if (error) throw error;

      // Si materiaux utilises, creer des mouvements de stock (sortie)
      if (req.body.materiaux_utilises && Array.isArray(req.body.materiaux_utilises)) {
        for (const mat of req.body.materiaux_utilises) {
          // Creer mouvement de sortie
          await admin().from('btp_stock_mouvements').insert({
            profil_id: profilId,
            stock_id: mat.stock_id,
            chantier_id: req.body.chantier_id,
            rapport_id: rapport.id,
            type: 'sortie',
            quantite: mat.quantite,
            cout_unitaire: mat.cout_unitaire || 0,
            cout_total: (mat.quantite || 0) * (mat.cout_unitaire || 0),
            commentaire: `Rapport intervention ${rapport.id}`
          });

          // Mettre a jour la quantite en stock
          const { data: stock } = await admin().from('btp_stock')
            .select('quantite').eq('id', mat.stock_id).single();
          if (stock) {
            await admin().from('btp_stock')
              .update({ quantite: (stock.quantite || 0) - (mat.quantite || 0), updated_at: new Date().toISOString() })
              .eq('id', mat.stock_id);
          }
        }
      }

      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'create', entity: 'btp_rapports', entityId: rapport.id, req });
      res.json({ success: true, rapport });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // GET detail rapport
  router.get('/rapports/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const { data, error } = await admin().from('btp_rapports')
        .select('*, chantier:chantier_id(*)')
        .eq('id', req.params.id).eq('profil_id', profilId).single();
      if (error) throw error;
      res.json({ success: true, rapport: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // PATCH modifier rapport
  router.patch('/rapports/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const { data, error } = await admin().from('btp_rapports')
        .update({ ...req.body, updated_at: new Date().toISOString() })
        .eq('id', req.params.id).eq('profil_id', profilId)
        .select('*').single();
      if (error) throw error;
      res.json({ success: true, rapport: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
};
