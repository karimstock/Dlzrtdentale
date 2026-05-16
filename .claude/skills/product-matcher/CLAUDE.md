---
name: product-matcher
description: Cross-matching produits dentaires entre fournisseurs — fuzzy matching, normalisation, déduplication 172K refs
---

# Product Matcher — Cross-matching JADOMI

## Le problème
- 172K produits de 16 fournisseurs différents
- Même produit = noms différents selon le fournisseur
- Ex : "Composite Z350 XT A2" (GACD) vs "Z350XT shade A2 seringue" (Schein) vs "3M Z350 A2 4g" (Venta)
- Objectif : SAVOIR que c'est le même produit pour comparer les prix

## Pipeline de matching (6 équipes — Passe 78)

### 1. Normalisation
```js
function normaliserProduit(nom, fournisseur) {
  let n = nom.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // accents
    .replace(/[^a-z0-9\s.,/-]/g, ' ')
    .replace(/\s+/g, ' ').trim();

  // Supprimer les préfixes fournisseur
  n = n.replace(/^(gacd|schein|venta|dgd)\s*/i, '');

  // Normaliser conditionnements
  n = n.replace(/(\d+)\s*x\s*(\d+)/g, '$1x$2');
  n = n.replace(/(\d+)\s*(ml|g|mg|mm|cm|µm|um)/gi, '$1$2');

  // Extraire marque, gamme, conditionnement
  return {
    nom_normalise: n,
    marque: extractMarque(n),
    conditionnement: extractConditionnement(nom),
    teinte: extractTeinte(nom)
  };
}
```

### 2. Extraction marque
```js
const MARQUES_DENTAIRES = [
  '3M', 'Dentsply', 'Ivoclar', 'GC', 'Kerr', 'Septodont',
  'Acteon', 'Hu-Friedy', 'NSK', 'W&H', 'Kavo', 'Bien Air',
  'Mectron', 'EMS', 'Planmeca', 'Sirona', 'Carestream',
  'Ultradent', 'Coltene', 'Tokuyama', 'Shofu', 'Kulzer',
  'VOCO', 'SDI', 'Premier', 'Zhermack', 'Bisco'
];

function extractMarque(nom) {
  for (const m of MARQUES_DENTAIRES) {
    if (nom.toLowerCase().includes(m.toLowerCase())) return m;
  }
  return null;
}
```

### 3. Fuzzy matching (RapidFuzz / Levenshtein)
```js
function fuzzyScore(a, b) {
  // Levenshtein distance normalisée
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      matrix[i][j] = a[i-1] === b[j-1]
        ? matrix[i-1][j-1]
        : 1 + Math.min(matrix[i-1][j], matrix[i][j-1], matrix[i-1][j-1]);
    }
  }
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - matrix[a.length][b.length] / maxLen;
}
```

### 4. Score structuré multi-critères
```js
function scoreMatch(prodA, prodB) {
  let score = 0;
  let max = 0;

  // Marque identique : +40 points
  max += 40;
  if (prodA.marque && prodB.marque && prodA.marque.toLowerCase() === prodB.marque.toLowerCase()) score += 40;

  // Gamme similaire : +25 points
  max += 25;
  const gammeScore = fuzzyScore(prodA.gamme || '', prodB.gamme || '');
  score += gammeScore * 25;

  // Conditionnement identique : +20 points
  max += 20;
  if (prodA.conditionnement === prodB.conditionnement) score += 20;

  // Teinte identique : +15 points
  max += 15;
  if (prodA.teinte && prodB.teinte && prodA.teinte === prodB.teinte) score += 15;

  return { score, max, pct: Math.round(score / max * 100) };
}
```

### 5. Contrôles métier
```js
function controleMetier(match) {
  // Accessoire ≠ produit principal
  if (isAccessoire(match.prodA) !== isAccessoire(match.prodB)) return 'rejected';

  // Prix cohérent (écart < 300%)
  if (match.prixA && match.prixB) {
    const ratio = Math.max(match.prixA, match.prixB) / Math.min(match.prixA, match.prixB);
    if (ratio > 3) return 'rejected';
  }

  // Score > 75% = verified, 50-75% = probable, < 50% = rejected
  if (match.pct >= 75) return 'verified';
  if (match.pct >= 50) return 'probable';
  return 'rejected';
}
```

### 6. Ref fabricant = match certain
```js
// Si même ref fabricant → match 100% garanti
function matchParRefFabricant(refA, refB) {
  if (!refA || !refB) return false;
  return refA.replace(/[\s-]/g, '').toLowerCase() === refB.replace(/[\s-]/g, '').toLowerCase();
}
```

## Résultats Passe 78
- 2287 matches fiables sur 2588 (88.4%)
- 830 faux matches corrigés
- Scripts : `scripts/verify-matches-pipeline.js`, `scripts/recover-matches.js`

## Tables JADOMI
- `products_database` : catalogue unifié 172K produits
- `supplier_prices` : prix par fournisseur par produit
- `product_matches` : liens entre refs fournisseurs pour le même produit

## White label detection
```js
// Même produit sous marques différentes (ex: Septaline = DPI)
function detectWhiteLabel(prodA, prodB) {
  // Si specs identiques (poids, dimensions, composition) mais marques différentes
  // → probable white label
}
```
