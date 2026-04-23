// =============================================
// JADOMI — Calcul transport (distance + cout + regle 150EUR)
// =============================================
const { haversine } = require('../../lib/gpo-queue');

const FREE_SHIPPING_THRESHOLD = 150;

module.exports = function mountCalculate(app, admin, auth) {

  // POST /api/logistics/calculate — estimer le cout de transport
  app.post('/api/logistics/calculate', auth, async (req, res) => {
    try {
      const { supplier_id, societe_id, weight_kg_estimate, subtotal_eur } = req.body;

      if (!supplier_id || !societe_id) {
        return res.status(400).json({ error: 'supplier_id et societe_id requis' });
      }

      const weight = weight_kg_estimate || 3;

      // Recuperer entrepot primary du fournisseur
      const { data: warehouse } = await admin()
        .from('supplier_warehouses')
        .select('*')
        .eq('supplier_id', supplier_id)
        .eq('is_primary', true)
        .maybeSingle();

      // Recuperer adresse societe
      const { data: societe } = await admin()
        .from('societes')
        .select('nom, address, city, postal_code, lat, lng')
        .eq('id', societe_id)
        .single();

      // Calculer distance
      let distanceKm = 200; // fallback
      if (warehouse?.lat && warehouse?.lng && societe?.lat && societe?.lng) {
        distanceKm = Math.round(haversine(warehouse.lat, warehouse.lng, societe.lat, societe.lng));
      }

      // Chercher le meilleur tarif
      const { data: rates } = await admin()
        .from('transport_rates')
        .select('*')
        .eq('is_active', true)
        .gte('distance_km_max', distanceKm)
        .gte('weight_kg_max', weight)
        .order('price_negotiated_eur', { ascending: true })
        .limit(5);

      let bestRate = (rates && rates.length > 0) ? rates[0] : null;
      if (!bestRate) {
        bestRate = {
          carrier: 'chronopost',
          price_negotiated_eur: 12.50,
          jadomi_margin_pct: 15,
          delivery_hours: 48
        };
      }

      const baseCost = bestRate.price_negotiated_eur;
      const marginPct = bestRate.jadomi_margin_pct || 15;
      const jadomiMargin = Math.round(baseCost * marginPct / 100 * 100) / 100;
      const totalShipping = Math.round((baseCost + jadomiMargin) * 100) / 100;

      const sub = subtotal_eur || 0;
      const paidBy = sub >= FREE_SHIPPING_THRESHOLD ? 'supplier' : 'dentist';
      const missingToFree = sub >= FREE_SHIPPING_THRESHOLD ? 0 :
        Math.round((FREE_SHIPPING_THRESHOLD - sub) * 100) / 100;

      res.json({
        carrier: bestRate.carrier,
        delivery_hours: bestRate.delivery_hours,
        distance_km: distanceKm,
        base_cost_eur: baseCost,
        jadomi_margin_eur: jadomiMargin,
        total_shipping_eur: totalShipping,
        paid_by: paidBy,
        free_shipping_threshold_eur: FREE_SHIPPING_THRESHOLD,
        missing_to_free_shipping_eur: missingToFree,
        warehouse_name: warehouse?.name || null,
        warehouse_city: warehouse?.city || null,
        weight_kg: weight
      });
    } catch (e) {
      console.error('[Logistics POST /calculate]', e.message);
      res.status(500).json({ error: e.message });
    }
  });
};
