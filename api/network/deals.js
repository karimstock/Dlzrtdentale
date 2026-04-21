// =============================================
// JADOMI — Deals : offres promotionnelles réseau
// Routes publiques + authentifiées /api/network/deals/*
// =============================================
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vsbomwjzehnfinfjvhqp.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_RcfR0_sq5Z-oWK97ij27Yw_tGfur7UF';

let _sb = null;
function sb() {
  if (!_sb) _sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  return _sb;
}

// ---- Routes publiques ----
function publicRoutes(router) {

  // GET /public → list active deals
  router.get('/public', async (req, res) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { categorie } = req.query;

      let query = sb()
        .from('network_deals')
        .select('*')
        .eq('actif', true)
        .gte('date_fin', today)
        .order('created_at', { ascending: false });

      if (categorie) {
        query = query.eq('categorie', categorie);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Filter by max_utilisations on server side
      const deals = (data || []).filter(d => {
        if (d.max_utilisations == null) return true;
        return (d.nb_utilisations || 0) < d.max_utilisations;
      });

      res.json({ ok: true, count: deals.length, deals });
    } catch (e) {
      console.error('[deals/public]', e.message);
      res.status(500).json({ error: 'deals_public_error', message: e.message });
    }
  });
}

// ---- Routes authentifiées ----
function authRoutes(router) {

  // GET /deals/mes-deals
  router.get('/deals/mes-deals', requireSociete(), async (req, res) => {
    try {
      const societeId = req.societe.id;

      const { data, error } = await admin()
        .from('network_deals')
        .select('*')
        .eq('societe_id', societeId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      res.json({ ok: true, deals: data || [] });
    } catch (e) {
      console.error('[deals/mes-deals]', e.message);
      res.status(500).json({ error: 'mes_deals_error', message: e.message });
    }
  });

  // POST /deals
  router.post('/deals', requireSociete(), async (req, res) => {
    try {
      const societeId = req.societe.id;
      const userId = req.user.id;
      const { titre, description, remise_pct, categorie, photo, date_debut, date_fin, max_utilisations, conditions } = req.body;

      if (!titre || !date_fin) {
        return res.status(400).json({ error: 'missing_fields', message: 'titre et date_fin requis' });
      }

      const { data, error } = await admin()
        .from('network_deals')
        .insert({
          societe_id: societeId,
          user_id: userId,
          titre,
          description: description || null,
          remise_pct: remise_pct ? parseFloat(remise_pct) : null,
          categorie: categorie || null,
          photo: photo || null,
          date_debut: date_debut || new Date().toISOString().slice(0, 10),
          date_fin,
          max_utilisations: max_utilisations ? parseInt(max_utilisations) : null,
          nb_utilisations: 0,
          conditions: conditions || null,
          actif: true,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      await auditLog({
        userId, societeId, action: 'deal_created',
        entity: 'network_deals', entityId: data.id, req
      });

      res.status(201).json({ ok: true, deal: data });
    } catch (e) {
      console.error('[deals/create]', e.message);
      res.status(500).json({ error: 'deal_create_error', message: e.message });
    }
  });

  // PATCH /deals/:id
  router.patch('/deals/:id', requireSociete(), async (req, res) => {
    try {
      const dealId = req.params.id;
      const societeId = req.societe.id;
      const { titre, description, remise_pct, categorie, photo, date_debut, date_fin, max_utilisations, conditions } = req.body;

      // Verify ownership
      const { data: existing, error: existErr } = await admin()
        .from('network_deals')
        .select('id, societe_id')
        .eq('id', dealId)
        .maybeSingle();

      if (existErr) throw existErr;
      if (!existing) return res.status(404).json({ error: 'deal_not_found' });
      if (existing.societe_id !== societeId) return res.status(403).json({ error: 'forbidden' });

      const updates = {};
      if (titre !== undefined) updates.titre = titre;
      if (description !== undefined) updates.description = description;
      if (remise_pct !== undefined) updates.remise_pct = parseFloat(remise_pct);
      if (categorie !== undefined) updates.categorie = categorie;
      if (photo !== undefined) updates.photo = photo;
      if (date_debut !== undefined) updates.date_debut = date_debut;
      if (date_fin !== undefined) updates.date_fin = date_fin;
      if (max_utilisations !== undefined) updates.max_utilisations = parseInt(max_utilisations);
      if (conditions !== undefined) updates.conditions = conditions;
      updates.updated_at = new Date().toISOString();

      const { data, error } = await admin()
        .from('network_deals')
        .update(updates)
        .eq('id', dealId)
        .select()
        .single();

      if (error) throw error;

      await auditLog({
        userId: req.user.id, societeId, action: 'deal_updated',
        entity: 'network_deals', entityId: dealId, req
      });

      res.json({ ok: true, deal: data });
    } catch (e) {
      console.error('[deals/update]', e.message);
      res.status(500).json({ error: 'deal_update_error', message: e.message });
    }
  });

  // DELETE /deals/:id (soft delete)
  router.delete('/deals/:id', requireSociete(), async (req, res) => {
    try {
      const dealId = req.params.id;
      const societeId = req.societe.id;

      // Verify ownership
      const { data: existing, error: existErr } = await admin()
        .from('network_deals')
        .select('id, societe_id')
        .eq('id', dealId)
        .maybeSingle();

      if (existErr) throw existErr;
      if (!existing) return res.status(404).json({ error: 'deal_not_found' });
      if (existing.societe_id !== societeId) return res.status(403).json({ error: 'forbidden' });

      const { error } = await admin()
        .from('network_deals')
        .update({ actif: false, updated_at: new Date().toISOString() })
        .eq('id', dealId);

      if (error) throw error;

      await auditLog({
        userId: req.user.id, societeId, action: 'deal_deactivated',
        entity: 'network_deals', entityId: dealId, req
      });

      res.json({ ok: true, message: 'Deal désactivé' });
    } catch (e) {
      console.error('[deals/delete]', e.message);
      res.status(500).json({ error: 'deal_delete_error', message: e.message });
    }
  });

  // POST /deals/:id/utiliser
  router.post('/deals/:id/utiliser', async (req, res) => {
    try {
      const dealId = req.params.id;
      const userId = req.user.id;

      // Get the deal
      const { data: deal, error: dealErr } = await admin()
        .from('network_deals')
        .select('*')
        .eq('id', dealId)
        .eq('actif', true)
        .maybeSingle();

      if (dealErr) throw dealErr;
      if (!deal) return res.status(404).json({ error: 'deal_not_found' });

      // Check expiry
      const today = new Date().toISOString().slice(0, 10);
      if (deal.date_fin < today) {
        return res.status(400).json({ error: 'deal_expired' });
      }

      // Check max_utilisations
      if (deal.max_utilisations != null && (deal.nb_utilisations || 0) >= deal.max_utilisations) {
        return res.status(400).json({ error: 'deal_max_reached' });
      }

      // Check unique user (user hasn't already used this deal)
      const { data: existing, error: existErr } = await admin()
        .from('network_deals_utilisations')
        .select('id')
        .eq('deal_id', dealId)
        .eq('user_id', userId)
        .maybeSingle();

      if (existErr) throw existErr;
      if (existing) {
        return res.status(400).json({ error: 'deal_already_used' });
      }

      // Record utilisation
      const { data: utilisation, error: utilErr } = await admin()
        .from('network_deals_utilisations')
        .insert({
          deal_id: dealId,
          user_id: userId,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (utilErr) throw utilErr;

      // Increment counter
      await admin()
        .from('network_deals')
        .update({ nb_utilisations: (deal.nb_utilisations || 0) + 1 })
        .eq('id', dealId);

      await auditLog({
        userId, societeId: deal.societe_id, action: 'deal_used',
        entity: 'network_deals', entityId: dealId, req
      });

      res.json({ ok: true, utilisation });
    } catch (e) {
      console.error('[deals/utiliser]', e.message);
      res.status(500).json({ error: 'deal_use_error', message: e.message });
    }
  });
}

module.exports = { publicRoutes, authRoutes };
