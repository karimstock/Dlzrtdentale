// =============================================
// JADOMI — GPO Ratings (notations fournisseurs)
// =============================================

module.exports = function mountRatings(app, admin, auth) {

  // POST /api/gpo/ratings — dentiste note un fournisseur
  app.post('/api/gpo/ratings', auth, async (req, res) => {
    try {
      const { request_id, supplier_id, societe_id,
        quality_score, delivery_score, service_score, overall_score, comment } = req.body;

      if (!request_id || !supplier_id || !societe_id) {
        return res.status(400).json({ error: 'request_id, supplier_id, societe_id requis' });
      }

      // Verifier pas de doublon
      const { data: existing } = await admin()
        .from('supplier_ratings')
        .select('id')
        .eq('request_id', request_id)
        .eq('societe_id', societe_id)
        .maybeSingle();

      if (existing) return res.status(400).json({ error: 'Deja note pour cette commande' });

      const { data, error } = await admin()
        .from('supplier_ratings')
        .insert({
          request_id, supplier_id, societe_id,
          quality_score, delivery_score, service_score, overall_score,
          comment: comment || null
        })
        .select()
        .single();

      if (error) throw error;

      // Recalculer la moyenne du fournisseur
      const { data: allRatings } = await admin()
        .from('supplier_ratings')
        .select('overall_score')
        .eq('supplier_id', supplier_id);

      if (allRatings && allRatings.length > 0) {
        const avg = allRatings.reduce((s, r) => s + (r.overall_score || 0), 0) / allRatings.length;
        await admin()
          .from('suppliers')
          .update({
            avg_rating: Math.round(avg * 10) / 10,
            total_ratings: allRatings.length,
            updated_at: new Date().toISOString()
          })
          .eq('id', supplier_id);
      }

      res.json({ success: true, rating: data });
    } catch (e) {
      console.error('[GPO POST /ratings]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/gpo/ratings/supplier/:id — voir notes d'un fournisseur
  app.get('/api/gpo/ratings/supplier/:id', async (req, res) => {
    try {
      const { data, error } = await admin()
        .from('supplier_ratings')
        .select('quality_score, delivery_score, service_score, overall_score, comment, created_at')
        .eq('supplier_id', req.params.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const ratings = data || [];
      const avg = ratings.length > 0
        ? ratings.reduce((s, r) => s + (r.overall_score || 0), 0) / ratings.length
        : 0;

      res.json({ ratings, average: Math.round(avg * 10) / 10, total: ratings.length });
    } catch (e) {
      console.error('[GPO GET /ratings/supplier/:id]', e.message);
      res.status(500).json({ error: e.message });
    }
  });
};
