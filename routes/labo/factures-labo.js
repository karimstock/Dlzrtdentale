// =============================================
// JADOMI LABO — Routes factures labo
// Facturation mensuelle groupee
// =============================================

const express = require('express');
const router = express.Router();
const { admin } = require('../../api/multiSocietes/middleware');
const { calculerTotaux } = require('../../services/tva-calculator');
const { genererFacturePdf } = require('../../services/pdf-generator');
const { envoyerFacture, envoyerFacturesBatch } = require('../../services/email-sender');

// GET /api/labo/factures — Liste factures
router.get('/', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { statut, dentiste_id } = req.query;
    let query = admin()
      .from('factures_labo')
      .select('*, dentistes_clients!inner(nom, prenom, titre, email)')
      .eq('prothesiste_id', req.prothesisteId)
      .order('date_facture', { ascending: false });

    if (statut) query = query.eq('statut', statut);
    if (dentiste_id) query = query.eq('dentiste_id', dentiste_id);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ factures: data || [] });
  } catch (e) {
    console.error('[LABO factures GET]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/labo/factures/a-facturer — BL livres non factures groupes par dentiste
router.get('/a-facturer', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { periode_debut, periode_fin } = req.query;
    let query = admin()
      .from('bons_livraison')
      .select('*, dentistes_clients!inner(id, nom, prenom, titre, email), lignes_bl(*)')
      .eq('prothesiste_id', req.prothesisteId)
      .eq('statut', 'livre')
      .is('facture_id', null);

    if (periode_debut) query = query.gte('date_bl', periode_debut);
    if (periode_fin) query = query.lte('date_bl', periode_fin);

    const { data: bls, error } = await query.order('date_bl');
    if (error) throw error;

    // Grouper par dentiste
    const parDentiste = {};
    for (const bl of (bls || [])) {
      const dId = bl.dentiste_id;
      if (!parDentiste[dId]) {
        parDentiste[dId] = {
          dentiste: bl.dentistes_clients,
          bons: [],
          total_ttc: 0
        };
      }
      parDentiste[dId].bons.push(bl);
      parDentiste[dId].total_ttc += Number(bl.total_ttc) || 0;
    }

    const groupes = Object.values(parDentiste);
    const totalGlobal = groupes.reduce((s, g) => s + g.total_ttc, 0);

    res.json({
      groupes,
      stats: {
        nb_factures: groupes.length,
        nb_bls: (bls || []).length,
        total_ttc: Math.round(totalGlobal * 100) / 100
      }
    });
  } catch (e) {
    console.error('[LABO a-facturer]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/labo/factures/generer — Generer toutes les factures du mois
router.post('/generer', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { periode_debut, periode_fin, remise_globale_pct, dentiste_ids } = req.body;
    if (!periode_debut || !periode_fin) {
      return res.status(400).json({ error: 'periode_debut et periode_fin requis' });
    }

    // Recuperer BL livres non factures
    let query = admin()
      .from('bons_livraison')
      .select('*, lignes_bl(*)')
      .eq('prothesiste_id', req.prothesisteId)
      .eq('statut', 'livre')
      .is('facture_id', null)
      .gte('date_bl', periode_debut)
      .lte('date_bl', periode_fin);

    if (dentiste_ids && dentiste_ids.length) {
      query = query.in('dentiste_id', dentiste_ids);
    }

    const { data: bls, error: blErr } = await query;
    if (blErr) throw blErr;

    if (!bls || bls.length === 0) {
      return res.json({ success: true, factures: [], message: 'Aucun BL a facturer' });
    }

    // Grouper par dentiste
    const parDentiste = {};
    for (const bl of bls) {
      if (!parDentiste[bl.dentiste_id]) parDentiste[bl.dentiste_id] = [];
      parDentiste[bl.dentiste_id].push(bl);
    }

    const prothesiste = req.prothesiste;
    const facturesCreees = [];
    let numFacture = prothesiste.prochain_numero_facture || 1;

    for (const [dentisteId, blsDentiste] of Object.entries(parDentiste)) {
      const numero = `${prothesiste.prefix_facture || 'F'}${String(numFacture).padStart(5, '0')}`;

      // Calculer totaux de tous les BL
      let totalHtExo = 0, totalHtTax = 0, totalTva = 0;
      for (const bl of blsDentiste) {
        totalHtExo += Number(bl.total_ht_exonere) || 0;
        totalHtTax += Number(bl.total_ht_taxable) || 0;
        totalTva += Number(bl.total_tva) || 0;
      }

      // Appliquer remise globale
      const rg = Number(remise_globale_pct) || 0;
      if (rg > 0) {
        const coef = 1 - rg / 100;
        totalHtExo *= coef;
        totalHtTax *= coef;
        totalTva *= coef;
      }

      totalHtExo = Math.round(totalHtExo * 100) / 100;
      totalHtTax = Math.round(totalHtTax * 100) / 100;
      totalTva = Math.round(totalTva * 100) / 100;
      const totalTtc = Math.round((totalHtExo + totalHtTax + totalTva) * 100) / 100;

      // Creer facture
      const { data: facture, error: facErr } = await admin()
        .from('factures_labo')
        .insert({
          prothesiste_id: req.prothesisteId,
          dentiste_id: dentisteId,
          numero_facture: numero,
          date_facture: new Date().toISOString().split('T')[0],
          periode_debut,
          periode_fin,
          total_ht_exonere: totalHtExo,
          total_ht_taxable: totalHtTax,
          total_tva: totalTva,
          total_ttc: totalTtc,
          remise_globale_pct: rg,
          statut: 'brouillon'
        })
        .select()
        .single();

      if (facErr) throw facErr;

      // Lier les BL a la facture
      for (const bl of blsDentiste) {
        await admin().from('bons_livraison')
          .update({ facture_id: facture.id, statut: 'facture' })
          .eq('id', bl.id);
      }

      // Generer PDF
      const { data: dentiste } = await admin()
        .from('dentistes_clients')
        .select('*')
        .eq('id', dentisteId)
        .single();

      const bonsAvecLignes = blsDentiste.map(bl => ({
        ...bl,
        lignes: bl.lignes_bl || []
      }));

      const pdfBuffer = await genererFacturePdf({
        prothesiste, dentiste, facture,
        bonsLivraison: bonsAvecLignes
      });

      const pdfPath = `${req.prothesisteId}/factures/${numero}.pdf`;
      await admin().storage.from('factures-labo-pdf').upload(pdfPath, pdfBuffer, {
        contentType: 'application/pdf', upsert: true
      });

      await admin().from('factures_labo')
        .update({ pdf_url: pdfPath, statut: 'emise' })
        .eq('id', facture.id);

      facturesCreees.push({ ...facture, pdf_url: pdfPath, dentiste_nom: dentiste?.nom });
      numFacture++;
    }

    // Mettre a jour compteur
    await admin().from('labo_prothesistes')
      .update({ prochain_numero_facture: numFacture })
      .eq('id', req.prothesisteId);

    res.json({ success: true, factures: facturesCreees });
  } catch (e) {
    console.error('[LABO factures generer]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/labo/factures/envoyer — Envoyer factures par email
router.post('/envoyer', async (req, res) => {
  try {
    const { facture_ids } = req.body;
    if (!facture_ids || !facture_ids.length) {
      return res.status(400).json({ error: 'facture_ids requis' });
    }

    const prothesiste = req.prothesiste;
    const envois = [];

    for (const fId of facture_ids) {
      const { data: facture } = await admin()
        .from('factures_labo')
        .select('*')
        .eq('id', fId)
        .eq('prothesiste_id', req.prothesisteId)
        .single();

      if (!facture || !facture.pdf_url) continue;

      const { data: dentiste } = await admin()
        .from('dentistes_clients')
        .select('*')
        .eq('id', facture.dentiste_id)
        .single();

      if (!dentiste || !dentiste.email) continue;

      // Telecharger PDF
      const { data: pdfData } = await admin().storage
        .from('factures-labo-pdf')
        .download(facture.pdf_url);

      if (!pdfData) continue;
      const pdfBuffer = Buffer.from(await pdfData.arrayBuffer());

      envois.push({ dentiste, facture, prothesiste, pdfBuffer });
    }

    const resultats = await envoyerFacturesBatch(envois);

    // Mettre a jour date_envoi
    for (const r of resultats) {
      if (r.success) {
        const envoi = envois.find(e => e.dentiste.email === r.email);
        if (envoi) {
          await admin().from('factures_labo')
            .update({ date_envoi: new Date().toISOString() })
            .eq('id', envoi.facture.id);
        }
      }
    }

    res.json({ success: true, resultats });
  } catch (e) {
    console.error('[LABO factures envoyer]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/labo/factures/:id — Detail facture
router.get('/:id', async (req, res) => {
  try {
    const { data: facture, error } = await admin()
      .from('factures_labo')
      .select('*, dentistes_clients(*)')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (error || !facture) return res.status(404).json({ error: 'Facture non trouvee' });

    // Recuperer les BL lies
    const { data: bls } = await admin()
      .from('bons_livraison')
      .select('*, lignes_bl(*)')
      .eq('facture_id', facture.id)
      .order('date_bl');

    res.json({ facture, bons_livraison: bls || [] });
  } catch (e) {
    console.error('[LABO facture detail]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/labo/factures/:id/payer — Marquer comme payee
router.patch('/:id/payer', async (req, res) => {
  try {
    const { mode_paiement, date_paiement } = req.body;

    const { data, error } = await admin()
      .from('factures_labo')
      .update({
        statut: 'payee',
        mode_paiement: mode_paiement || null,
        date_paiement: date_paiement || new Date().toISOString().split('T')[0]
      })
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, facture: data });
  } catch (e) {
    console.error('[LABO facture payer]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/labo/factures/:id/avoir — Creer un avoir
router.post('/:id/avoir', async (req, res) => {
  try {
    const { data: facture } = await admin()
      .from('factures_labo')
      .select('*')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (!facture) return res.status(404).json({ error: 'Facture non trouvee' });

    const { motif, montant } = req.body;
    const totalAvoir = montant || facture.total_ttc;

    const { data: avoir, error } = await admin()
      .from('avoirs_labo')
      .insert({
        prothesiste_id: req.prothesisteId,
        facture_id: facture.id,
        dentiste_id: facture.dentiste_id,
        numero_avoir: `AV-${facture.numero_facture}`,
        motif: motif || 'Annulation',
        total_ttc: totalAvoir
      })
      .select()
      .single();

    if (error) throw error;

    // Marquer facture comme annulee si avoir total
    if (totalAvoir >= facture.total_ttc) {
      await admin().from('factures_labo')
        .update({ statut: 'annulee', avoir_id: avoir.id })
        .eq('id', facture.id);
    }

    res.json({ success: true, avoir });
  } catch (e) {
    console.error('[LABO avoir]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/labo/factures/:id/pdf — Telecharger PDF
router.get('/:id/pdf', async (req, res) => {
  try {
    const { data: facture } = await admin()
      .from('factures_labo')
      .select('pdf_url, numero_facture')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (!facture || !facture.pdf_url) return res.status(404).json({ error: 'PDF non disponible' });

    const { data, error } = await admin().storage.from('factures-labo-pdf').download(facture.pdf_url);
    if (error) throw error;

    const buffer = Buffer.from(await data.arrayBuffer());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Facture_${facture.numero_facture}.pdf"`);
    res.send(buffer);
  } catch (e) {
    console.error('[LABO facture pdf]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
