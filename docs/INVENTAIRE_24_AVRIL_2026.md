# Inventaire JADOMI — 24 avril 2026 (fin de journee)

## 1. Pages publiques (107 fichiers HTML)

### Landing pages metiers (9)
| URL | Fichier | Statut |
|-----|---------|--------|
| `/` | `public/landing.html` (42 KB) | Active en prod (route /) |
| `/index-v2` | `public/index-v2.html` (41 KB) | Preview, pas en prod |
| `/index-v3` | `public/index-v3.html` (38 KB) | Preview Awwwards, pas en prod |
| `/chirurgiens-dentistes` | `public/chirurgiens-dentistes.html` | Active |
| `/orthodontistes` | `public/orthodontistes.html` | Active |
| `/prothesistes-dentaires` | `public/prothesistes-dentaires.html` | Active |
| `/avocats` | `public/avocats.html` | Active |
| `/professions-paramedicales` | `public/professions-paramedicales.html` | Active |
| `/services-bien-etre` | `public/services-bien-etre.html` | Active |
| `/btp` | `public/btp.html` | Active |
| `/sci` | `public/sci.html` | Active |
| `/createurs` | `public/createurs.html` | Active |

### Dashboards principaux (4)
| URL | Fichier | Taille | Utilisateur |
|-----|---------|--------|-------------|
| `/index.html` | `index.html` | 431 KB | Dentistes (dashboard stock) |
| `/organisation.html` | `public/organisation.html` | ~53 KB | Admin multi-societes |
| `/dashboard-annonceur` | `public/dashboard-annonceur.html` | ~161 KB | Annonceurs JADOMI Ads |
| `/jadomi-studio` | `public/jadomi-studio.html` | ~26 KB | Landing Studio creatif |

### Module Vitrines (16 pages) — SYSTEME ORIGINAL
| URL | Fichier | Fonction |
|-----|---------|----------|
| `/public/vitrines/onboarding.html` | Onboarding v1 | Creation site par chatbot (ORIGINAL) |
| `/public/vitrines/onboarding-v2.html` | Onboarding v2 | Creation immersive carousel |
| `/public/vitrines/site-builder.html` | Site builder | Construction site par chatbot IA |
| `/public/vitrines/import-site.html` | Import site | Analyse site existant + import |
| `/public/vitrines/import-assets.html` | Import assets | Selection medias importes |
| `/public/vitrines/upload-media.html` | Upload medias | Upload manuel drag-drop |
| `/public/vitrines/mon-site.html` | Dashboard vitrine v1 | Gestion site |
| `/public/vitrines/mon-site-v2.html` | Dashboard vitrine v2 | Gestion site version 2 |
| `/public/vitrines/dashboard.html` | Dashboard modulable | Tabs + widgets |
| `/public/vitrines/edit.html` | Editeur sections | Edition contenu site |
| `/public/vitrines/preview.html` | Preview | Apercu avant publication |
| `/public/vitrines/photos-tinder.html` | Tinder photos | Selection photos IA style tinder |
| `/public/vitrines/mes-infos.html` | Infos cabinet | Edition informations |
| `/public/vitrines/parametres.html` | Parametres | Config site |
| `/public/vitrines/aide.html` | Aide | Centre d'aide |
| `/public/vitrines/timelines.html` | Timelines | Before/after patient |

### Module Studio (6 pages) — SYSTEME PASSE 36-38
| URL | Fichier | Fonction |
|-----|---------|----------|
| `/studio/cms/` | `public/studio/cms/index.html` | Dashboard CMS 3 formules |
| `/studio/onboarding/` | `public/studio/onboarding/index.html` | Scanner URL + choix formule |
| `/studio/mon-site/` | `public/studio/mon-site/index.html` | Cockpit mon site (Passe 38) |
| `/studio/mon-site/creer` | `public/studio/mon-site/creer.html` | Wizard creation 6 etapes |
| `/studio/sites-existants/` | `public/studio/sites-existants/index.html` | Liste sites existants |
| `/studio/mes-sites/` | `public/studio/mes-sites/index.html` | Dashboard actions IA |

### Sites demo (3)
| URL | Formule | Source |
|-----|---------|--------|
| `/demo/classic` | Classic | Theme dental_clean |
| `/demo/pro` | Pro | Site original Stitch Karim |
| `/demo/expert` | Expert | Site original Stitch Karim |

### Modules metiers BTP (9), Juridique (6), Services (9), Showroom (10), Labo (9)
Tous actifs dans leurs sous-dossiers respectifs.

### Autres pages actives
`/tarifs.html`, `/login.html`, `/demo.html`, `/admin-email.html`,
`/supplier-offer.html`, `/public/site/index.html` (site public vitrine),
`/booking/index.html`, `/visio/index.html`, `/conformite/index.html`

---

## 2. API endpoints (~150 endpoints dans 120 fichiers JS)

### Module principal (server.js — 3100+ lignes)
Routes inline : auth, claude, factures, eco, predict, stripe, contrats,
documents, suggestions, mail, compta, tva, yahoo, releves bancaires.

### Modules montes
| Prefixe | Module | Fichiers | Passe |
|---------|--------|----------|-------|
| `/api/multiSocietes/*` | Multi-societes | 20 fichiers | 1-13 |
| `/api/vitrines/*` | Sites vitrines | 23 fichiers | 14-33 |
| `/api/gpo/*` | GPO Smart Queue | 5 fichiers | 20 |
| `/api/groupage/*` | Groupage regional | 4 fichiers | 22 |
| `/api/logistics/*` | Logistique | 4 fichiers | 22 |
| `/api/btp/*` | Artisan BTP | 11 fichiers | - |
| `/api/juridique/*` | Juridique | 10 fichiers | - |
| `/api/services/*` | Services | 12 fichiers | - |
| `/api/showroom/*` | Showroom createurs | 10 fichiers | - |
| `/api/network/*` | Annuaire + Deals | 5 fichiers | - |
| `/api/ads/*` | Regie pub | 1 fichier | 34 |
| `/api/studio/*` (original) | Hub IA creatif | 3 fichiers | 34-35 |
| `/api/studio/cms/*` | CMS 3 formules | 1 fichier | 36 |
| `/api/studio/analyse/*` | Scanner URL | 1 fichier | 36 |
| `/api/studio/sites-existants/*` | Acces FTP/SSH | 1 fichier | 37 |
| `/api/studio/interventions/*` | IA auto modifs | 1 fichier | 38 |
| `/api/studio/sites-jadomi/*` | Creation sites | 1 fichier | 38 |
| `/api/site-analysis/*` | Import site existant | 1 fichier | 33 |
| `/api/coach/*` | Onboarding coach | 1 fichier | 25 |
| `/api/timeline/*` | Timeline patient | 1 fichier | 30 |
| `/api/client-portal/*` | Portail client | 1 fichier | 24 |
| `/api/appointments/*` | RDV en ligne | 1 fichier | 24 |
| `/api/media/*` | Upload medias | 1 fichier | 33 |

---

## 3. Base de donnees (89 tables confirmees)

### Par module
| Module | Tables | Cle |
|--------|--------|-----|
| Core | societes, user_societe_roles, notifications | 3 |
| Vitrines | vitrines_sites/sections/medias/conversations/versions/competitors/analytics/edits/quotas/contact_requests/reanalyze_jobs/custom_sections/themes | 13 |
| Dashboard | dashboard_tabs/widgets/ia_conversations | 3 |
| Onboarding | onboarding_sessions, user_onboarding_state | 2 |
| Upsell | upsell_suggestions/interactions | 2 |
| GPO | suppliers/subscriptions, gpo_requests/attempts, market/target_prices, ratings, client_history | 8 |
| Logistique | supplier_warehouses, transport_rates, group_purchase_campaigns/items, shipping_labels | 5 |
| Chatbot | vitrine_chatbot_configs/conversations | 2 |
| Client Portal | client_accounts/dossiers/documents/messages | 4 |
| RDV | appointment_types/slots/appointments/settings | 4 |
| Timeline | treatment_timelines/steps/photos | 3 |
| Site Analysis (P33) | site_analyses, analyzed_pages, imported_assets | 3 |
| Ads | ad_campaigns/creatives/impressions/clicks/conversions, advertiser_wallets/subscriptions, audience_segments, ad_templates/media_library | 10 |
| Studio IA | ai_generations_log, studio_library, studio_rate_limits | 3 |
| Coins | user_coins_wallet, coins_transactions, features_pricing, coins_packs/quests, user_quest_progress | 6 |
| Studio CMS (P36) | studio_forfaits, studio_abonnements, site_contenus/historique, site_photos, site_demandes_modif | 6 |
| Studio Prix (P37) | studio_paiements_creation, site_modifications_ponctuelles | 2 |
| Sites Existants (P37-38) | sites_existants, sites_existants_credentials/interventions/backups, interventions_actions_predefinies | 5 |
| Sites Jadomi (P38) | sites_jadomi, themes_sites, sites_jadomi_sections/versions/suggestions_ia | 5 |
| Societe Modules | societe_modules | 1 |

---

## 4. Wizards / Chatbots existants (7 systemes)

### CHATBOT CREATION SITE (ORIGINAL — Passes 14-33)
- **Fichier** : `/api/vitrines/chat.js` + `/public/vitrines/site-builder.html`
- **Fonction** : Creation de site web par conversation chatbot IA
  Le pro discute avec l'IA, qui construit le site etape par etape
- **Frontend** : `/public/vitrines/onboarding.html` (v1) + `onboarding-v2.html` (v2)
- **API** : POST `/api/vitrines/chat` (streaming SSE), GET `/api/vitrines/chat/init`
- **Tables** : vitrines_sites, vitrines_sections, vitrines_conversations
- **Statut** : EXISTANT ET FONCTIONNEL (20+ professions supportees)
- **DOUBLON AVEC** : Studio Mon Site (Passe 38)

### CHATBOT PUBLIC WIDGET (Passe 24)
- **Fichier** : `/api/vitrines/chatbot-public.js` + `/public/vitrines/chatbot-widget.js`
- **Fonction** : Widget chatbot injectable sur les sites publies des pros
- **Tables** : vitrine_chatbot_configs, vitrine_chatbot_conversations
- **Statut** : Actif

### ONBOARDING v2 IMMERSIF (Passe 18)
- **Fichier** : `/public/vitrines/onboarding-v2.html` + `onboarding-v2.js` + `onboarding-v2.css`
- **Fonction** : Carousel 12 themes, chatbot vouvoiement, preview live
- **Statut** : Actif, lie au module vitrines

### WIZARD SOCIETE (standalone)
- **Fichier** : `wizard-societe.html` (dans la racine)
- **Fonction** : Creation d'une nouvelle societe/cabinet (etapes profession, specialites, recap)
- **Statut** : Actif

### SCANNER URL STUDIO (Passe 36)
- **Fichier** : `/public/studio/onboarding/index.html`
- **API** : `/api/studio/analyse/scan`
- **Fonction** : Analyse URL existante → recommandation reconstruire/ameliorer/refuser
- **DOUBLON AVEC** : Import Site (Passe 33)

### WIZARD CREATION SITE STUDIO (Passe 38)
- **Fichier** : `/public/studio/mon-site/creer.html`
- **API** : `/api/studio/sites-jadomi/creer`
- **Fonction** : Wizard 6 etapes (metier, theme, infos, services, recap, succes)
- **DOUBLON AVEC** : Chatbot Creation Site (Vitrines)

### IMPORT SITE EXISTANT (Passe 33)
- **Fichier** : `/public/vitrines/import-site.html`
- **API** : `/api/site-analysis/start`
- **Fonction** : Scrape un site existant + audit design/securite/SEO
- **Bug connu** : polling infini (partiellement fixe)
- **DOUBLON AVEC** : Scanner URL Studio (Passe 36)

---

## 5. Features Studio — vue d'ensemble

| Feature | Frontend | Backend | Tables | Statut |
|---------|----------|---------|--------|--------|
| 3 Forfaits (Classic/Pro/Expert) | CMS index.html | cms/index.js | studio_forfaits, studio_abonnements | Active |
| Scanner URL | onboarding/index.html | analyse/index.js | site_analyses | Active |
| Modifications ponctuelles (49 EUR) | CMS index.html | cms/index.js | site_modifications_ponctuelles | Active |
| Acces sites existants (FTP/SSH) | sites-existants/index.html | sites-existants/index.js | sites_existants, credentials | Active |
| Interventions IA auto | mes-sites/index.html | interventions/index.js | interventions, backups | Active |
| Creation site JADOMI | mon-site/creer.html | sites-jadomi/index.js | sites_jadomi, sections, versions | Active |
| 60 themes CSS | templates/themes/ | site-generator.js | themes_sites | Active |
| IA Assistant (suggestions) | mon-site/index.html | ia-assistant.js | suggestions_ia | Active |
| Moteur generation | — | site-generator.js | — | Active |
| Routage /sites/:slug | — | server.js | — | Active |

---

## 6. Homepages (4 versions)

| Fichier | Taille | Style | Statut | Recommandation |
|---------|--------|-------|--------|----------------|
| `landing.html` | 42 KB | Passe 26 cinematique | **EN PROD** sur / | Remplacer par v3 |
| `index-v2.html` | 41 KB | Editorial Minimalism | Preview /index-v2 | SUPPRIMER (depasse par v3) |
| `index-v3.html` | 38 KB | Awwwards cinematic | Preview /index-v3 | METTRE EN PROD apres validation |
| `index.html` | 431 KB | Dashboard dentiste stock | EN PROD /index.html | GARDER (c'est le dashboard, pas une homepage) |

---

## 7. Bugs connus (6)

| # | Bug | Fichier | Priorite | Statut |
|---|-----|---------|----------|--------|
| 1 | Polling infini import-site.html | `/public/vitrines/import-site.html` | HAUTE | Fixe frontend (v3) + backend (type_site). Karim doit hard reload. |
| 2 | Validation URL stricte | Plusieurs fichiers | MOYENNE | Fixe dans onboarding + import-site. Verifier wizard-societe.html |
| 3 | source_url vs url_analysee | `/api/site-analysis/index.js` | BASSE | Fixe (remplace par url_analysee) |
| 4 | IA suggestions ignorent metier | `/public/studio/mon-site/creer.html` | MOYENNE | Fixe (etape metier ajoutee) |
| 5 | Colonnes absentes site_analyses | `/api/site-analysis/index.js` | HAUTE | Fixe (status→type_site, error_message→recommandation) |
| 6 | 5 sites dupliques en BDD | Tables vitrines | BASSE | Non fixe (mentionnee dans CODEX depuis P33) |

---

## 8. DOUBLONS IDENTIFIES (CRITIQUE)

### DOUBLON 1 : Creation de sites (3 systemes paralleles)
| Systeme | Passes | API | Frontend | Tables |
|---------|--------|-----|----------|--------|
| **Vitrines (chatbot)** | 14-33 | `/api/vitrines/chat.js` (23 fichiers API total) | 16 pages dans `/public/vitrines/` | vitrines_sites, vitrines_sections, vitrines_medias, vitrines_themes (13 tables) |
| **Studio CMS** | 36 | `/api/studio/cms/` | `/public/studio/cms/` | studio_forfaits, site_contenus (6 tables) |
| **Studio Mon Site** | 38 | `/api/studio/sites-jadomi/` | `/public/studio/mon-site/` | sites_jadomi, themes_sites (5 tables) |

**Impact** : 3 systemes qui font la meme chose (creer/gerer un site pour un pro). Tables differentes, API differentes, frontend differents. Le pro ne sait pas lequel utiliser.

### DOUBLON 2 : Analyse de sites existants (2 systemes)
| Systeme | Passe | API | Frontend |
|---------|-------|-----|----------|
| **Site Analysis** | 33 | `/api/site-analysis/start` | `/public/vitrines/import-site.html` |
| **Studio Analyse** | 36 | `/api/studio/analyse/scan` | `/public/studio/onboarding/index.html` |

**Impact** : Les 2 ecrivent dans `site_analyses` mais avec des schemas differents. Le systeme P33 crash (Puppeteer non configure).

### DOUBLON 3 : Dashboard sites existants (2 pages)
- `/public/studio/sites-existants/index.html` (Passe 37 — liste basique)
- `/public/studio/mes-sites/index.html` (Passe 38 — dashboard enrichi avec IA)

---

## 9. Recommandations

### URGENT — Unifier les systemes de creation de sites
Le module **Vitrines (P14-33)** est le systeme ORIGINAL avec 23 fichiers API,
16 pages frontend, 13 tables, un chatbot IA de creation, un editeur, un dashboard,
des professions pre-configurees (20+ metiers), des themes, un scraper.

Le module **Studio (P36-38)** a ete construit EN PARALLELE sans reutiliser le code
existant. Il a cree 5+ nouvelles tables qui doublonnent les tables vitrines.

**Recommandation** : CHOISIR un seul systeme et fusionner.
- Si on garde Studio : migrer les features vitrines vers Studio
- Si on garde Vitrines : integrer les forfaits/themes/IA du Studio
- NE PAS continuer a developper les deux

### MOYEN TERME — Nettoyer les homepages
- Mettre index-v3 en prod sur / (apres validation Karim)
- Supprimer index-v2.html (depasse)
- Archiver landing.html

### MOYEN TERME — Consolider les scanners
- Supprimer `/api/site-analysis/` (Passe 33, non fonctionnel — Puppeteer crash)
- Garder `/api/studio/analyse/scan` (Passe 36, fonctionnel avec cheerio)
- Rediriger `/public/vitrines/import-site.html` vers `/studio/onboarding/`

### BASSE PRIORITE — Nettoyer les 5 sites dupliques en BDD
Bug connu depuis Passe 33, jamais corrige.
