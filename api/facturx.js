// =============================================
// JADOMI — Factur-X XML & FEC Generator
// Conformite facturation electronique EN 16931
// =============================================

/**
 * Escape XML special characters
 */
function escXml(val) {
  if (val == null) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format monetary amount to 2 decimal places
 */
function fmt(amount) {
  return Number(amount || 0).toFixed(2);
}

/**
 * Generate Factur-X XML (MINIMUM profile, EN 16931)
 *
 * @param {Object} invoice
 * @param {string} invoice.numero - Invoice number
 * @param {string} invoice.date - Date YYYY-MM-DD
 * @param {string} [invoice.type_code='380'] - 380=facture, 381=avoir
 * @param {Object} invoice.vendeur - { nom, siret, tva_intracom, adresse, cp, ville }
 * @param {Object} invoice.acheteur - { nom, siret, adresse, cp, ville }
 * @param {number} invoice.total_ht
 * @param {number} invoice.total_tva
 * @param {number} invoice.total_ttc
 * @param {number} invoice.net_a_payer
 * @param {string} [invoice.devise='EUR']
 * @param {string} [invoice.nature_operation='Prestation de services']
 * @returns {string} XML string
 */
function generateFacturXML(invoice) {
  const {
    numero,
    date,
    type_code = '380',
    vendeur = {},
    acheteur = {},
    total_ht = 0,
    total_tva = 0,
    total_ttc = 0,
    net_a_payer = 0,
    devise = 'EUR',
    nature_operation = 'Prestation de services'
  } = invoice;

  // Format date YYYYMMDD for udt:DateTimeString format="102"
  const dateFormatted = (date || '').replace(/-/g, '');

  // Buyer ID block (only if siret provided)
  const buyerIdBlock = acheteur.siret
    ? `        <ram:ID>${escXml(acheteur.siret)}</ram:ID>\n`
    : '';

  // Buyer address block (only if address provided)
  const buyerAddressBlock = acheteur.adresse
    ? `        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escXml(acheteur.cp)}</ram:PostcodeCode>
          <ram:LineOne>${escXml(acheteur.adresse)}</ram:LineOne>
          <ram:CityName>${escXml(acheteur.ville)}</ram:CityName>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>\n`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:factur-x.eu:1p0:minimum</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${escXml(numero)}</ram:ID>
    <ram:TypeCode>${escXml(type_code)}</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${escXml(dateFormatted)}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${escXml(vendeur.nom)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escXml(vendeur.cp)}</ram:PostcodeCode>
          <ram:LineOne>${escXml(vendeur.adresse)}</ram:LineOne>
          <ram:CityName>${escXml(vendeur.ville)}</ram:CityName>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${escXml(vendeur.tva_intracom)}</ram:ID>
        </ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${escXml(acheteur.nom)}</ram:Name>
${buyerIdBlock}${buyerAddressBlock}      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${escXml(devise)}</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${fmt(total_ht)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${fmt(total_ht)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${escXml(devise)}">${fmt(total_tva)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${fmt(total_ttc)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${fmt(net_a_payer)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}

/**
 * Generate FEC (Fichier des Ecritures Comptables) export
 *
 * FEC fields (pipe-delimited):
 * JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|
 * CompAuxNum|CompAuxLib|PieceRef|PieceDate|EcritureLib|Debit|Credit|
 * EcritureLet|DateLet|ValidDate|Montantdevise|Idevise
 *
 * @param {Array<Object>} entries - Array of accounting entries
 * @param {string} entries[].journal_code - e.g. 'VE' (ventes), 'AC' (achats)
 * @param {string} entries[].journal_lib - e.g. 'Journal des ventes'
 * @param {string} entries[].ecriture_num - Unique entry number
 * @param {string} entries[].ecriture_date - YYYYMMDD
 * @param {string} entries[].compte_num - Account number (e.g. '411000')
 * @param {string} entries[].compte_lib - Account label
 * @param {string} [entries[].comp_aux_num] - Auxiliary account number
 * @param {string} [entries[].comp_aux_lib] - Auxiliary account label
 * @param {string} entries[].piece_ref - Source document reference
 * @param {string} entries[].piece_date - YYYYMMDD
 * @param {string} entries[].ecriture_lib - Entry description
 * @param {number} entries[].debit - Debit amount
 * @param {number} entries[].credit - Credit amount
 * @param {string} [entries[].ecriture_let] - Lettering code
 * @param {string} [entries[].date_let] - Lettering date YYYYMMDD
 * @param {string} entries[].valid_date - Validation date YYYYMMDD
 * @param {number} [entries[].montant_devise] - Amount in foreign currency
 * @param {string} [entries[].idevise] - Currency code
 * @returns {string} Pipe-delimited FEC content (with header line)
 */
function generateFEC(entries) {
  const header = 'JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|CompAuxNum|CompAuxLib|PieceRef|PieceDate|EcritureLib|Debit|Credit|EcritureLet|DateLet|ValidDate|Montantdevise|Idevise';

  const lines = (entries || []).map(e => {
    return [
      e.journal_code || '',
      e.journal_lib || '',
      e.ecriture_num || '',
      e.ecriture_date || '',
      e.compte_num || '',
      e.compte_lib || '',
      e.comp_aux_num || '',
      e.comp_aux_lib || '',
      e.piece_ref || '',
      e.piece_date || '',
      e.ecriture_lib || '',
      fmt(e.debit),
      fmt(e.credit),
      e.ecriture_let || '',
      e.date_let || '',
      e.valid_date || '',
      e.montant_devise != null ? fmt(e.montant_devise) : '',
      e.idevise || ''
    ].join('|');
  });

  return [header, ...lines].join('\n');
}

module.exports = { generateFacturXML, generateFEC, escXml };
