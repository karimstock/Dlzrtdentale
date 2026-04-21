// =============================================
// JADOMI — Services : Agenda (Disponibilités + Praticiens)
// =============================================
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');

module.exports = function (router) {
  // ── Disponibilités ──

  // LIST disponibilités
  router.get('/disponibilites', requireSociete(), async (req, res) => {
    try {
      const { data, error } = await admin()
        .from('services_disponibilites')
        .select('*')
        .eq('societe_id', req.societe.id)
        .order('jour_semaine', { ascending: true });
      if (error) throw error;
      res.json({ disponibilites: data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // CREATE disponibilité
  router.post('/disponibilites', requireSociete(), async (req, res) => {
    try {
      const { jour_semaine, heure_debut, heure_fin, praticien_id, pause_debut, pause_fin } = req.body;
      const { data, error } = await admin()
        .from('services_disponibilites')
        .insert({
          societe_id: req.societe.id,
          jour_semaine, heure_debut, heure_fin,
          praticien_id: praticien_id || null,
          pause_debut: pause_debut || null,
          pause_fin: pause_fin || null,
          actif: true
        })
        .select()
        .single();
      if (error) throw error;
      res.json({ disponibilite: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // UPDATE disponibilité
  router.patch('/disponibilites/:id', requireSociete(), async (req, res) => {
    try {
      const updates = {};
      ['jour_semaine', 'heure_debut', 'heure_fin', 'praticien_id', 'pause_debut', 'pause_fin', 'actif']
        .forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
      const { data, error } = await admin()
        .from('services_disponibilites')
        .update(updates)
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id)
        .select()
        .single();
      if (error) throw error;
      res.json({ disponibilite: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE disponibilité
  router.delete('/disponibilites/:id', requireSociete(), async (req, res) => {
    try {
      const { error } = await admin()
        .from('services_disponibilites')
        .delete()
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Praticiens ──

  // LIST praticiens
  router.get('/praticiens', requireSociete(), async (req, res) => {
    try {
      const { data, error } = await admin()
        .from('services_praticiens')
        .select('*')
        .eq('societe_id', req.societe.id)
        .order('nom', { ascending: true });
      if (error) throw error;
      res.json({ praticiens: data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // CREATE praticien
  router.post('/praticiens', requireSociete(), async (req, res) => {
    try {
      const { nom, prenom, specialite, couleur, email, telephone, photo_url } = req.body;
      const { data, error } = await admin()
        .from('services_praticiens')
        .insert({
          societe_id: req.societe.id,
          nom, prenom, specialite,
          couleur: couleur || '#6366f1',
          email: email || null,
          telephone: telephone || null,
          photo_url: photo_url || null,
          actif: true
        })
        .select()
        .single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id, action: 'praticien_create', entity: 'services_praticiens', entityId: data.id, req });
      res.json({ praticien: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // UPDATE praticien
  router.patch('/praticiens/:id', requireSociete(), async (req, res) => {
    try {
      const updates = {};
      ['nom', 'prenom', 'specialite', 'couleur', 'email', 'telephone', 'photo_url', 'actif']
        .forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
      const { data, error } = await admin()
        .from('services_praticiens')
        .update(updates)
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id)
        .select()
        .single();
      if (error) throw error;
      res.json({ praticien: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE praticien
  router.delete('/praticiens/:id', requireSociete(), async (req, res) => {
    try {
      const { error } = await admin()
        .from('services_praticiens')
        .delete()
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Agenda : RDV du jour/semaine ──
  router.get('/agenda', requireSociete(), async (req, res) => {
    try {
      const { date, debut, fin, praticien_id } = req.query;
      let query = admin()
        .from('services_reservations')
        .select('*, prestation:prestation_id(nom, duree, couleur, prix), praticien:praticien_id(nom, prenom, couleur)')
        .eq('societe_id', req.societe.id)
        .order('date_heure', { ascending: true });

      if (date) {
        query = query.gte('date_heure', `${date}T00:00:00`).lte('date_heure', `${date}T23:59:59`);
      } else if (debut && fin) {
        query = query.gte('date_heure', `${debut}T00:00:00`).lte('date_heure', `${fin}T23:59:59`);
      }
      if (praticien_id) query = query.eq('praticien_id', praticien_id);

      const { data, error } = await query;
      if (error) throw error;
      res.json({ reservations: data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
};
