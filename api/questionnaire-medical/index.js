// =============================================
// JADOMI — Questionnaire Médical Patient
// Envoi de lien unique, remplissage par le patient,
// signature électronique, détection d'alertes médicales.
// Auth Supabase + rate limiting public
// =============================================
const express = require('express');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// ===== Supabase Admin (lazy singleton) =====
let _admin = null;
function admin() {
  if (!_admin) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant');
    _admin = createClient(process.env.SUPABASE_URL, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

// ===== Auth middleware (Supabase JWT) =====
function requireAuth() {
  const { authSupabase, requireSociete } = require('../multiSocietes/middleware');
  return async (req, res, next) => {
    authSupabase()(req, res, (err) => {
      if (err) return;
      if (res.headersSent) return;
      requireSociete()(req, res, (err2) => {
        if (err2) return;
        if (res.headersSent) return;
        next();
      });
    });
  };
}

// ===== Rate limiter public (10 req/min/IP) =====
const publicBuckets = new Map();
const PUBLIC_RATE_LIMIT = 10;
const PUBLIC_RATE_WINDOW = 60 * 1000;

function publicRateLimit() {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    let bucket = publicBuckets.get(ip);
    if (!bucket || now - bucket.start > PUBLIC_RATE_WINDOW) {
      bucket = { start: now, count: 0 };
      publicBuckets.set(ip, bucket);
    }
    bucket.count++;
    if (bucket.count > PUBLIC_RATE_LIMIT) {
      return res.status(429).json({ error: 'Trop de requêtes. Veuillez patienter.' });
    }
    next();
  };
}

// Nettoyage periodique des buckets
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of publicBuckets) {
    if (now - bucket.start > PUBLIC_RATE_WINDOW * 2) publicBuckets.delete(key);
  }
}, 5 * 60 * 1000);

// =============================================
// QUESTIONNAIRES PAR PROFESSION
// =============================================

const QUESTIONNAIRE_DENTISTE = {
  sections: [
    {
      id: 'identite',
      titre: 'Identité',
      questions: [
        { id: 'date_naissance', label: 'Date de naissance', type: 'date', required: true },
        { id: 'sexe', label: 'Sexe', type: 'select', options: ['Homme', 'Femme'], required: true },
        { id: 'medecin_traitant', label: 'Médecin traitant', type: 'text' },
        { id: 'medecin_tel', label: 'Téléphone du médecin', type: 'tel' }
      ]
    },
    {
      id: 'allergies',
      titre: 'Allergies',
      questions: [
        { id: 'has_allergies', label: 'Avez-vous des allergies connues ?', type: 'yesno', required: true },
        { id: 'allergie_penicilline', label: 'Allergie à la pénicilline / amoxicilline ?', type: 'yesno', showIf: 'has_allergies', alert: 'ALLERGIE_PENICILLINE' },
        { id: 'allergie_latex', label: 'Allergie au latex ?', type: 'yesno', showIf: 'has_allergies', alert: 'ALLERGIE_LATEX' },
        { id: 'allergie_iode', label: 'Allergie à l\'iode ?', type: 'yesno', showIf: 'has_allergies' },
        { id: 'allergie_anesthesiques', label: 'Allergie aux anesthésiques locaux ?', type: 'yesno', showIf: 'has_allergies', alert: 'ALLERGIE_ANESTHESIQUE' },
        { id: 'allergies_autres', label: 'Autres allergies (précisez)', type: 'textarea', showIf: 'has_allergies' }
      ]
    },
    {
      id: 'medicaments',
      titre: 'Traitements en cours',
      questions: [
        { id: 'has_medicaments', label: 'Prenez-vous des médicaments actuellement ?', type: 'yesno', required: true },
        { id: 'anticoagulants', label: 'Anticoagulants (Previscan, Eliquis, Xarelto, Pradaxa, Coumadine) ?', type: 'yesno', showIf: 'has_medicaments', alert: 'RISQUE_HEMORRAGIQUE' },
        { id: 'antiplaquettaires', label: 'Antiplaquettaires (Aspirine, Plavix, Kardegic) ?', type: 'yesno', showIf: 'has_medicaments', alert: 'RISQUE_HEMORRAGIQUE' },
        { id: 'bisphosphonates', label: 'Bisphosphonates (Fosamax, Actonel, Zometa, Prolia) ?', type: 'yesno', showIf: 'has_medicaments', alert: 'RISQUE_ONM' },
        { id: 'corticoides', label: 'Corticoïdes au long cours ?', type: 'yesno', showIf: 'has_medicaments' },
        { id: 'immunosuppresseurs', label: 'Immunosuppresseurs / chimiothérapie ?', type: 'yesno', showIf: 'has_medicaments', alert: 'IMMUNODEPRESSION' },
        { id: 'medicaments_liste', label: 'Liste complète de vos médicaments', type: 'textarea', showIf: 'has_medicaments' }
      ]
    },
    {
      id: 'cardiovasculaire',
      titre: 'Santé cardiovasculaire',
      questions: [
        { id: 'has_cardio', label: 'Avez-vous un problème cardiaque ?', type: 'yesno', required: true },
        { id: 'hta', label: 'Hypertension artérielle ?', type: 'yesno', showIf: 'has_cardio' },
        { id: 'valvulopathie', label: 'Valvulopathie ou prothèse valvulaire ?', type: 'yesno', showIf: 'has_cardio', alert: 'ENDOCARDITE_ANTIBIOPROPHYLAXIE' },
        { id: 'endocardite', label: 'Antécédent d\'endocardite infectieuse ?', type: 'yesno', showIf: 'has_cardio', alert: 'ENDOCARDITE_ANTIBIOPROPHYLAXIE' },
        { id: 'infarctus', label: 'Antécédent d\'infarctus ou AVC ?', type: 'yesno', showIf: 'has_cardio' },
        { id: 'pacemaker', label: 'Porteur de pacemaker ou défibrillateur ?', type: 'yesno', showIf: 'has_cardio' }
      ]
    },
    {
      id: 'general',
      titre: 'Antécédents généraux',
      questions: [
        { id: 'diabete', label: 'Diabète (type 1 ou 2) ?', type: 'yesno', alert: 'DIABETE_CICATRISATION' },
        { id: 'hepatite', label: 'Hépatite B ou C ?', type: 'yesno' },
        { id: 'vih', label: 'VIH / SIDA ?', type: 'yesno', alert: 'IMMUNODEPRESSION' },
        { id: 'asthme', label: 'Asthme ?', type: 'yesno' },
        { id: 'epilepsie', label: 'Épilepsie ?', type: 'yesno' },
        { id: 'saignements', label: 'Saignements prolongés (hémophilie, etc.) ?', type: 'yesno', alert: 'RISQUE_HEMORRAGIQUE' },
        { id: 'radiotherapie', label: 'Radiothérapie de la tête ou du cou ?', type: 'yesno', alert: 'RADIOTHERAPIE_CERVICOFACIALE' },
        { id: 'grossesse', label: 'Êtes-vous enceinte ou pensez-vous l\'être ?', type: 'yesno', showIf: 'sexe=Femme', alert: 'GROSSESSE' },
        { id: 'grossesse_mois', label: 'Mois de grossesse', type: 'number', showIf: 'grossesse' },
        { id: 'tabac', label: 'Fumez-vous ?', type: 'yesno' },
        { id: 'tabac_quantite', label: 'Combien par jour ?', type: 'text', showIf: 'tabac' }
      ]
    },
    {
      id: 'dentaire',
      titre: 'Santé dentaire',
      questions: [
        { id: 'dernier_rdv_dentiste', label: 'Date du dernier rendez-vous dentaire', type: 'text' },
        { id: 'probleme_anesthesie', label: 'Avez-vous déjà eu un problème avec une anesthésie dentaire ?', type: 'yesno' },
        { id: 'probleme_anesthesie_detail', label: 'Précisez', type: 'textarea', showIf: 'probleme_anesthesie' },
        { id: 'bruxisme', label: 'Serrez-vous ou grincez-vous des dents ?', type: 'yesno' },
        { id: 'motif', label: 'Motif de votre consultation', type: 'textarea' }
      ]
    }
  ]
};

// Questionnaire kinésithérapeute : base dentiste + section mobilité/douleur
const QUESTIONNAIRE_KINE = {
  sections: [
    ...QUESTIONNAIRE_DENTISTE.sections.filter(s => !['dentaire'].includes(s.id)),
    {
      id: 'mobilite_douleur',
      titre: 'Mobilité et douleur',
      questions: [
        { id: 'zone_douleur', label: 'Où se situe votre douleur principale ?', type: 'text', required: true },
        { id: 'intensite_douleur', label: 'Intensité de la douleur (0 à 10)', type: 'number', required: true },
        { id: 'douleur_depuis', label: 'Depuis quand avez-vous cette douleur ?', type: 'text' },
        { id: 'limitation_mobilite', label: 'Avez-vous une limitation de mobilité ?', type: 'yesno' },
        { id: 'limitation_detail', label: 'Précisez les mouvements limités', type: 'textarea', showIf: 'limitation_mobilite' },
        { id: 'chirurgie_recente', label: 'Avez-vous eu une chirurgie récente ?', type: 'yesno' },
        { id: 'chirurgie_detail', label: 'Précisez (type, date)', type: 'textarea', showIf: 'chirurgie_recente' },
        { id: 'activite_physique', label: 'Pratiquez-vous une activité physique ?', type: 'yesno' },
        { id: 'activite_detail', label: 'Laquelle et à quelle fréquence ?', type: 'text', showIf: 'activite_physique' },
        { id: 'motif', label: 'Motif de votre consultation', type: 'textarea', required: true }
      ]
    }
  ]
};

// Questionnaire ostéopathe : base dentiste + section traumatismes
const QUESTIONNAIRE_OSTEOPATHE = {
  sections: [
    ...QUESTIONNAIRE_DENTISTE.sections.filter(s => !['dentaire'].includes(s.id)),
    {
      id: 'traumatismes',
      titre: 'Traumatismes et antécédents',
      questions: [
        { id: 'accident_voiture', label: 'Avez-vous eu un accident de voiture (même ancien) ?', type: 'yesno' },
        { id: 'accident_detail', label: 'Précisez (date, circonstances)', type: 'textarea', showIf: 'accident_voiture' },
        { id: 'chute_importante', label: 'Avez-vous eu une chute importante ?', type: 'yesno' },
        { id: 'chute_detail', label: 'Précisez', type: 'textarea', showIf: 'chute_importante' },
        { id: 'fractures', label: 'Avez-vous eu des fractures ?', type: 'yesno' },
        { id: 'fractures_detail', label: 'Lesquelles ?', type: 'textarea', showIf: 'fractures' },
        { id: 'operations', label: 'Avez-vous été opéré(e) ?', type: 'yesno' },
        { id: 'operations_detail', label: 'Lesquelles (type, date) ?', type: 'textarea', showIf: 'operations' },
        { id: 'zone_douleur', label: 'Zone(s) douloureuse(s) actuelle(s)', type: 'textarea', required: true },
        { id: 'motif', label: 'Motif de votre consultation', type: 'textarea', required: true }
      ]
    }
  ]
};

// Questionnaire infirmière : base dentiste + soins récurrents / autonomie
const QUESTIONNAIRE_INFIRMIERE = {
  sections: [
    ...QUESTIONNAIRE_DENTISTE.sections.filter(s => !['dentaire'].includes(s.id)),
    {
      id: 'soins_autonomie',
      titre: 'Soins et autonomie',
      questions: [
        { id: 'soins_recurrents', label: 'Avez-vous des soins infirmiers récurrents ?', type: 'yesno', required: true },
        { id: 'soins_detail', label: 'Précisez (injections, pansements, perfusions, etc.)', type: 'textarea', showIf: 'soins_recurrents' },
        { id: 'autonomie', label: 'Êtes-vous autonome dans vos déplacements ?', type: 'yesno' },
        { id: 'aide_quotidienne', label: 'Avez-vous besoin d\'aide pour les gestes quotidiens ?', type: 'yesno' },
        { id: 'aide_detail', label: 'Précisez les aides nécessaires', type: 'textarea', showIf: 'aide_quotidienne' },
        { id: 'dispositifs_medicaux', label: 'Avez-vous des dispositifs médicaux (sonde, stomie, cathéter) ?', type: 'yesno' },
        { id: 'dispositifs_detail', label: 'Précisez', type: 'textarea', showIf: 'dispositifs_medicaux' },
        { id: 'plaies', label: 'Avez-vous des plaies ou escarres à surveiller ?', type: 'yesno' },
        { id: 'plaies_detail', label: 'Localisation et état', type: 'textarea', showIf: 'plaies' },
        { id: 'motif', label: 'Motif de votre consultation', type: 'textarea', required: true }
      ]
    }
  ]
};

// Map profession → questionnaire
const QUESTIONNAIRES = {
  dentiste: QUESTIONNAIRE_DENTISTE,
  orthodontiste: QUESTIONNAIRE_DENTISTE,
  implantologue: QUESTIONNAIRE_DENTISTE,
  parodontiste: QUESTIONNAIRE_DENTISTE,
  infirmiere: QUESTIONNAIRE_INFIRMIERE,
  kine: QUESTIONNAIRE_KINE,
  osteopathe: QUESTIONNAIRE_OSTEOPATHE
};

const VALID_PROFESSIONS = Object.keys(QUESTIONNAIRES);

// =============================================
// ALERTES MÉDICALES — Détection et descriptions
// =============================================

const ALERT_DEFINITIONS = {
  ALLERGIE_PENICILLINE: {
    severity: 'critical',
    message: 'Allergie pénicilline déclarée — contre-indication amoxicilline',
    actions: ['Prescrire azithromycine ou clindamycine']
  },
  ALLERGIE_LATEX: {
    severity: 'high',
    message: 'Allergie au latex déclarée — utiliser des gants sans latex',
    actions: ['Utiliser des gants en nitrile', 'Vérifier tout le matériel']
  },
  ALLERGIE_ANESTHESIQUE: {
    severity: 'critical',
    message: 'Allergie aux anesthésiques locaux déclarée',
    actions: ['Adresser en milieu hospitalier pour tests allergologiques', 'Ne pas utiliser d\'anesthésique sans bilan préalable']
  },
  RISQUE_HEMORRAGIQUE: {
    severity: 'high',
    message: 'Risque hémorragique — patient sous anticoagulant ou antiplaquettaire',
    actions: ['Vérifier INR avant tout acte invasif', 'Contacter le cardiologue si nécessaire', 'Prévoir hémostatiques locaux']
  },
  RISQUE_ONM: {
    severity: 'critical',
    message: 'Risque d\'ostéonécrose de la mâchoire — patient sous bisphosphonates',
    actions: ['Éviter les avulsions si possible', 'Contacter le prescripteur', 'Antibioprophylaxie si acte invasif inévitable']
  },
  ENDOCARDITE_ANTIBIOPROPHYLAXIE: {
    severity: 'critical',
    message: 'Antibioprophylaxie obligatoire — risque d\'endocardite infectieuse',
    actions: ['Amoxicilline 2g 1h avant l\'acte (ou clindamycine 600mg si allergie)', 'Vérifier l\'indication avec le cardiologue']
  },
  GROSSESSE: {
    severity: 'high',
    message: 'Patiente enceinte — précautions médicamenteuses',
    actions: ['Éviter AINS et tétracyclines', 'Pas de radiographie sans tablier plombé', 'Reporter les actes non urgents au 2e trimestre']
  },
  DIABETE_CICATRISATION: {
    severity: 'moderate',
    message: 'Diabète déclaré — risque de retard de cicatrisation et infection',
    actions: ['Vérifier HbA1c récente', 'Antibiothérapie préventive si acte chirurgical', 'Surveillance post-opératoire renforcée']
  },
  IMMUNODEPRESSION: {
    severity: 'high',
    message: 'Immunodépression déclarée — risque infectieux majoré',
    actions: ['Antibiothérapie préventive recommandée', 'Contacter le médecin traitant', 'Surveillance post-opératoire renforcée']
  },
  RADIOTHERAPIE_CERVICOFACIALE: {
    severity: 'critical',
    message: 'Antécédent de radiothérapie cervicofaciale — risque d\'ostéoradionécrose',
    actions: ['Éviter les avulsions si possible', 'Oxygénothérapie hyperbare avant acte invasif', 'Contacter le radiothérapeute']
  }
};

// =============================================
// Détection automatique des alertes
// =============================================
function detectAlerts(responses, questionnaire) {
  const alerts = [];
  const seen = new Set();

  for (const section of questionnaire.sections) {
    for (const q of section.questions) {
      if (!q.alert) continue;
      const val = responses[q.id];
      // "oui" / true / "true" → alerte déclenchée
      if (val === true || val === 'oui' || val === 'true' || val === 'Oui') {
        if (!seen.has(q.alert)) {
          seen.add(q.alert);
          const def = ALERT_DEFINITIONS[q.alert];
          if (def) {
            alerts.push({
              type: q.alert,
              severity: def.severity,
              message: def.message,
              actions: def.actions,
              source_question: q.id
            });
          }
        }
      }
    }
  }

  return alerts;
}

// =============================================
// Extraction allergies et médicaments des réponses
// =============================================
function extractAllergies(responses) {
  const allergies = [];
  if (responses.allergie_penicilline === true || responses.allergie_penicilline === 'oui') allergies.push('Pénicilline / Amoxicilline');
  if (responses.allergie_latex === true || responses.allergie_latex === 'oui') allergies.push('Latex');
  if (responses.allergie_iode === true || responses.allergie_iode === 'oui') allergies.push('Iode');
  if (responses.allergie_anesthesiques === true || responses.allergie_anesthesiques === 'oui') allergies.push('Anesthésiques locaux');
  if (responses.allergies_autres && typeof responses.allergies_autres === 'string' && responses.allergies_autres.trim()) {
    allergies.push(...responses.allergies_autres.split(',').map(a => a.trim()).filter(Boolean));
  }
  return allergies;
}

function extractMedicaments(responses) {
  const meds = [];
  if (responses.anticoagulants === true || responses.anticoagulants === 'oui') meds.push('Anticoagulants');
  if (responses.antiplaquettaires === true || responses.antiplaquettaires === 'oui') meds.push('Antiplaquettaires');
  if (responses.bisphosphonates === true || responses.bisphosphonates === 'oui') meds.push('Bisphosphonates');
  if (responses.corticoides === true || responses.corticoides === 'oui') meds.push('Corticoïdes');
  if (responses.immunosuppresseurs === true || responses.immunosuppresseurs === 'oui') meds.push('Immunosuppresseurs / Chimiothérapie');
  if (responses.medicaments_liste && typeof responses.medicaments_liste === 'string' && responses.medicaments_liste.trim()) {
    meds.push(responses.medicaments_liste.trim());
  }
  return meds;
}

// =============================================
// Email HTML template
// =============================================
function buildEmailHtml(nom, prenom, token, cabinetName) {
  const link = `https://jadomi.fr/questionnaire/${token}`;
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:32px 40px;text-align:center;">
          <h1 style="color:#ffffff;font-size:24px;margin:0;font-weight:600;letter-spacing:-0.5px;">JADOMI</h1>
          <p style="color:rgba(255,255,255,0.7);font-size:13px;margin:8px 0 0;">Questionnaire médical</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px;">
          <p style="color:#1a1a2e;font-size:16px;line-height:1.6;margin:0 0 16px;">
            Bonjour <strong>${prenom} ${nom}</strong>,
          </p>
          <p style="color:#4a4a5a;font-size:15px;line-height:1.6;margin:0 0 24px;">
            Veuillez remplir votre questionnaire médical avant votre prochain rendez-vous
            au cabinet <strong>${cabinetName || 'votre cabinet'}</strong>.
            Ce questionnaire est confidentiel et sécurisé.
          </p>
          <p style="color:#4a4a5a;font-size:15px;line-height:1.6;margin:0 0 32px;">
            Le formulaire ne prend que quelques minutes et nous permettra de vous accueillir
            dans les meilleures conditions.
          </p>
          <!-- CTA Button -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:0.3px;">
                Remplir mon questionnaire
              </a>
            </td></tr>
          </table>
          <p style="color:#9a9aaa;font-size:13px;line-height:1.5;margin:24px 0 0;text-align:center;">
            Ce lien est valable 30 jours. Si vous ne parvenez pas à cliquer sur le bouton,
            copiez-collez cette adresse dans votre navigateur :
          </p>
          <p style="color:#6366f1;font-size:12px;word-break:break-all;text-align:center;margin:8px 0 0;">
            ${link}
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f8f8fa;padding:24px 40px;border-top:1px solid #e8e8ec;">
          <p style="color:#9a9aaa;font-size:12px;line-height:1.5;margin:0;text-align:center;">
            JADOMI — Plateforme de gestion pour professionnels de santé<br>
            <a href="https://jadomi.fr" style="color:#6366f1;text-decoration:none;">jadomi.fr</a>
            &nbsp;|&nbsp; contact@jadomi.fr
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// =============================================
// ENDPOINT 1 : POST /api/questionnaire/send
// Envoyer une invitation au patient
// =============================================
router.post('/send', requireAuth(), async (req, res) => {
  try {
    const { nom, prenom, telephone, email, profession_type } = req.body;

    // Validation
    if (!nom || !prenom) {
      return res.status(400).json({ error: 'Nom et prénom requis.' });
    }
    if (!telephone && !email) {
      return res.status(400).json({ error: 'Téléphone ou email requis.' });
    }
    const profType = profession_type || 'dentiste';
    if (!VALID_PROFESSIONS.includes(profType)) {
      return res.status(400).json({ error: `Profession invalide. Valeurs acceptées : ${VALID_PROFESSIONS.join(', ')}` });
    }

    // Générer token unique
    const token = crypto.randomBytes(16).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 jours

    const societeId = req.societe?.id || req.user?.societe_id || null;

    // Stocker l'invitation en base
    const { data: invitation, error: dbErr } = await admin()
      .from('questionnaire_medical_invitations')
      .insert({
        token,
        nom: nom.trim(),
        prenom: prenom.trim(),
        telephone: telephone ? telephone.trim() : null,
        email: email ? email.trim().toLowerCase() : null,
        societe_id: societeId,
        profession_type: profType,
        expires_at: expiresAt.toISOString(),
        status: 'pending',
        created_by: req.user?.id || null
      })
      .select()
      .single();

    if (dbErr) {
      console.error('[questionnaire] insert invitation error:', dbErr.message);
      return res.status(500).json({ error: 'Erreur lors de la création de l\'invitation.' });
    }

    let sentVia = 'none';

    // Envoyer par email si disponible
    if (email) {
      try {
        const { sendMail } = require('../multiSocietes/mailer');
        const cabinetName = req.societe?.nom || 'votre cabinet';
        const result = await sendMail({
          to: email.trim().toLowerCase(),
          subject: `Questionnaire médical — Cabinet ${cabinetName}`,
          html: buildEmailHtml(nom.trim(), prenom.trim(), token, cabinetName)
        });
        if (result.ok) {
          sentVia = 'email';
          console.log(`[questionnaire] Email envoyé à ${email} — token ${token.substring(0, 8)}...`);
        } else {
          console.error('[questionnaire] Email non envoyé:', result.error);
        }
      } catch (mailErr) {
        console.error('[questionnaire] Erreur mailer:', mailErr.message);
      }
    }

    // SMS : juste stocker le lien (pas encore intégré)
    if (telephone && sentVia === 'none') {
      sentVia = 'sms_pending';
      console.log(`[questionnaire] SMS non intégré — lien à envoyer manuellement au ${telephone} : https://jadomi.fr/questionnaire/${token}`);
    }

    console.log(`[questionnaire] Invitation créée — ${prenom} ${nom} — token ${token.substring(0, 8)}... — via ${sentVia}`);

    return res.json({
      ok: true,
      token,
      sent_via: sentVia === 'sms_pending' ? 'sms' : sentVia,
      link: `https://jadomi.fr/questionnaire/${token}`,
      expires_at: expiresAt.toISOString()
    });
  } catch (err) {
    console.error('[questionnaire] POST /send error:', err.message);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
});

// =============================================
// ENDPOINT 2 : GET /api/questionnaire/:token
// Récupérer le questionnaire (PUBLIC)
// =============================================
router.get('/check-expiry', requireAuth(), async (req, res) => {
  // NOTE: Cet endpoint est déclaré AVANT /:token pour éviter le conflit de route
  try {
    const societeId = req.societe?.id || req.user?.societe_id || null;

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    let query = admin()
      .from('patients_jadomi')
      .select('id, nom, prenom, telephone, email, questionnaire_signed_at, questionnaire_expires_at')
      .lt('questionnaire_expires_at', new Date().toISOString())
      .not('questionnaire_signed_at', 'is', null);

    if (societeId) {
      query = query.eq('societe_id', societeId);
    }

    const { data, error } = await query.order('questionnaire_expires_at', { ascending: true });

    if (error) {
      console.error('[questionnaire] check-expiry error:', error.message);
      return res.status(500).json({ error: 'Erreur lors de la vérification.' });
    }

    console.log(`[questionnaire] check-expiry — ${(data || []).length} questionnaires expirés`);

    return res.json({
      ok: true,
      expired_count: (data || []).length,
      patients: data || []
    });
  } catch (err) {
    console.error('[questionnaire] GET /check-expiry error:', err.message);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
});

router.get('/alerts/:patient_id', requireAuth(), async (req, res) => {
  // NOTE: Déclaré AVANT /:token pour éviter le conflit de route
  try {
    const { patient_id } = req.params;
    if (!patient_id) {
      return res.status(400).json({ error: 'patient_id requis.' });
    }

    const { data: patient, error } = await admin()
      .from('patients_jadomi')
      .select('id, nom, prenom, alertes_medicales, questionnaire_signed_at')
      .eq('id', patient_id)
      .single();

    if (error || !patient) {
      return res.status(404).json({ error: 'Patient non trouvé.' });
    }

    const alertes = (patient.alertes_medicales || []).map(alertType => {
      const def = ALERT_DEFINITIONS[alertType];
      if (!def) return { type: alertType, severity: 'unknown', message: alertType, actions: [] };
      return {
        type: alertType,
        severity: def.severity,
        message: def.message,
        actions: def.actions
      };
    });

    console.log(`[questionnaire] alerts/${patient_id} — ${alertes.length} alertes actives`);

    return res.json({
      ok: true,
      patient_id: patient.id,
      patient_nom: `${patient.prenom} ${patient.nom}`,
      alerts: alertes,
      last_update: patient.questionnaire_signed_at
    });
  } catch (err) {
    console.error('[questionnaire] GET /alerts error:', err.message);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
});

router.get('/patient/:patient_id/medical', requireAuth(), async (req, res) => {
  // NOTE: Déclaré AVANT /:token pour éviter le conflit de route
  try {
    const { patient_id } = req.params;
    if (!patient_id) {
      return res.status(400).json({ error: 'patient_id requis.' });
    }

    const { data: patient, error } = await admin()
      .from('patients_jadomi')
      .select('id, nom, prenom, date_naissance, telephone, email, questionnaire_medical, allergies, medicaments_actuels, alertes_medicales, questionnaire_signed_at, questionnaire_expires_at')
      .eq('id', patient_id)
      .single();

    if (error || !patient) {
      return res.status(404).json({ error: 'Patient non trouvé.' });
    }

    const now = new Date();
    const expiresAt = patient.questionnaire_expires_at ? new Date(patient.questionnaire_expires_at) : null;
    const isExpired = expiresAt ? now > expiresAt : false;

    const alertes = (patient.alertes_medicales || []).map(alertType => {
      const def = ALERT_DEFINITIONS[alertType];
      if (!def) return { type: alertType, severity: 'unknown', message: alertType, actions: [] };
      return {
        type: alertType,
        severity: def.severity,
        message: def.message,
        actions: def.actions
      };
    });

    console.log(`[questionnaire] patient/${patient_id}/medical — ${alertes.length} alertes, expiré: ${isExpired}`);

    return res.json({
      ok: true,
      patient: {
        id: patient.id,
        nom: patient.nom,
        prenom: patient.prenom,
        date_naissance: patient.date_naissance,
        telephone: patient.telephone,
        email: patient.email
      },
      questionnaire_medical: patient.questionnaire_medical || null,
      allergies: patient.allergies || [],
      medicaments_actuels: patient.medicaments_actuels || [],
      alertes_medicales: alertes,
      questionnaire_signed_at: patient.questionnaire_signed_at,
      questionnaire_expires_at: patient.questionnaire_expires_at,
      questionnaire_expired: isExpired
    });
  } catch (err) {
    console.error('[questionnaire] GET /patient/medical error:', err.message);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
});

// ===== GET /:token — Récupérer le questionnaire (PUBLIC) =====
router.get('/:token', publicRateLimit(), async (req, res) => {
  try {
    const { token } = req.params;
    if (!token || token.length !== 32) {
      return res.status(400).json({ error: 'Token invalide.' });
    }

    const { data: invitation, error } = await admin()
      .from('questionnaire_medical_invitations')
      .select('*')
      .eq('token', token)
      .single();

    if (error || !invitation) {
      return res.status(404).json({ error: 'Invitation non trouvée.' });
    }

    // Vérifier expiration
    if (new Date() > new Date(invitation.expires_at)) {
      return res.status(410).json({ error: 'Ce lien a expiré. Veuillez contacter votre cabinet pour en obtenir un nouveau.' });
    }

    // Déjà rempli ?
    if (invitation.status === 'completed') {
      return res.json({ ok: true, already_completed: true });
    }

    // Récupérer le questionnaire adapté
    const questionnaire = QUESTIONNAIRES[invitation.profession_type] || QUESTIONNAIRE_DENTISTE;

    console.log(`[questionnaire] GET /${token.substring(0, 8)}... — ${invitation.prenom} ${invitation.nom} — profession: ${invitation.profession_type}`);

    return res.json({
      ok: true,
      already_completed: false,
      invitation: {
        nom: invitation.nom,
        prenom: invitation.prenom,
        profession_type: invitation.profession_type
      },
      questionnaire
    });
  } catch (err) {
    console.error('[questionnaire] GET /:token error:', err.message);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
});

// =============================================
// ENDPOINT 3 : POST /api/questionnaire/:token/submit
// Soumettre le questionnaire rempli (PUBLIC)
// =============================================
router.post('/:token/submit', publicRateLimit(), async (req, res) => {
  try {
    const { token } = req.params;
    let { responses, signature_data } = req.body;

    if (!token || token.length !== 32) {
      return res.status(400).json({ error: 'Token invalide.' });
    }
    if (!responses || typeof responses !== 'object') {
      return res.status(400).json({ error: 'Réponses requises.' });
    }
    if (!signature_data) {
      return res.status(400).json({ error: 'Signature électronique requise.' });
    }

    // Récupérer l'invitation
    const { data: invitation, error: invErr } = await admin()
      .from('questionnaire_medical_invitations')
      .select('*')
      .eq('token', token)
      .single();

    if (invErr || !invitation) {
      return res.status(404).json({ error: 'Invitation non trouvée.' });
    }

    if (new Date() > new Date(invitation.expires_at)) {
      return res.status(410).json({ error: 'Ce lien a expiré.' });
    }

    if (invitation.status === 'completed') {
      return res.status(409).json({ error: 'Ce questionnaire a déjà été soumis.' });
    }

    // Normaliser les reponses : {answer: 'Oui', question: '...'} → 'Oui'
    const normalized = {};
    for (const [key, val] of Object.entries(responses)) {
      if (val && typeof val === 'object' && val.answer !== undefined) {
        normalized[key] = val.answer;
      } else {
        normalized[key] = val;
      }
    }
    responses = normalized;

    const questionnaire = QUESTIONNAIRES[invitation.profession_type] || QUESTIONNAIRE_DENTISTE;

    // Détecter alertes médicales
    const alerts = detectAlerts(responses, questionnaire);
    const alertTypes = alerts.map(a => a.type);

    // Extraire allergies et médicaments
    const allergies = extractAllergies(responses);
    const medicaments = extractMedicaments(responses);

    const now = new Date();
    const questionnaireExpiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // +12 mois

    // Créer ou mettre à jour le patient
    // D'abord, chercher un patient existant par email ou téléphone
    let patientId = null;
    const societeId = invitation.societe_id;

    if (invitation.email) {
      const { data: existingByEmail } = await admin()
        .from('patients_jadomi')
        .select('id')
        .eq('email', invitation.email.toLowerCase())
        .eq('societe_id', societeId)
        .single();
      if (existingByEmail) patientId = existingByEmail.id;
    }

    if (!patientId && invitation.telephone) {
      const { data: existingByTel } = await admin()
        .from('patients_jadomi')
        .select('id')
        .eq('telephone', invitation.telephone)
        .eq('societe_id', societeId)
        .single();
      if (existingByTel) patientId = existingByTel.id;
    }

    // Extraire la valeur brute des reponses (le frontend envoie {question, answer, section} ou juste la valeur)
    function getVal(key) {
      const v = responses[key];
      if (!v) return null;
      if (typeof v === 'object' && v.answer !== undefined) return v.answer || null;
      return v;
    }

    const patientData = {
      nom: invitation.nom,
      prenom: invitation.prenom,
      date_naissance: getVal('date_naissance') || null,
      telephone: getVal('telephone') || invitation.telephone,
      email: getVal('email') || invitation.email,
      societe_id: societeId,
      questionnaire_medical: responses,
      allergies: allergies.length > 0 ? allergies : null,
      medicaments_actuels: medicaments.length > 0 ? medicaments : null,
      alertes_medicales: alertTypes.length > 0 ? alertTypes : null,
      questionnaire_signed_at: now.toISOString(),
      questionnaire_expires_at: questionnaireExpiresAt.toISOString()
    };

    if (patientId) {
      // Mettre à jour le patient existant
      const { error: updateErr } = await admin()
        .from('patients_jadomi')
        .update(patientData)
        .eq('id', patientId);

      if (updateErr) {
        console.error('[questionnaire] update patient error:', updateErr.message);
        return res.status(500).json({ error: 'Erreur lors de la mise à jour du patient.' });
      }
      console.log(`[questionnaire] Patient mis à jour — id ${patientId}`);
    } else {
      // Créer un nouveau patient
      const { data: newPatient, error: createErr } = await admin()
        .from('patients_jadomi')
        .insert(patientData)
        .select('id')
        .single();

      if (createErr) {
        console.error('[questionnaire] create patient error:', createErr.message);
        return res.status(500).json({ error: 'Erreur lors de la création du patient.' });
      }
      patientId = newPatient.id;
      console.log(`[questionnaire] Nouveau patient créé — id ${patientId}`);
    }

    // Stocker la signature séparément
    try {
      await admin()
        .from('questionnaire_medical_signatures')
        .insert({
          patient_id: patientId,
          invitation_token: token,
          signature_base64: signature_data,
          signed_at: now.toISOString(),
          ip_address: req.ip || req.connection.remoteAddress || null
        });
      console.log(`[questionnaire] Signature stockée — patient ${patientId}`);
    } catch (sigErr) {
      console.error('[questionnaire] signature storage error:', sigErr.message);
      // Non bloquant : le questionnaire est quand même enregistré
    }

    // Mettre à jour l'invitation → completed
    await admin()
      .from('questionnaire_medical_invitations')
      .update({
        status: 'completed',
        completed_at: now.toISOString(),
        patient_id: patientId
      })
      .eq('token', token);

    console.log(`[questionnaire] Questionnaire soumis — ${invitation.prenom} ${invitation.nom} — ${alertTypes.length} alertes détectées: ${alertTypes.join(', ') || 'aucune'}`);

    return res.json({
      ok: true,
      patient_id: patientId,
      alerts_detected: alertTypes.length,
      alerts: alerts.map(a => ({ type: a.type, severity: a.severity, message: a.message }))
    });
  } catch (err) {
    console.error('[questionnaire] POST /:token/submit error:', err.message);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
});

// =============================================
// Export
// =============================================
module.exports = router;
