---
name: pricing-intelligence
description: Intelligence prix dentaire — comparaison 16 fournisseurs, détection anomalies, historique CamelCamelCamel, alertes prix
---

# Pricing Intelligence — Comparateur JADOMI

## Contexte
- 172K produits, 16 fournisseurs FR
- Prix catalogue vs prix remisé (contrats -38% typique)
- Objectif : montrer au dentiste où il paie trop cher → GPO JADOMI

## Comparaison multi-fournisseurs
```js
async function comparerPrix(refProduit) {
  const { data: prices } = await supabase
    .from('supplier_prices')
    .select('fournisseur, prix_ht, prix_promo, date_scrape, url')
    .eq('product_ref', refProduit)
    .order('prix_ht', { ascending: true });

  if (!prices.length) return null;

  const meilleur = prices[0];
  const pire = prices[prices.length - 1];
  const moyenne = prices.reduce((s, p) => s + p.prix_ht, 0) / prices.length;
  const economie = pire.prix_ht - meilleur.prix_ht;
  const ecartPct = Math.round((economie / pire.prix_ht) * 100);

  return {
    produit: refProduit,
    nb_fournisseurs: prices.length,
    meilleur_prix: { fournisseur: meilleur.fournisseur, prix: meilleur.prix_ht },
    pire_prix: { fournisseur: pire.fournisseur, prix: pire.prix_ht },
    prix_moyen: Math.round(moyenne * 100) / 100,
    economie_max: economie,
    ecart_pct: ecartPct,
    tous_prix: prices
  };
}
```

## Détection prix aberrants
```js
function detecterAnomalies(prix) {
  // Méthode IQR (Interquartile Range)
  const sorted = [...prix].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;

  return prix.map(p => ({
    prix: p,
    anomalie: p < lower ? 'suspicieusement_bas' : p > upper ? 'suspicieusement_haut' : null
  }));
}
```

## Historique prix (type CamelCamelCamel)
```js
async function historiquePrix(productRef, mois = 12) {
  const depuis = new Date();
  depuis.setMonth(depuis.getMonth() - mois);

  const { data } = await supabase
    .from('price_history')
    .select('fournisseur, prix_ht, date_releve')
    .eq('product_ref', productRef)
    .gte('date_releve', depuis.toISOString())
    .order('date_releve');

  // Grouper par fournisseur pour graphique multi-courbes
  const parFournisseur = {};
  for (const point of data) {
    if (!parFournisseur[point.fournisseur]) parFournisseur[point.fournisseur] = [];
    parFournisseur[point.fournisseur].push({
      date: point.date_releve,
      prix: point.prix_ht
    });
  }
  return parFournisseur;
}
```

## Alertes prix (Price Watch)
```js
async function verifierAlertePrix(userId) {
  const { data: watches } = await supabase
    .from('price_watches')
    .select('*, product:products_database(nom)')
    .eq('user_id', userId)
    .eq('active', true);

  const alertes = [];
  for (const watch of watches) {
    const actuel = await getMeilleurPrix(watch.product_ref);
    if (actuel && actuel.prix <= watch.prix_cible) {
      alertes.push({
        produit: watch.product.nom,
        prix_cible: watch.prix_cible,
        prix_actuel: actuel.prix,
        fournisseur: actuel.fournisseur,
        economie: watch.prix_reference - actuel.prix
      });
    }
  }
  return alertes;
}
```

## Score économie par cabinet
```js
function calculerEconomiesCabinet(achats, prixMarche) {
  let economiesPotentielles = 0;
  let depensesActuelles = 0;

  for (const achat of achats) {
    const meilleurMarche = prixMarche[achat.product_ref];
    if (!meilleurMarche) continue;

    depensesActuelles += achat.prix_paye * achat.quantite;
    const meilleurTotal = meilleurMarche.meilleur_prix * achat.quantite;
    economiesPotentielles += (achat.prix_paye - meilleurMarche.meilleur_prix) * achat.quantite;
  }

  return {
    depenses_actuelles: Math.round(depensesActuelles),
    economies_potentielles: Math.round(economiesPotentielles),
    pct_economie: Math.round(economiesPotentielles / depensesActuelles * 100),
    estimation_annuelle: Math.round(economiesPotentielles * 12)
  };
}
```

## Prix contrat vs catalogue
```js
// IMPORTANT : toujours capturer les DEUX prix
// Le contrat peut être -38% sur le catalogue (ex: DPI/Septaline)
function prixEffectif(prixCatalogue, remiseContrat) {
  return {
    catalogue: prixCatalogue,
    contrat: Math.round(prixCatalogue * (1 - remiseContrat / 100) * 100) / 100,
    remise_pct: remiseContrat,
    afficher: `${prixCatalogue}€ → ${Math.round(prixCatalogue * (1 - remiseContrat / 100) * 100) / 100}€ (-${remiseContrat}%)`
  };
}
```

## Benchmark anonyme inter-cabinets
```js
// Comparer les dépenses d'un cabinet vs la moyenne JADOMI
async function benchmarkCabinet(cabinetId) {
  const monPanier = await getDepensesMensuelles(cabinetId);
  const moyenneJADOMI = await getMoyenneGlobale();

  return {
    mon_panier: monPanier.total,
    moyenne_jadomi: moyenneJADOMI.total,
    position: monPanier.total < moyenneJADOMI.total ? 'en_dessous' : 'au_dessus',
    ecart: Math.round((monPanier.total - moyenneJADOMI.total) / moyenneJADOMI.total * 100)
  };
}
```

## Intégration JADOMI
- Page publique `/comparateur` (accessible sans login)
- Onglet "Comparateur prix" dans dashboard dentiste
- Onglet "Économies JADOMI" dans index.html
- API `GET /api/comparateur/search`
- API `GET /api/comparateur/product/:ref`
- Bouton "+ Panier" → GPO (au lieu de renvoyer chez le concurrent)
