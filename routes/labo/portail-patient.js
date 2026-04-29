// =============================================
// JADOMI LABO — Portail patient (acces public)
// Suivi de cas prothese via lien unique (token)
// WORLD FIRST — aucun concurrent ne propose cela
// =============================================

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { admin } = require('../../api/multiSocietes/middleware');

// Etapes dans l'ordre de production
const ETAPES_ORDRE = [
  'reception',
  'maquette',
  'scan_cao',
  'fabrication',
  'ceramique',
  'finition',
  'controle',
  'expedition'
];

// Labels patient-friendly (vouvoiement, termes accessibles)
const ETAPES_LABELS_PATIENT = {
  reception: 'Réception de votre empreinte',
  maquette: 'Maquette en préparation',
  scan_cao: 'Numérisation et conception',
  fabrication: 'Fabrication en cours',
  ceramique: 'Finitions esthétiques',
  finition: 'Contrôle et ajustements',
  controle: 'Vérification qualité finale',
  expedition: 'Expédition vers votre dentiste'
};

// Labels type_travail en francais patient-friendly
const TYPE_TRAVAIL_LABELS = {
  couronne: 'Couronne dentaire',
  bridge: 'Bridge dentaire',
  prothese_amovible: 'Prothèse amovible',
  prothese_fixe: 'Prothèse fixe',
  gouttiere: 'Gouttière dentaire',
  implant: 'Prothèse sur implant',
  facette: 'Facette dentaire',
  inlay_onlay: 'Inlay/Onlay',
  reparation: 'Réparation de prothèse',
  autre: 'Travail dentaire'
};

// Photos autorisees pour le patient (pas de photos techniques internes)
const PHOTO_TYPES_PATIENT = ['avant', 'apres', 'comparaison'];

// ─────────────────────────────────────────────
// Validation du token patient (middleware interne)
// ─────────────────────────────────────────────
async function validerToken(token) {
  if (!token || typeof token !== 'string' || token.length < 20) {
    return { valid: false, error: 'Token invalide' };
  }

  const { data: lien, error } = await admin()
    .from('labo_patient_liens')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (error || !lien) {
    return { valid: false, error: 'Lien introuvable ou invalide' };
  }

  if (new Date(lien.expire_at) < new Date()) {
    return { valid: false, error: 'Ce lien a expiré. Veuillez contacter votre dentiste pour en obtenir un nouveau.' };
  }

  // Incrementer le compteur de consultations
  await admin()
    .from('labo_patient_liens')
    .update({
      consulte_count: (lien.consulte_count || 0) + 1,
      derniere_consultation: new Date().toISOString()
    })
    .eq('id', lien.id);

  return { valid: true, lien };
}

// ─────────────────────────────────────────────
// POST /api/labo/portail-patient/generer-lien
// Génère un lien patient (côté labo, auth requise)
// Note: cette route est montee DANS le router auth
// ─────────────────────────────────────────────
const authRouter = express.Router();

authRouter.post('/generer-lien', async (req, res) => {
  try {
    if (!req.prothesisteId) {
      return res.status(404).json({ error: 'Profil laboratoire requis' });
    }

    const { cas_production_id, patient_nom, patient_prenom, patient_email } = req.body;

    if (!cas_production_id) {
      return res.status(400).json({ error: 'cas_production_id requis' });
    }

    // Vérifier que le cas appartient au prothésiste
    const { data: cas, error: casErr } = await admin()
      .from('labo_production_cases')
      .select('id, prothesiste_id')
      .eq('id', cas_production_id)
      .eq('prothesiste_id', req.prothesisteId)
      .maybeSingle();

    if (casErr || !cas) {
      return res.status(404).json({ error: 'Cas de production non trouvé' });
    }

    // Générer token unique (64 chars hex)
    const token = crypto.randomBytes(32).toString('hex');
    const expire_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 jours

    const { data: lien, error: insertErr } = await admin()
      .from('labo_patient_liens')
      .insert({
        prothesiste_id: req.prothesisteId,
        cas_production_id,
        patient_nom: patient_nom || null,
        patient_prenom: patient_prenom || null,
        patient_email: patient_email || null,
        token,
        expire_at: expire_at.toISOString()
      })
      .select('id, token, expire_at')
      .single();

    if (insertErr) throw insertErr;

    const link = `https://jadomi.fr/portail-patient.html?token=${token}`;

    res.json({
      success: true,
      lien_id: lien.id,
      link,
      token,
      expire_at: expire_at.toISOString()
    });
  } catch (e) {
    console.error('[LABO portail-patient generer-lien]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ─────────────────────────────────────────────
// GET /api/labo/portail-patient/:token
// Acces patient — retourne timeline et infos cas
// ─────────────────────────────────────────────
router.get('/:token', async (req, res) => {
  try {
    const { valid, lien, error: tokenErr } = await validerToken(req.params.token);
    if (!valid) {
      return res.status(403).json({ error: tokenErr });
    }

    // Charger le cas de production (SANS prix/couts/notes internes)
    const { data: cas, error: casErr } = await admin()
      .from('labo_production_cases')
      .select('id, type_travail, dents, etape_actuelle, statut, date_reception, date_livraison_prevue, dentiste_id')
      .eq('id', lien.cas_production_id)
      .single();

    if (casErr || !cas) {
      return res.status(404).json({ error: 'Cas introuvable' });
    }

    // Charger le prothesiste (raison_sociale uniquement)
    const { data: prothesiste } = await admin()
      .from('labo_prothesistes')
      .select('raison_sociale')
      .eq('id', lien.prothesiste_id)
      .maybeSingle();

    // Charger le dentiste (nom uniquement, pas de contact)
    let dentiste_nom = null;
    if (cas.dentiste_id) {
      const { data: dentiste } = await admin()
        .from('dentistes_clients')
        .select('titre, nom')
        .eq('id', cas.dentiste_id)
        .maybeSingle();

      if (dentiste) {
        dentiste_nom = `${dentiste.titre || 'Dr'} ${dentiste.nom || ''}`.trim();
      }
    }

    // Charger les etapes realisees
    const { data: etapesRealisees } = await admin()
      .from('labo_production_etapes')
      .select('etape, debut, fin')
      .eq('case_id', cas.id)
      .order('debut', { ascending: true });

    // Construire la timeline patient
    const etapeActuelleIdx = ETAPES_ORDRE.indexOf(cas.etape_actuelle);
    const etapesMap = {};
    for (const er of (etapesRealisees || [])) {
      etapesMap[er.etape] = er;
    }

    const etapes_timeline = ETAPES_ORDRE.map((etape, idx) => {
      let statut = 'a_venir';
      let date = null;

      if (etapesMap[etape]) {
        statut = etapesMap[etape].fin ? 'fait' : 'en_cours';
        date = etapesMap[etape].fin || etapesMap[etape].debut;
      } else if (idx < etapeActuelleIdx) {
        statut = 'fait';
      } else if (idx === etapeActuelleIdx) {
        statut = 'en_cours';
      }

      return {
        etape,
        label_francais: ETAPES_LABELS_PATIENT[etape],
        statut,
        date: date || null
      };
    });

    // Charger les photos patient (avant/apres/comparaison uniquement)
    let photos = [];
    const { data: shadeCases } = await admin()
      .from('labo_shade_cases')
      .select('id')
      .eq('cas_production_id', cas.id);

    if (shadeCases && shadeCases.length > 0) {
      const shadeCaseIds = shadeCases.map(sc => sc.id);
      const { data: shadePhotos } = await admin()
        .from('labo_shade_photos')
        .select('id, url, type')
        .in('shade_case_id', shadeCaseIds)
        .in('type', PHOTO_TYPES_PATIENT);

      photos = (shadePhotos || []).map(p => ({
        id: p.id,
        url: p.url,
        type: p.type
      }));
    }

    // Type de travail en francais
    const type_travail = TYPE_TRAVAIL_LABELS[cas.type_travail] || cas.type_travail;

    // Message d'accueil personnalise
    const prenom = lien.patient_prenom || '';
    const message_accueil = prenom
      ? `Bonjour ${prenom}, voici l'avancement de votre prothèse dentaire.`
      : 'Bonjour, voici l\'avancement de votre prothèse dentaire.';

    res.json({
      lab_name: prothesiste?.raison_sociale || 'Laboratoire',
      dentiste_nom,
      type_travail,
      dents: cas.dents || [],
      etapes_timeline,
      date_livraison_prevue: cas.date_livraison_prevue || null,
      photos,
      message_accueil,
      statut_cas: cas.statut
    });
  } catch (e) {
    console.error('[LABO portail-patient consultation]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// ─────────────────────────────────────────────
// GET /api/labo/portail-patient/:token/photos
// Photos patient uniquement (avant/apres/comparaison)
// ─────────────────────────────────────────────
router.get('/:token/photos', async (req, res) => {
  try {
    const { valid, lien, error: tokenErr } = await validerToken(req.params.token);
    if (!valid) {
      return res.status(403).json({ error: tokenErr });
    }

    // Charger photos via shade_cases liees au cas
    const { data: shadeCases } = await admin()
      .from('labo_shade_cases')
      .select('id')
      .eq('cas_production_id', lien.cas_production_id);

    if (!shadeCases || shadeCases.length === 0) {
      return res.json({ photos: [] });
    }

    const shadeCaseIds = shadeCases.map(sc => sc.id);
    const { data: photos, error } = await admin()
      .from('labo_shade_photos')
      .select('id, url, type, created_at')
      .in('shade_case_id', shadeCaseIds)
      .in('type', PHOTO_TYPES_PATIENT)
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json({
      photos: (photos || []).map(p => ({
        id: p.id,
        url: p.url,
        type: p.type,
        date: p.created_at
      }))
    });
  } catch (e) {
    console.error('[LABO portail-patient photos]', e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// Export: router public (token) + authRouter (generer-lien, auth requise)
module.exports = { publicRouter: router, authRouter };
