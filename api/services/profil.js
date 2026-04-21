// =============================================
// JADOMI — Services : Profil prestataire
// =============================================
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');

function slugify(nom, ville) {
  const str = `${nom || ''}-${ville || ''}`.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return str || 'prestataire';
}

module.exports = function (router) {
  // GET profil
  router.get('/profil', requireSociete(), async (req, res) => {
    try {
      const { data, error } = await admin()
        .from('services_profils')
        .select('*')
        .eq('societe_id', req.societe.id)
        .maybeSingle();
      if (error) throw error;
      res.json({ profil: data });
    } catch (e) {
      console.error('[services/profil] GET:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST create profil
  router.post('/profil', requireSociete(), async (req, res) => {
    try {
      const { nom, description, adresse, ville, code_postal, telephone, email,
              logo_url, photo_url, categorie, sous_categorie, site_web,
              acompte_pct, horaires, reseaux_sociaux } = req.body;
      const slug = slugify(nom, ville);
      const { data, error } = await admin()
        .from('services_profils')
        .insert({
          societe_id: req.societe.id,
          user_id: req.user.id,
          nom, slug, description, adresse, ville, code_postal, telephone, email,
          logo_url, photo_url, categorie, sous_categorie, site_web,
          acompte_pct: acompte_pct || 30,
          horaires: horaires || null,
          reseaux_sociaux: reseaux_sociaux || null,
          actif: true
        })
        .select()
        .single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id, action: 'services_profil_create', entity: 'services_profils', entityId: data.id, req });
      res.json({ profil: data });
    } catch (e) {
      console.error('[services/profil] POST:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH update profil
  router.patch('/profil', requireSociete(), async (req, res) => {
    try {
      const updates = {};
      const fields = ['nom', 'description', 'adresse', 'ville', 'code_postal', 'telephone',
        'email', 'logo_url', 'photo_url', 'categorie', 'sous_categorie', 'site_web',
        'acompte_pct', 'horaires', 'reseaux_sociaux', 'actif'];
      fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
      if (updates.nom || updates.ville) {
        const current = await admin().from('services_profils').select('nom, ville').eq('societe_id', req.societe.id).maybeSingle();
        updates.slug = slugify(updates.nom || current?.data?.nom, updates.ville || current?.data?.ville);
      }
      updates.updated_at = new Date().toISOString();
      const { data, error } = await admin()
        .from('services_profils')
        .update(updates)
        .eq('societe_id', req.societe.id)
        .select()
        .single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id, action: 'services_profil_update', entity: 'services_profils', entityId: data.id, req });
      res.json({ profil: data });
    } catch (e) {
      console.error('[services/profil] PATCH:', e.message);
      res.status(500).json({ error: e.message });
    }
  });
};
