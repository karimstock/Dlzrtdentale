// =============================================
// JADOMI — Module Mon site internet
// quotas.js — Lecture quotas + achat credits
// =============================================
const { createClient } = require('@supabase/supabase-js');
const { requireSociete } = require('../multiSocietes/middleware');

let _admin = null;
function admin() {
  if (!_admin) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant');
    _admin = createClient(process.env.SUPABASE_URL, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

module.exports = function(router) {

  // ------------------------------------------
  // POST /quotas/buy-credits — Acheter des credits supplementaires
  // IMPORTANT : routes statiques AVANT les routes parametriques /:siteId
  // ------------------------------------------
  router.post('/quotas/buy-credits', requireSociete(), async (req, res) => {
    try {
      const { siteId, pack } = req.body;
      if (!siteId || !pack) return res.status(400).json({ error: 'siteId et pack requis' });

      const { data: site } = await admin()
        .from('vitrines_sites')
        .select('id')
        .eq('id', siteId)
        .eq('societe_id', req.societe.id)
        .maybeSingle();
      if (!site) return res.status(404).json({ error: 'Site introuvable' });

      const packs = {
        'regen_20': {
          label: '20 regenerations IA supplementaires',
          price_cents: 990,
          quota_field: 'ai_regenerations_limit',
          increment: 20
        },
        'seo_5': {
          label: '5 pages SEO supplementaires',
          price_cents: 1490,
          quota_field: 'additional_seo_pages_limit',
          increment: 5
        },
        'refresh_1': {
          label: '1 refonte complete supplementaire',
          price_cents: 2990,
          quota_field: 'complete_refreshes_limit',
          increment: 1
        }
      };

      const selectedPack = packs[pack];
      if (!selectedPack) {
        return res.status(400).json({ error: 'Pack inconnu. Packs disponibles : ' + Object.keys(packs).join(', ') });
      }

      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: { name: selectedPack.label },
            unit_amount: selectedPack.price_cents
          },
          quantity: 1
        }],
        metadata: {
          site_id: siteId,
          societe_id: req.societe.id,
          pack: pack,
          quota_field: selectedPack.quota_field,
          increment: String(selectedPack.increment)
        },
        success_url: process.env.APP_URL + '/public/vitrines/parametres.html?payment=success',
        cancel_url: process.env.APP_URL + '/public/vitrines/parametres.html?payment=cancel'
      });

      res.json({
        success: true,
        checkout_url: session.url,
        pack: selectedPack.label,
        price: selectedPack.price_cents / 100
      });
    } catch (err) {
      console.error('[vitrines/quotas]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // GET /quotas/history/:siteId — Historique des edits
  // ------------------------------------------
  router.get('/quotas/history/:siteId', requireSociete(), async (req, res) => {
    try {
      const { data: site } = await admin()
        .from('vitrines_sites')
        .select('id')
        .eq('id', req.params.siteId)
        .eq('societe_id', req.societe.id)
        .maybeSingle();
      if (!site) return res.status(404).json({ error: 'Site introuvable' });

      const { data, error } = await admin()
        .from('vitrines_edits')
        .select('*')
        .eq('site_id', req.params.siteId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;

      res.json({ success: true, edits: data });
    } catch (err) {
      console.error('[vitrines/quotas]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------
  // GET /quotas/:siteId — Quotas du mois en cours
  // ------------------------------------------
  router.get('/quotas/:siteId', requireSociete(), async (req, res) => {
    try {
      const { data: site } = await admin()
        .from('vitrines_sites')
        .select('id')
        .eq('id', req.params.siteId)
        .eq('societe_id', req.societe.id)
        .maybeSingle();
      if (!site) return res.status(404).json({ error: 'Site introuvable' });

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      let { data: quota } = await admin()
        .from('vitrines_usage_quotas')
        .select('*')
        .eq('site_id', req.params.siteId)
        .eq('period_year', year)
        .eq('period_month', month)
        .maybeSingle();

      if (!quota) {
        // Creer le quota pour ce mois
        const { data: newQuota, error } = await admin()
          .from('vitrines_usage_quotas')
          .insert({
            site_id: req.params.siteId,
            period_year: year,
            period_month: month
          })
          .select('*')
          .single();
        if (error) throw error;
        quota = newQuota;
      }

      res.json({
        success: true,
        quotas: {
          period: year + '-' + String(month).padStart(2, '0'),
          ai_regenerations: {
            used: quota.ai_regenerations_used,
            limit: quota.ai_regenerations_limit,
            remaining: quota.ai_regenerations_limit - quota.ai_regenerations_used
          },
          complete_refreshes: {
            used: quota.complete_refreshes_used,
            limit: quota.complete_refreshes_limit,
            remaining: quota.complete_refreshes_limit - quota.complete_refreshes_used
          },
          palette_changes: {
            used: quota.palette_changes_used,
            limit: quota.palette_changes_limit,
            remaining: quota.palette_changes_limit - quota.palette_changes_used
          },
          additional_seo_pages: {
            used: quota.additional_seo_pages_used,
            limit: quota.additional_seo_pages_limit,
            remaining: quota.additional_seo_pages_limit - quota.additional_seo_pages_used
          }
        }
      });
    } catch (err) {
      console.error('[vitrines/quotas]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });


};
