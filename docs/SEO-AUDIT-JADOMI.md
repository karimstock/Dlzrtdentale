# Audit SEO complet -- jadomi.fr
> Date : 13 mai 2026
> Auditeur : Claude Code (expert SEO)
> Methode : Analyse source server-side + curl HTTP live

---

## Score global : 18/100

Le site jadomi.fr est actuellement **invisible pour les moteurs de recherche**.
Deux problemes bloquants annulent tout effort SEO :

1. **robots.txt interdit tout crawl** (`Disallow: /`)
2. **Toutes les pages renvoient HTTP 401** (gate middleware avec mot de passe)

Google ne peut ni decouvrir, ni indexer, ni classer aucune page.

---

## 1. Robots.txt et Crawlabilite

| Critere | Resultat | Score |
|---------|----------|-------|
| robots.txt | `User-agent: * / Disallow: /` -- **BLOQUE TOUT** | 0/10 |
| Sitemap.xml | **Inexistant** (retourne 404) | 0/10 |
| HTTP Status pages publiques | **401 Unauthorized** sur toutes les pages | 0/10 |

**Fichier actuel** (`public/robots.txt`) :
```
User-agent: *
Disallow: /
```

**Cause du 401** : Middleware "gate" dans `server.js` (ligne 202-215) bloque
toute requete HTTP sans cookie `jadomi_gate`. Seuls les assets statiques
(`.js`, `.css`, `.png`, etc.) et `/api/*` passent.

---

## 2. Meta Tags (analyse des fichiers source)

### 2.1 Homepage (`landing.html`)

| Meta | Present | Contenu |
|------|---------|---------|
| `<title>` | Oui | "JADOMI -- L'IA au service de ceux qui excellent" |
| `<meta description>` | Oui | "Plateforme IA pour professionnels d'excellence..." (139 car.) |
| `<link canonical>` | **NON** | Manquant |
| `og:title` | **NON** | Manquant |
| `og:description` | **NON** | Manquant |
| `og:image` | **NON** | Manquant |
| `og:url` | **NON** | Manquant |
| `og:type` | **NON** | Manquant |
| `twitter:card` | **NON** | Manquant |
| JSON-LD / schema.org | **NON** | Aucun schema sur aucune page du site |
| `lang` attribut | Oui | `fr` |
| `viewport` | Oui | Correct |

**Score meta homepage : 3/10**

### 2.2 Pages metier (avocats, chirurgiens-dentistes, etc.)

Les pages metier sont mieux equipees :

| Meta | Couverture |
|------|------------|
| `<title>` | 20/20 pages metier |
| `<meta description>` | 20/20 pages metier |
| `og:title/description/image/url/type` | 20/20 pages metier |
| `twitter:card` | 20/20 pages metier |
| `<link canonical>` | 20/20 pages metier |

**Score meta pages metier : 7/10** (bon, mais schema.org absent)

### 2.3 Pages sans meta description (20 pages)

- login.html, contact.html, mentions-legales.html, cgv.html, tarifs.html (partiel),
  billing.html, demo.html, register.html, organisation.html, dashboard-annonceur.html,
  wizard-societe.html, comparateur.html, jadomi-studio.html, jadomi-ads.html, et 6 autres

### 2.4 Pages sans OG tags (27 pages)

La homepage (landing.html) et toutes les pages utilitaires n'ont aucun tag Open Graph.

---

## 3. Headers de securite HTTP

| Header | Valeur | Statut |
|--------|--------|--------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | OK |
| `X-Frame-Options` | `SAMEORIGIN` | OK |
| `X-Content-Type-Options` | `nosniff` | OK |
| `X-XSS-Protection` | `1; mode=block` | OK |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | OK |
| `Content-Security-Policy` | Present et detaille | OK |
| `Permissions-Policy` | `camera=*, microphone=*, geolocation=self` | OK |
| `X-DNS-Prefetch-Control` | `off` | OK |

**Score securite : 9/10** -- Excellent. Seul point : `X-XSS-Protection`
est deprecie (les navigateurs modernes l'ignorent), mais ca ne penalise pas.

---

## 4. Schema.org / JSON-LD

**Score : 0/10** -- Aucune donnee structuree sur aucune page du site.

Schemas manquants critiques :
- `Organization` (nom, logo, contact, reseaux sociaux)
- `WebSite` (nom, URL, recherche interne)
- `SoftwareApplication` ou `WebApplication` (pour le SaaS)
- `Service` (pour chaque offre metier)
- `FAQPage` (pour les FAQ metier -- utile pour les citations IA)
- `BreadcrumbList` (navigation structuree)
- `PricingTable` / `Offer` (pour les tarifs)

---

## 5. Structure des headings

### Homepage (landing.html)

```
h1: "JADOMI. L'IA au service de ceux qui excellent." (1 seul, OK)
  h3: Stock
  h3: Comptabilite
  h3: Mailing
  h3: Studio
  h3: Ads
  h3: Reseau
  h4: Metiers (footer)
  h4: Plateforme (footer)
  h4: Ressources (footer)
```

**Probleme** : Pas de `<h2>` entre le `<h1>` et les `<h3>`. La hierarchie
saute directement de h1 a h3, ce qui est une erreur semantique.

### Pages metier

Structure correcte : h1 > h2 > h3 sur la plupart des pages.

### Pages sans H1 (6 pages)

- login.html, register.html, demo.html, import-relay.html,
  signature.html, supplier-offer.html

### Pages avec H1 multiples (2 pages)

- dashboard-annonceur.html (2 h1)
- wizard-societe.html (14 h1 !)

**Score headings : 5/10**

---

## 6. Responsive / Viewport

| Critere | Resultat |
|---------|----------|
| `<meta viewport>` | Present sur toutes les pages |
| Media queries | Present (1024px, 768px, 480px breakpoints) |
| `prefers-reduced-motion` | Oui, gere sur la landing |
| Mobile burger menu | Present |

**Score responsive : 8/10** -- Bon. Le CSS inline rend l'audit mobile plus
difficile a verifier sans rendu navigateur.

---

## 7. Images

| Critere | Resultat |
|---------|----------|
| Total images (toutes pages) | 70 balises `<img>` |
| Images avec `alt=""` (vide) | **25 images** (36%) |
| Images sans attribut `alt` | 1 image |
| `loading="lazy"` | Utilise sur les images metier (landing) |
| Formats modernes (WebP/AVIF) | **NON** -- uniquement JPG |
| Video hero | 4.8 Mo (hero-bmw.mp4) -- acceptable |

Les 25 images avec `alt=""` sont toutes dans la section "social proof"
(photos de profil des temoins). Elles devraient avoir un alt descriptif
(ex: "Photo Dr Pierre Dubois, chirurgien-dentiste Lyon").

**Score images : 4/10**

---

## 8. Canonical URLs -- Incoherences

Deux pages ont des canonical avec extension `.html` alors que le serveur
redirige les `.html` vers des URLs propres (302) :

| Page | Canonical | Probleme |
|------|-----------|----------|
| `dentistes.html` | `https://jadomi.fr/dentistes.html` | Devrait etre `/dentistes` |
| `coiffeurs.html` | `https://jadomi.fr/coiffeurs.html` | Devrait etre `/coiffeurs` |
| `prothesistes.html` | `https://jadomi.fr/prothesistes.html` | Devrait etre `/prothesistes` |

Le serveur fait un 302 de `/dentistes.html` vers `/dentistes`, mais le
canonical pointe vers l'URL avec `.html`. Google pourrait etre confus.

De plus, la **redirection est en 302** (temporaire) au lieu de **301**
(permanente). Pour le SEO, les 301 transmettent mieux le "link juice".

**Score canonical : 6/10**

---

## 9. Liens internes (landing.html)

### Liens navigation
- `/` (logo)
- `#metiers`, `#plateforme`, `#tarifs` (ancres)
- `/login` (connexion)
- `/wizard-societe.html` (CTA principal)

### Liens metier
- `/chirurgiens-dentistes`, `/orthodontistes`, `/prothesistes-dentaires`, `/avocats`
- `/professions-paramedicales`, `/btp`, `/sci`, `/createurs`, `/services-bien-etre`
- `/jadomi-ads`

### Liens footer
- `/studio/onboarding/`, `/demo`, `/contact`, `/mentions-legales`

### Liens potentiellement casses
- `/patient/` -- cette route existe-t-elle ?
- `/contact` -- la page n'a pas de meta description
- `/professions-paramedicales` -- existe-t-il une page dediee ?
- `/jadomi-ads` -- renvoie vers la page publicitaire interne

**Score liens internes : 6/10**

---

## 10. Performance

| Critere | Resultat |
|---------|----------|
| CSS inline (landing) | 55 Ko de HTML total -- tout le CSS est inline |
| Scripts | 1 seul `<script defer>` (10 lignes) -- excellent |
| Fonts | 3 polices Google Fonts (Fraunces, Inter, Syne) via `preconnect` |
| Video hero | 4.8 Mo autoplay muted (acceptable) |
| Total assets `/public/assets/` | **553 Mo** -- excessif pour un site web |
| Images WebP/AVIF | Non utilise |

**Score performance : 5/10**

---

## Synthese par categorie

| Categorie | Score | Poids | Pondere |
|-----------|-------|-------|---------|
| Crawlabilite / Indexation | 0/10 | 25% | 0.0 |
| Meta Tags (titre, desc, OG) | 5/10 | 20% | 1.0 |
| Schema / Donnees structurees | 0/10 | 10% | 0.0 |
| Headings / Structure | 5/10 | 10% | 0.5 |
| Images | 4/10 | 10% | 0.4 |
| Performance | 5/10 | 10% | 0.5 |
| Securite headers | 9/10 | 5% | 0.45 |
| Responsive | 8/10 | 5% | 0.4 |
| Canonical / URLs | 6/10 | 5% | 0.3 |
| **TOTAL** | | | **3.55/10 = 18/100** |

Note : le score est plombe par le fait que RIEN n'est crawlable/indexable.
Si le gate + robots.txt etaient corriges, le score remonterait a ~55/100.

---

## TOP 5 PROBLEMES CRITIQUES

### 1. [CRITICAL] robots.txt bloque TOUT le site
**Fichier** : `/home/ubuntu/jadomi/public/robots.txt`
**Impact** : Google, Bing, et tous les moteurs refusent de crawler le site.
Zero page indexee. Zero trafic organique possible.

### 2. [CRITICAL] Gate middleware renvoie 401 sur toutes les pages
**Fichier** : `/home/ubuntu/jadomi/server.js` (lignes 202-215)
**Impact** : Meme si Google tentait de crawler, il recevrait un 401.
Googlebot n'a pas le cookie `jadomi_gate`.

### 3. [CRITICAL] Aucun sitemap.xml
**Impact** : Google ne connait pas la structure du site, les pages
prioritaires, ni la frequence de mise a jour.

### 4. [CRITICAL] Zero donnee structuree (schema.org / JSON-LD)
**Impact** : Pas de rich snippets, pas de Knowledge Panel, pas
d'eligibilite aux featured snippets, mauvaise comprehension par les IA.

### 5. [CRITICAL] Homepage sans OG tags ni canonical
**Fichier** : `/home/ubuntu/jadomi/public/landing.html`
**Impact** : Partages sur LinkedIn, Facebook, Twitter sans apercu riche.
Pas de signal canonical pour Google.

---

## TOP 5 QUICK WINS (apres deblocage du crawl)

### 1. Corriger robots.txt (5 minutes)
Remplacer par :
```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/
Disallow: /organisation
Disallow: /dashboard-annonceur
Disallow: /sql-deploy
Disallow: /import-relay

Sitemap: https://jadomi.fr/sitemap.xml
```

### 2. Ajouter OG tags + canonical a landing.html (10 minutes)
```html
<link rel="canonical" href="https://jadomi.fr/">
<meta property="og:title" content="JADOMI -- L'IA au service de ceux qui excellent">
<meta property="og:description" content="Plateforme IA pour professionnels d'excellence. Site premium, gestion, publicite, reseau.">
<meta property="og:image" content="https://jadomi.fr/assets/og-jadomi-home.jpg">
<meta property="og:url" content="https://jadomi.fr/">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
```

### 3. Creer un sitemap.xml (15 minutes)
Generer un sitemap avec les 20+ pages metier, la homepage, tarifs,
contact, mentions legales. Soumettre via Google Search Console.

### 4. Ajouter JSON-LD Organization sur toutes les pages (15 minutes)
```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "JADOMI",
  "url": "https://jadomi.fr",
  "logo": "https://jadomi.fr/assets/logo-jadomi.png",
  "description": "Plateforme IA pour professionnels d'excellence",
  "email": "contact@jadomi.fr",
  "sameAs": []
}
```

### 5. Corriger les 25 images avec alt="" (20 minutes)
Ajouter un texte alternatif descriptif a chaque photo de la section
social proof de la landing page.

---

## PLAN D'ACTION PRIORITAIRE

### CRITICAL (a faire MAINTENANT -- jour 1)

| # | Action | Fichier(s) | Effort |
|---|--------|------------|--------|
| 1 | Ouvrir le site aux crawlers : soit whitelister les pages publiques dans le gate middleware, soit retirer le gate pour les pages de vente | `server.js` L202-215 | 30 min |
| 2 | Corriger `robots.txt` pour autoriser le crawl des pages publiques | `public/robots.txt` | 5 min |
| 3 | Creer et deployer `sitemap.xml` | Nouveau fichier + route | 30 min |
| 4 | Soumettre le site a Google Search Console | GSC | 15 min |

### HIGH (semaine 1)

| # | Action | Fichier(s) | Effort |
|---|--------|------------|--------|
| 5 | Ajouter OG tags + canonical a `landing.html` | `public/landing.html` | 10 min |
| 6 | Ajouter JSON-LD `Organization` + `WebSite` sur toutes les pages | Template commun | 30 min |
| 7 | Corriger les canonical incohérents (dentistes.html, coiffeurs.html, prothesistes.html) | 3 fichiers | 5 min |
| 8 | Passer les redirections .html de 302 a 301 | `server.js` L220 | 2 min |
| 9 | Ajouter `meta description` aux 20 pages qui en manquent | 20 fichiers | 1h |
| 10 | Corriger les 25 `alt=""` sur les images de la landing | `public/landing.html` | 20 min |

### MEDIUM (semaine 2-3)

| # | Action | Fichier(s) | Effort |
|---|--------|------------|--------|
| 11 | Ajouter JSON-LD `Service` sur chaque page metier | 20 fichiers | 2h |
| 12 | Corriger la hierarchie h1 > h2 > h3 sur la landing | `public/landing.html` | 15 min |
| 13 | Ajouter JSON-LD `FAQPage` sur les pages avec FAQ | Pages metier | 1h |
| 14 | Convertir les images JPG en WebP avec fallback | Assets | 2h |
| 15 | Ajouter un H1 aux 6 pages qui en manquent | 6 fichiers | 15 min |
| 16 | Creer une image OG dediee pour la homepage | Design | 30 min |
| 17 | Ajouter OG tags aux 27 pages qui en manquent | 27 fichiers | 1h30 |

### LOW (mois 1-2)

| # | Action | Fichier(s) | Effort |
|---|--------|------------|--------|
| 18 | Externaliser le CSS inline de la landing dans un fichier cache | CSS + HTML | 2h |
| 19 | Ajouter `BreadcrumbList` JSON-LD | Pages metier | 1h |
| 20 | Creer un fichier `llms.txt` pour l'indexation par les IA (GEO) | Nouveau fichier | 30 min |
| 21 | Ajouter `hreflang` si des versions multilingues sont prevues | HTML | 30 min |
| 22 | Optimiser le poids total des assets (553 Mo) | `/public/assets/` | 4h |
| 23 | Corriger wizard-societe.html (14 h1 -> 1 seul h1) | `wizard-societe.html` | 15 min |
| 24 | Ajouter des liens `rel="noopener noreferrer"` sur les liens externes | Toutes pages | 30 min |

---

## NOTE SUR LE GATE MIDDLEWARE

Le gate actuel bloque **tout** le site avec un mot de passe. C'est un choix
volontaire du fondateur (phase de developpement). Quand le site sera pret
pour le lancement public, il faudra :

**Option A** (recommandee) : Whitelister les pages publiques dans le gate :
```javascript
// Ajouter dans la condition de passage (ligne 205)
const PUBLIC_PAGES = ['/', '/landing', '/chirurgiens-dentistes', '/avocats',
  '/dentistes', '/orthodontistes', '/prothesistes-dentaires', '/infirmiers',
  '/tarifs', '/contact', '/mentions-legales', '/cgv', '/login', '/register',
  '/demo', '/comparateur', '/btp', '/sci', '/createurs', '/services-bien-etre',
  '/kinesitherapeutes', '/osteopathes', '/podologues', '/sages-femmes',
  '/orthophonistes', '/psychomotriciens', '/dieteticiens', '/coiffeurs',
  '/professions-paramedicales', '/jadomi-ads'];

if (PUBLIC_PAGES.includes(req.path) || req.path.match(/\.(js|css|...)$/)) {
  return next();
}
```

**Option B** : Retirer completement le gate middleware.

---

## RESUME EXECUTIF

Le site jadomi.fr a un **excellent design** et un **contenu de qualite**
sur ses pages metier (20 pages avec title, description, OG tags, canonical).
Les headers de securite sont exemplaires.

Cependant, **rien de tout cela n'est visible par Google** a cause de deux
verrous : le robots.txt qui interdit le crawl et le gate middleware qui
renvoie 401 sur toutes les pages.

**Priorite absolue** : Debloquer le crawl (actions 1-4 du plan critique).
Une fois fait, le score SEO passera immediatement de 18/100 a ~55/100.
Avec les actions HIGH et MEDIUM, il peut atteindre 75-85/100.
