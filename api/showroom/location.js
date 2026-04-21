// JADOMI — Showroom Créateurs : Location (calendrier disponibilités, blocages, retours)
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');

async function getProfilId(societeId) {
  const { data } = await admin().from('showroom_profil')
    .select('id').eq('societe_id', societeId).maybeSingle();
  return data?.id;
}

module.exports = function (router) {
  // GET calendrier de disponibilité d'un produit location
  router.get('/location/calendrier/:produitId', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const produitId = req.params.produitId;

      // Vérifier que le produit appartient au créateur et est de type location
      const { data: produit } = await admin().from('showroom_produits')
        .select('id, nom, type').eq('id', produitId).eq('profil_id', profilId).maybeSingle();
      if (!produit) return res.status(404).json({ error: 'Produit introuvable' });

      // Récupérer les blocages
      const { data: blocages } = await admin().from('showroom_location_blocages')
        .select('*').eq('produit_id', produitId)
        .gte('date_fin', new Date().toISOString().slice(0, 10))
        .order('date_debut');

      // Récupérer les locations en cours/à venir
      const { data: locations } = await admin().from('showroom_commandes')
        .select('id, date_debut_location, date_fin_location, statut, client_nom')
        .eq('produit_id', produitId).eq('type', 'location')
        .in('statut', ['confirmee', 'caution_encaissee', 'en_cours'])
        .gte('date_fin_location', new Date().toISOString().slice(0, 10))
        .order('date_debut_location');

      res.json({
        success: true,
        produit: { id: produit.id, nom: produit.nom },
        blocages: blocages || [],
        locations: locations || []
      });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // POST bloquer des dates
  router.post('/location/bloquer', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const { produit_id, date_debut, date_fin, motif } = req.body;

      if (!produit_id || !date_debut || !date_fin)
        return res.status(400).json({ error: 'produit_id, date_debut et date_fin requis' });

      // Vérifier propriété du produit
      const { data: produit } = await admin().from('showroom_produits')
        .select('id').eq('id', produit_id).eq('profil_id', profilId).maybeSingle();
      if (!produit) return res.status(404).json({ error: 'Produit introuvable' });

      const { data, error } = await admin().from('showroom_location_blocages')
        .insert({ produit_id, date_debut, date_fin, motif: motif || null })
        .select('*').single();
      if (error) throw error;

      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'bloquer_dates', entity: 'showroom_location', entityId: data.id, req });
      res.json({ success: true, blocage: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // DELETE supprimer un blocage
  router.delete('/location/bloquer/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      // Vérifier que le blocage concerne un produit du créateur
      const { data: blocage } = await admin().from('showroom_location_blocages')
        .select('*, produit:produit_id(profil_id)')
        .eq('id', req.params.id).maybeSingle();

      if (!blocage || blocage.produit?.profil_id !== profilId)
        return res.status(404).json({ error: 'Blocage introuvable' });

      await admin().from('showroom_location_blocages').delete().eq('id', req.params.id);
      res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // GET retours en attente
  router.get('/location/retours', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.json({ success: true, retours: [] });

      const { data } = await admin().from('showroom_commandes')
        .select('*, produit:produit_id(nom, photos)')
        .eq('profil_id', profilId).eq('type', 'location')
        .in('statut', ['retour_initie', 'retour_recu', 'en_cours'])
        .order('date_fin_location');

      res.json({ success: true, retours: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // PATCH gérer un retour
  router.patch('/location/retour/:commandeId', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      const { etat, notes, deduire_caution } = req.body;

      const updates = {
        retour_etat: etat || null,
        retour_notes: notes || null,
        retour_date: new Date().toISOString(),
        statut: 'retour_recu',
        updated_at: new Date().toISOString()
      };

      if (deduire_caution && deduire_caution > 0) {
        updates.caution_deduite = deduire_caution;
      }

      const { data, error } = await admin().from('showroom_commandes')
        .update(updates)
        .eq('id', req.params.commandeId).eq('profil_id', profilId).eq('type', 'location')
        .select('*').single();
      if (error) throw error;

      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'retour_location', entity: 'showroom_commande', entityId: data.id,
        meta: { etat, deduire_caution }, req });
      res.json({ success: true, commande: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // GET planning location (vue calendrier)
  router.get('/location/planning', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.json({ success: true, events: [] });

      const from = req.query.from || new Date().toISOString().slice(0, 10);
      const to = req.query.to || new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

      // Locations actives
      const { data: locations } = await admin().from('showroom_commandes')
        .select('id, produit_id, date_debut_location, date_fin_location, statut, client_nom, produit:produit_id(nom)')
        .eq('profil_id', profilId).eq('type', 'location')
        .not('statut', 'in', '("annulee","terminee")')
        .gte('date_fin_location', from).lte('date_debut_location', to);

      // Blocages
      const { data: blocages } = await admin().from('showroom_location_blocages')
        .select('id, produit_id, date_debut, date_fin, motif, produit:produit_id(nom)')
        .gte('date_fin', from).lte('date_debut', to);

      // Combiner pour la jointure avec le produit
      const { data: produits } = await admin().from('showroom_produits')
        .select('id, nom').eq('profil_id', profilId).eq('type', 'location');

      const events = [];

      for (const loc of (locations || [])) {
        events.push({
          type: 'location',
          id: loc.id,
          produit_id: loc.produit_id,
          produit_nom: loc.produit?.nom || '',
          date_debut: loc.date_debut_location,
          date_fin: loc.date_fin_location,
          statut: loc.statut,
          client: loc.client_nom
        });
      }

      for (const b of (blocages || [])) {
        events.push({
          type: 'blocage',
          id: b.id,
          produit_id: b.produit_id,
          produit_nom: b.produit?.nom || '',
          date_debut: b.date_debut,
          date_fin: b.date_fin,
          motif: b.motif
        });
      }

      res.json({ success: true, events, produits: produits || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
};
