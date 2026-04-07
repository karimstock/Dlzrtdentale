// =============================================================
// JADOMI — Routes prothesistes
// =============================================================
//  - Recherche anonymisée (jadomi_id, ville, niveau, note, label)
//  - Catalogue tarifs personnel
//  - Stock matériaux
//  - Commandes reçues
//  - Factures
//  - Notifications (upgrade + nouvelles commandes)
//  - Onboarding tarifs JADOMI obligatoire
// =============================================================

const express = require('express');
const crypto = require('crypto');

function createProthesistesRouter(supabase) {
  const router = express.Router();

  // ---------- Helpers ----------
  function publicProth(p) {
    if (!p) return p;
    return {
      id: p.id,
      jadomi_id: p.jadomi_id || ('JADOMI-' + String(p.id).padStart(8, '0')),
      ville: p.ville,
      cp: p.code_postal || p.cp,
      label: p.label || 'made_in_france',
      niveau: p.niveau || 'standard',
      note_moyenne: parseFloat(p.note_moyenne) || 0,
      nombre_avis: p.nombre_avis || 0,
      nombre_travaux: p.nombre_travaux || p.nb_rush_realises || 0,
      specialites: p.specialites || [],
    };
  }

  function genererJadomiId() {
    return 'JADOMI-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  // ---------- GET /api/prothesistes/recherche ----------
  router.get('/recherche', async (req, res) => {
    try {
      const { specialite, label, niveau, ville, note_min } = req.query;
      let q = supabase.from('prothesistes').select('*').eq('actif', true).limit(100);
      if (label) q = q.eq('label', label);
      if (niveau) q = q.eq('niveau', niveau);
      if (ville) q = q.ilike('ville', `%${ville}%`);
      if (note_min) q = q.gte('note_moyenne', parseFloat(note_min));

      const { data, error } = await q;
      if (error) {
        if (/does not exist|relation|column/i.test(error.message || '')) {
          return res.json({ success: true, prothesistes: [], warning: 'Schéma incomplet — exécutez sql/schema_complet.sql' });
        }
        throw error;
      }
      let liste = (data || []).map(publicProth);
      if (specialite) {
        liste = liste.filter(p => Array.isArray(p.specialites) && p.specialites.some(s => String(s).toLowerCase().includes(String(specialite).toLowerCase())));
      }
      // Tri : expert d'abord, puis note
      const ordreNiveau = { expert: 0, confirme: 1, standard: 2 };
      liste.sort((a, b) => (ordreNiveau[a.niveau] - ordreNiveau[b.niveau]) || (b.note_moyenne - a.note_moyenne));
      res.json({ success: true, prothesistes: liste });
    } catch (err) {
      console.error('[/api/prothesistes/recherche]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- GET /api/prothesistes/profil/:jadomi_id ----------
  router.get('/profil/:jadomi_id', async (req, res) => {
    try {
      const { jadomi_id } = req.params;
      const { data, error } = await supabase.from('prothesistes').select('*').eq('jadomi_id', jadomi_id).maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Prothésiste introuvable' });
      res.json({ success: true, prothesiste: publicProth(data) });
    } catch (err) {
      console.error('[/api/prothesistes/profil]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- GET /api/prothesistes/me ----------
  // Récupère le profil privé du prothésiste (lecture par id ou pseudo).
  router.get('/me', async (req, res) => {
    try {
      const { id, pseudo } = req.query;
      let q = supabase.from('prothesistes').select('*');
      if (id) q = q.eq('id', id);
      else if (pseudo) q = q.eq('pseudo_anonyme', pseudo);
      else return res.status(400).json({ error: 'id ou pseudo requis' });
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Prothésiste introuvable' });
      // Génère un jadomi_id si absent
      if (!data.jadomi_id) {
        const newId = genererJadomiId();
        try { await supabase.from('prothesistes').update({ jadomi_id: newId }).eq('id', data.id); } catch(e){}
        data.jadomi_id = newId;
      }
      res.json({ success: true, prothesiste: data });
    } catch (err) {
      console.error('[/api/prothesistes/me]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- POST /api/prothesistes/accepter-tarifs ----------
  router.post('/accepter-tarifs', async (req, res) => {
    try {
      const { prothesiste_id } = req.body;
      if (!prothesiste_id) return res.status(400).json({ error: 'prothesiste_id requis' });
      const { data, error } = await supabase.from('prothesistes').update({
        tarifs_acceptes: true,
        tarifs_acceptes_at: new Date().toISOString(),
      }).eq('id', prothesiste_id).select();
      if (error) throw error;
      res.json({ success: true, prothesiste: data?.[0] });
    } catch (err) {
      console.error('[/api/prothesistes/accepter-tarifs]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- GET /api/prothesistes/catalogue-tarifs ----------
  router.get('/catalogue-tarifs', async (req, res) => {
    try {
      const { prothesiste_id } = req.query;
      // Charge le catalogue de référence JADOMI
      const { data: refs, error: errRefs } = await supabase.from('travaux_catalogue').select('*').order('id');
      if (errRefs) {
        if (/does not exist|relation/i.test(errRefs.message || '')) {
          return res.json({ success: true, catalogue: [], tarifs: [], warning: 'Exécutez sql/schema_complet.sql' });
        }
        throw errRefs;
      }
      // Charge les tarifs personnels
      let tarifs = [];
      if (prothesiste_id) {
        const { data: t } = await supabase.from('catalogue_tarifs_prothesiste').select('*').eq('prothesiste_id', prothesiste_id);
        tarifs = t || [];
      }
      const tarifMap = {};
      tarifs.forEach(t => { tarifMap[t.travail_id] = t; });
      const fusion = (refs || []).map(r => ({
        travail_id: r.id,
        categorie: r.categorie,
        nom: r.nom,
        tarif_min: parseFloat(r.tarif_min),
        tarif_max: parseFloat(r.tarif_max),
        tarif_reference: parseFloat(r.tarif_reference),
        delai_jours_standard: r.delai_jours_standard,
        delai_jours_expert: r.delai_jours_expert,
        tarif_propose: tarifMap[r.id]?.tarif_propose || null,
      }));
      res.json({ success: true, catalogue: fusion });
    } catch (err) {
      console.error('[/api/prothesistes/catalogue-tarifs GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- PUT /api/prothesistes/catalogue-tarifs ----------
  router.put('/catalogue-tarifs', async (req, res) => {
    try {
      const { prothesiste_id, tarifs } = req.body;
      if (!prothesiste_id || !Array.isArray(tarifs)) {
        return res.status(400).json({ error: 'prothesiste_id et tarifs[] requis' });
      }
      let upserted = 0;
      for (const t of tarifs) {
        if (!t.travail_id || t.tarif_propose == null) continue;
        const record = {
          prothesiste_id,
          travail_id: parseInt(t.travail_id),
          tarif_propose: parseFloat(t.tarif_propose),
          actif: true,
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from('catalogue_tarifs_prothesiste')
          .upsert(record, { onConflict: 'prothesiste_id,travail_id' });
        if (!error) upserted++;
      }
      res.json({ success: true, upserted });
    } catch (err) {
      console.error('[/api/prothesistes/catalogue-tarifs PUT]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- GET /api/prothesistes/stock ----------
  router.get('/stock', async (req, res) => {
    try {
      const { prothesiste_id } = req.query;
      if (!prothesiste_id) return res.status(400).json({ error: 'prothesiste_id requis' });
      const { data, error } = await supabase.from('stock_materiaux').select('*').eq('prothesiste_id', prothesiste_id).order('id', { ascending: false });
      if (error) {
        if (/does not exist|relation/i.test(error.message || '')) return res.json({ success: true, stock: [] });
        throw error;
      }
      res.json({ success: true, stock: data || [] });
    } catch (err) {
      console.error('[/api/prothesistes/stock GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/stock', async (req, res) => {
    try {
      const { prothesiste_id, nom, categorie, quantite, unite, seuil_alerte, fournisseur } = req.body;
      if (!prothesiste_id || !nom) return res.status(400).json({ error: 'prothesiste_id et nom requis' });
      const record = {
        prothesiste_id, nom, categorie: categorie || 'autre',
        quantite: parseFloat(quantite) || 0,
        unite: unite || 'unite',
        seuil_alerte: parseFloat(seuil_alerte) || 1,
        fournisseur: fournisseur || null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from('stock_materiaux').insert([record]).select();
      if (error) throw error;
      res.json({ success: true, materiau: data?.[0] });
    } catch (err) {
      console.error('[/api/prothesistes/stock POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/stock/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const update = { updated_at: new Date().toISOString() };
      ['nom','categorie','quantite','unite','seuil_alerte','fournisseur'].forEach(k => {
        if (req.body[k] !== undefined) update[k] = req.body[k];
      });
      const { data, error } = await supabase.from('stock_materiaux').update(update).eq('id', id).select();
      if (error) throw error;
      res.json({ success: true, materiau: data?.[0] });
    } catch (err) {
      console.error('[/api/prothesistes/stock PUT]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- GET /api/prothesistes/commandes ----------
  router.get('/commandes', async (req, res) => {
    try {
      const { prothesiste_id, statut } = req.query;
      if (!prothesiste_id) return res.status(400).json({ error: 'prothesiste_id requis' });
      let q = supabase.from('commandes').select('*').eq('prothesiste_id', prothesiste_id).order('created_at', { ascending: false });
      if (statut) q = q.eq('statut', statut);
      const { data, error } = await q;
      if (error) {
        if (/does not exist|relation/i.test(error.message || '')) return res.json({ success: true, commandes: [] });
        throw error;
      }
      // Filtrer adresse_livraison_chiffree
      const safe = (data || []).map(c => {
        const { adresse_livraison_chiffree, ...rest } = c;
        return rest;
      });
      res.json({ success: true, commandes: safe });
    } catch (err) {
      console.error('[/api/prothesistes/commandes]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/commandes/:id/statut', async (req, res) => {
    try {
      const { id } = req.params;
      const { statut } = req.body;
      const valides = ['en_attente','acceptee','en_cours','expedie','livre','note','litige'];
      if (!valides.includes(statut)) return res.status(400).json({ error: 'statut invalide' });
      const { data, error } = await supabase.from('commandes').update({
        statut, updated_at: new Date().toISOString(),
      }).eq('id', id).select();
      if (error) throw error;
      res.json({ success: true, commande: data?.[0] });
    } catch (err) {
      console.error('[/api/prothesistes/commandes/statut]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- GET /api/prothesistes/factures ----------
  router.get('/factures', async (req, res) => {
    try {
      const { prothesiste_id } = req.query;
      if (!prothesiste_id) return res.status(400).json({ error: 'prothesiste_id requis' });
      const { data, error } = await supabase.from('factures').select('*').eq('prothesiste_id', prothesiste_id).order('created_at', { ascending: false });
      if (error) {
        if (/does not exist|relation/i.test(error.message || '')) return res.json({ success: true, factures: [] });
        throw error;
      }
      res.json({ success: true, factures: data || [] });
    } catch (err) {
      console.error('[/api/prothesistes/factures]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- GET /api/prothesistes/notifications ----------
  // Renvoie : upgrades + nouvelles commandes (statut en_attente non lues)
  router.get('/notifications', async (req, res) => {
    try {
      const { prothesiste_id } = req.query;
      if (!prothesiste_id) return res.status(400).json({ error: 'prothesiste_id requis' });
      let upgrades = [];
      try {
        const { data } = await supabase.from('notifications_upgrade').select('*').eq('prothesiste_id', prothesiste_id).eq('lue', false).order('created_at', { ascending: false });
        upgrades = data || [];
      } catch (e) {}
      let nouvelles = [];
      try {
        const { data } = await supabase.from('commandes').select('id,reference,tarif_net_prothesiste,delai_jours,created_at,notif_lue,statut')
          .eq('prothesiste_id', prothesiste_id).eq('notif_lue', false).order('created_at', { ascending: false }).limit(20);
        nouvelles = data || [];
      } catch (e) {}
      res.json({ success: true, upgrades, nouvelles_commandes: nouvelles });
    } catch (err) {
      console.error('[/api/prothesistes/notifications]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- POST /api/prothesistes/notifications/lue ----------
  router.post('/notifications/lue', async (req, res) => {
    try {
      const { type, id } = req.body;
      if (type === 'upgrade') {
        await supabase.from('notifications_upgrade').update({ lue: true }).eq('id', id);
      } else if (type === 'commande') {
        await supabase.from('commandes').update({ notif_lue: true }).eq('id', id);
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createProthesistesRouter };
