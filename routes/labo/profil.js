// =============================================
// JADOMI LABO — Routes profil prothesiste
// =============================================

const express = require('express');
const router = express.Router();
const { admin } = require('../../api/multiSocietes/middleware');

// GET /api/labo/profil — Recup profil prothesiste
router.get('/', async (req, res) => {
  try {
    if (!req.prothesiste) {
      return res.json({ exists: false, prothesiste: null });
    }
    res.json({ exists: true, prothesiste: req.prothesiste });
  } catch (e) {
    console.error('[LABO profil GET]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/labo/profil — Creer profil prothesiste
router.post('/', async (req, res) => {
  try {
    if (req.prothesiste) {
      return res.status(400).json({ error: 'Profil déjà existant, utilisez PUT' });
    }

    const body = req.body;
    const { data, error } = await admin()
      .from('labo_prothesistes')
      .insert({
        societe_id: req.societeId,
        raison_sociale: body.raison_sociale,
        forme_juridique: body.forme_juridique,
        siren: body.siren,
        siret: body.siret,
        numero_dmmes: body.numero_dmmes,
        code_ape: body.code_ape || '3250A',
        capital_social: body.capital_social,
        adresse_ligne1: body.adresse_ligne1,
        adresse_ligne2: body.adresse_ligne2,
        code_postal: body.code_postal,
        ville: body.ville,
        pays: body.pays || 'France',
        telephone: body.telephone,
        email: body.email,
        site_web: body.site_web,
        iban: body.iban,
        bic: body.bic,
        regime_tva: body.regime_tva || 'franchise_base',
        rcs_ville: body.rcs_ville,
        numero_rcs: body.numero_rcs,
        prefix_bl: body.prefix_bl || 'BL',
        prefix_facture: body.prefix_facture || 'F',
        pays_fabrication: body.pays_fabrication || 'France',
        responsable_qualite: body.responsable_qualite
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, prothesiste: data });
  } catch (e) {
    console.error('[LABO profil POST]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/labo/profil — Modifier profil prothesiste
router.put('/', async (req, res) => {
  try {
    if (!req.prothesisteId) {
      return res.status(404).json({ error: 'Profil non trouve' });
    }

    const body = req.body;
    const updates = {};
    const allowed = [
      'raison_sociale', 'forme_juridique', 'siren', 'siret', 'numero_dmmes',
      'code_ape', 'capital_social', 'adresse_ligne1', 'adresse_ligne2',
      'code_postal', 'ville', 'pays', 'telephone', 'email', 'site_web',
      'iban', 'bic', 'logo_url', 'signature_url', 'regime_tva',
      'mention_tva_franchise', 'mention_exoneration', 'rcs_ville', 'numero_rcs',
      'prefix_bl', 'prefix_facture', 'pays_fabrication', 'responsable_qualite'
    ];

    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    const { data, error } = await admin()
      .from('labo_prothesistes')
      .update(updates)
      .eq('id', req.prothesisteId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, prothesiste: data });
  } catch (e) {
    console.error('[LABO profil PUT]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/labo/profil/template-catalogue — Installer le template JADOMI
router.post('/template-catalogue', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    // Verifier si deja des produits template
    const { count } = await admin()
      .from('catalogue_produits')
      .select('*', { count: 'exact', head: true })
      .eq('prothesiste_id', req.prothesisteId)
      .eq('source_ajout', 'template_jadomi');

    if (count > 0) {
      return res.status(400).json({ error: 'Template déjà installé', count });
    }

    // Lire le SQL template et remplacer le placeholder
    const fs = require('fs');
    const path = require('path');
    const sqlPath = path.join(__dirname, '../../seeds/catalogue-template.sql');
    let sql = fs.readFileSync(sqlPath, 'utf8');
    sql = sql.replace(/__PROTHESISTE_ID__/g, `${req.prothesisteId}`);

    // Executer via admin
    const { error } = await admin().rpc('exec_sql', { sql_text: sql }).catch(() => {
      // Fallback : parser les INSERTs et executer un par un
      return { error: 'rpc_unavailable' };
    });

    // Si rpc indisponible, on insere via l'API
    if (error) {
      const templateProduits = require('../../seeds/catalogue-template-data');
      const produits = templateProduits.map(p => ({
        ...p,
        prothesiste_id: req.prothesisteId
      }));

      const { error: insErr } = await admin()
        .from('catalogue_produits')
        .insert(produits);

      if (insErr) throw insErr;
    }

    res.json({ success: true, message: 'Template catalogue installe' });
  } catch (e) {
    console.error('[LABO template]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
