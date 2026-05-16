---
name: inventory-manager
description: Gestion stock dentaire — FIFO péremption, alertes, point de commande, safety stock, prévision demande
---

# Inventory Manager — Stock Dentaire JADOMI

## Contexte
- Cabinet dentaire = 200-500 références en stock
- Produits périssables (composites, anesthésiques, colles)
- Réglementaire : traçabilité lot, péremption, rappels sanitaires
- Objectif JADOMI : zéro rupture, zéro périmé, économies max

## FIFO Péremption (critique dentaire)
```js
function alertesPeremption(stock) {
  const now = new Date();
  const alerts = { rouge: [], orange: [], vert: [] };

  for (const item of stock) {
    if (!item.date_peremption) continue;
    const expiry = new Date(item.date_peremption);
    const joursRestants = Math.ceil((expiry - now) / 86400000);

    if (joursRestants <= 0) {
      alerts.rouge.push({ ...item, statut: 'PÉRIMÉ', jours: joursRestants });
    } else if (joursRestants <= 30) {
      alerts.rouge.push({ ...item, statut: 'Urgent', jours: joursRestants });
    } else if (joursRestants <= 90) {
      alerts.orange.push({ ...item, statut: 'Attention', jours: joursRestants });
    } else {
      alerts.vert.push({ ...item, statut: 'OK', jours: joursRestants });
    }
  }
  // FIFO : suggérer d'utiliser les plus proches d'abord
  alerts.rouge.sort((a, b) => a.jours - b.jours);
  alerts.orange.sort((a, b) => a.jours - b.jours);
  return alerts;
}
```

## Point de commande automatique
```js
function calculerPointDeCommande(produit) {
  // Formule : ROP = (Demande moyenne × Délai livraison) + Stock sécurité
  const demandeJour = produit.consommation_mensuelle / 30;
  const delaiLivraison = produit.delai_fournisseur_jours || 5; // 5j par défaut dentaire
  const safetyStock = calculerSafetyStock(produit);

  const rop = Math.ceil(demandeJour * delaiLivraison + safetyStock);
  return {
    point_commande: rop,
    safety_stock: safetyStock,
    qte_optimale: calculerEOQ(produit),
    alerte: produit.quantite_actuelle <= rop
  };
}
```

## Safety Stock (Z-score)
```js
function calculerSafetyStock(produit, niveauService = 0.95) {
  // Z-score pour 95% de service = 1.65
  const zScores = { 0.90: 1.28, 0.95: 1.65, 0.98: 2.05, 0.99: 2.33 };
  const z = zScores[niveauService] || 1.65;

  const ecartTypeDemande = produit.ecart_type_consommation || (produit.consommation_mensuelle * 0.2);
  const delai = produit.delai_fournisseur_jours || 5;

  return Math.ceil(z * ecartTypeDemande * Math.sqrt(delai / 30));
}
```

## EOQ (Quantité Économique de Commande)
```js
function calculerEOQ(produit) {
  // Formule Wilson : EOQ = sqrt(2 × Demande × Coût commande / Coût stockage)
  const demandeAnnuelle = produit.consommation_mensuelle * 12;
  const coutCommande = 15; // 15€ coût administratif par commande
  const coutStockage = produit.prix_unitaire * 0.20; // 20% du prix = coût stockage annuel

  if (coutStockage <= 0) return produit.consommation_mensuelle;
  return Math.ceil(Math.sqrt(2 * demandeAnnuelle * coutCommande / coutStockage));
}
```

## Prévision de demande (moyenne mobile)
```js
function prevoir(historique, moisAVenir = 3) {
  // Moyenne mobile pondérée sur 6 mois
  const poids = [0.05, 0.10, 0.15, 0.20, 0.25, 0.25];
  const derniers6 = historique.slice(-6);

  let prevision = 0;
  for (let i = 0; i < derniers6.length; i++) {
    prevision += derniers6[i].quantite * poids[i];
  }

  // Ajustement saisonnier (été = -20% dentaire, rentrée = +15%)
  const mois = new Date().getMonth();
  const saisonnier = { 6: 0.8, 7: 0.8, 8: 0.85, 9: 1.15, 0: 1.1 };
  const coeff = saisonnier[mois] || 1.0;

  return Array.from({ length: moisAVenir }, (_, i) => ({
    mois: mois + i + 1,
    prevision: Math.round(prevision * coeff)
  }));
}
```

## Panier intelligent (génération commande auto)
```js
function genererPanierIntelligent(stock, fournisseurs) {
  const aCommander = stock
    .filter(p => p.quantite_actuelle <= calculerPointDeCommande(p).point_commande)
    .map(p => ({
      produit: p,
      qte: calculerEOQ(p),
      meilleurPrix: trouverMeilleurPrix(p, fournisseurs),
      urgence: p.quantite_actuelle === 0 ? 'RUPTURE' : 'normal'
    }));

  // Grouper par fournisseur pour optimiser les frais de port
  const parFournisseur = {};
  for (const item of aCommander) {
    const f = item.meilleurPrix.fournisseur;
    if (!parFournisseur[f]) parFournisseur[f] = { items: [], total: 0 };
    parFournisseur[f].items.push(item);
    parFournisseur[f].total += item.qte * item.meilleurPrix.prix;
  }

  return parFournisseur;
}
```

## Scan péremption (code-barres + date)
```js
// Détection date péremption depuis image/scan
function detecterPeremption(texteOCR) {
  const patterns = [
    /(?:exp|peremption|use\s*by|best\s*before)[\s:]*(\d{2})[/.-](\d{2,4})/i,
    /(\d{2})[/.](\d{2})[/.](\d{2,4})/, // JJ/MM/AAAA
    /(\d{4})[/-](\d{2})/ // AAAA-MM (format lot)
  ];
  for (const p of patterns) {
    const m = texteOCR.match(p);
    if (m) return parseDate(m);
  }
  return null;
}
```

## KPIs JADOMI Stock
| KPI | Formule | Cible |
|-----|---------|-------|
| Taux de rupture | Ruptures / Total refs | < 2% |
| Taux de périmés | Périmés / Total | < 1% |
| Rotation stock | CA / Stock moyen | > 6x/an |
| Économies YTD | Diff meilleur prix vs prix payé | 1 840€/an |
| Couverture stock | Stock / Conso mensuelle | 1-3 mois |

## Tables JADOMI
- `products_database` : catalogue 172K produits
- `stock_items` : stock par cabinet
- `supplier_prices` : prix par fournisseur
- `scanned_invoices` : factures scannées
- `stock_movements` : entrées/sorties/ajustements
