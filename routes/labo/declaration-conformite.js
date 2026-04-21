// =============================================
// JADOMI LABO — Routes declarations conformite CE
// =============================================

const express = require('express');
const router = express.Router();
const { admin } = require('../../api/multiSocietes/middleware');

// GET /api/labo/declarations — Liste declarations
router.get('/', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil requis' });

    const { data, error } = await admin()
      .from('declarations_conformite')
      .select('*, bons_livraison!inner(numero_bl, date_bl, patient_initiales, prothesiste_id)')
      .eq('bons_livraison.prothesiste_id', req.prothesisteId)
      .order('date_doc', { ascending: false });

    if (error) throw error;
    res.json({ declarations: data || [] });
  } catch (e) {
    console.error('[LABO declarations GET]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/labo/declarations/:id/pdf — Telecharger PDF declaration
router.get('/:id/pdf', async (req, res) => {
  try {
    const { data: decl } = await admin()
      .from('declarations_conformite')
      .select('pdf_url, numero_doc')
      .eq('id', req.params.id)
      .single();

    if (!decl || !decl.pdf_url) return res.status(404).json({ error: 'PDF non disponible' });

    const { data, error } = await admin().storage.from('doc-pdf').download(decl.pdf_url);
    if (error) throw error;

    const buffer = Buffer.from(await data.arrayBuffer());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="DC_${decl.numero_doc}.pdf"`);
    res.send(buffer);
  } catch (e) {
    console.error('[LABO declaration pdf]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
