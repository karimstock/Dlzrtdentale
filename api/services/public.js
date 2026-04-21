// =============================================
// JADOMI — Services : Routes publiques (NO auth)
// =============================================
const { admin } = require('../multiSocietes/middleware');
const { sendMail } = require('../multiSocietes/mailer');

const COMMISSION_FULL = parseFloat(process.env.JADOMI_SERVICES_COMMISSION_PCT || '5');
const COMMISSION_ACOMPTE = parseFloat(process.env.JADOMI_SERVICES_COMMISSION_PCT_ACOMPTE || '8');

module.exports = function (router) {
  // ── Profil public ──
  router.get('/profil/:slug', async (req, res) => {
    try {
      const { data, error } = await admin()
        .from('services_profils')
        .select('id, societe_id, nom, slug, description, adresse, ville, code_postal, telephone, email, logo_url, photo_url, categorie, sous_categorie, site_web, horaires, reseaux_sociaux, note_moyenne, nb_avis, acompte_pct')
        .eq('slug', req.params.slug)
        .eq('actif', true)
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Profil introuvable' });
      res.json({ profil: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Praticiens publiques ──
  router.get('/praticiens/:slug', async (req, res) => {
    try {
      const { data: profil } = await admin()
        .from('services_profils')
        .select('id')
        .eq('slug', req.params.slug)
        .eq('actif', true)
        .maybeSingle();
      if (!profil) return res.status(404).json({ error: 'Profil introuvable' });
      const { data, error } = await admin()
        .from('services_praticiens')
        .select('id, nom, prenom, photo_url, specialites, couleur')
        .eq('profil_id', profil.id)
        .eq('actif', true)
        .order('nom');
      if (error) throw error;
      res.json({ praticiens: data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Prestations publiques ──
  router.get('/prestations/:slug', async (req, res) => {
    try {
      const { data: profil } = await admin()
        .from('services_profils')
        .select('societe_id')
        .eq('slug', req.params.slug)
        .eq('actif', true)
        .maybeSingle();
      if (!profil) return res.status(404).json({ error: 'Profil introuvable' });
      const { data, error } = await admin()
        .from('services_prestations')
        .select('id, nom, description, categorie, duree, prix, acompte_pct, couleur, photo_url')
        .eq('societe_id', profil.societe_id)
        .eq('actif', true)
        .order('categorie').order('nom');
      if (error) throw error;
      res.json({ prestations: data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Disponibilités publiques (créneaux 30 jours) ──
  router.get('/disponibilites/:slug', async (req, res) => {
    try {
      const { prestation_id, praticien_id } = req.query;
      const { data: profil } = await admin()
        .from('services_profils')
        .select('societe_id')
        .eq('slug', req.params.slug)
        .eq('actif', true)
        .maybeSingle();
      if (!profil) return res.status(404).json({ error: 'Profil introuvable' });

      // Get disponibilites
      let dispoQuery = admin()
        .from('services_disponibilites')
        .select('*')
        .eq('societe_id', profil.societe_id)
        .eq('actif', true);
      if (praticien_id) dispoQuery = dispoQuery.eq('praticien_id', praticien_id);
      const { data: dispos } = await dispoQuery;

      // Get prestation duree
      let duree = 30;
      if (prestation_id) {
        const { data: prest } = await admin()
          .from('services_prestations')
          .select('duree')
          .eq('id', prestation_id)
          .single();
        if (prest) duree = prest.duree;
      }

      // Get existing reservations for next 30 days
      const now = new Date();
      const endDate = new Date(now.getTime() + 30 * 86400000);
      const { data: reservations } = await admin()
        .from('services_reservations')
        .select('date_heure, duree, praticien_id')
        .eq('societe_id', profil.societe_id)
        .in('statut', ['confirme', 'en_attente'])
        .gte('date_heure', now.toISOString())
        .lte('date_heure', endDate.toISOString());

      // Calculate slots
      const slots = [];
      const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

      for (let d = 0; d < 30; d++) {
        const date = new Date(now.getTime() + d * 86400000);
        const jourSemaine = JOURS[date.getDay()];
        const dateStr = date.toISOString().split('T')[0];

        const jourDispos = (dispos || []).filter(di => di.jour_semaine === jourSemaine);
        if (!jourDispos.length) continue;

        for (const dispo of jourDispos) {
          const [hDeb, mDeb] = dispo.heure_debut.split(':').map(Number);
          const [hFin, mFin] = dispo.heure_fin.split(':').map(Number);
          const startMin = hDeb * 60 + mDeb;
          const endMin = hFin * 60 + mFin;

          // Pause
          let pauseStart = null, pauseEnd = null;
          if (dispo.pause_debut && dispo.pause_fin) {
            const [phD, pmD] = dispo.pause_debut.split(':').map(Number);
            const [phF, pmF] = dispo.pause_fin.split(':').map(Number);
            pauseStart = phD * 60 + pmD;
            pauseEnd = phF * 60 + pmF;
          }

          for (let t = startMin; t + duree <= endMin; t += duree) {
            // Skip pause
            if (pauseStart !== null && t < pauseEnd && t + duree > pauseStart) continue;

            const heure = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
            const slotStart = new Date(`${dateStr}T${heure}:00`);

            // Skip past slots
            if (slotStart <= now) continue;

            // Check conflicts
            const conflict = (reservations || []).some(r => {
              if (praticien_id && r.praticien_id !== praticien_id) return false;
              const rStart = new Date(r.date_heure).getTime();
              const rEnd = rStart + (r.duree || 30) * 60000;
              const sStart = slotStart.getTime();
              const sEnd = sStart + duree * 60000;
              return sStart < rEnd && sEnd > rStart;
            });

            if (!conflict) {
              slots.push({
                date: dateStr,
                heure,
                praticien_id: dispo.praticien_id || null,
                jour: jourSemaine
              });
            }
          }
        }
      }

      res.json({ slots, duree });
    } catch (e) {
      console.error('[services/public] disponibilites:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Avis publics ──
  router.get('/avis/:slug', async (req, res) => {
    try {
      const { data: profil } = await admin()
        .from('services_profils')
        .select('societe_id, note_moyenne, nb_avis')
        .eq('slug', req.params.slug)
        .eq('actif', true)
        .maybeSingle();
      if (!profil) return res.status(404).json({ error: 'Profil introuvable' });
      const { data, error } = await admin()
        .from('services_avis')
        .select('id, note, commentaire, client_nom, reponse, reponse_date, created_at, prestation:prestation_id(nom)')
        .eq('societe_id', profil.societe_id)
        .eq('statut', 'publie')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      res.json({ avis: data || [], note_moyenne: profil.note_moyenne, nb_avis: profil.nb_avis });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Réserver (Stripe payment intent) ──
  router.post('/reserver', async (req, res) => {
    try {
      const { slug, prestation_id, praticien_id, date_heure,
              client_nom, client_prenom, client_email, client_telephone, notes } = req.body;
      if (!slug || !prestation_id || !date_heure || !client_email) {
        return res.status(400).json({ error: 'Champs requis manquants' });
      }

      const { data: profil } = await admin()
        .from('services_profils')
        .select('societe_id, nom, acompte_pct')
        .eq('slug', slug)
        .eq('actif', true)
        .maybeSingle();
      if (!profil) return res.status(404).json({ error: 'Profil introuvable' });

      const { data: prestation } = await admin()
        .from('services_prestations')
        .select('*')
        .eq('id', prestation_id)
        .eq('societe_id', profil.societe_id)
        .single();
      if (!prestation) return res.status(404).json({ error: 'Prestation introuvable' });

      const acomptePct = prestation.acompte_pct || profil.acompte_pct || 30;
      const montantAcompte = Math.round(prestation.prix * acomptePct / 100 * 100); // in cents

      // Find or create client
      let clientId = null;
      const { data: existingClient } = await admin()
        .from('services_clients')
        .select('id')
        .eq('societe_id', profil.societe_id)
        .eq('email', client_email)
        .maybeSingle();
      if (existingClient) {
        clientId = existingClient.id;
      } else {
        const { data: newClient } = await admin()
          .from('services_clients')
          .insert({
            societe_id: profil.societe_id,
            nom: client_nom, prenom: client_prenom,
            email: client_email, telephone: client_telephone,
            segments: ['web'], points_fidelite: 0, nb_visites: 0
          })
          .select()
          .single();
        if (newClient) clientId = newClient.id;
      }

      // Create Stripe payment intent
      let paymentIntent = null;
      let clientSecret = null;
      if (montantAcompte > 0 && process.env.STRIPE_SECRET_KEY) {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        paymentIntent = await stripe.paymentIntents.create({
          amount: montantAcompte,
          currency: 'eur',
          metadata: {
            type: 'services_acompte',
            slug,
            prestation_id,
            societe_id: profil.societe_id,
            client_email
          }
        });
        clientSecret = paymentIntent.client_secret;
      }

      // Create reservation
      const { data: reservation, error } = await admin()
        .from('services_reservations')
        .insert({
          societe_id: profil.societe_id,
          prestation_id,
          praticien_id: praticien_id || null,
          client_id: clientId,
          client_nom: `${client_prenom || ''} ${client_nom || ''}`.trim(),
          client_email,
          client_telephone: client_telephone || null,
          date_heure,
          duree: prestation.duree,
          montant_total: prestation.prix,
          montant_acompte: montantAcompte / 100,
          acompte_pct: acomptePct,
          stripe_payment_intent: paymentIntent?.id || null,
          statut: 'en_attente',
          notes: notes || null,
          source: 'web'
        })
        .select()
        .single();
      if (error) throw error;

      res.json({
        reservation,
        clientSecret,
        acompte: montantAcompte / 100,
        prix: prestation.prix,
        acompte_pct: acomptePct
      });
    } catch (e) {
      console.error('[services/public] reserver:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Confirmer réservation ──
  router.post('/confirmer/:id', async (req, res) => {
    try {
      const { payment_intent_id } = req.body;
      const { data: resa } = await admin()
        .from('services_reservations')
        .select('*')
        .eq('id', req.params.id)
        .single();
      if (!resa) return res.status(404).json({ error: 'Réservation introuvable' });

      // Verify Stripe payment if applicable
      if (resa.stripe_payment_intent && process.env.STRIPE_SECRET_KEY) {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const pi = await stripe.paymentIntents.retrieve(resa.stripe_payment_intent);
        if (pi.status !== 'succeeded') {
          return res.status(400).json({ error: 'Paiement non validé' });
        }
      }

      const { data, error } = await admin()
        .from('services_reservations')
        .update({ statut: 'confirme', paiement_statut: 'acompte_paye', updated_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .select()
        .single();
      if (error) throw error;

      // Get profil for email
      const { data: profil } = await admin()
        .from('services_profils')
        .select('nom, email')
        .eq('societe_id', resa.societe_id)
        .maybeSingle();

      // Email client
      if (resa.client_email) {
        const dateObj = new Date(resa.date_heure);
        const dateStr = dateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
        const heureStr = dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        await sendMail({
          to: resa.client_email,
          subject: `Confirmation de rendez-vous — ${profil?.nom || 'JADOMI'}`,
          html: `<p>Bonjour ${resa.client_nom || ''},</p>
            <p>Votre rendez-vous est confirmé :</p>
            <ul>
              <li><strong>Date :</strong> ${dateStr} a ${heureStr}</li>
              <li><strong>Acompte versé :</strong> ${resa.montant_acompte}€</li>
            </ul>
            <p>À bientôt !<br>${profil?.nom || 'L\'équipe JADOMI'}</p>`
        });
      }

      // Email pro
      if (profil?.email) {
        await sendMail({
          to: profil.email,
          subject: 'Nouvelle réservation confirmée — JADOMI',
          html: `<p>Nouvelle réservation de <strong>${resa.client_nom || resa.client_email}</strong> le ${new Date(resa.date_heure).toLocaleDateString('fr-FR')}.</p>`
        });
      }

      res.json({ reservation: data });
    } catch (e) {
      console.error('[services/public] confirmer:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Annuler réservation (client) ──
  router.post('/annuler/:id', async (req, res) => {
    try {
      const { motif } = req.body;
      const { data: resa } = await admin()
        .from('services_reservations')
        .select('*, prestation:prestation_id(nom, prix)')
        .eq('id', req.params.id)
        .single();
      if (!resa) return res.status(404).json({ error: 'Réservation introuvable' });
      if (resa.statut === 'annule' || resa.statut === 'annule_pro' || resa.statut === 'termine') {
        return res.status(400).json({ error: 'Impossible d\'annuler cette réservation' });
      }

      // Check acompte rules: > 24h = full refund, < 24h = no refund
      const dateRdv = new Date(resa.date_heure);
      const heuresAvant = (dateRdv - new Date()) / 3600000;
      let remboursement = 'aucun';
      let refundAmount = 0;

      if (heuresAvant > 24) {
        remboursement = 'total';
        refundAmount = resa.montant_acompte || 0;
      } else if (heuresAvant > 2) {
        remboursement = 'partiel';
        refundAmount = Math.round((resa.montant_acompte || 0) * 50) / 100;
      }

      // Stripe refund
      if (refundAmount > 0 && resa.stripe_payment_intent && process.env.STRIPE_SECRET_KEY) {
        try {
          const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
          await stripe.refunds.create({
            payment_intent: resa.stripe_payment_intent,
            amount: Math.round(refundAmount * 100)
          });
        } catch (stripeErr) {
          console.error('[services/public] refund:', stripeErr.message);
        }
      }

      const { data, error } = await admin()
        .from('services_reservations')
        .update({
          statut: 'annule',
          notes: `${resa.notes || ''}\nAnnulation client: ${motif || 'sans motif'} | Remboursement: ${remboursement} (${refundAmount}€)`.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', req.params.id)
        .select()
        .single();
      if (error) throw error;

      res.json({ reservation: data, remboursement, refund_amount: refundAmount });
    } catch (e) {
      console.error('[services/public] annuler:', e.message);
      res.status(500).json({ error: e.message });
    }
  });
};
