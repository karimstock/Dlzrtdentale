// =============================================
// JADOMI — Service email (OVH Pro via nodemailer)
// Usage: const { sendMail, sendWelcome } = require('./api/emailService');
// =============================================
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'pro1.mail.ovh.net';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'false') === 'true';
const SMTP_USER = process.env.SMTP_USER || 'noreply@jadomi.fr';
const SMTP_PASS = process.env.SMTP_PASS || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@jadomi.fr';
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'JADOMI';
const EMAIL_CONTACT = process.env.EMAIL_CONTACT || 'contact@jadomi.fr';

let transporter = null;
let ready = false;

function initTransporter() {
  if (!SMTP_PASS || SMTP_PASS === 'AREMPLACER') {
    console.log('[emailService] SMTP_PASS non configure — envoi en mode simulation');
    ready = false;
    return null;
  }
  try {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE, // false pour STARTTLS sur 587
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      tls: { rejectUnauthorized: true }
    });
    ready = true;
    console.log(`[emailService] Transport OVH Pro initialise (${SMTP_HOST}:${SMTP_PORT} user=${SMTP_USER})`);
    return transporter;
  } catch (e) {
    console.error('[emailService] Init transport failed:', e.message);
    ready = false;
    return null;
  }
}

initTransporter();

async function verify() {
  if (!transporter) return { ok: false, error: 'Transporter non initialise (SMTP_PASS manquant ?)' };
  try {
    await transporter.verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function sendMail({ to, subject, html, text, replyTo }) {
  if (!transporter) {
    console.log(`[emailService/SIMULE] To=${to} Subject=${subject}`);
    return { simulated: true, ok: true };
  }
  try {
    const info = await transporter.sendMail({
      from: `"${EMAIL_FROM_NAME}" <${EMAIL_FROM}>`,
      to,
      subject,
      html: html || undefined,
      text: text || (html ? html.replace(/<[^>]+>/g, '') : ''),
      replyTo: replyTo || EMAIL_CONTACT
    });
    return { ok: true, messageId: info.messageId, response: info.response };
  } catch (e) {
    console.error('[emailService] send failed:', e.message);
    return { ok: false, error: e.message };
  }
}

function welcomeHtml({ prenom, nom, cabinet, plan }) {
  const name = (prenom || '') + (nom ? ' ' + nom : '');
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f0e0d;font-family:Arial,sans-serif;color:#e8e6e0;">
<div style="max-width:560px;margin:0 auto;background:#1a1917;border:1px solid #2f2c28;border-radius:12px;overflow:hidden;">
  <div style="padding:30px 30px 10px 30px;border-bottom:1px solid #2f2c28;">
    <div style="font-size:28px;font-weight:800;color:#c8f060;letter-spacing:-1px;">JADOMI</div>
    <div style="font-size:12px;color:#9c9890;margin-top:4px;">Gestion stock dentaire intelligente</div>
  </div>
  <div style="padding:30px;">
    <h2 style="color:#c8f060;font-size:20px;margin:0 0 16px 0;">Bienvenue ${name || 'sur JADOMI'} !</h2>
    <p style="line-height:1.6;font-size:14px;color:#e8e6e0;">
      Votre compte JADOMI est actif. Vous pouvez des maintenant acceder a votre tableau de bord
      et commencer a gerer votre stock dentaire avec l'IA.
    </p>
    ${cabinet ? `<p style="font-size:13px;color:#9c9890;">Cabinet : <strong style="color:#e8e6e0;">${cabinet}</strong></p>` : ''}
    ${plan ? `<p style="font-size:13px;color:#9c9890;">Formule : <strong style="color:#c8f060;">${plan}</strong></p>` : ''}
    <div style="text-align:center;margin:30px 0;">
      <a href="https://jadomi.fr/index.html" style="display:inline-block;padding:14px 28px;background:#c8f060;color:#0f0e0d;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">
        Acceder a mon tableau de bord
      </a>
    </div>
    <p style="font-size:12px;color:#9c9890;line-height:1.6;">
      Pour toute question, contactez-nous a <a href="mailto:${EMAIL_CONTACT}" style="color:#c8f060;">${EMAIL_CONTACT}</a>.
    </p>
  </div>
  <div style="padding:16px 30px;border-top:1px solid #2f2c28;font-size:11px;color:#6b6760;text-align:center;">
    JADOMI SAS &middot; <a href="https://jadomi.fr" style="color:#9c9890;text-decoration:none;">jadomi.fr</a>
  </div>
</div>
</body></html>`;
}

async function sendWelcome({ to, prenom, nom, cabinet, plan }) {
  const subject = 'Bienvenue sur JADOMI';
  const html = welcomeHtml({ prenom, nom, cabinet, plan });
  return sendMail({ to, subject, html });
}

module.exports = { sendMail, sendWelcome, verify, welcomeHtml };
