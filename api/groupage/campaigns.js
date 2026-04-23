// =============================================
// JADOMI — Campagnes de groupage regional
// =============================================
const { sendMail } = require('../multiSocietes/mailer');

module.exports = function mountCampaigns(app, admin, auth) {

  // POST /api/groupage/campaigns — creer une campagne
  app.post('/api/groupage/campaigns', auth, async (req, res) => {
    try {
      const societeId = req.headers['x-societe-id'] || req.body.societe_id;
      if (!societeId) return res.status(400).json({ error: 'societe_id requis' });

      const { title, region, departments, suggested_items, min_cabinets_required, deadline_hours } = req.body;
      if (!title || !region) return res.status(400).json({ error: 'title et region requis' });

      const hours = deadline_hours || 48;
      const deadline = new Date(Date.now() + hours * 3600000).toISOString();
      const minCabinets = min_cabinets_required || 5;

      // Creer la campagne
      const { data: campaign, error } = await admin()
        .from('group_purchase_campaigns')
        .insert({
          title,
          region,
          departments: departments || [],
          suggested_items: suggested_items || [],
          min_cabinets_required: minCabinets,
          current_cabinets_count: 1,
          collection_deadline: deadline,
          total_volume_eur: 0,
          created_by_societe_id: societeId,
          status: 'collecting'
        })
        .select()
        .single();

      if (error) throw error;

      // Auto-inscrire le createur
      const items = suggested_items || [];
      const subtotal = items.reduce((s, i) => s + ((i.quantity || 1) * (i.unit_price_eur || 17)), 0);

      // Recuperer adresse societe
      const { data: societe } = await admin()
        .from('societes')
        .select('address, city, postal_code, lat, lng')
        .eq('id', societeId)
        .single();

      await admin()
        .from('group_purchase_items')
        .insert({
          campaign_id: campaign.id,
          societe_id: societeId,
          items,
          subtotal_eur: subtotal,
          cabinet_address: societe?.address,
          cabinet_city: societe?.city,
          cabinet_postal_code: societe?.postal_code,
          cabinet_lat: societe?.lat,
          cabinet_lng: societe?.lng,
          shipping_free: subtotal >= 150
        });

      // Mettre a jour le volume
      await admin()
        .from('group_purchase_campaigns')
        .update({ total_volume_eur: subtotal })
        .eq('id', campaign.id);

      res.json({
        success: true,
        campaign_id: campaign.id,
        deadline: deadline,
        current_count: 1,
        min_required: minCabinets
      });
    } catch (e) {
      console.error('[Groupage POST /campaigns]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/groupage/campaigns — liste des campagnes actives
  app.get('/api/groupage/campaigns', auth, async (req, res) => {
    try {
      let query = admin()
        .from('group_purchase_campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (req.query.region) query = query.eq('region', req.query.region);
      if (req.query.status) query = query.eq('status', req.query.status);
      else query = query.in('status', ['collecting', 'triggered', 'ordered']);

      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      query = query.limit(limit);

      const { data, error } = await query;
      if (error) throw error;

      res.json({ campaigns: data || [] });
    } catch (e) {
      console.error('[Groupage GET /campaigns]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/groupage/campaigns/:id — detail
  app.get('/api/groupage/campaigns/:id', auth, async (req, res) => {
    try {
      const { data: campaign, error } = await admin()
        .from('group_purchase_campaigns')
        .select('*')
        .eq('id', req.params.id)
        .single();

      if (error || !campaign) return res.status(404).json({ error: 'Campagne introuvable' });

      // Recuperer les items (anonymises : pas de nom de cabinet pour les autres)
      const { data: items } = await admin()
        .from('group_purchase_items')
        .select('id, items, subtotal_eur, cabinet_city, status, joined_at')
        .eq('campaign_id', campaign.id)
        .eq('status', 'active');

      res.json({ campaign, participants: items || [], participants_count: (items || []).length });
    } catch (e) {
      console.error('[Groupage GET /campaigns/:id]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/groupage/campaigns/:id/join — rejoindre
  app.post('/api/groupage/campaigns/:id/join', auth, async (req, res) => {
    try {
      const societeId = req.headers['x-societe-id'] || req.body.societe_id;
      if (!societeId) return res.status(400).json({ error: 'societe_id requis' });

      const { data: campaign } = await admin()
        .from('group_purchase_campaigns')
        .select('*')
        .eq('id', req.params.id)
        .single();

      if (!campaign) return res.status(404).json({ error: 'Campagne introuvable' });
      if (campaign.status !== 'collecting') return res.status(400).json({ error: 'Campagne plus ouverte' });
      if (new Date(campaign.collection_deadline) < new Date()) {
        return res.status(400).json({ error: 'Delai de collecte depasse' });
      }

      const { items } = req.body;
      const itemsList = items || campaign.suggested_items || [];
      const subtotal = itemsList.reduce((s, i) => s + ((i.quantity || 1) * (i.unit_price_eur || 17)), 0);

      // Recuperer adresse societe
      const { data: societe } = await admin()
        .from('societes')
        .select('address, city, postal_code, lat, lng')
        .eq('id', societeId)
        .single();

      // Insert participation
      const { error: insErr } = await admin()
        .from('group_purchase_items')
        .insert({
          campaign_id: campaign.id,
          societe_id: societeId,
          items: itemsList,
          subtotal_eur: subtotal,
          cabinet_address: societe?.address,
          cabinet_city: societe?.city,
          cabinet_postal_code: societe?.postal_code,
          cabinet_lat: societe?.lat,
          cabinet_lng: societe?.lng,
          shipping_free: subtotal >= 150
        });

      if (insErr) {
        if (insErr.code === '23505') return res.status(400).json({ error: 'Deja inscrit a cette campagne' });
        throw insErr;
      }

      // Incrementer compteurs
      const newCount = campaign.current_cabinets_count + 1;
      const newVolume = (campaign.total_volume_eur || 0) + subtotal;

      await admin()
        .from('group_purchase_campaigns')
        .update({
          current_cabinets_count: newCount,
          total_volume_eur: newVolume
        })
        .eq('id', campaign.id);

      // Declenchement automatique si seuil atteint
      let triggered = false;
      if (newCount >= campaign.min_cabinets_required) {
        const { triggerCampaign } = require('./actions');
        await triggerCampaign(admin, campaign.id);
        triggered = true;
      }

      res.json({
        success: true,
        current_count: newCount,
        min_required: campaign.min_cabinets_required,
        triggered,
        total_volume_eur: newVolume
      });
    } catch (e) {
      console.error('[Groupage POST /join]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/groupage/campaigns/:id/withdraw — se retirer
  app.post('/api/groupage/campaigns/:id/withdraw', auth, async (req, res) => {
    try {
      const societeId = req.headers['x-societe-id'] || req.body.societe_id;

      const { data: campaign } = await admin()
        .from('group_purchase_campaigns')
        .select('status')
        .eq('id', req.params.id)
        .single();

      if (!campaign || campaign.status !== 'collecting') {
        return res.status(400).json({ error: 'Retrait impossible (campagne deja lancee)' });
      }

      const { data: item } = await admin()
        .from('group_purchase_items')
        .select('id, subtotal_eur')
        .eq('campaign_id', req.params.id)
        .eq('societe_id', societeId)
        .eq('status', 'active')
        .single();

      if (!item) return res.status(404).json({ error: 'Pas inscrit' });

      await admin()
        .from('group_purchase_items')
        .update({ status: 'withdrawn', withdrawn_at: new Date().toISOString() })
        .eq('id', item.id);

      // Decremente
      await admin().rpc('decrement_campaign_count', { cid: req.params.id, amount: item.subtotal_eur || 0 })
        .catch(() => {
          // Fallback sans RPC
          admin()
            .from('group_purchase_campaigns')
            .select('current_cabinets_count, total_volume_eur')
            .eq('id', req.params.id)
            .single()
            .then(({ data: c }) => {
              if (c) {
                admin().from('group_purchase_campaigns').update({
                  current_cabinets_count: Math.max(0, (c.current_cabinets_count || 1) - 1),
                  total_volume_eur: Math.max(0, (c.total_volume_eur || 0) - (item.subtotal_eur || 0))
                }).eq('id', req.params.id).then(() => {});
              }
            });
        });

      res.json({ success: true });
    } catch (e) {
      console.error('[Groupage POST /withdraw]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/groupage/campaigns/:id/invite — inviter un confrere par email
  app.post('/api/groupage/campaigns/:id/invite', auth, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: 'email requis' });

      const { data: campaign } = await admin()
        .from('group_purchase_campaigns')
        .select('title, region, current_cabinets_count, min_cabinets_required, collection_deadline')
        .eq('id', req.params.id)
        .single();

      if (!campaign) return res.status(404).json({ error: 'Campagne introuvable' });

      const PUBLIC_URL = process.env.JADOMI_PUBLIC_URL || 'https://jadomi.fr';
      const deadline = new Date(campaign.collection_deadline);
      const remaining = Math.max(0, Math.ceil((deadline - new Date()) / 3600000));

      await sendMail({
        to: email,
        subject: 'Un confr\u00e8re vous invite \u00e0 rejoindre un panier group\u00e9 JADOMI',
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#0f0e0d;padding:24px 28px;"><h1 style="color:#10b981;margin:0;font-size:22px;">JADOMI</h1></div>
          <div style="padding:28px;">
            <h2 style="margin:0 0 16px;font-size:18px;">Invitation \u00e0 un panier group\u00e9</h2>
            <p style="color:#555;font-size:14px;">Un confr\u00e8re vous invite \u00e0 rejoindre le panier group\u00e9 <strong>${campaign.title}</strong> dans la r\u00e9gion ${campaign.region}.</p>
            <div style="background:#f0fdf4;border-radius:12px;padding:16px;margin:16px 0;">
              <div style="font-size:13px;">${campaign.current_cabinets_count}/${campaign.min_cabinets_required} cabinets inscrits</div>
              <div style="font-size:13px;color:#10b981;font-weight:600;">Plus que ${remaining}h pour rejoindre</div>
              <div style="font-size:12px;color:#666;margin-top:4px;">\u00c9conomies estim\u00e9es : -25% (GPO + volume)</div>
            </div>
            <div style="text-align:center;margin:24px 0;">
              <a href="${PUBLIC_URL}/index.html" style="display:inline-block;background:#10b981;color:#fff;padding:14px 32px;border-radius:50px;text-decoration:none;font-weight:700;">Rejoindre le panier group\u00e9</a>
            </div>
          </div>
        </div>`
      });

      res.json({ success: true });
    } catch (e) {
      console.error('[Groupage POST /invite]', e.message);
      res.status(500).json({ error: e.message });
    }
  });
};
