// =============================================
// JADOMI — Generation PDF Bon de Commande GPO
// =============================================
const PDFDocument = require('pdfkit');

const COLORS = {
  brand:     '#10b981',
  black:     '#000000',
  darkGray:  '#334155',
  midGray:   '#64748b',
  lightGray: '#f1f5f9',
  tableHead: '#e2e8f0',
  white:     '#ffffff'
};

const PAGE = {
  width: 595.28,   // A4
  height: 841.89,
  marginLeft: 50,
  marginRight: 50,
  contentWidth: 495.28 // width - marginLeft - marginRight
};

/**
 * Formate une date ISO en "JJ/MM/AAAA"
 */
function formatDate(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return day + '/' + month + '/' + year;
}

/**
 * Formate un montant en EUR
 */
function formatEUR(val) {
  if (val == null) return '0,00';
  return Number(val).toFixed(2).replace('.', ',');
}

/**
 * Dessine une ligne horizontale
 */
function drawLine(doc, y, color, width) {
  doc.strokeColor(color || COLORS.midGray)
     .lineWidth(width || 0.5)
     .moveTo(PAGE.marginLeft, y)
     .lineTo(PAGE.width - PAGE.marginRight, y)
     .stroke();
}

/**
 * Genere un PDF professionnel de bon de commande GPO.
 * Retourne un Buffer PDF.
 *
 * @param {object} orderData
 * @returns {Promise<Buffer>}
 */
function generateOrderPDF(orderData) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 40, bottom: 40, left: PAGE.marginLeft, right: PAGE.marginRight },
      info: {
        Title: 'Bon de commande ' + (orderData.order_number || ''),
        Author: 'JADOMI',
        Subject: 'Bon de commande GPO',
        Creator: 'JADOMI Platform'
      }
    });

    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      renderDocument(doc, orderData);
    } catch (err) {
      doc.end();
      reject(err);
      return;
    }

    doc.end();
  });
}

/**
 * Rendu complet du document
 */
function renderDocument(doc, data) {
  const FOOTER_Y = PAGE.height - 50;
  const PAGE_BOTTOM = FOOTER_Y - 20; // safe zone above footer
  let y = 40;

  // ---- HEADER ----
  doc.fontSize(26).fillColor(COLORS.brand).font('Helvetica-Bold')
     .text('JADOMI', PAGE.marginLeft, y);
  doc.fontSize(16).fillColor(COLORS.darkGray).font('Helvetica-Bold')
     .text('Bon de commande', PAGE.marginLeft, y + 34);
  doc.fontSize(12).fillColor(COLORS.midGray).font('Helvetica')
     .text(data.order_number || '', PAGE.marginLeft, y + 54);

  y += 80;
  drawLine(doc, y, COLORS.brand, 2);
  y += 15;

  // ---- DATES ----
  doc.fontSize(10).fillColor(COLORS.darkGray).font('Helvetica');
  doc.text('Date : ' + formatDate(new Date().toISOString()), PAGE.marginLeft, y);
  doc.text('Prix verrouille le : ' + formatDate(data.price_locked_at), PAGE.marginLeft, y + 16);

  y += 46;

  // ---- BUYER / SUPPLIER COLUMNS ----
  const colLeft = PAGE.marginLeft;
  const colRight = PAGE.marginLeft + 260;

  // Buyer
  doc.fontSize(9).fillColor(COLORS.brand).font('Helvetica-Bold')
     .text('ACHETEUR', colLeft, y);
  y += 16;
  doc.fontSize(10).fillColor(COLORS.black).font('Helvetica-Bold')
     .text(data.cabinet_name || '', colLeft, y, { width: 240 });
  let buyerY = y + 16;
  doc.fontSize(9).fillColor(COLORS.darkGray).font('Helvetica');
  if (data.cabinet_adresse)
    doc.text(data.cabinet_adresse, colLeft, buyerY, { width: 240 });
  buyerY += 13;
  const cpVille = [data.cabinet_code_postal, data.cabinet_ville].filter(Boolean).join(' ');
  if (cpVille) doc.text(cpVille, colLeft, buyerY, { width: 240 });
  buyerY += 13;
  if (data.cabinet_siret)
    doc.text('SIRET : ' + data.cabinet_siret, colLeft, buyerY, { width: 240 });
  buyerY += 13;
  if (data.cabinet_tva_intracom)
    doc.text('TVA Intracom : ' + data.cabinet_tva_intracom, colLeft, buyerY, { width: 240 });
  buyerY += 13;
  if (data.cabinet_email)
    doc.text(data.cabinet_email, colLeft, buyerY, { width: 240 });
  buyerY += 13;
  if (data.cabinet_telephone)
    doc.text('Tel : ' + data.cabinet_telephone, colLeft, buyerY, { width: 240 });

  // Supplier
  let suppY = y - 16;
  doc.fontSize(9).fillColor(COLORS.brand).font('Helvetica-Bold')
     .text('FOURNISSEUR', colRight, suppY);
  suppY += 16;
  doc.fontSize(10).fillColor(COLORS.black).font('Helvetica-Bold')
     .text(data.supplier_name || '', colRight, suppY, { width: 220 });
  suppY += 16;
  doc.fontSize(9).fillColor(COLORS.darkGray).font('Helvetica');
  if (data.supplier_email)
    doc.text(data.supplier_email, colRight, suppY, { width: 220 });
  suppY += 13;
  if (data.supplier_telephone)
    doc.text('Tel : ' + data.supplier_telephone, colRight, suppY, { width: 220 });

  y = Math.max(buyerY, suppY) + 25;
  drawLine(doc, y, COLORS.midGray, 0.5);
  y += 15;

  // ---- ITEMS TABLE ----
  const cols = [
    { label: 'Ref',             x: colLeft,       w: 55,  align: 'left'  },
    { label: 'Designation',     x: colLeft + 55,  w: 210, align: 'left'  },
    { label: 'Qte',             x: colLeft + 265, w: 45,  align: 'right' },
    { label: 'Prix unit. HT',   x: colLeft + 310, w: 90,  align: 'right' },
    { label: 'Total HT',        x: colLeft + 400, w: 95,  align: 'right' }
  ];

  // Table header background
  doc.rect(colLeft, y, PAGE.contentWidth, 22)
     .fill(COLORS.tableHead);
  doc.fontSize(8).fillColor(COLORS.darkGray).font('Helvetica-Bold');
  cols.forEach(col => {
    doc.text(col.label, col.x + 4, y + 6, {
      width: col.w - 8,
      align: col.align
    });
  });
  y += 22;

  // Table rows
  const items = data.items || [];
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.black);

  items.forEach((item, idx) => {
    const rowH = 22;

    // Page break if we would overflow into footer area
    if (y + rowH > PAGE_BOTTOM) {
      doc.addPage();
      y = 40;
      // Re-draw table header on new page
      doc.rect(colLeft, y, PAGE.contentWidth, 22)
         .fill(COLORS.tableHead);
      doc.fontSize(8).fillColor(COLORS.darkGray).font('Helvetica-Bold');
      cols.forEach(col => {
        doc.text(col.label, col.x + 4, y + 6, {
          width: col.w - 8,
          align: col.align
        });
      });
      y += 22;
    }

    // Alternate row background
    if (idx % 2 === 1) {
      doc.rect(colLeft, y, PAGE.contentWidth, rowH)
         .fill(COLORS.lightGray);
      doc.fillColor(COLORS.black);
    }

    const lineTotal = (item.quantity || 0) * (item.target_price_eur || 0);
    const refLabel = item.ref || item.reference || String(idx + 1);

    doc.font('Helvetica').fontSize(9).fillColor(COLORS.black);
    doc.text(refLabel, cols[0].x + 4, y + 6, { width: cols[0].w - 8, align: 'left' });
    doc.text(item.name || '-', cols[1].x + 4, y + 6, { width: cols[1].w - 8, align: 'left' });
    doc.text(String(item.quantity || 0), cols[2].x + 4, y + 6, { width: cols[2].w - 8, align: 'right' });
    doc.text(formatEUR(item.target_price_eur) + ' EUR', cols[3].x + 4, y + 6, { width: cols[3].w - 8, align: 'right' });
    doc.text(formatEUR(lineTotal) + ' EUR', cols[4].x + 4, y + 6, { width: cols[4].w - 8, align: 'right' });

    y += rowH;
  });

  drawLine(doc, y, COLORS.midGray, 0.5);
  y += 15;

  // Ensure totals + legal section fits on current page (~200px needed)
  if (y + 200 > PAGE_BOTTOM) {
    doc.addPage();
    y = 40;
  }

  // ---- TOTALS ----
  const totalsX = PAGE.width - PAGE.marginRight - 200;
  const totalHT = Number(data.total_ht) || 0;
  const tvaPercent = data.tva_percent != null ? Number(data.tva_percent) : 20;

  doc.fontSize(10).fillColor(COLORS.darkGray).font('Helvetica');
  doc.text('Total HT :', totalsX, y, { width: 120, align: 'right' });
  doc.text(formatEUR(totalHT) + ' EUR', totalsX + 125, y, { width: 75, align: 'right' });
  y += 18;
  const tvaAmount = totalHT * tvaPercent / 100;
  const totalTTC = totalHT + tvaAmount;

  doc.text('TVA ' + tvaPercent + '% :', totalsX, y, { width: 120, align: 'right' });
  doc.text(formatEUR(tvaAmount) + ' EUR', totalsX + 125, y, { width: 75, align: 'right' });
  y += 18;

  drawLine(doc, y, COLORS.darkGray, 1);
  y += 6;

  doc.fontSize(12).fillColor(COLORS.black).font('Helvetica-Bold');
  doc.text('Total TTC :', totalsX, y, { width: 120, align: 'right' });
  doc.text(formatEUR(totalTTC) + ' EUR', totalsX + 125, y, { width: 75, align: 'right' });
  y += 30;

  // ---- LEGAL TEXT BOX ----
  const legalLines = [
    'Ce bon de commande fait suite a l\'acceptation du tarif par le fournisseur sur la plateforme JADOMI.',
    'Le prix de ' + formatEUR(totalHT) + ' EUR HT est contractuellement verrouille et ne peut etre modifie unilateralement.',
    'Conditions de paiement : 30 jours date de facture.'
  ];
  const legalText = legalLines.join('\n\n');

  const legalBoxX = PAGE.marginLeft;
  const legalBoxW = PAGE.contentWidth;
  const legalPadding = 14;

  // Measure text height
  const legalTextH = doc.fontSize(8).font('Helvetica')
    .heightOfString(legalText, { width: legalBoxW - legalPadding * 2 });
  const legalBoxH = legalTextH + legalPadding * 2;

  doc.roundedRect(legalBoxX, y, legalBoxW, legalBoxH, 4)
     .fill('#f8fafc');
  doc.roundedRect(legalBoxX, y, legalBoxW, legalBoxH, 4)
     .strokeColor('#cbd5e1').lineWidth(0.5).stroke();

  doc.fontSize(8).fillColor(COLORS.midGray).font('Helvetica')
     .text(legalText, legalBoxX + legalPadding, y + legalPadding, {
       width: legalBoxW - legalPadding * 2,
       lineGap: 4
     });

  // ---- FOOTER ----
  const footerY = PAGE.height - 50;
  drawLine(doc, footerY - 10, COLORS.lightGray, 0.5);
  doc.fontSize(8).fillColor(COLORS.midGray).font('Helvetica')
     .text('JADOMI - Plateforme d\'achats intelligente | jadomi.fr',
       PAGE.marginLeft, footerY, {
         width: PAGE.contentWidth,
         align: 'center'
       });
}

module.exports = { generateOrderPDF };
