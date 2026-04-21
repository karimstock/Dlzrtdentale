// =============================================
// JADOMI — FEC Export Route
// GET /api/network/fec/:annee
// Genere le Fichier des Ecritures Comptables
// pour l'exercice fiscal demande
// =============================================
const { admin, requireSociete } = require('../multiSocietes/middleware');
const { generateFEC } = require('../facturx');

module.exports = function (router) {

  // GET /fec/:annee — Export FEC pour l'annee fiscale
  router.get('/fec/:annee', requireSociete(), async (req, res) => {
    try {
      const annee = parseInt(req.params.annee, 10);
      if (isNaN(annee) || annee < 2020 || annee > 2099) {
        return res.status(400).json({ error: 'Annee invalide (2020-2099)' });
      }

      const societeId = req.societe.id;
      const dateDebut = `${annee}-01-01`;
      const dateFin = `${annee}-12-31`;

      const entries = [];
      let ecritureNum = 1;

      // --- BTP Factures ---
      try {
        const { data: btpProfil } = await admin().from('btp_profil')
          .select('id').eq('societe_id', societeId).maybeSingle();

        if (btpProfil) {
          const { data: factures } = await admin().from('btp_factures')
            .select('numero, date_emission, client_nom, total_ht, total_tva, total_ttc, statut')
            .eq('profil_id', btpProfil.id)
            .gte('date_emission', dateDebut)
            .lte('date_emission', dateFin)
            .order('date_emission');

          (factures || []).forEach(f => {
            const d = (f.date_emission || '').replace(/-/g, '');
            const num = String(ecritureNum++).padStart(6, '0');

            // Ecriture client (debit 411)
            entries.push({
              journal_code: 'VE',
              journal_lib: 'Journal des ventes BTP',
              ecriture_num: num,
              ecriture_date: d,
              compte_num: '411000',
              compte_lib: 'Clients',
              comp_aux_num: '',
              comp_aux_lib: f.client_nom || '',
              piece_ref: f.numero || '',
              piece_date: d,
              ecriture_lib: `Facture ${f.numero || ''} - ${f.client_nom || ''}`,
              debit: f.total_ttc || 0,
              credit: 0,
              valid_date: d
            });

            // Ecriture produit (credit 706)
            entries.push({
              journal_code: 'VE',
              journal_lib: 'Journal des ventes BTP',
              ecriture_num: num,
              ecriture_date: d,
              compte_num: '706000',
              compte_lib: 'Prestations de services',
              piece_ref: f.numero || '',
              piece_date: d,
              ecriture_lib: `Facture ${f.numero || ''} - ${f.client_nom || ''}`,
              debit: 0,
              credit: f.total_ht || 0,
              valid_date: d
            });

            // Ecriture TVA collectee (credit 44571)
            if (f.total_tva > 0) {
              entries.push({
                journal_code: 'VE',
                journal_lib: 'Journal des ventes BTP',
                ecriture_num: num,
                ecriture_date: d,
                compte_num: '44571',
                compte_lib: 'TVA collectee',
                piece_ref: f.numero || '',
                piece_date: d,
                ecriture_lib: `TVA Facture ${f.numero || ''}`,
                debit: 0,
                credit: f.total_tva || 0,
                valid_date: d
              });
            }
          });
        }
      } catch (e) {
        console.warn('[FEC] Erreur BTP factures:', e.message);
      }

      // --- Services CA journalier ---
      try {
        const { data: caJournalier } = await admin().from('services_ca_journalier')
          .select('date_service, total_ht, total_tva, total_ttc, nb_services')
          .eq('societe_id', societeId)
          .gte('date_service', dateDebut)
          .lte('date_service', dateFin)
          .order('date_service');

        (caJournalier || []).forEach(c => {
          const d = (c.date_service || '').replace(/-/g, '');
          const num = String(ecritureNum++).padStart(6, '0');

          entries.push({
            journal_code: 'VE',
            journal_lib: 'Journal des ventes Services',
            ecriture_num: num,
            ecriture_date: d,
            compte_num: '411000',
            compte_lib: 'Clients',
            piece_ref: `CA-${c.date_service}`,
            piece_date: d,
            ecriture_lib: `CA journalier ${c.date_service} (${c.nb_services || 0} services)`,
            debit: c.total_ttc || 0,
            credit: 0,
            valid_date: d
          });

          entries.push({
            journal_code: 'VE',
            journal_lib: 'Journal des ventes Services',
            ecriture_num: num,
            ecriture_date: d,
            compte_num: '706000',
            compte_lib: 'Prestations de services',
            piece_ref: `CA-${c.date_service}`,
            piece_date: d,
            ecriture_lib: `CA journalier ${c.date_service}`,
            debit: 0,
            credit: c.total_ht || 0,
            valid_date: d
          });

          if (c.total_tva > 0) {
            entries.push({
              journal_code: 'VE',
              journal_lib: 'Journal des ventes Services',
              ecriture_num: num,
              ecriture_date: d,
              compte_num: '44571',
              compte_lib: 'TVA collectee',
              piece_ref: `CA-${c.date_service}`,
              piece_date: d,
              ecriture_lib: `TVA CA journalier ${c.date_service}`,
              debit: 0,
              credit: c.total_tva || 0,
              valid_date: d
            });
          }
        });
      } catch (e) {
        console.warn('[FEC] Erreur services CA:', e.message);
      }

      // --- Juridique Honoraires ---
      try {
        const { data: jurProfil } = await admin().from('juridique_profil')
          .select('id').eq('societe_id', societeId).maybeSingle();

        if (jurProfil) {
          const { data: honoraires } = await admin().from('juridique_honoraires')
            .select('reference, date_acte, client_nom, montant_brut, commission_jadomi, montant_net')
            .eq('profil_id', jurProfil.id)
            .gte('date_acte', dateDebut)
            .lte('date_acte', dateFin)
            .order('date_acte');

          (honoraires || []).forEach(h => {
            const d = (h.date_acte || '').replace(/-/g, '');
            const num = String(ecritureNum++).padStart(6, '0');

            entries.push({
              journal_code: 'VE',
              journal_lib: 'Journal des honoraires',
              ecriture_num: num,
              ecriture_date: d,
              compte_num: '411000',
              compte_lib: 'Clients',
              comp_aux_lib: h.client_nom || '',
              piece_ref: h.reference || '',
              piece_date: d,
              ecriture_lib: `Honoraires ${h.reference || ''} - ${h.client_nom || ''}`,
              debit: h.montant_brut || 0,
              credit: 0,
              valid_date: d
            });

            entries.push({
              journal_code: 'VE',
              journal_lib: 'Journal des honoraires',
              ecriture_num: num,
              ecriture_date: d,
              compte_num: '706100',
              compte_lib: 'Honoraires',
              piece_ref: h.reference || '',
              piece_date: d,
              ecriture_lib: `Honoraires ${h.reference || ''}`,
              debit: 0,
              credit: h.montant_brut || 0,
              valid_date: d
            });
          });
        }
      } catch (e) {
        console.warn('[FEC] Erreur juridique honoraires:', e.message);
      }

      // Generer le fichier FEC
      const fecContent = generateFEC(entries);
      const siren = req.societe.siret ? req.societe.siret.substring(0, 9) : 'XXXXXXXXX';
      const filename = `${siren}FEC${annee}1231.txt`;

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(fecContent);

    } catch (err) {
      console.error('[FEC] Erreur export:', err);
      res.status(500).json({ error: 'Erreur lors de la generation du FEC' });
    }
  });

  console.log('[JADOMI] Route /api/network/fec montee');
};
