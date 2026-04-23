// =============================================
// JADOMI — GPO Target Prices (tarifs cibles)
// =============================================

module.exports = function mountTargetPrices(app, admin, auth) {

  // POST /api/gpo/target-prices/compute — recalcule tous les tarifs cibles
  app.post('/api/gpo/target-prices/compute', auth, async (req, res) => {
    try {
      const { data: prices, error } = await admin()
        .from('market_prices')
        .select('*');

      if (error) throw error;
      if (!prices || prices.length === 0) {
        return res.json({ success: true, computed: 0, message: 'Aucun prix marche en base' });
      }

      // Regrouper par product_name_normalized
      const groups = {};
      for (const p of prices) {
        const key = p.product_name_normalized;
        if (!groups[key]) {
          groups[key] = {
            product_name_normalized: key,
            product_name_display: p.product_name,
            category: p.category,
            prices: [],
            min: Infinity
          };
        }
        const unitPrice = p.unit_price_eur || p.price_eur;
        groups[key].prices.push(unitPrice);
        if (unitPrice < groups[key].min) groups[key].min = unitPrice;
      }

      let computed = 0;
      for (const [key, group] of Object.entries(groups)) {
        const avg = group.prices.reduce((s, v) => s + v, 0) / group.prices.length;
        const targetPrice = Math.round(avg * 0.85 * 100) / 100;

        // Verifier si override manuel existe
        const { data: existing } = await admin()
          .from('target_prices')
          .select('id, manual_override')
          .eq('product_name_normalized', key)
          .maybeSingle();

        if (existing && existing.manual_override) continue; // Ne pas ecraser les overrides

        await admin()
          .from('target_prices')
          .upsert({
            product_name_normalized: key,
            product_name_display: group.product_name_display,
            category: group.category,
            avg_market_price_eur: Math.round(avg * 100) / 100,
            min_observed_price_eur: group.min === Infinity ? null : Math.round(group.min * 100) / 100,
            target_price_eur: targetPrice,
            sample_size: group.prices.length,
            last_computed_at: new Date().toISOString()
          }, { onConflict: 'product_name_normalized' });

        computed++;
      }

      res.json({ success: true, computed, total_products: Object.keys(groups).length });
    } catch (e) {
      console.error('[GPO POST /target-prices/compute]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/gpo/target-prices — liste des tarifs cibles
  app.get('/api/gpo/target-prices', auth, async (req, res) => {
    try {
      let query = admin()
        .from('target_prices')
        .select('*')
        .order('product_name_display', { ascending: true });

      if (req.query.category) query = query.eq('category', req.query.category);
      if (req.query.search) {
        query = query.ilike('product_name_display', `%${req.query.search}%`);
      }

      const limit = Math.min(parseInt(req.query.limit) || 50, 200);
      query = query.limit(limit);

      const { data, error } = await query;
      if (error) throw error;

      res.json({ target_prices: data || [] });
    } catch (e) {
      console.error('[GPO GET /target-prices]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/gpo/target-prices/:id — override manuel
  app.patch('/api/gpo/target-prices/:id', auth, async (req, res) => {
    try {
      const { target_price_eur, manual_override } = req.body;
      const updates = {};
      if (target_price_eur !== undefined) updates.target_price_eur = target_price_eur;
      if (manual_override !== undefined) updates.manual_override = manual_override;
      updates.last_computed_at = new Date().toISOString();

      const { data, error } = await admin()
        .from('target_prices')
        .update(updates)
        .eq('id', req.params.id)
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, target_price: data });
    } catch (e) {
      console.error('[GPO PATCH /target-prices/:id]', e.message);
      res.status(500).json({ error: e.message });
    }
  });
};
