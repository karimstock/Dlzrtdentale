// =============================================
// JADOMI LABO — Routes bons de livraison
// =============================================

const express = require('express');
const router = express.Router();
const { admin } = require('../../api/multiSocietes/middleware');
const { calculerLigne, calculerTotaux } = require('../../services/tva-calculator');
const { genererBLPdf, genererDeclarationCEPdf } = require('../../services/pdf-generator');

// GET /api/labo/bons-livraison — Liste BL
router.get('/', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { statut, dentiste_id, from, to } = req.query;
    let query = admin()
      .from('bons_livraison')
      .select('*, dentistes_clients!inner(nom, prenom, titre)')
      .eq('prothesiste_id', req.prothesisteId)
      .order('date_bl', { ascending: false });

    if (statut) query = query.eq('statut', statut);
    if (dentiste_id) query = query.eq('dentiste_id', dentiste_id);
    if (from) query = query.gte('date_bl', from);
    if (to) query = query.lte('date_bl', to);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ bons_livraison: data || [] });
  } catch (e) {
    console.error('[LABO BL GET]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/labo/bons-livraison/:id — Detail BL + lignes
router.get('/:id', async (req, res) => {
  try {
    const { data: bl, error } = await admin()
      .from('bons_livraison')
      .select('*, dentistes_clients(*)')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (error || !bl) return res.status(404).json({ error: 'BL non trouve' });

    const { data: lignes } = await admin()
      .from('lignes_bl')
      .select('*, catalogue_produits:produit_id(nom, categorie)')
      .eq('bl_id', bl.id)
      .order('ordre');

    res.json({ bl, lignes: lignes || [] });
  } catch (e) {
    console.error('[LABO BL detail]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/labo/bons-livraison — Creer BL
router.post('/', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const b = req.body;
    if (!b.dentiste_id || !b.lignes || !b.lignes.length) {
      return res.status(400).json({ error: 'dentiste_id et lignes requis' });
    }

    // Generer numero BL sequentiel
    const proth = req.prothesiste;
    const numeroBl = `${proth.prefix_bl || 'BL'}${String(proth.prochain_numero_bl || 1).padStart(5, '0')}`;

    // Calculer les lignes
    const lignesCalc = b.lignes.map((l, i) => {
      const calc = calculerLigne({
        prix_unitaire: l.prix_unitaire,
        quantite: l.quantite,
        remise_pct: l.remise_pct,
        tva_applicable: l.tva_applicable,
        taux_tva: l.taux_tva
      });
      return {
        produit_id: l.produit_id || null,
        designation: l.designation,
        quantite: l.quantite || 1,
        prix_unitaire: l.prix_unitaire,
        remise_pct: l.remise_pct || 0,
        ...calc,
        tva_applicable: l.tva_applicable || false,
        materiau: l.materiau || null,
        numero_lot_materiau: l.numero_lot_materiau || null,
        teinte_specifique: l.teinte_specifique || null,
        ordre: i
      };
    });

    // Calculer totaux
    const totaux = calculerTotaux(lignesCalc);

    // Inserer BL
    const { data: newBl, error: blErr } = await admin()
      .from('bons_livraison')
      .insert({
        prothesiste_id: req.prothesisteId,
        dentiste_id: b.dentiste_id,
        numero_bl: numeroBl,
        date_bl: b.date_bl || new Date().toISOString().split('T')[0],
        patient_initiales: b.patient_initiales,
        patient_reference_interne: b.patient_reference_interne,
        teintier_utilise: b.teintier_utilise,
        teinte_principale: b.teinte_principale,
        teinte_collet: b.teinte_collet,
        teinte_incisive: b.teinte_incisive,
        teinte_gingivale: b.teinte_gingivale,
        teinte_notes: b.teinte_notes,
        stratification: b.stratification,
        notes_techniques: b.notes_techniques,
        date_livraison_prevue: b.date_livraison_prevue,
        statut: 'brouillon',
        ...totaux
      })
      .select()
      .single();

    if (blErr) throw blErr;

    // Inserer lignes
    const lignesInsert = lignesCalc.map(l => ({ ...l, bl_id: newBl.id }));
    const { error: ligErr } = await admin()
      .from('lignes_bl')
      .insert(lignesInsert);

    if (ligErr) throw ligErr;

    // Incrementer compteur
    await admin()
      .from('labo_prothesistes')
      .update({ prochain_numero_bl: (proth.prochain_numero_bl || 1) + 1 })
      .eq('id', req.prothesisteId);

    res.json({ success: true, bl: newBl, numero_bl: numeroBl });
  } catch (e) {
    console.error('[LABO BL POST]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/labo/bons-livraison/:id — Modifier BL (brouillon uniquement)
router.put('/:id', async (req, res) => {
  try {
    // Verifier statut
    const { data: existing } = await admin()
      .from('bons_livraison')
      .select('statut')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (!existing) return res.status(404).json({ error: 'BL non trouve' });
    if (existing.statut !== 'brouillon') {
      return res.status(400).json({ error: 'Seuls les BL brouillon sont modifiables' });
    }

    const b = req.body;

    // Recalculer lignes si fournies
    if (b.lignes && b.lignes.length) {
      // Supprimer anciennes lignes
      await admin().from('lignes_bl').delete().eq('bl_id', req.params.id);

      const lignesCalc = b.lignes.map((l, i) => {
        const calc = calculerLigne({
          prix_unitaire: l.prix_unitaire,
          quantite: l.quantite,
          remise_pct: l.remise_pct,
          tva_applicable: l.tva_applicable,
          taux_tva: l.taux_tva
        });
        return {
          bl_id: req.params.id,
          produit_id: l.produit_id || null,
          designation: l.designation,
          quantite: l.quantite || 1,
          prix_unitaire: l.prix_unitaire,
          remise_pct: l.remise_pct || 0,
          ...calc,
          tva_applicable: l.tva_applicable || false,
          materiau: l.materiau || null,
          numero_lot_materiau: l.numero_lot_materiau || null,
          teinte_specifique: l.teinte_specifique || null,
          ordre: i
        };
      });

      await admin().from('lignes_bl').insert(lignesCalc);

      const totaux = calculerTotaux(lignesCalc);
      b.total_ht_exonere = totaux.total_ht_exonere;
      b.total_ht_taxable = totaux.total_ht_taxable;
      b.total_tva = totaux.total_tva;
      b.total_ttc = totaux.total_ttc;
    }

    // Update BL
    const updates = {};
    const allowed = [
      'dentiste_id', 'date_bl', 'patient_initiales', 'patient_reference_interne',
      'teintier_utilise', 'teinte_principale', 'teinte_collet', 'teinte_incisive',
      'teinte_gingivale', 'teinte_notes', 'stratification', 'notes_techniques',
      'date_livraison_prevue', 'total_ht_exonere', 'total_ht_taxable', 'total_tva', 'total_ttc'
    ];
    for (const k of allowed) {
      if (b[k] !== undefined) updates[k] = b[k];
    }

    const { data, error } = await admin()
      .from('bons_livraison')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, bl: data });
  } catch (e) {
    console.error('[LABO BL PUT]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/labo/bons-livraison/:id/valider — Valider BL → generer PDFs
router.post('/:id/valider', async (req, res) => {
  try {
    const { data: bl } = await admin()
      .from('bons_livraison')
      .select('*')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (!bl) return res.status(404).json({ error: 'BL non trouve' });
    if (bl.statut !== 'brouillon') return res.status(400).json({ error: 'BL deja valide' });

    const { data: dentiste } = await admin()
      .from('dentistes_clients')
      .select('*')
      .eq('id', bl.dentiste_id)
      .single();

    const { data: lignes } = await admin()
      .from('lignes_bl')
      .select('*')
      .eq('bl_id', bl.id)
      .order('ordre');

    const prothesiste = req.prothesiste;

    // Generer PDF BL
    const pdfBl = await genererBLPdf({
      prothesiste,
      dentiste,
      bl,
      lignes: lignes || [],
      teintes: {
        teintier: bl.teintier_utilise,
        principale: bl.teinte_principale,
        collet: bl.teinte_collet,
        incisive: bl.teinte_incisive,
        gingivale: bl.teinte_gingivale,
        notes: bl.teinte_notes
      }
    });

    // Upload PDF BL
    const blPdfPath = `${req.prothesisteId}/bl/${bl.numero_bl}.pdf`;
    await admin().storage.from('bl-pdf').upload(blPdfPath, pdfBl, {
      contentType: 'application/pdf', upsert: true
    });

    // Generer Declaration Conformite CE
    const pdfDoc = await genererDeclarationCEPdf({
      prothesiste,
      dentiste,
      bl,
      lignes: lignes || [],
      declaration: {}
    });

    const docPdfPath = `${req.prothesisteId}/doc/${bl.numero_bl}_DC.pdf`;
    await admin().storage.from('doc-pdf').upload(docPdfPath, pdfDoc, {
      contentType: 'application/pdf', upsert: true
    });

    // Creer declaration en DB
    const numDoc = `DC-${bl.numero_bl}`;
    const materiaux = (lignes || [])
      .filter(l => l.materiau)
      .map(l => ({ designation: l.designation, materiau: l.materiau, lot: l.numero_lot_materiau }));

    await admin().from('declarations_conformite').insert({
      bl_id: bl.id,
      numero_doc: numDoc,
      date_doc: bl.date_bl,
      pdf_url: docPdfPath,
      materiaux_json: materiaux,
      praticien_prescripteur: `${dentiste.titre || 'Dr'} ${dentiste.prenom || ''} ${dentiste.nom}`.trim(),
      patient_identification: `${bl.patient_initiales || ''} ${bl.patient_reference_interne || ''}`.trim()
    });

    // Mettre a jour statut BL
    await admin().from('bons_livraison')
      .update({
        statut: 'livre',
        pdf_bl_url: blPdfPath,
        pdf_doc_url: docPdfPath
      })
      .eq('id', bl.id);

    res.json({
      success: true,
      pdf_bl_url: blPdfPath,
      pdf_doc_url: docPdfPath,
      declaration_numero: numDoc
    });
  } catch (e) {
    console.error('[LABO BL valider]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/labo/bons-livraison/:id — Supprimer BL brouillon
router.delete('/:id', async (req, res) => {
  try {
    const { data: bl } = await admin()
      .from('bons_livraison')
      .select('statut')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (!bl) return res.status(404).json({ error: 'BL non trouve' });
    if (bl.statut !== 'brouillon') return res.status(400).json({ error: 'Seuls les BL brouillon sont supprimables' });

    await admin().from('lignes_bl').delete().eq('bl_id', req.params.id);
    await admin().from('bons_livraison').delete().eq('id', req.params.id);

    res.json({ success: true });
  } catch (e) {
    console.error('[LABO BL DELETE]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/labo/bons-livraison/:id/pdf — Telecharger PDF BL
router.get('/:id/pdf', async (req, res) => {
  try {
    const { data: bl } = await admin()
      .from('bons_livraison')
      .select('pdf_bl_url, numero_bl')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (!bl || !bl.pdf_bl_url) return res.status(404).json({ error: 'PDF non disponible' });

    const { data, error } = await admin().storage.from('bl-pdf').download(bl.pdf_bl_url);
    if (error) throw error;

    const buffer = Buffer.from(await data.arrayBuffer());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="BL_${bl.numero_bl}.pdf"`);
    res.send(buffer);
  } catch (e) {
    console.error('[LABO BL pdf]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
