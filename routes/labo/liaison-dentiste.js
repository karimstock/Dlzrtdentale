// =============================================
// JADOMI LABO — Liaison Labo ↔ Dentiste (côté labo)
// Gestion des demandes de liaison reçues
// =============================================
const express = require('express');
const router = express.Router();
const { admin } = require('../../api/multiSocietes/middleware');

// =========================================================
// GET /liaison-dentiste/demandes — Demandes reçues en attente
// =========================================================
router.get('/demandes', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil labo requis' });

    const { statut } = req.query;
    let query = admin()
      .from('liaisons_cabinet_labo')
      .select('id, cabinet_id, statut, demande_par, message, created_at, updated_at')
      .eq('labo_id', req.prothesisteId)
      .order('created_at', { ascending: false });

    if (statut) {
      query = query.eq('statut', statut);
    } else {
      query = query.eq('statut', 'en_attente');
    }

    const { data: demandes, error } = await query;
    if (error) throw error;

    // Enrichir avec les infos cabinet
    const enriched = [];
    for (const d of (demandes || [])) {
      const { data: cabinet } = await admin()
        .from('dentiste_pro_cabinets')
        .select('id, nom_cabinet, ville, telephone, email, adresse')
        .eq('id', d.cabinet_id)
        .maybeSingle();

      enriched.push({
        ...d,
        cabinet: cabinet || { nom_cabinet: 'Cabinet inconnu' }
      });
    }

    res.json({ demandes: enriched });
  } catch (e) {
    console.error('[LABO liaison] demandes:', e.message);
    res.status(500).json({ error: 'Erreur chargement demandes' });
  }
});

// =========================================================
// POST /liaison-dentiste/demandes/:id/accepter — Accepter une demande
// =========================================================
router.post('/demandes/:id/accepter', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil labo requis' });

    const { data, error } = await admin()
      .from('liaisons_cabinet_labo')
      .update({ statut: 'acceptee', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('labo_id', req.prothesisteId)
      .eq('statut', 'en_attente')
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Demande non trouvée ou déjà traitée' });

    res.json({ liaison: data, message: 'Demande acceptée' });
  } catch (e) {
    console.error('[LABO liaison] accepter:', e.message);
    res.status(500).json({ error: 'Erreur acceptation demande' });
  }
});

// =========================================================
// POST /liaison-dentiste/demandes/:id/refuser — Refuser une demande
// =========================================================
router.post('/demandes/:id/refuser', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil labo requis' });

    const { data, error } = await admin()
      .from('liaisons_cabinet_labo')
      .update({ statut: 'refusee', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('labo_id', req.prothesisteId)
      .eq('statut', 'en_attente')
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Demande non trouvée ou déjà traitée' });

    res.json({ liaison: data, message: 'Demande refusée' });
  } catch (e) {
    console.error('[LABO liaison] refuser:', e.message);
    res.status(500).json({ error: 'Erreur refus demande' });
  }
});

// =========================================================
// GET /liaison-dentiste/mes-dentistes — Liste des dentistes liés
// =========================================================
router.get('/mes-dentistes', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil labo requis' });

    const { data: liaisons, error } = await admin()
      .from('liaisons_cabinet_labo')
      .select('id, cabinet_id, statut, demande_par, message, created_at, updated_at')
      .eq('labo_id', req.prothesisteId)
      .eq('statut', 'acceptee')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    // Enrichir avec les infos cabinet
    const enriched = [];
    for (const l of (liaisons || [])) {
      const { data: cabinet } = await admin()
        .from('dentiste_pro_cabinets')
        .select('id, nom_cabinet, ville, telephone, email, adresse')
        .eq('id', l.cabinet_id)
        .maybeSingle();

      // Compter les cas liés
      let casCount = 0;
      if (cabinet) {
        const { count } = await admin()
          .from('dentiste_pro_cases')
          .select('id', { count: 'exact', head: true })
          .eq('cabinet_id', cabinet.id)
          .in('statut', ['ouvert', 'en_cours', 'essayage', 'modification']);
        casCount = count || 0;
      }

      enriched.push({
        ...l,
        cabinet: cabinet || { nom_cabinet: 'Cabinet inconnu' },
        cas_en_cours: casCount
      });
    }

    res.json({ dentistes: enriched });
  } catch (e) {
    console.error('[LABO liaison] mes-dentistes:', e.message);
    res.status(500).json({ error: 'Erreur chargement dentistes liés' });
  }
});

// =========================================================
// DELETE /liaison-dentiste/:id — Résilier une liaison (côté labo)
// =========================================================
router.delete('/:id', async (req, res) => {
  try {
    if (!req.prothesisteId) return res.status(404).json({ error: 'Profil labo requis' });

    const { data, error } = await admin()
      .from('liaisons_cabinet_labo')
      .update({ statut: 'resiliee', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('labo_id', req.prothesisteId)
      .in('statut', ['acceptee', 'en_attente'])
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Liaison non trouvée ou déjà résiliée' });

    res.json({ liaison: data, message: 'Liaison résiliée' });
  } catch (e) {
    console.error('[LABO liaison] delete:', e.message);
    res.status(500).json({ error: 'Erreur résiliation liaison' });
  }
});

module.exports = router;
