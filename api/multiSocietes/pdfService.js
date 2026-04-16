// =============================================
// JADOMI — Multi-sociétés : génération PDF (pdfkit pur JS)
// Génère quittances, devis, factures avec mentions légales françaises
// =============================================
const PDFDocument = require('pdfkit');

// Cache mémoire des logos (URL → Buffer) : 15 min, 32 entrées max
const LOGO_CACHE = new Map();
const LOGO_CACHE_TTL = 15 * 60 * 1000;
async function fetchLogoBuffer(url) {
  if (!url) return null;
  // PDFKit ne gère pas SVG → on ignore pour éviter un crash
  if (/\.svg(\?|$)/i.test(url)) return null;
  const now = Date.now();
  const hit = LOGO_CACHE.get(url);
  if (hit && (now - hit.t) < LOGO_CACHE_TTL) return hit.buf;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || '';
    if (!/^image\/(jpeg|png|webp)/i.test(ct)) return null;
    const ab = await r.arrayBuffer();
    const buf = Buffer.from(ab);
    if (LOGO_CACHE.size > 32) {
      const firstKey = LOGO_CACHE.keys().next().value;
      LOGO_CACHE.delete(firstKey);
    }
    LOGO_CACHE.set(url, { buf, t: now });
    return buf;
  } catch { return null; }
}

const EUR = n => (Number(n) || 0).toFixed(2).replace('.', ',') + ' €';
const DATE = d => {
  if (!d) return '';
  const x = (typeof d === 'string') ? new Date(d) : d;
  return x.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const MOIS_FR = ['janvier','février','mars','avril','mai','juin',
                 'juillet','août','septembre','octobre','novembre','décembre'];

function pdfToBuffer(buildFn) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try { buildFn(doc); doc.end(); } catch (e) { reject(e); }
  });
}

function header(doc, societe, logoBuffer) {
  const top = 48;
  const textX = logoBuffer ? 48 + 70 : 48;  // décale le texte si logo
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, 48, top, { fit: [60, 60], align: 'left', valign: 'top' });
    } catch (_) { /* logo invalide → ignore */ }
  }
  doc.fontSize(10).fillColor('#333');
  if (societe?.nom) doc.font('Helvetica-Bold').fontSize(14).text(societe.nom, textX, top);
  doc.font('Helvetica').fontSize(9).fillColor('#444');
  const lines = [];
  if (societe?.adresse) lines.push(societe.adresse);
  if (societe?.code_postal || societe?.ville) lines.push(`${societe.code_postal || ''} ${societe.ville || ''}`.trim());
  if (societe?.pays && societe.pays !== 'France') lines.push(societe.pays);
  if (societe?.email) lines.push(`Email : ${societe.email}`);
  if (societe?.telephone) lines.push(`Tél : ${societe.telephone}`);
  if (societe?.siren) lines.push(`SIREN : ${societe.siren}`);
  if (societe?.tva_intracom) lines.push(`TVA intracom : ${societe.tva_intracom}`);
  doc.text(lines.join('\n'), textX, top + 20);
  doc.moveTo(48, top + 110).lineTo(547, top + 110).strokeColor('#c8f060').lineWidth(2).stroke();
  doc.fillColor('#000').strokeColor('#000');
}

function footerCgv(doc, societe) {
  if (!societe?.cgv) return;
  doc.addPage();
  doc.fontSize(12).font('Helvetica-Bold').text('Conditions Générales de Vente', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(8).font('Helvetica').text(societe.cgv, { align: 'justify' });
}

// ======================================================================
// QUITTANCE DE LOYER (SCI)
// ======================================================================
async function buildQuittancePDF({ societe, locataire, bien, quittance }) {
  const logo = await fetchLogoBuffer(societe?.logo_url);
  return pdfToBuffer(doc => {
    header(doc, societe, logo);
    doc.moveDown(2);

    doc.font('Helvetica-Bold').fontSize(18).fillColor('#111')
       .text(`QUITTANCE DE LOYER  ${quittance.numero}`, { align: 'right' });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(10)
       .text(`Période : ${MOIS_FR[quittance.mois - 1]} ${quittance.annee}`, { align: 'right' });

    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(11).text('Locataire :');
    doc.font('Helvetica').fontSize(10);
    const nomLoc = locataire.raison_sociale || `${locataire.prenom || ''} ${locataire.nom || ''}`.trim();
    doc.text(nomLoc);
    if (locataire.adresse) doc.text(locataire.adresse);
    if (locataire.code_postal || locataire.ville)
      doc.text(`${locataire.code_postal || ''} ${locataire.ville || ''}`.trim());

    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Bien loué :');
    doc.font('Helvetica');
    if (bien) {
      const ad = [bien.adresse, `${bien.code_postal || ''} ${bien.ville || ''}`.trim()].filter(Boolean).join(', ');
      doc.text(ad || bien.reference || '—');
    }

    doc.moveDown(1.5);
    const yTbl = doc.y;
    doc.rect(48, yTbl, 499, 24).fill('#f4f1ea').stroke('#ddd');
    doc.fillColor('#111').font('Helvetica-Bold').fontSize(10);
    doc.text('Détail', 56, yTbl + 7);
    doc.text('Montant', 450, yTbl + 7, { width: 90, align: 'right' });
    let y = yTbl + 24;
    doc.fillColor('#000').font('Helvetica').fontSize(10);
    doc.text(`Loyer hors charges (${MOIS_FR[quittance.mois-1]} ${quittance.annee})`, 56, y + 7);
    doc.text(EUR(quittance.loyer_ht), 450, y + 7, { width: 90, align: 'right' });
    y += 22;
    doc.text('Provisions sur charges', 56, y + 7);
    doc.text(EUR(quittance.charges), 450, y + 7, { width: 90, align: 'right' });
    y += 22;
    doc.rect(48, y, 499, 26).fill('#c8f060').stroke('#c8f060');
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(11);
    doc.text('Total reçu', 56, y + 8);
    doc.text(EUR(quittance.total), 450, y + 8, { width: 90, align: 'right' });

    doc.fillColor('#000').font('Helvetica').fontSize(10);
    doc.moveDown(3);
    doc.text(
      `Je soussigné·e, bailleur désigné ci-dessus, déclare avoir reçu de ${nomLoc} la somme de ${EUR(quittance.total)} au titre du loyer et des charges pour la période de ${MOIS_FR[quittance.mois-1]} ${quittance.annee} concernant le logement désigné ci-dessus, et lui en donne quittance, sous réserve de tous mes droits.`,
      { align: 'justify' }
    );
    doc.moveDown(2);
    doc.text(`Fait le ${DATE(new Date())}`, { align: 'right' });
    doc.moveDown(2);
    doc.font('Helvetica-Oblique').fontSize(9).fillColor('#666')
       .text('La présente quittance annule tous les reçus qui auraient pu être établis précédemment en cas de paiement partiel du montant du présent terme.', { align: 'justify' });
  });
}

// ======================================================================
// DEVIS (société commerciale)
// ======================================================================
async function buildDevisPDF({ societe, client, devis }) {
  const logo = await fetchLogoBuffer(societe?.logo_url);
  return pdfToBuffer(doc => {
    header(doc, societe, logo);
    doc.moveDown(2);

    doc.font('Helvetica-Bold').fontSize(18).text(`DEVIS  ${devis.numero}`, { align: 'right' });
    doc.font('Helvetica').fontSize(10).moveDown(0.3)
       .text(`Date d'émission : ${DATE(devis.date_emission)}`, { align: 'right' })
       .text(`Validité : ${DATE(devis.date_validite)}`, { align: 'right' });

    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(11).text('Destinataire :');
    doc.font('Helvetica').fontSize(10);
    const nomCli = client?.raison_sociale || `${client?.prenom || ''} ${client?.nom || ''}`.trim() || '—';
    doc.text(nomCli);
    if (client?.adresse) doc.text(client.adresse);
    if (client?.code_postal || client?.ville) doc.text(`${client.code_postal || ''} ${client.ville || ''}`.trim());
    if (client?.siren) doc.text(`SIREN : ${client.siren}`);
    if (client?.tva_intracom) doc.text(`TVA intracom : ${client.tva_intracom}`);

    doc.moveDown(1);
    drawLignesTable(doc, devis.lignes || [], devis);

    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9).fillColor('#444');
    doc.text(`Conditions de paiement : ${societe?.conditions_paiement || '30 jours'}.`);
    if (devis.conditions) doc.text(devis.conditions);
    if (devis.notes) { doc.moveDown(0.3); doc.text(devis.notes); }

    doc.moveDown(2);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text('Bon pour accord :');
    doc.font('Helvetica').fontSize(9).moveDown(0.3)
       .text('Date : ______________     Signature et cachet :');
    footerCgv(doc, societe);
  });
}

// ======================================================================
// FACTURE (société commerciale)  — mentions légales art. L441-9
// ======================================================================
async function buildFacturePDF({ societe, client, facture }) {
  const logo = await fetchLogoBuffer(societe?.logo_url);
  return pdfToBuffer(doc => {
    header(doc, societe, logo);
    doc.moveDown(2);

    doc.font('Helvetica-Bold').fontSize(18).text(`FACTURE  ${facture.numero}`, { align: 'right' });
    doc.font('Helvetica').fontSize(10).moveDown(0.3)
       .text(`Date d'émission : ${DATE(facture.date_emission)}`, { align: 'right' })
       .text(`Échéance : ${DATE(facture.date_echeance)}`, { align: 'right' });

    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(11).text('Facturé à :');
    doc.font('Helvetica').fontSize(10);
    const nomCli = client?.raison_sociale || `${client?.prenom || ''} ${client?.nom || ''}`.trim() || '—';
    doc.text(nomCli);
    if (client?.adresse) doc.text(client.adresse);
    if (client?.code_postal || client?.ville) doc.text(`${client.code_postal || ''} ${client.ville || ''}`.trim());
    if (client?.siren) doc.text(`SIREN : ${client.siren}`);
    if (client?.tva_intracom) doc.text(`TVA intracom : ${client.tva_intracom}`);

    doc.moveDown(1);
    drawLignesTable(doc, facture.lignes || [], facture);

    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(10).text('Modalités de paiement');
    doc.font('Helvetica').fontSize(9);
    doc.text(`Conditions : ${societe?.conditions_paiement || '30 jours'}.`);
    if (societe?.iban) doc.text(`IBAN : ${societe.iban}${societe.bic ? '   BIC : ' + societe.bic : ''}`);
    if (facture.nb_echeances > 1) {
      doc.text(`Paiement en ${facture.nb_echeances} fois sans frais.`);
    }

    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(8).fillColor('#555');
    doc.text(
      `Pénalités de retard : ${societe?.penalites_retard || '3x taux BCE en vigueur'}. Indemnité forfaitaire pour frais de recouvrement : ${societe?.indemnite_recouvrement || 40}€ (art. L441-10 Code de commerce).`,
      { align: 'justify' }
    );
    doc.text('Pas d\'escompte pour paiement anticipé. TVA exigible sur les débits.');
    if (facture.notes) { doc.moveDown(0.3); doc.fillColor('#000').text(facture.notes); }
    footerCgv(doc, societe);
  });
}

function drawLignesTable(doc, lignes, doc_totals) {
  const x0 = 48, xQte = 310, xPu = 360, xTva = 420, xTotal = 490;
  const y0 = doc.y;
  doc.rect(48, y0, 499, 22).fill('#f4f1ea').stroke('#ddd');
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(9);
  doc.text('Désignation', x0 + 6, y0 + 6, { width: 250 });
  doc.text('Qté', xQte, y0 + 6, { width: 40, align: 'right' });
  doc.text('PU HT', xPu, y0 + 6, { width: 50, align: 'right' });
  doc.text('TVA%', xTva, y0 + 6, { width: 40, align: 'right' });
  doc.text('Total TTC', xTotal, y0 + 6, { width: 55, align: 'right' });

  let y = y0 + 22;
  doc.fillColor('#000').font('Helvetica').fontSize(9);
  let sousHt = 0, totTva = 0, totTtc = 0;
  for (const l of (lignes || [])) {
    const qte = Number(l.quantite || 0);
    const pu = Number(l.prix_unitaire_ht || 0);
    const tva = Number(l.taux_tva || 0);
    const ht = qte * pu;
    const mTva = ht * tva / 100;
    const ttc = ht + mTva;
    sousHt += ht; totTva += mTva; totTtc += ttc;

    const desc = [l.reference, l.designation, l.description].filter(Boolean).join(' — ');
    const hDesc = doc.heightOfString(desc, { width: 250 });
    const hLine = Math.max(22, hDesc + 12);
    doc.rect(48, y, 499, hLine).stroke('#eee');
    doc.text(desc, x0 + 6, y + 6, { width: 250 });
    doc.text(String(qte), xQte, y + 6, { width: 40, align: 'right' });
    doc.text(EUR(pu), xPu, y + 6, { width: 50, align: 'right' });
    doc.text(tva.toFixed(2), xTva, y + 6, { width: 40, align: 'right' });
    doc.text(EUR(ttc), xTotal, y + 6, { width: 55, align: 'right' });
    y += hLine;
  }

  y += 8;
  const labelX = 370, valX = 490;
  doc.font('Helvetica').fontSize(10);
  doc.text('Sous-total HT', labelX, y, { width: 110, align: 'right' });
  doc.text(EUR(doc_totals?.sous_total_ht ?? sousHt), valX, y, { width: 55, align: 'right' });
  y += 16;
  doc.text('Total TVA', labelX, y, { width: 110, align: 'right' });
  doc.text(EUR(doc_totals?.total_tva ?? totTva), valX, y, { width: 55, align: 'right' });
  y += 18;
  doc.rect(labelX - 6, y - 2, 180, 22).fill('#c8f060');
  doc.fillColor('#000').font('Helvetica-Bold').fontSize(11);
  doc.text('Total TTC', labelX, y + 3, { width: 110, align: 'right' });
  doc.text(EUR(doc_totals?.total_ttc ?? totTtc), valX, y + 3, { width: 55, align: 'right' });
  doc.y = y + 32;
  doc.fillColor('#000');
}

// ======================================================================
// AVOIR (note de crédit) — comptabilité française, référence facture
// ======================================================================
async function buildAvoirPDF({ societe, client, avoir, facture }) {
  const logo = await fetchLogoBuffer(societe?.logo_url);
  return pdfToBuffer(doc => {
    header(doc, societe, logo);
    doc.moveDown(2);

    doc.font('Helvetica-Bold').fontSize(18).fillColor('#b00020')
       .text(`AVOIR  ${avoir.numero}`, { align: 'right' });
    doc.fillColor('#000');
    doc.font('Helvetica').fontSize(10).moveDown(0.3)
       .text(`Date d'émission : ${DATE(avoir.date_emission)}`, { align: 'right' });
    if (facture?.numero) {
      doc.text(`Référence facture : ${facture.numero}`, { align: 'right' });
      if (facture.date_emission)
        doc.text(`Facture du ${DATE(facture.date_emission)}`, { align: 'right' });
    }

    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(11).text('Destinataire :');
    doc.font('Helvetica').fontSize(10);
    const nomCli = client?.raison_sociale || `${client?.prenom || ''} ${client?.nom || ''}`.trim() || '—';
    doc.text(nomCli);
    if (client?.adresse) doc.text(client.adresse);
    if (client?.code_postal || client?.ville) doc.text(`${client.code_postal || ''} ${client.ville || ''}`.trim());
    if (client?.siren) doc.text(`SIREN : ${client.siren}`);
    if (client?.tva_intracom) doc.text(`TVA intracom : ${client.tva_intracom}`);

    doc.moveDown(1);
    if (avoir.motif) {
      doc.font('Helvetica-Bold').fontSize(10).text('Motif :');
      doc.font('Helvetica').fontSize(10).text(avoir.motif);
      doc.moveDown(0.5);
    }

    // Lignes — montants affichés en négatif
    const lignesNeg = (avoir.lignes || []).map(l => ({
      ...l,
      designation: l.designation,
      description: l.description,
      reference: l.reference,
      quantite: -Math.abs(Number(l.quantite || 0)),
      prix_unitaire_ht: Number(l.prix_unitaire_ht || 0),
      taux_tva: Number(l.taux_tva || 0)
    }));
    drawLignesTable(doc, lignesNeg, {
      sous_total_ht: -Math.abs(Number(avoir.sous_total_ht || 0)),
      total_tva: -Math.abs(Number(avoir.total_tva || 0)),
      total_ttc: -Math.abs(Number(avoir.total_ttc || 0))
    });

    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9).fillColor('#555');
    doc.text(
      'Cet avoir annule tout ou partie de la facture référencée ci-dessus. Les montants sont déduits du compte client. Document à conserver pour votre comptabilité (art. L441-9 du Code de commerce).',
      { align: 'justify' }
    );
    doc.fillColor('#000');
    footerCgv(doc, societe);
  });
}

module.exports = { buildQuittancePDF, buildDevisPDF, buildFacturePDF, buildAvoirPDF };
