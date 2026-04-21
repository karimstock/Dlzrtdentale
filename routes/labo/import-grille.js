// =============================================
// JADOMI LABO — Routes import grille tarifaire
// Upload + extraction IA + matching
// =============================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { admin } = require('../../api/multiSocietes/middleware');
const { extraireDepuisTexte, extraireDepuisImage, extraireDepuisPdfTexte } = require('../../services/ia-extraction');
const { matcherBatch } = require('../../services/product-matcher');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20Mo
});

// POST /api/labo/import-grille/upload — Upload + extraction IA
router.post('/upload', upload.single('fichier'), async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });
    if (!req.file) return res.status(400).json({ error: 'Fichier requis' });

    const file = req.file;
    const ext = file.originalname.split('.').pop().toLowerCase();
    let type_fichier = 'pdf';
    if (['xlsx', 'xls'].includes(ext)) type_fichier = 'xlsx';
    else if (['csv'].includes(ext)) type_fichier = 'csv';
    else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) type_fichier = 'image';

    // Upload vers Supabase Storage
    const filePath = `${req.prothesisteId}/${Date.now()}_${file.originalname}`;
    const { error: uploadErr } = await admin().storage
      .from('grilles-tarifaires')
      .upload(filePath, file.buffer, { contentType: file.mimetype });

    if (uploadErr) console.warn('[LABO import] Upload storage warn:', uploadErr.message);

    // Creer l'import en DB
    const { data: importRow, error: insErr } = await admin()
      .from('imports_grilles')
      .insert({
        prothesiste_id: req.prothesisteId,
        fichier_original_url: filePath,
        type_fichier,
        statut: 'en_cours'
      })
      .select()
      .single();

    if (insErr) throw insErr;

    // Extraction IA
    let extraction;
    try {
      if (type_fichier === 'image') {
        const base64 = file.buffer.toString('base64');
        const mediaType = file.mimetype || 'image/png';
        extraction = await extraireDepuisImage(base64, mediaType);
      } else if (type_fichier === 'csv') {
        const texte = file.buffer.toString('utf8');
        extraction = await extraireDepuisTexte(texte);
      } else if (type_fichier === 'xlsx') {
        // Tenter parse xlsx si disponible
        try {
          const XLSX = require('xlsx');
          const workbook = XLSX.read(file.buffer, { type: 'buffer' });
          let texte = '';
          for (const sheetName of workbook.SheetNames) {
            texte += XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]) + '\n';
          }
          extraction = await extraireDepuisTexte(texte);
        } catch (xlsxErr) {
          // Fallback : envoyer comme texte brut
          extraction = await extraireDepuisTexte(file.buffer.toString('utf8'));
        }
      } else {
        // PDF
        try {
          const pdfParse = require('pdf-parse');
          const pdfData = await pdfParse(file.buffer);
          extraction = await extraireDepuisPdfTexte(pdfData.text);
        } catch (pdfErr) {
          // Fallback : envoyer comme image
          const base64 = file.buffer.toString('base64');
          extraction = await extraireDepuisImage(base64, 'application/pdf');
        }
      }
    } catch (iaErr) {
      await admin().from('imports_grilles')
        .update({ statut: 'rejete' })
        .eq('id', importRow.id);
      return res.status(422).json({ error: 'Erreur extraction IA: ' + iaErr.message });
    }

    // Charger catalogue existant pour matching
    const { data: catalogueExistant } = await admin()
      .from('catalogue_produits')
      .select('id, nom, prix_unitaire, categorie, type_produit')
      .eq('prothesiste_id', req.prothesisteId)
      .eq('est_actif', true);

    // Matching
    const produits = extraction.produits || [];
    const matchResults = matcherBatch(produits, catalogueExistant || []);

    // Sauvegarder les lignes d'import
    const allLignes = [
      ...matchResults.matches_auto,
      ...matchResults.a_verifier,
      ...matchResults.nouveaux
    ];

    if (allLignes.length > 0) {
      const lignesInsert = allLignes.map(l => ({
        import_id: importRow.id,
        nom_extrait: l.nom,
        prix_extrait: l.prix_ht,
        categorie_suggeree: l.categorie_suggeree,
        type_produit_suggere: l.type_produit,
        tva_applicable_suggeree: l.tva_applicable,
        code_ccam_extrait: l.code_ccam,
        produit_existant_id: l.produit_existant_id,
        score_match: l.score_match,
        action: l.action
      }));

      await admin().from('lignes_import').insert(lignesInsert);
    }

    // Update import
    await admin().from('imports_grilles')
      .update({
        statut: 'extrait',
        produits_extraits: produits.length,
        produits_matches: matchResults.matches_auto.length,
        produits_nouveaux: matchResults.nouveaux.length,
        extraction_brute: extraction
      })
      .eq('id', importRow.id);

    res.json({
      success: true,
      import_id: importRow.id,
      stats: {
        total_extraits: produits.length,
        matches_auto: matchResults.matches_auto.length,
        a_verifier: matchResults.a_verifier.length,
        nouveaux: matchResults.nouveaux.length
      }
    });
  } catch (e) {
    console.error('[LABO import upload]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/labo/import-grille/:id — Detail import + lignes
router.get('/:id', async (req, res) => {
  try {
    const { data: imp, error } = await admin()
      .from('imports_grilles')
      .select('*')
      .eq('id', req.params.id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (error || !imp) return res.status(404).json({ error: 'Import non trouve' });

    const { data: lignes } = await admin()
      .from('lignes_import')
      .select('*, catalogue_produits:produit_existant_id(nom, prix_unitaire)')
      .eq('import_id', imp.id)
      .order('action').order('score_match', { ascending: false });

    res.json({ import: imp, lignes: lignes || [] });
  } catch (e) {
    console.error('[LABO import GET]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/labo/import-grille — Liste imports
router.get('/', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { data, error } = await admin()
      .from('imports_grilles')
      .select('*')
      .eq('prothesiste_id', req.prothesisteId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ imports: data || [] });
  } catch (e) {
    console.error('[LABO imports list]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/labo/import-grille/:id/valider — Valider un import
router.post('/:id/valider', async (req, res) => {
  try {
    const { lignes_validees } = req.body; // [{id, action, prix_override?}]
    if (!lignes_validees || !Array.isArray(lignes_validees)) {
      return res.status(400).json({ error: 'lignes_validees requis' });
    }

    let updated = 0;
    let created = 0;

    for (const lv of lignes_validees) {
      const { data: ligne } = await admin()
        .from('lignes_import')
        .select('*')
        .eq('id', lv.id)
        .single();

      if (!ligne) continue;

      if (lv.action === 'ignore') {
        await admin().from('lignes_import')
          .update({ action: 'ignore', validated: true })
          .eq('id', lv.id);
        continue;
      }

      if (lv.action === 'match_valide' && ligne.produit_existant_id) {
        // Update prix du produit existant
        await admin().from('catalogue_produits')
          .update({ prix_unitaire: lv.prix_override || ligne.prix_extrait })
          .eq('id', ligne.produit_existant_id);
        updated++;
      } else {
        // Creer nouveau produit
        await admin().from('catalogue_produits').insert({
          prothesiste_id: req.prothesisteId,
          categorie: ligne.categorie_suggeree || 'autre',
          nom: ligne.nom_extrait,
          prix_unitaire: lv.prix_override || ligne.prix_extrait || 0,
          tva_applicable: ligne.tva_applicable_suggeree || false,
          taux_tva: ligne.tva_applicable_suggeree ? 20 : 0,
          type_produit: ligne.type_produit_suggere || 'prothese',
          code_ccam: ligne.code_ccam_extrait,
          source_ajout: 'import_ia',
          import_batch_id: req.params.id
        });
        created++;
      }

      await admin().from('lignes_import')
        .update({ action: lv.action || ligne.action, validated: true })
        .eq('id', lv.id);
    }

    // Update statut import
    await admin().from('imports_grilles')
      .update({ statut: 'valide', validated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    res.json({ success: true, updated, created });
  } catch (e) {
    console.error('[LABO import valider]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
