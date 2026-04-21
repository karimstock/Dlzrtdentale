// =============================================
// JADOMI LABO — Portail dentiste (acces externe)
// Magic link auth pour dentistes clients
// =============================================

const express = require('express');
const router = express.Router();
const { admin } = require('../../api/multiSocietes/middleware');
const crypto = require('crypto');

// POST /api/labo/portail-dentiste/magic-link — Generer magic link
router.post('/magic-link', async (req, res) => {
  try {
    const { dentiste_id } = req.body;
    if (!dentiste_id) return res.status(400).json({ error: 'dentiste_id requis' });

    const { data: dentiste } = await admin()
      .from('dentistes_clients')
      .select('*')
      .eq('id', dentiste_id)
      .eq('prothesiste_id', req.prothesisteId)
      .single();

    if (!dentiste) return res.status(404).json({ error: 'Dentiste non trouve' });

    // Generer token unique
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours

    // Stocker dans metadata dentiste (simple, sans table supplementaire)
    await admin().from('dentistes_clients')
      .update({
        notes: JSON.stringify({
          ...(dentiste.notes ? JSON.parse(dentiste.notes).catch ? {} : {} : {}),
          portal_token: token,
          portal_expires: expires.toISOString()
        })
      })
      .eq('id', dentiste_id);

    const link = `https://jadomi.fr/portail-dentiste.html?token=${token}`;
    res.json({ success: true, link, expires: expires.toISOString() });
  } catch (e) {
    console.error('[LABO magic-link]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/labo/portail-dentiste/factures — Factures du dentiste (via token)
router.get('/factures', async (req, res) => {
  try {
    // Pour le portail, on utilise le contexte du dentiste connecte via le middleware
    // En attendant auth dentiste, on utilise dentiste_id en query
    const dentisteId = req.query.dentiste_id;
    if (!dentisteId) return res.status(400).json({ error: 'dentiste_id requis' });

    const { data, error } = await admin()
      .from('factures_labo')
      .select('id, numero_facture, date_facture, periode_debut, periode_fin, total_ttc, statut, pdf_url')
      .eq('dentiste_id', dentisteId)
      .eq('prothesiste_id', req.prothesisteId)
      .order('date_facture', { ascending: false });

    if (error) throw error;
    res.json({ factures: data || [] });
  } catch (e) {
    console.error('[LABO portail factures]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/labo/portail-dentiste/bons — BL du dentiste
router.get('/bons', async (req, res) => {
  try {
    const dentisteId = req.query.dentiste_id;
    if (!dentisteId) return res.status(400).json({ error: 'dentiste_id requis' });

    const { data, error } = await admin()
      .from('bons_livraison')
      .select('id, numero_bl, date_bl, patient_initiales, total_ttc, statut, pdf_bl_url, pdf_doc_url')
      .eq('dentiste_id', dentisteId)
      .eq('prothesiste_id', req.prothesisteId)
      .order('date_bl', { ascending: false });

    if (error) throw error;
    res.json({ bons: data || [] });
  } catch (e) {
    console.error('[LABO portail bons]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
