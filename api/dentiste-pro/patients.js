// =============================================
// JADOMI — Patients CRUD
// Passe 71 — Fiche patient unique + PAT-ID
// Endpoints : GET list, POST create, GET :id, PATCH :id, GET search
// =============================================
const express = require('express');
const { admin, requireCabinet } = require('./shared');

const router = express.Router();

// =========================================================
// GET /patients — Liste paginée des patients du cabinet
// =========================================================
router.get('/', requireCabinet(), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(400).json({ error: 'Cabinet non configuré' });

    const { page = 1, limit = 50, statut = 'actif' } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    let query = admin()
      .from('dentiste_pro_patients')
      .select('id, pat_id, nom, prenom, telephone, email, date_naissance, sexe, derniere_visite, statut, created_at', { count: 'exact' })
      .eq('cabinet_id', req.cabinet.id)
      .order('nom', { ascending: true })
      .range(offset, offset + parseInt(limit) - 1);

    if (statut && statut !== 'tous') {
      query = query.eq('statut', statut);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ patients: data || [], total: count || 0, page: parseInt(page), limit: parseInt(limit) });
  } catch (e) {
    console.error('[patients] list:', e.message);
    res.status(500).json({ error: 'Erreur chargement patients' });
  }
});

// =========================================================
// GET /patients/search?q= — Autocomplete (anti-doublons)
// =========================================================
router.get('/search', requireCabinet(), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(400).json({ error: 'Cabinet non configuré' });

    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ patients: [] });

    // Recherche sur nom, prénom, téléphone, pat_id
    const sanitized = q.replace(/[%_]/g, '');
    const pattern = `%${sanitized}%`;

    const { data, error } = await admin()
      .from('dentiste_pro_patients')
      .select('id, pat_id, nom, prenom, telephone, email, date_naissance')
      .eq('cabinet_id', req.cabinet.id)
      .eq('statut', 'actif')
      .or(`nom.ilike.${pattern},prenom.ilike.${pattern},telephone.ilike.${pattern},pat_id.ilike.${pattern}`)
      .order('nom')
      .limit(10);

    if (error) throw error;
    res.json({ patients: data || [] });
  } catch (e) {
    console.error('[patients] search:', e.message);
    res.status(500).json({ error: 'Erreur recherche' });
  }
});

// =========================================================
// POST /patients — Création patient + PAT-ID auto
// =========================================================
router.post('/', requireCabinet(), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(400).json({ error: 'Cabinet non configuré' });

    const { nom, prenom, telephone, email, date_naissance, sexe, adresse, code_postal, ville, notes_praticien } = req.body || {};

    if (!nom || !telephone) {
      return res.status(400).json({ error: 'Nom et téléphone sont obligatoires' });
    }

    // Vérif doublon (même cabinet + même téléphone)
    const { data: existing } = await admin()
      .from('dentiste_pro_patients')
      .select('id, pat_id, nom, prenom')
      .eq('cabinet_id', req.cabinet.id)
      .eq('telephone', telephone.trim())
      .maybeSingle();

    if (existing) {
      return res.status(409).json({
        error: 'Patient existant',
        message: `${existing.prenom || ''} ${existing.nom} (${existing.pat_id || 'sans PAT-ID'}) a déjà ce numéro de téléphone.`,
        existing_patient: existing
      });
    }

    // PAT-ID : le trigger SQL le génère automatiquement
    const { data: patient, error } = await admin()
      .from('dentiste_pro_patients')
      .insert({
        cabinet_id: req.cabinet.id,
        nom: nom.trim(),
        prenom: (prenom || '').trim() || null,
        telephone: telephone.trim(),
        email: (email || '').trim() || null,
        date_naissance: date_naissance || null,
        sexe: sexe || null,
        adresse: (adresse || '').trim() || null,
        code_postal: (code_postal || '').trim() || null,
        ville: (ville || '').trim() || null,
        notes_praticien: (notes_praticien || '').trim() || null
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ patient });
  } catch (e) {
    console.error('[patients] create:', e.message);
    res.status(500).json({ error: 'Erreur création patient' });
  }
});

// =========================================================
// GET /patients/:id — Fiche patient + ses cases
// =========================================================
router.get('/:id', requireCabinet(), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(400).json({ error: 'Cabinet non configuré' });

    const { id } = req.params;

    const { data: patient, error } = await admin()
      .from('dentiste_pro_patients')
      .select('*')
      .eq('id', id)
      .eq('cabinet_id', req.cabinet.id)
      .maybeSingle();

    if (error) throw error;
    if (!patient) return res.status(404).json({ error: 'Patient non trouvé' });

    // Charger ses cases
    const { data: cases } = await admin()
      .from('dentiste_pro_cases')
      .select('id, reference, titre, type, dent_numero, teinte, statut, date_empreinte, date_livraison_prevue, date_livraison_reelle, created_at')
      .eq('patient_id', id)
      .eq('cabinet_id', req.cabinet.id)
      .order('created_at', { ascending: false });

    // Ne pas retourner les champs sensibles OTP
    delete patient.otp_code;
    delete patient.otp_expires_at;
    delete patient.otp_attempts;

    res.json({ patient, cases: cases || [] });
  } catch (e) {
    console.error('[patients] get:', e.message);
    res.status(500).json({ error: 'Erreur chargement patient' });
  }
});

// =========================================================
// PATCH /patients/:id — Mise à jour patient
// =========================================================
router.patch('/:id', requireCabinet(), async (req, res) => {
  try {
    if (!req.cabinet) return res.status(400).json({ error: 'Cabinet non configuré' });

    const { id } = req.params;
    const allowed = ['nom', 'prenom', 'telephone', 'email', 'date_naissance', 'sexe', 'adresse', 'code_postal', 'ville', 'notes_praticien', 'statut'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await admin()
      .from('dentiste_pro_patients')
      .update(updates)
      .eq('id', id)
      .eq('cabinet_id', req.cabinet.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Patient non trouvé' });

    res.json({ patient: data });
  } catch (e) {
    console.error('[patients] update:', e.message);
    res.status(500).json({ error: 'Erreur mise à jour patient' });
  }
});

module.exports = router;
