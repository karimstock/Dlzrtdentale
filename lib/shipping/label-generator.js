// =============================================
// JADOMI — Generation etiquettes expedition PDF
// =============================================
const PDFDocument = require('pdfkit');

/**
 * Genere un PDF etiquette d'expedition (format 10x15 cm)
 * Retourne un Buffer PDF
 */
function generateShippingLabel({
  trackingNumber, carrier, fromAddress, toAddress,
  weight_kg, reference
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [283, 425], // 10x15 cm
      margin: 10
    });

    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header JADOMI
    doc.fontSize(10).fillColor('#c9a961')
       .text('JADOMI LOGISTICS', 10, 10);
    doc.fontSize(8).fillColor('#333')
       .text('Livraison optimisee', 10, 22);

    // Transporteur
    doc.fontSize(14).fillColor('#000')
       .text(carrier.toUpperCase(), 10, 40);

    // Tracking
    doc.fontSize(10).text('N\u00b0 ' + trackingNumber, 10, 60);

    // Barcode placeholder
    doc.fontSize(8).fillColor('#000')
       .text('|||||||||||||||||||||||||||||||||||||||', 10, 78);

    // FROM
    doc.fontSize(8).fillColor('#666').text('EXPEDITEUR', 10, 105);
    doc.fontSize(9).fillColor('#000');
    if (fromAddress.name) doc.text(fromAddress.name, 10, 117);
    if (fromAddress.street) doc.text(fromAddress.street, 10, 129);
    doc.text((fromAddress.postal || '') + ' ' + (fromAddress.city || ''), 10, 141);

    // TO
    doc.fontSize(10).fillColor('#000').text('DESTINATAIRE', 10, 168);
    doc.fontSize(12).fillColor('#000');
    if (toAddress.name) doc.text(toAddress.name, 10, 183);
    if (toAddress.street) doc.text(toAddress.street, 10, 198);
    doc.fontSize(14)
       .text((toAddress.postal || '') + ' ' + (toAddress.city || ''), 10, 218);

    // Poids
    if (weight_kg) doc.fontSize(10).text('Poids : ' + weight_kg + ' kg', 10, 252);

    // Reference
    doc.fontSize(8).fillColor('#999')
       .text('Ref : ' + (reference || ''), 10, 272);

    // Footer
    doc.fontSize(7).fillColor('#999')
       .text('JADOMI - Plateforme SaaS B2B pour professionnels de sante', 10, 400);

    doc.end();
  });
}

/**
 * Genere un tracking number unique
 */
function generateTrackingNumber() {
  return 'JAD-' + Date.now().toString(36).toUpperCase() + '-' +
    Math.random().toString(36).substring(2, 7).toUpperCase();
}

module.exports = { generateShippingLabel, generateTrackingNumber };
