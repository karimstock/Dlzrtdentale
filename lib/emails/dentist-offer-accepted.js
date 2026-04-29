// =============================================
// JADOMI — Email de confirmation commande acceptée (dentiste)
// =============================================
const { sendMail } = require('../../api/multiSocietes/mailer');

const PUBLIC_URL = process.env.JADOMI_PUBLIC_URL || 'https://jadomi.fr';

/** Échappe les caractères HTML dangereux */
function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Envoie l'email de confirmation au dentiste quand un fournisseur accepte.
 * @param {object} opts
 * @param {string} opts.dentistEmail
 * @param {string} opts.supplierName
 * @param {object} opts.request
 * @param {number} opts.finalPrice
 * @param {string} [opts.orderNumber] - numéro de commande (optionnel, backward compat)
 * @param {object} [opts.supplierDetails] - { name, email, phone } (optionnel)
 */
async function sendDentistAcceptedEmail({ dentistEmail, supplierName, request, finalPrice, orderNumber, supplierDetails }) {
  if (!dentistEmail) {
    console.warn('[GPO Email Dentist] Pas d\'email dentiste — skip');
    return { ok: false, error: 'no_email' };
  }

  const items = Array.isArray(request.items) ? request.items : [];
  const itemsHtml = items.map(i =>
    `<li style="padding:6px 0;border-bottom:1px solid #f0f0ee;font-size:14px;">${i.quantity || 1}\u00d7 <strong>${escHtml(i.name || '?')}</strong></li>`
  ).join('');
  const itemsCount = items.length;
  const price = finalPrice ? Number(finalPrice).toFixed(2) : '---';

  // --- Enriched sections (only when new params are provided) ---
  const orderNumberHtml = orderNumber
    ? `<div style="background:#f0f4ff;border:1px solid #c7d2fe;border-radius:8px;padding:12px 16px;margin:0 0 16px;text-align:center;">
        <div style="font-size:12px;color:#666;margin-bottom:2px;">Numéro de commande</div>
        <div style="font-size:18px;font-weight:700;color:#4f46e5;letter-spacing:1px;">${escHtml(orderNumber)}</div>
      </div>`
    : '';

  const supplierContactHtml = supplierDetails
    ? `<div style="background:#f9f9f7;border-radius:8px;padding:12px 16px;margin:16px 0;">
        <div style="font-size:12px;color:#888;margin-bottom:8px;font-weight:600;">Coordonnées du fournisseur</div>
        <table style="width:100%;font-size:14px;color:#555;">
          <tr><td style="padding:4px 0;font-weight:600;width:80px;">Nom</td><td>${escHtml(supplierDetails.name || supplierName)}</td></tr>
          ${supplierDetails.email ? `<tr><td style="padding:4px 0;font-weight:600;">Email</td><td><a href="mailto:${escHtml(supplierDetails.email)}" style="color:#10b981;">${escHtml(supplierDetails.email)}</a></td></tr>` : ''}
          ${supplierDetails.phone ? `<tr><td style="padding:4px 0;font-weight:600;">Tél</td><td>${escHtml(supplierDetails.phone)}</td></tr>` : ''}
        </table>
      </div>`
    : '';

  const prixVerrouilleHtml = orderNumber
    ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin:20px 0;text-align:center;">
        <div style="font-size:12px;color:#666;margin-bottom:4px;">Prix verrouillé</div>
        <div style="font-size:28px;font-weight:700;color:#10b981;">${price}\u20ac</div>
        <div style="font-size:12px;color:#16a34a;margin-top:4px;">Ce prix est garanti et ne changera pas</div>
        <div style="font-size:12px;color:#666;margin-top:4px;">Fournisseur : ${escHtml(supplierName)}</div>
      </div>`
    : `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin:20px 0;text-align:center;">
        <div style="font-size:12px;color:#666;margin-bottom:4px;">Prix final</div>
        <div style="font-size:28px;font-weight:700;color:#10b981;">${price}\u20ac</div>
        <div style="font-size:12px;color:#666;margin-top:4px;">Fournisseur : ${escHtml(supplierName)}</div>
      </div>`;

  const prochEtapesHtml = orderNumber
    ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:16px 0;">
        <div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:10px;">Prochaines étapes</div>
        <ol style="margin:0;padding:0 0 0 20px;color:#555;font-size:14px;line-height:2;">
          <li>Le fournisseur va préparer votre commande</li>
          <li>Vous recevrez la livraison à l'adresse de votre cabinet</li>
          <li>Le fournisseur émettra une facture à votre nom</li>
          <li>Confirmez la réception dans votre dashboard JADOMI</li>
        </ol>
      </div>`
    : '';

  const ctaUrl = orderNumber
    ? `${PUBLIC_URL}/index.html?tab=commandes`
    : `${PUBLIC_URL}/index.html`;
  const ctaLabel = orderNumber ? 'Suivre ma commande' : 'Voir ma commande';

  const footerNote = orderNumber
    ? `<p style="color:#999;font-size:12px;line-height:1.5;">
        En cas de probl\u00e8me, n'h\u00e9sitez pas \u00e0 nous contacter.
      </p>`
    : `<p style="color:#999;font-size:12px;line-height:1.5;">
        Le fournisseur vous contactera pour organiser la livraison.
        En cas de probl\u00e8me, n'h\u00e9sitez pas \u00e0 nous contacter.
      </p>`;

  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
  <div style="background:#0f0e0d;padding:24px 28px;">
    <h1 style="color:#10b981;margin:0;font-size:22px;">JADOMI</h1>
  </div>
  <div style="padding:28px;">
    <h2 style="margin:0 0 16px;font-size:18px;color:#1a1a1a;">Votre commande a \u00e9t\u00e9 accept\u00e9e</h2>
    <p style="color:#555;font-size:14px;line-height:1.6;">
      Bonjour,
    </p>
    <p style="color:#555;font-size:14px;line-height:1.6;">
      Le fournisseur <strong>${escHtml(supplierName)}</strong> a accept\u00e9 votre commande
      de ${itemsCount} produit${itemsCount > 1 ? 's' : ''} au tarif JADOMI.
    </p>

    ${orderNumberHtml}
    ${prixVerrouilleHtml}
    ${supplierContactHtml}

    <div style="background:#f9f9f7;border-radius:8px;padding:12px 16px;margin:16px 0;">
      <div style="font-size:12px;color:#888;margin-bottom:8px;font-weight:600;">D\u00e9tail de la commande</div>
      <ul style="list-style:none;padding:0;margin:0;">
        ${itemsHtml}
      </ul>
    </div>

    ${prochEtapesHtml}

    <div style="text-align:center;margin:24px 0;">
      <a href="${ctaUrl}" style="display:inline-block;background:#10b981;color:#fff;padding:14px 32px;border-radius:50px;text-decoration:none;font-weight:700;font-size:15px;">
        ${ctaLabel}
      </a>
    </div>

    ${footerNote}
  </div>
  <div style="background:#f5f5f3;padding:16px 28px;text-align:center;">
    <p style="color:#999;font-size:11px;margin:0;">JADOMI \u2014 jadomi.fr</p>
  </div>
</div>`;

  let lastErr = null;
  for (let i = 0; i < 3; i++) {
    try {
      const result = await sendMail({
        to: dentistEmail,
        subject: `\u2705 Votre commande JADOMI est accept\u00e9e \u2014 ${supplierName}`,
        html
      });
      if (result.ok) {
        console.log(`[GPO Email Dentist] Envoi OK à ${dentistEmail}`);
        return result;
      }
      lastErr = result.error;
    } catch (e) {
      lastErr = e.message;
    }
    if (i < 2) await new Promise(r => setTimeout(r, (i + 1) * 2000));
  }

  console.error(`[GPO Email Dentist] Échec 3 tentatives pour ${dentistEmail}: ${lastErr}`);
  return { ok: false, error: lastErr };
}

/**
 * Email quand la commande échoue (tous fournisseurs refusés/timeout)
 */
async function sendDentistFailedEmail({ dentistEmail, request }) {
  if (!dentistEmail) return;
  const items = Array.isArray(request.items) ? request.items : [];
  const itemsCount = items.length;

  await sendMail({
    to: dentistEmail,
    subject: 'Votre commande JADOMI n\'a pas trouv\u00e9 de fournisseur',
    html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:#0f0e0d;padding:24px 28px;">
    <h1 style="color:#10b981;margin:0;font-size:22px;">JADOMI</h1>
  </div>
  <div style="padding:28px;">
    <h2 style="margin:0 0 16px;font-size:18px;">Commande non aboutie</h2>
    <p style="color:#555;font-size:14px;">
      Votre commande de ${itemsCount} produit${itemsCount > 1 ? 's' : ''} n'a malheureusement
      pas trouv\u00e9 de fournisseur disponible pour le moment.
    </p>
    <p style="color:#555;font-size:14px;">
      Nous vous invitons \u00e0 r\u00e9essayer ult\u00e9rieurement. De nouveaux fournisseurs
      rejoignent JADOMI chaque semaine.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${PUBLIC_URL}/index.html" style="display:inline-block;background:#10b981;color:#fff;padding:14px 32px;border-radius:50px;text-decoration:none;font-weight:700;">
        Retour au dashboard
      </a>
    </div>
  </div>
</div>`
  }).catch(e => console.error('[GPO Email Dentist Failed]', e.message));
}

module.exports = { sendDentistAcceptedEmail, sendDentistFailedEmail };
