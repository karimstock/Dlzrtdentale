// =============================================
// JADOMI — Dentiste Pro : Systeme de rappels
// SMS, email, push — 4 rappels par RDV
// Fonctionne pour toutes professions de sante
// =============================================
const express = require('express');
const nodemailer = require('nodemailer');
const { admin, requirePatient, requireCabinet, requirePermission, formatDateFR } = require('./shared');
const { sendSms } = require('../../services/otp-sender');

const router = express.Router();

// ===== Helpers =====

function getSmtpTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'pro1.mail.ovh.net',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER || process.env.EMAIL_USER,
      pass: process.env.SMTP_PASS || process.env.EMAIL_PASS
    }
  });
}

function buildRappelEmailHtml(patient, appointment, cabinet, confirmLink) {
  const patientName = [patient.prenom, patient.nom].filter(Boolean).join(' ') || 'Patient';
  const dateFR = formatDateFR(appointment.date);
  const cabinetName = cabinet?.nom || 'Votre cabinet';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f1f3d;font-family:Arial,sans-serif;color:#f1f5f9;">
<div style="max-width:600px;margin:0 auto;background:#1e3460;border:1px solid rgba(99,102,241,0.25);border-radius:12px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#1a2d50,#243870);padding:20px 24px;border-bottom:1px solid rgba(99,102,241,0.15);">
    <div style="font-size:18px;font-weight:700;color:#f1f5f9;">${cabinetName}</div>
  </div>
  <div style="padding:24px;">
    <h2 style="font-size:20px;color:#f1f5f9;margin:0 0 16px;">Rappel de rendez-vous</h2>
    <p style="font-size:14px;color:#cbd5e1;margin:0 0 20px;">
      Bonjour ${patientName},
    </p>
    <p style="font-size:14px;color:#cbd5e1;margin:0 0 20px;">
      Nous vous rappelons votre rendez-vous prevu le <strong style="color:#f1f5f9;">${dateFR}</strong>
      a <strong style="color:#f1f5f9;">${appointment.start_time}</strong>.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${confirmLink}" style="display:inline-block;padding:12px 32px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
        Confirmer ma presence
      </a>
    </div>
    <p style="font-size:12px;color:#94a3b8;margin:24px 0 0;">
      Si vous devez annuler ou reporter, veuillez nous contacter au plus vite.
    </p>
  </div>
  <div style="text-align:center;padding:16px 24px;border-top:1px solid rgba(99,102,241,0.15);font-size:11px;color:#64748b;">
    Envoye via <a href="https://jadomi.fr" style="color:#6366f1;">JADOMI</a>
  </div>
</div>
</body></html>`;
}

// Envoie une notification push via web-push
async function sendPushNotification(subscription, payload) {
  try {
    const webpush = require('web-push');
    const vapidPublic = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    const vapidEmail = process.env.VAPID_EMAIL || 'mailto:contact@jadomi.fr';

    if (!vapidPublic || !vapidPrivate) {
      console.warn('[rappels] VAPID keys non configurees');
      return { success: false, error: 'VAPID non configure' };
    }

    webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { success: true };
  } catch (err) {
    console.error('[rappels] push error:', err.message);
    return { success: false, error: err.message };
  }
}

// =========================================================
// POST /rappels/generate — Genere les 4 rappels pour un RDV
// Appele en interne apres une reservation
// =========================================================
router.post('/generate', requireCabinet(), requirePermission('rappels'), async (req, res) => {
  try {
    const { appointment_id } = req.body;
    if (!appointment_id) {
      return res.status(400).json({ error: 'appointment_id requis' });
    }

    // Charger le RDV
    const { data: rdv, error: rdvErr } = await admin()
      .from('appointments')
      .select('*')
      .eq('id', appointment_id)
      .single();

    if (rdvErr || !rdv) {
      return res.status(404).json({ error: 'Rendez-vous non trouve' });
    }

    const rdvDate = new Date(rdv.date + 'T' + (rdv.start_time || '09:00') + ':00');
    const now = new Date();

    // Definition des 4 rappels
    const rappelDefs = [
      { code: 'j7', offset_ms: -7 * 24 * 60 * 60 * 1000, channel: 'sms' },
      { code: 'j3', offset_ms: -3 * 24 * 60 * 60 * 1000, channel: 'email' },
      { code: 'j1', offset_ms: -1 * 24 * 60 * 60 * 1000, channel: 'push' },
      { code: 'h2', offset_ms: -2 * 60 * 60 * 1000, channel: 'push' }
    ];

    const records = [];
    for (const def of rappelDefs) {
      const scheduledAt = new Date(rdvDate.getTime() + def.offset_ms);
      // Skip si la date est dans le passe
      if (scheduledAt <= now) continue;

      records.push({
        cabinet_id: req.cabinet?.id || rdv.cabinet_id,
        appointment_id: rdv.id,
        patient_id: req.body.patient_id || rdv.patient_id,
        rappel_type: def.code,
        channel: def.channel,
        scheduled_at: scheduledAt.toISOString(),
        statut: 'pending',
        created_at: new Date().toISOString()
      });
    }

    if (records.length === 0) {
      return res.json({ success: true, created: 0, message: 'Aucun rappel a creer (dates passees)' });
    }

    const { data, error } = await admin()
      .from('dentiste_pro_rappels')
      .insert(records)
      .select();

    if (error) throw error;

    res.json({ success: true, created: (data || []).length, rappels: data });
  } catch (err) {
    console.error('[dentiste-pro] rappels/generate:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// POST /rappels/:id/confirm — Patient confirme sa presence
// =========================================================
router.post('/:id/confirm', async (req, res) => {
  try {
    const rappelId = req.params.id;

    const { data, error } = await admin()
      .from('dentiste_pro_rappels')
      .update({
        statut: 'confirmed',
        confirmed_at: new Date().toISOString()
      })
      .eq('id', rappelId)
      .in('statut', ['sent', 'pending'])
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Rappel non trouve ou deja traite' });
    }

    // Loguer l'evenement
    await admin()
      .from('dentiste_pro_events')
      .insert({
        cabinet_id: data.cabinet_id,
        event_type: 'rappel_confirmed',
        event_category: 'general',
        source: 'system',
        metadata: { rappel_id: data.id, patient_id: data.patient_id, appointment_id: data.appointment_id },
        created_at: new Date().toISOString()
      });

    // Reponse HTML si le patient clique le lien depuis un email
    const accept = req.headers.accept || '';
    if (accept.includes('text/html')) {
      return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
        body{background:#0f1f3d;color:#f1f5f9;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
        .box{background:#1e3460;border:1px solid rgba(99,102,241,0.25);border-radius:16px;padding:40px;text-align:center;max-width:400px;}
        h2{color:#6366f1;margin-bottom:10px;}
      </style></head><body><div class="box"><h2>Presence confirmee</h2><p>Merci, votre presence a ete confirmee.</p><p style="color:#94a3b8;font-size:13px;">JADOMI — Plateforme SaaS</p></div></body></html>`);
    }

    res.json({ success: true, message: 'Presence confirmee' });
  } catch (err) {
    console.error('[dentiste-pro] rappels/confirm:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// GET /rappels/pending — Admin : rappels en attente
// =========================================================
router.get('/pending', requireCabinet(), requirePermission('rappels'), async (req, res) => {
  try {
    const cabinetId = req.cabinet?.id;
    if (!cabinetId) return res.status(400).json({ error: 'Cabinet non configure' });

    const { data, error } = await admin()
      .from('dentiste_pro_rappels')
      .select('*, patient:dentiste_pro_patients(id, nom, prenom, telephone, email)')
      .eq('cabinet_id', cabinetId)
      .in('statut', ['pending', 'sent'])
      .order('scheduled_at', { ascending: true });

    if (error) throw error;

    res.json({ success: true, rappels: data || [], total: (data || []).length });
  } catch (err) {
    console.error('[dentiste-pro] rappels/pending:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =========================================================
// CRON : processRappels() — Traite les rappels en attente
// Appele toutes les 15 minutes depuis server.js
// =========================================================
async function processRappels() {
  try {
    const now = new Date().toISOString();

    // Recuperer les rappels a envoyer
    const { data: rappels, error } = await admin()
      .from('dentiste_pro_rappels')
      .select('*, patient:dentiste_pro_patients(id, nom, prenom, telephone, email, push_subscription)')
      .eq('statut', 'pending')
      .lte('scheduled_at', now)
      .limit(100);

    if (error) {
      console.error('[rappels cron] query error:', error);
      return { processed: 0, errors: 1 };
    }

    if (!rappels || rappels.length === 0) {
      return { processed: 0, errors: 0 };
    }

    const BASE_URL = process.env.BASE_URL || 'https://jadomi.fr';
    let sent = 0;
    let failed = 0;

    for (const rappel of rappels) {
      const patient = rappel.patient;

      // Charger le RDV lie (depuis la table appointments via appointment_id)
      let appointment = null;
      if (rappel.appointment_id) {
        const { data: apptData } = await admin()
          .from('appointments')
          .select('id, date, start_time, end_time')
          .eq('id', rappel.appointment_id)
          .maybeSingle();
        appointment = apptData;
      }

      if (!patient || !appointment) {
        // Marquer comme echoue
        await admin()
          .from('dentiste_pro_rappels')
          .update({ statut: 'failed', sent_at: now, error_message: 'Patient ou RDV manquant' })
          .eq('id', rappel.id);
        failed++;
        continue;
      }

      const confirmLink = `${BASE_URL}/api/dentiste-pro/rappels/${rappel.id}/confirm`;
      const dateFR = formatDateFR(appointment.date);
      const patientName = [patient.prenom, patient.nom].filter(Boolean).join(' ') || 'Patient';
      let sendResult = { success: false };

      try {
        switch (rappel.channel) {
          case 'sms':
            if (patient.telephone) {
              const smsMessage = `Rappel RDV le ${dateFR} a ${appointment.start_time}. Confirmez : ${confirmLink}`;
              sendResult = await sendSms(patient.telephone, smsMessage);
            } else {
              sendResult = { success: false, error: 'Pas de telephone' };
            }
            break;

          case 'email':
            if (patient.email) {
              try {
                // Charger le cabinet pour le nom
                const { data: cabinet } = await admin()
                  .from('dentiste_pro_cabinets')
                  .select('nom')
                  .eq('id', rappel.cabinet_id)
                  .maybeSingle();

                const transporter = getSmtpTransporter();
                const cabinetName = cabinet?.nom || 'Votre cabinet';

                await transporter.sendMail({
                  from: `"${cabinetName}" <${process.env.SMTP_USER || 'noreply@jadomi.fr'}>`,
                  to: patient.email,
                  subject: `Rappel : rendez-vous le ${dateFR} a ${appointment.start_time}`,
                  html: buildRappelEmailHtml(patient, appointment, cabinet, confirmLink)
                });
                sendResult = { success: true };
              } catch (emailErr) {
                sendResult = { success: false, error: emailErr.message };
              }
            } else {
              sendResult = { success: false, error: 'Pas d\'email' };
            }
            break;

          case 'push':
            if (patient.push_subscription) {
              sendResult = await sendPushNotification(patient.push_subscription, {
                title: 'Rappel de rendez-vous',
                body: `${patientName}, votre RDV est prevu le ${dateFR} a ${appointment.start_time}`,
                data: {
                  type: 'rappel',
                  rappel_id: rappel.id,
                  appointment_id: appointment.id,
                  confirm_link: confirmLink
                }
              });
            } else {
              sendResult = { success: false, error: 'Pas de souscription push' };
            }
            break;

          default:
            sendResult = { success: false, error: `Canal inconnu: ${rappel.channel}` };
        }
      } catch (sendErr) {
        sendResult = { success: false, error: sendErr.message };
      }

      // Mettre a jour le statut
      const updateData = {
        statut: sendResult.success ? 'sent' : 'failed',
        sent_at: new Date().toISOString()
      };
      if (!sendResult.success) {
        updateData.error_message = sendResult.error || 'Erreur inconnue';
      }

      await admin()
        .from('dentiste_pro_rappels')
        .update(updateData)
        .eq('id', rappel.id);

      if (sendResult.success) sent++;
      else failed++;
    }

    console.log(`[rappels cron] Traite: ${sent} envoyes, ${failed} echoues sur ${rappels.length}`);
    return { processed: rappels.length, sent, failed };
  } catch (err) {
    console.error('[rappels cron] Erreur globale:', err);
    return { processed: 0, errors: 1 };
  }
}

// Export du router et du cron
module.exports = router;
module.exports.processRappels = processRappels;
