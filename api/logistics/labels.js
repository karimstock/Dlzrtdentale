// =============================================
// JADOMI — Generation etiquettes expedition
// =============================================
const { generateShippingLabel, generateTrackingNumber } = require('../../lib/shipping/label-generator');

module.exports = function mountLabels(app, admin, auth) {

  // POST /api/logistics/labels — generer une etiquette
  app.post('/api/logistics/labels', auth, async (req, res) => {
    try {
      const { request_id, campaign_item_id, carrier } = req.body;

      if (!request_id && !campaign_item_id) {
        return res.status(400).json({ error: 'request_id ou campaign_item_id requis' });
      }

      let societeId, supplierId, items, warehouseId;

      if (request_id) {
        const { data: request } = await admin()
          .from('gpo_requests')
          .select('*')
          .eq('id', request_id)
          .single();
        if (!request) return res.status(404).json({ error: 'Request introuvable' });
        societeId = request.societe_id;
        supplierId = request.winner_supplier_id;
        items = request.items;
      }

      if (!supplierId) return res.status(400).json({ error: 'Pas de fournisseur gagnant' });

      // Recuperer infos
      const [supplierRes, societeRes, warehouseRes] = await Promise.all([
        admin().from('suppliers').select('name, address, city, postal_code').eq('id', supplierId).single(),
        admin().from('societes').select('nom, address, city, postal_code').eq('id', societeId).single(),
        admin().from('supplier_warehouses').select('*').eq('supplier_id', supplierId).eq('is_primary', true).maybeSingle()
      ]);

      const supplier = supplierRes.data;
      const societe = societeRes.data;
      const warehouse = warehouseRes.data;

      const trackingNumber = generateTrackingNumber();
      const weightKg = Array.isArray(items) ? Math.max(1, Math.ceil(items.length * 0.3)) : 2;

      const fromAddr = warehouse || supplier || {};
      const toAddr = societe || {};

      // Generer PDF
      const pdfBuffer = await generateShippingLabel({
        trackingNumber,
        carrier: carrier || 'chronopost',
        fromAddress: {
          name: supplier?.name || 'Fournisseur',
          street: fromAddr.address || '',
          postal: fromAddr.postal_code || '',
          city: fromAddr.city || ''
        },
        toAddress: {
          name: toAddr.nom || 'Cabinet',
          street: toAddr.address || '',
          postal: toAddr.postal_code || '',
          city: toAddr.city || ''
        },
        weight_kg: weightKg,
        reference: 'JADOMI-' + (request_id || '').substring(0, 8).toUpperCase()
      });

      // Upload sur R2 (si disponible)
      let labelUrl = null;
      let labelR2Key = null;
      try {
        const { uploadToR2 } = require('../../services/r2-storage');
        const r2Result = await uploadToR2(pdfBuffer, {
          format: 'pdf',
          contentType: 'application/pdf',
          demandeId: 'shipping-labels',
          compress: false,
          encrypt: false
        });
        labelUrl = r2Result?.url || r2Result?.key;
        labelR2Key = r2Result?.key;
      } catch (e) {
        console.warn('[Labels] R2 upload skip:', e.message);
        // Fallback : stocker en base64 data URI
        labelUrl = 'data:application/pdf;base64,' + pdfBuffer.toString('base64');
      }

      // Insert shipping_labels
      const { data: label, error } = await admin()
        .from('shipping_labels')
        .insert({
          request_id: request_id || null,
          campaign_id: req.body.campaign_id || null,
          campaign_item_id: campaign_item_id || null,
          societe_id: societeId,
          supplier_id: supplierId,
          warehouse_id: warehouse?.id || null,
          carrier: carrier || 'chronopost',
          tracking_number: trackingNumber,
          label_pdf_url: labelUrl,
          label_pdf_r2_key: labelR2Key,
          from_address: { name: supplier?.name, street: fromAddr.address, postal: fromAddr.postal_code, city: fromAddr.city },
          to_address: { name: toAddr.nom, street: toAddr.address, postal: toAddr.postal_code, city: toAddr.city },
          weight_kg: weightKg,
          status: 'generated'
        })
        .select()
        .single();

      if (error) throw error;

      res.json({
        success: true,
        label_id: label.id,
        tracking_number: trackingNumber,
        pdf_url: labelUrl,
        carrier: carrier || 'chronopost'
      });
    } catch (e) {
      console.error('[Logistics POST /labels]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/logistics/labels/:id — detail etiquette
  app.get('/api/logistics/labels/:id', auth, async (req, res) => {
    try {
      const { data, error } = await admin()
        .from('shipping_labels')
        .select('*')
        .eq('id', req.params.id)
        .single();
      if (error || !data) return res.status(404).json({ error: 'Etiquette introuvable' });
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
};
