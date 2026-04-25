// =============================================
// JADOMI — Dentiste Pro : gestion cabinet (admin)
// Configuration, profession, Chat IA knowledge base
// =============================================
const express = require('express');
const { admin, requireCabinet } = require('./shared');

const router = express.Router();

// =========================================================
// POST /cabinet
// Creer un cabinet lie a la societe du praticien
// =========================================================
router.post('/', requireCabinet(), async (req, res) => {
  try {
    // Verifier qu'il n'existe pas deja
    if (req.cabinet) {
      return res.status(409).json({ error: 'Un cabinet existe deja pour cette societe' });
    }

    const { nom, profession_type, adresse, telephone, email, config } = req.body;
    if (!nom) {
      return res.status(400).json({ error: 'Le nom du cabinet est obligatoire' });
    }

    const { data: cabinet, error } = await admin()
      .from('dentiste_pro_cabinets')
      .insert({
        societe_id: req.societe.id,
        nom: nom.trim(),
        profession_type: profession_type || 'generaliste',
        adresse: adresse || null,
        telephone: telephone || null,
        email: email || null,
        config: config || {},
        created_by: req.user.id,
        created_at: new Date().toISOString()
      })
      .select('*')
      .single();

    if (error) {
      console.error('[dentiste-pro] cabinet create error:', error);
      return res.status(500).json({ error: 'Erreur lors de la creation du cabinet' });
    }

    res.json({ success: true, cabinet });
  } catch (err) {
    console.error('[dentiste-pro] cabinet create:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// GET /cabinet
// Recuperer la config du cabinet
// =========================================================
router.get('/', requireCabinet(), async (req, res) => {
  try {
    if (!req.cabinet) {
      return res.status(404).json({ error: 'Aucun cabinet configure pour cette societe' });
    }

    res.json({ success: true, cabinet: req.cabinet });
  } catch (err) {
    console.error('[dentiste-pro] cabinet get:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// PUT /cabinet
// Modifier config, profession_type, nom, etc.
// =========================================================
router.put('/', requireCabinet(), async (req, res) => {
  try {
    if (!req.cabinet) {
      return res.status(404).json({ error: 'Aucun cabinet configure. Creez-en un d\'abord.' });
    }

    const { nom, profession_type, adresse, telephone, email, config } = req.body;

    const updates = {};
    if (nom !== undefined) updates.nom = nom.trim();
    if (profession_type !== undefined) updates.profession_type = profession_type;
    if (adresse !== undefined) updates.adresse = adresse;
    if (telephone !== undefined) updates.telephone = telephone;
    if (email !== undefined) updates.email = email;
    if (config !== undefined) updates.config = config;
    updates.updated_at = new Date().toISOString();

    if (Object.keys(updates).length <= 1) {
      return res.status(400).json({ error: 'Aucun champ a mettre a jour' });
    }

    const { data: cabinet, error } = await admin()
      .from('dentiste_pro_cabinets')
      .update(updates)
      .eq('id', req.cabinet.id)
      .select('*')
      .single();

    if (error) {
      console.error('[dentiste-pro] cabinet update error:', error);
      return res.status(500).json({ error: 'Erreur lors de la mise a jour du cabinet' });
    }

    res.json({ success: true, cabinet });
  } catch (err) {
    console.error('[dentiste-pro] cabinet update:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// PUT /cabinet/ia-config
// Mettre a jour la base de connaissances Chat IA
// Body: { ia_knowledge_base, ia_prompt_system, ia_enabled }
// =========================================================
router.put('/ia-config', requireCabinet(), async (req, res) => {
  try {
    if (!req.cabinet) {
      return res.status(404).json({ error: 'Aucun cabinet configure.' });
    }

    const { ia_knowledge_base, ia_prompt_system, ia_enabled } = req.body;

    const updates = {};
    if (ia_knowledge_base !== undefined) updates.ia_knowledge_base = ia_knowledge_base;
    if (ia_prompt_system !== undefined) updates.ia_prompt_system = ia_prompt_system;
    if (ia_enabled !== undefined) updates.ia_enabled = ia_enabled;
    updates.updated_at = new Date().toISOString();

    if (Object.keys(updates).length <= 1) {
      return res.status(400).json({ error: 'Aucun champ IA a mettre a jour' });
    }

    const { data: cabinet, error } = await admin()
      .from('dentiste_pro_cabinets')
      .update(updates)
      .eq('id', req.cabinet.id)
      .select('id, ia_knowledge_base, ia_prompt_system, ia_enabled, updated_at')
      .single();

    if (error) {
      console.error('[dentiste-pro] ia-config update error:', error);
      return res.status(500).json({ error: 'Erreur lors de la mise a jour de la config IA' });
    }

    res.json({ success: true, cabinet });
  } catch (err) {
    console.error('[dentiste-pro] ia-config update:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// GET /cabinet/ia-config
// Recuperer la config Chat IA
// =========================================================
router.get('/ia-config', requireCabinet(), async (req, res) => {
  try {
    if (!req.cabinet) {
      return res.status(404).json({ error: 'Aucun cabinet configure.' });
    }

    const { ia_knowledge_base, ia_prompt_system, ia_enabled } = req.cabinet;
    res.json({
      success: true,
      ia_config: {
        ia_knowledge_base: ia_knowledge_base || null,
        ia_prompt_system: ia_prompt_system || null,
        ia_enabled: ia_enabled || false
      }
    });
  } catch (err) {
    console.error('[dentiste-pro] ia-config get:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
