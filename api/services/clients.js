// =============================================
// JADOMI — Services : Clients (CRM + fidélité)
// =============================================
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');

module.exports = function (router) {
  // LIST clients
  router.get('/clients', requireSociete(), async (req, res) => {
    try {
      const { search, segment, page = 1, limit = 50 } = req.query;
      let query = admin()
        .from('services_clients')
        .select('*', { count: 'exact' })
        .eq('societe_id', req.societe.id)
        .order('nom', { ascending: true })
        .range((page - 1) * limit, page * limit - 1);
      if (search) query = query.or(`nom.ilike.%${search}%,email.ilike.%${search}%,telephone.ilike.%${search}%`);
      if (segment) query = query.contains('segments', [segment]);
      const { data, error, count } = await query;
      if (error) throw error;
      res.json({ clients: data || [], total: count });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET single
  router.get('/clients/:id', requireSociete(), async (req, res) => {
    try {
      const { data, error } = await admin()
        .from('services_clients')
        .select('*')
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id)
        .single();
      if (error) throw error;

      // Get history
      const { data: rdvs } = await admin()
        .from('services_reservations')
        .select('*, prestation:prestation_id(nom, prix)')
        .eq('client_id', req.params.id)
        .eq('societe_id', req.societe.id)
        .order('date_heure', { ascending: false })
        .limit(50);

      res.json({ client: data, historique: rdvs || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // CREATE
  router.post('/clients', requireSociete(), async (req, res) => {
    try {
      const { nom, prenom, email, telephone, date_naissance, adresse, ville,
              notes, allergies, segments, points_fidelite } = req.body;
      const { data, error } = await admin()
        .from('services_clients')
        .insert({
          societe_id: req.societe.id,
          nom, prenom, email, telephone,
          date_naissance: date_naissance || null,
          adresse: adresse || null,
          ville: ville || null,
          notes: notes || null,
          allergies: allergies || null,
          segments: segments || [],
          points_fidelite: points_fidelite || 0,
          nb_visites: 0,
          derniere_visite: null
        })
        .select()
        .single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id, action: 'client_create', entity: 'services_clients', entityId: data.id, req });
      res.json({ client: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // UPDATE
  router.patch('/clients/:id', requireSociete(), async (req, res) => {
    try {
      const updates = {};
      ['nom', 'prenom', 'email', 'telephone', 'date_naissance', 'adresse', 'ville',
       'notes', 'allergies', 'segments', 'points_fidelite']
        .forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
      updates.updated_at = new Date().toISOString();
      const { data, error } = await admin()
        .from('services_clients')
        .update(updates)
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id)
        .select()
        .single();
      if (error) throw error;
      res.json({ client: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE
  router.delete('/clients/:id', requireSociete(), async (req, res) => {
    try {
      const { error } = await admin()
        .from('services_clients')
        .delete()
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Segments mailing ──
  router.get('/clients/segments/list', requireSociete(), async (req, res) => {
    try {
      const { data, error } = await admin()
        .from('services_clients')
        .select('segments')
        .eq('societe_id', req.societe.id);
      if (error) throw error;
      const all = new Set();
      (data || []).forEach(c => (c.segments || []).forEach(s => all.add(s)));
      res.json({ segments: [...all].sort() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST add loyalty points
  router.post('/clients/:id/points', requireSociete(), async (req, res) => {
    try {
      const { points, motif } = req.body;
      const { data: client } = await admin()
        .from('services_clients')
        .select('points_fidelite')
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id)
        .single();
      if (!client) return res.status(404).json({ error: 'Client introuvable' });
      const newPoints = (client.points_fidelite || 0) + (points || 0);
      const { data, error } = await admin()
        .from('services_clients')
        .update({ points_fidelite: Math.max(0, newPoints), updated_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id)
        .select()
        .single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id, action: 'client_points', entity: 'services_clients', entityId: req.params.id, meta: { points, motif }, req });
      res.json({ client: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
};
