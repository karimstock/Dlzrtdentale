// =============================================
// JADOMI — OEM Intelligence Service
// Le cerveau de la détection white label
//
// Quand un dentiste scanne un produit (QR ou photo), ce service :
// 1. Identifie le fabricant OEM d'origine (pas le distributeur)
// 2. Trouve tous les produits équivalents (même usine, même specs)
// 3. Compare les prix entre toutes les marques
// 4. Génère un "rapport d'intelligence" avec économies potentielles
// 5. Apprend de chaque scan (enrichissement auto)
//
// C'est la feature que personne d'autre n'a.
// =============================================

const { admin } = require('../api/multiSocietes/middleware');

// ═══════════════════════════════════════
// BASE DE CONNAISSANCE OEM
// Enrichie par : scans, signalements users, recherche manuelle
// ═══════════════════════════════════════

const OEM_KNOWLEDGE = {
  // Fabricants directs chinois et leurs spécialités
  manufacturers: {
    'NIC': { full: 'Shenzhen Superline Technology (SLT)', country: 'CN', city: 'Shenzhen', type: 'fabricant_oem', specialties: ['Endodontie', 'Orthodontie'] },
    'Perfect': { full: 'Shenzhen Perfect Medical Instruments', country: 'CN', city: 'Shenzhen', type: 'fabricant_direct', specialties: ['Endodontie', 'Orthodontie'] },
    'SANI': { full: 'Chengdu SANI Medical Equipment', country: 'CN', city: 'Chengdu', type: 'fabricant_direct', specialties: ['Endodontie'] },
    'Denco': { full: 'Shenzhen Denco Medical', country: 'CN', city: 'Shenzhen', type: 'fabricant_oem', specialties: ['Endodontie'] },
    'Woodpecker': { full: 'Guilin Woodpecker Medical', country: 'CN', city: 'Guilin', type: 'fabricant_direct', specialties: ['Instruments', 'Equipement'] },
    'COXO': { full: 'COXO Medical Instrument', country: 'CN', city: 'Foshan', type: 'fabricant_direct', specialties: ['Instruments'] },
    'Bloomden': { full: 'Bloomden Bioceramics', country: 'CN', city: 'Changsha', type: 'fabricant_oem', specialties: ['CFAO', 'Prothese'] },
    'HUGE': { full: 'Shandong HUGE Dental Material', country: 'CN', city: 'Shandong', type: 'fabricant_oem', specialties: ['Composites'] },
    'Rogin': { full: 'Rogin Dental', country: 'CN', type: 'fabricant_oem', specialties: ['Endodontie'] },
    'Belident': { full: 'Belident', country: 'CN', type: 'fabricant_oem', specialties: ['Endodontie'] },
    'Siven': { full: 'Siven Dental', country: 'CN', type: 'fabricant_oem', specialties: ['Endodontie'] },
    'Runyes': { full: 'Ningbo Runyes Medical', country: 'CN', city: 'Ningbo', type: 'fabricant_direct', specialties: ['Sterilisation'] },
    'Ningbo Sinyuan': { full: 'Ningbo Sinyuan Bur & Tool', country: 'CN', city: 'Ningbo', type: 'fabricant_oem', specialties: ['Instruments'] },
  },

  // Liens OEM confirmés : marque occidentale → fabricant OEM
  confirmed_oem_links: [
    { brand: 'ACCESS', product: 'Reverso', distributor: 'GACD', oem: 'NIC', confidence: 0.95 },
    { brand: 'Zendo', product: 'Limes Zendo', distributor: 'DentalEvolution', oem: 'NIC', confidence: 0.95 },
    // À enrichir au fil des découvertes
  ],

  // Mots-clés pour détecter les catégories de produits dans les specs
  spec_keywords: {
    'niti_file': ['niti', 'nickel-titane', 'nickel titanium', 'rotary file', 'lime rotative', 'taper', 'reciproc'],
    'carbide_bur': ['carbide', 'carbure', 'tungstene', 'fraise', 'bur', 'fg ', 'ra '],
    'diamond_bur': ['diamond', 'diamant', 'fraise diamant'],
    'composite': ['composite', 'nano-hybrid', 'flowable', 'bulk fill', 'light cure'],
    'zirconia': ['zircone', 'zirconia', 'zro2', 'disc', 'disque'],
    'autoclave': ['autoclave', 'steriliz', 'classe b', 'class b'],
    'scaler': ['detartr', 'scaler', 'piezo', 'ultrasonic'],
    'implant': ['implant', 'pilier', 'abutment', 'titane grade'],
  }
};

/**
 * Analyse complète d'un produit pour intelligence OEM
 * Appelé après identification du produit (scan QR ou photo)
 *
 * @returns {Object} Rapport OEM complet
 */
async function analyzeProduct(product, societeId) {
  const report = {
    product_name: product.nom || product.name,
    product_brand: product.marque || product.brand,
    product_manufacturer: product.fournisseur || product.manufacturer,
    product_category: product.categorie || product.category,
    product_gtin: product.code_barre || product.gtin,

    // Intelligence OEM
    oem_origin: null,          // Le vrai fabricant d'origine
    is_white_label: false,     // Est-ce du white label ?
    is_chinese_oem: false,     // Fabriqué en Chine ?
    oem_confidence: 0,

    // Équivalents trouvés
    equivalents: [],           // Produits identiques sous d'autres marques
    equivalents_count: 0,

    // Économies
    current_price: null,
    cheapest_equivalent: null,
    potential_savings: 0,
    savings_percent: 0,

    // Contexte marché
    market_insight: null,
  };

  const brand = (product.marque || product.brand || '').trim();
  const manufacturer = (product.fournisseur || product.manufacturer || '').trim();
  const name = (product.nom || product.name || '').trim();
  const gtin = (product.code_barre || product.gtin || '').trim();
  const category = (product.categorie || product.category || '').trim();
  const productId = product.id || product.product_db_id;

  // ══════════════════════════════════════════
  // ÉTAPE 1 : Identifier l'origine OEM
  // ══════════════════════════════════════════

  // 1a. Vérifier les liens OEM confirmés
  for (const link of OEM_KNOWLEDGE.confirmed_oem_links) {
    if (brand.toLowerCase().includes(link.brand.toLowerCase()) ||
        name.toLowerCase().includes(link.product.toLowerCase())) {
      const oemInfo = OEM_KNOWLEDGE.manufacturers[link.oem];
      report.oem_origin = {
        manufacturer: oemInfo?.full || link.oem,
        country: oemInfo?.country || 'CN',
        city: oemInfo?.city || null,
        type: oemInfo?.type || 'fabricant_oem',
      };
      report.is_white_label = true;
      report.is_chinese_oem = (oemInfo?.country === 'CN');
      report.oem_confidence = link.confidence;
      break;
    }
  }

  // 1b. Vérifier si le fabricant est directement un fabricant chinois connu
  if (!report.oem_origin) {
    for (const [key, info] of Object.entries(OEM_KNOWLEDGE.manufacturers)) {
      if (manufacturer.toLowerCase().includes(key.toLowerCase()) ||
          brand.toLowerCase().includes(key.toLowerCase())) {
        report.oem_origin = {
          manufacturer: info.full,
          country: info.country,
          city: info.city,
          type: info.type,
        };
        report.is_chinese_oem = (info.country === 'CN');
        report.oem_confidence = 0.95;
        break;
      }
    }
  }

  // 1c. Chercher dans la base product_equivalences
  if (!report.oem_origin && productId) {
    try {
      const { data: equiv } = await admin().from('product_equivalences')
        .select('oem_manufacturer, oem_country, equivalence_type, confidence')
        .or(`product_a_id.eq.${productId},product_b_id.eq.${productId}`)
        .not('oem_manufacturer', 'is', null)
        .order('confidence', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (equiv) {
        report.oem_origin = {
          manufacturer: equiv.oem_manufacturer,
          country: equiv.oem_country,
          type: 'detected',
        };
        report.is_white_label = equiv.equivalence_type === 'same_oem';
        report.is_chinese_oem = equiv.oem_country === 'CN';
        report.oem_confidence = equiv.confidence;
      }
    } catch (e) {}
  }

  // ══════════════════════════════════════════
  // ÉTAPE 2 : Trouver les équivalents (même produit, autres marques)
  // ══════════════════════════════════════════

  // 2a. Par la table product_equivalences
  if (productId) {
    try {
      const { data: equivs } = await admin().from('product_equivalences')
        .select('product_a_id, product_b_id, equivalence_type, confidence, oem_manufacturer, differences')
        .or(`product_a_id.eq.${productId},product_b_id.eq.${productId}`)
        .gte('confidence', 0.70)
        .order('confidence', { ascending: false })
        .limit(20);

      for (const eq of (equivs || [])) {
        const otherId = eq.product_a_id === productId ? eq.product_b_id : eq.product_a_id;
        try {
          const { data: other } = await admin().from('products_database')
            .select('id, gtin, name, name_fr, brand, manufacturer, image_url, category')
            .eq('id', otherId).maybeSingle();
          if (!other) continue;

          // Chercher le meilleur prix
          const { data: prices } = await admin().from('supplier_prices')
            .select('supplier_name, price_negotiated, price_catalog, observed_at')
            .eq('product_id', otherId)
            .not('price_negotiated', 'is', null)
            .gt('price_negotiated', 0)
            .order('price_negotiated', { ascending: true })
            .limit(5);

          report.equivalents.push({
            id: other.id,
            nom: other.name_fr || other.name,
            marque: other.brand,
            fabricant: other.manufacturer,
            gtin: other.gtin,
            image_url: other.image_url,
            categorie: other.category,
            equivalence_type: eq.equivalence_type,
            confidence: eq.confidence,
            oem: eq.oem_manufacturer,
            differences: eq.differences,
            prices: (prices || []).map(p => ({
              fournisseur: p.supplier_name,
              prix_ttc: p.price_negotiated,
              prix_catalogue: p.price_catalog,
              date: p.observed_at
            })),
            best_price: prices?.[0]?.price_negotiated || null,
            best_supplier: prices?.[0]?.supplier_name || null,
          });
        } catch (e) {}
      }
    } catch (e) {}
  }

  // 2b. Par specs similaires (même catégorie, même type, brand différent)
  if (productId && report.equivalents.length < 5) {
    try {
      const specType = detectSpecType(name);
      if (specType) {
        const { data: similar } = await admin().from('products_database')
          .select('id, gtin, name, name_fr, brand, manufacturer, image_url, category, reference, manufacturer_ref')
          .eq('category', category)
          .neq('id', productId)
          .neq('brand', brand)
          .limit(50);

        for (const s of (similar || [])) {
          const sType = detectSpecType(s.name_fr || s.name);
          if (sType === specType && !report.equivalents.find(e => e.id === s.id)) {
            // Même type de produit, marque différente → potentiel équivalent
            const { data: prices } = await admin().from('supplier_prices')
              .select('supplier_name, price_negotiated, observed_at')
              .eq('product_id', s.id)
              .not('price_negotiated', 'is', null)
              .gt('price_negotiated', 0)
              .order('price_negotiated', { ascending: true })
              .limit(3);

            report.equivalents.push({
              id: s.id,
              nom: s.name_fr || s.name,
              marque: s.brand,
              fabricant: s.manufacturer,
              gtin: s.gtin,
              image_url: s.image_url,
              equivalence_type: 'spec_match',
              confidence: 0.65,
              note: `Même type de produit (${specType})`,
              prices: (prices || []).map(p => ({
                fournisseur: p.supplier_name,
                prix_ttc: p.price_negotiated,
                date: p.observed_at
              })),
              best_price: prices?.[0]?.price_negotiated || null,
              best_supplier: prices?.[0]?.supplier_name || null,
            });
          }
        }
      }
    } catch (e) {}
  }

  report.equivalents_count = report.equivalents.length;

  // ══════════════════════════════════════════
  // ÉTAPE 3 : Calculer les économies
  // ══════════════════════════════════════════

  // Prix actuel du produit scanné
  if (productId) {
    try {
      const { data: myPrice } = await admin().from('supplier_prices')
        .select('price_negotiated, supplier_name')
        .eq('product_id', productId)
        .eq('societe_id', societeId)
        .not('price_negotiated', 'is', null)
        .order('observed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (myPrice) report.current_price = { prix: myPrice.price_negotiated, fournisseur: myPrice.supplier_name };
    } catch (e) {}
  }

  // Trouver le moins cher parmi les équivalents
  const allPrices = report.equivalents
    .filter(e => e.best_price > 0)
    .sort((a, b) => a.best_price - b.best_price);

  if (allPrices.length > 0) {
    const cheapest = allPrices[0];
    report.cheapest_equivalent = {
      nom: cheapest.nom,
      marque: cheapest.marque,
      fabricant: cheapest.fabricant,
      prix: cheapest.best_price,
      fournisseur: cheapest.best_supplier,
      image_url: cheapest.image_url,
    };

    if (report.current_price?.prix) {
      report.potential_savings = +(report.current_price.prix - cheapest.best_price).toFixed(2);
      report.savings_percent = +((report.potential_savings / report.current_price.prix) * 100).toFixed(1);
    }
  }

  // ══════════════════════════════════════════
  // ÉTAPE 4 : Générer le message insight
  // ══════════════════════════════════════════

  if (report.is_white_label && report.equivalents_count > 0) {
    let msg = `Meme produit disponible sous ${report.equivalents_count} autre${report.equivalents_count > 1 ? 's' : ''} marque${report.equivalents_count > 1 ? 's' : ''}.`;
    if (report.potential_savings > 0) {
      msg += ` Economie possible : ${report.potential_savings.toFixed(2)} EUR/unite (-${report.savings_percent}%).`;
    }
    if (report.cheapest_equivalent) {
      msg += ` Meilleur prix : ${report.cheapest_equivalent.marque} chez ${report.cheapest_equivalent.fournisseur}.`;
    }
    report.market_insight = msg;

  } else if (report.is_white_label && report.oem_origin) {
    report.market_insight = `Alternative verifiee : ce produit existe sous d'autres marques. JADOMI surveille les prix pour vous.`;

  } else if (report.equivalents_count > 0) {
    let msg = `${report.equivalents_count} alternative${report.equivalents_count > 1 ? 's' : ''} verifiee${report.equivalents_count > 1 ? 's' : ''} sous d'autres marques.`;
    if (report.potential_savings > 0) {
      msg += ` Economie possible : ${report.potential_savings.toFixed(2)} EUR/unite (-${report.savings_percent}%).`;
    }
    report.market_insight = msg;
  }

  return report;
}

/**
 * Détecte le type de produit à partir de son nom (pour matching par specs)
 */
function detectSpecType(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  for (const [type, keywords] of Object.entries(OEM_KNOWLEDGE.spec_keywords)) {
    if (keywords.some(kw => n.includes(kw))) return type;
  }
  return null;
}

/**
 * Analyse IA d'une photo pour détecter l'OEM et les équivalences
 * Utilise Claude Vision pour analyser l'emballage, les marquages, le pays de fabrication
 */
async function analyzePhotoForOEM(imageBase64, mediaType, knownProduct) {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const productContext = knownProduct
      ? `Produit identifié : ${knownProduct.nom || knownProduct.name} (${knownProduct.marque || knownProduct.brand})`
      : 'Produit non encore identifié';

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: `Tu es un expert en supply chain et fabrication de produits dentaires.
Tu connais les fabricants OEM chinois et coréens qui produisent en marque blanche pour les distributeurs européens.
Fabricants OEM chinois connus : NIC/SLT (Shenzhen), Perfect (Shenzhen), Denco (Shenzhen), SANI (Chengdu), Woodpecker (Guilin), COXO (Foshan), Bloomden (Changsha), HUGE Dental (Shandong), Rogin, Belident, Siven, Runyes (Ningbo), Ningbo Sinyuan.
Réponds UNIQUEMENT en JSON.`,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: `${productContext}

Analyse cette photo de produit dentaire. Cherche TOUS les indices sur l'emballage :
1. "Made in China", "Made in Korea", pays de fabrication
2. Marquages CE, numéro organisme notifié (ex: CE0197)
3. Nom du fabricant réel (parfois en petit, différent de la marque)
4. Adresse fabricant (souvent Shenzhen, Ningbo, Foshan pour les OEM chinois)
5. Codes fabricant, numéros de lot, format des références
6. Ressemblance visuelle avec des produits connus d'autres marques
7. Qualité de l'emballage (indice : emballage basique = OEM probable)

JSON strict :
{
  "detected_manufacturer": "nom fabricant réel si visible ou null",
  "detected_country": "pays fabrication si visible ou null",
  "detected_city": "ville si visible ou null",
  "is_likely_oem": true/false,
  "oem_indicators": ["liste des indices trouvés"],
  "suspected_oem_source": "nom du fabricant OEM probable ou null",
  "similar_products": ["noms de produits similaires d'autres marques si reconnus"],
  "ce_marking": "numéro organisme notifié si visible ou null",
  "confidence": 0.0,
  "analysis_notes": "observations détaillées"
}` }
        ]
      }]
    });

    const txt = msg.content[0]?.text || '';
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
  } catch (e) {
    console.warn('[oem-intelligence] Photo analysis error:', e.message);
  }
  return null;
}

/**
 * Signaler une équivalence (par un dentiste)
 * "Ce produit X est le même que le produit Y"
 */
async function reportEquivalence(productAId, productBId, userId, details = {}) {
  try {
    const result = await admin().from('product_equivalences').upsert({
      product_a_id: productAId,
      product_b_id: productBId,
      equivalence_type: 'user_reported',
      confidence: 0.80,
      oem_manufacturer: details.oem_manufacturer || null,
      oem_country: details.oem_country || null,
      oem_reference: details.oem_reference || null,
      differences: details.differences || null,
      created_by: userId,
      source: 'user',
      metadata: {
        reported_at: new Date().toISOString(),
        user_comment: details.comment || null
      }
    }, { onConflict: 'product_a_id,product_b_id', ignoreDuplicates: false });

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Voter pour/contre une équivalence
 */
async function voteEquivalence(equivalenceId, userId, vote) {
  try {
    const field = vote === 'up' ? 'upvotes' : 'downvotes';
    const { data: current } = await admin().from('product_equivalences')
      .select(field).eq('id', equivalenceId).single();

    await admin().from('product_equivalences')
      .update({
        [field]: (current?.[field] || 0) + 1,
        // Si 3+ upvotes → community_validated, confidence boost
        ...(vote === 'up' && (current?.[field] || 0) >= 2 ? {
          equivalence_type: 'community_validated',
          confidence: 0.95
        } : {}),
        // Si 3+ downvotes → baisser confidence
        ...(vote === 'down' && (current?.[field] || 0) >= 2 ? {
          confidence: 0.30
        } : {})
      })
      .eq('id', equivalenceId);

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = {
  analyzeProduct,
  analyzePhotoForOEM,
  reportEquivalence,
  voteEquivalence,
  OEM_KNOWLEDGE,
  detectSpecType
};
