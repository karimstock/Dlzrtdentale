# AUDIT COMPLET - MODULE SCAN & STOCK JADOMI

**Date :** 25 avril 2026
**Auteur :** Claude Code (audit automatise)
**Version :** v1.0
**Statut :** AUDIT UNIQUEMENT - Aucune modification effectuee

---

## 1. INVENTAIRE FICHIERS

### 1.1 Backend (API / Routes)

| # | Fichier | Role |
|---|---------|------|
| 1 | `routes/labo/stock.js` | **FICHIER PRINCIPAL SCAN** - CRUD stock labo + barcode lookup waterfall + scan peremption photo IA |
| 2 | `api/services/stock.js` | CRUD stock module Services (entree/sortie/ajustement) |
| 3 | `api/btp/stock.js` | CRUD stock module BTP (entree/sortie/retour/inventaire) |
| 4 | `api/multiSocietes/commerce.js` | Stock commerce multi-societes + analytics + previsions |
| 5 | `api/multiSocietes/peremption.js` | CRON alertes peremption quotidien + push notifications |
| 6 | `api/multiSocietes/factureFournImport.js` | Import factures fournisseurs scannees → stock auto |
| 7 | `api/multiSocietes/catalogue.js` | Catalogue produits avec code_barre |
| 8 | `services/ia-extraction.js` | Extraction OCR documents/images via Claude Sonnet Vision |
| 9 | `server.js` (lignes 1547, 2111-2542) | Endpoint `/api/scan/lookup` + email scan IMAP + SSE progress |

### 1.2 Frontend (Pages HTML)

| # | Fichier | Role |
|---|---------|------|
| 1 | `public/labo/stock.html` | **PAGE PRINCIPALE SCAN** - Scanner barcode, waterfall, photo peremption, alertes |
| 2 | `public/btp/stock.html` | Stock BTP avec import facture drag-drop |
| 3 | `public/services/stock.html` | Stock Services avec import facture |
| 4 | `public/showroom/stock.html` | Stock Showroom |
| 5 | `public/juridique/stock.html` | Stock Juridique |

### 1.3 SQL / Schema

| # | Fichier | Tables creees |
|---|---------|---------------|
| 1 | `sql/labo/10_stock_labo.sql` | `labo_stock`, `labo_stock_mouvements` |
| 2 | `sql/12_stock_commercial.sql` | `mouvements_stock`, `v_stock_analytics`, `enregistrer_mouvement_stock()` |
| 3 | `sql/18_alertes_peremption.sql` | `alertes_peremption` |
| 4 | `sql/20_comptes_email_scan.sql` | `comptes_email_societe` |
| 5 | `sql/multi_societes/03_commerce.sql` | `produits_societe` (colonnes stock_actuel, stock_alerte, code_barre) |
| 6 | `sql/08_catalogue_global.sql` | `produits_catalogue_global`, `prix_fournisseurs`, `historique_prix` |

### 1.4 Librairies tierces

| Librairie | Type | Source |
|-----------|------|--------|
| `jadomi-scan.js` (368 KB) | html5-qrcode bundlee | Fichier local (minifie) |
| Quagga2 | Barcode scanner | CDN jsdelivr |
| ZXing.js | Barcode detection | CDN unpkg |

### 1.5 Backups

- `backup/bak-archive-20260416/server.js.bak_scanner`
- `backup/bak-archive-20260416/server.js.bak_scan2`
- `backup/bak-archive-20260416/server.js.bak-mailscan`

---

## 2. ENDPOINTS BACKEND

### 2.1 Routes Labo Stock (`routes/labo/stock.js`)

| Methode | Route | Fonction | Table BDD |
|---------|-------|----------|-----------|
| GET | `/api/labo/stock` | Liste stock avec filtres (categorie, search, alerte, peremption) | `labo_stock` |
| GET | `/api/labo/stock/alertes` | Alertes stock bas + peremption 30/60/90j | `labo_stock` |
| GET | `/api/labo/stock/scan/:code` | **Lookup waterfall barcode** (3 niveaux) | `labo_stock` + APIs externes |
| POST | `/api/labo/stock` | Ajouter produit | `labo_stock` |
| PUT | `/api/labo/stock/:id` | Modifier produit | `labo_stock` |
| POST | `/api/labo/stock/:id/mouvement` | Mouvement stock (entree/sortie/ajustement) | `labo_stock` + `labo_stock_mouvements` |
| DELETE | `/api/labo/stock/:id` | Desactiver produit (soft delete) | `labo_stock` |
| POST | `/api/labo/stock/scan-peremption` | **Photo → date peremption via IA** | Aucune (retour direct) |

### 2.2 Routes Commerce Stock (`api/multiSocietes/commerce.js`)

| Methode | Route | Fonction | Table BDD |
|---------|-------|----------|-----------|
| GET | `/stock` | Liste stock avec analytics | `v_stock_analytics` |
| GET | `/stock/alertes` | Stock bas et ruptures | `v_stock_analytics` |
| PATCH | `/stock/:id/prix-achat` | Maj prix d'achat | `produits_societe` |
| POST | `/stock/mouvements` | Enregistrer mouvement | `mouvements_stock` (via RPC) |
| GET | `/stock/:id/mouvements` | Historique mouvements | `mouvements_stock` |
| GET | `/analytics/previsions-stock` | Previsions stock (velocite, jours restants) | `mouvements_stock` + `v_stock_analytics` |

### 2.3 Routes BTP Stock (`api/btp/stock.js`)

| Methode | Route | Fonction | Table BDD |
|---------|-------|----------|-----------|
| GET | `/stock` | Liste stock BTP | `btp_stock` |
| GET | `/stock/alertes` | Alertes seuil | `btp_stock` |
| GET | `/stock/mouvements` | Historique mouvements | `btp_stock_mouvements` |
| POST | `/stock` | Ajouter article | `btp_stock` |
| PATCH | `/stock/:id` | Modifier article | `btp_stock` |
| POST | `/stock/:id/mouvement` | Mouvement (entree/sortie/retour/inventaire) | `btp_stock` + `btp_stock_mouvements` |

### 2.4 Routes Services Stock (`api/services/stock.js`)

| Methode | Route | Fonction | Table BDD |
|---------|-------|----------|-----------|
| GET | `/stock` | Liste stock | `services_stock` |
| GET | `/stock/:id` | Detail article | `services_stock` |
| POST | `/stock` | Ajouter article | `services_stock` |
| PATCH | `/stock/:id` | Modifier article | `services_stock` |
| DELETE | `/stock/:id` | Supprimer article | `services_stock` |
| GET | `/stock/:id/mouvements` | Historique mouvements | `services_stock_mouvements` |
| POST | `/stock/:id/mouvements` | Mouvement stock | `services_stock` + `services_stock_mouvements` |
| GET | `/stock-alertes` | Alertes seuil | `services_stock` |

### 2.5 Routes Peremption (`api/multiSocietes/peremption.js`)

| Methode | Route | Fonction | Table BDD |
|---------|-------|----------|-----------|
| GET | `/summary` | Resume alertes par niveau | `alertes_peremption` |
| GET | `/summary-user` | Resume alertes cabinet legacy | `alertes_peremption` |
| POST | `/:id/traite` | Marquer alerte traitee | `alertes_peremption` |
| POST | `/scan-now` | Declencher scan manuel peremption | `produits_societe` + `produits` |

---

## 3. WORKFLOW SCAN ACTUEL

### 3.1 Workflow Barcode Scan (Labo)

```
UTILISATEUR                          FRONTEND                         BACKEND
    |                                    |                                |
    |-- Saisie code ou scan device -->   |                                |
    |                                    |-- onScanInput() debounce 400ms |
    |                                    |-- triggerScan()                |
    |                                    |                                |
    |                                    |== WATERFALL 3 NIVEAUX ========>|
    |                                    |                                |
    |                                    | NIVEAU 1: Supabase local       |
    |                                    |-- GET /api/labo/stock/scan/:code -->
    |                                    |   Backend cherche dans labo_stock    |
    |                                    |   WHERE code_barre = :code          |
    |                                    |<-- {source:'jadomi', produit, existe_stock:true}
    |                                    |   SI TROUVE → FIN                   |
    |                                    |                                     |
    |                                    | NIVEAU 2: OpenFoodFacts (FRONTEND!) |
    |                                    |-- GET openfoodfacts.org/api/v0/product/:code.json
    |                                    |   (appel direct depuis le browser)  |
    |                                    |   SI status=1 → affiche produit    |
    |                                    |   → FIN                            |
    |                                    |                                     |
    |                                    | NIVEAU 3: JADOMI IA (fake)          |
    |                                    |   setWfStep('wf-ia', 'done')        |
    |                                    |   showScanResult({code_barre, nom:'Produit '+code})
    |                                    |   → Produit generique, pas d'appel IA
    |                                    |                                     |
    |<-- Affiche resultat (card) --------|                                     |
    |                                    |                                     |
    |-- "Ajouter au stock" ---------->   |-- POST /api/labo/stock             |
    |   OU "Mouvement de stock" -------> |-- POST /api/labo/stock/:id/mouvement
```

**PROBLEME DETECTE :** Le frontend (labo/stock.html lignes 1225-1229) ne fait PAS d'appel reel a l'IA au niveau 3. Il simule juste un succes et affiche "Produit {code}". Le backend (routes/labo/stock.js lignes 106-128) a bien le code Claude Haiku, mais le frontend ne l'appelle pas via ce chemin.

### DUPLICATION DETECTEE

Le backend `routes/labo/stock.js` implemente le waterfall complet (Supabase → OpenFoodFacts → Claude Haiku) dans l'endpoint `GET /scan/:code`. MAIS le frontend reimplemente les etapes 1 et 2 cote client et ignore l'etape 3 du backend.

**Resultat :** Le waterfall backend complet avec Claude Haiku n'est jamais utilise par le frontend labo.

### 3.2 Workflow Photo Peremption

```
UTILISATEUR                          FRONTEND                         BACKEND
    |                                    |                                |
    |-- Clic "Photo → Date peremption"   |                                |
    |                                    |-- openPhotoPeremption()        |
    |                                    |   Ouvre modal camera/fichier   |
    |                                    |                                |
    |-- Prend photo OU upload fichier    |                                |
    |                                    |-- capturePhoto() ou onPhotoFileSelected()
    |                                    |   Canvas → JPEG base64 (0.85) |
    |                                    |                                |
    |                                    |-- analyzePhotoDate()           |
    |                                    |   Tente 1: FormData (file)     |
    |                                    |   Tente 2: JSON {image_base64} |
    |                                    |                                |
    |                                    |-- POST /api/labo/stock/scan-peremption -->
    |                                    |   Backend:                           |
    |                                    |   Claude Haiku Vision (base64)       |
    |                                    |   Prompt: "Lis la date de peremption"|
    |                                    |   → JSON {date_peremption, numero_lot, confidence}
    |                                    |<-- Retour date extraite              |
    |                                    |                                      |
    |<-- Date affichee (editable) -------|                                      |
    |-- Selectionne produit              |                                      |
    |-- Clic "Appliquer" -------------->  |-- PUT /api/labo/stock/:id          |
    |                                    |   {date_peremption: dateExtraite}    |
```

### 3.3 Workflow Import Facture (BTP/Services/Showroom/Juridique)

```
1. Drag-drop fichier (image/PDF) → fileToBase64()
2. POST /api/ia/extract-facture {base64, mediaType}
3. Backend: Claude Sonnet Vision → extraction grille tarifaire
4. Retour: {fournisseur, date, produits[]}
5. Affichage table pour review
6. Clic "Ajouter X articles" → batch POST /stock
```

### 3.4 Workflow CRON Peremption

```
Quotidien a 08:00 (Europe/Paris):
1. scanPeremptions() scanne produits_societe + produits (legacy)
2. Filtre: date_peremption <= aujourd'hui + 90 jours
3. Calcule jours restants → niveau (depassee/30j/60j/90j)
4. Insere alerte (UNIQUE constraint evite doublons)
5. Push notification aux proprietaires/associes
```

---

## 4. INTEGRATIONS IA

### 4.1 Claude Haiku (claude-haiku-4-5-20251001)

**Usage 1 : Identification produit par code-barres** (`routes/labo/stock.js:106-128`)
- **Declencheur :** Waterfall niveau 3 (quand Supabase + OpenFoodFacts echouent)
- **Prompt :** `Code-barres: ${code}. Identifie ce produit (domaine dentaire/medical/labo prothese). JSON strict: {"nom":"...","marque":"...","categorie":"...","fournisseur":null,"confidence":0.0}`
- **max_tokens :** 250
- **Seuil confidence :** >= 0.4 pour accepter le resultat
- **PROBLEME :** Le frontend ne passe pas par ce code (voir section 7)

**Usage 2 : Lecture date peremption par photo** (`routes/labo/stock.js:219-249`)
- **Declencheur :** Photo uploadee par l'utilisateur
- **Prompt :** `Lis la date de peremption sur ce produit. Reponds JSON strict: {"date_peremption":"YYYY-MM-DD","numero_lot":"...","confidence":0.0}. Si pas lisible, confidence=0.`
- **max_tokens :** 200
- **Input :** Image base64 (JPEG)
- **PROBLEME :** Prompt trop simple, pas de system prompt, pas de contexte

### 4.2 Claude Sonnet (claude-sonnet-4-20250514)

**Usage 1 : Extraction facture fournisseur** (`services/ia-extraction.js`)
- Extraction grilles tarifaires depuis images/PDF
- Produits, prix, categories

**Usage 2 : Analyse photos dentaires** (`api/dentiste-pro/photo-ai.js`)
- 9 types d'analyses (urgence, teinte, clinique, fabrication, etc.)
- Prompts detailles avec consignes de non-diagnostic

**Usage 3 : Analyse timeline photos** (`api/timeline/index.js`)
- Detection visage pour anonymisation
- Generation notes cliniques

### 4.3 APIs Externes (Non-IA)

| API | Usage | Fichier |
|-----|-------|---------|
| OpenFoodFacts | Lookup produit par EAN | `routes/labo/stock.js` (backend) + `public/labo/stock.html` (frontend) |
| OpenBeautyFacts | Mentionne dans l'UI mais meme base | Frontend waterfall label |

### 4.4 APIs NON utilisees

- **Mindee** : Non integre
- **Google Cloud Vision** : Non integre
- **OpenAI** : Non integre

---

## 5. STRUCTURE BDD

### 5.1 Table `labo_stock` (Stock Labo - principale pour le scan)

```sql
CREATE TABLE labo_stock (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id  uuid REFERENCES labo_prothesistes(id),
  nom             text NOT NULL,
  categorie       text,
  sous_categorie  text,
  marque          text,
  fournisseur     text,
  reference_fournisseur text,
  code_barre      text,                    -- Code EAN/barcode
  type_code       text,                    -- Type de code (EAN-13, QR, etc.)
  quantite        decimal DEFAULT 0,
  unite           text DEFAULT 'unite',
  seuil_alerte    decimal DEFAULT 1,
  prix_unitaire   decimal,
  prix_fournisseur_2 decimal,
  fournisseur_2   text,
  prix_fournisseur_3 decimal,
  fournisseur_3   text,
  date_peremption date,                    -- Date d'expiration
  numero_lot      text,                    -- Numero de lot
  image_url       text,
  notes           text,
  est_actif       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- INDEX
idx_labo_stock_code (code_barre)
idx_labo_stock_peremption (date_peremption WHERE NOT NULL)
idx_labo_stock_recherche (GIN full-text sur nom+marque+fournisseur)
```

### 5.2 Table `labo_stock_mouvements`

```sql
CREATE TABLE labo_stock_mouvements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id        uuid REFERENCES labo_stock(id),
  type_mouvement  text CHECK (type_mouvement IN ('entree','sortie','ajustement')),
  quantite        decimal NOT NULL,
  motif           text,
  bl_id           uuid,                    -- Bon de livraison lie
  created_at      timestamptz DEFAULT now()
);
```

### 5.3 Table `produits_societe` (Commerce multi-societes)

```sql
-- Colonnes cles pour le stock :
stock_reel       integer DEFAULT 0,
stock_reserve    integer DEFAULT 0,
stock_alerte     integer DEFAULT 0,
code_barre       text,
date_peremption  date,
source           text CHECK (source IN ('manuel','csv','wordpress','api','scan','barcode')),
prix_achat_ht    numeric(12,2)
```

### 5.4 Table `mouvements_stock` (Commerce)

```sql
CREATE TABLE mouvements_stock (
  id              uuid PRIMARY KEY,
  societe_id      uuid NOT NULL,
  produit_id      uuid NOT NULL,
  type            text CHECK (type IN ('entree','sortie','vente','retour','ajustement','inventaire','import_initial')),
  quantite        integer,                 -- Signe : negatif = sortie
  stock_avant     integer,
  stock_apres     integer,
  reference_doc   text,
  reference_doc_id uuid,
  note            text,
  user_id         uuid,
  created_at      timestamptz
);

-- Fonction atomique :
enregistrer_mouvement_stock() -- SELECT FOR UPDATE + INSERT + UPDATE
```

### 5.5 Table `alertes_peremption`

```sql
CREATE TABLE alertes_peremption (
  id              uuid PRIMARY KEY,
  societe_id      uuid,
  user_id         uuid,
  produit_id      uuid,
  produit_kind    text CHECK (produit_kind IN ('societe','cabinet')),
  designation     text,
  reference       text,
  date_peremption date NOT NULL,
  niveau          text CHECK (niveau IN ('90j','60j','30j','depassee')),
  jours_restants  integer,
  traite          boolean DEFAULT false,
  traite_at       timestamptz,
  created_at      timestamptz
);

-- UNIQUE (produit_id, niveau) -- evite doublons
```

### 5.6 Relations entre tables

```
produits_societe ──1:N──> mouvements_stock
produits_societe ──1:N──> alertes_peremption
produits_societe ──N:1──> produits_catalogue_global (via code_barre/EAN)
produits_societe ──1:N──> prix_fournisseurs → historique_prix

labo_stock ──1:N──> labo_stock_mouvements

btp_stock ──1:N──> btp_stock_mouvements

comptes_email_societe ──1:N──> factures_fournisseurs_societe
factures_fournisseurs_societe ──> mouvements_stock (via import auto)
```

---

## 6. UX FRONTEND

### 6.1 Scan Barcode (Labo)

| Etape | Description | Feedback |
|-------|-------------|----------|
| Saisie | Input texte avec auto-detect a 8+ caracteres | Debounce 400ms |
| Camera | Bouton camera → `getUserMedia` face arriere | Toast si camera indisponible |
| Waterfall | 3 etapes visuelles avec spinner/checkmark/cross | `setWfStep()` avec animations |
| Resultat trouve | Card bleue "En stock" avec details | Boutons: Mouvement / Modifier |
| Nouveau produit | Card ambre "Nouveau produit" | Bouton: Ajouter au stock |

### 6.2 Photo Peremption (Labo)

| Etape | Description | Feedback |
|-------|-------------|----------|
| Declenchement | Bouton "Photo → Date peremption" dans onglet alertes | Modal camera/upload |
| Capture | Camera arriere OU upload fichier | Apercu image dans modal |
| Analyse | Envoi base64 a l'API | Toast "Analyse par JADOMI IA..." |
| Resultat | Date extraite dans input editable | Selecteur produit + bouton Appliquer |
| Validation | L'utilisateur selectionne le produit et applique | PUT /api/labo/stock/:id |

### 6.3 Import Facture (Tous modules)

| Etape | Description | Feedback |
|-------|-------------|----------|
| Upload | Drag-drop ou clic sur zone d'import | Zone highlight |
| Extraction | Envoi a l'IA pour OCR | Spinner "Analyse..." |
| Review | Table avec fournisseur, date, produits | Bouton "Ajouter X articles" |
| Import | Batch insert produits | Toast "X articles ajoutes" |

### 6.4 Confidence Score

- **Backend barcode IA :** Seuil >= 0.4 pour accepter (routes/labo/stock.js:123)
- **Backend peremption :** Confidence dans le retour mais **NON UTILISE** cote frontend
- **Frontend :** AUCUN confidence score affiche a l'utilisateur

### 6.5 Correction d'erreur

- **Scan barcode :** Resultat pre-remplit le formulaire → l'utilisateur peut editer chaque champ avant validation
- **Photo peremption :** Date dans un input editable → l'utilisateur peut corriger
- **Import facture :** Table de review avant insertion
- **Pas de mode "historique de corrections"** ni de "undo"

---

## 7. POINTS FAIBLES IDENTIFIES

### 7.1 BUG : Date peremption pas captee correctement

**Cause racine identifiee :**

1. **Prompt trop basique** (`routes/labo/stock.js:235`) :
   ```
   Lis la date de peremption sur ce produit. Reponds JSON strict:
   {"date_peremption":"YYYY-MM-DD","numero_lot":"...","confidence":0.0}.
   Si pas lisible, confidence=0.
   ```
   - Pas de system prompt pour contextualiser
   - Pas d'instructions sur les formats de date courants (MM/YY, MM/YYYY, JJ/MM/AAAA, etc.)
   - Pas d'indication que c'est un produit dentaire/medical
   - Pas de consigne sur ou chercher la date sur l'emballage

2. **Modele utilise : Claude Haiku** - Le moins capable pour la vision. Claude Sonnet serait bien meilleur pour cette tache OCR.

3. **max_tokens: 200** - Suffisant pour le JSON mais ne laisse pas de marge pour le raisonnement

4. **Pas de validation de la confidence** cote frontend - Meme si confidence = 0.1, la date est affichee

5. **Qualite image potentiellement basse** :
   - Compression JPEG 0.85 (canvas.toDataURL('image/jpeg', 0.85))
   - Pas de pre-traitement (recadrage, contraste, rotation)
   - Pas de guide de cadrage pour l'utilisateur

6. **Pas de gestion des formats ambigus** : 05/26 pourrait etre Mai 2026 ou 5 jours/26eme mois

### 7.2 BUG : Reconnaissance photo "marche mal"

**Causes identifiees :**

1. **Le frontend N'UTILISE PAS le waterfall backend complet** :
   - Le backend (`routes/labo/stock.js:73-133`) implemente un waterfall Supabase → OpenFoodFacts → Claude Haiku IA
   - Le frontend (`public/labo/stock.html:1175-1229`) reimplemente les 2 premieres etapes COTE CLIENT
   - **L'etape 3 (Claude Haiku IA) est SIMULEE** au frontend : elle affiche juste "Produit {code}" sans appeler l'IA
   - Donc si Supabase et OpenFoodFacts echouent, l'utilisateur obtient un produit generique sans nom reel

2. **Pas de decodage barcode dans le navigateur** :
   - Les librairies Quagga2, ZXing, html5-qrcode sont chargees dans `index.html` et `jadomi-scan.js` mais **NON UTILISEES** dans `labo/stock.html`
   - L'input scan depend du scanner physique (pistolet USB) ou de la saisie manuelle
   - La camera ouvre juste un flux video SANS decodage du barcode visible

3. **OpenFoodFacts est une base alimentaire** : Pour les produits dentaires/medicaux, cette API retourne rarement des resultats

4. **Pas de feedback IA reel** : L'utilisateur pense que l'IA analyse mais c'est un faux positif visuel

### 7.3 BUG : Workflow pas parfait

**Problemes identifies :**

1. **Double implementation du waterfall** (backend ET frontend) avec des comportements differents :
   - Backend : 3 vrais niveaux avec IA
   - Frontend : 2 niveaux reels + 1 faux niveau

2. **Pas de liaison entre scan barcode et photo peremption** :
   - L'utilisateur doit scanner le barcode, ajouter le produit, PUIS aller dans l'onglet alertes, PUIS cliquer photo peremption
   - Pas de workflow integre "scan barcode + photo peremption" en une seule etape

3. **Camera sans decodage** :
   - Le bouton camera ouvre la camera mais ne decode rien
   - L'utilisateur doit utiliser un scanner physique externe

4. **Sleeps artificiels dans le waterfall frontend** :
   - `await sleep(400)` avant step 1
   - `await sleep(600)` avant step 2
   - `await sleep(800)` avant step 3
   - Total : 1.8s de delai artificiel qui ralentit l'UX

5. **Pas de mode hors-ligne / cache local** :
   - Chaque scan fait un appel API
   - Pas de cache des produits deja scannes

6. **FormData vs JSON incohérent** (`public/labo/stock.html:1404-1434`) :
   - La fonction `analyzePhotoDate()` tente d'abord FormData (multipart) puis fallback JSON base64
   - Le backend attend uniquement `image_base64` en JSON
   - Le premier appel FormData echoue systematiquement → delai supplementaire

---

## 8. RECOMMANDATIONS

### Priorite 1 : CRITIQUE (Bugs fonctionnels)

**R1. Unifier le waterfall barcode**
- Supprimer la reimplementation frontend du waterfall
- Utiliser uniquement l'endpoint backend `GET /api/labo/stock/scan/:code` qui implemente les 3 niveaux correctement
- Le frontend ne devrait faire qu'un seul appel API et afficher le resultat

**R2. Upgrader le modele IA pour la peremption**
- Passer de Claude Haiku a Claude Sonnet pour `scan-peremption`
- Ajouter un system prompt detaille avec contexte medical/dentaire
- Lister les formats de date courants (MM/YY, MM/YYYY, JJ/MM/AAAA, EXP:, USE BY:)
- Augmenter max_tokens a 500 pour laisser le modele raisonner

**R3. Utiliser le confidence score**
- Si confidence < 0.5 → afficher un warning et demander verification manuelle
- Si confidence < 0.3 → ne pas pre-remplir la date, demander une meilleure photo
- Afficher le score de confidence a l'utilisateur

### Priorite 2 : IMPORTANTE (Ameliorations UX)

**R4. Activer le decodage barcode dans le navigateur**
- Utiliser ZXing.js ou html5-qrcode (deja chargees) pour decoder depuis la camera
- Supprimer les sleeps artificiels du waterfall (1.8s de delai inutile)

**R5. Integrer scan barcode + photo peremption**
- Apres un scan barcode reussi, proposer directement "Ajouter la date de peremption par photo"
- Workflow en 1 ecran : code-barres → details produit → photo date → confirmation

**R6. Corriger le bug FormData/JSON**
- Le backend `scan-peremption` attend `image_base64` en JSON
- Supprimer la tentative FormData dans `analyzePhotoDate()` qui echoue toujours

### Priorite 3 : OPTIMISATIONS

**R7. Ameliorer le prompt peremption**
```
System: Tu es un assistant specialise dans la lecture de dates de peremption 
sur des emballages de produits dentaires, medicaux et de laboratoire.

User: Analyse cette photo d'emballage. Cherche :
1. La date de peremption (souvent marquee EXP, USE BY, Peremption, ou un 
   pictogramme sablier)
2. Le numero de lot (LOT, Batch, No.)
3. Le format peut etre : MM/YY, MM/YYYY, YYYY-MM-DD, JJ/MM/AAAA, AAAA-MM

Reponds en JSON strict :
{"date_peremption":"YYYY-MM-DD","numero_lot":"...","confidence":0.0-1.0,
 "format_detecte":"...", "zone_image":"description de ou tu as lu"}
```

**R8. Pre-traitement image**
- Augmenter la resolution de capture (actuellement limitee par le canvas)
- Ajouter un guide de cadrage (overlay SVG "Cadrez la date de peremption")
- Compression JPEG 0.92 au lieu de 0.85

**R9. Cache local des scans**
- Stocker les derniers produits scannes en localStorage
- Eviter les appels API pour les re-scans frequents

**R10. Analytics de scan**
- Logger les taux de reussite par niveau waterfall
- Identifier quels produits echouent systematiquement
- Mesurer le taux de correction manuelle post-IA

---

## RESUME EXECUTIF

| Aspect | Etat | Note |
|--------|------|------|
| Architecture backend | Solide | 4 modules stock separes, bien structures |
| Waterfall barcode | CASSE | Frontend simule l'etape IA, ne l'appelle pas |
| Photo peremption | Faible | Prompt basique + modele Haiku insuffisant |
| Detection barcode camera | Non fonctionnel | Librairies chargees mais non utilisees |
| Alertes peremption | Fonctionnel | CRON quotidien + push notifications OK |
| Import facture IA | Fonctionnel | Claude Sonnet Vision, workflow solide |
| UX globale | Correcte | Feedback visuel present, correction manuelle OK |
| Confidence score | Non exploite | Calcule mais jamais affiche |
| Schema BDD | Complet | Tables bien indexees, RLS active |

**Verdict global :** Le module scan/stock a une bonne fondation backend mais souffre de 3 problemes majeurs au niveau de l'integration frontend-backend : (1) le waterfall IA n'est pas connecte, (2) le decodage camera n'est pas active, (3) le prompt peremption est trop basique. Ces 3 points expliquent les retours de Karim sur "ca marche mal".
