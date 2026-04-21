# JADOMI LABO — Module Gestion Laboratoire Prothesiste

## Vue d'ensemble

Module complet de gestion pour laboratoires de prothese dentaire :
- Facturation conforme (TVA art. 261 CGI)
- Bons de livraison avec teintes
- Declaration de conformite CE (Reglement UE 2017/745)
- Catalogue personnalise avec import IA
- Recherche cabinets dentaires (API DINUM)
- Portail dentiste

## Installation

### 1. Base de donnees (Supabase SQL Editor)

Executer dans l'ordre :
```
sql/labo/01_prothesistes.sql
sql/labo/02_catalogue.sql
sql/labo/03_imports_grilles.sql
sql/labo/04_dentistes_clients.sql
sql/labo/05_bons_livraison.sql
sql/labo/06_factures_labo.sql
sql/labo/07_declarations_conformite.sql
sql/labo/08_teintiers.sql
sql/labo/09_rls.sql
seeds/teintiers.sql
```

### 2. Storage Supabase

Creer ces buckets dans Supabase Dashboard > Storage :
- `logos-prothesistes` (public, max 2Mo, images)
- `signatures-prothesistes` (prive, PNG)
- `grilles-tarifaires` (prive, PDF/XLSX/images, 20Mo max)
- `factures-labo-pdf` (prive)
- `bl-pdf` (prive)
- `doc-pdf` (prive)

### 3. Redemarrage serveur

```bash
pm2 reload jadomi
```

## Structure des fichiers

```
routes/labo/           # Routes Express
  index.js             # Router principal + middleware auth/societe
  profil.js            # CRUD profil laboratoire
  catalogue.js         # CRUD catalogue produits
  import-grille.js     # Upload + extraction IA + matching
  dentistes.js         # CRUD dentistes clients + API DINUM
  bons-livraison.js    # CRUD BL + validation + PDF
  factures-labo.js     # Facturation groupee + envoi email
  declaration-conformite.js  # Declarations CE
  teintiers.js         # Lecture teintiers
  portail-dentiste.js  # Portail externe dentiste

services/              # Services metier
  tva-calculator.js    # Calcul TVA conforme legislation
  product-matcher.js   # Matching Jaro-Winkler
  ia-extraction.js     # Extraction IA grilles (JADOMI IA)
  pdf-generator.js     # Generation PDF (PDFKit)
  email-sender.js      # Envoi email OVH Pro
  api-entreprises.js   # API DINUM cabinets dentaires

sql/labo/              # Migrations SQL
seeds/                 # Teintiers + catalogue template
public/labo/           # Pages frontend
```

## Endpoints API

Tous prefixes `/api/labo/`, auth JWT Supabase + header `X-Societe-Id`.

### Profil
- `GET /api/labo/profil` — Profil prothesiste
- `POST /api/labo/profil` — Creer profil
- `PUT /api/labo/profil` — Modifier profil
- `POST /api/labo/profil/template-catalogue` — Installer catalogue template

### Catalogue
- `GET /api/labo/catalogue` — Liste produits
- `GET /api/labo/catalogue/categories` — Categories distinctes
- `POST /api/labo/catalogue` — Ajouter produit
- `PUT /api/labo/catalogue/:id` — Modifier produit
- `DELETE /api/labo/catalogue/:id` — Desactiver produit

### Import IA
- `POST /api/labo/import-grille/upload` — Upload + extraction
- `GET /api/labo/import-grille` — Liste imports
- `GET /api/labo/import-grille/:id` — Detail import
- `POST /api/labo/import-grille/:id/valider` — Valider import

### Dentistes
- `GET /api/labo/dentistes` — Liste dentistes
- `GET /api/labo/dentistes/recherche-cabinet` — Recherche API DINUM
- `POST /api/labo/dentistes` — Ajouter dentiste
- `PUT /api/labo/dentistes/:id` — Modifier dentiste
- `GET /api/labo/dentistes/:id` — Detail dentiste

### Bons de livraison
- `GET /api/labo/bons-livraison` — Liste BL
- `GET /api/labo/bons-livraison/:id` — Detail BL
- `POST /api/labo/bons-livraison` — Creer BL
- `PUT /api/labo/bons-livraison/:id` — Modifier BL brouillon
- `POST /api/labo/bons-livraison/:id/valider` — Valider + PDF
- `DELETE /api/labo/bons-livraison/:id` — Supprimer brouillon
- `GET /api/labo/bons-livraison/:id/pdf` — Telecharger PDF

### Factures
- `GET /api/labo/factures` — Liste factures
- `GET /api/labo/factures/a-facturer` — BL a facturer
- `POST /api/labo/factures/generer` — Generer factures
- `POST /api/labo/factures/envoyer` — Envoyer par email
- `GET /api/labo/factures/:id` — Detail facture
- `PATCH /api/labo/factures/:id/payer` — Marquer payee
- `POST /api/labo/factures/:id/avoir` — Creer avoir
- `GET /api/labo/factures/:id/pdf` — Telecharger PDF

### Declarations CE
- `GET /api/labo/declarations` — Liste declarations
- `GET /api/labo/declarations/:id/pdf` — Telecharger PDF

### Teintiers
- `GET /api/labo/teintiers` — Tous les systemes
- `GET /api/labo/teintiers/:code` — Teintes d'un systeme

## Legislation

- TVA protheses : exonere art. 261, 4, 1° CGI
- TVA ortheses : 20% (gouttieres, ODF, aligneurs)
- Declaration CE : Reglement UE 2017/745 Annexe XIII
- Tracabilite ANSM : materiaux + lots obligatoires
- RGPD : jamais de nom patient, uniquement initiales
- Numerotation sequentielle non reutilisable
- Factures emises non modifiables (correction par avoir)
