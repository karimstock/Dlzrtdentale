// JADOMI — BTP : Profil artisan
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');

function slugify(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function getProfilId(societeId) {
  const { data } = await admin().from('btp_profil').select('id').eq('societe_id', societeId).maybeSingle();
  return data?.id;
}

module.exports = function (router) {
  // GET profil de la societe active
  router.get('/profil', requireSociete(), async (req, res) => {
    try {
      const { data } = await admin().from('btp_profil')
        .select('*').eq('societe_id', req.societe.id).maybeSingle();
      res.json({ success: true, profil: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // POST creer profil
  router.post('/profil', requireSociete(), async (req, res) => {
    try {
      const { nom_entreprise, ville } = req.body;
      if (!nom_entreprise) return res.status(400).json({ error: 'nom_entreprise requis' });

      // Generer slug unique
      let baseSlug = slugify(`${nom_entreprise} ${ville || ''}`.trim());
      let slug = baseSlug;
      let attempt = 0;
      while (true) {
        const { data: existing } = await admin().from('btp_profil')
          .select('id').eq('slug', slug).maybeSingle();
        if (!existing) break;
        attempt++;
        slug = `${baseSlug}-${attempt}`;
      }

      const { data, error } = await admin().from('btp_profil')
        .insert({ ...req.body, societe_id: req.societe.id, slug })
        .select('*').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'create', entity: 'btp_profil', entityId: data.id, req });
      res.json({ success: true, profil: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // PATCH modifier profil
  router.patch('/profil/:id', requireSociete(), async (req, res) => {
    try {
      const updates = { ...req.body, updated_at: new Date().toISOString() };
      if (updates.slug) {
        const { data: existing } = await admin().from('btp_profil')
          .select('id').eq('slug', updates.slug).neq('id', req.params.id).maybeSingle();
        if (existing) return res.status(400).json({ error: 'Ce slug est deja utilise' });
      }
      const { data, error } = await admin().from('btp_profil')
        .update(updates).eq('id', req.params.id).eq('societe_id', req.societe.id)
        .select('*').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'update', entity: 'btp_profil', entityId: data.id, req });
      res.json({ success: true, profil: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
};
