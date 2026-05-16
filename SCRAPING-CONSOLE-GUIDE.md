# Guide Scraping Console — JADOMI

Méthode éprouvée pour scraper les sites fournisseurs dentaires
depuis la console navigateur (F12). Gratuit, pas de proxy, pas de blocage IP.

## Principe

1. Se connecter sur le site fournisseur avec son compte pro
2. Ouvrir la console (F12)
3. Copier le script depuis jadomi.fr/js/NOM-DU-SCRIPT.js (Ctrl+A, Ctrl+C)
4. Coller dans la console, Entrée
5. Le script tourne en fond, le titre de l'onglet affiche le compteur
6. A la fin, un fichier JSON se télécharge automatiquement
7. Aller sur jadomi.fr, console : fetch("/js/dc-import.js").then(r=>r.text()).then(t=>eval(t))
8. Sélectionner le fichier JSON → import automatique dans Supabase

## Commandes universelles

- `xxx_status()` — voir l'avancement
- `xxx_stop()` — arrêter et télécharger ce qu'on a
- `xxx_reset()` — repartir de zéro (vider le localStorage)
- Pour tuer un script qui ne répond pas : fermer l'onglet (Ctrl+W)

## Étape 1 : Détecter la structure du site

### Trouver les classes CSS des cartes produit
```js
var r=[];
document.querySelectorAll('[class]').forEach(function(el){
  var c=el.className;
  if(typeof c==='string' && /product|item|card|price|article|catalog/i.test(c)){
    r.push(el.tagName+' | '+c.substring(0,80)+' | '+(el.textContent||'').substring(0,50).replace(/\s+/g,' '));
  }
});
console.log(JSON.stringify(r.slice(0,30), null, 1));
```

### Trouver les top 50 classes CSS (sur une page de résultats)
```js
fetch('/SEARCH_URL').then(r=>r.text()).then(h=>{
  var d=new DOMParser().parseFromString(h,'text/html');
  var all=d.querySelectorAll('*');
  var classes={};
  all.forEach(function(e){
    if(e.className&&typeof e.className==='string'){
      e.className.split(/\s+/).forEach(function(c){if(c.length>3)classes[c]=(classes[c]||0)+1;});
    }
  });
  var sorted=Object.entries(classes).sort(function(a,b){return b[1]-a[1];}).slice(0,50);
  sorted.forEach(function(x){console.log(x[1]+'x '+x[0]);});
});
```

### Détecter les APIs cachées (tracking pixels, XHR)
```js
var apis=[];
performance.getEntriesByType('resource').forEach(function(r){
  if(/api|graphql|ajax|json|search|product|catalog/i.test(r.name)
    && !/png|jpg|css|js|font|svg|ico/i.test(r.name))
    apis.push(r.name);
});
console.log('APIs:', JSON.stringify(apis, null, 1));
```

### Détecter les liens produits dans onclick (sites AJAX)
```js
var oc=[];
document.querySelectorAll('[onclick]').forEach(function(e){
  var o=e.getAttribute('onclick');
  if(o.indexOf('article')>-1 || o.indexOf('Fiche')>-1 || o.indexOf('product')>-1){
    oc.push(o.substring(0,150));
  }
});
console.log(oc.length+' liens produits onclick');
console.log(oc.slice(0,10).join('\n'));
```

### Trouver les catégories
```js
var cats=[];
document.querySelectorAll('a').forEach(function(a){
  var h=a.href;
  if(h.indexOf('categorie')>-1 && h.indexOf('.html')>-1) cats.push(h);
});
var u=[...new Set(cats)];
console.log(u.length+' categories');
console.log(u.join('\n'));
```

## Scripts par fournisseur

### DentalClick (dentalclick.fr)
- **Plateforme** : Dontalia (custom)
- **Scraper** : jadomi.fr/js/dc-v4.js (produits + sous-refs basiques)
- **Scraper deep** : jadomi.fr/js/dc-v5.js (visite chaque fiche, sous-refs complètes)
- **Import** : jadomi.fr/js/dc-import.js (upload JSON depuis jadomi.fr)
- **Détection** : `.product-card`, `.product-card__name`, `.product-card__final-price-with-save`, `.product-card__regular-price`, `.product-card__grouped-item`
- **Search API** : `/products/search?q=TERME&p=PAGE&limit=100&orderBy[_score]=desc`
- **Résultats** : 6000+ produits, 20000+ sous-refs, 7500+ après import
- **Particularité** : bloque les IP datacenter (OVH/AWS), console uniquement
- **Pagination** : `?p=1`, `?p=2`, etc.
- **Sous-refs** : dans un tableau `<tr>` sur chaque fiche produit. Colonnes : Description, Ref interne (5 chiffres), Ref fabricant, Remise, Prix barré, Prix soldé

### DentalGoodDeal DENTISTE (dentalgooddeal.com)
- **Plateforme** : ptahcms (custom PHP)
- **Scraper** : jadomi.fr/js/dgd-v2.js
- **Commandes** : `dgd_status()`, `dgd_stop()`
- **Détection** : liens produits dans `onclick="location.href='...article_XXX.html'"` (PAS dans les href classiques)
- **URLs catégories** : `categorie_NOM_ID.html`, pagination `_page2.html`
- **URLs produits** : `article_NOM_REF.html` OU `?view=getHtmlFicheArticle&idGamme=XX&idArticle=YY&ref=ZZ`
- **Sous-refs** : tableau avec ref (5-7 chiffres), longueur (mm), type canal, couleur, numéro (R25/R40/F1...), prix soldé, prix barré, remise %
- **Particularité** : produits chargés en AJAX, pas dans le HTML statique des catégories
- **2 comptes séparés** : dentiste (dentalgooddeal.com) et prothésiste (prothesiste.dentalgooddeal.com)

### DentalGoodDeal PROTHESISTE (prothesiste.dentalgooddeal.com)
- **Plateforme** : même ptahcms, sous-domaine séparé
- **Scraper** : jadomi.fr/js/dgd-proto-v1.js
- **Commandes** : `dgdp_status()`, `dgdp_stop()`
- **Structure identique** au site dentiste (onclick, catégories, pagination)
- **132 catégories** (vs 304 côté dentiste)
- **Produits labo** : résines, cires, plâtres, céramiques, alliages, articulateurs, etc.
- **Compte séparé** requis (login prothésiste)

### ⚠ BUG CONNU — Parser prix DGD + DentalClick v5
Le parser de prix sur les fiches produit DGD et DentalClick v5 est FAUX :
- Tous les produits ont le même prix (2.25€ sur DGD, 1.16€ sur DC v5)
- Le parser attrape un prix parasite (footer, sidebar, produits associés)
  au lieu du vrai prix dans le tableau de sous-références
- **NE PAS IMPORTER** les fichiers DGD ou DC v5 tant que le parser
  n'est pas recalibré
- **Le v4 DentalClick (7565 produits) est FIABLE et déjà importé**
- Pour corriger : analyser le HTML d'une fiche produit DGD, trouver
  les bons sélecteurs CSS pour le tableau de prix (tr/td spécifiques),
  et filtrer les prix hors-tableau

### GACD (gacd.fr)
- **Plateforme** : Magento + Algolia
- **Scraper** : jadomi.fr/js/gacd-scraper.js (historique)
- **Méthode** : API Algolia directe (KCFXGPCHAV), pas besoin de parser HTML
- **Résultats** : 42000 produits
- **Script navigateur** : coller dans la console sur gacd.fr

### Venta Group (DoctorStrong, DoctorAI, MegaDental)
- **Plateforme** : Magento/Elasticsearch
- **Scraper VPS** : scripts/scrape-venta-api.js (tourne sur le VPS)
- **API** : `/search/ajax/suggest?q=TERME` → retourne JSON avec produits
- **Cross-codes** : code_drai, code_strong, code_mega (même produit sur 3 sites)
- **Résultats** : 38000+ produits (cross-search en cours)

### Henry Schein (dents.henryschein.fr)
- **Scraper VPS** : scripts/scrape-henryschein-api.js
- **API** : SearchAutoComplete.ashx + JSONRequestHandler.ashx
- **Méthode** : Puppeteer stealth sur le VPS

## Méthode d'import dans Supabase

### Endpoint
```
POST /api/scan/import-prices
Body: { source: "nom_fournisseur", products: [...] }
```
CORS ouvert. Chaque produit : `{ name, price, ref, price_original, brand, url }`

### Via fichier JSON (si CORS bloque)
1. Le scraper télécharge un fichier JSON automatiquement
2. Aller sur jadomi.fr
3. Console : `fetch("/js/dc-import.js").then(r=>r.text()).then(t=>eval(t))`
4. Sélectionner le fichier → import par lots de 500

## Recette pour un nouveau site

1. Se connecter au site
2. Aller sur une page qui liste des produits
3. Lancer le script de détection des classes CSS
4. Identifier : carte produit, nom, prix, prix barré, ref
5. Vérifier si les liens produits sont dans `<a href>` ou dans `onclick`
6. Adapter le template de scraper (dc-v4 pour search, dgd-v2 pour onclick)
7. Tester sur les 50 premiers produits
8. Lancer le scraping complet
9. Importer via dc-import.js

## Résumé des données scrapées (11 mai 2026)

| Fournisseur | Méthode | Produits en base |
|---|---|---|
| GACD | Algolia API | 42 000 |
| DoctorStrong/AI/Mega | Venta API (VPS) | 5 652+ (en cours) |
| DentalClick | Console v4+v5 | 7 565+ |
| DentalGoodDeal | Console v2 | 2 671+ (en cours) |
| Henry Schein | Puppeteer VPS | ~40 000 |
| DPI / Dental Promotion | PDF + sitemap | 5 279 |
| Godentaire | VPS scraper | 3 241 |
| Promodentaire | VPS | 24 |
| Dentaltix | VPS sitemap | ~1 500 |
