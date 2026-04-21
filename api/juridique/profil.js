// JADOMI — Juridique : Profil professionnel
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');

function slugify(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

module.exports = function (router) {
  // GET profil de la société active
  router.get('/profil', requireSociete(), async (req, res) => {
    try {
      const { data } = await admin().from('juridique_profil')
        .select('*').eq('societe_id', req.societe.id).maybeSingle();
      res.json({ success: true, profil: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // POST créer profil
  router.post('/profil', requireSociete(), async (req, res) => {
    try {
      const { nom, prenom, type_professionnel, ville } = req.body;
      if (!nom || !type_professionnel) return res.status(400).json({ error: 'nom et type_professionnel requis' });

      // Générer slug unique
      let baseSlug = slugify(`${req.body.titre || ''} ${prenom || ''} ${nom} ${ville || ''}`.trim());
      let slug = baseSlug;
      let attempt = 0;
      while (true) {
        const { data: existing } = await admin().from('juridique_profil')
          .select('id').eq('slug', slug).maybeSingle();
        if (!existing) break;
        attempt++;
        slug = `${baseSlug}-${attempt}`;
      }

      const { data, error } = await admin().from('juridique_profil')
        .insert({ ...req.body, societe_id: req.societe.id, slug })
        .select('*').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'create', entity: 'juridique_profil', entityId: data.id, req });
      res.json({ success: true, profil: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // PATCH modifier profil
  router.patch('/profil/:id', requireSociete(), async (req, res) => {
    try {
      const updates = { ...req.body, updated_at: new Date().toISOString() };
      // Si changement de slug, vérifier unicité
      if (updates.slug) {
        const { data: existing } = await admin().from('juridique_profil')
          .select('id').eq('slug', updates.slug).neq('id', req.params.id).maybeSingle();
        if (existing) return res.status(400).json({ error: 'Ce slug est déjà utilisé' });
      }
      const { data, error } = await admin().from('juridique_profil')
        .update(updates).eq('id', req.params.id).eq('societe_id', req.societe.id)
        .select('*').single();
      if (error) throw error;
      res.json({ success: true, profil: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
};
