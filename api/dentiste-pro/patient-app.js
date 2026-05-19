// =============================================
// JADOMI — Routes Patient App (JADOMI Care)
//
// Routes appelées par le frontend patient PWA :
//   /patient/appointments    GET (mes RDV) + PATCH (annuler)
//   /patient/visites         GET (mes visites)
//   /patient/cases           GET (mes cas prothétiques)
//   /patient/documents       GET (mes documents)
//   /patient/profile         PATCH (modifier) + DELETE (supprimer)
//   /patient/confirm-visit   POST (confirmer présence)
//
// BRANCHEMENT FOURMILIERE :
//   Quand un patient annule via l'app, on déclenche le workflow
//   rdv_cancelled du dispatcher → recasage intelligent
// =============================================

const express = require('express');
const router = express.Router();
const { requirePatient, admin } = require('./shared');

// =========================================================
// GET /patient/appointments — Mes rendez-vous
// =========================================================
router.get('/appointments', requirePatient(), async (req, res) => {
  try {
    const { id: patientId, cabinet_id: cabinetId } = req.patient;

    // RDV à venir
    const { data: upcoming, error: upErr } = await admin()
      .from('appointments')
      .select('*, type:appointment_types(name, duration_min)')
      .or(`patient_id.eq.${patientId},client_phone.eq.${req.patient.telephone || 'none'}`)
      .gte('date', new Date().toISOString().substring(0, 10))
      .not('status', 'eq', 'cancelled')
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    // RDV passés (3 derniers mois)
    const threeMonthsAgo = new Date(Date.now() - 90 * 86400000).toISOString().substring(0, 10);
    const { data: past } = await admin()
      .from('appointments')
      .select('*, type:appointment_types(name, duration_min)')
      .or(`patient_id.eq.${patientId},client_phone.eq.${req.patient.telephone || 'none'}`)
      .lt('date', new Date().toISOString().substring(0, 10))
      .gte('date', threeMonthsAgo)
      .order('date', { ascending: false })
      .limit(20);

    res.json({
      upcoming: upcoming || [],
      past: past || [],
      total: (upcoming || []).length + (past || []).length,
    });
  } catch (err) {
    console.error('[patient-app] GET appointments error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// PATCH /patient/appointments/:id — Annuler un RDV
// BRANCHEMENT FOURMILIERE : déclenche le recasage intelligent
// =========================================================
router.patch('/appointments/:id', requirePatient(), async (req, res) => {
  try {
    const { id: patientId, cabinet_id: cabinetId } = req.patient;
    const appointmentId = req.params.id;
    const { status } = req.body;

    if (status !== 'cancelled') {
      return res.status(400).json({ error: 'Seule l\'annulation est autorisée depuis l\'app' });
    }

    // Charger le RDV pour vérifier qu'il appartient au patient
    const { data: rdv, error: rdvErr } = await admin()
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .single();

    if (rdvErr || !rdv) {
      return res.status(404).json({ error: 'Rendez-vous non trouvé' });
    }

    // Vérifier que c'est bien le patient du RDV
    if (rdv.patient_id !== patientId && rdv.client_phone !== req.patient.telephone) {
      return res.status(403).json({ error: 'Ce rendez-vous ne vous appartient pas' });
    }

    // Annuler le RDV
    const { error: updateErr } = await admin()
      .from('appointments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', appointmentId);

    if (updateErr) throw updateErr;

    // ── FOURMILIERE : déclencher le workflow rdv_cancelled ──
    try {
      const dispatcher = require('../../lib/agents/dispatcher');
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

      // Trouver le societe_id depuis le cabinet
      const { data: cab } = await supabase
        .from('dentiste_pro_cabinets')
        .select('societe_id')
        .eq('id', cabinetId)
        .maybeSingle();

      if (cab && cab.societe_id) {
        // Lancer le workflow en arrière-plan (pas de await → pas de latence pour le patient)
        dispatcher.dispatch(supabase, cab.societe_id, {
          type: 'rdv_cancelled',
          data: {
            rdv: {
              id: rdv.id,
              date_heure: `${rdv.date}T${rdv.start_time || '00:00'}`,
              date: rdv.date,
              duree: rdv.type?.duration_min || 30,
              patient_name: rdv.client_name || req.patient.prenom + ' ' + req.patient.nom,
              patient_email: rdv.client_email || req.patient.email,
              patient_phone: rdv.client_phone || req.patient.telephone,
              acte: rdv.type?.name || rdv.notes,
            },
          },
        }).then(wf => {
          console.log(`[patient-app] Fourmiliere rdv_cancelled workflow: ${wf.workflowId} (${wf.steps.length} steps)`);
        }).catch(e => {
          console.warn(`[patient-app] Fourmiliere rdv_cancelled error:`, e.message);
        });
      }
    } catch (_e) {
      // Fourmilière pas disponible — pas bloquant pour l'annulation
    }

    // ── WAITLIST : détecter la libération de créneau ──
    try {
      const { bus } = require('../../lib/shared-intelligence');
      bus.emit('copilot_notification', {
        societeId: rdv.site_id || cabinetId,
        type: 'patient_cancelled',
        title: 'Annulation patient',
        message: `${rdv.client_name || 'Un patient'} a annulé son RDV du ${rdv.date} à ${rdv.start_time}.`,
        data: { rdv_id: rdv.id, date: rdv.date, start_time: rdv.start_time },
      });
    } catch (_e) {}

    res.json({ success: true, message: 'Rendez-vous annulé' });
  } catch (err) {
    console.error('[patient-app] PATCH appointments error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// POST /patient/confirm-visit — Confirmer sa présence
// =========================================================
router.post('/confirm-visit', requirePatient(), async (req, res) => {
  try {
    const { appointment_id } = req.body;
    if (!appointment_id) return res.status(400).json({ error: 'appointment_id requis' });

    const { error } = await admin()
      .from('appointments')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', appointment_id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('[patient-app] confirm-visit error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// GET /patient/visites — Historique des visites
// =========================================================
router.get('/visites', requirePatient(), async (req, res) => {
  try {
    const { id: patientId } = req.patient;

    const { data } = await admin()
      .from('appointments')
      .select('*, type:appointment_types(name)')
      .or(`patient_id.eq.${patientId}`)
      .eq('status', 'completed')
      .order('date', { ascending: false })
      .limit(50);

    res.json({ visites: data || [] });
  } catch (err) {
    console.error('[patient-app] GET visites error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// GET /patient/cases — Cas prothétiques
// =========================================================
router.get('/cases', requirePatient(), async (req, res) => {
  try {
    const { id: patientId, cabinet_id: cabinetId } = req.patient;

    const { data } = await admin()
      .from('dentiste_pro_cases')
      .select('*')
      .eq('cabinet_id', cabinetId)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });

    res.json({ cases: data || [] });
  } catch (err) {
    console.error('[patient-app] GET cases error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// GET /patient/documents — Documents patient
// =========================================================
router.get('/documents', requirePatient(), async (req, res) => {
  try {
    const { id: patientId, cabinet_id: cabinetId } = req.patient;

    // SÉCURITÉ : filtrer par patient_id, pas juste cabinet_id
    // Un patient ne doit JAMAIS voir les documents d'un autre patient
    const { data } = await admin()
      .from('cabinet_brain_documents')
      .select('id, title, doc_type, created_at, metadata')
      .eq('societe_id', cabinetId)
      .or(`metadata->>patient_id.eq.${patientId},metadata->>client_id.eq.${patientId}`)
      .order('created_at', { ascending: false })
      .limit(50);

    res.json({ documents: data || [] });
  } catch (err) {
    console.error('[patient-app] GET documents error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// PATCH /patient/profile — Modifier profil
// =========================================================
router.patch('/profile', requirePatient(), async (req, res) => {
  try {
    const { id: patientId } = req.patient;
    const { nom, prenom, email } = req.body;

    const updates = {};
    if (nom) updates.nom = nom;
    if (prenom) updates.prenom = prenom;
    if (email) updates.email = email;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucune donnée à mettre à jour' });
    }

    const { error } = await admin()
      .from('dentiste_pro_patients')
      .update(updates)
      .eq('id', patientId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('[patient-app] PATCH profile error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// DELETE /patient/profile — Supprimer compte (RGPD)
// =========================================================
router.delete('/profile', requirePatient(), async (req, res) => {
  try {
    const { id: patientId } = req.patient;

    // Anonymiser au lieu de supprimer (garder l'historique médical)
    const { error } = await admin()
      .from('dentiste_pro_patients')
      .update({
        nom: 'SUPPRIMÉ',
        prenom: '',
        email: null,
        telephone: null,
        adresse: null,
        date_naissance: null,
        statut: 'archive',
        push_subscription: null,
        push_enabled: false,
      })
      .eq('id', patientId);

    if (error) throw error;
    res.json({ success: true, message: 'Compte supprimé conformément au RGPD' });
  } catch (err) {
    console.error('[patient-app] DELETE profile error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
