// =============================================
// JADOMI — Multi-sociétés : Catalogue global / Comparateur / Veille
// Routes /api/catalogue/*
// Dépend de sql/08_catalogue_global.sql
// =============================================
const express = require('express');
const { admin, authSupabase, requireSociete } = require('./middleware');

// Anonymise la liste des fournisseurs concurrents (masque tout sauf ma société).
// Conserve les ids stables pour qu'un même concurrent garde la même étiquette
// dans tous les tableaux d'une réponse donnée.
function anonymiseFournisseurs(rows, maSocieteId) {
  const label = new Map();
  let i = 0;
  for (const r of rows) {
    if (r.societe_id === maSocieteId) continue;
    if (!label.has(r.societe_id)) {
      label.set(r.societe_id, `Concurrent ${String.fromCharCode(65 + (i++ % 26))}`);
    }
  }
  return rows.map(r => ({
    ...r,
    societe_label: r.societe_id === maSocieteId
      ? 'Moi'
      : (label.get(r.societe_id) || 'Concurrent ?'),
    is_me: r.societe_id === maSocieteId
  }));
}

module.exports = function mountCatalogue(app) {
  const router = express.Router();
  router.use(authSupabase());

  // ---------- Recherche produit catalogue global (par EAN ou nom) ----------
  // GET /api/catalogue/search?q=...&ean=...
  router.get('/search', async (req, res) => {
    try {
      const ean = req.query.ean ? String(req.query.ean).trim() : null;
      const q   = req.query.q   ? String(req.query.q).trim()   : null;
      let qb = admin().from('produits_catalogue_global')
        .select('id, ean, designation_generique, categorie, secteur, image_url, nb_fournisseurs, prix_min_ht, prix_moyen_ht, prix_max_ht')
        .order('nb_fournisseurs', { ascending: false })
        .limit(50);
      if (ean) qb = qb.eq('ean', ean);
      else if (q) qb = qb.ilike('designation_generique', `%${q}%`);
      const { data, error } = await qb;
      if (error) throw error;
      res.json({ success: true, produits: data || [] });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ---------- Résumé comparateur pour un produit société donné ----------
  // GET /api/catalogue/resume/:produitSocieteId
  // Retourne { produit_global, nb_fournisseurs, prix_min, prix_moyen }
  // -> pratique pour afficher un badge en face d'un produit stock.
  router.get('/resume/:produitSocieteId', async (req, res) => {
    try {
      const { data: prod } = await admin().from('produits_societe')
        .select('code_barre').eq('id', req.params.produitSocieteId).maybeSingle();
      if (!prod?.code_barre) return res.json({ success: true, found: false });
      const { data: g } = await admin().from('produits_catalogue_global')
        .select('id, ean, designation_generique, nb_fournisseurs, prix_min_ht, prix_moyen_ht, prix_max_ht')
        .eq('ean', prod.code_barre).maybeSingle();
      if (!g) return res.json({ success: true, found: false });
      res.json({ success: true, found: true, produit: g });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ---------- Comparateur — côté ACHETEUR (dentiste) ----------
  // GET /api/catalogue/comparateur/:ean
  // Noms des fournisseurs VISIBLES : le fournisseur a accepté en rejoignant JADOMI.
  router.get('/comparateur/:ean', async (req, res) => {
    try {
      const ean = String(req.params.ean).trim();
      const { data: g } = await admin().from('produits_catalogue_global')
        .select('*').eq('ean', ean).maybeSingle();
      if (!g) return res.status(404).json({ error: 'produit_inconnu' });

      const { data: rows, error } = await admin()
        .from('prix_fournisseurs')
        .select('id, societe_id, prix_ht, taux_tva, unite, disponible, date_maj, societe:societe_id(id, nom, type)')
        .eq('produit_global_id', g.id)
        .eq('disponible', true)
        .order('prix_ht', { ascending: true });
      if (error) throw error;

      const fournisseurs = (rows || []).map((r, i) => ({
        rang: i + 1,
        societe_id: r.societe_id,
        societe_nom: r.societe?.nom || 'Fournisseur',
        prix_ht: Number(r.prix_ht),
        taux_tva: Number(r.taux_tva),
        unite: r.unite,
        date_maj: r.date_maj
      }));

      const economie = fournisseurs.length
        ? +(fournisseurs[fournisseurs.length - 1].prix_ht - fournisseurs[0].prix_ht).toFixed(2)
        : 0;

      res.json({
        success: true,
        produit: g,
        fournisseurs,
        stats: {
          nb: fournisseurs.length,
          prix_min: g.prix_min_ht, prix_moyen: g.prix_moyen_ht, prix_max: g.prix_max_ht,
          economie_max: economie
        }
      });
    } catch (e) {
      console.error('[catalogue/comparateur]', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ---------- Veille marché — côté FOURNISSEUR ----------
  // GET /api/catalogue/veille  (header X-Societe-Id)
  // Liste les produits de MA société avec position marché (concurrents anonymisés).
  router.get('/veille', requireSociete(), async (req, res) => {
    try {
      const societeId = req.societe.id;

      // 1) Mes prix actifs
      const { data: mesPrix, error: e1 } = await admin()
        .from('prix_fournisseurs')
        .select('id, produit_global_id, prix_ht, taux_tva, unite, date_maj, disponible, produit:produit_global_id(id, ean, designation_generique, categorie, secteur, nb_fournisseurs, prix_min_ht, prix_moyen_ht, prix_max_ht)')
        .eq('societe_id', societeId)
        .eq('disponible', true);
      if (e1) throw e1;

      const rows = (mesPrix || []).map(p => {
        const moyen = Number(p.produit?.prix_moyen_ht || 0);
        const min   = Number(p.produit?.prix_min_ht   || 0);
        const mon   = Number(p.prix_ht);
        let position = 'inconnu';
        let ecart_pct = null;
        if (moyen > 0) {
          ecart_pct = +(((mon - moyen) / moyen) * 100).toFixed(1);
          if (mon < moyen) position = 'sous_marche';
          else if (mon > moyen) position = 'sur_marche';
          else position = 'aligne';
        }
        return {
          prix_fournisseur_id: p.id,
          produit_id: p.produit?.id,
          ean: p.produit?.ean,
          designation: p.produit?.designation_generique,
          categorie: p.produit?.categorie,
          secteur: p.produit?.secteur,
          mon_prix_ht: mon,
          prix_moyen_ht: moyen,
          prix_min_ht: min,
          prix_max_ht: Number(p.produit?.prix_max_ht || 0),
          nb_fournisseurs: p.produit?.nb_fournisseurs || 0,
          position,
          ecart_pct,
          suis_je_le_moins_cher: min > 0 && mon <= min,
          date_maj: p.date_maj
        };
      });

      res.json({ success: true, produits: rows });
    } catch (e) {
      console.error('[catalogue/veille]', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ---------- Détail veille pour un produit : concurrents anonymisés ----------
  // GET /api/catalogue/veille/:produitId
  router.get('/veille/:produitId', requireSociete(), async (req, res) => {
    try {
      const { data: rows, error } = await admin()
        .from('prix_fournisseurs')
        .select('id, societe_id, prix_ht, taux_tva, unite, date_maj')
        .eq('produit_global_id', req.params.produitId)
        .eq('disponible', true)
        .order('prix_ht', { ascending: true });
      if (error) throw error;
      const anon = anonymiseFournisseurs(rows || [], req.societe.id);
      res.json({ success: true, fournisseurs: anon });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ---------- Historique prix pour un produit (toutes sociétés, anonymisé) ----------
  // GET /api/catalogue/historique/:produitId?range=3m|6m|12m
  router.get('/historique/:produitId', requireSociete(), async (req, res) => {
    try {
      const range = String(req.query.range || '6m');
      const months = ({ '3m': 3, '6m': 6, '12m': 12 })[range] || 6;
      const since = new Date(Date.now() - months * 30 * 24 * 3600 * 1000).toISOString();
      const { data, error } = await admin()
        .from('historique_prix')
        .select('societe_id, prix_ht, date_prix')
        .eq('produit_global_id', req.params.produitId)
        .gte('date_prix', since)
        .order('date_prix', { ascending: true });
      if (error) throw error;
      const anon = anonymiseFournisseurs(data || [], req.societe.id);
      res.json({ success: true, points: anon });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ---------- Deals : produits avec plus gros écart vs moyenne marché ----------
  // GET /api/catalogue/deals?limit=6
  router.get('/deals', async (req, res) => {
    try {
      const limit = Math.min(50, parseInt(req.query.limit || '6', 10) || 6);
      // Prends les prix_fournisseurs dispo avec un prix moyen calculé et un ratio < 1
      const { data: prix } = await admin().from('prix_fournisseurs')
        .select('produit_global_id, societe_id, prix_ht, disponible')
        .eq('disponible', true);
      const { data: globals } = await admin().from('produits_catalogue_global')
        .select('id, designation, ean, prix_moyen_ht')
        .gt('prix_moyen_ht', 0);
      const mapGlobal = new Map((globals || []).map(g => [g.id, g]));
      const deals = [];
      for (const p of prix || []) {
        const g = mapGlobal.get(p.produit_global_id);
        if (!g || !g.prix_moyen_ht) continue;
        const ratio = p.prix_ht / g.prix_moyen_ht;
        if (ratio >= 0.85) continue;  // pas un deal
        deals.push({
          produit_global_id: g.id,
          designation: g.designation,
          ean: g.ean,
          fournisseur_label: 'Fournisseur ' + String(p.societe_id).slice(0, 4).toUpperCase(),
          prix_ht: Number(p.prix_ht),
          prix_moyen_ht: Number(g.prix_moyen_ht)
        });
      }
      deals.sort((a, b) => (a.prix_ht / a.prix_moyen_ht) - (b.prix_ht / b.prix_moyen_ht));
      res.json({ success: true, deals: deals.slice(0, limit) });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ---------- Surpayeur : produits d'une société achetés au-dessus de la moyenne ----------
  // GET /api/catalogue/surpayeur?limit=5 — pour la société de l'user (via header X-Societe-Id ou fallback première)
  router.get('/surpayeur', async (req, res) => {
    try {
      const limit = Math.min(50, parseInt(req.query.limit || '5', 10) || 5);
      // Détermine la société : header prioritaire, sinon première société du user
      let societeId = req.headers['x-societe-id'] || null;
      if (!societeId && req.user?.id) {
        const { data: role } = await admin().from('user_societe_roles')
          .select('societe_id').eq('user_id', req.user.id).limit(1).maybeSingle();
        societeId = role?.societe_id || null;
      }
      if (!societeId) return res.json({ success: true, produits: [] });

      // Prix payés par cette société
      const { data: prix } = await admin().from('prix_fournisseurs')
        .select('produit_global_id, prix_ht')
        .eq('societe_id', societeId).eq('disponible', true);
      if (!prix || !prix.length) return res.json({ success: true, produits: [] });

      const ids = prix.map(p => p.produit_global_id);
      const { data: globals } = await admin().from('produits_catalogue_global')
        .select('id, designation, prix_moyen_ht')
        .in('id', ids).gt('prix_moyen_ht', 0);
      const mapGlobal = new Map((globals || []).map(g => [g.id, g]));

      const surpayeur = [];
      for (const p of prix) {
        const g = mapGlobal.get(p.produit_global_id);
        if (!g) continue;
        const ratio = p.prix_ht / g.prix_moyen_ht;
        if (ratio <= 1.05) continue;  // pas surpayé
        surpayeur.push({
          designation: g.designation,
          prix_ht: Number(p.prix_ht),
          prix_moyen_ht: Number(g.prix_moyen_ht)
        });
      }
      surpayeur.sort((a, b) => (b.prix_ht / b.prix_moyen_ht) - (a.prix_ht / a.prix_moyen_ht));
      res.json({ success: true, produits: surpayeur.slice(0, limit) });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.use('/api/catalogue', router);
  console.log('[JADOMI] Routes /api/catalogue montées');
};
