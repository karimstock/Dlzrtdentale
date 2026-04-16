// =============================================
// JADOMI — Mailer avec support des pièces jointes (multi-sociétés)
// Utilise la même config SMTP que api/emailService.js, sans le modifier.
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
if (SMTP_PASS) {
  try {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      tls: { rejectUnauthorized: true }
    });
  } catch (e) { console.error('[multi/mailer] init:', e.message); }
}

async function sendMail({ to, subject, html, text, attachments, replyTo, from }) {
  if (!transporter) {
    console.log(`[multi/mailer/SIMULE] to=${to} subject="${subject}" attachments=${(attachments||[]).length}`);
    return { simulated: true, ok: true };
  }
  try {
    const info = await transporter.sendMail({
      from: from || `"${EMAIL_FROM_NAME}" <${EMAIL_FROM}>`,
      to, subject,
      html: html || undefined,
      text: text || (html ? html.replace(/<[^>]+>/g, '') : ''),
      attachments: attachments || undefined,
      replyTo: replyTo || EMAIL_CONTACT
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    console.error('[multi/mailer] send failed:', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = { sendMail };
