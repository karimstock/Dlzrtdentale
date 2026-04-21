// =============================================
// JADOMI — Services : Liste d'attente
// =============================================
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');
const { sendMail } = require('../multiSocietes/mailer');

const EXPIRY_HOURS = 2;

module.exports = function (router) {
  // LIST liste d'attente
  router.get('/liste-attente', requireSociete(), async (req, res) => {
    try {
      const { prestation_id, statut } = req.query;
      let query = admin()
        .from('services_liste_attente')
        .select('*, prestation:prestation_id(nom, duree, prix)')
        .eq('societe_id', req.societe.id)
        .order('created_at', { ascending: true });
      if (prestation_id) query = query.eq('prestation_id', prestation_id);
      if (statut) query = query.eq('statut', statut);
      else query = query.eq('statut', 'en_attente');

      const { data, error } = await query;
      if (error) throw error;
      res.json({ liste: data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST ajouter en liste d'attente
  router.post('/liste-attente', requireSociete(), async (req, res) => {
    try {
      const { prestation_id, client_nom, client_email, client_telephone, date_souhaitee, notes } = req.body;
      if (!client_email) return res.status(400).json({ error: 'Email requis' });

      const { data, error } = await admin()
        .from('services_liste_attente')
        .insert({
          societe_id: req.societe.id,
          prestation_id: prestation_id || null,
          client_nom, client_email, client_telephone,
          date_souhaitee: date_souhaitee || null,
          notes: notes || null,
          statut: 'en_attente',
          expire_at: null
        })
        .select()
        .single();
      if (error) throw error;
      res.json({ entry: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST notify — quand un créneau se libère
  router.post('/liste-attente/notify', requireSociete(), async (req, res) => {
    try {
      const { prestation_id, date_creneau, heure_creneau } = req.body;

      // Get first in queue
      let query = admin()
        .from('services_liste_attente')
        .select('*')
        .eq('societe_id', req.societe.id)
        .eq('statut', 'en_attente')
        .order('created_at', { ascending: true })
        .limit(5);
      if (prestation_id) query = query.eq('prestation_id', prestation_id);

      const { data: waiters, error } = await query;
      if (error) throw error;
      if (!waiters?.length) return res.json({ notified: 0 });

      const expireAt = new Date(Date.now() + EXPIRY_HOURS * 3600 * 1000).toISOString();
      let notified = 0;

      for (const w of waiters) {
        await admin()
          .from('services_liste_attente')
          .update({ statut: 'notifie', expire_at: expireAt })
          .eq('id', w.id);

        await sendMail({
          to: w.client_email,
          subject: 'Un créneau s\'est libéré ! — JADOMI',
          html: `<p>Bonjour ${w.client_nom || ''},</p>
            <p>Un créneau s'est libéré le <strong>${date_creneau || 'prochainement'} à ${heure_creneau || ''}</strong>.</p>
            <p>Vous avez <strong>${EXPIRY_HOURS}h</strong> pour réserver avant que le créneau ne soit proposé à quelqu'un d'autre.</p>
            <p>L'équipe JADOMI</p>`
        });
        notified++;
      }

      await auditLog({ userId: req.user.id, societeId: req.societe.id, action: 'liste_attente_notify', entity: 'services_liste_attente', meta: { notified, prestation_id }, req });
      res.json({ notified });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE
  router.delete('/liste-attente/:id', requireSociete(), async (req, res) => {
    try {
      const { error } = await admin()
        .from('services_liste_attente')
        .delete()
        .eq('id', req.params.id)
        .eq('societe_id', req.societe.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
};
