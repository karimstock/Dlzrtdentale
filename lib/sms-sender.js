/**
 * JADOMI — SMS Sender (OVH SMS API)
 * Envoi de SMS via OVH avec fallback simulation en dev
 */
const crypto = require('crypto');

/**
 * Normalise un numero de telephone au format E.164
 * @param {string} phone - Numero brut
 * @returns {string|null} - Numero normalise ou null
 */
function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  let p = phone.replace(/[\s\-\.()]/g, '');
  if (!/^\+?\d+$/.test(p)) return null;
  if (p.startsWith('0') && p.length === 10) {
    p = '+33' + p.substring(1);
  }
  if (p.startsWith('+') && p.length >= 10 && p.length <= 16) {
    return p;
  }
  if (p.startsWith('00') && p.length >= 12 && p.length <= 17) {
    return '+' + p.substring(2);
  }
  return null;
}

/**
 * Envoie un SMS via OVH ou simulation
 * @param {string} to - Numero destinataire
 * @param {string} message - Contenu du SMS
 * @returns {Promise<{success: boolean, message_id?: string, simulated?: boolean, error?: string}>}
 */
async function sendSMS(to, message) {
  const normalized = normalizePhone(to);
  if (!normalized) {
    return { success: false, error: 'Numero de telephone invalide' };
  }

  const serviceName = process.env.OVH_SMS_SERVICE || process.env.OVH_SMS_ACCOUNT;
  const appKey = process.env.OVH_APP_KEY;
  const appSecret = process.env.OVH_APP_SECRET;
  const consumerKey = process.env.OVH_CONSUMER_KEY;

  // Mode simulation si pas de config OVH
  if (!serviceName || !appKey || !appSecret || !consumerKey) {
    console.log(`[JADOMI SMS/SIMULE] to=${normalized} message="${message.substring(0, 60)}..."`);
    return { success: true, message_id: 'sim_' + Date.now(), simulated: true };
  }

  try {
    const timestamp = Math.round(Date.now() / 1000);
    const method = 'POST';
    const url = `https://eu.api.ovh.com/1.0/sms/${serviceName}/jobs`;
    const bodyData = JSON.stringify({
      charset: 'UTF-8',
      coding: '7bit',
      message: message,
      noStopClause: true,
      priority: 'high',
      receivers: [normalized],
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
    if (!res.ok) {
      throw new Error(JSON.stringify(data));
    }

    return {
      success: true,
      message_id: (data.ids && data.ids[0]) ? String(data.ids[0]) : String(data.totalCreditsRemoved || Date.now())
    };
  } catch (e) {
    console.error('[JADOMI SMS] Erreur envoi:', e.message);
    return { success: false, error: e.message };
  }
}

module.exports = { sendSMS, normalizePhone };
