---
name: invoice-scanner
description: Scanner factures fournisseurs dentaires — OCR multi-backend, extraction lignes/prix/quantités, validation croisée
---

# Invoice Scanner — Factures Fournisseurs JADOMI

## Contexte JADOMI
- 16 fournisseurs dentaires FR (GACD, Venta, Henry Schein, DGD, DPI, MegaDental, DentalClick...)
- Factures PDF variées : tableaux, colonnes, remises, conditionnements
- Objectif : extraire chaque ligne → produit, ref, qté, prix unitaire, remise, total

## Pipeline extraction (3 niveaux)

### Niveau 1 : pdftotext (gratuit, rapide)
```js
const { exec } = require('child_process');

function extractTextFromPDF(pdfPath) {
  return new Promise((resolve, reject) => {
    exec(`pdftotext -layout "${pdfPath}" -`, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout);
    });
  });
}
```

### Niveau 2 : pdf-parse + regex structuré
```js
const pdfParse = require('pdf-parse');

async function parseLignesFacture(pdfBuffer) {
  const data = await pdfParse(pdfBuffer);
  const lines = data.text.split('\n').filter(l => l.trim());

  const lignes = [];
  const lineRegex = /^(.{20,50})\s+(\d[\d\s]*)\s+([\d,.]+)\s*€?\s+([\d,.]+)\s*€?/;

  for (const line of lines) {
    const m = line.match(lineRegex);
    if (m) {
      lignes.push({
        designation: m[1].trim(),
        quantite: parseInt(m[2].replace(/\s/g, '')),
        prix_unitaire: parseFloat(m[3].replace(',', '.')),
        total: parseFloat(m[4].replace(',', '.'))
      });
    }
  }
  return lignes;
}
```

### Niveau 3 : Vision IA (Claude/Gemini) pour factures complexes
```js
async function extractWithVision(pdfPath) {
  // Convertir PDF → images
  const sharp = require('sharp');
  // Puis envoyer à Claude Vision ou Gemini
  const prompt = `Extrais TOUTES les lignes produit de cette facture dentaire.
Pour chaque ligne, retourne un JSON :
{ "ref": "référence fournisseur", "designation": "nom produit",
  "quantite": nombre, "prix_unitaire_ht": nombre, "remise_pct": nombre,
  "total_ht": nombre, "tva": nombre }
IMPORTANT : prix en euros, virgule = décimale. Ne rien inventer.`;

  return await iaRouter.route(prompt, { task: 'invoice_scan', image: imageBase64 });
}
```

## Détection type de facture
```js
function detectFournisseur(text) {
  const patterns = [
    { fournisseur: 'GACD', pattern: /gacd|groupe\s*gacd/i },
    { fournisseur: 'Henry Schein', pattern: /henry\s*schein|hsd/i },
    { fournisseur: 'Venta', pattern: /venta|doctor\s*ai|mega\s*dental/i },
    { fournisseur: 'DGD', pattern: /dental\s*good\s*deal|dgd/i },
    { fournisseur: 'DPI', pattern: /dental\s*promotion|septaline/i },
    { fournisseur: 'DentalClick', pattern: /dentalclick|dental\s*click/i },
    { fournisseur: 'DentalEvolution', pattern: /dental\s*evolution|zendo/i },
  ];
  for (const p of patterns) {
    if (p.pattern.test(text)) return p.fournisseur;
  }
  return 'inconnu';
}
```

## Extraction références fabricant
```js
function extractRefFabricant(designation) {
  // Formats courants : "REF: 12345", "(Réf. ABC-123)", "Art. 456789"
  const patterns = [
    /(?:ref|r[ée]f|art|code)[\s.:]*([A-Z0-9][\w-]{3,20})/i,
    /\(([A-Z0-9][\w-]{4,15})\)/,
    /\b(\d{5,8})\b/ // code numérique 5-8 chiffres
  ];
  for (const p of patterns) {
    const m = designation.match(p);
    if (m) return m[1];
  }
  return null;
}
```

## Détection lignes "suivra" / reliquat
```js
function isReliquat(ligne) {
  const markers = /suivra|reliquat|en\s*attente|rupture|indisponible|back\s*order/i;
  return markers.test(ligne.designation);
  // IMPORTANT : NE PAS ajouter au stock les lignes reliquat !
}
```

## Validation croisée prix
```js
function validerPrix(ligne, produitBase) {
  if (!produitBase) return { ok: true, warning: 'produit inconnu' };
  const ecart = Math.abs(ligne.prix_unitaire_ht - produitBase.prix_reference) / produitBase.prix_reference;
  if (ecart > 0.5) return { ok: false, error: `Prix aberrant : ${ligne.prix_unitaire_ht}€ vs ref ${produitBase.prix_reference}€ (écart ${Math.round(ecart*100)}%)` };
  if (ecart > 0.2) return { ok: true, warning: `Écart prix notable : ${Math.round(ecart*100)}%` };
  return { ok: true };
}
```

## Intégration JADOMI existante
- `api/scan-dashboard.js` : dashboard scan analytics
- Table `scanned_invoices` : factures scannées
- Table `supplier_prices` : prix par fournisseur
- Endpoint `POST /api/scan/upload` : upload facture
- Endpoint `GET /api/scan/search` : recherche produit multi-fournisseurs
