// =============================================
// JADOMI — Services : Réservations
// =============================================
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');
const { sendMail } = require('../multiSocietes/mailer');

const COMMISSION_FULL = parseFloat(process.env.JADOMI_SERVICES_COMMISSION_PCT || '5');
const COMMISSION_ACOMPTE = parseFloat(process.env.JADOMI_SERVICES_COMMISSION_PCT_ACOMPTE || '8');

module.exports = function (router) {
  // LIST réservations avec filtres
  router.get('/reservations', requireSociete(), async (req, res) => {
    try {
      const { statut, date_debut, date_fin, client_id, praticien_id, page = 1, limit = 50 } = req.query;
      let query = admin()
        .from('services_reservations')
        .select('*, prestation:prestation_id(nom, duree, couleur, prix), praticien:praticien_id(nom, prenom), client:client_id(nom, prenom, email, telephone)', { count: 'exact' })
        .eq('societe_id', req.societe.id)
        .order('date_heure', { ascending: false })
        .range((page - 1) * limit, page * limit - 1);

      if (statut) query = query.eq('statut', statut);
      if (date_debut) query = query.gte('date_heure', `${date_debut}T00:00:00`);
      if (date_fin) query = query.lte('date_heure', `${date_fin}T23:59:59`);
      if (client_id) query = query.eq('client_id', client_id);
      if (praticien_id) query = query.eq('praticien_id', praticien_id);

      const { data, error, count } = await query;
      if (error) throw error;
      res.json({ reservations: data || [], total: count });
    } catch (e) {
      console.error('[services/reservations] GET:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST — Creer un RDV manuellement (depuis l'agenda pro)
  router.post('/reservations', requireSociete(), async (req, res) => {
    try {
      const {
        client_nom, client_prenom, client_email, client_telephone,
        prestation_id, praticien_id, date_heure,
        duree_minutes, prix_total, notes_pro, statut
      } = req.body;

      if (!client_nom || !prestation_id || !date_heure) {
        return res.status(400).json({ error: 'client_nom, prestation_id et date_heure requis' });
      }

      // Find or create client
      let clientId = null;
      if (client_email) {
        const { data: existing } = await admin()
          .from('services_clients')
          .select('id')
          .eq('societe_id', req.societe.id)
          .eq('email', client_email)
          .maybeSingle();
        if (existing) {
          clientId = existing.id;
        } else {
          const { data: newClient } = await admin()
            .from('services_clients')
            .insert({
              societe_id: req.societe.id,
              nom: client_nom, prenom: client_prenom || null,
              email: client_email, telephone: client_telephone || null
            })
            .select('id')
            .maybeSingle();
          clientId = newClient?.id || null;
        }
      }

      const { data, error } = await admin()
        .from('services_reservations')
        .insert({
          societe_id: req.societe.id,
          prestation_id, praticien_id: praticien_id || null,
          client_id: clientId,
          client_nom, client_prenom: client_prenom || null,
          client_email: client_email || null,
          client_telephone: client_telephone || null,
          date_heure, duree_minutes: duree_minutes || 30,
          prix_total: prix_total || 0,
          notes_pro: notes_pro || null,
          statut: statut || 'confirme'
        })
        .select('*, prestation:prestation_id(nom, duree, couleur, prix), praticien:praticien_id(nom, prenom)')
        .single();

      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id, action: 'reservation_create', entity: 'services_reservations', entityId: data.id, req });
      res.json({ reservation: data });
    } catch (e) {
      console.error('[services/reservations] POST:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH statut
  router.patch('/reservations/:id', requireSociete(), async (req, res) => {
    try {
      const { statut, notes } = req.body;
      const updates = { updated_at: new Date().toISOString() };
      if (statut) updates.statut = statut;
      if (notes !== undefined) updates.notes = notes;

      // Fetch current reservation
      const { data: current } = await admin()
        .from('services_reservations')
        .select('*, prestation:prestation_id(nom, prix)')
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id)
        .single();
      if (!current) return res.status(404).json({ error: 'Réservation introuvable' });

      const { data, error } = await admin()
        .from('services_reservations')
        .update(updates)
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id)
        .select()
        .single();
      if (error) throw error;

      // On 'termine' -> créer entrée CA
      if (statut === 'termine') {
        const prix = current.montant_total || current.prestation?.prix || 0;
        const isAcompte = current.montant_acompte && current.montant_acompte < prix;
        const commissionPct = isAcompte ? COMMISSION_ACOMPTE : COMMISSION_FULL;
        const commission = Math.round(prix * commissionPct) / 100;
        const net = prix - commission;

        await admin().from('services_comptabilite').insert({
          societe_id: req.societe.id,
          reservation_id: req.params.id,
          type: 'prestation',
          libelle: `Prestation : ${current.prestation?.nom || 'RDV'}`,
          montant_brut: prix,
          commission_pct: commissionPct,
          commission_montant: commission,
          montant_net: net,
          date: new Date().toISOString().split('T')[0]
        });
      }

      // On 'annule_pro' -> refund Stripe + email
      if (statut === 'annule_pro') {
        if (current.stripe_payment_intent) {
          try {
            const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
            await stripe.refunds.create({ payment_intent: current.stripe_payment_intent });
          } catch (stripeErr) {
            console.error('[services/reservations] Stripe refund:', stripeErr.message);
          }
        }
        if (current.client_email || current.client?.email) {
          await sendMail({
            to: current.client_email || current.client?.email,
            subject: 'Annulation de votre rendez-vous — JADOMI',
            html: `<p>Bonjour,</p>
              <p>Votre rendez-vous <strong>${current.prestation?.nom || ''}</strong> a été annulé par le professionnel.</p>
              <p>Si un acompte a été versé, il vous sera remboursé sous 5-10 jours ouvrés.</p>
              <p>L'équipe JADOMI</p>`
          });
        }
      }

      await auditLog({ userId: req.user.id, societeId: req.societe.id, action: `reservation_${statut || 'update'}`, entity: 'services_reservations', entityId: req.params.id, req });
      res.json({ reservation: data });
    } catch (e) {
      console.error('[services/reservations] PATCH:', e.message);
      res.status(500).json({ error: e.message });
    }
  });
};
