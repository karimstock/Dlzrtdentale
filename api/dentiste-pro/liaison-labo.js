// =============================================
// JADOMI — Liaison Cabinet ↔ Labo (côté dentiste)
// CRUD demandes de liaison, liste labos liés
// =============================================
const express = require('express');
const router = express.Router();
const { admin, requireCabinet } = require('./shared');

// =========================================================
// POST /liaison-labo/demande — Envoyer une demande de liaison à un labo
// Le dentiste cherche un labo par email ou nom et envoie une demande
// =========================================================
router.post('/demande', requireCabinet(), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(400).json({ error: 'Cabinet non configuré' });

    const { labo_email, labo_nom, message } = req.body || {};
    if (!labo_email && !labo_nom) {
      return res.status(400).json({ error: 'Email ou nom du laboratoire requis' });
    }

    if (labo_email) {
      // Chercher le labo par email exact (pas de .or() pour éviter injection PostgREST)
      const { data: labos } = await admin()
        .from('labo_prothesistes')
        .select('id, nom_labo, email, telephone, ville, societe_id')
        .eq('email', labo_email);

      // Fallback : chercher dans societes
      let labo = labos && labos.length > 0 ? labos[0] : null;
      if (!labo) {
        const { data: societes } = await admin()
          .from('societes')
          .select('id, nom, email')
          .eq('email', labo_email)
          .limit(1);

        if (societes && societes.length > 0) {
          const { data: laboFromSociete } = await admin()
            .from('labo_prothesistes')
            .select('id, nom_labo, email, telephone, ville')
            .eq('societe_id', societes[0].id)
            .maybeSingle();

          labo = laboFromSociete;
        }
      }

      if (!labo) {
        return res.status(404).json({ error: 'Aucun laboratoire trouvé avec cet email' });
      }

      // Vérifier si une liaison existe déjà
      const { data: existing } = await admin()
        .from('liaisons_cabinet_labo')
        .select('id, statut')
        .eq('cabinet_id', req.cabinet.id)
        .eq('labo_id', labo.id)
        .maybeSingle();

      if (existing) {
        if (existing.statut === 'acceptee') {
          return res.status(409).json({ error: 'Vous êtes déjà lié à ce laboratoire' });
        }
        if (existing.statut === 'en_attente') {
          return res.status(409).json({ error: 'Une demande est déjà en attente pour ce laboratoire' });
        }
        // Si refusée ou résiliée, on peut renvoyer une demande → update
        const { data: updated, error: upErr } = await admin()
          .from('liaisons_cabinet_labo')
          .update({
            statut: 'en_attente',
            demande_par: 'dentiste',
            message: message || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (upErr) throw upErr;
        return res.json({ liaison: updated, labo, message: 'Demande de liaison renvoyée' });
      }

      // Créer la liaison
      const { data: liaison, error } = await admin()
        .from('liaisons_cabinet_labo')
        .insert({
          cabinet_id: req.cabinet.id,
          labo_id: labo.id,
          statut: 'en_attente',
          demande_par: 'dentiste',
          message: message || null
        })
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({ liaison, labo, message: 'Demande de liaison envoyée' });

    } else {
      // Recherche par nom (sanitize % et _ pour éviter injection LIKE)
      const safeLaboNom = labo_nom.replace(/[%_\\]/g, '\\$&');
      const { data: labos } = await admin()
        .from('labo_prothesistes')
        .select('id, nom_labo, email, telephone, ville')
        .ilike('nom_labo', `%${safeLaboNom}%`)
        .limit(10);

      if (!labos || labos.length === 0) {
        return res.status(404).json({ error: 'Aucun laboratoire trouvé avec ce nom' });
      }

      // Retourner la liste pour que le dentiste choisisse
      res.json({ labos, message: 'Sélectionnez le laboratoire souhaité' });
    }
  } catch (e) {
    console.error('[liaison-labo] demande:', e.message);
    res.status(500).json({ error: 'Erreur envoi demande de liaison' });
  }
});

// =========================================================
// GET /liaison-labo/recherche — Rechercher des labos par nom
// =========================================================
router.get('/recherche', requireCabinet(), async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ labos: [] });

    // Sanitize % et _ pour éviter injection LIKE
    const safeQ = q.replace(/[%_\\]/g, '\\$&');
    const { data: labos, error } = await admin()
      .from('labo_prothesistes')
      .select('id, nom_labo, email, telephone, ville')
      .ilike('nom_labo', `%${safeQ}%`)
      .limit(20);

    if (error) throw error;

    // Enrichir avec le statut de liaison existant
    if (labos && labos.length > 0 && req.cabinet) {
      const laboIds = labos.map(l => l.id);
      const { data: liaisons } = await admin()
        .from('liaisons_cabinet_labo')
        .select('labo_id, statut')
        .eq('cabinet_id', req.cabinet.id)
        .in('labo_id', laboIds);

      const liaisonMap = {};
      (liaisons || []).forEach(l => { liaisonMap[l.labo_id] = l.statut; });
      labos.forEach(l => { l.liaison_statut = liaisonMap[l.id] || null; });
    }

    res.json({ labos: labos || [] });
  } catch (e) {
    console.error('[liaison-labo] recherche:', e.message);
    res.status(500).json({ error: 'Erreur recherche labos' });
  }
});

// =========================================================
// GET /liaison-labo/mes-labos — Liste des labos liés au cabinet
// =========================================================
router.get('/mes-labos', requireCabinet(), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(400).json({ error: 'Cabinet non configuré' });

    const { data: liaisons, error } = await admin()
      .from('liaisons_cabinet_labo')
      .select('id, labo_id, statut, demande_par, message, created_at, updated_at')
      .eq('cabinet_id', req.cabinet.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Enrichir avec les infos labo
    const enriched = [];
    for (const l of (liaisons || [])) {
      const { data: labo } = await admin()
        .from('labo_prothesistes')
        .select('id, nom_labo, email, telephone, ville')
        .eq('id', l.labo_id)
        .maybeSingle();

      // Compter les cas en cours pour ce labo
      let casEnCours = 0;
      let casTermines = 0;
      if (l.statut === 'acceptee' && labo) {
        // Chercher les cas via dentiste_pro_labos qui match par email
        const { data: dpLabos } = await admin()
          .from('dentiste_pro_labos')
          .select('id')
          .eq('cabinet_id', req.cabinet.id);

        if (dpLabos && dpLabos.length > 0) {
          const dpLaboIds = dpLabos.map(dl => dl.id);
          const { count: enCours } = await admin()
            .from('dentiste_pro_cases')
            .select('id', { count: 'exact', head: true })
            .eq('cabinet_id', req.cabinet.id)
            .in('labo_id', dpLaboIds)
            .in('statut', ['ouvert', 'en_cours', 'essayage', 'modification']);

          const { count: termines } = await admin()
            .from('dentiste_pro_cases')
            .select('id', { count: 'exact', head: true })
            .eq('cabinet_id', req.cabinet.id)
            .in('labo_id', dpLaboIds)
            .in('statut', ['termine']);

          casEnCours = enCours || 0;
          casTermines = termines || 0;
        }
      }

      enriched.push({
        ...l,
        labo: labo || { nom_labo: 'Inconnu' },
        cas_en_cours: casEnCours,
        cas_termines: casTermines
      });
    }

    res.json({ liaisons: enriched });
  } catch (e) {
    console.error('[liaison-labo] mes-labos:', e.message);
    res.status(500).json({ error: 'Erreur chargement labos liés' });
  }
});

// =========================================================
// DELETE /liaison-labo/:id — Résilier une liaison
// =========================================================
router.delete('/:id', requireCabinet(), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(400).json({ error: 'Cabinet non configuré' });

    const { data, error } = await admin()
      .from('liaisons_cabinet_labo')
      .update({ statut: 'resiliee', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('cabinet_id', req.cabinet.id)
      .in('statut', ['acceptee', 'en_attente'])
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Liaison non trouvée ou déjà résiliée' });

    res.json({ liaison: data, message: 'Liaison résiliée' });
  } catch (e) {
    console.error('[liaison-labo] delete:', e.message);
    res.status(500).json({ error: 'Erreur résiliation liaison' });
  }
});

module.exports = router;
