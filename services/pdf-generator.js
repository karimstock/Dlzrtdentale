// =============================================
// JADOMI LABO — Generateur PDF (PDFKit)
// BL, Declaration Conformite CE, Factures
// =============================================

const PDFDocument = require('pdfkit');
const { mentionsLegales } = require('./tva-calculator');

const COLORS = {
  primary: '#1a56db',
  dark: '#1f2937',
  gray: '#6b7280',
  lightGray: '#e5e7eb',
  white: '#ffffff'
};

function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatMoney(n) {
  return (Number(n) || 0).toFixed(2).replace('.', ',') + ' EUR';
}

// ===== BON DE LIVRAISON PDF =====
function genererBLPdf({ prothesiste, dentiste, bl, lignes, teintes }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // En-tete
      doc.fontSize(16).fillColor(COLORS.primary)
        .text(prothesiste.raison_sociale, 40, 40);
      doc.fontSize(8).fillColor(COLORS.gray);
      if (prothesiste.forme_juridique) doc.text(prothesiste.forme_juridique);
      doc.text([prothesiste.adresse_ligne1, prothesiste.adresse_ligne2].filter(Boolean).join(' '));
      doc.text(`${prothesiste.code_postal || ''} ${prothesiste.ville || ''}`);
      if (prothesiste.telephone) doc.text(`Tel: ${prothesiste.telephone}`);
      if (prothesiste.email) doc.text(`Email: ${prothesiste.email}`);
      if (prothesiste.siren) doc.text(`SIREN: ${prothesiste.siren}`);
      if (prothesiste.numero_dmmes) doc.text(`N° ANSM/DMMES: ${prothesiste.numero_dmmes}`);

      // Titre BL
      doc.moveDown(1);
      doc.fontSize(14).fillColor(COLORS.dark)
        .text(`BON DE LIVRAISON N° ${bl.numero_bl}`, { align: 'center' });
      doc.moveDown(0.5);

      // Infos dentiste
      doc.fontSize(10).fillColor(COLORS.dark)
        .text('DESTINATAIRE :', 350, 40);
      doc.fontSize(9).fillColor(COLORS.gray);
      if (dentiste.titre) doc.text(`${dentiste.titre} ${dentiste.prenom || ''} ${dentiste.nom}`, 350);
      else doc.text(`${dentiste.prenom || ''} ${dentiste.nom}`, 350);
      if (dentiste.raison_sociale_cabinet) doc.text(dentiste.raison_sociale_cabinet, 350);
      if (dentiste.adresse_ligne1) doc.text(dentiste.adresse_ligne1, 350);
      doc.text(`${dentiste.code_postal || ''} ${dentiste.ville || ''}`, 350);

      // Infos BL
      const yInfo = doc.y + 20;
      doc.fontSize(9).fillColor(COLORS.dark);
      doc.text(`Date : ${formatDate(bl.date_bl)}`, 40, yInfo);
      doc.text(`Patient : ${bl.patient_initiales || 'N/A'} ${bl.patient_reference_interne ? '(Ref: ' + bl.patient_reference_interne + ')' : ''}`, 40);

      // Teintes
      if (teintes && (teintes.principale || teintes.collet || teintes.incisive)) {
        doc.moveDown(0.5);
        doc.fontSize(9).fillColor(COLORS.primary).text('TEINTES :');
        doc.fillColor(COLORS.gray);
        if (teintes.teintier) doc.text(`Teintier : ${teintes.teintier}`);
        if (teintes.principale) doc.text(`Principale : ${teintes.principale}`);
        if (teintes.collet) doc.text(`Collet : ${teintes.collet}`);
        if (teintes.incisive) doc.text(`Incisive : ${teintes.incisive}`);
        if (teintes.gingivale) doc.text(`Gingivale : ${teintes.gingivale}`);
        if (teintes.notes) doc.text(`Notes : ${teintes.notes}`);
      }

      // Tableau produits
      doc.moveDown(1);
      const tableTop = doc.y;
      const colX = [40, 260, 310, 360, 420, 480];

      // Header
      doc.rect(40, tableTop, 515, 18).fill(COLORS.primary);
      doc.fontSize(8).fillColor(COLORS.white);
      doc.text('Designation', colX[0] + 4, tableTop + 4, { width: 215 });
      doc.text('Qte', colX[1] + 4, tableTop + 4, { width: 45 });
      doc.text('PU HT', colX[2] + 4, tableTop + 4, { width: 55 });
      doc.text('Remise', colX[3] + 4, tableTop + 4, { width: 55 });
      doc.text('HT', colX[4] + 4, tableTop + 4, { width: 55 });
      doc.text('TTC', colX[5] + 4, tableTop + 4, { width: 55 });

      let y = tableTop + 22;
      doc.fillColor(COLORS.dark);

      for (let i = 0; i < lignes.length; i++) {
        const l = lignes[i];
        if (y > 720) {
          doc.addPage();
          y = 40;
        }
        if (i % 2 === 0) doc.rect(40, y - 2, 515, 16).fill('#f9fafb');
        doc.fillColor(COLORS.dark).fontSize(8);
        let desig = l.designation;
        if (l.materiau) desig += ` [${l.materiau}${l.numero_lot_materiau ? ' Lot:' + l.numero_lot_materiau : ''}]`;
        doc.text(desig, colX[0] + 4, y, { width: 215 });
        doc.text(String(l.quantite), colX[1] + 4, y, { width: 45 });
        doc.text(formatMoney(l.prix_unitaire), colX[2] + 4, y, { width: 55 });
        doc.text(l.remise_pct ? l.remise_pct + '%' : '-', colX[3] + 4, y, { width: 55 });
        doc.text(formatMoney(l.montant_ht), colX[4] + 4, y, { width: 55 });
        doc.text(formatMoney(l.montant_ttc), colX[5] + 4, y, { width: 55 });
        y += 18;
      }

      // Totaux
      y += 10;
      doc.fontSize(9).fillColor(COLORS.dark);
      const totX = 400;
      doc.text('Total HT exonere :', totX, y); doc.text(formatMoney(bl.total_ht_exonere), 500, y); y += 14;
      if (bl.total_ht_taxable > 0) {
        doc.text('Total HT taxable :', totX, y); doc.text(formatMoney(bl.total_ht_taxable), 500, y); y += 14;
        doc.text('TVA 20% :', totX, y); doc.text(formatMoney(bl.total_tva), 500, y); y += 14;
      }
      doc.fontSize(11).fillColor(COLORS.primary);
      doc.text('TOTAL TTC :', totX, y); doc.text(formatMoney(bl.total_ttc), 500, y);

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

// ===== DECLARATION CONFORMITE CE PDF =====
function genererDeclarationCEPdf({ prothesiste, dentiste, bl, lignes, declaration }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Titre
      doc.fontSize(14).fillColor(COLORS.primary)
        .text('DECLARATION DE CONFORMITE UE', { align: 'center' });
      doc.fontSize(11).fillColor(COLORS.dark)
        .text('Dispositif medical sur mesure', { align: 'center' });
      doc.fontSize(9).fillColor(COLORS.gray)
        .text('(Reglement UE 2017/745 - Annexe XIII)', { align: 'center' });

      doc.moveDown(1.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke(COLORS.lightGray);
      doc.moveDown(1);

      // FABRICANT
      doc.fontSize(11).fillColor(COLORS.primary).text('FABRICANT');
      doc.fontSize(9).fillColor(COLORS.dark);
      doc.text(prothesiste.raison_sociale);
      doc.text([prothesiste.adresse_ligne1, prothesiste.adresse_ligne2].filter(Boolean).join(', '));
      doc.text(`${prothesiste.code_postal || ''} ${prothesiste.ville || ''}`);
      if (prothesiste.numero_dmmes) doc.text(`N° enregistrement ANSM (DMMES) : ${prothesiste.numero_dmmes}`);
      if (prothesiste.siren) doc.text(`SIREN : ${prothesiste.siren}`);

      doc.moveDown(1);

      // IDENTIFICATION DU DISPOSITIF
      doc.fontSize(11).fillColor(COLORS.primary).text('IDENTIFICATION DU DISPOSITIF');
      doc.fontSize(9).fillColor(COLORS.dark);
      doc.text(`Reference unique : ${bl.numero_bl}`);
      doc.text(`Date de fabrication : ${formatDate(bl.date_bl)}`);
      doc.text(`Designation :`);
      for (const l of lignes) {
        let desc = `  - ${l.designation}`;
        if (l.materiau) desc += ` (Materiau: ${l.materiau}`;
        if (l.numero_lot_materiau) desc += `, Lot: ${l.numero_lot_materiau}`;
        if (l.materiau) desc += ')';
        doc.text(desc);
      }
      if (bl.teinte_principale) {
        doc.text(`Teinte(s) : ${[bl.teinte_principale, bl.teinte_collet, bl.teinte_incisive].filter(Boolean).join(', ')}`);
        if (bl.teintier_utilise) doc.text(`  Teintier : ${bl.teintier_utilise}`);
      }

      doc.moveDown(1);

      // PRATICIEN PRESCRIPTEUR
      doc.fontSize(11).fillColor(COLORS.primary).text('PRATICIEN PRESCRIPTEUR');
      doc.fontSize(9).fillColor(COLORS.dark);
      const nomDentiste = `${dentiste.titre || 'Dr'} ${dentiste.prenom || ''} ${dentiste.nom}`.trim();
      doc.text(nomDentiste);
      if (dentiste.adresse_ligne1) doc.text(dentiste.adresse_ligne1);
      doc.text(`${dentiste.code_postal || ''} ${dentiste.ville || ''}`);
      if (dentiste.rpps) doc.text(`RPPS : ${dentiste.rpps}`);

      doc.moveDown(1);

      // PATIENT DESTINATAIRE
      doc.fontSize(11).fillColor(COLORS.primary).text('PATIENT DESTINATAIRE');
      doc.fontSize(9).fillColor(COLORS.dark);
      doc.text(`Identification : ${bl.patient_initiales || 'N/A'} ${bl.patient_reference_interne ? '(Ref: ' + bl.patient_reference_interne + ')' : ''}`);
      doc.fontSize(8).fillColor(COLORS.gray)
        .text('(Donnees nominatives conservees chez le praticien - RGPD)');

      doc.moveDown(1);

      // CLASSIFICATION
      doc.fontSize(11).fillColor(COLORS.primary).text('CLASSIFICATION');
      doc.fontSize(9).fillColor(COLORS.dark);
      doc.text('DM sur mesure - Classe IIa');
      doc.text('Conformite Annexe I Reglement UE 2017/745');

      doc.moveDown(1);

      // DECLARATION
      doc.fontSize(11).fillColor(COLORS.primary).text('DECLARATION');
      doc.fontSize(9).fillColor(COLORS.dark);
      doc.text(
        'Le fabricant declare sous sa seule responsabilite que le dispositif medical identifie ci-dessus ' +
        'est conforme aux exigences generales de securite et de performance enoncees a l\'Annexe I du ' +
        'Reglement (UE) 2017/745, qu\'il est fabrique conformement a la prescription medicale du praticien, ' +
        'et destine exclusivement au patient identifie.',
        { align: 'justify' }
      );
      doc.moveDown(0.3);
      doc.text('Conforme a l\'article R.5211-51 du CSP.');
      doc.text(`Fabrique en ${prothesiste.pays_fabrication || prothesiste.pays || 'France'}.`);

      doc.moveDown(1.5);

      // SIGNATURE
      doc.fontSize(9).fillColor(COLORS.dark);
      doc.text(`Fait a ${prothesiste.ville || '___'}, le ${formatDate(bl.date_bl)}`);
      if (prothesiste.responsable_qualite) doc.text(prothesiste.responsable_qualite);

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

// ===== FACTURE LABO PDF =====
function genererFacturePdf({ prothesiste, dentiste, facture, bonsLivraison }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // En-tete labo
      doc.fontSize(16).fillColor(COLORS.primary)
        .text(prothesiste.raison_sociale, 40, 40);
      doc.fontSize(8).fillColor(COLORS.gray);
      if (prothesiste.forme_juridique) doc.text(prothesiste.forme_juridique);
      doc.text([prothesiste.adresse_ligne1, prothesiste.adresse_ligne2].filter(Boolean).join(' '));
      doc.text(`${prothesiste.code_postal || ''} ${prothesiste.ville || ''}`);
      if (prothesiste.siren) doc.text(`SIREN : ${prothesiste.siren} | APE : ${prothesiste.code_ape || '3250A'}`);
      if (prothesiste.numero_rcs) doc.text(`RCS ${prothesiste.rcs_ville || ''} ${prothesiste.numero_rcs}`);
      if (prothesiste.numero_dmmes) doc.text(`N° ANSM/DMMES : ${prothesiste.numero_dmmes}`);
      if (prothesiste.telephone) doc.text(`Tel: ${prothesiste.telephone}`);
      if (prothesiste.email) doc.text(`Email: ${prothesiste.email}`);

      // Dentiste
      doc.fontSize(10).fillColor(COLORS.dark).text('FACTURE A :', 350, 40);
      doc.fontSize(9).fillColor(COLORS.gray);
      const nomDr = `${dentiste.titre || 'Dr'} ${dentiste.prenom || ''} ${dentiste.nom}`.trim();
      doc.text(nomDr, 350);
      if (dentiste.raison_sociale_cabinet) doc.text(dentiste.raison_sociale_cabinet, 350);
      if (dentiste.adresse_ligne1) doc.text(dentiste.adresse_ligne1, 350);
      doc.text(`${dentiste.code_postal || ''} ${dentiste.ville || ''}`, 350);
      if (dentiste.reference_client) doc.text(`Ref client : ${dentiste.reference_client}`, 350);

      // Titre facture
      doc.moveDown(2);
      doc.fontSize(14).fillColor(COLORS.dark)
        .text(`FACTURE N° ${facture.numero_facture}`, { align: 'center' });
      doc.fontSize(9).fillColor(COLORS.gray)
        .text(`Date : ${formatDate(facture.date_facture)} | Periode : du ${formatDate(facture.periode_debut)} au ${formatDate(facture.periode_fin)}`, { align: 'center' });

      doc.moveDown(1);

      // Tableau par BL
      const colX = [40, 90, 300, 340, 390, 440, 500];
      const tableTop = doc.y;

      doc.rect(40, tableTop, 515, 18).fill(COLORS.primary);
      doc.fontSize(7).fillColor(COLORS.white);
      doc.text('N° BL', colX[0] + 3, tableTop + 4, { width: 46 });
      doc.text('Designation', colX[1] + 3, tableTop + 4, { width: 206 });
      doc.text('Qte', colX[2] + 3, tableTop + 4, { width: 36 });
      doc.text('PU HT', colX[3] + 3, tableTop + 4, { width: 46 });
      doc.text('Rem.', colX[4] + 3, tableTop + 4, { width: 46 });
      doc.text('HT', colX[5] + 3, tableTop + 4, { width: 56 });

      let y = tableTop + 22;

      for (const blGroup of bonsLivraison) {
        // Sous-header BL
        if (y > 700) { doc.addPage(); y = 40; }
        doc.rect(40, y - 2, 515, 14).fill('#eef2ff');
        doc.fontSize(7).fillColor(COLORS.primary);
        doc.text(`BL ${blGroup.numero_bl} du ${formatDate(blGroup.date_bl)} - Patient: ${blGroup.patient_initiales || 'N/A'}`, colX[0] + 3, y);
        y += 16;

        for (let i = 0; i < blGroup.lignes.length; i++) {
          const l = blGroup.lignes[i];
          if (y > 720) { doc.addPage(); y = 40; }
          if (i % 2 === 0) doc.rect(40, y - 2, 515, 14).fill('#f9fafb');
          doc.fillColor(COLORS.dark).fontSize(7);
          doc.text('', colX[0] + 3, y, { width: 46 });
          doc.text(l.designation, colX[1] + 3, y, { width: 206 });
          doc.text(String(l.quantite), colX[2] + 3, y, { width: 36 });
          doc.text(formatMoney(l.prix_unitaire), colX[3] + 3, y, { width: 46 });
          doc.text(l.remise_pct ? l.remise_pct + '%' : '-', colX[4] + 3, y, { width: 46 });
          doc.text(formatMoney(l.montant_ht), colX[5] + 3, y, { width: 56 });
          y += 14;
        }

        // Sous-total BL
        doc.fontSize(7).fillColor(COLORS.gray);
        doc.text(`Sous-total BL ${blGroup.numero_bl} : ${formatMoney(blGroup.total_ttc)} TTC`, 380, y);
        y += 16;
      }

      // Totaux
      y += 10;
      const totX = 380;
      doc.fontSize(9).fillColor(COLORS.dark);

      if (facture.total_ht_exonere > 0) {
        doc.text('Total HT exonere TVA :', totX, y); doc.text(formatMoney(facture.total_ht_exonere), 500, y); y += 14;
      }
      if (facture.total_ht_taxable > 0) {
        doc.text('Total HT taxable :', totX, y); doc.text(formatMoney(facture.total_ht_taxable), 500, y); y += 14;
        doc.text('TVA 20% :', totX, y); doc.text(formatMoney(facture.total_tva), 500, y); y += 14;
      }
      if (facture.remise_globale_pct > 0) {
        doc.text(`Remise globale (${facture.remise_globale_pct}%) :`, totX, y);
        y += 14;
      }
      doc.fontSize(12).fillColor(COLORS.primary);
      doc.text('TOTAL TTC :', totX, y); doc.text(formatMoney(facture.total_ttc), 500, y);

      // Mentions legales
      y += 30;
      if (y > 700) { doc.addPage(); y = 40; }
      doc.moveTo(40, y).lineTo(555, y).stroke(COLORS.lightGray);
      y += 10;

      const has_exo = facture.total_ht_exonere > 0;
      const has_tax = facture.total_ht_taxable > 0;
      const mentions = mentionsLegales(prothesiste.regime_tva, has_exo, has_tax);

      doc.fontSize(7).fillColor(COLORS.gray);
      for (const m of mentions) {
        doc.text(m, 40, y, { width: 515 });
        y += 10;
      }

      // Coordonnees bancaires
      if (prothesiste.iban) {
        y += 5;
        doc.fontSize(8).fillColor(COLORS.dark).text('Coordonnees bancaires :', 40, y);
        doc.fontSize(7).fillColor(COLORS.gray);
        doc.text(`IBAN : ${prothesiste.iban}`, 40);
        if (prothesiste.bic) doc.text(`BIC : ${prothesiste.bic}`, 40);
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { genererBLPdf, genererDeclarationCEPdf, genererFacturePdf };
