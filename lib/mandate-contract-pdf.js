// =============================================
// JADOMI — Generation PDF Mandat de Facturation
// Article 289-I-2 du Code General des Impots
// =============================================
const PDFDocument = require('pdfkit');

const PAGE = {
  width: 595.28,   // A4
  height: 841.89,
  marginLeft: 55,
  marginRight: 55,
  marginTop: 50,
  marginBottom: 60,
  get contentWidth() { return this.width - this.marginLeft - this.marginRight; }
};

const COLORS = {
  black:    '#000000',
  dark:     '#1a1a1a',
  gray:     '#4a4a4a',
  lightGray:'#999999',
  rule:     '#cccccc'
};

/**
 * Draw a horizontal rule
 */
function drawRule(doc, y, width) {
  doc.strokeColor(COLORS.rule)
     .lineWidth(width || 0.5)
     .moveTo(PAGE.marginLeft, y)
     .lineTo(PAGE.width - PAGE.marginRight, y)
     .stroke();
}

/**
 * Render a numbered article title
 */
function articleTitle(doc, title, y) {
  doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.black)
     .text(title, PAGE.marginLeft, y, { width: PAGE.contentWidth });
  return doc.y + 6;
}

/**
 * Render article body text
 */
function articleBody(doc, text, y, opts) {
  doc.fontSize(9.5).font('Helvetica').fillColor(COLORS.dark)
     .text(text, PAGE.marginLeft, y, {
       width: PAGE.contentWidth,
       lineGap: 3.5,
       ...opts
     });
  return doc.y + 10;
}

/**
 * Render a bullet list for an article
 */
function articleBullets(doc, items, y) {
  const indent = PAGE.marginLeft + 18;
  const bulletWidth = PAGE.contentWidth - 18;
  doc.fontSize(9.5).font('Helvetica').fillColor(COLORS.dark);
  let cy = y;
  items.forEach(item => {
    doc.text('\u2014', PAGE.marginLeft, cy, { width: 18 });
    doc.text(item, indent, cy, { width: bulletWidth, lineGap: 3 });
    cy = doc.y + 4;
  });
  return cy + 6;
}

/**
 * Check if we need a page break and add one if so.
 * Returns the current y (possibly reset to top of new page).
 */
function ensureSpace(doc, y, needed) {
  const maxY = PAGE.height - PAGE.marginBottom;
  if (y + needed > maxY) {
    doc.addPage();
    return PAGE.marginTop;
  }
  return y;
}

/**
 * Generates a professional legal PDF for a "mandat de facturation"
 * conforming to article 289-I-2 du Code General des Impots.
 *
 * @param {object} data
 * @returns {Promise<Buffer>}
 */
function generateMandateContractPDF(data) {
  return new Promise((resolve, reject) => {
    let failed = false;

    const doc = new PDFDocument({
      size: 'A4',
      margins: {
        top: PAGE.marginTop,
        bottom: PAGE.marginBottom,
        left: PAGE.marginLeft,
        right: PAGE.marginRight
      },
      info: {
        Title: 'Mandat de facturation - ' + (data.mandate_id || ''),
        Author: 'JADOMI SAS',
        Subject: 'Mandat de facturation - Article 289-I-2 CGI',
        Creator: 'JADOMI Platform'
      }
    });

    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => {
      if (!failed) resolve(Buffer.concat(chunks));
    });
    doc.on('error', err => {
      failed = true;
      reject(err);
    });

    try {
      renderPage1(doc, data);
      doc.addPage();
      renderPage2(doc, data);
    } catch (err) {
      failed = true;
      doc.end();
      reject(err);
      return;
    }

    doc.end();
  });
}

// =============================================
// PAGE 1 — Contract articles
// =============================================
function renderPage1(doc, data) {
  const supplier = data.supplier || {};
  const jadomi = data.jadomi || {};
  const commissionPercent = data.commission_percent != null ? data.commission_percent : 0;
  const paymentDelayDays = data.payment_delay_days != null ? data.payment_delay_days : 30;
  const contestationDelayDays = data.contestation_delay_days != null ? data.contestation_delay_days : 7;

  // Safe string helper — never render null/undefined, use placeholder for blanks
  const safe = (val, placeholder) => (val != null && String(val).trim() !== '') ? String(val).trim() : (placeholder || '________________________');

  let y = PAGE.marginTop;

  // ---- TITLE ----
  doc.fontSize(20).font('Helvetica-Bold').fillColor(COLORS.black)
     .text('MANDAT DE FACTURATION', PAGE.marginLeft, y, {
       width: PAGE.contentWidth,
       align: 'center'
     });
  y = doc.y + 8;

  doc.fontSize(10).font('Helvetica').fillColor(COLORS.gray)
     .text('Conformement a l\'article 289-I-2 du Code General des Impots',
       PAGE.marginLeft, y, { width: PAGE.contentWidth, align: 'center' });
  y = doc.y + 20;

  drawRule(doc, y, 1);
  y += 20;

  // ---- DATE PLACEHOLDER ----
  doc.fontSize(10).font('Helvetica').fillColor(COLORS.dark)
     .text('Fait le ________________', PAGE.marginLeft, y, {
       width: PAGE.contentWidth,
       align: 'right'
     });
  y = doc.y + 20;

  // ---- ENTRE LES SOUSSIGNES ----
  doc.fontSize(12).font('Helvetica-Bold').fillColor(COLORS.black)
     .text('ENTRE LES SOUSSIGNES :', PAGE.marginLeft, y);
  y = doc.y + 12;

  // Mandant
  const supplierName = safe(supplier.legal_name || supplier.name);
  const supplierAddr = [supplier.adresse, [supplier.code_postal, supplier.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  doc.fontSize(9.5).font('Helvetica-Bold').fillColor(COLORS.dark)
     .text('Le Mandant (Fournisseur) :', PAGE.marginLeft, y);
  y = doc.y + 4;
  doc.fontSize(9.5).font('Helvetica').fillColor(COLORS.dark)
     .text(supplierName + ', SIRET ' + safe(supplier.siret, '_______________') +
       (supplierAddr ? ', ' + supplierAddr : '') +
       ', ci-apres denomme "le Fournisseur".',
       PAGE.marginLeft, y, { width: PAGE.contentWidth, lineGap: 3 });
  y = doc.y + 12;

  // Mandataire
  doc.fontSize(9.5).font('Helvetica-Bold').fillColor(COLORS.dark)
     .text('Le Mandataire :', PAGE.marginLeft, y);
  y = doc.y + 4;
  const jadomiAddr = jadomi.adresse || '';
  doc.fontSize(9.5).font('Helvetica').fillColor(COLORS.dark)
     .text('JADOMI SAS, SIRET ' + safe(jadomi.siret, '_______________') +
       (jadomiAddr ? ', ' + jadomiAddr : '') +
       ', ci-apres denomme "JADOMI".',
       PAGE.marginLeft, y, { width: PAGE.contentWidth, lineGap: 3 });
  y = doc.y + 20;

  drawRule(doc, y, 0.5);
  y += 18;

  // ---- PREAMBULE ----
  y = ensureSpace(doc, y, 100);
  y = articleTitle(doc, 'Preambule', y);
  y = articleBody(doc,
    'JADOMI exploite une plateforme numerique de mise en relation entre professionnels et fournisseurs, integrant un systeme de groupement de commandes (ci-apres "GPO"). Dans le cadre de cette activite, JADOMI propose aux fournisseurs references un service de facturation pour compte de tiers, conformement aux dispositions legales en vigueur. Le present contrat a pour objet de definir les conditions dans lesquelles le Fournisseur confie a JADOMI un mandat de facturation.',
    y);

  // ---- ARTICLE 1 ----
  y = ensureSpace(doc, y, 120);
  y = articleTitle(doc, 'Article 1 \u2014 Objet du mandat', y);
  y = articleBody(doc,
    '1.1. Par le present contrat, le Fournisseur donne mandat a JADOMI d\'emettre, en son nom et pour son compte, les factures relatives aux transactions realisees via la plateforme JADOMI, conformement aux dispositions de l\'article 289-I-2 du Code General des Impots et de l\'article 242 nonies A de l\'annexe II au CGI.',
    y);
  y = articleBody(doc,
    '1.2. Ce mandat constitue un mandat d\'interet commun au sens des articles 1984 et suivants du Code civil. JADOMI agit en qualite de mandataire et n\'acquiert a aucun moment la propriete des marchandises faisant l\'objet des transactions.',
    y);

  // ---- ARTICLE 2 ----
  y = ensureSpace(doc, y, 100);
  y = articleTitle(doc, 'Article 2 \u2014 Perimetre du mandat', y);
  y = articleBody(doc,
    '2.1. Le present mandat porte sur l\'ensemble des commandes realisees via la plateforme JADOMI, y compris les commandes issues du systeme GPO (Groupement de Commandes Optimise), les commandes directes et les commandes de groupage regional.',
    y);
  y = articleBody(doc,
    '2.2. Chaque facture emise par JADOMI au nom du Fournisseur comporte l\'ensemble des mentions obligatoires prevues par les articles 242 nonies A et 242 nonies C de l\'annexe II au CGI, et notamment : le nom, l\'adresse et le numero d\'identification a la TVA du Fournisseur, la mention "Facture emise par JADOMI SAS au nom et pour le compte de [Fournisseur] — Mandat du [date]".',
    y);

  // ---- ARTICLE 3 ----
  y = ensureSpace(doc, y, 240);
  y = articleTitle(doc, 'Article 3 \u2014 Obligations de JADOMI (Mandataire)', y);
  y = articleBody(doc, 'Dans le cadre du present mandat, JADOMI s\'engage a :', y);
  y = articleBullets(doc, [
    'Emettre les factures en conformite avec les mentions obligatoires des articles 289 et suivants du CGI et du decret n\u00b02022-1299 du 7 octobre 2022 relatif a la generalisation de la facturation electronique',
    'Transmettre au client (l\'acheteur professionnel) chaque facture dans un delai maximal de quarante-huit (48) heures suivant la livraison des marchandises ou la realisation de la prestation',
    'Adresser simultanement au Fournisseur une copie conforme de chaque facture emise, par voie electronique via la plateforme JADOMI',
    'Assurer la numerotation sequentielle et chronologique des factures, avec une serie propre a chaque Fournisseur mandant',
    'Conserver l\'ensemble des factures emises pendant une duree de dix (10) ans, conformement aux articles L.123-22 du Code de commerce et L.102 B du Livre des Procedures Fiscales',
    'Generer les factures au format Factur-X (profil EN16931, norme semantique europeenne) composee d\'un fichier PDF/A-3 et d\'un fichier XML CII',
    'Transmettre les factures aux plateformes de dematerialisation partenaires (PDP) conformement aux obligations de la reforme de la facturation electronique'
  ], y);

  // ---- ARTICLE 4 ----
  y = ensureSpace(doc, y, 130);
  y = articleTitle(doc, 'Article 4 \u2014 Obligations du Fournisseur (Mandant)', y);
  y = articleBody(doc, 'Le Fournisseur s\'engage a :', y);
  y = articleBullets(doc, [
    'Communiquer a JADOMI des informations exactes et a jour (denomination sociale, SIRET, numero de TVA intracommunautaire, adresse, RIB/IBAN)',
    'Informer JADOMI sans delai de toute modification de ses informations legales, fiscales ou bancaires',
    'Ne pas emettre de factures de son propre chef pour les transactions couvertes par le present mandat, afin d\'eviter toute double facturation',
    'Verifier les factures emises par JADOMI et exercer, le cas echeant, son droit de contestation dans le delai prevu a l\'article 5',
    'Demeurer seul responsable de ses obligations fiscales, notamment en matiere de declaration et de paiement de la TVA collectee'
  ], y);

  // ---- ARTICLE 5 ----
  y = ensureSpace(doc, y, 120);
  y = articleTitle(doc, 'Article 5 \u2014 Procedure d\'acceptation des factures', y);
  y = articleBody(doc,
    '5.1. Le Fournisseur dispose d\'un delai de ' + contestationDelayDays + ' jours calendaires a compter de la mise a disposition de la copie de facture sur la plateforme JADOMI pour la contester. La contestation doit etre motivee et transmise par voie electronique via la plateforme.',
    y);
  y = articleBody(doc,
    '5.2. A defaut de contestation dans le delai precite, la facture est reputee definitivement acceptee par le Fournisseur (acceptation tacite), conformement aux stipulations contractuelles convenues entre les parties.',
    y);
  y = articleBody(doc,
    '5.3. En cas de contestation fondee, JADOMI s\'engage a emettre une facture rectificative (avoir) dans un delai de cinq (5) jours ouvrables suivant la reception de la contestation.',
    y);

  // ---- ARTICLE 6 ----
  y = ensureSpace(doc, y, 130);
  y = articleTitle(doc, 'Article 6 \u2014 Conditions financieres', y);
  y = articleBody(doc,
    '6.1. Commission de service. En remuneration de ses services de facturation et d\'intermediation, JADOMI percoit une commission de ' + commissionPercent + ' % hors taxes (HT) calculee sur le montant HT de chaque facture emise au nom du Fournisseur. Cette commission constitue le prix du service de mandataire au sens de l\'article 1999 du Code civil.',
    y);
  y = articleBody(doc,
    '6.2. Flux financiers. Le client (acheteur professionnel) regle le montant TTC de la facture a JADOMI. JADOMI reverse au Fournisseur le montant HT de la facture, deduction faite de la commission visee a l\'article 6.1, dans un delai maximal de ' + paymentDelayDays + ' jours calendaires a compter de l\'encaissement effectif du reglement par le client.',
    y);
  y = articleBody(doc,
    '6.3. Modalites de reversement. Les reversements sont effectues par virement bancaire SEPA sur le compte designe par le Fournisseur. Un releve detaille des factures emises et des commissions prelevees est mis a disposition mensuellement sur la plateforme JADOMI.',
    y);

  // ---- ARTICLE 7 ----
  y = ensureSpace(doc, y, 130);
  y = articleTitle(doc, 'Article 7 \u2014 Duree — Resiliation', y);
  y = articleBody(doc,
    '7.1. Duree. Le present mandat est conclu pour une duree indeterminee a compter de sa date de signature.',
    y);
  y = articleBody(doc,
    '7.2. Resiliation ordinaire. Chaque partie peut resilier le present mandat a tout moment, moyennant un preavis de trente (30) jours calendaires, notifie par lettre recommandee avec accuse de reception ou par notification electronique via la plateforme JADOMI avec accuse de reception.',
    y);
  y = articleBody(doc,
    '7.3. Resiliation pour faute. En cas de manquement grave de l\'une des parties a ses obligations contractuelles, l\'autre partie pourra resilier le mandat de plein droit, sans preavis, apres mise en demeure restee infructueuse pendant quinze (15) jours.',
    y);
  y = articleBody(doc,
    '7.4. Effets de la resiliation. La resiliation ne remet pas en cause la validite des factures deja emises ni les obligations de paiement y afferentes. Les articles 8 et 9 survivent a la cessation du contrat.',
    y);

  // ---- ARTICLE 8 ----
  y = ensureSpace(doc, y, 100);
  y = articleTitle(doc, 'Article 8 \u2014 Confidentialite', y);
  y = articleBody(doc,
    '8.1. Les parties s\'engagent reciproquement a traiter comme strictement confidentielles l\'ensemble des informations commerciales, financieres et techniques echangees dans le cadre de l\'execution du present mandat, et notamment : les prix negocies, les volumes commandes, les conditions commerciales, les donnees clients et les informations bancaires.',
    y);
  y = articleBody(doc,
    '8.2. Cette obligation de confidentialite demeure en vigueur pendant toute la duree du mandat et pendant une periode de deux (2) ans suivant sa cessation, quelle qu\'en soit la cause.',
    y);

  // ---- ARTICLE 9 ----
  y = ensureSpace(doc, y, 120);
  y = articleTitle(doc, 'Article 9 \u2014 Responsabilite — Assurance', y);
  y = articleBody(doc,
    '9.1. JADOMI assume la responsabilite de la conformite formelle des factures emises dans le cadre du present mandat aux exigences legales et reglementaires applicables. Le Fournisseur demeure seul responsable de l\'exactitude des informations qu\'il communique a JADOMI.',
    y);
  y = articleBody(doc,
    '9.2. JADOMI declare etre titulaire d\'une assurance de responsabilite civile professionnelle couvrant les consequences pecuniaires de sa responsabilite au titre de l\'execution du present mandat.',
    y);

  // ---- ARTICLE 10 ----
  y = ensureSpace(doc, y, 100);
  y = articleTitle(doc, 'Article 10 \u2014 Protection des donnees personnelles', y);
  y = articleBody(doc,
    '10.1. Dans le cadre de l\'execution du present mandat, JADOMI est amenee a traiter des donnees personnelles du Fournisseur et de ses representants. Ce traitement est realise conformement au Reglement (UE) 2016/679 (RGPD) et a la loi n\u00b078-17 du 6 janvier 1978 modifiee.',
    y);
  y = articleBody(doc,
    '10.2. Les donnees collectees (identite, coordonnees, SIRET, IBAN) sont traitees aux fins d\'execution du contrat (article 6.1.b du RGPD) et conservees pendant la duree du mandat et les delais legaux de conservation (10 ans pour les factures).',
    y);

  // ---- ARTICLE 11 ----
  y = ensureSpace(doc, y, 100);
  y = articleTitle(doc, 'Article 11 \u2014 Dispositions generales', y);
  y = articleBody(doc,
    '11.1. Independance des clauses. Si l\'une quelconque des stipulations du present mandat est declaree nulle ou inapplicable, les autres stipulations conservent leur pleine force et effet.',
    y);
  y = articleBody(doc,
    '11.2. Integralite. Le present mandat constitue l\'integralite de l\'accord entre les parties relativement a son objet et se substitue a tout accord anterieur, ecrit ou verbal.',
    y);
  y = articleBody(doc,
    '11.3. Modification. Toute modification du present mandat devra faire l\'objet d\'un avenant ecrit signe par les deux parties.',
    y);

  // ---- ARTICLE 12 ----
  y = ensureSpace(doc, y, 80);
  y = articleTitle(doc, 'Article 12 \u2014 Loi applicable et juridiction competente', y);
  y = articleBody(doc,
    '12.1. Le present mandat est regi par le droit francais. En cas de differend relatif a la validite, l\'interpretation ou l\'execution du present mandat, les parties s\'efforceront de trouver une solution amiable dans un delai de trente (30) jours. A defaut de resolution amiable, le litige sera soumis a la competence exclusive du Tribunal de Commerce de Lille Metropole.',
    y);

  // ---- PAGE 1 FOOTER ----
  const footerY = PAGE.height - PAGE.marginBottom + 10;
  drawRule(doc, footerY, 0.3);
  doc.fontSize(7).font('Helvetica').fillColor(COLORS.lightGray)
     .text('Mandat ref. ' + (data.mandate_id || ''), PAGE.marginLeft, footerY + 6, {
       width: PAGE.contentWidth,
       align: 'center'
     });
}

// =============================================
// PAGE 2 — Signatures
// =============================================
function renderPage2(doc, data) {
  const supplier = data.supplier || {};
  const jadomi = data.jadomi || {};
  const safe = (val, placeholder) => (val != null && String(val).trim() !== '') ? String(val).trim() : (placeholder || '________________________');

  let y = PAGE.marginTop;

  doc.fontSize(14).font('Helvetica-Bold').fillColor(COLORS.black)
     .text('SIGNATURES', PAGE.marginLeft, y, {
       width: PAGE.contentWidth,
       align: 'center'
     });
  y = doc.y + 10;

  doc.fontSize(9.5).font('Helvetica').fillColor(COLORS.gray)
     .text('Les parties declarent avoir pris connaissance de l\'ensemble des articles du present mandat et les accepter sans reserve.',
       PAGE.marginLeft, y, { width: PAGE.contentWidth, align: 'center', lineGap: 3 });
  y = doc.y + 30;

  drawRule(doc, y, 0.5);
  y += 30;

  // Two columns for signatures
  const colLeftX = PAGE.marginLeft;
  const colRightX = PAGE.marginLeft + PAGE.contentWidth / 2 + 15;
  const colWidth = PAGE.contentWidth / 2 - 15;

  // ---- Left column: Fournisseur ----
  doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.black)
     .text('Le Fournisseur (Mandant)', colLeftX, y, { width: colWidth });
  let leftY = doc.y + 14;

  doc.fontSize(10).font('Helvetica').fillColor(COLORS.dark)
     .text(safe(supplier.legal_name || supplier.name), colLeftX, leftY, { width: colWidth });
  leftY = doc.y + 20;

  doc.fontSize(9.5).font('Helvetica').fillColor(COLORS.dark)
     .text('Date :', colLeftX, leftY, { width: colWidth });
  leftY = doc.y + 6;
  doc.text('____________________', colLeftX, leftY, { width: colWidth });
  leftY = doc.y + 25;

  doc.text('Signature :', colLeftX, leftY, { width: colWidth });
  leftY = doc.y + 6;

  // Signature box
  doc.rect(colLeftX, leftY, colWidth - 20, 80)
     .strokeColor(COLORS.rule).lineWidth(0.5).stroke();
  leftY += 95;

  // ---- Right column: JADOMI ----
  let rightY = y;
  doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.black)
     .text('JADOMI (Mandataire)', colRightX, rightY, { width: colWidth });
  rightY = doc.y + 14;

  doc.fontSize(10).font('Helvetica').fillColor(COLORS.dark)
     .text(safe(jadomi.name, 'JADOMI SAS'), colRightX, rightY, { width: colWidth });
  rightY = doc.y + 20;

  doc.fontSize(9.5).font('Helvetica').fillColor(COLORS.dark)
     .text('Date :', colRightX, rightY, { width: colWidth });
  rightY = doc.y + 6;
  doc.text('____________________', colRightX, rightY, { width: colWidth });
  rightY = doc.y + 25;

  doc.text('Signature :', colRightX, rightY, { width: colWidth });
  rightY = doc.y + 6;

  // Signature box
  doc.rect(colRightX, rightY, colWidth - 20, 80)
     .strokeColor(COLORS.rule).lineWidth(0.5).stroke();
  rightY += 95;

  y = Math.max(leftY, rightY) + 30;

  // ---- Supplier bank details ----
  const hasIban = supplier.iban != null && String(supplier.iban).trim() !== '';
  const hasBic = supplier.bic != null && String(supplier.bic).trim() !== '';
  if (hasIban || hasBic) {
    drawRule(doc, y, 0.3);
    y += 15;
    doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.dark)
       .text('Coordonnees bancaires du Fournisseur :', PAGE.marginLeft, y);
    y = doc.y + 6;
    doc.fontSize(9).font('Helvetica').fillColor(COLORS.dark);
    if (hasIban) {
      doc.text('IBAN : ' + supplier.iban, PAGE.marginLeft, y);
      y = doc.y + 4;
    }
    if (hasBic) {
      doc.text('BIC : ' + supplier.bic, PAGE.marginLeft, y);
      y = doc.y + 4;
    }
    y += 20;
  }

  // ---- Bottom reference and legal ----
  const bottomY = PAGE.height - PAGE.marginBottom - 60;
  y = Math.max(y, bottomY);

  drawRule(doc, y, 0.3);
  y += 10;

  doc.fontSize(8).font('Helvetica').fillColor(COLORS.gray)
     .text('Mandat ref. ' + (data.mandate_id || ''), PAGE.marginLeft, y, {
       width: PAGE.contentWidth,
       align: 'center'
     });
  y = doc.y + 4;

  doc.fontSize(8).font('Helvetica').fillColor(COLORS.gray)
     .text('Document genere par la plateforme JADOMI', PAGE.marginLeft, y, {
       width: PAGE.contentWidth,
       align: 'center'
     });
  y = doc.y + 12;

  doc.fontSize(7).font('Helvetica').fillColor(COLORS.lightGray)
     .text('Conformement a l\'article 289-I-2 du CGI, ce mandat autorise le mandataire a emettre des factures au nom et pour le compte du mandant.',
       PAGE.marginLeft, y, {
         width: PAGE.contentWidth,
         align: 'center',
         lineGap: 2
       });
}

module.exports = { generateMandateContractPDF };
