// =============================================
// JADOMI — Emails facturation (cabinet + copie fournisseur)
// Factures emises par JADOMI au nom du fournisseur
// (mandat de facturation art. 289-I-2 CGI)
// =============================================
const { sendMail } = require('../../api/multiSocietes/mailer');

/** Echappe les caracteres HTML dangereux */
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Nettoie un nom de fichier (retire tout sauf alphanum, tiret, underscore, point) */
function safeFilename(s) {
  if (!s) return 'unknown';
  return String(s).replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100) || 'unknown';
}

/**
 * Genere le bloc HTML resume de facture (reutilise dans les 2 emails).
 */
function invoiceSummaryHtml(invoice, supplierName) {
  const num = escHtml(invoice.number);
  const date = escHtml(invoice.date);
  const totalHt = escHtml(invoice.total_ht);
  const totalTva = escHtml(invoice.total_tva);
  const totalTtc = escHtml(invoice.total_ttc);
  const dueDate = escHtml(invoice.due_date);
  const supplier = escHtml(supplierName);

  return `
    <div style="margin:24px 0;padding:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
      <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:14px;">R\u00e9capitulatif</div>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;width:140px;">Facture n\u00b0</td>
          <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;">${num}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;">Fournisseur</td>
          <td style="padding:6px 0;font-size:13px;color:#0f172a;">${supplier}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;">Date</td>
          <td style="padding:6px 0;font-size:13px;color:#0f172a;">${date}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;">Total HT</td>
          <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;">${totalHt} EUR</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;">TVA 20%</td>
          <td style="padding:6px 0;font-size:13px;color:#0f172a;">${totalTva} EUR</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:700;border-top:2px solid #e2e8f0;padding-top:10px;">Total TTC</td>
          <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:700;border-top:2px solid #e2e8f0;padding-top:10px;">${totalTtc} EUR</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;">Echeance</td>
          <td style="padding:6px 0;font-size:13px;color:#0f172a;">${dueDate}</td>
        </tr>
      </table>
    </div>`;
}

/**
 * Genere le footer JADOMI commun.
 */
function footerHtml() {
  return `
  <div style="background:#f8fafc;padding:16px 28px;text-align:center;border-top:1px solid #e2e8f0;">
    <p style="color:#94a3b8;font-size:11px;margin:0;">JADOMI \u2014 Plateforme d'achats intelligente pour professionnels de sant\u00e9</p>
  </div>`;
}

/**
 * Genere le header JADOMI commun.
 */
function headerHtml() {
  return `
  <div style="background:#0f172a;padding:24px 28px;">
    <h1 style="color:#10b981;margin:0;font-size:22px;">JADOMI</h1>
  </div>`;
}

// =============================================
// 1. sendInvoiceToCabinet
// =============================================

/**
 * Envoie la facture au cabinet dentaire.
 *
 * @param {Object} options
 * @param {string} options.cabinetEmail
 * @param {string} options.cabinetName
 * @param {string} options.supplierName
 * @param {Object} options.invoice  — { number, date, total_ht, total_tva, total_ttc, due_date }
 * @param {Buffer} options.pdfBuffer
 * @param {string} options.mandate_ref
 */
async function sendInvoiceToCabinet({ cabinetEmail, cabinetName, supplierName, invoice, pdfBuffer, mandate_ref }) {
  if (!cabinetEmail) {
    console.warn('[Invoice Email Cabinet] Pas d\'email cabinet — skip');
    return { ok: false, error: 'no_email' };
  }

  const inv = invoice || {};
  const safeCabinetName = escHtml(cabinetName);
  const safeSupplierName = escHtml(supplierName);
  const safeMandateRef = escHtml(mandate_ref);
  const safeDueDate = escHtml(inv.due_date);

  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">

  ${headerHtml()}

  <div style="padding:28px;">

    <!-- Titre -->
    <h2 style="margin:0 0 4px;font-size:20px;color:#0f172a;">Votre facture est disponible</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#64748b;">Facture n\u00b0 ${escHtml(inv.number)}</p>

    <p style="color:#475569;font-size:14px;line-height:1.6;">
      Bonjour <strong>${safeCabinetName}</strong>,
    </p>
    <p style="color:#475569;font-size:14px;line-height:1.6;">
      Vous trouverez ci-dessous le r\u00e9capitulatif de votre facture \u00e9mise par <strong>${safeSupplierName}</strong>.
    </p>

    <!-- Resume facture -->
    ${invoiceSummaryHtml(inv, supplierName)}

    <!-- Mention legale -->
    <div style="margin:24px 0;padding:16px 20px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:0 10px 10px 0;">
      <p style="margin:0;font-size:12px;color:#92400e;line-height:1.6;">
        Cette facture a ete emise par JADOMI au nom et pour le compte de ${safeSupplierName}, conformement au mandat de facturation ref. ${safeMandateRef} (art. 289-I-2 CGI).
      </p>
    </div>

    <!-- Piece jointe info -->
    <div style="margin:24px 0;padding:16px 20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;">
      <div style="font-size:14px;font-weight:700;color:#166534;margin-bottom:6px;">T\u00e9l\u00e9charger la facture</div>
      <p style="margin:0;font-size:13px;color:#334155;line-height:1.6;">
        La facture est jointe a cet email au format Factur-X.
      </p>
    </div>

    <!-- Reglement -->
    <div style="margin:24px 0;padding:16px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
      <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:6px;">R\u00e8glement</div>
      <p style="margin:0;font-size:13px;color:#334155;line-height:1.6;">
        R\u00e8glement a effectuer a l'ordre de <strong>JADOMI SAS</strong> avant le <strong>${safeDueDate}</strong>.
      </p>
    </div>

  </div>

  ${footerHtml()}

</div>`;

  const subject = `JADOMI \u2014 Facture ${inv.number || ''} de ${supplierName || ''}`;

  const mailOptions = {
    to: cabinetEmail,
    subject,
    html,
    attachments: []
  };

  if (pdfBuffer) {
    mailOptions.attachments.push({
      filename: `Facture_${safeFilename(inv.number)}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    });
  }

  let lastErr = null;
  for (let i = 0; i < 3; i++) {
    try {
      const result = await sendMail(mailOptions);
      if (result.ok) {
        console.log(`[Invoice Email Cabinet] Envoi OK a ${cabinetEmail}`);
        return result;
      }
      lastErr = result.error;
    } catch (e) {
      lastErr = e.message;
    }
    if (i < 2) await new Promise(r => setTimeout(r, (i + 1) * 2000));
  }

  console.error(`[Invoice Email Cabinet] Echec 3 tentatives pour ${cabinetEmail}: ${lastErr}`);
  return { ok: false, error: lastErr };
}

// =============================================
// 2. sendInvoiceCopyToSupplier
// =============================================

/**
 * Envoie une copie de la facture au fournisseur (emise en son nom).
 *
 * @param {Object} options
 * @param {string} options.supplierEmail
 * @param {string} options.supplierName
 * @param {string} options.cabinetName
 * @param {Object} options.invoice        — { number, date, total_ht, total_tva, total_ttc, due_date }
 * @param {Buffer} options.pdfBuffer
 * @param {string} options.mandate_ref
 * @param {string|number} options.commission_ht
 * @param {string|number} options.net_supplier_ht
 * @param {number} [options.payment_delay=30]       — jours apres encaissement
 * @param {number} [options.contestation_delay=15]  — jours pour contester
 */
async function sendInvoiceCopyToSupplier({
  supplierEmail, supplierName, cabinetName, invoice, pdfBuffer,
  mandate_ref, commission_ht, net_supplier_ht,
  payment_delay = 30, contestation_delay = 15
}) {
  if (!supplierEmail) {
    console.warn('[Invoice Email Supplier Copy] Pas d\'email fournisseur — skip');
    return { ok: false, error: 'no_email' };
  }

  const inv = invoice || {};
  const safeSupplierName = escHtml(supplierName);
  const safeCabinetName = escHtml(cabinetName);
  const safeMandateRef = escHtml(mandate_ref);
  const safeCommission = escHtml(commission_ht);
  const safeNet = escHtml(net_supplier_ht);

  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">

  ${headerHtml()}

  <div style="padding:28px;">

    <!-- Titre -->
    <h2 style="margin:0 0 4px;font-size:20px;color:#0f172a;">Facture emise en votre nom</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#64748b;">Facture n\u00b0 ${escHtml(inv.number)}</p>

    <p style="color:#475569;font-size:14px;line-height:1.6;">
      Bonjour <strong>${safeSupplierName}</strong>,
    </p>
    <p style="color:#475569;font-size:14px;line-height:1.6;">
      Conformement au mandat de facturation ref. <strong>${safeMandateRef}</strong>, JADOMI a emis la facture suivante en votre nom et pour votre compte :
    </p>

    <!-- Resume facture -->
    ${invoiceSummaryHtml(inv, supplierName)}

    <!-- Commission JADOMI -->
    <div style="margin:24px 0;padding:20px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;">
      <div style="font-size:14px;font-weight:700;color:#1e40af;margin-bottom:14px;">D\u00e9tail commission</div>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;width:180px;">Commission JADOMI</td>
          <td style="padding:6px 0;font-size:13px;color:#1e40af;font-weight:600;">${safeCommission} EUR HT</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;">Montant a reverser</td>
          <td style="padding:6px 0;font-size:13px;color:#166534;font-weight:700;">${safeNet} EUR HT</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;">Reversement prevu</td>
          <td style="padding:6px 0;font-size:13px;color:#0f172a;">sous ${Number(payment_delay)} jours apres encaissement</td>
        </tr>
      </table>
    </div>

    <!-- Contestation -->
    <div style="margin:24px 0;padding:16px 20px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:0 10px 10px 0;">
      <p style="margin:0;font-size:12px;color:#92400e;line-height:1.6;">
        Vous disposez de <strong>${Number(contestation_delay)} jours</strong> pour contester cette facture. Passe ce delai, elle sera reputee acceptee.
      </p>
    </div>

  </div>

  ${footerHtml()}

</div>`;

  const subject = `JADOMI \u2014 Copie facture ${inv.number || ''} emise en votre nom`;

  const mailOptions = {
    to: supplierEmail,
    subject,
    html,
    attachments: []
  };

  if (pdfBuffer) {
    mailOptions.attachments.push({
      filename: `Facture_${safeFilename(inv.number)}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    });
  }

  let lastErr = null;
  for (let i = 0; i < 3; i++) {
    try {
      const result = await sendMail(mailOptions);
      if (result.ok) {
        console.log(`[Invoice Email Supplier Copy] Envoi OK a ${supplierEmail}`);
        return result;
      }
      lastErr = result.error;
    } catch (e) {
      lastErr = e.message;
    }
    if (i < 2) await new Promise(r => setTimeout(r, (i + 1) * 2000));
  }

  console.error(`[Invoice Email Supplier Copy] Echec 3 tentatives pour ${supplierEmail}: ${lastErr}`);
  return { ok: false, error: lastErr };
}

module.exports = { sendInvoiceToCabinet, sendInvoiceCopyToSupplier };
