// =============================================
// JADOMI — Invoice Matcher Service
// Passe 51 — Match facture → produits + intelligence prix
// =============================================

const { admin } = require('../api/multiSocietes/middleware');

/**
 * Matche les produits d'une facture avec la base products_database
 * et enregistre les prix fournisseur
 *
 * @param {object} invoiceData - Donnees extraites de la facture
 * @param {string} societeId
 * @param {string} userId
 * @returns {object} {matched, created, prices_recorded, insights}
 */
async function matchInvoiceToProducts(invoiceData, societeId, userId) {
  const results = { matched: 0, created: 0, prices_recorded: 0, insights: [] };

  const supplierName = invoiceData.fournisseur || invoiceData.supplier_name || 'Inconnu';
  const products = invoiceData.produits || invoiceData.products || [];

  for (const item of products) {
    const ref = item.reference || item.ean || item.code || '';
    const designation = item.nom || item.designation || item.name || '';
    const qty = item.quantite || item.quantity || 1;
    const unitPrice = item.prix_unitaire || item.unit_price || item.prix_ht || 0;

    let productId = null;
    let gtin = ref;

    // Step 1 : Match par reference/EAN dans products_database
    if (ref) {
      try {
        const { data } = await admin().from('products_database')
          .select('id, gtin')
          .or(`gtin.eq.${ref},reference.eq.${ref},manufacturer_ref.eq.${ref}`)
          .limit(1).maybeSingle();
        if (data) { productId = data.id; gtin = data.gtin; results.matched++; }
      } catch (e) { /* continue */ }
    }

    // Step 2 : Match par nom (ilike)
    if (!productId && designation.length > 5) {
      try {
        const searchTerm = designation.substring(0, 40);
        const { data } = await admin().from('products_database')
          .select('id, gtin')
          .ilike('name_fr', `%${searchTerm}%`)
          .limit(1).maybeSingle();
        if (data) { productId = data.id; gtin = data.gtin; results.matched++; }
      } catch (e) { /* continue */ }
    }

    // Step 3 : Creer entree provisoire si pas trouve
    if (!productId && gtin && gtin.length >= 8) {
      try {
        const { data } = await admin().from('products_database').insert({
          gtin,
          name: designation || `Produit ${gtin}`,
          name_fr: designation || null,
          brand: null,
          manufacturer: supplierName,
          source: 'invoice_scan',
          confidence_score: 0.3,
          last_synced_at: new Date().toISOString()
        }).select('id').single();
        if (data) { productId = data.id; results.created++; }
      } catch (e) { /* duplicate gtin, ignore */ }
    }

    // Step 4 : Enregistrer prix fournisseur
    if (unitPrice > 0 && gtin) {
      try {
        await admin().from('supplier_prices').insert({
          product_id: productId,
          gtin,
          supplier_name: supplierName,
          supplier_category: 'distributor',
          supplier_reference: ref,
          price_negotiated: unitPrice,
          source: 'invoice_scan',
          source_invoice_id: invoiceData.invoice_id || null,
          societe_id: societeId,
          observed_at: invoiceData.date_emission ? new Date(invoiceData.date_emission) : new Date()
        });
        results.prices_recorded++;
      } catch (e) { /* silent */ }
    }

    // Step 5 : Generer insights prix
    if (productId && unitPrice > 0 && gtin) {
      try {
        const insight = await generatePriceInsight(productId, gtin, unitPrice, supplierName, societeId);
        if (insight) results.insights.push(insight);
      } catch (e) { /* silent */ }
    }
  }

  return results;
}

/**
 * Genere un insight prix si le cabinet paie plus cher que le marche
 */
async function generatePriceInsight(productId, gtin, currentPrice, currentSupplier, societeId) {
  try {
    const { data: marketData } = await admin().from('v_market_prices')
      .select('*')
      .eq('gtin', gtin)
      .maybeSingle();

    if (!marketData || !marketData.min_price) return null;

    const avgPrice = marketData.avg_price;
    const bestPrice = marketData.min_price;

    // Seulement si le cabinet paie > 15% au-dessus du meilleur prix
    if (currentPrice <= bestPrice * 1.15) return null;

    const savings = currentPrice - bestPrice;
    const savingsPercent = ((savings / currentPrice) * 100).toFixed(1);

    const insight = {
      societe_id: societeId,
      product_id: productId,
      insight_type: 'better_supplier',
      current_price: currentPrice,
      market_average: avgPrice,
      best_price_found: bestPrice,
      best_supplier: null, // anonymise
      potential_savings: savings,
      savings_percent: parseFloat(savingsPercent),
      message: `Vous payez ${currentPrice.toFixed(2)}EUR chez ${currentSupplier}. Le meilleur prix observe est ${bestPrice.toFixed(2)}EUR (-${savingsPercent}%).`,
      action_recommended: 'renegocier'
    };

    await admin().from('price_insights').insert(insight);
    return insight;
  } catch (e) { return null; }
}

module.exports = { matchInvoiceToProducts, generatePriceInsight };
