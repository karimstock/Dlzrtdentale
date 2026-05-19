// =============================================
// JADOMI — Agent Stock/Comparateur
//
// Spécialisé dans la gestion du stock et les prix :
// - Détection des produits en rupture/seuil bas
// - Recherche du meilleur prix (catalogue + promo)
// - Suggestion de commande groupée optimisée
// - Résumé rapide pour le copilot
//
// Cascade IA : calcul local (0EUR) → Mistral si besoin
// REGLE FONDATEUR : TOUJOURS prix catalogue ET prix promo
// =============================================

const { mistralGenerate } = require('../ia-router');
const { validateResponse } = require('../ai-studio/jadomi-brain');

// Import prudent de memory.js (créé par un autre builder)
let memory = null;
try {
  memory = require('./memory');
} catch (_e) {
  // memory.js pas encore disponible — on continue sans
}

// ═══════════════════════════════════════
// CONSTANTES MÉTIER
// ═══════════════════════════════════════

const FOURNISSEURS_CONNUS = [
  'GACD', 'Henry Schein', 'Mega Dental', 'DPI', 'Septodont',
  'DentalClick', 'DentalEvolution', 'Anthogyr', 'Straumann',
  'Promodentaire', 'Godentaire', 'Leone', 'Dentsply', 'Kerr',
  '3M', 'Ivoclar', 'Venta', 'DGD', 'Septaline'
];

const SEUIL_PEREMPTION_ROUGE = 30;  // jours
const SEUIL_PEREMPTION_ORANGE = 90; // jours

// ═══════════════════════════════════════
// FONCTION 1 : checkLowStock
// Vérifie les produits sous le seuil minimum
// ═══════════════════════════════════════

async function checkLowStock(supabase, societeId) {
  try {
    // Charger le contexte agent si memory disponible
    if (memory && typeof memory.buildAgentContext === 'function') {
      try {
        await memory.buildAgentContext(supabase, societeId, 'stock');
      } catch (_e) { /* ignore */ }
    }

    // Produits dont le stock actuel est inférieur ou égal au seuil minimum
    const { data: products, error } = await supabase
      .from('produits_societe')
      .select('*')
      .eq('societe_id', societeId)
      .not('stock_alerte', 'is', null);

    if (error) {
      console.error('[AGENT:STOCK] checkLowStock DB error:', error.message);
      return { success: false, alerts: [], error: 'Erreur de lecture du stock' };
    }

    const allProducts = products || [];
    const alerts = [];
    const now = new Date();

    for (const p of allProducts) {
      const current = p.stock_actuel || p.stock_reel || 0;
      const minimum = p.stock_alerte || 0;

      // Alerte stock bas
      if (current <= minimum) {
        const alert = {
          product_id: p.id,
          product_name: p.nom || p.designation || p.name,
          reference: p.reference || p.ref || p.code_ean,
          current_stock: current,
          minimum_stock: minimum,
          deficit: minimum - current,
          category: p.categorie || p.category || 'non classé',
          fournisseur: p.fournisseur || p.supplier || null,
          urgency: current === 0 ? 'critical' : 'warning',
          suggestion: current === 0
            ? `Rupture totale de ${p.nom || p.designation}. Commande urgente recommandée.`
            : `Stock bas pour ${p.nom || p.designation} (${current}/${minimum}). Pensez à réapprovisionner.`
        };
        alerts.push(alert);
      }

      // Alerte péremption
      if (p.date_peremption || p.expiry_date) {
        const expiry = new Date(p.date_peremption || p.expiry_date);
        const daysLeft = Math.round((expiry - now) / 86400000);

        if (daysLeft <= SEUIL_PEREMPTION_ROUGE && daysLeft >= 0) {
          alerts.push({
            product_id: p.id,
            product_name: p.nom || p.designation || p.name,
            reference: p.reference || p.ref,
            type: 'expiry',
            urgency: daysLeft <= SEUIL_PEREMPTION_ROUGE ? 'critical' : 'warning',
            days_left: daysLeft,
            expiry_date: (p.date_peremption || p.expiry_date),
            suggestion: daysLeft <= 0
              ? `PÉRIMÉ : ${p.nom || p.designation}. À retirer immédiatement du stock.`
              : `Péremption dans ${daysLeft} jours pour ${p.nom || p.designation}.`
          });
        } else if (daysLeft <= SEUIL_PEREMPTION_ORANGE && daysLeft > SEUIL_PEREMPTION_ROUGE) {
          alerts.push({
            product_id: p.id,
            product_name: p.nom || p.designation || p.name,
            type: 'expiry_warning',
            urgency: 'info',
            days_left: daysLeft,
            suggestion: `Péremption dans ${daysLeft} jours pour ${p.nom || p.designation}. A utiliser en priorité (FIFO).`
          });
        }
      }
    }

    // Trier : critiques d'abord
    alerts.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return (order[a.urgency] || 3) - (order[b.urgency] || 3);
    });

    return {
      success: true,
      total_products_checked: allProducts.length,
      alerts,
      alerts_count: alerts.length,
      critical_count: alerts.filter(a => a.urgency === 'critical').length,
      warning_count: alerts.filter(a => a.urgency === 'warning').length
    };
  } catch (err) {
    console.error('[AGENT:STOCK] checkLowStock error:', err.message);
    return { success: false, alerts: [], error: err.message };
  }
}

// ═══════════════════════════════════════
// FONCTION 2 : findBestPrice
// Cherche les meilleurs prix catalogue + promo
// ═══════════════════════════════════════

async function findBestPrice(supabase, { productName, ref } = {}) {
  try {
    if (!productName && !ref) {
      return { success: false, prices: [], error: 'Nom du produit ou référence requis' };
    }

    // Recherche dans scraped_prices (219K prix, 25 fournisseurs FR)
    let query = supabase.from('scraped_prices').select('*');

    if (ref) {
      query = query.or(`reference.ilike.%${ref}%,matched_gtin.eq.${ref}`);
    }

    if (productName && !ref) {
      query = query.ilike('product_name', `%${productName}%`);
    }

    const { data: results, error } = await query.order('price', { ascending: true }).limit(30);

    if (error) {
      console.error('[AGENT:STOCK] findBestPrice DB error:', error.message);
      return { success: false, prices: [], error: 'Erreur de recherche' };
    }

    const all = results || [];

    // Formater les résultats avec prix catalogue ET promo (REGLE FONDATEUR)
    const prices = all.map(p => ({
      product_id: p.id,
      product_name: p.product_name,
      reference: p.reference,
      fournisseur: p.supplier_name || 'Non renseigné',
      prix_catalogue: p.price_original || p.price || null,
      prix_promo: p.discount_percent ? p.price : null,
      prix_unitaire: p.price || null,
      remise_percent: p.discount_percent ? Math.round(p.discount_percent) : null,
      conditionnement: p.unit || null,
      url: p.url || null,
      last_updated: p.scraped_at || null,
      brand: p.brand || null,
    }));

    // Calculer le pourcentage de remise
    for (const p of prices) {
      if (p.prix_catalogue && p.prix_promo && p.prix_catalogue > 0) {
        p.remise_percent = Math.round((1 - p.prix_promo / p.prix_catalogue) * 100);
      }
    }

    // Trier par meilleur prix effectif
    prices.sort((a, b) => {
      const priceA = a.prix_promo || a.prix_catalogue || Infinity;
      const priceB = b.prix_promo || b.prix_catalogue || Infinity;
      return priceA - priceB;
    });

    const bestPrice = prices.length > 0 ? prices[0] : null;

    return {
      success: true,
      query: { productName, ref },
      prices,
      results_count: prices.length,
      best_price: bestPrice,
      best_fournisseur: bestPrice ? bestPrice.fournisseur : null,
      economy_vs_catalogue: bestPrice && bestPrice.remise_percent
        ? `${bestPrice.remise_percent}% d'économie chez ${bestPrice.fournisseur}`
        : null
    };
  } catch (err) {
    console.error('[AGENT:STOCK] findBestPrice error:', err.message);
    return { success: false, prices: [], error: err.message };
  }
}

// ═══════════════════════════════════════
// FONCTION 3 : suggestOrder
// Regroupe les produits par fournisseur
// ═══════════════════════════════════════

async function suggestOrder(supabase, societeId, alerts) {
  try {
    if (!alerts || alerts.length === 0) {
      // Si pas d'alertes fournies, les chercher
      const lowStock = await checkLowStock(supabase, societeId);
      alerts = (lowStock.alerts || []).filter(a => a.urgency === 'critical' || a.urgency === 'warning');
    }

    if (alerts.length === 0) {
      return {
        success: true,
        order: null,
        message: 'Aucun produit ne nécessite de commande pour le moment.'
      };
    }

    // Regrouper par fournisseur
    const byFournisseur = {};
    let totalEstimate = 0;

    for (const alert of alerts) {
      // Ne prendre que les alertes de stock (pas péremption)
      if (alert.type === 'expiry' || alert.type === 'expiry_warning') continue;

      const fournisseur = alert.fournisseur || 'Non renseigné';
      if (!byFournisseur[fournisseur]) {
        byFournisseur[fournisseur] = { items: [], subtotal: 0 };
      }

      // Quantité à commander = seuil - stock actuel + marge de 20%
      const deficit = alert.deficit || (alert.minimum_stock - alert.current_stock) || 1;
      const qtyToOrder = Math.ceil(deficit * 1.2);

      // Chercher le prix si disponible
      let unitPrice = null;
      try {
        const priceResult = await findBestPrice(supabase, {
          ref: alert.reference,
          productName: alert.product_name
        });
        if (priceResult.best_price) {
          unitPrice = priceResult.best_price.prix_promo || priceResult.best_price.prix_catalogue;
        }
      } catch (_e) { /* pas grave */ }

      const lineTotal = unitPrice ? unitPrice * qtyToOrder : null;
      if (lineTotal) totalEstimate += lineTotal;

      byFournisseur[fournisseur].items.push({
        product_name: alert.product_name,
        reference: alert.reference,
        current_stock: alert.current_stock,
        qty_to_order: qtyToOrder,
        unit_price: unitPrice,
        line_total: lineTotal
      });

      if (lineTotal) {
        byFournisseur[fournisseur].subtotal += lineTotal;
      }
    }

    // Trouver le fournisseur recommandé (celui avec le plus d'items)
    let recommendedFournisseur = null;
    let maxItems = 0;
    for (const [f, data] of Object.entries(byFournisseur)) {
      if (data.items.length > maxItems) {
        maxItems = data.items.length;
        recommendedFournisseur = f;
      }
    }

    return {
      success: true,
      order: {
        items_count: alerts.filter(a => a.type !== 'expiry' && a.type !== 'expiry_warning').length,
        by_fournisseur: byFournisseur,
        total_estimate: totalEstimate > 0 ? Math.round(totalEstimate * 100) / 100 : null,
        fournisseur_recommande: recommendedFournisseur,
        message: `Commande suggérée : ${Object.keys(byFournisseur).length} fournisseur(s), ${alerts.length} produit(s)${totalEstimate > 0 ? `, estimation ${totalEstimate.toFixed(2)} EUR HT` : ''}.`
      }
    };
  } catch (err) {
    console.error('[AGENT:STOCK] suggestOrder error:', err.message);
    return { success: false, order: null, error: err.message };
  }
}

// ═══════════════════════════════════════
// FONCTION 4 : stockSummary
// Résumé rapide pour le copilot
// ═══════════════════════════════════════

async function stockSummary(supabase, societeId) {
  try {
    const { data: products, error } = await supabase
      .from('produits_societe')
      .select('*')
      .eq('societe_id', societeId);

    if (error) {
      console.error('[AGENT:STOCK] stockSummary DB error:', error.message);
      return { success: false, error: 'Erreur de lecture du stock' };
    }

    const all = products || [];
    const now = new Date();

    let totalRefs = all.length;
    let lowStockCount = 0;
    let expiringSoon = 0;
    let expiredCount = 0;
    let totalValue = 0;
    let zeroStockCount = 0;

    for (const p of all) {
      const current = p.stock_actuel || p.stock_reel || 0;
      const minimum = p.stock_alerte || 0;
      const price = p.prix_unitaire || p.prix || p.prix_catalogue || 0;

      // Stock bas
      if (minimum > 0 && current <= minimum) {
        lowStockCount++;
      }

      // Rupture totale
      if (current === 0) {
        zeroStockCount++;
      }

      // Valeur totale du stock
      totalValue += current * price;

      // Péremption
      if (p.date_peremption || p.expiry_date) {
        const expiry = new Date(p.date_peremption || p.expiry_date);
        const daysLeft = Math.round((expiry - now) / 86400000);
        if (daysLeft < 0) {
          expiredCount++;
        } else if (daysLeft <= SEUIL_PEREMPTION_ORANGE) {
          expiringSoon++;
        }
      }
    }

    return {
      success: true,
      total_refs: totalRefs,
      low_stock_count: lowStockCount,
      zero_stock_count: zeroStockCount,
      expiring_soon: expiringSoon,
      expired_count: expiredCount,
      total_value: Math.round(totalValue * 100) / 100,
      health: lowStockCount === 0 && expiredCount === 0 ? 'good' :
              expiredCount > 0 ? 'critical' :
              lowStockCount > 5 ? 'warning' : 'fair',
      summary_text: `${totalRefs} références en stock. ${lowStockCount > 0 ? `${lowStockCount} en alerte basse.` : 'Niveaux corrects.'} ${expiringSoon > 0 ? `${expiringSoon} péremption(s) proche(s).` : ''} ${expiredCount > 0 ? `ATTENTION : ${expiredCount} produit(s) périmé(s) à retirer.` : ''} Valeur estimée : ${totalValue.toFixed(2)} EUR.`
    };
  } catch (err) {
    console.error('[AGENT:STOCK] stockSummary error:', err.message);
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════

module.exports = {
  checkLowStock,
  findBestPrice,
  suggestOrder,
  stockSummary
};
