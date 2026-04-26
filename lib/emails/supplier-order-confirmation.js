// =============================================
// JADOMI — Email confirmation commande fournisseur
// Envoye apres acceptation d'une offre GPO.
// Revele l'identite du cabinet au fournisseur.
// =============================================
const { sendMail } = require('../../api/multiSocietes/mailer');

/** Echappe les caracteres HTML dangereux */
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Formate une date en JJ/MM/AAAA
 */
function formatDate(d) {
  if (!d) return '---';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '---';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Envoie l'email de confirmation de commande au fournisseur.
 * Revele l'identite du cabinet (cachee pendant la negociation).
 *
 * @param {Object} options
 * @param {string} options.supplierEmail
 * @param {string} options.supplierName
 * @param {Object} options.cabinet  — { nom, adresse, code_postal, ville, siret, email, telephone, tva_intracom }
 * @param {Object} options.order    — { number, accepted_at }
 * @param {Array}  options.items    — [{ name, quantity, unit_price }]
 */
async function sendSupplierOrderConfirmation({ supplierEmail, supplierName, cabinet, order, items }) {
  if (!supplierEmail) {
    console.warn('[GPO Email Supplier Confirm] Pas d\'email fournisseur — skip');
    return { ok: false, error: 'no_email' };
  }

  const safeItems = Array.isArray(items) ? items : [];
  const orderNumber = (order && order.number) || '---';
  const acceptedAt = formatDate(order && order.accepted_at);
  const cabinetNom = escHtml(cabinet && cabinet.nom);

  // Calcul des totaux
  const totalHt = safeItems.reduce((sum, i) => {
    const qty = Number(i.quantity) || 1;
    const price = Number(i.unit_price) || 0;
    return sum + qty * price;
  }, 0);
  const tva = totalHt * 0.20;
  const totalTtc = totalHt + tva;

  // Table des items
  const itemsRowsHtml = safeItems.map(i => {
    const qty = Number(i.quantity) || 1;
    const unitPrice = Number(i.unit_price) || 0;
    const lineTotal = qty * unitPrice;
    return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#334155;">${escHtml(i.name)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#334155;text-align:center;">${qty}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#334155;text-align:right;">${unitPrice.toFixed(2)} \u20ac</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#334155;text-align:right;font-weight:600;">${lineTotal.toFixed(2)} \u20ac</td>
      </tr>`;
  }).join('');

  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">

  <!-- Header -->
  <div style="background:#0f172a;padding:24px 28px;">
    <h1 style="color:#10b981;margin:0;font-size:22px;">JADOMI</h1>
  </div>

  <div style="padding:28px;">

    <!-- Titre -->
    <h2 style="margin:0 0 4px;font-size:20px;color:#0f172a;">Commande confirmee</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#64748b;">N\u00b0 ${escHtml(orderNumber)}</p>

    <p style="color:#475569;font-size:14px;line-height:1.6;">
      Bonjour <strong>${escHtml(supplierName)}</strong>,
    </p>
    <p style="color:#475569;font-size:14px;line-height:1.6;">
      Vous avez accept\u00e9 cette commande. Voici les coordonn\u00e9es du cabinet ainsi que le d\u00e9tail de la commande.
    </p>

    <!-- Coordonnees du cabinet -->
    <div style="margin:24px 0;padding:20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;">
      <div style="font-size:14px;font-weight:700;color:#166534;margin-bottom:14px;">Coordonn\u00e9es du cabinet</div>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#64748b;width:130px;">Nom</td>
          <td style="padding:4px 0;font-size:13px;color:#0f172a;font-weight:600;">${cabinetNom}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#64748b;">Adresse</td>
          <td style="padding:4px 0;font-size:13px;color:#0f172a;">${escHtml(cabinet && cabinet.adresse)}, ${escHtml(cabinet && cabinet.code_postal)} ${escHtml(cabinet && cabinet.ville)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#64748b;">SIRET</td>
          <td style="padding:4px 0;font-size:13px;color:#0f172a;">${escHtml(cabinet && cabinet.siret)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#64748b;">Email</td>
          <td style="padding:4px 0;font-size:13px;color:#0f172a;">${escHtml(cabinet && cabinet.email)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#64748b;">T\u00e9l\u00e9phone</td>
          <td style="padding:4px 0;font-size:13px;color:#0f172a;">${escHtml(cabinet && cabinet.telephone)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#64748b;">TVA intracom</td>
          <td style="padding:4px 0;font-size:13px;color:#0f172a;">${escHtml(cabinet && cabinet.tva_intracom)}</td>
        </tr>
      </table>
    </div>

    <!-- Detail de la commande -->
    <div style="margin:24px 0;">
      <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:12px;">D\u00e9tail de la commande</div>
      <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#e2e8f0;">
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#475569;font-weight:600;">Produit</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;color:#475569;font-weight:600;">Qt\u00e9</th>
            <th style="padding:10px 12px;text-align:right;font-size:12px;color:#475569;font-weight:600;">P.U. HT</th>
            <th style="padding:10px 12px;text-align:right;font-size:12px;color:#475569;font-weight:600;">Total HT</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRowsHtml}
        </tbody>
      </table>

      <!-- Totaux -->
      <div style="margin-top:12px;padding:12px 16px;background:#f8fafc;border-radius:8px;">
        <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:14px;color:#475569;">
          <span>Total HT</span>
          <span style="font-weight:600;">${totalHt.toFixed(2)} \u20ac</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:14px;color:#475569;">
          <span>TVA 20%</span>
          <span>${tva.toFixed(2)} \u20ac</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:8px 0 0;font-size:16px;color:#0f172a;font-weight:700;border-top:2px solid #e2e8f0;margin-top:4px;">
          <span>Total TTC</span>
          <span>${totalTtc.toFixed(2)} \u20ac</span>
        </div>
      </div>
    </div>

    <!-- Prix verrouille -->
    <div style="margin:24px 0;padding:16px 20px;background:#f0fdf4;border-left:4px solid #10b981;border-radius:0 10px 10px 0;">
      <div style="font-size:14px;font-weight:700;color:#166534;margin-bottom:6px;">Prix verrouill\u00e9</div>
      <p style="margin:0;font-size:13px;color:#334155;line-height:1.6;">
        Le prix de <strong>${totalHt.toFixed(2)} \u20ac HT</strong> a \u00e9t\u00e9 accept\u00e9 par vos soins le <strong>${acceptedAt}</strong>.
      </p>
      <p style="margin:6px 0 0;font-size:13px;color:#334155;line-height:1.6;">
        Ce prix est contractuellement verrouill\u00e9 et ne peut \u00eatre modifi\u00e9.
      </p>
    </div>

    <!-- Prochaines etapes -->
    <div style="margin:24px 0;padding:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
      <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:12px;">Prochaines \u00e9tapes</div>
      <div style="font-size:13px;color:#334155;line-height:2;">
        1. Pr\u00e9parez la commande<br>
        2. Exp\u00e9diez \u00e0 l'adresse du cabinet ci-dessus<br>
        3. Emettez votre facture au nom du cabinet<br>
        4. Le cabinet confirmera la r\u00e9ception sur JADOMI
      </div>
    </div>

  </div>

  <!-- Footer -->
  <div style="background:#f8fafc;padding:16px 28px;text-align:center;border-top:1px solid #e2e8f0;">
    <p style="color:#94a3b8;font-size:11px;margin:0;">JADOMI \u2014 Plateforme d'achats intelligente pour professionnels de sant\u00e9</p>
  </div>

</div>`;

  // Subject is plain text — no HTML escaping (entities would show literally)
  const rawCabinetNom = (cabinet && cabinet.nom) || '';
  const subject = `JADOMI - Commande confirmee ${orderNumber} - ${rawCabinetNom}`;

  let lastErr = null;
  for (let i = 0; i < 3; i++) {
    try {
      const result = await sendMail({ to: supplierEmail, subject, html });
      if (result.ok) {
        console.log(`[GPO Email Supplier Confirm] Envoi OK a ${supplierEmail}`);
        return result;
      }
      lastErr = result.error;
    } catch (e) {
      lastErr = e.message;
    }
    if (i < 2) await new Promise(r => setTimeout(r, (i + 1) * 2000));
  }

  console.error(`[GPO Email Supplier Confirm] Echec 3 tentatives pour ${supplierEmail}: ${lastErr}`);
  return { ok: false, error: lastErr };
}

module.exports = { sendSupplierOrderConfirmation };
