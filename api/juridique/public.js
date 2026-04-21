// JADOMI — Juridique : Routes publiques (sans authentification)
const { admin } = require('../multiSocietes/middleware');
const mailer = require('../multiSocietes/mailer');
const crypto = require('crypto');

const COMMISSION_PCT = parseFloat(process.env.JADOMI_JURIDIQUE_COMMISSION_PCT || '5');

const DOMAINES = [
  { id: 'droit_travail', label: 'Droit du travail', icon: '👔', desc: 'Licenciement, contrat, litige' },
  { id: 'droit_immobilier', label: 'Droit immobilier', icon: '🏠', desc: 'Loyer, bail, SCI, litige locataire' },
  { id: 'droit_societes', label: 'Droit des sociétés', icon: '💼', desc: 'Création, dissolution, associés' },
  { id: 'droit_famille', label: 'Droit de la famille', icon: '👨‍👩‍👧', desc: 'Divorce, garde, pension' },
  { id: 'droit_commercial', label: 'Droit commercial', icon: '📋', desc: 'Contrat, impayé, concurrence' },
  { id: 'droit_routier', label: 'Droit routier', icon: '🚗', desc: 'Amende, permis, accident' },
  { id: 'droit_fiscal', label: 'Droit fiscal', icon: '💰', desc: 'Impôts, TVA, redressement' },
  { id: 'droit_sante', label: 'Droit de la santé', icon: '🏥', desc: 'Responsabilité médicale, ARS' },
  { id: 'droit_penal', label: 'Droit pénal', icon: '⚖️', desc: 'Défense pénale, plainte' },
  { id: 'autre', label: 'Autre domaine', icon: '📝', desc: '' }
];

const SUGGESTIONS_BY_TYPE = {
  cabinet_dentaire: ['droit_sante', 'droit_travail', 'droit_societes'],
  veterinaire: ['droit_sante', 'droit_travail', 'droit_societes'],
  sci: ['droit_immobilier', 'droit_fiscal'],
  societe_commerciale: ['droit_commercial', 'droit_travail', 'droit_societes'],
  sas: ['droit_commercial', 'droit_travail', 'droit_societes'],
  sarl: ['droit_commercial', 'droit_travail', 'droit_societes'],
  eurl: ['droit_commercial', 'droit_travail', 'droit_societes'],
  services: ['droit_travail', 'droit_commercial'],
  prothesiste: ['droit_sante', 'droit_travail'],
  auto_entrepreneur: ['droit_commercial', 'droit_fiscal']
};

module.exports = function (router) {
  // Profil public d'un professionnel
  router.get('/profil/:slug', async (req, res) => {
    try {
      const { data } = await admin().from('juridique_profil')
        .select('id, slug, type_professionnel, titre, nom, prenom, photo_url, description, specialites, barreau, langues, adresse, code_postal, ville, telephone, email_contact, note_moyenne, nb_avis')
        .eq('slug', req.params.slug).eq('actif', true).maybeSingle();
      if (!data) return res.status(404).json({ error: 'Professionnel introuvable' });
      res.json({ success: true, profil: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Offres publiques
  router.get('/offres/:slug', async (req, res) => {
    try {
      const { data: profil } = await admin().from('juridique_profil')
        .select('id').eq('slug', req.params.slug).eq('actif', true).maybeSingle();
      if (!profil) return res.status(404).json({ error: 'Professionnel introuvable' });

      const { data } = await admin().from('juridique_offres')
        .select('id, type, titre, description, duree_minutes, prix, delai_livraison_jours')
        .eq('profil_id', profil.id).eq('actif', true).order('ordre');
      res.json({ success: true, offres: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Créneaux disponibles (prochains 30 jours)
  router.get('/disponibilites/:slug', async (req, res) => {
    try {
      const { data: profil } = await admin().from('juridique_profil')
        .select('id').eq('slug', req.params.slug).eq('actif', true).maybeSingle();
      if (!profil) return res.status(404).json({ error: 'Professionnel introuvable' });

      // Disponibilités hebdomadaires
      const { data: dispos } = await admin().from('juridique_disponibilites')
        .select('*').eq('profil_id', profil.id);

      // Blocages
      const today = new Date().toISOString().split('T')[0];
      const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
      const { data: blocages } = await admin().from('juridique_blocages')
        .select('*').eq('profil_id', profil.id)
        .gte('date_fin', today).lte('date_debut', in30);

      // Réservations existantes
      const { data: rdvs } = await admin().from('juridique_reservations')
        .select('date_rdv, heure_rdv, duree_minutes')
        .eq('profil_id', profil.id)
        .in('statut', ['en_attente', 'confirme', 'en_cours'])
        .gte('date_rdv', today).lte('date_rdv', in30);

      // Calculer les créneaux disponibles
      const dureeMin = parseInt(req.query.duree || '60');
      const slots = [];

      for (let d = 0; d < 30; d++) {
        const date = new Date(Date.now() + d * 86400000);
        const dateStr = date.toISOString().split('T')[0];
        const dayOfWeek = date.getDay(); // 0=dim

        // Vérifier blocages
        const isBlocked = (blocages || []).some(b =>
          dateStr >= b.date_debut && dateStr <= b.date_fin && b.journee_entiere
        );
        if (isBlocked) continue;

        // Trouver les dispos pour ce jour
        const dayDispos = (dispos || []).filter(dd => dd.jour_semaine === dayOfWeek);
        if (!dayDispos.length) continue;

        for (const dd of dayDispos) {
          const start = timeToMin(dd.heure_debut);
          const end = timeToMin(dd.heure_fin);
          const pauseStart = dd.pause_debut ? timeToMin(dd.pause_debut) : null;
          const pauseEnd = dd.pause_fin ? timeToMin(dd.pause_fin) : null;

          for (let t = start; t + dureeMin <= end; t += 30) {
            // Vérifier pause
            if (pauseStart !== null && t < pauseEnd && t + dureeMin > pauseStart) continue;

            const heure = minToTime(t);

            // Vérifier si créneau déjà pris
            const isTaken = (rdvs || []).some(r =>
              r.date_rdv === dateStr && timesOverlap(heure, dureeMin, r.heure_rdv, r.duree_minutes)
            );
            if (isTaken) continue;

            // Ne pas proposer de créneaux dans le passé
            if (d === 0) {
              const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
              if (t <= nowMin + 60) continue; // +1h de marge
            }

            slots.push({ date: dateStr, heure, jour: dayOfWeek });
          }
        }
      }

      res.json({ success: true, slots });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Avis publics
  router.get('/avis/:slug', async (req, res) => {
    try {
      const { data: profil } = await admin().from('juridique_profil')
        .select('id').eq('slug', req.params.slug).eq('actif', true).maybeSingle();
      if (!profil) return res.status(404).json({ error: 'Professionnel introuvable' });

      const { data } = await admin().from('juridique_avis')
        .select('client_nom, note, commentaire, reponse_pro, created_at')
        .eq('profil_id', profil.id).eq('visible', true)
        .order('created_at', { ascending: false });
      res.json({ success: true, avis: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Créer une réservation + paiement Stripe
  router.post('/reserver', async (req, res) => {
    try {
      const { slug, offre_id, date_rdv, heure_rdv, client_nom, client_prenom,
              client_email, client_telephone, problematique } = req.body;

      if (!slug || !offre_id || !client_nom || !client_email)
        return res.status(400).json({ error: 'Champs obligatoires manquants' });

      const { data: profil } = await admin().from('juridique_profil')
        .select('*').eq('slug', slug).eq('actif', true).single();
      if (!profil) return res.status(404).json({ error: 'Professionnel introuvable' });

      const { data: offre } = await admin().from('juridique_offres')
        .select('*').eq('id', offre_id).eq('profil_id', profil.id).eq('actif', true).single();
      if (!offre) return res.status(404).json({ error: 'Offre introuvable' });

      const prixTotal = Number(offre.prix);
      const commission = prixTotal * (profil.commission_jadomi_pct || COMMISSION_PCT) / 100;

      // Visio token si consultation visio
      const visioToken = offre.type === 'visio' ? crypto.randomUUID() : null;
      const visioUrl = visioToken ? `/visio/${visioToken}` : null;

      // Créer le paiement Stripe (100% en avance)
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(prixTotal * 100),
        currency: 'eur',
        metadata: {
          type: 'juridique_consultation',
          profil_id: profil.id,
          offre_id: offre.id,
          client_email
        }
      });

      // Créer la réservation
      const { data: reservation, error } = await admin().from('juridique_reservations')
        .insert({
          profil_id: profil.id,
          offre_id: offre.id,
          client_nom, client_prenom, client_email, client_telephone,
          problematique,
          date_rdv: date_rdv || null,
          heure_rdv: heure_rdv || null,
          duree_minutes: offre.duree_minutes,
          prix_total: prixTotal,
          commission_jadomi: commission,
          stripe_payment_intent_id: paymentIntent.id,
          visio_token: visioToken,
          visio_url: visioUrl,
          statut: 'en_attente'
        }).select('*').single();
      if (error) throw error;

      res.json({
        success: true,
        reservation,
        client_secret: paymentIntent.client_secret,
        visio_url: visioUrl
      });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // Confirmer après paiement Stripe réussi
  router.post('/confirmer/:id', async (req, res) => {
    try {
      const { data: rdv } = await admin().from('juridique_reservations')
        .select('*, offre:offre_id(titre, type)')
        .eq('id', req.params.id).single();
      if (!rdv) return res.status(404).json({ error: 'not_found' });

      await admin().from('juridique_reservations')
        .update({ statut: 'confirme' }).eq('id', rdv.id);

      // Récupérer le profil pour l'email
      const { data: profil } = await admin().from('juridique_profil')
        .select('titre, nom, prenom, email_contact, adresse, ville, telephone')
        .eq('id', rdv.profil_id).single();

      const nomPro = `${profil.titre || ''} ${profil.prenom} ${profil.nom}`.trim();
      const typeLabel = { cabinet: 'au cabinet', visio: 'en visioconférence', telephone: 'par téléphone', ecrit: 'par écrit', document: '(rédaction)' };

      // Email confirmation client
      let detailsHtml = '';
      if (rdv.offre?.type === 'visio' && rdv.visio_url) {
        detailsHtml = `<p><strong>Lien visio :</strong> <a href="https://jadomi.fr${rdv.visio_url}">Rejoindre la consultation</a></p>`;
      } else if (rdv.offre?.type === 'cabinet') {
        detailsHtml = `<p><strong>Adresse :</strong> ${profil.adresse || ''}, ${profil.ville || ''}</p>`;
      } else if (rdv.offre?.type === 'telephone') {
        detailsHtml = `<p><strong>Téléphone :</strong> ${profil.telephone || 'Le professionnel vous appellera'}</p>`;
      }

      await mailer.sendMail({
        to: rdv.client_email,
        subject: `Confirmation consultation ${typeLabel[rdv.offre?.type] || ''} — JADOMI`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:auto;">
          <h2 style="color:#1a1a2e;">Consultation confirmée ✓</h2>
          <p>Bonjour ${rdv.client_prenom || rdv.client_nom},</p>
          <p>Votre consultation avec <strong>${nomPro}</strong> est confirmée.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Type</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">${rdv.offre?.titre || ''} (${typeLabel[rdv.offre?.type] || ''})</td></tr>
            ${rdv.date_rdv ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Date</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">${rdv.date_rdv}${rdv.heure_rdv ? ' à ' + rdv.heure_rdv.slice(0, 5) : ''}</td></tr>` : ''}
            <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Montant réglé</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">${rdv.prix_total} €</td></tr>
          </table>
          ${detailsHtml}
          <p style="color:#666;font-size:13px;">Annulation gratuite jusqu'à 24h avant la consultation.</p>
          <p>Cordialement,<br>L'équipe JADOMI</p>
        </div>`
      });

      // Email notification pro
      if (profil.email_contact) {
        await mailer.sendMail({
          to: profil.email_contact,
          subject: `Nouvelle consultation — ${rdv.client_prenom || ''} ${rdv.client_nom}`,
          html: `<p>Bonjour ${nomPro},</p>
            <p>Nouvelle consultation réservée :</p>
            <ul>
              <li><strong>Client :</strong> ${rdv.client_prenom || ''} ${rdv.client_nom}</li>
              <li><strong>Type :</strong> ${rdv.offre?.titre || ''}</li>
              ${rdv.date_rdv ? `<li><strong>Date :</strong> ${rdv.date_rdv} à ${(rdv.heure_rdv || '').slice(0, 5)}</li>` : ''}
              <li><strong>Montant :</strong> ${rdv.prix_total}€ (dont commission JADOMI ${rdv.commission_jadomi}€)</li>
              ${rdv.problematique ? `<li><strong>Problématique :</strong> ${rdv.problematique}</li>` : ''}
            </ul>
            <p>Connectez-vous à votre dashboard JADOMI pour gérer cette consultation.</p>`
        });
      }

      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Annulation client
  router.post('/annuler/:id', async (req, res) => {
    try {
      const { client_email } = req.body;
      const { data: rdv } = await admin().from('juridique_reservations')
        .select('*').eq('id', req.params.id).eq('client_email', client_email).single();
      if (!rdv) return res.status(404).json({ error: 'Réservation introuvable' });
      if (['annule_client', 'annule_pro', 'rembourse', 'termine'].includes(rdv.statut))
        return res.status(400).json({ error: 'Cette réservation ne peut plus être annulée' });

      // Vérifier délai 24h
      const rdvDateTime = new Date(`${rdv.date_rdv}T${rdv.heure_rdv || '00:00'}`);
      const hoursUntil = (rdvDateTime.getTime() - Date.now()) / 3600000;

      if (hoursUntil > 24) {
        // Remboursement total
        if (rdv.stripe_payment_intent_id) {
          const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
          await stripe.refunds.create({ payment_intent: rdv.stripe_payment_intent_id });
        }
        await admin().from('juridique_reservations')
          .update({ statut: 'rembourse' }).eq('id', rdv.id);

        await mailer.sendMail({
          to: rdv.client_email,
          subject: 'Annulation confirmée — JADOMI',
          html: `<p>Bonjour ${rdv.client_prenom || rdv.client_nom},</p>
            <p>Votre consultation du ${rdv.date_rdv} a bien été annulée.</p>
            <p>Vous serez remboursé(e) de ${rdv.prix_total}€ sous 3-5 jours ouvrés.</p>
            <p>Cordialement,<br>L'équipe JADOMI</p>`
        });
        res.json({ success: true, rembourse: true });
      } else {
        // Non remboursable
        await admin().from('juridique_reservations')
          .update({ statut: 'annule_client' }).eq('id', rdv.id);

        await mailer.sendMail({
          to: rdv.client_email,
          subject: 'Annulation — JADOMI',
          html: `<p>Bonjour ${rdv.client_prenom || rdv.client_nom},</p>
            <p>Votre consultation du ${rdv.date_rdv} ne peut être annulée dans les 24h précédant le rendez-vous.</p>
            <p>Le paiement de ${rdv.prix_total}€ n'est pas remboursable.</p>
            <p>Souhaitez-vous reporter à une autre date ? Contactez le professionnel directement.</p>
            <p>Cordialement,<br>L'équipe JADOMI</p>`
        });
        res.json({ success: true, rembourse: false, message: 'Annulation < 24h : non remboursable' });
      }
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // Laisser un avis (après consultation terminée)
  router.post('/avis', async (req, res) => {
    try {
      const { reservation_id, note, commentaire, client_email } = req.body;
      if (!reservation_id || !note) return res.status(400).json({ error: 'reservation_id et note requis' });

      const { data: rdv } = await admin().from('juridique_reservations')
        .select('profil_id, client_nom, client_email, statut')
        .eq('id', reservation_id).single();
      if (!rdv) return res.status(404).json({ error: 'Réservation introuvable' });
      if (rdv.statut !== 'termine') return res.status(400).json({ error: 'La consultation doit être terminée' });
      if (client_email && rdv.client_email !== client_email)
        return res.status(403).json({ error: 'Email non autorisé' });

      // Vérifier doublon
      const { data: existing } = await admin().from('juridique_avis')
        .select('id').eq('reservation_id', reservation_id).maybeSingle();
      if (existing) return res.status(400).json({ error: 'Vous avez déjà laissé un avis' });

      const { data, error } = await admin().from('juridique_avis').insert({
        profil_id: rdv.profil_id,
        reservation_id,
        client_nom: rdv.client_nom,
        note: Math.min(5, Math.max(1, parseInt(note))),
        commentaire
      }).select('*').single();
      if (error) throw error;

      // Mettre à jour la note moyenne
      const { data: avisAll } = await admin().from('juridique_avis')
        .select('note').eq('profil_id', rdv.profil_id).eq('visible', true);
      const allNotes = avisAll || [];
      const moy = allNotes.length ? allNotes.reduce((s, a) => s + a.note, 0) / allNotes.length : 0;
      await admin().from('juridique_profil').update({
        note_moyenne: Math.round(moy * 10) / 10, nb_avis: allNotes.length
      }).eq('id', rdv.profil_id);

      res.json({ success: true, avis: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // Recherche de professionnels
  router.get('/search', async (req, res) => {
    try {
      let query = admin().from('juridique_profil')
        .select('id, slug, type_professionnel, titre, nom, prenom, photo_url, specialites, ville, note_moyenne, nb_avis')
        .eq('actif', true);

      if (req.query.specialite) {
        query = query.contains('specialites', [req.query.specialite]);
      }
      if (req.query.ville) {
        query = query.ilike('ville', `%${req.query.ville}%`);
      }
      if (req.query.type) {
        query = query.eq('type_professionnel', req.query.type);
      }

      query = query.order('note_moyenne', { ascending: false });
      const limit = Math.min(parseInt(req.query.limit || '10'), 50);
      query = query.limit(limit);

      const { data } = await query;
      let results = data || [];

      // Si filtre disponibilité, vérifier les créneaux
      if (req.query.disponible === 'true') {
        const today = new Date().toISOString().split('T')[0];
        const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
        const filtered = [];
        for (const p of results) {
          const { data: dispos } = await admin().from('juridique_disponibilites')
            .select('jour_semaine').eq('profil_id', p.id);
          if (dispos && dispos.length > 0) {
            // Récupérer la prochaine offre dispo pour affichage
            const { data: offres } = await admin().from('juridique_offres')
              .select('prix, type, titre, duree_minutes')
              .eq('profil_id', p.id).eq('actif', true).order('prix').limit(1);
            p.offre_min = offres?.[0] || null;
            filtered.push(p);
          }
        }
        results = filtered;
      } else {
        // Ajouter l'offre la moins chère
        for (const p of results) {
          const { data: offres } = await admin().from('juridique_offres')
            .select('prix, type, titre, duree_minutes')
            .eq('profil_id', p.id).eq('actif', true).order('prix').limit(1);
          p.offre_min = offres?.[0] || null;
        }
      }

      res.json({ success: true, professionnels: results });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Domaines disponibles avec comptage
  router.get('/domaines', async (req, res) => {
    try {
      const { data: profils } = await admin().from('juridique_profil')
        .select('specialites').eq('actif', true);

      const counts = {};
      for (const p of (profils || [])) {
        for (const spec of (p.specialites || [])) {
          counts[spec] = (counts[spec] || 0) + 1;
        }
      }

      const result = DOMAINES.map(d => ({
        ...d,
        nb_professionnels: counts[d.id] || 0
      }));

      res.json({ success: true, domaines: result });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Suggestions par type de société
  router.get('/suggestions/:type_societe', async (req, res) => {
    const type = req.params.type_societe;
    const suggested = SUGGESTIONS_BY_TYPE[type] || ['droit_commercial', 'droit_travail'];
    const result = suggested.map(id => DOMAINES.find(d => d.id === id)).filter(Boolean);
    res.json({ success: true, suggestions: result });
  });
};

// Helpers
function timeToMin(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}
function minToTime(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
function timesOverlap(h1, d1, h2, d2) {
  const s1 = timeToMin(h1), e1 = s1 + d1;
  const s2 = timeToMin(h2), e2 = s2 + d2;
  return s1 < e2 && s2 < e1;
}
