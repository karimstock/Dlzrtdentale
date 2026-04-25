// =============================================
// JADOMI — Dentiste Pro : authentification patient
// Phone + OTP, creation auto de compte, JWT 30j
// =============================================
const express = require('express');
const { admin, createPatientToken, requirePatient } = require('./shared');
const { generateCode, sendOTP } = require('../../services/otp-sender');

const router = express.Router();

// ===== Rate limiting OTP (in-memory) =====
// Cle: IP, Valeur: { count, resetAt }
const otpRateMap = new Map();
const OTP_RATE_LIMIT = 5;
const OTP_RATE_WINDOW = 15 * 60 * 1000; // 15 min

function checkOtpRateLimit(ip) {
  const now = Date.now();
  const entry = otpRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    otpRateMap.set(ip, { count: 1, resetAt: now + OTP_RATE_WINDOW });
    return true;
  }
  if (entry.count >= OTP_RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// Nettoyage periodique (toutes les 30 min)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of otpRateMap) {
    if (now > entry.resetAt) otpRateMap.delete(ip);
  }
}, 30 * 60 * 1000);

// =========================================================
// POST /auth/request-otp
// Body: { cabinet_id, telephone }
// Genere un code 6 chiffres, le stocke, l'envoie par SMS
// =========================================================
router.post('/request-otp', async (req, res) => {
  try {
    const { cabinet_id, telephone } = req.body;
    if (!cabinet_id || !telephone) {
      return res.status(400).json({ error: 'Champs obligatoires : cabinet_id, telephone' });
    }

    // Rate limit
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkOtpRateLimit(ip)) {
      return res.status(429).json({ error: 'Trop de demandes. Veuillez reessayer dans quelques minutes.' });
    }

    // Verifier que le cabinet existe
    const { data: cabinet, error: cabErr } = await admin()
      .from('dentiste_pro_cabinets')
      .select('id, nom')
      .eq('id', cabinet_id)
      .maybeSingle();

    if (cabErr) {
      console.error('[dentiste-pro] request-otp cabinet query:', cabErr);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
    if (!cabinet) {
      return res.status(404).json({ error: 'Cabinet non trouve' });
    }

    // Generer le code OTP
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min

    // Chercher ou creer le patient
    const tel = telephone.trim().replace(/\s/g, '');
    const { data: existing } = await admin()
      .from('dentiste_pro_patients')
      .select('id')
      .eq('cabinet_id', cabinet_id)
      .eq('telephone', tel)
      .maybeSingle();

    if (existing) {
      // Mettre a jour le code OTP
      await admin()
        .from('dentiste_pro_patients')
        .update({ otp_code: code, otp_expires_at: expiresAt })
        .eq('id', existing.id);
    } else {
      // Creer un patient provisoire
      await admin()
        .from('dentiste_pro_patients')
        .insert({
          cabinet_id,
          telephone: tel,
          otp_code: code,
          otp_expires_at: expiresAt,
          created_at: new Date().toISOString()
        });
    }

    // Envoyer le code par SMS
    const result = await sendOTP('sms', tel, code, cabinet.nom);
    if (!result.success) {
      console.warn('[dentiste-pro] OTP send failed:', result.error);
      // On ne bloque pas — le code est stocke en base pour le dev/test
    }

    res.json({ success: true, message: 'Code envoye' });
  } catch (err) {
    console.error('[dentiste-pro] request-otp:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// POST /auth/verify-otp
// Body: { cabinet_id, telephone, code }
// Verifie le code, cree le compte si nouveau, renvoie JWT
// =========================================================
router.post('/verify-otp', async (req, res) => {
  try {
    const { cabinet_id, telephone, code } = req.body;
    if (!cabinet_id || !telephone || !code) {
      return res.status(400).json({ error: 'Champs obligatoires : cabinet_id, telephone, code' });
    }

    const tel = telephone.trim().replace(/\s/g, '');

    // Chercher le patient
    const { data: patient, error } = await admin()
      .from('dentiste_pro_patients')
      .select('*')
      .eq('cabinet_id', cabinet_id)
      .eq('telephone', tel)
      .maybeSingle();

    if (error) {
      console.error('[dentiste-pro] verify-otp query:', error);
      return res.status(500).json({ error: 'Erreur serveur' });
    }

    if (!patient) {
      return res.status(404).json({ error: 'Aucun code demande pour ce numero' });
    }

    // Verifier le code
    if (patient.otp_code !== code) {
      return res.status(401).json({ error: 'Code incorrect' });
    }

    // Verifier l'expiration
    if (new Date(patient.otp_expires_at) < new Date()) {
      return res.status(401).json({ error: 'Code expire. Veuillez en demander un nouveau.' });
    }

    // Invalider le code OTP
    await admin()
      .from('dentiste_pro_patients')
      .update({
        otp_code: null,
        otp_expires_at: null,
        verified: true,
        last_login_at: new Date().toISOString()
      })
      .eq('id', patient.id);

    // Generer le JWT
    const token = createPatientToken(patient.id, cabinet_id);

    // Retourner les infos patient (sans OTP)
    const { otp_code, otp_expires_at, ...patientInfo } = patient;

    res.json({ success: true, token, patient: patientInfo });
  } catch (err) {
    console.error('[dentiste-pro] verify-otp:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// POST /auth/refresh
// Renouvelle le JWT patient (requirePatient)
// =========================================================
router.post('/refresh', requirePatient(), async (req, res) => {
  try {
    const { id, cabinet_id } = req.patient;

    // Verifier que le patient existe toujours
    const { data: patient, error } = await admin()
      .from('dentiste_pro_patients')
      .select('id, cabinet_id, telephone, nom, prenom, email, verified')
      .eq('id', id)
      .eq('cabinet_id', cabinet_id)
      .maybeSingle();

    if (error) {
      console.error('[dentiste-pro] refresh query:', error);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
    if (!patient) {
      return res.status(404).json({ error: 'Patient non trouve' });
    }

    const token = createPatientToken(patient.id, patient.cabinet_id);
    res.json({ success: true, token, patient });
  } catch (err) {
    console.error('[dentiste-pro] refresh:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// GET /auth/me
// Profil du patient connecte (requirePatient)
// =========================================================
router.get('/me', requirePatient(), async (req, res) => {
  try {
    const { id, cabinet_id } = req.patient;

    const { data: patient, error } = await admin()
      .from('dentiste_pro_patients')
      .select('id, cabinet_id, telephone, nom, prenom, email, date_naissance, verified, created_at, last_login_at')
      .eq('id', id)
      .eq('cabinet_id', cabinet_id)
      .maybeSingle();

    if (error) {
      console.error('[dentiste-pro] me query:', error);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
    if (!patient) {
      return res.status(404).json({ error: 'Patient non trouve' });
    }

    res.json({ success: true, patient });
  } catch (err) {
    console.error('[dentiste-pro] me:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// PUT /auth/profile
// Mise a jour du profil patient (nom, email, push)
// =========================================================
router.put('/profile', requirePatient(), async (req, res) => {
  try {
    const { id, cabinet_id } = req.patient;
    const { nom, prenom, email, date_naissance } = req.body;

    const updates = {};
    if (nom !== undefined) updates.nom = nom.trim();
    if (prenom !== undefined) updates.prenom = prenom.trim();
    if (email !== undefined) updates.email = email.trim().toLowerCase();
    if (date_naissance !== undefined) updates.date_naissance = date_naissance;
    updates.updated_at = new Date().toISOString();

    if (Object.keys(updates).length <= 1) {
      return res.status(400).json({ error: 'Aucun champ a mettre a jour' });
    }

    const { data: patient, error } = await admin()
      .from('dentiste_pro_patients')
      .update(updates)
      .eq('id', id)
      .eq('cabinet_id', cabinet_id)
      .select('id, cabinet_id, telephone, nom, prenom, email, date_naissance, verified')
      .single();

    if (error) {
      console.error('[dentiste-pro] profile update error:', error);
      return res.status(500).json({ error: 'Erreur lors de la mise a jour du profil' });
    }

    res.json({ success: true, patient });
  } catch (err) {
    console.error('[dentiste-pro] profile:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// POST /auth/push-subscribe
// Stocke la souscription VAPID push (requirePatient)
// Body: { subscription } (objet PushSubscription standard)
// =========================================================
router.post('/push-subscribe', requirePatient(), async (req, res) => {
  try {
    const { id, cabinet_id } = req.patient;
    const { subscription } = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Souscription push invalide' });
    }

    const { error } = await admin()
      .from('dentiste_pro_patients')
      .update({
        push_subscription: subscription,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('cabinet_id', cabinet_id);

    if (error) {
      console.error('[dentiste-pro] push-subscribe error:', error);
      return res.status(500).json({ error: 'Erreur lors de l\'enregistrement push' });
    }

    res.json({ success: true, message: 'Souscription push enregistree' });
  } catch (err) {
    console.error('[dentiste-pro] push-subscribe:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
