// =============================================
// JADOMI — GPO Public (endpoints fournisseurs, SANS AUTH, par token)
// =============================================
const { sendCounterProposalNotification } = require('../../lib/emails/supplier-offer');
const { sendDentistAcceptedEmail } = require('../../lib/emails/dentist-offer-accepted');

// Helper : recuperer email du dentiste proprietaire de la societe
async function getDentistInfo(admin, societeId) {
  try {
    const { data: societe } = await admin()
      .from('societes')
      .select('owner_user_id')
      .eq('id', societeId)
      .single();
    if (!societe?.owner_user_id) return null;
    const { data } = await admin().auth.admin.getUserById(societe.owner_user_id);
    return data?.user ? { user_id: data.user.id, email: data.user.email } : null;
  } catch (e) {
    console.warn('[GPO getDentistInfo]', e.message);
    return null;
  }
}

// Helper : calculer final_price_eur depuis les items
function computeFinalPrice(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, i) => {
    const qty = i.quantity || 1;
    const price = i.target_price_eur || i.market_price_eur || 20; // fallback 20EUR
    return sum + (qty * price);
  }, 0);
}

// Helper : pousser notification in-app (best-effort)
async function pushGpoNotification(admin, { user_id, societe_id, type, titre, message, cta_url, entity_id }) {
  try {
    await admin().from('notifications').insert({
      user_id,
      societe_id,
      type,
      urgence: type === 'gpo_accepted' ? 'haute' : 'normale',
      titre,
      message,
      cta_label: 'Voir la commande',
      cta_url: cta_url || '/index.html',
      entity_type: 'gpo_request',
      entity_id: entity_id || null
    });
  } catch (e) {
    // La notification in-app est best-effort (ex: types pas encore dans CHECK)
    console.warn('[GPO pushNotification] skip:', e.message);
  }
}

module.exports = function mountPublic(app, admin, publicLimiter) {

  // GET /api/gpo/public/offer/:token — fournisseur recup details commande
  app.get('/api/gpo/public/offer/:token', publicLimiter, async (req, res) => {
    try {
      const { data: attempt, error } = await admin()
        .from('gpo_request_attempts')
        .select('*, suppliers(*), gpo_requests(*)')
        .eq('response_token', req.params.token)
        .single();

      if (error || !attempt) return res.status(404).json({ error: 'Offre introuvable ou expiree' });

      const request = attempt.gpo_requests;
      const supplier = attempt.suppliers;

      // Verifier si la deadline est passee
      const now = new Date();
      const deadline = new Date(attempt.deadline_at);
      const isExpired = now > deadline && attempt.response_status === 'pending';

      // Green-Test : verifier si c'est la 1ere commande de ce dentiste chez ce fournisseur
      let isGreenTest = false;
      if (request) {
        const { data: history } = await admin()
          .from('supplier_client_history')
          .select('is_first_order_done')
          .eq('supplier_id', supplier.id)
          .eq('societe_id', request.societe_id)
          .maybeSingle();
        isGreenTest = !history || !history.is_first_order_done;
      }

      // NE PAS exposer les infos du dentiste (email, tel, adresse)
      res.json({
        attempt_id: attempt.id,
        response_status: attempt.response_status,
        is_expired: isExpired,
        deadline_at: attempt.deadline_at,
        supplier_name: supplier?.name,
        supplier_status: supplier?.status,
        items: request?.items || [],
        total_target_eur: request?.total_target_eur,
        total_market_eur: request?.total_market_eur,
        savings_eur: request?.savings_eur,
        is_green_test: isGreenTest,
        green_test_discount: isGreenTest ? 0.15 : 0,
        created_at: attempt.created_at
      });
    } catch (e) {
      console.error('[GPO GET /public/offer/:token]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/gpo/public/offer/:token/accept — fournisseur accepte
  app.post('/api/gpo/public/offer/:token/accept', publicLimiter, async (req, res) => {
    try {
      const { data: attempt, error } = await admin()
        .from('gpo_request_attempts')
        .select('*, gpo_requests(*), suppliers(*)')
        .eq('response_token', req.params.token)
        .single();

      if (error || !attempt) return res.status(404).json({ error: 'Offre introuvable' });
      if (attempt.response_status !== 'pending') {
        return res.status(400).json({ error: 'Reponse deja envoyee' });
      }

      const now = new Date().toISOString();
      const request = attempt.gpo_requests;

      // Marquer comme accepte
      await admin()
        .from('gpo_request_attempts')
        .update({ response_status: 'accepted', responded_at: now })
        .eq('id', attempt.id);

      // Calculer final_price_eur proprement
      const finalPrice = request.total_target_eur || computeFinalPrice(request.items);

      // Mettre a jour la request
      await admin()
        .from('gpo_requests')
        .update({
          status: 'accepted',
          winner_supplier_id: attempt.supplier_id,
          final_price_eur: finalPrice,
          matched_at: now
        })
        .eq('id', attempt.request_id);

      // Update stats fournisseur
      const s = attempt.suppliers;
      await admin()
        .from('suppliers')
        .update({ orders_accepted: (s.orders_accepted || 0) + 1, updated_at: now })
        .eq('id', s.id);

      // Update client history
      await admin()
        .from('supplier_client_history')
        .upsert({
          supplier_id: attempt.supplier_id,
          societe_id: request.societe_id,
          first_order_at: now,
          last_order_at: now,
          total_orders: 1,
          total_spent_eur: finalPrice || 0,
          is_first_order_done: true
        }, { onConflict: 'supplier_id,societe_id' });

      // --- NOTIFICATIONS DENTISTE (3 canaux) ---
      const dentist = await getDentistInfo(admin, request.societe_id);
      const supplierName = s?.name || 'Fournisseur';
      const itemsCount = Array.isArray(request.items) ? request.items.length : 0;

      // A) Email
      if (dentist?.email) {
        sendDentistAcceptedEmail({
          dentistEmail: dentist.email,
          supplierName,
          request,
          finalPrice
        }).catch(e => console.error('[GPO] Dentist email error:', e.message));
      }

      // B) Notification in-app
      if (dentist?.user_id) {
        pushGpoNotification(admin, {
          user_id: dentist.user_id,
          societe_id: request.societe_id,
          type: 'gpo_accepted',
          titre: `Commande acceptee par ${supplierName}`,
          message: `Votre commande de ${itemsCount} produit${itemsCount > 1 ? 's' : ''} a ete acceptee au tarif de ${finalPrice ? Number(finalPrice).toFixed(2) + '\u20ac' : 'tarif cible'}.`,
          cta_url: '/index.html',
          entity_id: request.id
        });
      }

      res.json({ success: true, message: 'Commande acceptee', final_price_eur: finalPrice });
    } catch (e) {
      console.error('[GPO POST /accept]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/gpo/public/offer/:token/counter — contre-proposition
  app.post('/api/gpo/public/offer/:token/counter', publicLimiter, async (req, res) => {
    try {
      const { counter_price_eur, comment } = req.body;
      if (!counter_price_eur || counter_price_eur <= 0) {
        return res.status(400).json({ error: 'counter_price_eur requis (> 0)' });
      }

      const { data: attempt, error } = await admin()
        .from('gpo_request_attempts')
        .select('*, gpo_requests(*), suppliers(*)')
        .eq('response_token', req.params.token)
        .single();

      if (error || !attempt) return res.status(404).json({ error: 'Offre introuvable' });
      if (attempt.response_status !== 'pending') {
        return res.status(400).json({ error: 'Reponse deja envoyee' });
      }

      const now = new Date().toISOString();

      // Marquer comme contre-proposition
      await admin()
        .from('gpo_request_attempts')
        .update({
          response_status: 'counter_proposed',
          counter_price_eur,
          counter_comment: comment || null,
          responded_at: now
        })
        .eq('id', attempt.id);

      // La request reste en "searching" — le dentiste doit decider
      await admin()
        .from('gpo_requests')
        .update({ status: 'matched', matched_at: now })
        .eq('id', attempt.request_id);

      // Notifier le dentiste par email
      const request = attempt.gpo_requests;
      const { data: societe } = await admin()
        .from('societes')
        .select('owner_user_id')
        .eq('id', request.societe_id)
        .single();

      if (societe?.owner_user_id) {
        const { data: user } = await admin().auth.admin.getUserById(societe.owner_user_id);
        if (user?.user?.email) {
          sendCounterProposalNotification({
            societeEmail: user.user.email,
            supplierName: attempt.suppliers?.name,
            request,
            counterPrice: counter_price_eur
          }).catch(e => console.error('[GPO] Counter notification error:', e.message));

          // Notification in-app
          pushGpoNotification(admin, {
            user_id: user.user.id,
            societe_id: request.societe_id,
            type: 'gpo_counter',
            titre: `Contre-proposition de ${attempt.suppliers?.name || 'Fournisseur'}`,
            message: `${Number(counter_price_eur).toFixed(2)}\u20ac au lieu de ${request.total_target_eur ? Number(request.total_target_eur).toFixed(2) + '\u20ac' : 'tarif cible'}. Accepter ou passer au suivant ?`,
            cta_url: '/index.html',
            entity_id: request.id
          });
        }
      }

      res.json({ success: true, message: 'Contre-proposition envoyee' });
    } catch (e) {
      console.error('[GPO POST /counter]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/gpo/public/offer/:token/refuse — fournisseur refuse
  app.post('/api/gpo/public/offer/:token/refuse', publicLimiter, async (req, res) => {
    try {
      const { data: attempt, error } = await admin()
        .from('gpo_request_attempts')
        .select('*, suppliers(*)')
        .eq('response_token', req.params.token)
        .single();

      if (error || !attempt) return res.status(404).json({ error: 'Offre introuvable' });
      if (attempt.response_status !== 'pending') {
        return res.status(400).json({ error: 'Reponse deja envoyee' });
      }

      const now = new Date().toISOString();

      await admin()
        .from('gpo_request_attempts')
        .update({ response_status: 'refused', responded_at: now })
        .eq('id', attempt.id);

      // Update stats
      const s = attempt.suppliers;
      await admin()
        .from('suppliers')
        .update({ orders_refused: (s.orders_refused || 0) + 1, updated_at: now })
        .eq('id', s.id);

      // Escalader au suivant (import dynamique pour eviter circular)
      const { escalateToNextSupplier } = require('../../lib/gpo-scheduler');
      await escalateToNextSupplier(attempt.request_id);

      res.json({ success: true, message: 'Offre refusee, passage au fournisseur suivant' });
    } catch (e) {
      console.error('[GPO POST /refuse]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/gpo/public/offer/:token/signup-extra — mini-signup fournisseur
  app.post('/api/gpo/public/offer/:token/signup-extra', publicLimiter, async (req, res) => {
    try {
      const { email, phone, company_name } = req.body;

      const { data: attempt } = await admin()
        .from('gpo_request_attempts')
        .select('supplier_id')
        .eq('response_token', req.params.token)
        .single();

      if (!attempt) return res.status(404).json({ error: 'Token invalide' });

      const updates = { status: 'active', updated_at: new Date().toISOString() };
      if (email) updates.email = email;
      if (phone) updates.phone = phone;
      if (company_name) updates.name = company_name;

      await admin()
        .from('suppliers')
        .update(updates)
        .eq('id', attempt.supplier_id);

      res.json({ success: true, message: 'Compte active' });
    } catch (e) {
      console.error('[GPO POST /signup-extra]', e.message);
      res.status(500).json({ error: e.message });
    }
  });
};
