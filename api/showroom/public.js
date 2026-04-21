// JADOMI — Showroom Créateurs : Routes publiques (sans authentification)
const { admin } = require('../multiSocietes/middleware');
const mailer = require('../multiSocietes/mailer');
const crypto = require('crypto');

const COMMISSION_PCT = parseFloat(process.env.JADOMI_SHOWROOM_COMMISSION_PCT || '5');

const CATEGORIES = [
  { id: 'robes', label: 'Robes', icon: '👗' },
  { id: 'bijoux', label: 'Bijoux', icon: '💎' },
  { id: 'accessoires', label: 'Accessoires', icon: '👜' },
  { id: 'maison', label: 'Maison', icon: '🏠' },
  { id: 'art', label: 'Art', icon: '🎨' },
  { id: 'beaute', label: 'Beauté', icon: '✨' },
  { id: 'gastronomie', label: 'Gastronomie', icon: '🍽️' }
];

module.exports = function (router) {
  // Profil public d'un créateur
  router.get('/profil/:slug', async (req, res) => {
    try {
      const { data } = await admin().from('showroom_profil')
        .select('id, slug, nom_boutique, tagline, description, histoire, type_createur, photo_url, banniere_url, logo_url, labels, reseaux_sociaux, ville, adresse, code_postal, note_moyenne, nb_avis, nb_vues, livraison_options, sur_mesure_actif, created_at')
        .eq('slug', req.params.slug).eq('actif', true).maybeSingle();
      if (!data) return res.status(404).json({ error: 'Créateur introuvable' });

      // Incrémenter les vues
      await admin().from('showroom_profil')
        .update({ nb_vues: (data.nb_vues || 0) + 1 })
        .eq('id', data.id);

      res.json({ success: true, profil: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Produits publics d'un créateur
  router.get('/produits/:slug', async (req, res) => {
    try {
      const { data: profil } = await admin().from('showroom_profil')
        .select('id').eq('slug', req.params.slug).eq('actif', true).maybeSingle();
      if (!profil) return res.status(404).json({ error: 'Créateur introuvable' });

      let query = admin().from('showroom_produits')
        .select('id, nom, type, categorie, description, prix_vente, prix_location_jour, caution_location, photos, tailles, couleurs, matieres, collection, metal, pierres, poincon, certificat, gravure, taille_bague, stock, nb_vues, created_at')
        .eq('profil_id', profil.id).eq('actif', true);

      if (req.query.categorie) query = query.eq('categorie', req.query.categorie);
      if (req.query.type) query = query.eq('type', req.query.type);
      if (req.query.collection) query = query.eq('collection', req.query.collection);
      if (req.query.prix_min) query = query.gte('prix_vente', Number(req.query.prix_min));
      if (req.query.prix_max) query = query.lte('prix_vente', Number(req.query.prix_max));

      query = query.order('created_at', { ascending: false });
      const limit = Math.min(parseInt(req.query.limit || '50'), 100);
      query = query.limit(limit);

      const { data } = await query;
      res.json({ success: true, produits: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Détail d'un produit
  router.get('/produit/:id', async (req, res) => {
    try {
      const { data } = await admin().from('showroom_produits')
        .select('*, profil:profil_id(id, slug, nom_boutique, logo_url, note_moyenne, nb_avis, ville, type_createur)')
        .eq('id', req.params.id).eq('actif', true).maybeSingle();
      if (!data) return res.status(404).json({ error: 'Produit introuvable' });

      // Incrémenter les vues
      await admin().from('showroom_produits')
        .update({ nb_vues: (data.nb_vues || 0) + 1 })
        .eq('id', data.id);

      res.json({ success: true, produit: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Avis publics d'un créateur
  router.get('/avis/:slug', async (req, res) => {
    try {
      const { data: profil } = await admin().from('showroom_profil')
        .select('id').eq('slug', req.params.slug).eq('actif', true).maybeSingle();
      if (!profil) return res.status(404).json({ error: 'Créateur introuvable' });

      const { data } = await admin().from('showroom_avis')
        .select('client_nom, note, commentaire, photos, reponse_createur, created_at')
        .eq('profil_id', profil.id).eq('visible', true)
        .order('created_at', { ascending: false });
      res.json({ success: true, avis: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // POST commander (Stripe)
  router.post('/commander', async (req, res) => {
    try {
      const { produit_id, type, quantite, client_nom, client_prenom, client_email, client_telephone,
              client_adresse, taille, couleur, gravure_texte,
              date_debut_location, date_fin_location,
              description_sur_mesure } = req.body;

      if (!produit_id || !client_nom || !client_email)
        return res.status(400).json({ error: 'produit_id, client_nom et client_email requis' });

      const { data: produit } = await admin().from('showroom_produits')
        .select('*, profil:profil_id(id, nom_boutique, slug, commission_jadomi_pct)')
        .eq('id', produit_id).eq('actif', true).single();
      if (!produit) return res.status(404).json({ error: 'Produit introuvable' });

      let prixTotal = 0;
      let cautionMontant = 0;
      const cmdType = type || produit.type;

      if (cmdType === 'vente') {
        prixTotal = Number(produit.prix_vente) * (parseInt(quantite) || 1);
      } else if (cmdType === 'location') {
        if (!date_debut_location || !date_fin_location)
          return res.status(400).json({ error: 'Dates de location requises' });
        const jours = Math.ceil((new Date(date_fin_location) - new Date(date_debut_location)) / 86400000);
        prixTotal = Number(produit.prix_location_jour) * Math.max(1, jours);
        cautionMontant = Number(produit.caution_location) || 0;
      } else if (cmdType === 'sur_mesure') {
        // Créer une demande sur mesure
        const { data: demande, error: smErr } = await admin().from('showroom_sur_mesure')
          .insert({
            profil_id: produit.profil.id,
            produit_id: produit.id,
            client_nom, client_prenom, client_email, client_telephone,
            description: description_sur_mesure || '',
            taille, couleur, gravure_texte,
            statut: 'nouvelle'
          }).select('*').single();
        if (smErr) throw smErr;

        // Notifier le créateur
        await mailer.sendMail({
          to: produit.profil.email_contact || client_email,
          subject: `Nouvelle demande sur-mesure — ${produit.nom}`,
          html: `<p>Nouvelle demande sur-mesure pour <strong>${produit.nom}</strong> de ${client_prenom || ''} ${client_nom}.</p>
            <p>Connectez-vous à votre dashboard JADOMI pour envoyer un devis.</p>`
        });

        return res.json({ success: true, type: 'sur_mesure', demande });
      }

      const commissionPct = produit.profil?.commission_jadomi_pct || COMMISSION_PCT;
      const commission = prixTotal * commissionPct / 100;

      // Créer le paiement Stripe
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const totalStripe = Math.round((prixTotal + cautionMontant) * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: totalStripe,
        currency: 'eur',
        metadata: {
          type: 'showroom_commande',
          produit_id: produit.id,
          profil_id: produit.profil.id,
          client_email,
          cmd_type: cmdType
        }
      });

      // Créer la commande
      const { data: commande, error } = await admin().from('showroom_commandes')
        .insert({
          profil_id: produit.profil.id,
          produit_id: produit.id,
          type: cmdType,
          client_nom, client_prenom, client_email, client_telephone,
          client_adresse,
          quantite: parseInt(quantite) || 1,
          taille, couleur, gravure_texte,
          prix_total: prixTotal,
          commission_jadomi: commission,
          commission_pct: commissionPct,
          caution_montant: cautionMontant,
          date_debut_location: date_debut_location || null,
          date_fin_location: date_fin_location || null,
          stripe_payment_intent_id: paymentIntent.id,
          statut: 'en_attente'
        }).select('*').single();
      if (error) throw error;

      res.json({
        success: true,
        commande,
        client_secret: paymentIntent.client_secret
      });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // Confirmer après paiement Stripe
  router.post('/confirmer/:id', async (req, res) => {
    try {
      const { data: cmd } = await admin().from('showroom_commandes')
        .select('*, produit:produit_id(nom), profil:profil_id(nom_boutique, email_contact)')
        .eq('id', req.params.id).single();
      if (!cmd) return res.status(404).json({ error: 'not_found' });

      await admin().from('showroom_commandes')
        .update({ statut: 'confirmee' }).eq('id', cmd.id);

      // Email confirmation client
      await mailer.sendMail({
        to: cmd.client_email,
        subject: `Commande confirmée — ${cmd.produit?.nom || 'JADOMI Showroom'}`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:auto;">
          <h2 style="color:#1a1a2e;">Commande confirmée !</h2>
          <p>Bonjour ${cmd.client_prenom || cmd.client_nom},</p>
          <p>Votre commande chez <strong>${cmd.profil?.nom_boutique || ''}</strong> est confirmée.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Article</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">${cmd.produit?.nom || ''}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Type</td><td style="padding:8px;border-bottom:1px solid #eee;">${cmd.type}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Montant</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">${cmd.prix_total} €</td></tr>
          </table>
          <p>Cordialement,<br>L'équipe JADOMI</p>
        </div>`
      });

      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Recherche de créateurs
  router.get('/search', async (req, res) => {
    try {
      let query = admin().from('showroom_profil')
        .select('id, slug, nom_boutique, tagline, type_createur, photo_url, logo_url, ville, note_moyenne, nb_avis, labels')
        .eq('actif', true);

      if (req.query.type_createur) query = query.eq('type_createur', req.query.type_createur);
      if (req.query.ville) query = query.ilike('ville', `%${req.query.ville}%`);
      if (req.query.categorie) {
        // Chercher les créateurs qui ont des produits dans cette catégorie
        const { data: profilIds } = await admin().from('showroom_produits')
          .select('profil_id').eq('categorie', req.query.categorie).eq('actif', true);
        const ids = [...new Set((profilIds || []).map(p => p.profil_id))];
        if (ids.length === 0) return res.json({ success: true, createurs: [] });
        query = query.in('id', ids);
      }
      if (req.query.q) {
        query = query.or(`nom_boutique.ilike.%${req.query.q}%,tagline.ilike.%${req.query.q}%,description.ilike.%${req.query.q}%`);
      }

      query = query.order('note_moyenne', { ascending: false });
      const limit = Math.min(parseInt(req.query.limit || '20'), 50);
      query = query.limit(limit);

      const { data } = await query;
      res.json({ success: true, createurs: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Tendances (produits les plus vus cette semaine)
  router.get('/tendances', async (req, res) => {
    try {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

      const { data } = await admin().from('showroom_produits')
        .select('id, nom, type, categorie, photos, prix_vente, prix_location_jour, nb_vues, profil:profil_id(slug, nom_boutique, logo_url, ville)')
        .eq('actif', true)
        .order('nb_vues', { ascending: false })
        .limit(parseInt(req.query.limit || '12'));

      res.json({ success: true, tendances: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Nouveautés (derniers produits ajoutés)
  router.get('/nouveautes', async (req, res) => {
    try {
      const { data } = await admin().from('showroom_produits')
        .select('id, nom, type, categorie, photos, prix_vente, prix_location_jour, nb_vues, created_at, profil:profil_id(slug, nom_boutique, logo_url, ville)')
        .eq('actif', true)
        .order('created_at', { ascending: false })
        .limit(parseInt(req.query.limit || '12'));

      res.json({ success: true, nouveautes: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Catégories avec comptage
  router.get('/categories', async (req, res) => {
    try {
      const { data: produits } = await admin().from('showroom_produits')
        .select('categorie').eq('actif', true);

      const counts = {};
      for (const p of (produits || [])) {
        if (p.categorie) counts[p.categorie] = (counts[p.categorie] || 0) + 1;
      }

      const result = CATEGORIES.map(c => ({
        ...c,
        nb_produits: counts[c.id] || 0
      }));

      res.json({ success: true, categories: result });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Créateurs mis en avant
  router.get('/createurs-vedettes', async (req, res) => {
    try {
      const { data } = await admin().from('showroom_profil')
        .select('id, slug, nom_boutique, tagline, type_createur, photo_url, logo_url, banniere_url, ville, note_moyenne, nb_avis, labels')
        .eq('actif', true).eq('mis_en_avant', true)
        .order('note_moyenne', { ascending: false })
        .limit(6);

      res.json({ success: true, createurs: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Laisser un avis (après commande terminée)
  router.post('/avis', async (req, res) => {
    try {
      const { commande_id, note, commentaire, photos, client_email } = req.body;
      if (!commande_id || !note) return res.status(400).json({ error: 'commande_id et note requis' });

      const { data: cmd } = await admin().from('showroom_commandes')
        .select('profil_id, client_nom, client_email, statut')
        .eq('id', commande_id).single();
      if (!cmd) return res.status(404).json({ error: 'Commande introuvable' });
      if (cmd.statut !== 'terminee') return res.status(400).json({ error: 'La commande doit être terminée' });
      if (client_email && cmd.client_email !== client_email)
        return res.status(403).json({ error: 'Email non autorisé' });

      // Vérifier doublon
      const { data: existing } = await admin().from('showroom_avis')
        .select('id').eq('commande_id', commande_id).maybeSingle();
      if (existing) return res.status(400).json({ error: 'Vous avez déjà laissé un avis' });

      const { data, error } = await admin().from('showroom_avis').insert({
        profil_id: cmd.profil_id,
        commande_id,
        client_nom: cmd.client_nom,
        note: Math.min(5, Math.max(1, parseInt(note))),
        commentaire,
        photos: photos || [],
        visible: true
      }).select('*').single();
      if (error) throw error;

      // Mettre à jour la note moyenne
      const { data: avisAll } = await admin().from('showroom_avis')
        .select('note').eq('profil_id', cmd.profil_id).eq('visible', true);
      const allNotes = avisAll || [];
      const moy = allNotes.length ? allNotes.reduce((s, a) => s + a.note, 0) / allNotes.length : 0;
      await admin().from('showroom_profil').update({
        note_moyenne: Math.round(moy * 10) / 10, nb_avis: allNotes.length
      }).eq('id', cmd.profil_id);

      res.json({ success: true, avis: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // Disponibilités location pour un produit
  router.get('/disponibilites/:produitId', async (req, res) => {
    try {
      const { data: produit } = await admin().from('showroom_produits')
        .select('id, nom, type, prix_location_jour, caution_location, duree_location_min, duree_location_max')
        .eq('id', req.params.produitId).eq('actif', true).eq('type', 'location').maybeSingle();
      if (!produit) return res.status(404).json({ error: 'Produit location introuvable' });

      const today = new Date().toISOString().slice(0, 10);
      const in90 = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

      // Blocages
      const { data: blocages } = await admin().from('showroom_location_blocages')
        .select('date_debut, date_fin').eq('produit_id', produit.id)
        .gte('date_fin', today).lte('date_debut', in90);

      // Locations actives
      const { data: locations } = await admin().from('showroom_commandes')
        .select('date_debut_location, date_fin_location')
        .eq('produit_id', produit.id).eq('type', 'location')
        .in('statut', ['confirmee', 'caution_encaissee', 'en_cours'])
        .gte('date_fin_location', today).lte('date_debut_location', in90);

      // Générer les dates indisponibles
      const indisponibles = new Set();
      for (const b of (blocages || [])) {
        let d = new Date(b.date_debut);
        const end = new Date(b.date_fin);
        while (d <= end) {
          indisponibles.add(d.toISOString().slice(0, 10));
          d.setDate(d.getDate() + 1);
        }
      }
      for (const l of (locations || [])) {
        let d = new Date(l.date_debut_location);
        const end = new Date(l.date_fin_location);
        while (d <= end) {
          indisponibles.add(d.toISOString().slice(0, 10));
          d.setDate(d.getDate() + 1);
        }
      }

      res.json({
        success: true,
        produit,
        dates_indisponibles: [...indisponibles].sort()
      });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Envoyer un message à un créateur (public)
  router.post('/message', async (req, res) => {
    try {
      const { slug, client_nom, client_prenom, client_email, sujet, contenu } = req.body;
      if (!slug || !client_nom || !client_email || !contenu)
        return res.status(400).json({ error: 'Champs obligatoires manquants' });

      const { data: profil } = await admin().from('showroom_profil')
        .select('id, nom_boutique').eq('slug', slug).eq('actif', true).maybeSingle();
      if (!profil) return res.status(404).json({ error: 'Créateur introuvable' });

      // Créer ou récupérer la conversation
      let { data: conv } = await admin().from('showroom_conversations')
        .select('*').eq('profil_id', profil.id).eq('client_email', client_email).maybeSingle();

      if (!conv) {
        const { data: newConv, error: convErr } = await admin().from('showroom_conversations')
          .insert({
            profil_id: profil.id,
            client_nom, client_prenom, client_email,
            sujet: sujet || 'Nouveau message',
            nb_non_lus_createur: 1,
            nb_non_lus_client: 0
          }).select('*').single();
        if (convErr) throw convErr;
        conv = newConv;
      } else {
        await admin().from('showroom_conversations')
          .update({
            nb_non_lus_createur: (conv.nb_non_lus_createur || 0) + 1,
            updated_at: new Date().toISOString()
          }).eq('id', conv.id);
      }

      // Ajouter le message
      const { data: msg, error } = await admin().from('showroom_messages')
        .insert({
          conversation_id: conv.id,
          auteur_type: 'client',
          contenu,
          lu_client: true,
          lu_createur: false
        }).select('*').single();
      if (error) throw error;

      res.json({ success: true, message: msg });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
};
