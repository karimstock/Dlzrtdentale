// =============================================
// JADOMI — Entrepots fournisseurs
// =============================================
const rateLimit = require('express-rate-limit');

module.exports = function mountWarehouses(app, admin, auth) {

  // GET /api/logistics/warehouses — lister entrepots d'un fournisseur
  app.get('/api/logistics/warehouses', auth, async (req, res) => {
    try {
      const supplierId = req.query.supplier_id;
      if (!supplierId) return res.status(400).json({ error: 'supplier_id requis' });

      const { data, error } = await admin()
        .from('supplier_warehouses')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('is_primary', { ascending: false });

      if (error) throw error;
      res.json({ warehouses: data || [] });
    } catch (e) {
      console.error('[Logistics GET /warehouses]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/logistics/warehouses — creer un entrepot (auth)
  app.post('/api/logistics/warehouses', auth, async (req, res) => {
    try {
      const { supplier_id, name, address, city, postal_code, region, lat, lng, is_primary } = req.body;
      if (!supplier_id || !name || !address) {
        return res.status(400).json({ error: 'supplier_id, name, address requis' });
      }

      // Si is_primary, demarquer les autres
      if (is_primary) {
        await admin()
          .from('supplier_warehouses')
          .update({ is_primary: false })
          .eq('supplier_id', supplier_id);
      }

      const { data, error } = await admin()
        .from('supplier_warehouses')
        .insert({ supplier_id, name, address, city, postal_code, region, lat, lng, is_primary: is_primary || false })
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, warehouse: data });
    } catch (e) {
      console.error('[Logistics POST /warehouses]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/logistics/warehouses/:id — modifier
  app.patch('/api/logistics/warehouses/:id', auth, async (req, res) => {
    try {
      const allowed = ['name', 'address', 'city', 'postal_code', 'region', 'lat', 'lng', 'is_primary'];
      const updates = {};
      for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
      updates.updated_at = new Date().toISOString();

      const { data, error } = await admin()
        .from('supplier_warehouses')
        .update(updates)
        .eq('id', req.params.id)
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, warehouse: data });
    } catch (e) {
      console.error('[Logistics PATCH /warehouses/:id]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/logistics/warehouses/public/:token — fournisseur ajoute entrepot via token (SANS AUTH)
  const publicLimiter = rateLimit({ windowMs: 60000, max: 10, message: { error: 'Trop de requetes' } });

  app.post('/api/logistics/warehouses/public/:token', publicLimiter, async (req, res) => {
    try {
      // Verifier le token dans gpo_request_attempts
      const { data: attempt } = await admin()
        .from('gpo_request_attempts')
        .select('supplier_id')
        .eq('response_token', req.params.token)
        .single();

      if (!attempt) return res.status(404).json({ error: 'Token invalide' });

      const { name, address, postal_code, city, lat, lng } = req.body;
      if (!address) return res.status(400).json({ error: 'address requis' });

      // Demarquer les autres
      await admin()
        .from('supplier_warehouses')
        .update({ is_primary: false })
        .eq('supplier_id', attempt.supplier_id);

      const { data, error } = await admin()
        .from('supplier_warehouses')
        .insert({
          supplier_id: attempt.supplier_id,
          name: name || 'Entrepot principal',
          address,
          postal_code,
          city,
          lat,
          lng,
          is_primary: true
        })
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, warehouse: data });
    } catch (e) {
      console.error('[Logistics POST /warehouses/public]', e.message);
      res.status(500).json({ error: e.message });
    }
  });
};
