// =============================================
// JADOMI — GPO Requests (demandes d'achat dentiste)
// =============================================
const { pickNextSupplier, computeDeadline } = require('../../lib/gpo-queue');
const { sendSupplierOfferEmail } = require('../../lib/emails/supplier-offer');

module.exports = function mountRequests(app, admin, auth) {

  // POST /api/gpo/requests — creer une nouvelle demande GPO
  app.post('/api/gpo/requests', auth, async (req, res) => {
    try {
      const societeId = req.headers['x-societe-id'] || req.body.societe_id;
      if (!societeId) return res.status(400).json({ error: 'societe_id requis' });

      const { items, prefer_local } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items requis (tableau non vide)' });
      }

      // Calculer les tarifs cibles
      const normalizedNames = items.map(i => (i.name || '').toLowerCase().trim());
      const { data: targetPrices } = await admin()
        .from('target_prices')
        .select('*')
        .in('product_name_normalized', normalizedNames);

      const targetMap = {};
      (targetPrices || []).forEach(tp => { targetMap[tp.product_name_normalized] = tp; });

      // Fallback prix estimes si target_prices est vide
      const DEFAULT_MARKET_PRICE = 20; // EUR par unite (estimation dentaire)
      const DEFAULT_DISCOUNT = 0.15;
      const DEFAULT_TARGET_PRICE = DEFAULT_MARKET_PRICE * (1 - DEFAULT_DISCOUNT); // 17 EUR

      let totalTarget = 0;
      let totalMarket = 0;
      let usedFallback = false;
      const enrichedItems = items.map(item => {
        const norm = (item.name || '').toLowerCase().trim();
        const tp = targetMap[norm];
        const qty = item.quantity || 1;
        const unitTarget = tp ? tp.target_price_eur : DEFAULT_TARGET_PRICE;
        const unitMarket = tp ? tp.avg_market_price_eur : DEFAULT_MARKET_PRICE;
        if (!tp) usedFallback = true;
        totalTarget += unitTarget * qty;
        totalMarket += unitMarket * qty;
        return {
          ...item,
          target_price_eur: unitTarget,
          market_price_eur: unitMarket,
          is_estimated: !tp
        };
      });

      const { isBusinessHours, deadline, delayMinutes } = computeDeadline();

      // Creer la request
      const { data: request, error: reqErr } = await admin()
        .from('gpo_requests')
        .insert({
          societe_id: societeId,
          items: enrichedItems,
          total_target_eur: totalTarget || null,
          total_market_eur: totalMarket || null,
          savings_eur: totalMarket && totalTarget ? totalMarket - totalTarget : null,
          status: 'searching',
          prefer_local: prefer_local !== false,
          created_during_business_hours: isBusinessHours
        })
        .select()
        .single();

      if (reqErr) throw reqErr;

      // Selectionner le 1er fournisseur
      const itemsCategories = [...new Set(items.map(i => i.category).filter(Boolean))];

      // Recuperer societe pour coordonnees
      const { data: societe } = await admin()
        .from('societes')
        .select('lat, lng')
        .eq('id', societeId)
        .single();

      const firstSupplier = await pickNextSupplier({
        requestId: request.id,
        itemsCategories,
        preferLocal: request.prefer_local,
        societeLat: societe?.lat,
        societeLng: societe?.lng,
        alreadyAttempted: []
      });

      if (!firstSupplier) {
        await admin()
          .from('gpo_requests')
          .update({ status: 'failed' })
          .eq('id', request.id);
        return res.json({
          request_id: request.id,
          status: 'failed',
          message: 'Aucun fournisseur eligible pour le moment'
        });
      }

      // Creer la 1ere tentative
      const { data: attempt, error: attErr } = await admin()
        .from('gpo_request_attempts')
        .insert({
          request_id: request.id,
          supplier_id: firstSupplier.id,
          attempt_position: 1,
          deadline_at: deadline.toISOString()
        })
        .select()
        .single();

      if (attErr) throw attErr;

      // Envoyer email (async, ne pas bloquer la reponse)
      sendSupplierOfferEmail({
        supplier: firstSupplier,
        attempt,
        request: { ...request, items: enrichedItems },
        delayMinutes
      }).catch(e => console.error('[GPO] Email send error:', e.message));

      // Incrementer orders_received
      admin()
        .from('suppliers')
        .select('orders_received')
        .eq('id', firstSupplier.id)
        .single()
        .then(({ data }) => {
          if (data) {
            admin()
              .from('suppliers')
              .update({ orders_received: (data.orders_received || 0) + 1 })
              .eq('id', firstSupplier.id)
              .then(() => {});
          }
        });

      res.json({
        request_id: request.id,
        status: 'searching',
        first_attempt: {
          supplier_name: firstSupplier.name,
          deadline_at: deadline.toISOString(),
          delay_minutes: delayMinutes,
          attempt_position: 1
        },
        total_target_eur: totalTarget || null,
        total_market_eur: totalMarket || null,
        price_note: usedFallback ? 'Prix estimes — affinement via Scanner IA factures' : null
      });

    } catch (e) {
      console.error('[GPO POST /requests]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/gpo/requests/:id — statut d'une demande
  app.get('/api/gpo/requests/:id', auth, async (req, res) => {
    try {
      const { data: request, error } = await admin()
        .from('gpo_requests')
        .select('*')
        .eq('id', req.params.id)
        .single();

      if (error || !request) return res.status(404).json({ error: 'Demande introuvable' });

      const { data: attempts } = await admin()
        .from('gpo_request_attempts')
        .select('*, suppliers(name, email, city, avg_rating, subscription_tier)')
        .eq('request_id', request.id)
        .order('attempt_position', { ascending: true });

      let winnerSupplier = null;
      if (request.winner_supplier_id) {
        const { data } = await admin()
          .from('suppliers')
          .select('id, name, email, city, phone, avg_rating')
          .eq('id', request.winner_supplier_id)
          .single();
        winnerSupplier = data;
      }

      res.json({ request, attempts: attempts || [], winner_supplier: winnerSupplier });
    } catch (e) {
      console.error('[GPO GET /requests/:id]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/gpo/requests — historique demandes de la societe
  app.get('/api/gpo/requests', auth, async (req, res) => {
    try {
      const societeId = req.headers['x-societe-id'] || req.query.societe_id;
      if (!societeId) return res.status(400).json({ error: 'societe_id requis' });

      let query = admin()
        .from('gpo_requests')
        .select('*, gpo_request_attempts(count)')
        .eq('societe_id', societeId)
        .order('created_at', { ascending: false });

      if (req.query.status) query = query.eq('status', req.query.status);
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      query = query.limit(limit);

      const { data, error } = await query;
      if (error) throw error;

      res.json({ requests: data || [] });
    } catch (e) {
      console.error('[GPO GET /requests]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/gpo/requests/:id/confirm-counter — dentiste accepte contre-proposition
  app.post('/api/gpo/requests/:id/confirm-counter', auth, async (req, res) => {
    try {
      const { attempt_id } = req.body;
      if (!attempt_id) return res.status(400).json({ error: 'attempt_id requis' });

      const { data: attempt } = await admin()
        .from('gpo_request_attempts')
        .select('*, suppliers(id, name, email)')
        .eq('id', attempt_id)
        .eq('request_id', req.params.id)
        .single();

      if (!attempt) return res.status(404).json({ error: 'Tentative introuvable' });
      if (attempt.response_status !== 'counter_proposed') {
        return res.status(400).json({ error: 'Cette tentative n\'est pas une contre-proposition' });
      }

      // Accepter la contre-proposition
      await admin()
        .from('gpo_request_attempts')
        .update({ response_status: 'accepted', responded_at: new Date().toISOString() })
        .eq('id', attempt_id);

      await admin()
        .from('gpo_requests')
        .update({
          status: 'accepted',
          winner_supplier_id: attempt.supplier_id,
          final_price_eur: attempt.counter_price_eur,
          matched_at: new Date().toISOString()
        })
        .eq('id', req.params.id);

      // Update supplier stats
      admin()
        .from('suppliers')
        .select('orders_accepted')
        .eq('id', attempt.supplier_id)
        .single()
        .then(({ data }) => {
          if (data) {
            admin()
              .from('suppliers')
              .update({ orders_accepted: (data.orders_accepted || 0) + 1 })
              .eq('id', attempt.supplier_id)
              .then(() => {});
          }
        });

      // Update client history
      const societeId = (await admin().from('gpo_requests').select('societe_id').eq('id', req.params.id).single()).data?.societe_id;
      if (societeId) {
        await admin()
          .from('supplier_client_history')
          .upsert({
            supplier_id: attempt.supplier_id,
            societe_id: societeId,
            last_order_at: new Date().toISOString(),
            total_orders: 1,
            total_spent_eur: attempt.counter_price_eur || 0,
            is_first_order_done: true
          }, { onConflict: 'supplier_id,societe_id' });
      }

      res.json({ success: true, status: 'accepted', final_price_eur: attempt.counter_price_eur });
    } catch (e) {
      console.error('[GPO POST /confirm-counter]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/gpo/requests/:id/cancel — annuler
  app.post('/api/gpo/requests/:id/cancel', auth, async (req, res) => {
    try {
      const { error } = await admin()
        .from('gpo_requests')
        .update({ status: 'cancelled' })
        .eq('id', req.params.id);

      if (error) throw error;
      res.json({ success: true });
    } catch (e) {
      console.error('[GPO POST /cancel]', e.message);
      res.status(500).json({ error: e.message });
    }
  });
};
