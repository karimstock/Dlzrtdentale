// JADOMI — BTP : Routes publiques (sans auth)
const { admin } = require('../multiSocietes/middleware');
const mailer = require('../multiSocietes/mailer');

module.exports = function (router) {
  // GET profil public artisan par slug
  router.get('/profil/:slug', async (req, res) => {
    try {
      const { data, error } = await admin().from('btp_profil')
        .select('id, nom_entreprise, slug, ville, departement, metiers, description, photo_url, certifications, assurance_decennale, siret, annee_creation, zone_intervention, telephone_public, email_public, site_web, horaires, note_moyenne, nb_avis')
        .eq('slug', req.params.slug).eq('actif', true).maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Artisan non trouve' });
      res.json({ success: true, profil: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // GET avis publics par slug
  router.get('/avis/:slug', async (req, res) => {
    try {
      const { data: profil } = await admin().from('btp_profil')
        .select('id').eq('slug', req.params.slug).eq('actif', true).maybeSingle();
      if (!profil) return res.status(404).json({ error: 'Artisan non trouve' });

      const { data: avis, error } = await admin().from('btp_avis')
        .select('id, auteur_nom, note, commentaire, type_travaux, created_at')
        .eq('profil_id', profil.id).eq('publie', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ success: true, avis: avis || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // POST demande de devis publique
  router.post('/demande-devis', async (req, res) => {
    try {
      const { profil_id, nom, prenom, email, telephone, description, type_travaux, ville, adresse } = req.body;
      if (!profil_id || !nom || !email) {
        return res.status(400).json({ error: 'profil_id, nom et email requis' });
      }

      // Enregistrer la demande
      const { data: demande, error } = await admin().from('btp_demandes_devis')
        .insert({ profil_id, nom, prenom, email, telephone, description, type_travaux, ville, adresse })
        .select('*').single();
      if (error) throw error;

      // Recuperer l'email de l'artisan pour notification
      const { data: profil } = await admin().from('btp_profil')
        .select('nom_entreprise, email_notification, societe_id')
        .eq('id', profil_id).single();

      if (profil?.email_notification) {
        await mailer.send({
          to: profil.email_notification,
          subject: `Nouvelle demande de devis - ${nom} ${prenom || ''}`,
          html: `<p>Vous avez recu une nouvelle demande de devis via JADOMI.</p>
                 <p><strong>Client :</strong> ${prenom || ''} ${nom}<br>
                 <strong>Email :</strong> ${email}<br>
                 <strong>Telephone :</strong> ${telephone || 'Non renseigne'}<br>
                 <strong>Type de travaux :</strong> ${type_travaux || 'Non precise'}<br>
                 <strong>Description :</strong> ${description || 'Non precisee'}</p>`
        });
      }

      res.json({ success: true, demande: { id: demande.id } });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // GET recherche artisans
  router.get('/search', async (req, res) => {
    try {
      let q = admin().from('btp_profil')
        .select('id, nom_entreprise, slug, ville, departement, metiers, description, photo_url, certifications, note_moyenne, nb_avis, zone_intervention')
        .eq('actif', true)
        .order('note_moyenne', { ascending: false });

      if (req.query.metier) {
        q = q.contains('metiers', [req.query.metier]);
      }
      if (req.query.ville) {
        q = q.ilike('ville', `%${req.query.ville}%`);
      }
      if (req.query.certification) {
        q = q.contains('certifications', [req.query.certification]);
      }
      if (req.query.departement) {
        q = q.eq('departement', req.query.departement);
      }

      const { data, error } = await q;
      if (error) throw error;
      res.json({ success: true, artisans: data || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
};
