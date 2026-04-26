// =============================================
// JADOMI — Invoice Matcher + Intelligence Prix
// Passe 51 — Mine d'or comparatif prix
//
// Quand un dentiste scanne sa facture :
// 1. On identifie le distributeur
// 2. On match chaque produit dans products_database
// 3. On enregistre le prix REEL (pas catalogue)
// 4. On compare avec les prix des AUTRES cabinets
// 5. On genere des insights d'economies
// 6. On enrichit la base pour les futurs scans
//
// Resultat : JADOMI sait que Henry Schein vend le meme
// produit 12EUR a un cabinet et 14EUR a un autre.
// → Negociation groupee → Panier le moins cher.
// =============================================

const { admin } = require('../api/multiSocietes/middleware');

/**
 * Pipeline complet : facture → match → prix → insights → enrichissement
 */
async function matchInvoiceToProducts(invoiceData, societeId, userId) {
  const results = {
    matched: 0,
    created: 0,
    prices_recorded: 0,
    products_enriched: 0,
    insights: [],
    supplier_summary: null
  };

  const supplierName = (invoiceData.fournisseur || invoiceData.supplier_name || 'Inconnu').trim();
  const products = invoiceData.produits || invoiceData.products || [];
  const invoiceDate = invoiceData.date_emission ? new Date(invoiceData.date_emission) : new Date();
  const invoiceId = invoiceData.invoice_id || null;

  if (!products.length) return results;

  // ══════════════════════════════════════════
  // ETAPE 1 : Identifier/categoriser le distributeur
  // ══════════════════════════════════════════
  const supplierCategory = classifySupplier(supplierName);

  // ══════════════════════════════════════════
  // ETAPE 1b : Charger le CONTRAT fournisseur du cabinet
  // Si le dentiste a un contrat (type DPI : prix catalogue sur facture
  // mais remise réelle de X%), on calcule le VRAI prix.
  // Données stockées dans table "fournisseurs" (code_client + remises par catégorie)
  // ══════════════════════════════════════════
  let supplierContract = null;
  if (societeId) {
    try {
      // Cherche dans la table fournisseurs de la société
      let contractData = null;
      const { data: cd1 } = await admin().from('fournisseurs')
        .select('*')
        .eq('societe_id', societeId)
        .ilike('nom', `%${supplierName.split(/\s+/)[0]}%`)
        .limit(1)
        .maybeSingle();
      contractData = cd1;

      if (!contractData) {
        // Fallback : cherche sans societe_id (ancienne structure)
        const { data: cd2 } = await admin().from('fournisseurs')
          .select('*')
          .ilike('nom', `%${supplierName.split(/\s+/)[0]}%`)
          .limit(1)
          .maybeSingle();
        contractData = cd2;
      }

      if (contractData) {
        supplierContract = {
          code_client: contractData.code_client,
          // Remises par catégorie (stockées comme remise_consommables, remise_composites, etc.)
          remise_consommables: Number(contractData.remise_consommables || 0),
          remise_composites: Number(contractData.remise_composites || 0),
          remise_endodontie: Number(contractData.remise_endodontie || 0),
          remise_anesthésiants: Number(contractData['remise_anesthésiants'] || contractData.remise_anesthesiants || 0),
          remise_matériel: Number(contractData['remise_matériel'] || contractData.remise_materiel || 0),
          // Remise globale (si contrat type abonnement DPI)
          remise_globale: Number(contractData.remise_globale || 0),
          type_contrat: contractData.type_contrat || 'standard', // 'standard' | 'abonnement'
          montant_annuel: Number(contractData.montant_annuel || 0),
        };
        console.log(`[invoice-matcher] Contrat ${supplierName}: remise_globale=${supplierContract.remise_globale}%, type=${supplierContract.type_contrat}`);
      }
    } catch (e) {
      console.warn('[invoice-matcher] Erreur chargement contrat:', e.message);
    }
  }

  // ══════════════════════════════════════════
  // ETAPE 2 : Pour chaque produit de la facture
  // ══════════════════════════════════════════
  for (const item of products) {
    const ref = (item.reference || item.ean || item.code || '').trim();
    const designation = (item.nom || item.designation || item.name || '').trim();
    const qty = Math.abs(Number(item.quantite || item.quantity || 1));
    const unitPrice = Math.abs(Number(item.prix_unitaire || item.unit_price || item.prix_ht || 0));
    const tva = Number(item.taux_tva || 20);

    if (!designation && !ref) continue;

    let productId = null;
    let gtin = ref;
    let matchSource = null;

    // ── Match dans products_database ──────────

    // 2a. Par GTIN/reference exacte
    if (ref && ref.length >= 4) {
      try {
        const { data } = await admin().from('products_database')
          .select('id, gtin, name_fr, brand, category')
          .or(`gtin.eq.${ref},reference.eq.${ref},manufacturer_ref.eq.${ref}`)
          .limit(1).maybeSingle();
        if (data) {
          productId = data.id;
          gtin = data.gtin;
          matchSource = 'gtin_exact';
          results.matched++;
        }
      } catch (e) { /* continue */ }
    }

    // 2b. Par nom (ilike) dans products_database
    if (!productId && designation.length > 5) {
      try {
        const search = designation.substring(0, 50).replace(/'/g, "''");
        const { data } = await admin().from('products_database')
          .select('id, gtin, name_fr, brand, category')
          .or(`name_fr.ilike.%${search}%,name.ilike.%${search}%`)
          .limit(1).maybeSingle();
        if (data) {
          productId = data.id;
          gtin = data.gtin;
          matchSource = 'name_match';
          results.matched++;
        }
      } catch (e) { /* continue */ }
    }

    // 2c. Par nom anglais (pour produits GUDID non enrichis)
    if (!productId && designation.length > 5) {
      try {
        const search = designation.substring(0, 50).replace(/'/g, "''");
        const { data } = await admin().from('products_database')
          .select('id, gtin, name, brand, category')
          .ilike('name', `%${search}%`)
          .limit(1).maybeSingle();
        if (data) {
          productId = data.id;
          gtin = data.gtin;
          matchSource = 'name_en_match';
          results.matched++;
        }
      } catch (e) { /* continue */ }
    }

    // 2d. Creer dans products_database si inconnu (enrichissement auto)
    if (!productId) {
      // Generer un GTIN si on n'en a pas
      if (!gtin || gtin.length < 4) {
        gtin = `JADOMI-${supplierName.substring(0,4).toUpperCase()}-${Date.now()}-${results.created}`;
      }

      try {
        const { data } = await admin().from('products_database').upsert({
          gtin,
          name: designation,
          name_fr: designation, // deja en francais puisque facture FR
          brand: extractBrand(designation),
          manufacturer: supplierName,
          category: guessCategory(designation),
          source: 'invoice_scan',
          source_metadata: {
            supplier: supplierName,
            supplier_ref: ref,
            first_seen_invoice: invoiceId,
            first_seen_date: invoiceDate.toISOString()
          },
          confidence_score: 0.4,
          last_synced_at: new Date().toISOString()
        }, { onConflict: 'gtin', ignoreDuplicates: true }).select('id').single();

        if (data) {
          productId = data.id;
          results.created++;
          results.products_enriched++;
        }
      } catch (e) { /* doublon gtin, ignore */ }
    }

    // ══════════════════════════════════════════
    // ETAPE 3 : Enregistrer le prix REEL
    // C'est ici la MINE D'OR — prix negocie reel, pas catalogue
    //
    // CAS CONTRAT (ex DPI) :
    // La facture montre le prix CATALOGUE, mais le dentiste a un contrat
    // avec une remise de X%. On calcule le vrai prix :
    //   prix_reel = prix_catalogue × (1 - remise%)
    // On stocke TOUJOURS les deux : price_catalog + price_negotiated
    // ══════════════════════════════════════════
    if (unitPrice > 0) {
      let priceCatalog = unitPrice;
      let priceNegotiated = unitPrice;
      let discountApplied = 0;
      let contractApplied = false;

      if (supplierContract) {
        // Déterminer la remise applicable
        // 1. Remise globale (contrat type abonnement, ex: DPI 38%)
        if (supplierContract.remise_globale > 0) {
          discountApplied = supplierContract.remise_globale;
          contractApplied = true;
        }
        // 2. Remise par catégorie (prioritaire si définie pour cette catégorie)
        const productCategory = guessCategory(designation).toLowerCase();
        const categoryMap = {
          'composites': 'remise_composites',
          'endodontie': 'remise_endodontie',
          'anesthesie': 'remise_anesthésiants',
          'instruments': 'remise_matériel',
          'equipement': 'remise_matériel',
          'sterilisation': 'remise_consommables',
          'hygiene': 'remise_consommables',
          'empreintes': 'remise_consommables',
          'implants': 'remise_matériel',
          'prothese': 'remise_matériel',
          'chirurgie': 'remise_matériel',
          'radiologie': 'remise_matériel',
          'cfao': 'remise_matériel',
          'orthodontie': 'remise_matériel',
        };
        const remiseKey = categoryMap[productCategory];
        if (remiseKey && supplierContract[remiseKey] > 0) {
          discountApplied = supplierContract[remiseKey];
          contractApplied = true;
        }

        // Appliquer la remise au prix catalogue pour obtenir le prix réel
        if (discountApplied > 0) {
          priceNegotiated = +(priceCatalog * (1 - discountApplied / 100)).toFixed(2);
        }
      }

      try {
        await admin().from('supplier_prices').insert({
          product_id: productId,
          gtin: gtin,
          supplier_name: supplierName,
          supplier_category: supplierCategory,
          supplier_reference: ref || null,
          price_catalog: priceCatalog,
          price_negotiated: priceNegotiated,
          discount_percent: discountApplied > 0 ? discountApplied : null,
          source: 'invoice_scan',
          source_invoice_id: invoiceId,
          societe_id: societeId,
          observed_at: invoiceDate,
          metadata: {
            designation_facture: designation,
            quantite: qty,
            taux_tva: tva,
            match_source: matchSource,
            contract_applied: contractApplied,
            contract_type: supplierContract?.type_contrat || null,
            contract_discount_pct: discountApplied > 0 ? discountApplied : null
          }
        });
        results.prices_recorded++;
      } catch (e) { /* silent */ }
    }

    // ══════════════════════════════════════════
    // ETAPE 4 : Comparer avec les prix des AUTRES cabinets
    // Un meme distributeur peut vendre moins cher le meme produit
    // a un autre dentiste → on le detecte
    // ══════════════════════════════════════════
    if (productId && unitPrice > 0) {
      try {
        const insight = await generatePriceInsight(productId, gtin, unitPrice, supplierName, societeId, designation);
        if (insight) results.insights.push(insight);
      } catch (e) { /* silent */ }
    }
  }

  // ══════════════════════════════════════════
  // ETAPE 5 : Resume fournisseur
  // ══════════════════════════════════════════
  results.supplier_summary = {
    name: supplierName,
    category: supplierCategory,
    products_count: products.length,
    matched: results.matched,
    new_products: results.created,
    prices_recorded: results.prices_recorded,
    potential_savings: results.insights.reduce((sum, i) => sum + (i.potential_savings || 0), 0)
  };

  return results;
}

/**
 * Compare le prix paye avec le marche
 * Detecte :
 * - Si un AUTRE cabinet paie MOINS chez le MEME distributeur (prix negocie different)
 * - Si un AUTRE distributeur vend MOINS cher
 * - Si le prix a AUGMENTE par rapport a la derniere facture
 */
async function generatePriceInsight(productId, gtin, currentPrice, currentSupplier, societeId, productName) {
  try {
    // Recuperer tous les prix connus pour ce produit
    const { data: allPrices } = await admin().from('supplier_prices')
      .select('supplier_name, price_negotiated, price_catalog, societe_id, observed_at')
      .eq('gtin', gtin)
      .not('price_negotiated', 'is', null)
      .order('observed_at', { ascending: false })
      .limit(50);

    if (!allPrices || allPrices.length < 2) return null;

    const validPrices = allPrices.map(p => ({
      price: Number(p.price_negotiated || p.price_catalog),
      supplier: p.supplier_name,
      societe: p.societe_id,
      date: p.observed_at
    })).filter(p => p.price > 0);

    if (validPrices.length < 2) return null;

    const bestPrice = Math.min(...validPrices.map(p => p.price));
    const avgPrice = validPrices.reduce((s, p) => s + p.price, 0) / validPrices.length;
    const bestEntry = validPrices.find(p => p.price === bestPrice);

    // ── Insight 1 : Meme produit moins cher ailleurs ──
    if (currentPrice > bestPrice * 1.10) {
      const savings = currentPrice - bestPrice;
      const savingsPercent = ((savings / currentPrice) * 100).toFixed(1);

      const isSameSupplier = bestEntry.supplier === currentSupplier;
      const insightType = isSameSupplier ? 'same_supplier_cheaper' : 'better_supplier';

      const message = isSameSupplier
        ? `${currentSupplier} vend ce produit ${bestPrice.toFixed(2)}EUR a un autre cabinet (vous payez ${currentPrice.toFixed(2)}EUR). Negociez -${savingsPercent}% !`
        : `${productName || 'Ce produit'} est disponible a ${bestPrice.toFixed(2)}EUR (vous payez ${currentPrice.toFixed(2)}EUR chez ${currentSupplier}). Economie: -${savingsPercent}%`;

      const insight = {
        societe_id: societeId,
        product_id: productId,
        insight_type: insightType,
        current_price: currentPrice,
        market_average: +avgPrice.toFixed(2),
        best_price_found: bestPrice,
        best_supplier: isSameSupplier ? `${currentSupplier} (autre cabinet)` : bestEntry.supplier,
        potential_savings: +savings.toFixed(2),
        savings_percent: +savingsPercent,
        message,
        action_recommended: isSameSupplier ? 'renegocier' : 'changer_fournisseur'
      };

      await admin().from('price_insights').insert(insight);
      return insight;
    }

    // ── Insight 2 : Prix en hausse par rapport a la derniere fois ──
    const previousSameSupplier = validPrices.find(p =>
      p.supplier === currentSupplier && p.societe === societeId && p.date !== allPrices[0]?.observed_at
    );

    if (previousSameSupplier && currentPrice > previousSameSupplier.price * 1.05) {
      const increase = currentPrice - previousSameSupplier.price;
      const increasePct = ((increase / previousSameSupplier.price) * 100).toFixed(1);

      const insight = {
        societe_id: societeId,
        product_id: productId,
        insight_type: 'price_increase',
        current_price: currentPrice,
        market_average: +avgPrice.toFixed(2),
        best_price_found: previousSameSupplier.price,
        best_supplier: `${currentSupplier} (prix precedent)`,
        potential_savings: +increase.toFixed(2),
        savings_percent: +increasePct,
        message: `${currentSupplier} a augmente le prix de ${productName || 'ce produit'} de +${increasePct}% (${previousSameSupplier.price.toFixed(2)}EUR → ${currentPrice.toFixed(2)}EUR)`,
        action_recommended: 'surveiller'
      };

      await admin().from('price_insights').insert(insight);
      return insight;
    }

    return null;
  } catch (e) { return null; }
}

/**
 * Generer le panier le moins cher a partir d'une liste de produits
 * Compare tous les distributeurs pour chaque produit
 */
async function generateCheapestBasket(productGtins, societeId) {
  const basket = { items: [], total_best: 0, total_current: 0, total_savings: 0, suppliers_needed: new Set() };

  for (const gtin of productGtins) {
    // Trouver le meilleur prix pour ce produit
    const { data: prices } = await admin().from('supplier_prices')
      .select('supplier_name, price_negotiated, observed_at')
      .eq('gtin', gtin)
      .not('price_negotiated', 'is', null)
      .order('price_negotiated', { ascending: true })
      .limit(10);

    if (!prices?.length) continue;

    // Prix actuel du cabinet
    const currentPrice = prices.find(p => p.societe_id === societeId);
    const bestPrice = prices[0];

    basket.items.push({
      gtin,
      best_supplier: bestPrice.supplier_name,
      best_price: bestPrice.price_negotiated,
      current_price: currentPrice?.price_negotiated || bestPrice.price_negotiated,
      savings: (currentPrice?.price_negotiated || bestPrice.price_negotiated) - bestPrice.price_negotiated
    });

    basket.total_best += bestPrice.price_negotiated;
    basket.total_current += (currentPrice?.price_negotiated || bestPrice.price_negotiated);
    basket.suppliers_needed.add(bestPrice.supplier_name);
  }

  basket.total_savings = basket.total_current - basket.total_best;
  basket.suppliers_needed = [...basket.suppliers_needed];
  return basket;
}

// ── Helpers ────────────────────────────────────

// Categorise automatiquement le distributeur
function classifySupplier(name) {
  const n = name.toLowerCase();
  if (/henry\s*schein/i.test(n)) return 'distributor';
  if (/gacd/i.test(n)) return 'distributor';
  if (/mega\s*dental/i.test(n)) return 'distributor';
  if (/dental\s*(hi|express|city)/i.test(n)) return 'distributor';
  if (/pierre\s*rolland|acteon/i.test(n)) return 'manufacturer';
  if (/ivoclar|vita\b|3m\b|dentsply|kerr\b|gc\b|kavo|planmeca|degussa/i.test(n)) return 'manufacturer';
  if (/straumann|nobel|zimmer|biomet|osstem|mis\b|bego\b|amann/i.test(n)) return 'manufacturer';
  if (/groupement|coop|gpo/i.test(n)) return 'groupement';
  return 'distributor';
}

// Extraction naive de la marque depuis la designation
function extractBrand(designation) {
  const brands = [
    '3M', 'Dentsply', 'Kerr', 'Ivoclar', 'GC', 'Vita', 'KaVo', 'Acteon',
    'Hu-Friedy', 'Carestream', 'Planmeca', 'Straumann', 'Nobel', 'Zimmer',
    'Septodont', 'Pierre Fabre', 'Bien Air', 'W&H', 'NSK', 'Mectron',
    'Heine', 'Zhermack', 'Tokuyama', 'Shofu', 'Kuraray', 'Ultradent',
    'Coltene', 'SDI', 'VOCO', 'Kulzer', 'DMG', 'Bisico'
  ];
  for (const brand of brands) {
    if (designation.toLowerCase().includes(brand.toLowerCase())) return brand;
  }
  return null;
}

// Deviner la categorie depuis la designation francaise
function guessCategory(designation) {
  const d = designation.toLowerCase();
  if (/composite|compo\b/i.test(d)) return 'Composites';
  if (/implant/i.test(d)) return 'Implants';
  if (/bracket|arc\b|aligneur|ortho/i.test(d)) return 'Orthodontie';
  if (/couronne|bridge|prothes|ceramiq|zircon|facette|inlay/i.test(d)) return 'Prothese';
  if (/lime|endo|gutta|canal/i.test(d)) return 'Endodontie';
  if (/fraise|turbine|contre.?angle|miroir|sonde|pince/i.test(d)) return 'Instruments';
  if (/anesthes|carpule|aiguille/i.test(d)) return 'Anesthesie';
  if (/empreinte|alginate|silicone/i.test(d)) return 'Empreintes';
  if (/radio|capteur|panoram/i.test(d)) return 'Radiologie';
  if (/steril|autoclave|desinfect/i.test(d)) return 'Sterilisation';
  if (/fluor|prophyl|detart/i.test(d)) return 'Hygiene';
  if (/chirurg|davier|suture|elev/i.test(d)) return 'Chirurgie';
  if (/scanner|usineuse|3d/i.test(d)) return 'CFAO';
  if (/fauteuil|lampe|aspir/i.test(d)) return 'Equipement';
  if (/blanch/i.test(d)) return 'Esthetique';
  return 'Divers';
}

module.exports = { matchInvoiceToProducts, generatePriceInsight, generateCheapestBasket };
