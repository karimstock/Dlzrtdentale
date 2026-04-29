// =============================================
// JADOMI LABO — Generateur Factur-X (PDF + XML)
// Conformité facture électronique 2026
// Format : Factur-X (EN 16931 / ZUGFeRD)
// =============================================

/**
 * Génère le XML Factur-X (CII Cross Industry Invoice)
 * conforme EN 16931 + Factur-X profil BASIC
 *
 * @param {Object} facture - Donnees facture
 * @param {Object} prothesiste - Profil prothesiste (vendeur)
 * @param {Object} dentiste - Client dentiste (acheteur)
 * @param {Array} lignes - Lignes de facturation
 * @returns {string} XML Factur-X
 */
function genererFacturXml({ facture, prothesiste, dentiste, lignes }) {
  const dateFacture = (facture.date_facture || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const periodeDebut = (facture.periode_debut || '').replace(/-/g, '');
  const periodeFin = (facture.periode_fin || '').replace(/-/g, '');

  const escXml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Déterminer le code TVA : AE = exonere, S = standard
  const totalHtExo = Number(facture.total_ht_exonere) || 0;
  const totalHtTax = Number(facture.total_ht_taxable) || 0;
  const totalTva = Number(facture.total_tva) || 0;
  const totalTtc = Number(facture.total_ttc) || 0;

  let taxLines = '';
  if (totalHtExo > 0) {
    taxLines += `
        <ram:ApplicableTradeTax>
          <ram:CalculatedAmount>${totalHtExo.toFixed(2)}</ram:CalculatedAmount>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:ExemptionReason>Exonération TVA art. 261, 4, 1 du CGI - Prothèses dentaires</ram:ExemptionReason>
          <ram:BasisAmount>${totalHtExo.toFixed(2)}</ram:BasisAmount>
          <ram:CategoryCode>E</ram:CategoryCode>
          <ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>`;
  }
  if (totalHtTax > 0) {
    taxLines += `
        <ram:ApplicableTradeTax>
          <ram:CalculatedAmount>${totalTva.toFixed(2)}</ram:CalculatedAmount>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:BasisAmount>${totalHtTax.toFixed(2)}</ram:BasisAmount>
          <ram:CategoryCode>S</ram:CategoryCode>
          <ram:RateApplicablePercent>20.00</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>`;
  }

  // Lignes de facture
  let lineItems = '';
  (lignes || []).forEach((l, i) => {
    const ht = Number(l.montant_ht) || 0;
    const taux = l.tva_applicable ? (Number(l.taux_tva) || 20) : 0;
    const catCode = l.tva_applicable ? 'S' : 'E';
    lineItems += `
      <ram:IncludedSupplyChainTradeLineItem>
        <ram:AssociatedDocumentLineDocument>
          <ram:LineID>${i + 1}</ram:LineID>
        </ram:AssociatedDocumentLineDocument>
        <ram:SpecifiedTradeProduct>
          <ram:Name>${escXml(l.designation)}</ram:Name>
        </ram:SpecifiedTradeProduct>
        <ram:SpecifiedLineTradeAgreement>
          <ram:NetPriceProductTradePrice>
            <ram:ChargeAmount>${(Number(l.prix_unitaire_apres_remise || l.prix_unitaire) || 0).toFixed(2)}</ram:ChargeAmount>
          </ram:NetPriceProductTradePrice>
        </ram:SpecifiedLineTradeAgreement>
        <ram:SpecifiedLineTradeDelivery>
          <ram:BilledQuantity unitCode="C62">${Number(l.quantite) || 1}</ram:BilledQuantity>
        </ram:SpecifiedLineTradeDelivery>
        <ram:SpecifiedLineTradeSettlement>
          <ram:ApplicableTradeTax>
            <ram:TypeCode>VAT</ram:TypeCode>
            <ram:CategoryCode>${catCode}</ram:CategoryCode>
            <ram:RateApplicablePercent>${taux.toFixed(2)}</ram:RateApplicablePercent>
          </ram:ApplicableTradeTax>
          <ram:SpecifiedTradeSettlementLineMonetarySummation>
            <ram:LineTotalAmount>${ht.toFixed(2)}</ram:LineTotalAmount>
          </ram:SpecifiedTradeSettlementLineMonetarySummation>
        </ram:SpecifiedLineTradeSettlement>
      </ram:IncludedSupplyChainTradeLineItem>`;
  });

  // Régime TVA du vendeur
  let sellerTaxScheme = '';
  if (prothesiste.regime_tva === 'franchise_base') {
    sellerTaxScheme = '<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">FR00000000000</ram:ID></ram:SpecifiedTaxRegistration>';
  } else if (prothesiste.siren) {
    // TVA intracommunautaire FR + SIREN
    const tvaId = 'FR' + (prothesiste.numero_tva_intra || prothesiste.siren || '');
    sellerTaxScheme = `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${escXml(tvaId)}</ram:ID></ram:SpecifiedTaxRegistration>`;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"
  xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:factur-x.eu:1p0:basic</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${escXml(facture.numero_facture)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${dateFacture}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${escXml(prothesiste.raison_sociale)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escXml(prothesiste.code_postal)}</ram:PostcodeCode>
          <ram:LineOne>${escXml(prothesiste.adresse_ligne1)}</ram:LineOne>
          <ram:CityName>${escXml(prothesiste.ville)}</ram:CityName>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
        ${sellerTaxScheme}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${escXml((dentiste.titre || 'Dr') + ' ' + (dentiste.prenom || '') + ' ' + dentiste.nom)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escXml(dentiste.code_postal)}</ram:PostcodeCode>
          <ram:LineOne>${escXml(dentiste.adresse_ligne1)}</ram:LineOne>
          <ram:CityName>${escXml(dentiste.ville)}</ram:CityName>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime>
          <udt:DateTimeString format="102">${periodeFin || dateFacture}</udt:DateTimeString>
        </ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>${taxLines}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${(totalHtExo + totalHtTax).toFixed(2)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${(totalHtExo + totalHtTax).toFixed(2)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${totalTva.toFixed(2)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${totalTtc.toFixed(2)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${totalTtc.toFixed(2)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
    ${lineItems}
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

  return xml;
}

/**
 * Génère les métadonnées Factur-X pour integration dans le PDF
 * (XMP metadata + fichier XML attache)
 */
function getFacturXMetadata() {
  return {
    conformanceLevel: 'BASIC',
    version: '1.0',
    documentType: 'INVOICE',
    documentFileName: 'factur-x.xml'
  };
}

/**
 * Mentions légales facture électronique conforme
 */
function mentionsFactureElectronique(prothesiste) {
  const mentions = [];
  mentions.push('Facture conforme au format Factur-X (EN 16931).');

  if (prothesiste.regime_tva === 'franchise_base') {
    mentions.push('TVA non applicable — art. 293 B du CGI.');
  } else {
    mentions.push('Exonération TVA sur prothèses dentaires — art. 261, 4, 1° du CGI.');
  }

  mentions.push('Délai de paiement : 30 jours à compter de la réception.');
  mentions.push('Pénalités de retard : 3 fois le taux d\'intérêt légal (art. L441-6 C. com.).');
  mentions.push('Indemnité forfaitaire de recouvrement : 40 EUR (art. D441-5 C. com.).');

  if (prothesiste.siren) {
    mentions.push(`SIREN : ${prothesiste.siren} — APE : ${prothesiste.code_ape || '3250A'}`);
  }
  if (prothesiste.numero_dmmes) {
    mentions.push(`N° ANSM/DMMES : ${prothesiste.numero_dmmes}`);
  }

  return mentions;
}

module.exports = { genererFacturXml, getFacturXMetadata, mentionsFactureElectronique };
