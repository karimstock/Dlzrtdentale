// JADOMI — BTP : Devis
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');
const mailer = require('../multiSocietes/mailer');

async function getProfilId(societeId) {
  const { data } = await admin().from('btp_profil').select('id').eq('societe_id', societeId).maybeSingle();
  return data?.id;
}

async function getProfil(societeId) {
  const { data } = await admin().from('btp_profil').select('*').eq('societe_id', societeId).maybeSingle();
  return data;
}

function getTvaTravaux(chantier, profil) {
  if (!chantier?.type_logement || chantier.type_logement === 'neuf' || chantier.type_logement === 'renovation_moins_2ans')
    return profil.tva_travaux_neuf || 20;
  return profil.tva_travaux_renovation || 10;
}

function calculateTotals(body, tvaTravaux) {
  const lignes_mo = body.lignes_main_oeuvre || [];
  const lignes_four = body.lignes_fournitures || [];
  const lignes_dep = body.lignes_deplacement || [];

  const sous_total_mo = lignes_mo.reduce((s, l) => s + (l.total || (l.quantite || 0) * (l.prix_unitaire || 0)), 0);
  const sous_total_fournitures = lignes_four.reduce((s, l) => s + (l.total || (l.quantite || 0) * (l.prix_unitaire || 0)), 0);
  const sous_total_deplacement = lignes_dep.reduce((s, l) => s + (l.total || (l.quantite || 0) * (l.prix_unitaire || 0)), 0);

  const remise_pct = body.remise_pct || 0;
  const total_ht_brut = sous_total_mo + sous_total_fournitures + sous_total_deplacement;
  const remise_montant = total_ht_brut * remise_pct / 100;
  const total_ht = total_ht_brut - remise_montant;

  // TVA: travaux (MO + deplacement) au taux chantier, fournitures a 20%
  const tva_fournitures = 20;
  const tva_mo = (sous_total_mo + sous_total_deplacement) * (1 - remise_pct / 100) * tvaTravaux / 100;
  const tva_four = sous_total_fournitures * (1 - remise_pct / 100) * tva_fournitures / 100;
  const total_tva = tva_mo + tva_four;
  const total_ttc = total_ht + total_tva;

  const acompte_pct = body.acompte_pct || 0;
  const acompte_montant = total_ttc * acompte_pct / 100;

  return {
    sous_total_mo: Math.round(sous_total_mo * 100) / 100,
    sous_total_fournitures: Math.round(sous_total_fournitures * 100) / 100,
    sous_total_deplacement: Math.round(sous_total_deplacement * 100) / 100,
    remise_pct,
    remise_montant: Math.round(remise_montant * 100) / 100,
    total_ht: Math.round(total_ht * 100) / 100,
    tva_taux_travaux: tvaTravaux,
    tva_taux_fournitures: tva_fournitures,
    total_tva: Math.round(total_tva * 100) / 100,
    total_ttc: Math.round(total_ttc * 100) / 100,
    acompte_pct,
    acompte_montant: Math.round(acompte_montant * 100) / 100
  };
}

async function generateNumero(profilId, year) {
  const { count } = await admin().from('btp_devis')
    .select('id', { count: 'exact', head: true })
    .eq('profil_id', profilId)
    .gte('created_at', `${year}-01-01`)
    .lt('created_at', `${year + 1}-01-01`);
  const seq = ((count || 0) + 1).toString().padStart(3, '0');
  return `DEV-${year}-${seq}`;
}

module.exports = function (router) {
  // GET liste devis
  router.get('/devis', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      let q = admin().from('btp_devis')
        .select('*, chantier:chantier_id(id, reference, titre), client:client_id(id, nom, prenom)')
        .eq('profil_id', profilId)
        .order('created_at', { ascending: false });

      if (req.query.statut) q = q.eq('statut', req.query.statut);
      const { data, error } = await q;
      if (error) throw error;
      res.json({ success: true, devis: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // POST creer devis
  router.post('/devis', requireSociete(), async (req, res) => {
    try {
      const profil = await getProfil(req.societe.id);
      if (!profil) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const year = new Date().getFullYear();
      const numero = await generateNumero(profil.id, year);

      // Recuperer le chantier pour le taux TVA
      let tvaTravaux = profil.tva_travaux_neuf || 20;
      if (req.body.chantier_id) {
        const { data: chantier } = await admin().from('btp_chantiers')
          .select('type_logement').eq('id', req.body.chantier_id).single();
        tvaTravaux = getTvaTravaux(chantier, profil);
      }

      const totals = calculateTotals(req.body, tvaTravaux);

      const { data, error } = await admin().from('btp_devis')
        .insert({
          ...req.body,
          ...totals,
          profil_id: profil.id,
          numero,
          statut: req.body.statut || 'brouillon'
        })
        .select('*').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'create', entity: 'btp_devis', entityId: data.id, req });
      res.json({ success: true, devis: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // GET detail devis
  router.get('/devis/:id', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const { data, error } = await admin().from('btp_devis')
        .select('*, chantier:chantier_id(*), client:client_id(*)')
        .eq('id', req.params.id).eq('profil_id', profilId).single();
      if (error) throw error;
      res.json({ success: true, devis: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // PATCH modifier devis (recalcule totaux)
  router.patch('/devis/:id', requireSociete(), async (req, res) => {
    try {
      const profil = await getProfil(req.societe.id);
      if (!profil) return res.status(404).json({ error: 'Profil BTP introuvable' });

      // Recalculer si lignes fournies
      let updates = { ...req.body, updated_at: new Date().toISOString() };
      if (req.body.lignes_main_oeuvre || req.body.lignes_fournitures || req.body.lignes_deplacement) {
        // Recuperer le devis existant pour merger les lignes manquantes
        const { data: existing } = await admin().from('btp_devis')
          .select('*, chantier:chantier_id(type_logement)').eq('id', req.params.id).single();

        const merged = {
          lignes_main_oeuvre: req.body.lignes_main_oeuvre || existing.lignes_main_oeuvre || [],
          lignes_fournitures: req.body.lignes_fournitures || existing.lignes_fournitures || [],
          lignes_deplacement: req.body.lignes_deplacement || existing.lignes_deplacement || [],
          remise_pct: req.body.remise_pct !== undefined ? req.body.remise_pct : existing.remise_pct,
          acompte_pct: req.body.acompte_pct !== undefined ? req.body.acompte_pct : existing.acompte_pct
        };

        const tvaTravaux = getTvaTravaux(existing.chantier, profil);
        const totals = calculateTotals(merged, tvaTravaux);
        updates = { ...updates, ...totals };
      }

      const { data, error } = await admin().from('btp_devis')
        .update(updates).eq('id', req.params.id).eq('profil_id', profil.id)
        .select('*').single();
      if (error) throw error;
      res.json({ success: true, devis: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // POST envoyer devis par email
  router.post('/devis/:id/envoyer', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const { data: devis, error } = await admin().from('btp_devis')
        .select('*, client:client_id(*)')
        .eq('id', req.params.id).eq('profil_id', profilId).single();
      if (error) throw error;

      if (!devis.client?.email) return res.status(400).json({ error: 'Le client n\'a pas d\'adresse email' });

      await mailer.send({
        to: devis.client.email,
        subject: `Devis ${devis.numero}`,
        html: `<p>Bonjour ${devis.client.prenom || ''} ${devis.client.nom || ''},</p>
               <p>Veuillez trouver ci-joint votre devis <strong>${devis.numero}</strong> d'un montant de <strong>${devis.total_ttc} EUR TTC</strong>.</p>
               <p>Cordialement,</p>`
      });

      const { data: updated } = await admin().from('btp_devis')
        .update({ statut: 'envoye', date_envoi: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .select('*').single();

      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'send', entity: 'btp_devis', entityId: devis.id, req });
      res.json({ success: true, devis: updated });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // POST convertir devis en facture
  router.post('/devis/:id/convertir-facture', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const { data: devis, error: errDevis } = await admin().from('btp_devis')
        .select('*').eq('id', req.params.id).eq('profil_id', profilId).single();
      if (errDevis) throw errDevis;

      // Generer numero facture
      const year = new Date().getFullYear();
      const { count } = await admin().from('btp_factures')
        .select('id', { count: 'exact', head: true })
        .eq('profil_id', profilId)
        .gte('created_at', `${year}-01-01`)
        .lt('created_at', `${year + 1}-01-01`);
      const seq = ((count || 0) + 1).toString().padStart(3, '0');
      const numero = `FACT-${year}-${seq}`;

      const { data: facture, error } = await admin().from('btp_factures')
        .insert({
          profil_id: profilId,
          chantier_id: devis.chantier_id,
          client_id: devis.client_id,
          devis_id: devis.id,
          numero,
          type_facture: 'finale',
          total_ht: devis.total_ht,
          total_tva: devis.total_tva,
          total_ttc: devis.total_ttc,
          lignes_main_oeuvre: devis.lignes_main_oeuvre,
          lignes_fournitures: devis.lignes_fournitures,
          lignes_deplacement: devis.lignes_deplacement,
          statut: 'brouillon'
        })
        .select('*').single();
      if (error) throw error;

      // Mettre a jour le devis
      await admin().from('btp_devis')
        .update({ statut: 'accepte', facture_id: facture.id, updated_at: new Date().toISOString() })
        .eq('id', req.params.id);

      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'convert_to_facture', entity: 'btp_devis', entityId: devis.id,
        meta: { facture_id: facture.id }, req });
      res.json({ success: true, facture });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });
};
