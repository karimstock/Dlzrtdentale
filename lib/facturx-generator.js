// =============================================
// JADOMI — Generation Facture Factur-X (PDF + XML CII)
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
  contentWidth: 495.28
};

// ---- Helpers ----

function formatDateFR(d) {
  if (!d) return '-';
  const dt = d instanceof Date ? d : new Date(d);
  const day = String(dt.getDate()).padStart(2, '0');
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const year = dt.getFullYear();
  return day + '/' + month + '/' + year;
}

function formatDateCII(d) {
  if (!d) return '00000000';
  const dt = d instanceof Date ? d : new Date(d);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return year + month + day;
}

function formatEUR(val) {
  if (val == null) return '0,00';
  return Number(val).toFixed(2).replace('.', ',');
}

function formatAmount(val) {
  if (val == null) return '0.00';
  return Number(val).toFixed(2);
}

function escXml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function drawLine(doc, y, color, width) {
  doc.strokeColor(color || COLORS.midGray)
     .lineWidth(width || 0.5)
     .moveTo(PAGE.marginLeft, y)
     .lineTo(PAGE.width - PAGE.marginRight, y)
     .stroke();
}

// ---- XML CII Generation ----

function generateCIIXml(inv) {
  const supplier = inv.supplier || {};
  const buyer = inv.buyer || {};
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"');
  lines.push('  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"');
  lines.push('  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">');

  // ExchangedDocumentContext
  lines.push('  <rsm:ExchangedDocumentContext>');
  lines.push('    <ram:GuidelineSpecifiedDocumentContextParameter>');
  lines.push('      <ram:ID>urn:cen.eu:en16931:2017</ram:ID>');
  lines.push('    </ram:GuidelineSpecifiedDocumentContextParameter>');
  lines.push('  </rsm:ExchangedDocumentContext>');

  // ExchangedDocument
  lines.push('  <rsm:ExchangedDocument>');
  lines.push('    <ram:ID>' + escXml(inv.invoice_number) + '</ram:ID>');
  lines.push('    <ram:TypeCode>380</ram:TypeCode>');
  lines.push('    <ram:IssueDateTime>');
  lines.push('      <udt:DateTimeString format="102">' + formatDateCII(inv.invoice_date) + '</udt:DateTimeString>');
  lines.push('    </ram:IssueDateTime>');
  lines.push('  </rsm:ExchangedDocument>');

  // SupplyChainTradeTransaction
  lines.push('  <rsm:SupplyChainTradeTransaction>');

  // Line items
  const items = inv.items || [];
  items.forEach((item, idx) => {
    const lineTotal = (Number(item.quantity) || 0) * (Number(item.unit_price_ht) || 0);
    lines.push('    <ram:IncludedSupplyChainTradeLineItem>');
    lines.push('      <ram:AssociatedDocumentLineDocument>');
    lines.push('        <ram:LineID>' + (idx + 1) + '</ram:LineID>');
    lines.push('      </ram:AssociatedDocumentLineDocument>');
    lines.push('      <ram:SpecifiedTradeProduct>');
    lines.push('        <ram:Name>' + escXml(item.description) + '</ram:Name>');
    lines.push('      </ram:SpecifiedTradeProduct>');
    lines.push('      <ram:SpecifiedLineTradeAgreement>');
    lines.push('        <ram:NetPriceProductTradePrice>');
    lines.push('          <ram:ChargeAmount>' + formatAmount(item.unit_price_ht) + '</ram:ChargeAmount>');
    lines.push('        </ram:NetPriceProductTradePrice>');
    lines.push('      </ram:SpecifiedLineTradeAgreement>');
    lines.push('      <ram:SpecifiedLineTradeDelivery>');
    lines.push('        <ram:BilledQuantity unitCode="C62">' + (Number(item.quantity) || 0) + '</ram:BilledQuantity>');
    lines.push('      </ram:SpecifiedLineTradeDelivery>');
    lines.push('      <ram:SpecifiedLineTradeSettlement>');
    lines.push('        <ram:ApplicableTradeTax>');
    lines.push('          <ram:TypeCode>VAT</ram:TypeCode>');
    lines.push('          <ram:CategoryCode>S</ram:CategoryCode>');
    lines.push('          <ram:RateApplicablePercent>' + formatAmount(item.tva_rate) + '</ram:RateApplicablePercent>');
    lines.push('        </ram:ApplicableTradeTax>');
    lines.push('        <ram:SpecifiedTradeSettlementLineMonetarySummation>');
    lines.push('          <ram:LineTotalAmount>' + formatAmount(lineTotal) + '</ram:LineTotalAmount>');
    lines.push('        </ram:SpecifiedTradeSettlementLineMonetarySummation>');
    lines.push('      </ram:SpecifiedLineTradeSettlement>');
    lines.push('    </ram:IncludedSupplyChainTradeLineItem>');
  });

  // ApplicableHeaderTradeAgreement
  lines.push('    <ram:ApplicableHeaderTradeAgreement>');

  // Seller
  lines.push('      <ram:SellerTradeParty>');
  lines.push('        <ram:Name>' + escXml(supplier.name) + '</ram:Name>');
  lines.push('        <ram:PostalTradeAddress>');
  lines.push('          <ram:PostcodeCode>' + escXml(supplier.code_postal) + '</ram:PostcodeCode>');
  lines.push('          <ram:LineOne>' + escXml(supplier.adresse) + '</ram:LineOne>');
  lines.push('          <ram:CityName>' + escXml(supplier.ville) + '</ram:CityName>');
  lines.push('          <ram:CountryID>FR</ram:CountryID>');
  lines.push('        </ram:PostalTradeAddress>');
  if (supplier.tva_intracom) {
    lines.push('        <ram:SpecifiedTaxRegistration>');
    lines.push('          <ram:ID schemeID="VA">' + escXml(supplier.tva_intracom) + '</ram:ID>');
    lines.push('        </ram:SpecifiedTaxRegistration>');
  }
  lines.push('      </ram:SellerTradeParty>');

  // Buyer
  lines.push('      <ram:BuyerTradeParty>');
  lines.push('        <ram:Name>' + escXml(buyer.name) + '</ram:Name>');
  lines.push('        <ram:PostalTradeAddress>');
  lines.push('          <ram:PostcodeCode>' + escXml(buyer.code_postal) + '</ram:PostcodeCode>');
  lines.push('          <ram:LineOne>' + escXml(buyer.adresse) + '</ram:LineOne>');
  lines.push('          <ram:CityName>' + escXml(buyer.ville) + '</ram:CityName>');
  lines.push('          <ram:CountryID>FR</ram:CountryID>');
  lines.push('        </ram:PostalTradeAddress>');
  if (buyer.tva_intracom) {
    lines.push('        <ram:SpecifiedTaxRegistration>');
    lines.push('          <ram:ID schemeID="VA">' + escXml(buyer.tva_intracom) + '</ram:ID>');
    lines.push('        </ram:SpecifiedTaxRegistration>');
  }
  lines.push('      </ram:BuyerTradeParty>');

  lines.push('    </ram:ApplicableHeaderTradeAgreement>');

  // ApplicableHeaderTradeDelivery (minimal)
  lines.push('    <ram:ApplicableHeaderTradeDelivery/>');

  // ApplicableHeaderTradeSettlement
  lines.push('    <ram:ApplicableHeaderTradeSettlement>');
  lines.push('      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>');
  // Group tax by rate
  const taxByRate = {};
  items.forEach(item => {
    const rate = Number(item.tva_rate) || 0;
    const lineHT = (Number(item.quantity) || 0) * (Number(item.unit_price_ht) || 0);
    if (!taxByRate[rate]) taxByRate[rate] = { basis: 0, tax: 0 };
    taxByRate[rate].basis += lineHT;
    taxByRate[rate].tax += lineHT * rate / 100;
  });
  // If no items, use totals with default 20%
  const rateKeys = Object.keys(taxByRate);
  if (rateKeys.length === 0) {
    taxByRate['20'] = { basis: Number(inv.total_ht) || 0, tax: Number(inv.total_tva) || 0 };
  }
  Object.keys(taxByRate).forEach(rate => {
    const group = taxByRate[rate];
    lines.push('      <ram:ApplicableTradeTax>');
    lines.push('        <ram:CalculatedAmount>' + formatAmount(group.tax) + '</ram:CalculatedAmount>');
    lines.push('        <ram:TypeCode>VAT</ram:TypeCode>');
    lines.push('        <ram:BasisAmount>' + formatAmount(group.basis) + '</ram:BasisAmount>');
    lines.push('        <ram:CategoryCode>S</ram:CategoryCode>');
    lines.push('        <ram:RateApplicablePercent>' + formatAmount(Number(rate)) + '</ram:RateApplicablePercent>');
    lines.push('      </ram:ApplicableTradeTax>');
  });
  if (inv.due_date) {
    lines.push('      <ram:SpecifiedTradePaymentTerms>');
    lines.push('        <ram:DueDateDateTime>');
    lines.push('          <udt:DateTimeString format="102">' + formatDateCII(inv.due_date) + '</udt:DateTimeString>');
    lines.push('        </ram:DueDateDateTime>');
    lines.push('      </ram:SpecifiedTradePaymentTerms>');
  }
  lines.push('      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>');
  lines.push('        <ram:LineTotalAmount>' + formatAmount(inv.total_ht) + '</ram:LineTotalAmount>');
  lines.push('        <ram:TaxBasisTotalAmount>' + formatAmount(inv.total_ht) + '</ram:TaxBasisTotalAmount>');
  lines.push('        <ram:TaxTotalAmount currencyID="EUR">' + formatAmount(inv.total_tva) + '</ram:TaxTotalAmount>');
  lines.push('        <ram:GrandTotalAmount>' + formatAmount(inv.total_ttc) + '</ram:GrandTotalAmount>');
  lines.push('        <ram:DuePayableAmount>' + formatAmount(inv.total_ttc) + '</ram:DuePayableAmount>');
  lines.push('      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>');
  lines.push('    </ram:ApplicableHeaderTradeSettlement>');

  lines.push('  </rsm:SupplyChainTradeTransaction>');
  lines.push('</rsm:CrossIndustryInvoice>');

  return lines.join('\n');
}

// ---- PDF Rendering ----

function renderInvoice(doc, inv) {
  inv.supplier = inv.supplier || {};
  inv.buyer = inv.buyer || {};
  const FOOTER_Y = PAGE.height - 80;
  const PAGE_BOTTOM = FOOTER_Y - 20;
  let y = 40;

  // ---- HEADER ----
  doc.fontSize(26).fillColor(COLORS.brand).font('Helvetica-Bold')
     .text('FACTURE', PAGE.marginLeft, y);
  doc.fontSize(12).fillColor(COLORS.darkGray).font('Helvetica-Bold')
     .text(inv.invoice_number || '', PAGE.marginLeft, y + 34);
  doc.fontSize(10).fillColor(COLORS.midGray).font('Helvetica')
     .text('Date : ' + formatDateFR(inv.invoice_date), PAGE.marginLeft, y + 52);

  y += 80;
  drawLine(doc, y, COLORS.brand, 2);
  y += 20;

  // ---- EMETTEUR (left) / DESTINATAIRE (right) ----
  const colLeft = PAGE.marginLeft;
  const colRight = PAGE.marginLeft + 270;

  // Emetteur
  doc.fontSize(9).fillColor(COLORS.brand).font('Helvetica-Bold')
     .text('EMETTEUR', colLeft, y);
  let ey = y + 16;
  doc.fontSize(10).fillColor(COLORS.black).font('Helvetica-Bold')
     .text(inv.supplier.name || '', colLeft, ey, { width: 240 });
  ey += 16;
  doc.fontSize(9).fillColor(COLORS.darkGray).font('Helvetica');
  doc.text('(via mandat JADOMI SAS)', colLeft, ey, { width: 240 });
  ey += 14;
  if (inv.supplier.adresse)
    doc.text(inv.supplier.adresse, colLeft, ey, { width: 240 });
  ey += 13;
  const suppCpVille = [inv.supplier.code_postal, inv.supplier.ville].filter(Boolean).join(' ');
  if (suppCpVille) doc.text(suppCpVille, colLeft, ey, { width: 240 });
  ey += 13;
  if (inv.supplier.siret)
    doc.text('SIRET : ' + inv.supplier.siret, colLeft, ey, { width: 240 });
  ey += 13;
  if (inv.supplier.tva_intracom)
    doc.text('TVA Intracom : ' + inv.supplier.tva_intracom, colLeft, ey, { width: 240 });
  ey += 13;

  // Destinataire
  doc.fontSize(9).fillColor(COLORS.brand).font('Helvetica-Bold')
     .text('DESTINATAIRE', colRight, y);
  let dy = y + 16;
  doc.fontSize(10).fillColor(COLORS.black).font('Helvetica-Bold')
     .text(inv.buyer.name || '', colRight, dy, { width: 220 });
  dy += 16;
  doc.fontSize(9).fillColor(COLORS.darkGray).font('Helvetica');
  if (inv.buyer.adresse)
    doc.text(inv.buyer.adresse, colRight, dy, { width: 220 });
  dy += 13;
  const buyerCpVille = [inv.buyer.code_postal, inv.buyer.ville].filter(Boolean).join(' ');
  if (buyerCpVille) doc.text(buyerCpVille, colRight, dy, { width: 220 });
  dy += 13;
  if (inv.buyer.siret)
    doc.text('SIRET : ' + inv.buyer.siret, colRight, dy, { width: 220 });
  dy += 13;
  if (inv.buyer.tva_intracom)
    doc.text('TVA Intracom : ' + inv.buyer.tva_intracom, colRight, dy, { width: 220 });
  dy += 13;

  y = Math.max(ey, dy) + 10;

  // ---- MENTION MANDAT ----
  const mandatText = 'Facture emise par JADOMI SAS au nom et pour le compte de '
    + (inv.supplier.name || '') + ', conformement au mandat de facturation ref. '
    + (inv.mandate_ref || '-') + ' (art. 289-I-2 CGI).';

  const mandatBoxX = PAGE.marginLeft;
  const mandatBoxW = PAGE.contentWidth;
  const mandatPad = 10;

  const mandatH = doc.fontSize(8).font('Helvetica')
    .heightOfString(mandatText, { width: mandatBoxW - mandatPad * 2 });
  const mandatBoxH = mandatH + mandatPad * 2;

  doc.roundedRect(mandatBoxX, y, mandatBoxW, mandatBoxH, 3)
     .fill('#f0fdf4');
  doc.roundedRect(mandatBoxX, y, mandatBoxW, mandatBoxH, 3)
     .strokeColor(COLORS.brand).lineWidth(0.5).stroke();

  doc.fontSize(8).fillColor(COLORS.darkGray).font('Helvetica')
     .text(mandatText, mandatBoxX + mandatPad, y + mandatPad, {
       width: mandatBoxW - mandatPad * 2,
       lineGap: 3
     });

  y += mandatBoxH + 20;

  // ---- ITEMS TABLE ----
  const cols = [
    { label: 'Description',   x: colLeft,       w: 210, align: 'left'  },
    { label: 'Qte',           x: colLeft + 210, w: 50,  align: 'right' },
    { label: 'PU HT',         x: colLeft + 260, w: 75,  align: 'right' },
    { label: 'TVA',           x: colLeft + 335, w: 60,  align: 'right' },
    { label: 'Total HT',      x: colLeft + 395, w: 100, align: 'right' }
  ];

  // Table header
  doc.rect(colLeft, y, PAGE.contentWidth, 22).fill(COLORS.tableHead);
  doc.fontSize(8).fillColor(COLORS.darkGray).font('Helvetica-Bold');
  cols.forEach(col => {
    doc.text(col.label, col.x + 4, y + 6, { width: col.w - 8, align: col.align });
  });
  y += 22;

  // Table rows
  const items = inv.items || [];
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.black);

  items.forEach((item, idx) => {
    const rowH = 22;

    if (y + rowH > PAGE_BOTTOM) {
      doc.addPage();
      y = 40;
      doc.rect(colLeft, y, PAGE.contentWidth, 22).fill(COLORS.tableHead);
      doc.fontSize(8).fillColor(COLORS.darkGray).font('Helvetica-Bold');
      cols.forEach(col => {
        doc.text(col.label, col.x + 4, y + 6, { width: col.w - 8, align: col.align });
      });
      y += 22;
    }

    if (idx % 2 === 1) {
      doc.rect(colLeft, y, PAGE.contentWidth, rowH).fill(COLORS.lightGray);
      doc.fillColor(COLORS.black);
    }

    const lineTotal = (Number(item.quantity) || 0) * (Number(item.unit_price_ht) || 0);
    const tvaLabel = (Number(item.tva_rate) || 0) + '%';

    doc.font('Helvetica').fontSize(9).fillColor(COLORS.black);
    doc.text(item.description || '-', cols[0].x + 4, y + 6, { width: cols[0].w - 8, align: 'left' });
    doc.text(String(item.quantity || 0), cols[1].x + 4, y + 6, { width: cols[1].w - 8, align: 'right' });
    doc.text(formatEUR(item.unit_price_ht) + ' EUR', cols[2].x + 4, y + 6, { width: cols[2].w - 8, align: 'right' });
    doc.text(tvaLabel, cols[3].x + 4, y + 6, { width: cols[3].w - 8, align: 'right' });
    doc.text(formatEUR(lineTotal) + ' EUR', cols[4].x + 4, y + 6, { width: cols[4].w - 8, align: 'right' });

    y += rowH;
  });

  drawLine(doc, y, COLORS.midGray, 0.5);
  y += 15;

  // Ensure totals + payment + footer fit
  if (y + 250 > PAGE_BOTTOM) {
    doc.addPage();
    y = 40;
  }

  // ---- TOTALS ----
  const totalsX = PAGE.width - PAGE.marginRight - 200;

  doc.fontSize(10).fillColor(COLORS.darkGray).font('Helvetica');
  doc.text('Total HT :', totalsX, y, { width: 120, align: 'right' });
  doc.text(formatEUR(inv.total_ht) + ' EUR', totalsX + 125, y, { width: 75, align: 'right' });
  y += 18;

  doc.text('TVA 20% :', totalsX, y, { width: 120, align: 'right' });
  doc.text(formatEUR(inv.total_tva) + ' EUR', totalsX + 125, y, { width: 75, align: 'right' });
  y += 18;

  drawLine(doc, y, COLORS.darkGray, 1);
  y += 6;

  doc.fontSize(12).fillColor(COLORS.black).font('Helvetica-Bold');
  doc.text('Total TTC :', totalsX, y, { width: 120, align: 'right' });
  doc.text(formatEUR(inv.total_ttc) + ' EUR', totalsX + 125, y, { width: 75, align: 'right' });
  y += 35;

  // ---- PAYMENT INFO ----
  doc.fontSize(10).fillColor(COLORS.darkGray).font('Helvetica-Bold')
     .text('Reglement', PAGE.marginLeft, y);
  y += 16;

  doc.fontSize(9).fillColor(COLORS.darkGray).font('Helvetica');
  doc.text('Reglement a effectuer a : JADOMI SAS', PAGE.marginLeft, y);
  y += 14;
  doc.text('Echeance : ' + formatDateFR(inv.due_date), PAGE.marginLeft, y);
  y += 18;
  doc.text('IBAN : [a completer] | BIC : [a completer]', PAGE.marginLeft, y);
  y += 25;

  // ---- LEGAL FOOTER ----
  drawLine(doc, y, COLORS.midGray, 0.5);
  y += 10;

  doc.fontSize(7).fillColor(COLORS.midGray).font('Helvetica');
  doc.text('JADOMI SAS — [SIRET a completer] — TVA [a completer]',
    PAGE.marginLeft, y, { width: PAGE.contentWidth, align: 'center' });
  y += 12;
  doc.text('Facture conforme Factur-X 1.08 / EN 16931',
    PAGE.marginLeft, y, { width: PAGE.contentWidth, align: 'center' });
  y += 12;
  doc.text('Penalites retard : 3x taux BCE en vigueur. Indemnite forfaitaire de recouvrement : 40 EUR.',
    PAGE.marginLeft, y, { width: PAGE.contentWidth, align: 'center' });

  if (inv.legal_mention) {
    y += 12;
    doc.text(inv.legal_mention,
      PAGE.marginLeft, y, { width: PAGE.contentWidth, align: 'center' });
  }
}

// ---- Main Export ----

/**
 * Genere une facture au format Factur-X (PDF + XML CII embarque).
 *
 * @param {object} invoiceData
 * @returns {Promise<{ pdf: Buffer, xml: string, invoice_number: string }>}
 */
function generateFacturXInvoice(invoiceData) {
  return new Promise((resolve, reject) => {
    try {
      // Generate XML CII
      const xmlString = generateCIIXml(invoiceData);
      const xmlBuffer = Buffer.from(xmlString, 'utf-8');

      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: PAGE.marginLeft, right: PAGE.marginRight },
        info: {
          Title: 'Facture ' + (invoiceData.invoice_number || ''),
          Author: 'JADOMI SAS',
          Subject: 'Facture Factur-X',
          Creator: 'JADOMI Platform',
          Keywords: 'Factur-X, EN16931, CII'
        }
      });

      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        resolve({
          pdf: pdfBuffer,
          xml: xmlString,
          invoice_number: invoiceData.invoice_number
        });
      });
      doc.on('error', reject);

      // Render the invoice PDF
      renderInvoice(doc, invoiceData);

      // Embed XML CII as file attachment for Factur-X compliance
      doc.file(xmlBuffer, 'factur-x.xml', {
        type: 'application/xml',
        description: 'Factur-X XML (CII / EN16931)'
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateFacturXInvoice, generateCIIXml };
