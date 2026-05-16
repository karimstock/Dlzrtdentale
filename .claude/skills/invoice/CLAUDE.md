# Invoice & Billing Skill for Claude Code

## Overview
This skill enables Claude to generate professional invoices, manage billing, and produce Factur-X compliant PDF invoices for the JADOMI project. Covers French B2B invoicing regulations, PDF generation, and integration with the existing JADOMI billing system.

## French Invoice Legal Requirements (2026)

### Mandatory Fields (Article 289 CGI)
Every invoice MUST include:
1. **Date** — Invoice date (format: JJ/MM/AAAA)
2. **Numero de facture** — Sequential, unique, without gaps (ex: FAC-2026-0001)
3. **Identite du vendeur** — Company name, SIRET, address, VAT number
4. **Identite de l'acheteur** — Client name, address, SIRET (if B2B)
5. **Designation des produits/services** — Description, quantity, unit price HT
6. **Prix unitaire HT** — Unit price excluding tax
7. **Taux de TVA** — VAT rate (20%, 10%, 5.5%, 2.1%, or 0%)
8. **Montant total HT** — Total excluding tax
9. **Montant TVA** — VAT amount per rate
10. **Montant total TTC** — Total including tax
11. **Date de livraison/prestation** — Delivery/service date
12. **Conditions de paiement** — Payment terms and due date
13. **Penalites de retard** — Late payment penalties (minimum 3x legal interest rate)
14. **Indemnite forfaitaire de recouvrement** — Fixed recovery indemnity: 40 EUR

### JADOMI Seller Info
```javascript
const JADOMI_SELLER = {
  name: 'JADOMI',
  address: '// Roubaix address',
  siret: '// SIRET number',
  vatNumber: '// FR + SIREN-based',
  email: 'contact@jadomi.fr',
  phone: '// phone',
  rcs: '// RCS Lille Metropole',
  capital: '// capital social',
  ape: '// code APE',
};
```

## Factur-X (ZUGFeRD) Compliance

### What is Factur-X?
Factur-X is the Franco-German e-invoicing standard. It embeds structured XML (Cross-Industry Invoice) inside a PDF/A-3 document. Mandatory for B2G in France, becoming standard for B2B.

### Profiles
| Profile | Use Case | Complexity |
|---------|----------|------------|
| MINIMUM | Basic invoice data | Simplest |
| BASIC WL | Without line details | Simple |
| BASIC | Line-level details | Standard |
| EN 16931 | Full EU norm compliance | Complete |
| EXTENDED | Advanced use cases | Maximum |

### Generate Factur-X PDF with Node.js
```bash
npm install pdfkit factur-x pdf-lib
```

```javascript
const PDFDocument = require('pdfkit');
const fs = require('fs');

function generateInvoicePDF(invoice) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers = [];
    doc.on('data', buf => buffers.push(buf));
    doc.on('end', () => resolve(Buffer.concat(buffers)));

    // Header
    doc.fontSize(24).font('Helvetica-Bold').text('JADOMI', 50, 50);
    doc.fontSize(10).font('Helvetica')
      .text(JADOMI_SELLER.address, 50, 80)
      .text(`SIRET: ${JADOMI_SELLER.siret}`, 50, 95)
      .text(`TVA: ${JADOMI_SELLER.vatNumber}`, 50, 110);

    // Invoice title
    doc.fontSize(18).font('Helvetica-Bold')
      .text(`FACTURE ${invoice.number}`, 300, 50, { align: 'right' });
    doc.fontSize(10).font('Helvetica')
      .text(`Date: ${invoice.date}`, 300, 75, { align: 'right' })
      .text(`Echeance: ${invoice.dueDate}`, 300, 90, { align: 'right' });

    // Client info
    doc.fontSize(12).font('Helvetica-Bold').text('Facture a:', 350, 130);
    doc.fontSize(10).font('Helvetica')
      .text(invoice.client.name, 350, 148)
      .text(invoice.client.address, 350, 163)
      .text(`SIRET: ${invoice.client.siret || 'N/A'}`, 350, 178);

    // Table header
    const tableTop = 230;
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('Description', 50, tableTop);
    doc.text('Qte', 300, tableTop, { width: 40, align: 'center' });
    doc.text('Prix HT', 350, tableTop, { width: 70, align: 'right' });
    doc.text('TVA', 430, tableTop, { width: 40, align: 'right' });
    doc.text('Total HT', 480, tableTop, { width: 70, align: 'right' });

    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

    // Table rows
    let y = tableTop + 25;
    doc.font('Helvetica').fontSize(9);
    for (const line of invoice.lines) {
      doc.text(line.description, 50, y, { width: 240 });
      doc.text(String(line.quantity), 300, y, { width: 40, align: 'center' });
      doc.text(`${line.unitPrice.toFixed(2)} EUR`, 350, y, { width: 70, align: 'right' });
      doc.text(`${line.vatRate}%`, 430, y, { width: 40, align: 'right' });
      doc.text(`${(line.quantity * line.unitPrice).toFixed(2)} EUR`, 480, y, { width: 70, align: 'right' });
      y += 20;
    }

    // Totals
    doc.moveTo(350, y + 10).lineTo(550, y + 10).stroke();
    y += 20;
    
    const totalHT = invoice.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
    const vatGroups = {};
    for (const line of invoice.lines) {
      const key = line.vatRate;
      if (!vatGroups[key]) vatGroups[key] = 0;
      vatGroups[key] += line.quantity * line.unitPrice * (line.vatRate / 100);
    }
    const totalVAT = Object.values(vatGroups).reduce((s, v) => s + v, 0);
    const totalTTC = totalHT + totalVAT;

    doc.font('Helvetica').text('Total HT:', 380, y);
    doc.text(`${totalHT.toFixed(2)} EUR`, 480, y, { width: 70, align: 'right' });
    y += 18;

    for (const [rate, amount] of Object.entries(vatGroups)) {
      doc.text(`TVA ${rate}%:`, 380, y);
      doc.text(`${amount.toFixed(2)} EUR`, 480, y, { width: 70, align: 'right' });
      y += 18;
    }

    doc.font('Helvetica-Bold');
    doc.text('Total TTC:', 380, y);
    doc.text(`${totalTTC.toFixed(2)} EUR`, 480, y, { width: 70, align: 'right' });

    // Footer — legal mentions
    y = 700;
    doc.font('Helvetica').fontSize(7);
    doc.text('Conditions de paiement: ' + (invoice.paymentTerms || 'Paiement a 30 jours'), 50, y);
    doc.text('Penalites de retard: taux BCE + 10 points. Indemnite forfaitaire de recouvrement: 40 EUR.', 50, y + 10);
    doc.text('En cas de retard de paiement, une penalite egale a 3 fois le taux d\'interet legal sera exigible.', 50, y + 20);

    doc.end();
  });
}
```

### Factur-X XML Generation
```javascript
function generateFacturXML(invoice) {
  const totalHT = invoice.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const totalVAT = invoice.lines.reduce((s, l) => s + l.quantity * l.unitPrice * l.vatRate / 100, 0);
  const totalTTC = totalHT + totalVAT;

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:factur-x.eu:1p0:basic</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${invoice.number}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${invoice.date.replace(/-/g, '')}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>JADOMI</ram:Name>
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${JADOMI_SELLER.vatNumber}</ram:ID>
        </ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${invoice.client.name}</ram:Name>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:TaxBasisTotalAmount>${totalHT.toFixed(2)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${totalVAT.toFixed(2)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${totalTTC.toFixed(2)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${totalTTC.toFixed(2)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}
```

### Embed XML in PDF/A-3 (Factur-X compliant)
```javascript
const { PDFDocument, PDFName, PDFString, PDFArray, PDFDict } = require('pdf-lib');

async function embedFacturXInPDF(pdfBuffer, xmlContent) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  
  // Attach XML as embedded file
  const xmlBytes = Buffer.from(xmlContent, 'utf-8');
  const xmlStream = pdfDoc.context.stream(xmlBytes, {
    Type: 'EmbeddedFile',
    Subtype: 'text/xml',
  });
  const xmlStreamRef = pdfDoc.context.register(xmlStream);
  
  // Create file specification
  const fileSpec = pdfDoc.context.obj({
    Type: 'Filespec',
    F: PDFString.of('factur-x.xml'),
    UF: PDFString.of('factur-x.xml'),
    EF: { F: xmlStreamRef },
    AFRelationship: PDFName.of('Data'),
    Desc: PDFString.of('Factur-X Invoice'),
  });
  const fileSpecRef = pdfDoc.context.register(fileSpec);
  
  // Add to catalog
  const catalog = pdfDoc.catalog;
  catalog.set(PDFName.of('AF'), pdfDoc.context.obj([fileSpecRef]));
  
  const names = catalog.get(PDFName.of('Names')) || pdfDoc.context.obj({});
  names.set(PDFName.of('EmbeddedFiles'), pdfDoc.context.obj({
    Names: [PDFString.of('factur-x.xml'), fileSpecRef],
  }));
  catalog.set(PDFName.of('Names'), names);

  return pdfDoc.save();
}
```

## Invoice Number Sequence

### Sequential Number Generator
```javascript
async function getNextInvoiceNumber(db, prefix = 'FAC') {
  const year = new Date().getFullYear();
  const result = await db.query(`
    SELECT MAX(CAST(SUBSTRING(number FROM '\\d+$') AS INTEGER)) as max_num
    FROM invoices
    WHERE number LIKE $1
  `, [`${prefix}-${year}-%`]);
  
  const nextNum = (result.rows[0]?.max_num || 0) + 1;
  return `${prefix}-${year}-${String(nextNum).padStart(4, '0')}`;
}

// Example: FAC-2026-0001, FAC-2026-0002, ...
```

### Credit Note (Avoir)
```javascript
// Credit notes use a different prefix
const creditNumber = await getNextInvoiceNumber(db, 'AVO');
// AVO-2026-0001

// Reference the original invoice
const creditNote = {
  number: creditNumber,
  type: 'credit_note',
  originalInvoice: 'FAC-2026-0042',
  date: '15/05/2026',
  lines: [
    { description: 'Avoir - Retour fauteuil', quantity: -1, unitPrice: 599.00, vatRate: 20 },
  ],
};
```

## Payment Tracking

### Payment Status
```javascript
const PAYMENT_STATUS = {
  PENDING: 'en_attente',
  PARTIAL: 'partiel',
  PAID: 'paye',
  OVERDUE: 'en_retard',
  CANCELLED: 'annule',
};

async function updatePaymentStatus(db, invoiceId, amount) {
  const invoice = await db.query('SELECT total_ttc, paid_amount FROM invoices WHERE id = $1', [invoiceId]);
  const newPaid = invoice.rows[0].paid_amount + amount;
  const total = invoice.rows[0].total_ttc;
  
  let status;
  if (newPaid >= total) status = PAYMENT_STATUS.PAID;
  else if (newPaid > 0) status = PAYMENT_STATUS.PARTIAL;
  else status = PAYMENT_STATUS.PENDING;
  
  await db.query(`
    UPDATE invoices SET paid_amount = $1, status = $2, updated_at = NOW()
    WHERE id = $3
  `, [newPaid, status, invoiceId]);
}
```

### Overdue Detection
```javascript
async function getOverdueInvoices(db) {
  return db.query(`
    SELECT id, number, client_name, total_ttc, due_date,
           CURRENT_DATE - due_date AS days_overdue
    FROM invoices
    WHERE status IN ('en_attente', 'partiel')
      AND due_date < CURRENT_DATE
    ORDER BY due_date ASC
  `);
}
```

## Email Invoice

### Send Invoice by Email
```javascript
const nodemailer = require('nodemailer');

async function sendInvoiceEmail(invoice, pdfBuffer) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: '"JADOMI" <noreply@jadomi.fr>',
    to: invoice.client.email,
    subject: `Facture ${invoice.number} - JADOMI`,
    html: `
      <p>Bonjour ${invoice.client.name},</p>
      <p>Veuillez trouver ci-joint votre facture <strong>${invoice.number}</strong>
         d'un montant de <strong>${invoice.totalTTC.toFixed(2)} EUR TTC</strong>.</p>
      <p>Date d'echeance : ${invoice.dueDate}</p>
      <p>Cordialement,<br>L'equipe JADOMI</p>
    `,
    attachments: [{
      filename: `${invoice.number}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    }],
  });
}
```

## VAT Rates (France 2026)
| Rate | Application |
|------|-------------|
| 20% | Standard rate — most products and services |
| 10% | Reduced — home improvement, transport, restaurant |
| 5.5% | Reduced — essential goods, medical devices (some) |
| 2.1% | Super-reduced — medicines, press |
| 0% | Exempt — medical consultations, some exports |

**Medical equipment (JADOMI)**: Most medical devices at 5.5% or 20% depending on classification. Wheelchairs and mobility aids are typically 5.5% when reimbursed by Securite Sociale, 20% otherwise. ALWAYS verify the exact rate per product category.

## API Endpoint Pattern (Express)
```javascript
// GET /api/invoices — list invoices with filters
// GET /api/invoices/:id — get single invoice
// GET /api/invoices/:id/pdf — download PDF
// POST /api/invoices — create invoice
// PUT /api/invoices/:id — update invoice
// POST /api/invoices/:id/send — send by email
// POST /api/invoices/:id/payments — record payment
// GET /api/invoices/overdue — list overdue invoices
// GET /api/invoices/stats — billing statistics
```

## Best Practices

1. **Never break numbering sequence** — gaps in invoice numbers trigger tax audit alerts
2. **Immutable invoices** — once sent, create a credit note (avoir) to correct, never modify
3. **Archive 10 years** — legal requirement in France for accounting documents
4. **Factur-X for B2B/B2G** — mandatory for public sector, strongly recommended for B2B
5. **Round correctly** — always round to 2 decimal places AFTER line totals, not before
6. **Payment terms** — default 30 days; maximum 60 days by law in France
7. **Auto-reminders** — send payment reminders at due date, +7 days, +15 days, +30 days
8. **PDF/A format** — use PDF/A-3 for long-term archival and Factur-X embedding
9. **Multi-currency** — always show EUR; if foreign currency, show both with exchange rate
10. **GDPR** — client data in invoices must be handled per GDPR; anonymize after legal retention
