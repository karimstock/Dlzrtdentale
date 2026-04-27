/**
 * JADOMI Sign — OTP SMS Verification
 * Verification d'identite du signataire par code SMS
 */

const crypto = require('crypto');

// In-memory OTP store (with TTL cleanup)
// In production, use Redis or Supabase
const otpStore = new Map();

// Cleanup expired OTPs every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of otpStore) {
    if (now > data.expires) otpStore.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Generate a 6-digit OTP code
 */
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Create and store an OTP for a phone number + document
 * @param {string} phone - Phone number (E.164 format)
 * @param {string} documentId - Document/signature ID
 * @returns {object} - { code, expires_at }
 */
function createOTP(phone, documentId) {
  const code = generateOTP();
  const normalizedKey = normalizePhone(phone) || phone;
  const key = `${normalizedKey}:${documentId}`;
  const ttl = 60 * 1000; // 60 seconds

  otpStore.set(key, {
    code,
    phone,
    documentId,
    attempts: 0,
    maxAttempts: 3,
    created: Date.now(),
    expires: Date.now() + ttl
  });

  return {
    code,
    expires_at: new Date(Date.now() + ttl).toISOString(),
    ttl_seconds: 60
  };
}

/**
 * Verify an OTP code
 * @param {string} phone - Phone number
 * @param {string} documentId - Document/signature ID
 * @param {string} code - OTP code to verify
 * @returns {object} - { valid, error? }
 */
function verifyOTP(phone, documentId, code) {
  const normalizedKey = normalizePhone(phone) || phone;
  const key = `${normalizedKey}:${documentId}`;
  const data = otpStore.get(key);

  if (!data) {
    return { valid: false, error: 'Code expire ou inexistant. Demandez un nouveau code.' };
  }

  if (Date.now() > data.expires) {
    otpStore.delete(key);
    return { valid: false, error: 'Code expire. Demandez un nouveau code.' };
  }

  data.attempts++;

  if (data.attempts > data.maxAttempts) {
    otpStore.delete(key);
    return { valid: false, error: 'Trop de tentatives. Demandez un nouveau code.' };
  }

  // Timing-safe comparison to prevent timing attacks
  const codeMatch = data.code.length === code.length &&
    crypto.timingSafeEqual(Buffer.from(data.code), Buffer.from(code));
  if (!codeMatch) {
    otpStore.set(key, data); // Update attempts count
    return { valid: false, error: `Code incorrect. ${data.maxAttempts - data.attempts} tentative(s) restante(s).` };
  }

  // Success — delete the OTP
  otpStore.delete(key);
  return { valid: true };
}

/**
 * Send OTP via SMS using the configured provider
 * Supports: Twilio, OVH SMS, or simulation mode
 */
async function sendOTPSms(phone, code) {
  // Normalize phone number
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return { sent: false, error: 'Numero de telephone invalide' };
  }

  const provider = process.env.SMS_PROVIDER || 'simulation';

  try {
    if (provider === 'twilio') {
      return await sendViaTwilio(normalizedPhone, code);
    } else if (provider === 'ovh') {
      return await sendViaOVH(normalizedPhone, code);
    } else {
      // Simulation mode — log to console
      console.log(`[JADOMI Sign OTP] SMS SIMULATION → ${normalizedPhone}: Votre code JADOMI Sign: ${code}`);
      return { sent: true, simulated: true, phone: normalizedPhone };
    }
  } catch (e) {
    console.error('[OTP SMS Error]', e.message);
    return { sent: false, error: e.message };
  }
}

/**
 * Send via Twilio
 */
async function sendViaTwilio(phone, code) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Twilio non configure (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)');
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const body = new URLSearchParams({
    To: phone,
    From: fromNumber,
    Body: `JADOMI Sign — Votre code de verification : ${code}\nCe code est valable 5 minutes.\nNe le partagez avec personne.`
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Twilio error');

  return { sent: true, sid: data.sid, phone };
}

/**
 * Send via OVH SMS API
 */
async function sendViaOVH(phone, code) {
  const serviceName = process.env.OVH_SMS_SERVICE;
  const appKey = process.env.OVH_APP_KEY;
  const appSecret = process.env.OVH_APP_SECRET;
  const consumerKey = process.env.OVH_CONSUMER_KEY;

  if (!serviceName || !appKey || !appSecret || !consumerKey) {
    throw new Error('OVH SMS non configure');
  }

  // OVH SMS API
  const timestamp = Math.round(Date.now() / 1000);
  const method = 'POST';
  const url = `https://eu.api.ovh.com/1.0/sms/${serviceName}/jobs`;
  const bodyData = JSON.stringify({
    charset: 'UTF-8',
    coding: '7bit',
    message: `JADOMI Sign - Code: ${code} (valable 5 min)`,
    noStopClause: true,
    priority: 'high',
    receivers: [phone],
    senderForResponse: false,
    sender: 'JADOMI'
  });

  const toSign = `${appSecret}+${consumerKey}+${method}+${url}+${bodyData}+${timestamp}`;
  const signature = '$1$' + crypto.createHash('sha1').update(toSign).digest('hex');

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Ovh-Application': appKey,
      'X-Ovh-Consumer': consumerKey,
      'X-Ovh-Signature': signature,
      'X-Ovh-Timestamp': timestamp.toString()
    },
    body: bodyData
  });

  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));

  return { sent: true, ids: data.ids, phone };
}

/**
 * Normalize phone to E.164 format
 */
function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  let p = phone.replace(/[\s\-\.()]/g, '');

  // Reject if contains anything other than digits and leading +
  if (!/^\+?\d+$/.test(p)) return null;

  // French numbers
  if (p.startsWith('0') && p.length === 10) {
    p = '+33' + p.substring(1);
  }
  // Already international
  if (p.startsWith('+') && p.length >= 10 && p.length <= 16) {
    return p;
  }
  // With 00 prefix
  if (p.startsWith('00') && p.length >= 12 && p.length <= 17) {
    return '+' + p.substring(2);
  }

  return null;
}

module.exports = {
  generateOTP,
  createOTP,
  verifyOTP,
  sendOTPSms,
  normalizePhone
};
