---
name: barcode-lookup
description: Scan code-barres EAN/UPC/DataMatrix dentaire — lookup produit, GUDID, EUDAMED, détection péremption lot
---

# Barcode Lookup — Scanner Produits JADOMI

## Types de codes-barres dentaires
| Type | Format | Usage |
|------|--------|-------|
| EAN-13 | 13 chiffres | Produit commercial standard |
| UPC-A | 12 chiffres | Produits US (3M, Dentsply) |
| Code 128 | Alphanumérique | Refs fabricant |
| DataMatrix | 2D carré | Dispositifs médicaux (UDI) |
| GS1-128 | Préfixes AI | Lot + péremption + ref |
| QR Code | 2D | Liens produit, docs |

## Décodage GS1-128 (le plus important en dentaire)
```js
function decodeGS1(barcode) {
  const result = {};
  let pos = 0;

  while (pos < barcode.length) {
    const ai = barcode.substring(pos, pos + 2);
    switch (ai) {
      case '01': // GTIN (14 chiffres)
        result.gtin = barcode.substring(pos + 2, pos + 16);
        pos += 16; break;
      case '10': // Numéro de lot (variable)
        const lotEnd = barcode.indexOf('\x1D', pos + 2);
        result.lot = barcode.substring(pos + 2, lotEnd > 0 ? lotEnd : pos + 22);
        pos = lotEnd > 0 ? lotEnd + 1 : pos + 22; break;
      case '17': // Date péremption AAMMJJ
        const d = barcode.substring(pos + 2, pos + 8);
        result.peremption = `20${d.substring(0,2)}-${d.substring(2,4)}-${d.substring(4,6)}`;
        pos += 8; break;
      case '21': // Numéro de série
        const serEnd = barcode.indexOf('\x1D', pos + 2);
        result.serie = barcode.substring(pos + 2, serEnd > 0 ? serEnd : pos + 22);
        pos = serEnd > 0 ? serEnd + 1 : pos + 22; break;
      default:
        pos += 2;
    }
  }
  return result;
}
```

## Lookup produit depuis code-barres
```js
async function lookupBarcode(code) {
  // 1. Chercher dans la base JADOMI (172K produits)
  const { data: local } = await supabase
    .from('products_database')
    .select('*')
    .or(`ean.eq.${code},gtin.eq.${code},ref_fabricant.eq.${code}`)
    .limit(1);

  if (local?.length) return { source: 'jadomi', produit: local[0] };

  // 2. GUDID FDA (dispositifs médicaux US)
  try {
    const gudid = await fetch(`https://accessgudid.nlm.nih.gov/api/v3/devices/lookup.json?udi=${code}`);
    if (gudid.ok) return { source: 'gudid', produit: await gudid.json() };
  } catch (e) {}

  // 3. Open EAN Database
  try {
    const ean = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`);
    if (ean.ok) {
      const data = await ean.json();
      if (data.status === 1) return { source: 'openfoodfacts', produit: data.product };
    }
  } catch (e) {}

  // 4. UPC Database
  try {
    const upc = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`);
    if (upc.ok) return { source: 'upcitemdb', produit: await upc.json() };
  } catch (e) {}

  return { source: null, produit: null };
}
```

## GUDID FDA (dispositifs médicaux)
```js
// API publique, pas de clé nécessaire
async function searchGUDID(query) {
  const res = await fetch(
    `https://accessgudid.nlm.nih.gov/api/v3/devices/search.json?search=${encodeURIComponent(query)}&pageSize=10`
  );
  const data = await res.json();
  return data.results.map(d => ({
    nom: d.brandName,
    fabricant: d.companyName,
    ref: d.catalogNumber,
    gtin: d.identifiers?.find(i => i.type === 'Primary')?.id,
    classe: d.deviceClass,
    description: d.deviceDescription
  }));
}
```

## EUDAMED (dispositifs médicaux EU)
```js
// EUDAMED n'a PAS d'API publique ouverte
// Mais on a scrapé 19K+ produits (Passe 51b)
// Recherche locale dans notre base enrichie
async function searchEUDAMED(query) {
  const { data } = await supabase
    .from('products_database')
    .select('*')
    .eq('source', 'eudamed')
    .ilike('nom', `%${query}%`)
    .limit(10);
  return data;
}
```

## Scan caméra (Web API)
```js
// Utiliser BarcodeDetector API (Chrome 83+)
async function scanCamera(videoElement) {
  if (!('BarcodeDetector' in window)) {
    // Fallback : ZXing-js ou QuaggaJS
    return fallbackScan(videoElement);
  }

  const detector = new BarcodeDetector({
    formats: ['ean_13', 'ean_8', 'upc_a', 'code_128', 'data_matrix', 'qr_code']
  });

  const barcodes = await detector.detect(videoElement);
  return barcodes.map(b => ({
    format: b.format,
    value: b.rawValue,
    bounds: b.boundingBox
  }));
}
```

## Pipeline scan JADOMI complet
```
Caméra/Photo → Détection code-barres → Décodage GS1
       ↓
  Lookup JADOMI (172K) → GUDID → EUDAMED
       ↓
  Fiche produit + Prix comparés + Stock actuel
       ↓
  Actions : Ajouter au stock / Commander / Alerter péremption
```

## Intégration JADOMI existante
- Endpoint `POST /api/scan/barcode` : decode + lookup
- Endpoint `POST /api/scan/upload` : image → OCR → extraction
- Dashboard scan : `public/admin/scan-stats.html`
- Waterfall 5 niveaux : caméra → pdftotext → regex → Vision IA → Claude
