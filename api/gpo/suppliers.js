// =============================================
// JADOMI — GPO Suppliers (gestion fournisseurs, admin)
// =============================================

module.exports = function mountSuppliers(app, admin, auth) {

  // POST /api/gpo/suppliers — creer un fournisseur
  app.post('/api/gpo/suppliers', auth, async (req, res) => {
    try {
      const { name, email, phone, siret, address, city, postal_code, region,
        specialties, subscription_tier, source } = req.body;

      if (!name) return res.status(400).json({ error: 'name requis' });

      const slotsMap = { bronze: 1, silver: 3, gold: 8, platinum: 20 };
      const tier = subscription_tier || 'bronze';

      const { data, error } = await admin()
        .from('suppliers')
        .insert({
          name, email, phone, siret, address, city, postal_code, region,
          specialties: specialties || [],
          subscription_tier: tier,
          slots_count: slotsMap[tier] || 1,
          source: source || 'manual_invite',
          status: email ? 'invited' : 'extracted'
        })
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, supplier: data });
    } catch (e) {
      console.error('[GPO POST /suppliers]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/gpo/suppliers — lister
  app.get('/api/gpo/suppliers', auth, async (req, res) => {
    try {
      let query = admin()
        .from('suppliers')
        .select('*')
        .neq('status', 'deleted')
        .order('created_at', { ascending: false });

      if (req.query.status) query = query.eq('status', req.query.status);
      if (req.query.tier) query = query.eq('subscription_tier', req.query.tier);
      if (req.query.region) query = query.eq('region', req.query.region);
      if (req.query.search) {
        query = query.or(`name.ilike.%${req.query.search}%,email.ilike.%${req.query.search}%,city.ilike.%${req.query.search}%`);
      }

      const limit = Math.min(parseInt(req.query.limit) || 50, 200);
      const offset = parseInt(req.query.offset) || 0;
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      res.json({ suppliers: data || [], total: count });
    } catch (e) {
      console.error('[GPO GET /suppliers]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH /api/gpo/suppliers/:id — modifier
  app.patch('/api/gpo/suppliers/:id', auth, async (req, res) => {
    try {
      const allowed = ['name', 'email', 'phone', 'siret', 'address', 'city',
        'postal_code', 'region', 'lat', 'lng', 'status', 'specialties',
        'subscription_tier', 'slots_count', 'source'];
      const updates = {};
      for (const k of allowed) {
        if (req.body[k] !== undefined) updates[k] = req.body[k];
      }

      // Auto-calc slots si tier change
      if (updates.subscription_tier && !updates.slots_count) {
        const slotsMap = { bronze: 1, silver: 3, gold: 8, platinum: 20 };
        updates.slots_count = slotsMap[updates.subscription_tier] || 1;
      }

      updates.updated_at = new Date().toISOString();

      const { data, error } = await admin()
        .from('suppliers')
        .update(updates)
        .eq('id', req.params.id)
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, supplier: data });
    } catch (e) {
      console.error('[GPO PATCH /suppliers/:id]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/gpo/suppliers/:id/invite — envoyer email d'invitation
  app.post('/api/gpo/suppliers/:id/invite', auth, async (req, res) => {
    try {
      const { data: supplier, error } = await admin()
        .from('suppliers')
        .select('*')
        .eq('id', req.params.id)
        .single();

      if (error || !supplier) return res.status(404).json({ error: 'Fournisseur introuvable' });
      if (!supplier.email) return res.status(400).json({ error: 'Pas d\'email' });

      const { sendMail } = require('../multiSocietes/mailer');
      const PUBLIC_URL = process.env.JADOMI_PUBLIC_URL || 'https://jadomi.fr';

      await sendMail({
        to: supplier.email,
        subject: 'Rejoignez JADOMI — Recevez des commandes de cabinets dentaires',
        html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:#0f0e0d;padding:24px 28px;">
    <h1 style="color:#10b981;margin:0;font-size:22px;">JADOMI</h1>
  </div>
  <div style="padding:28px;">
    <h2 style="margin:0 0 16px;font-size:18px;">Bonjour ${supplier.name},</h2>
    <p style="color:#555;font-size:14px;line-height:1.6;">
      JADOMI est la plateforme qui connecte <strong>cabinets dentaires</strong>
      et <strong>fournisseurs</strong> partout en France.
    </p>
    <p style="color:#555;font-size:14px;line-height:1.6;">
      En rejoignant JADOMI, vous recevez des commandes de cabinets dentaires
      dans votre r\u00e9gion. L'inscription est <strong>gratuite</strong> (1 slot de commande par tour).
    </p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${PUBLIC_URL}" style="display:inline-block;background:#10b981;color:#fff;padding:14px 32px;border-radius:50px;text-decoration:none;font-weight:700;">
        D\u00e9couvrir JADOMI
      </a>
    </div>
  </div>
</div>`
      });

      await admin()
        .from('suppliers')
        .update({ status: 'invited', updated_at: new Date().toISOString() })
        .eq('id', req.params.id);

      res.json({ success: true });
    } catch (e) {
      console.error('[GPO POST /suppliers/:id/invite]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/gpo/suppliers/import-from-invoices — batch extract depuis scanned_invoices
  app.post('/api/gpo/suppliers/import-from-invoices', auth, async (req, res) => {
    try {
      const { data: invoices, error } = await admin()
        .from('scanned_invoices')
        .select('*');

      if (error) throw error;
      if (!invoices || invoices.length === 0) {
        return res.json({ success: true, identified: 0, inserted: 0 });
      }

      const uniqueSuppliers = {};
      for (const inv of invoices) {
        const key = (inv.fournisseur_email || inv.fournisseur_name || '').toLowerCase().trim();
        if (!key) continue;

        if (!uniqueSuppliers[key]) {
          uniqueSuppliers[key] = {
            name: inv.fournisseur_name || key,
            email: inv.fournisseur_email || null,
            siret: inv.fournisseur_siret || null,
            address: inv.fournisseur_address || null,
            source: 'scanner_invoice',
            status: 'extracted',
            subscription_tier: 'bronze',
            slots_count: 1,
            specialties: []
          };
        }
        // Agreger les specialites
        const products = inv.extracted_data?.products || inv.products || [];
        if (Array.isArray(products)) {
          products.forEach(p => {
            if (p.category && !uniqueSuppliers[key].specialties.includes(p.category)) {
              uniqueSuppliers[key].specialties.push(p.category);
            }
          });
        }
      }

      const toInsert = Object.values(uniqueSuppliers);
      let insertedCount = 0;

      for (const s of toInsert) {
        try {
          // Check si deja existant par email ou nom
          if (s.email) {
            const { data: existing } = await admin()
              .from('suppliers')
              .select('id')
              .eq('email', s.email)
              .maybeSingle();
            if (existing) continue;
          }

          const { error: insErr } = await admin()
            .from('suppliers')
            .insert(s);

          if (!insErr) insertedCount++;
        } catch (e) {
          // Skip duplicates
        }
      }

      res.json({
        success: true,
        identified: toInsert.length,
        inserted: insertedCount
      });
    } catch (e) {
      console.error('[GPO POST /import-from-invoices]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/gpo/suppliers/stats — KPIs dashboard
  app.get('/api/gpo/suppliers/stats', auth, async (req, res) => {
    try {
      const { data: suppliers } = await admin()
        .from('suppliers')
        .select('status, subscription_tier, orders_received, orders_accepted, orders_refused, orders_timeout, avg_rating')
        .neq('status', 'deleted');

      const { data: requests } = await admin()
        .from('gpo_requests')
        .select('status, total_target_eur, total_market_eur, savings_eur, created_at');

      const stats = {
        total_suppliers: (suppliers || []).length,
        active_suppliers: (suppliers || []).filter(s => s.status === 'active').length,
        extracted_suppliers: (suppliers || []).filter(s => s.status === 'extracted').length,
        total_requests: (requests || []).length,
        pending_requests: (requests || []).filter(r => ['pending', 'searching'].includes(r.status)).length,
        accepted_requests: (requests || []).filter(r => r.status === 'accepted').length,
        fulfilled_requests: (requests || []).filter(r => r.status === 'fulfilled').length,
        total_savings_eur: (requests || []).reduce((sum, r) => sum + (r.savings_eur || 0), 0),
        tiers: {
          bronze: (suppliers || []).filter(s => s.subscription_tier === 'bronze').length,
          silver: (suppliers || []).filter(s => s.subscription_tier === 'silver').length,
          gold: (suppliers || []).filter(s => s.subscription_tier === 'gold').length,
          platinum: (suppliers || []).filter(s => s.subscription_tier === 'platinum').length
        }
      };

      res.json(stats);
    } catch (e) {
      console.error('[GPO GET /suppliers/stats]', e.message);
      res.status(500).json({ error: e.message });
    }
  });
};
