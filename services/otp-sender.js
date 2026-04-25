// =============================================
// JADOMI — Service OTP multi-canal
// SMS (OVH), WhatsApp (Meta), Email (SMTP)
// Code 6 chiffres, expiration 5 min, max 3 tentatives
// =============================================
const crypto = require('crypto');
const nodemailer = require('nodemailer');

function generateCode() {
  return String(crypto.randomInt(100000, 999999));
}

// === EMAIL OTP (SMTP existant) ===
async function sendEmailOTP(email, code, cabinetName) {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'pro1.mail.ovh.net',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER || process.env.EMAIL_USER,
        pass: process.env.SMTP_PASS || process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: `"${cabinetName || 'JADOMI'}" <${process.env.SMTP_USER || 'noreply@jadomi.fr'}>`,
      to: email,
      subject: 'Code de verification — ' + code,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;">
          <h2 style="font-size:20px;color:#0A1628;margin-bottom:16px;">Code de verification</h2>
          <p style="font-size:14px;color:#5C5C70;margin-bottom:24px;">
            Voici votre code d'acces securise :
          </p>
          <div style="text-align:center;padding:24px;background:#FAF5EB;border-radius:12px;margin-bottom:24px;">
            <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#0A1628;">${code}</div>
          </div>
          <p style="font-size:12px;color:#8E8E9E;line-height:1.6;">
            Ce code expire dans 5 minutes.<br>
            Si vous n'avez pas demande ce code, ignorez cet email.
          </p>
          <div style="margin-top:24px;padding-top:16px;border-top:1px solid #E5E2DB;font-size:11px;color:#8E8E9E;">
            Espace securise &middot; Chiffrement AES-256 &middot; Heberge en France
          </div>
        </div>
      `
    });
    return { success: true };
  } catch (err) {
    console.error('[OTP email]', err.message);
    return { success: false, error: err.message };
  }
}

// === SMS OTP (OVH API) ===
async function sendSmsOTP(telephone, code) {
  // OVH SMS API — necessite OVH_SMS_* dans .env
  const account = process.env.OVH_SMS_ACCOUNT;
  const login = process.env.OVH_SMS_LOGIN;
  const password = process.env.OVH_SMS_PASSWORD;

  if (!account || !login) {
    console.warn('[OTP SMS] OVH SMS non configure, fallback email');
    return { success: false, error: 'SMS non configure. Utilisez email ou WhatsApp.', fallback: 'email' };
  }

  try {
    const res = await fetch(`https://www.ovh.com/cgi-bin/sms/http2sms.cgi?account=${account}&login=${login}&password=${password}&from=JADOMI&to=${telephone.replace(/\s/g, '')}&message=${encodeURIComponent('JADOMI - Votre code de verification : ' + code + ' (valable 5 min)')}&noStop=1`);
    const text = await res.text();
    if (text.includes('OK')) return { success: true };
    return { success: false, error: 'Envoi SMS echoue : ' + text };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// === WHATSAPP OTP (Meta Cloud API) ===
async function sendWhatsAppOTP(telephone, code) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId) {
    console.warn('[OTP WhatsApp] Meta API non configuree, fallback email');
    return { success: false, error: 'WhatsApp non configure. Utilisez email ou SMS.', fallback: 'email' };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: telephone.replace(/[\s+()-]/g, ''),
        type: 'template',
        template: {
          name: 'verification_code',
          language: { code: 'fr' },
          components: [{
            type: 'body',
            parameters: [{ type: 'text', text: code }]
          }]
        }
      })
    });
    const data = await res.json();
    if (data.messages?.[0]?.id) return { success: true };
    return { success: false, error: data.error?.message || 'Envoi WhatsApp echoue' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// === DISPATCHER ===
async function sendOTP(canal, destination, code, cabinetName) {
  switch (canal) {
    case 'sms':
      return sendSmsOTP(destination, code);
    case 'whatsapp':
      return sendWhatsAppOTP(destination, code);
    case 'email':
    default:
      return sendEmailOTP(destination, code, cabinetName);
  }
}

module.exports = { generateCode, sendOTP, sendEmailOTP, sendSmsOTP, sendWhatsAppOTP };
