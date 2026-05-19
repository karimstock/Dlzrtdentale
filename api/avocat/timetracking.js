// =============================================
// JADOMI AVOCAT — Chrono par dossier (Time Tracking)
// Mai 2026
// Suivi du temps facturable, chronometre, saisie manuelle
// =============================================
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

let _admin = null;
function admin() {
  if (!_admin) {
    _admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

// === AUTH MIDDLEWARE (meme pattern que coffre.js) ===
async function requireAvocat(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requis' });
    const { data: { user }, error } = await admin().auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Token invalide' });
    req.userId = user.id;
    const societeId = req.headers['x-societe-id'];
    if (societeId) {
      const { data: role } = await admin().from('user_societe_roles').select('societe_id').eq('user_id', user.id).eq('societe_id', societeId).single();
      if (role) req.societeId = role.societe_id;
    }
    if (!req.societeId) {
      const { data: first } = await admin().from('user_societe_roles').select('societe_id').eq('user_id', user.id).limit(1).single();
      if (first) req.societeId = first.societe_id;
    }
    if (!req.societeId) return res.status(400).json({ error: 'Aucune organisation' });
    next();
  } catch { return res.status(401).json({ error: 'Authentification échouée' }); }
}

// ================================================
// POST /start — Demarrer un chronometre
// ================================================
router.post('/start', requireAvocat, async (req, res) => {
  try {
    const { dossier_id, description } = req.body || {};
    if (!dossier_id) return res.status(400).json({ error: 'dossier_id requis' });

    // Verifier que le dossier appartient a cette societe
    const { data: dossier, error: dErr } = await admin().from('avocat_dossiers')
      .select('id, taux_horaire_defaut')
      .eq('id', dossier_id)
      .eq('avocat_societe_id', req.societeId)
      .single();
    if (dErr || !dossier) return res.status(404).json({ error: 'Dossier non trouvé ou accès refusé' });

    // Auto-stop : arreter tout chrono en cours pour cette societe
    const { data: running } = await admin().from('avocat_time_entries')
      .select('id, started_at, taux_horaire')
      .eq('societe_id', req.societeId)
      .eq('user_id', req.userId)
      .eq('is_running', true);

    if (running && running.length > 0) {
      for (const entry of running) {
        const now = new Date();
        const started = new Date(entry.started_at);
        const durationMin = Math.max(1, Math.round((now - started) / 60000));
        const montant = Math.round(((durationMin / 60) * (entry.taux_horaire || 0)) * 100) / 100;
        await admin().from('avocat_time_entries').update({
          is_running: false,
          stopped_at: now.toISOString(),
          duration_minutes: durationMin,
          montant
        }).eq('id', entry.id);
      }
    }

    // Creer la nouvelle entree
    const { data: newEntry, error: iErr } = await admin().from('avocat_time_entries').insert({
      societe_id: req.societeId,
      dossier_id,
      user_id: req.userId,
      description: description || null,
      started_at: new Date().toISOString(),
      is_running: true,
      taux_horaire: dossier.taux_horaire_defaut || 0,
      facturable: true
    }).select().single();

    if (iErr) return res.status(500).json({ error: 'Erreur lors de la création du chronomètre' });

    return res.status(201).json(newEntry);
  } catch (err) {
    console.error('[timetracking/start]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// POST /stop — Arreter le chronometre en cours
// ================================================
router.post('/stop', requireAvocat, async (req, res) => {
  try {
    const { data: entry, error: fErr } = await admin().from('avocat_time_entries')
      .select('*')
      .eq('societe_id', req.societeId)
      .eq('user_id', req.userId)
      .eq('is_running', true)
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (fErr || !entry) return res.status(404).json({ error: 'Aucun chronomètre en cours' });

    const now = new Date();
    const started = new Date(entry.started_at);
    const durationMin = Math.max(1, Math.round((now - started) / 60000));
    const montant = Math.round(((durationMin / 60) * (entry.taux_horaire || 0)) * 100) / 100;

    const { data: updated, error: uErr } = await admin().from('avocat_time_entries').update({
      is_running: false,
      stopped_at: now.toISOString(),
      duration_minutes: durationMin,
      montant
    }).eq('id', entry.id).select().single();

    if (uErr) return res.status(500).json({ error: 'Erreur lors de l\'arrêt du chronomètre' });

    return res.json(updated);
  } catch (err) {
    console.error('[timetracking/stop]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// GET /running — Chronometre en cours
// ================================================
router.get('/running', requireAvocat, async (req, res) => {
  try {
    const { data: entry } = await admin().from('avocat_time_entries')
      .select('*, avocat_dossiers(titre, reference)')
      .eq('societe_id', req.societeId)
      .eq('user_id', req.userId)
      .eq('is_running', true)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return res.json(entry || null);
  } catch (err) {
    console.error('[timetracking/running]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// GET /entries — Liste des entrees avec filtres
// ================================================
router.get('/entries', requireAvocat, async (req, res) => {
  try {
    let query = admin().from('avocat_time_entries')
      .select('*, avocat_dossiers(titre, reference)')
      .eq('societe_id', req.societeId)
      .order('created_at', { ascending: false });

    if (req.query.dossier_id) {
      query = query.eq('dossier_id', req.query.dossier_id);
    }
    if (req.query.from) {
      query = query.gte('created_at', req.query.from);
    }
    if (req.query.to) {
      query = query.lte('created_at', req.query.to);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: 'Erreur lors de la récupération des entrées' });

    return res.json(data || []);
  } catch (err) {
    console.error('[timetracking/entries]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// POST /entries — Saisie manuelle (sans chrono)
// ================================================
router.post('/entries', requireAvocat, async (req, res) => {
  try {
    const { dossier_id, description, duration_minutes, date, facturable } = req.body || {};
    if (!dossier_id) return res.status(400).json({ error: 'dossier_id requis' });
    if (!duration_minutes || duration_minutes <= 0) return res.status(400).json({ error: 'duration_minutes requis (> 0)' });

    // Verifier que le dossier appartient a cette societe
    const { data: dossier, error: dErr } = await admin().from('avocat_dossiers')
      .select('id, taux_horaire_defaut')
      .eq('id', dossier_id)
      .eq('avocat_societe_id', req.societeId)
      .single();
    if (dErr || !dossier) return res.status(404).json({ error: 'Dossier non trouvé ou accès refusé' });

    const tauxHoraire = dossier.taux_horaire_defaut || 0;
    const montant = Math.round(((duration_minutes / 60) * tauxHoraire) * 100) / 100;
    const entryDate = date ? new Date(date).toISOString() : new Date().toISOString();

    const { data: entry, error: iErr } = await admin().from('avocat_time_entries').insert({
      societe_id: req.societeId,
      dossier_id,
      user_id: req.userId,
      description: description || null,
      started_at: entryDate,
      stopped_at: entryDate,
      duration_minutes,
      is_running: false,
      taux_horaire: tauxHoraire,
      montant,
      facturable: facturable !== false
    }).select().single();

    if (iErr) return res.status(500).json({ error: 'Erreur lors de la création de l\'entrée' });

    return res.status(201).json(entry);
  } catch (err) {
    console.error('[timetracking/entries POST]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// PATCH /entries/:id — Modifier une entree
// ================================================
router.patch('/entries/:id', requireAvocat, async (req, res) => {
  try {
    // Verifier ownership via societe_id
    const { data: existing, error: fErr } = await admin().from('avocat_time_entries')
      .select('*')
      .eq('id', req.params.id)
      .eq('societe_id', req.societeId)
      .single();
    if (fErr || !existing) return res.status(404).json({ error: 'Entrée non trouvée' });

    const { description, duration_minutes, facturable, taux_horaire } = req.body || {};
    const updates = {};

    if (description !== undefined) updates.description = description;
    if (facturable !== undefined) updates.facturable = facturable;
    if (duration_minutes !== undefined && duration_minutes > 0) updates.duration_minutes = duration_minutes;
    if (taux_horaire !== undefined && taux_horaire >= 0) updates.taux_horaire = taux_horaire;

    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Aucun champ à modifier' });

    // Recalculer le montant si duration ou taux change
    const finalDuration = updates.duration_minutes || existing.duration_minutes || 0;
    const finalTaux = updates.taux_horaire !== undefined ? updates.taux_horaire : existing.taux_horaire || 0;
    if (updates.duration_minutes !== undefined || updates.taux_horaire !== undefined) {
      updates.montant = Math.round(((finalDuration / 60) * finalTaux) * 100) / 100;
    }

    const { data: updated, error: uErr } = await admin().from('avocat_time_entries')
      .update(updates)
      .eq('id', req.params.id)
      .select().single();

    if (uErr) return res.status(500).json({ error: 'Erreur lors de la modification' });

    return res.json(updated);
  } catch (err) {
    console.error('[timetracking/entries PATCH]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// DELETE /entries/:id — Supprimer une entree
// ================================================
router.delete('/entries/:id', requireAvocat, async (req, res) => {
  try {
    // Verifier ownership via societe_id
    const { data: existing, error: fErr } = await admin().from('avocat_time_entries')
      .select('id, facture_id')
      .eq('id', req.params.id)
      .eq('societe_id', req.societeId)
      .single();
    if (fErr || !existing) return res.status(404).json({ error: 'Entrée non trouvée' });

    // Interdire la suppression si liee a une facture
    if (existing.facture_id) {
      return res.status(403).json({ error: 'Impossible de supprimer une entrée liée à une facture' });
    }

    const { error: dErr } = await admin().from('avocat_time_entries')
      .delete()
      .eq('id', req.params.id);

    if (dErr) return res.status(500).json({ error: 'Erreur lors de la suppression' });

    return res.json({ success: true, message: 'Entrée supprimée' });
  } catch (err) {
    console.error('[timetracking/entries DELETE]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

// ================================================
// GET /summary/:dossierId — Resume par dossier
// ================================================
router.get('/summary/:dossierId', requireAvocat, async (req, res) => {
  try {
    // Verifier que le dossier appartient a cette societe
    const { data: dossier, error: dErr } = await admin().from('avocat_dossiers')
      .select('id, titre, reference, taux_horaire_defaut')
      .eq('id', req.params.dossierId)
      .eq('avocat_societe_id', req.societeId)
      .single();
    if (dErr || !dossier) return res.status(404).json({ error: 'Dossier non trouvé ou accès refusé' });

    // Recuperer toutes les entrees terminees pour ce dossier
    const { data: entries, error: eErr } = await admin().from('avocat_time_entries')
      .select('duration_minutes, montant, facturable')
      .eq('dossier_id', req.params.dossierId)
      .eq('societe_id', req.societeId)
      .eq('is_running', false);

    if (eErr) return res.status(500).json({ error: 'Erreur lors du calcul du résumé' });

    const all = entries || [];
    const totalMinutes = all.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
    const totalMontant = all.reduce((sum, e) => sum + (e.montant || 0), 0);

    const facturables = all.filter(e => e.facturable);
    const nonFacturables = all.filter(e => !e.facturable);

    const facturableMinutes = facturables.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
    const facturableMontant = facturables.reduce((sum, e) => sum + (e.montant || 0), 0);
    const nonFacturableMinutes = nonFacturables.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
    const nonFacturableMontant = nonFacturables.reduce((sum, e) => sum + (e.montant || 0), 0);

    return res.json({
      dossier: {
        id: dossier.id,
        titre: dossier.titre,
        reference: dossier.reference,
        taux_horaire_defaut: dossier.taux_horaire_defaut
      },
      total: {
        entries_count: all.length,
        heures: Math.round((totalMinutes / 60) * 100) / 100,
        minutes: totalMinutes,
        montant: Math.round(totalMontant * 100) / 100
      },
      facturable: {
        entries_count: facturables.length,
        heures: Math.round((facturableMinutes / 60) * 100) / 100,
        minutes: facturableMinutes,
        montant: Math.round(facturableMontant * 100) / 100
      },
      non_facturable: {
        entries_count: nonFacturables.length,
        heures: Math.round((nonFacturableMinutes / 60) * 100) / 100,
        minutes: nonFacturableMinutes,
        montant: Math.round(nonFacturableMontant * 100) / 100
      }
    });
  } catch (err) {
    console.error('[timetracking/summary]', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
});

module.exports = router;
