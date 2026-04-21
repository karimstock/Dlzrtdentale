// JADOMI — BTP : Comptabilite & Statistiques
const { admin, requireSociete, auditLog } = require('../multiSocietes/middleware');

async function getProfilId(societeId) {
  const { data } = await admin().from('btp_profil').select('id').eq('societe_id', societeId).maybeSingle();
  return data?.id;
}

module.exports = function (router) {
  // GET stats dashboard
  router.get('/comptabilite/stats', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth(); // 0-indexed
      const quarter = Math.floor(month / 3);

      const monthStart = new Date(year, month, 1).toISOString();
      const quarterStart = new Date(year, quarter * 3, 1).toISOString();
      const yearStart = `${year}-01-01T00:00:00.000Z`;

      // Factures payees
      const { data: facturesPayees } = await admin().from('btp_factures')
        .select('total_ttc, total_ht, date_paiement')
        .eq('profil_id', profilId).eq('statut', 'payee');

      const ca_mois = (facturesPayees || [])
        .filter(f => f.date_paiement >= monthStart)
        .reduce((s, f) => s + (f.total_ttc || 0), 0);
      const ca_trimestre = (facturesPayees || [])
        .filter(f => f.date_paiement >= quarterStart)
        .reduce((s, f) => s + (f.total_ttc || 0), 0);
      const ca_annee = (facturesPayees || [])
        .filter(f => f.date_paiement >= yearStart)
        .reduce((s, f) => s + (f.total_ttc || 0), 0);

      // Devis en attente
      const { data: devisAttente } = await admin().from('btp_devis')
        .select('total_ttc')
        .eq('profil_id', profilId)
        .in('statut', ['brouillon', 'envoye']);
      const devis_en_attente = (devisAttente || []).reduce((s, d) => s + (d.total_ttc || 0), 0);

      // Impayes
      const { data: impayes } = await admin().from('btp_factures')
        .select('total_ttc')
        .eq('profil_id', profilId).eq('statut', 'en_retard');
      const total_impayes = (impayes || []).reduce((s, f) => s + (f.total_ttc || 0), 0);

      // Chantiers en cours
      const { count: chantiers_en_cours } = await admin().from('btp_chantiers')
        .select('id', { count: 'exact', head: true })
        .eq('profil_id', profilId).eq('statut', 'en_cours');

      // Marge moyenne
      const { data: chantiersTermines } = await admin().from('btp_chantiers')
        .select('marge').eq('profil_id', profilId).eq('statut', 'termine').not('marge', 'is', null);
      const marge_moyenne = chantiersTermines && chantiersTermines.length > 0
        ? chantiersTermines.reduce((s, c) => s + (c.marge || 0), 0) / chantiersTermines.length
        : null;

      res.json({
        success: true,
        stats: {
          ca_mois: Math.round(ca_mois * 100) / 100,
          ca_trimestre: Math.round(ca_trimestre * 100) / 100,
          ca_annee: Math.round(ca_annee * 100) / 100,
          devis_en_attente: Math.round(devis_en_attente * 100) / 100,
          total_impayes: Math.round(total_impayes * 100) / 100,
          chantiers_en_cours: chantiers_en_cours || 0,
          marge_moyenne: marge_moyenne != null ? Math.round(marge_moyenne * 100) / 100 : null
        }
      });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // GET CA detaille
  router.get('/comptabilite/ca', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const { data: factures } = await admin().from('btp_factures')
        .select('total_ht, total_ttc, date_paiement, chantier:chantier_id(type_travaux, ouvriers_ids)')
        .eq('profil_id', profilId).eq('statut', 'payee');

      // Ventilation par type_travaux
      const parType = {};
      const parMois = {};
      (factures || []).forEach(f => {
        const type = f.chantier?.type_travaux || 'non_classe';
        parType[type] = (parType[type] || 0) + (f.total_ht || 0);

        if (f.date_paiement) {
          const mois = f.date_paiement.slice(0, 7); // YYYY-MM
          parMois[mois] = (parMois[mois] || 0) + (f.total_ht || 0);
        }
      });

      res.json({ success: true, ca: { par_type_travaux: parType, par_mois: parMois } });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // GET charges
  router.get('/comptabilite/charges', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const { data, error } = await admin().from('btp_charges')
        .select('*').eq('profil_id', profilId)
        .order('date_charge', { ascending: false });
      if (error) throw error;
      res.json({ success: true, charges: data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // POST ajouter charge
  router.post('/comptabilite/charges', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const { data, error } = await admin().from('btp_charges')
        .insert({ ...req.body, profil_id: profilId })
        .select('*').single();
      if (error) throw error;
      await auditLog({ userId: req.user.id, societeId: req.societe.id,
        action: 'create', entity: 'btp_charges', entityId: data.id, req });
      res.json({ success: true, charge: data });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
  });

  // GET export CSV annee
  router.get('/comptabilite/export/:annee', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const annee = parseInt(req.params.annee);
      const debut = `${annee}-01-01`;
      const fin = `${annee + 1}-01-01`;

      const { data: factures } = await admin().from('btp_factures')
        .select('numero, type_facture, statut, total_ht, total_tva, total_ttc, date_paiement, mode_paiement, client:client_id(nom, prenom)')
        .eq('profil_id', profilId)
        .gte('created_at', debut).lt('created_at', fin)
        .order('created_at');

      // Generer CSV
      const headers = ['Numero', 'Type', 'Statut', 'Client', 'HT', 'TVA', 'TTC', 'Date paiement', 'Mode paiement'];
      const rows = (factures || []).map(f => [
        f.numero,
        f.type_facture,
        f.statut,
        `${f.client?.prenom || ''} ${f.client?.nom || ''}`.trim(),
        f.total_ht,
        f.total_tva,
        f.total_ttc,
        f.date_paiement || '',
        f.mode_paiement || ''
      ]);

      const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=export-btp-${annee}.csv`);
      res.send('\uFEFF' + csv); // BOM pour Excel
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // GET resume TVA annee
  router.get('/comptabilite/tva/:annee', requireSociete(), async (req, res) => {
    try {
      const profilId = await getProfilId(req.societe.id);
      if (!profilId) return res.status(404).json({ error: 'Profil BTP introuvable' });

      const annee = parseInt(req.params.annee);
      const debut = `${annee}-01-01`;
      const fin = `${annee + 1}-01-01`;

      // Factures emises (TVA collectee)
      const { data: factures } = await admin().from('btp_factures')
        .select('total_ht, total_tva, total_ttc, tva_taux_travaux, tva_taux_fournitures, sous_total_mo, sous_total_fournitures, sous_total_deplacement, remise_pct')
        .eq('profil_id', profilId)
        .in('statut', ['envoyee', 'payee'])
        .gte('created_at', debut).lt('created_at', fin);

      let collectee_10 = 0;
      let collectee_20 = 0;

      (factures || []).forEach(f => {
        const remiseCoeff = 1 - (f.remise_pct || 0) / 100;
        const moDepHt = ((f.sous_total_mo || 0) + (f.sous_total_deplacement || 0)) * remiseCoeff;
        const fourHt = (f.sous_total_fournitures || 0) * remiseCoeff;

        if (f.tva_taux_travaux === 10) {
          collectee_10 += moDepHt * 0.10;
        } else {
          collectee_20 += moDepHt * (f.tva_taux_travaux || 20) / 100;
        }
        collectee_20 += fourHt * 0.20;
      });

      // Charges (TVA deductible)
      const { data: charges } = await admin().from('btp_charges')
        .select('montant_tva')
        .eq('profil_id', profilId)
        .gte('date_charge', debut).lt('date_charge', fin);
      const deductible = (charges || []).reduce((s, c) => s + (c.montant_tva || 0), 0);

      const total_collectee = collectee_10 + collectee_20;
      const a_reverser = total_collectee - deductible;

      res.json({
        success: true,
        tva: {
          annee,
          collectee_10: Math.round(collectee_10 * 100) / 100,
          collectee_20: Math.round(collectee_20 * 100) / 100,
          total_collectee: Math.round(total_collectee * 100) / 100,
          deductible: Math.round(deductible * 100) / 100,
          a_reverser: Math.round(a_reverser * 100) / 100
        }
      });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
};
