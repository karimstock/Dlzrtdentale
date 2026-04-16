// =============================================
// JADOMI — Marketplace occasion
// /api/commerce/market/* — CRUD annonces + achat/réservation
// =============================================
const express = require('express');
const { admin, authSupabase, requireSociete, auditLog } = require('./middleware');
let pushNotif = () => null;
try { pushNotif = require('./notifications').pushNotification; } catch {}

const COMMISSION_DEFAUT = 8; // %

function calcNet(prix, commission_pct, transport) {
  const p = Number(prix || 0);
  const c = p * (Number(commission_pct || COMMISSION_DEFAUT) / 100);
  return +(p - c - Number(transport || 0)).toFixed(2);
}

module.exports = function mountMarket(app) {
  const router = express.Router();
  router.use(authSupabase());

  // Liste publique (tous pros connectés). Filtres : categorie, statut (par défaut actives)
  router.get('/', async (req, res) => {
    try {
      const categorie = req.query.categorie || null;
      const mineOnly = req.query.mine === '1';
      let qb = admin().from('annonces_market').select('*, vendeur:vendeur_societe_id(id,nom,logo_url)')
        .order('created_at', { ascending: false });
      if (mineOnly) {
        // Limite aux annonces des sociétés de l'user
        const { data: roles } = await admin().from('user_societe_roles')
          .select('societe_id').eq('user_id', req.user.id);
        const ids = (roles || []).map(r => r.societe_id);
        if (!ids.length) return res.json({ success: true, annonces: [] });
        qb = qb.in('vendeur_societe_id', ids);
      } else {
        qb = qb.in('statut', ['active','reservee','vendue']);
      }
      if (categorie) qb = qb.eq('categorie', categorie);
      const { data, error } = await qb.limit(200);
      if (error) throw error;
      res.json({ success: true, annonces: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Créer une annonce
  router.post('/', requireSociete(), async (req, res) => {
    try {
      const b = req.body || {};
      if (!b.designation || !b.etat || !b.prix_vente) {
        return res.status(400).json({ error: 'designation_etat_prix_requis' });
      }
      const prix = Number(b.prix_vente);
      if (prix < 20) return res.status(400).json({ error: 'prix_min_20_eur' });

      const payload = {
        vendeur_societe_id: req.societe.id,
        vendeur_user_id: req.user.id,
        produit_id: b.produit_id || null,
        designation: b.designation,
        description: b.description || null,
        reference: b.reference || null,
        ean: b.ean || null,
        categorie: b.categorie || 'sante',
        etat: b.etat,
        photo_urls: Array.isArray(b.photo_urls) ? b.photo_urls : [],
        quantite: Math.max(1, Number(b.quantite || 1)),
        prix_neuf_indicatif: b.prix_neuf_indicatif ? Number(b.prix_neuf_indicatif) : null,
        prix_vente: prix,
        commission_pct: Number(b.commission_pct || COMMISSION_DEFAUT),
        cout_transport_estime: b.cout_transport_estime ? Number(b.cout_transport_estime) : null,
        statut: b.statut === 'brouillon' ? 'brouillon' : 'active'
      };
      const { data, error } = await admin().from('annonces_market')
        .insert(payload).select('*').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'create_annonce_market', entity: 'annonce_market', entityId: data.id, req });
      res.json({ success: true, annonce: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // Maj annonce (vendeur)
  router.patch('/:id', requireSociete(), async (req, res) => {
    try {
      const { data: a } = await admin().from('annonces_market').select('*')
        .eq('id', req.params.id).single();
      if (!a) return res.status(404).json({ error: 'not_found' });
      if (a.vendeur_societe_id !== req.societe.id) return res.status(403).json({ error: 'forbidden' });
      if (a.statut === 'vendue') return res.status(403).json({ error: 'vendue_immuable' });

      const allowed = ['designation','description','reference','ean','categorie','etat','photo_urls','quantite','prix_neuf_indicatif','prix_vente','cout_transport_estime','statut'];
      const patch = {};
      for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
      const { data, error } = await admin().from('annonces_market').update(patch)
        .eq('id', a.id).select('*').single();
      if (error) throw error;
      res.json({ success: true, annonce: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // Supprimer (seulement si brouillon)
  router.delete('/:id', requireSociete(), async (req, res) => {
    try {
      const { data: a } = await admin().from('annonces_market').select('*')
        .eq('id', req.params.id).single();
      if (!a || a.vendeur_societe_id !== req.societe.id) return res.status(403).json({ error: 'forbidden' });
      if (a.statut !== 'brouillon' && a.statut !== 'retiree') {
        return res.status(403).json({ error: 'annonce_active_non_supprimable' });
      }
      await admin().from('annonces_market').delete().eq('id', a.id);
      res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // Simulation net vendeur
  router.post('/simulation', async (req, res) => {
    const { prix_vente, commission_pct, cout_transport_estime } = req.body || {};
    res.json({
      success: true,
      prix_brut: Number(prix_vente || 0),
      commission_pct: Number(commission_pct || COMMISSION_DEFAUT),
      transport: Number(cout_transport_estime || 0),
      net_vendeur: calcNet(prix_vente, commission_pct, cout_transport_estime)
    });
  });

  // Réserver (achat) — V1 simplifiée : marque comme réservée, le paiement Stripe se fait ailleurs
  router.post('/:id/reserver', requireSociete(), async (req, res) => {
    try {
      const { data: a } = await admin().from('annonces_market').select('*')
        .eq('id', req.params.id).single();
      if (!a) return res.status(404).json({ error: 'not_found' });
      if (a.statut !== 'active') return res.status(409).json({ error: 'annonce_indisponible' });
      if (a.vendeur_societe_id === req.societe.id) return res.status(400).json({ error: 'cannot_buy_own' });

      const { data, error } = await admin().from('annonces_market').update({
        statut: 'reservee',
        acheteur_societe_id: req.societe.id
      }).eq('id', a.id).select('*').single();
      if (error) throw error;

      // Notifier vendeur
      try {
        const { data: members } = await admin().from('user_societe_roles')
          .select('user_id').eq('societe_id', a.vendeur_societe_id)
          .in('role', ['proprietaire','associe']);
        for (const m of members || []) {
          await pushNotif({
            user_id: m.user_id, societe_id: a.vendeur_societe_id,
            type: 'produit_vendu', urgence: 'haute',
            titre: `Votre annonce "${a.designation}" est réservée`,
            message: `Réservée à ${Number(a.prix_vente).toFixed(2)} €`,
            entity_type: 'annonce_market', entity_id: a.id,
            cta_label: 'Contacter l’acheteur', cta_url: '/commerce.html?tab=market'
          });
        }
      } catch (_) {}

      res.json({ success: true, annonce: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // Confirmer vente (vendeur ou acheteur après réception)
  router.post('/:id/confirmer-vente', requireSociete(), async (req, res) => {
    try {
      const { data: a } = await admin().from('annonces_market').select('*')
        .eq('id', req.params.id).single();
      if (!a) return res.status(404).json({ error: 'not_found' });
      if (a.vendeur_societe_id !== req.societe.id && a.acheteur_societe_id !== req.societe.id) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const { data } = await admin().from('annonces_market').update({
        statut: 'vendue',
        vendue_at: new Date().toISOString()
      }).eq('id', a.id).select('*').single();
      res.json({ success: true, annonce: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // Notation
  router.post('/:id/note', requireSociete(), async (req, res) => {
    try {
      const { note_vendeur, note_acheteur } = req.body || {};
      const { data: a } = await admin().from('annonces_market').select('*')
        .eq('id', req.params.id).single();
      if (!a || a.statut !== 'vendue') return res.status(400).json({ error: 'annonce_non_vendue' });
      const patch = {};
      if (note_vendeur && a.acheteur_societe_id === req.societe.id) patch.note_vendeur = Number(note_vendeur);
      if (note_acheteur && a.vendeur_societe_id === req.societe.id) patch.note_acheteur = Number(note_acheteur);
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'note_invalide' });
      const { data } = await admin().from('annonces_market').update(patch)
        .eq('id', a.id).select('*').single();
      res.json({ success: true, annonce: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  app.use('/api/commerce/market', router);
  console.log('[JADOMI] Routes /api/commerce/market montées');
};
