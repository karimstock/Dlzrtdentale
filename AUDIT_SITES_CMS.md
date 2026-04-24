# AUDIT SITES CMS — État 24 avril 2026
> Passe 36 — Préparation construction CMS 3 formules

## 1. Stack technique

| Composant | Technologie |
|-----------|-------------|
| Backend | Node.js + Express (server.js ~3100 lignes) |
| BDD | Supabase (PostgreSQL) |
| Auth | Supabase JWT (authSupabase middleware) |
| Frontend | HTML/CSS/JS vanilla (SPA-like avec onglets) |
| Stockage | Cloudflare R2 + uploads locaux |
| Process | PM2 "jadomi" port 3001 |

## 2. Tables vitrines existantes (réutilisables)

| Table | Rôle | Pertinence CMS |
|-------|------|-----------------|
| `vitrines_sites` | Sites publiés par organisation | **CLEF** — identifie le site de chaque orga |
| `vitrines_sections` | Contenus par section (hero, services, etc.) | **CLEF** — contient déjà les textes éditables |
| `vitrines_medias` | Photos/vidéos attachées aux sites | Réutilisable pour galerie photos |
| `vitrines_themes` | 12 thèmes couleur/typographie | Réutilisable tel quel |
| `vitrines_edits` | Historique modifications (tokens IA) | Existe mais pas orienté CMS |
| `vitrines_usage_quotas` | Quotas mensuels par site | Pattern réutilisable |
| `vitrines_versions` | Snapshots du site | Réutilisable pour rollback |
| `vitrines_custom_sections` | Sections personnalisées | Utile CMS Expert |
| `dashboard_tabs` / `dashboard_widgets` | Dashboard modulable | Pattern réutilisable |

## 3. Dashboard pro existant

**Fichier principal** : `/public/organisation.html` (~53 KB)

**Sidebar actuelle** (section "Administration") :
- Vue d'ensemble (`overview`)
- Comptabilité (`compta`)
- Clients & Users (`users`)
- Messages (`messages`)
- Analytics (`analytics`)
- Secteurs (`sectors`)
- Abonnements (`plans`)
- Paramètres (`settings`)
- Accès rapide (`rapide`)
- Section dynamique "Modules" (contient "Mon site internet" si applicable)

**Système de navigation** :
- Fonction `sT(tabKey, element)` switch les `.tp` (tab panes) via class `.a`
- Chaque section = `<div class="tp" id="t-{key}">`
- Titre mis à jour via objet `tt` dans la fonction

**Module "Mon site internet"** :
- Ajouté dynamiquement dans la section "Modules" de la sidebar
- Conditionnel : seulement si la société est de type vitrine
- Lien vers le dashboard vitrine existant

## 4. Système d'auth & rôles

**Middleware** : `api/multiSocietes/middleware.js`
- `authSupabase()` — valide JWT, met `req.user`
- `requireSociete()` — vérifie rôle user sur société via `user_societe_roles`
  - Lit `X-Societe-Id` header ou `:id` param ou `body.societe_id`
  - Met `req.societe` (id, nom, type, plan, actif) et `req.userRole`

**Tables auth** :
- Supabase Auth (users avec user_metadata : profession, cabinet, prenom, nom)
- `user_societe_roles` — lie user ↔ société + rôle
- `societes` — organisations avec champ `plan` et `type`

**Notion de forfait** :
- Champ `plan` sur la table `societes` (existe déjà)
- Table `societe_modules` (Passe 33) — modules premium activés par société
- Pas encore de table dédiée "forfait Studio" → **à créer**

## 5. Routes API existantes (pour ne pas entrer en conflit)

| Préfixe | Module |
|---------|--------|
| `/api/vitrines/*` | Sites vitrines (23 sous-routes) |
| `/api/studio/*` | Hub IA créatif (12 endpoints) |
| `/api/ads/*` | Régie pub (25+ endpoints) |
| `/api/multiSocietes/*` | Gestion organisations |
| `/api/coach/*` | Onboarding |
| `/api/timeline/*` | Suivi patient |

**Route CMS sûre** : `/api/studio/cms/*` — sous-chemin du studio, cohérent avec l'architecture.

## 6. Ce qui manque pour le CMS Pro

| Besoin | État | Action |
|--------|------|--------|
| Table forfaits Studio (3 niveaux) | ❌ Absent | Créer `studio_forfaits` |
| Table abonnements orga↔forfait | ❌ Absent | Créer `studio_abonnements` |
| Contenus éditables par section | ⚠️ Partiel (vitrines_sections) | Créer `site_contenus` dédié CMS |
| Historique modifications | ⚠️ Partiel (vitrines_edits) | Créer `site_contenus_historique` |
| Gestion photos autonome | ⚠️ Partiel (vitrines_medias) | Créer `site_photos` dédié |
| Demandes modif Classic | ❌ Absent | Créer `site_demandes_modif` |
| Middleware vérif forfait | ❌ Absent | Créer dans `/api/studio/cms/` |
| Middleware vérif quotas | ❌ Absent | Créer dans `/api/studio/cms/` |
| Frontend CMS dashboard | ❌ Absent | Créer pages Pro/Expert/Classic |
| Intégration sidebar | ❌ Absent | Ajouter onglet Studio |

## 7. Recommandations d'intégration

1. **Monter CMS sous `/api/studio/cms`** — cohérent avec le module Studio existant
2. **Réutiliser `authSupabase()` + `requireSociete()`** — même pattern auth
3. **Créer un nouveau fichier `api/studio/cms.js`** — router Express dédié
4. **Ajouter dans server.js** avec le pattern try/catch existant
5. **Frontend : nouvelles pages dans `/public/studio/`** avec inclusion dans organisation.html via tab pane
6. **Utiliser le pattern modules de `societe_modules`** pour activer/désactiver les features par forfait
