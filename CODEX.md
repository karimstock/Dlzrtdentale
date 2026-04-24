# JADOMI — CODEX
> Document de reference maitre du projet JADOMI
> Source unique de verite, actualise automatiquement par Claude Code
> A coller au debut de chaque nouvelle conversation Claude pour synchronisation instantanee

**Derniere mise a jour** : 24 avril 2026
**Derniere passe** : Passe 36 — CMS 3 formules Studio (Classic/Pro/Expert)
**Proprietaire** : Dr Karim Bahmed (dentiste Roubaix + fondateur JADOMI)

===============================================================
# 1. VISION PRODUIT
===============================================================

## Qu'est-ce que JADOMI ?
Plateforme SaaS B2B pour professionnels liberaux de sante (dentistes,
prothesistes, medecins, kines...) et multi-secteurs (BTP, juridique,
immobilier, commerce, createurs, services, outils).

Mission : FOURNIR TOUT CE DONT GALERE UN CABINET pour gerer son
activite, avec l'IA.

## Positionnement strategique (CLE)
JADOMI n'est PAS un vendeur. JADOMI est L'OUTIL DE VENTE pour les
autres (comme Stripe pour les paiements, Shopify pour les marchands,
Doctolib pour les RDV). Zero conflit d'interet, scalable.

## Promesse client
- 42 000 professionnels de sante cibles en France
- Economies garanties : ~1 840EUR/an par cabinet
- 0 gaspillage (JADOMI Green)
- Plateforme multi-metiers adaptative

===============================================================
# 2. MODULES DE LA PLATEFORME
===============================================================

## 2.1 Dashboard Organisation (/organisation.html)
Multi-societes par utilisateur. 8 secteurs : Sante, BTP, Services,
Juridique, Createurs, Immobilier, Commerce, Outils. Sidebar admin :
Vue d'ensemble / Comptabilite / Clients & Users / Messages / Analytics
/ Secteurs / Abonnements / Parametres.

## 2.2 Module Stock Intelligent (/index.html)
- Inventaire produits dentaires
- KPIs : References, Critiques, Faibles, Economies YTD (1840EUR)
- Alertes peremption (rouge/orange/vert)
- SOS Stock (marketplace urgence confreres)
- JADOMI Green (partage produits en exces)
- Panier intelligent (IA genere quantites a commander)
- Scanner IA factures (drag & drop PDF -> extraction)

## 2.3 Module Sites Vitrines
- Onboarding v2 immersif avec carousel 12 themes
- Dashboard modulable glassmorphism
- 12 themes adaptatifs dark/light
- Generation logo IA (DALL-E 3)
- Page tarifs immersive publique /tarifs
- Upload photos + Claude Vision
- Assistant IA contextuel par onglet

## 2.4 Module GPO Smart Queue Auction (Passe 20)
- File d'attente rotative equitable (principe "taxi aeroport")
- Slots payants : Bronze 0EUR / Silver 500EUR / Gold 1500EUR / Platinum 4000EUR
- Tarif cible JADOMI (-15% vs prix marche observes via factures scannees)
- Commandes anonymes, 1 fournisseur a la fois
- Delai reponse 15 min (ouvrable 9h-19h) / 1h (sinon)
- Contre-proposition autorisee
- Green-Test (decouverte PME, -15% 1er test finance par fournisseur)
- Acquisition virale fournisseurs via emails cold
- Backend: /api/gpo/* (requests, suppliers, public, target-prices, ratings)
- Frontend: /public/supplier-offer.html (page tokenisee fournisseur)
- Admin: /public/admin/gpo-suppliers.html (4 onglets)
- Scheduler: /lib/gpo-scheduler.js (polling timeout 60s)
- Queue: /lib/gpo-queue.js (Weighted Round-Robin + haversine)

## 2.6 Module Logistique + Groupage (Passe 22)
- UX unifiee : 1 seul bouton "Commander" avec 3 modes
  (Rapide / JADOMI Optimise / Groupe regional)
- Groupon dentaire : paniers groupes 48h max, 5 cabinets min,
  double trigger (5 atteints ou 48h ecoulees)
- Module logistique : entrepots fournisseurs, tarifs transport
  negocies, etiquettes PDF auto, regle 150EUR (gratuit si >=)
- Anonymat maintenu naturellement par la chaine logistique
- Generation PDF etiquettes via pdfkit
- API Adresse gouv.fr pour geocodage entrepots
- Backend: /api/logistics/* + /api/groupage/*

## 2.7 Page Paniers Groupes (Passe 23)
Nouvel onglet dedie dans la sidebar ACHATS permettant de voir toutes les
campagnes de groupage regional actives en 1 clic. Filtrable par region.
Timers live. Bouton "Rejoindre" + "Inviter un confrere". Badge count sidebar.
Tabs : Campagnes actives / Mes participations / Historique.
Cloche notifications en topbar avec panel dropdown.
Animation confetti au rejoindre (canvas-confetti CDN).

## 2.8 Wizard Avocat Premium + OVH Domaines (Passe 24)
Wizard societe enrichi pour professions juridiques :
- Etapes premium : expertises (chips 16 domaines), identite visuelle
  (video hero upload + slogan IA + sous-titre + carousel 12 themes),
  structure site (12 sections activables), domaine OVH (check live +
  suggestions + fallback gratuit .jadomi.fr), modules avances, apercu
  live + publication 1 clic
- Integration API OVH (@ovhcloud/node-ovh) : check + suggest + reserve
  avec fallback gracieux sans cles API
- Assistants IA : slogan (3 propositions), sous-titre, mentions legales
  RGPD, bio avocat, contenu sections, traduction multilangue
- Video hero plein ecran cinema (parallax, overlay, particules, fade scroll)

## 2.9 Chatbot Client IA (Passe 24)
Widget chatbot IA integre a chaque site vitrine. Utilise Claude API
(claude-sonnet-4-20250514). Configurable : FAQ, ton (pro/chaleureux/
formel), sujets autorises. Redirection contact si question complexe.
Historique conversations stocke. Widget JS auto-injectable.

## 2.10 Espace Client Securise (Passe 24)
Portail client avec login JWT (crypto PBKDF2), dossiers, upload
documents chiffres (R2 prive), messagerie avec l'avocat. Design
minimaliste differenicie du site public (zone privee).

## 2.11 Prise de RDV en Ligne (Passe 24)
Systeme de RDV complet : types de consultation (prix, duree, mode),
creneaux recurrents + dates specifiques, buffer entre RDV, algorithme
anti-double-booking, emails confirmation auto HTML + rappel 24h,
export calendrier .ics, admin dashboard pour l'avocat.

## 2.12 Coach JADOMI (Passe 25)
Systeme d'onboarding personnalise et tooltips explicatifs ludiques
adaptes par profession.
- Couche 1 : Welcome modal 3 etapes (salutation titre pro, features,
  quickwins) avec salutation Maitre/Docteur/Bonjour selon metier
- Couche 2 : Tooltips contextuels data-coach-tip-* sur onglets sidebar,
  boutons cles. Activable/desactivable via bouton toggle dans topbar.
  Memorisation par user (tooltips_seen dans BDD).
- 7 profils complets : avocat, dentiste, prothesiste, sci, coiffeur,
  btp, default — chacun avec features, quickwins, tooltips specifiques
- Backend : /api/coach (state, welcome-shown/completed/skipped,
  tooltip-seen, toggle-tooltips, generate-welcome)

## 2.13 Landing Page Cinematic jadomi.fr (Passe 26)
Page vitrine publique style Linear/Stripe/Framer (1605 lignes) :
- Hero cinematographique : typing animation, shimmer dore, particules
- Switcher metiers (7 professions) avec auto-rotation 8s + annotations
- Carousel 12 themes avec scroll snap
- Animation paniers groupes scroll-driven (1/5 → 5/5 + confetti)
- Visualisation GPO : beam rotatif + 6 fournisseurs en cercle
- Spotlight Coach JADOMI
- Demo interactive sans inscription (/demo.html, 935 lignes, mock data)
- Pricing 4 tiers (29/79/179/279€)
- Social proof + CTA final + footer 4 colonnes

## 2.14 Landings Metier Dedies + Photos IA (Passe 27)
Suite au feedback Dr Karim (landing trop fourre-tout), creation de
7 landings metier dediees + hub minimaliste. Strategie Stripe/Shopify.
- Hub /public/landing.html : grid 7 cards metier avec photos IA
- 7 landings ciblees (avocats, dentistes, coiffeurs, btp, prothesistes,
  sci, createurs) chacune avec : hero Ken Burns + slider prestige 5 slides
  + pain points + features grid + themes + temoignage + pricing + CTA
- 14 photos IA DALL-E 3 HD (7 heros 16:9 + 7 portraits 1:1) en WebP
  coherentes visuellement (style cinematographique commun)
- Couleur accent par metier : emerald, blue, rose, bronze, pink, navy, purple
- Slider Prestige : 5 mockups interface anime auto 4.5s + dots + 3D transitions
- Navigation sticky commune avec burger mobile

## 2.15 Device Mockups + Video Demo (Passe 28)
Composant device-mockup.js auto-injectable (MacBook 3D + Browser window).
- MacBook frame : bezel noir, notch, base, reflection, shadow, parallax
  scroll (redresse au scroll). Utilise sur avocats/dentistes/btp/prothesistes.
- Browser frame : chrome avec 3 dots + barre URL + lock icon. Utilise
  sur coiffeurs/sci/createurs.
- Slider prestige wrappe dans les device frames sur les 7 landings.
- Section video demo ajoutee entre hero et pain points sur les 7 landings
  (video MP4 dans device frame avec play button + poster fallback).
- Scripts generation : capture-slides.js (Puppeteer) + generate-demo-videos.js
  (FFmpeg) pour generer les MP4 a partir des slides HTML.

## 2.16 Refacto Metiers Premium + Paramedical (Passe 29)
Repositionnement strategique en 5 groupes metiers :
1. Medical premium (chirurgiens-dentistes, orthodontistes, prothesistes
   dentaires) — terminologie corrigee, 3 landings dediees
2. Paramedical (kines, osteos, podologues, orthophonistes, psychomot,
   dieteticiens, sages-femmes, IDEL) — NOUVEAU GROUPE, landing dediee
   avec 8 sous-specialites et ton medical respectueux
3. Juridique (avocats) — inchange
4. Gestion/Artisanat (SCI, createurs, BTP) — inchange
5. Services & Bien-etre (coiffure, beaute, onglerie, esthetique, massage)
   — recentre SANS paramedicaux
Hub refait avec 5 sections groupees + Medical dropdown dans nav.
Redirections 301 : /dentistes, /prothesistes, /coiffeurs.
6 nouvelles photos DALL-E 3 (ortho, paramedical, bien-etre + renommages).
Coach enrichi : contextes orthodontiste + paramedical ajoutes.

## 2.17 JADOMI Timeline — Suivi Visuel Chronologique (Passe 30)
Module transversal de suivi visuel patient avant/apres :
- Praticien documente chaque etape avec photos + notes cliniques
- Patient accede a son evolution depuis espace client securise
- Cabinet genere portfolio anonymise automatiquement pour vitrine
- Utilisable : ortho, facettes, greffes, couronnes, implants,
  blanchiments, bruxisme (CD), fabrication cas (prothesistes),
  kine post-op, podologie (paramedicaux)
- Claude Vision : detection visage + suggestion crop anonymisation
- Consentement RGPD integre (demande → signature → retrait possible)
- Slider avant/apres cinematographique (drag + autoplay + touch)
- Rapport PDF auto-genere, notes cliniques IA
- 3 tables SQL : treatment_timelines, timeline_steps, timeline_photos
- API : 20 endpoints (praticien CRUD + patient lecture + portfolio public)

## 2.18 Tour Guide Interactif — Onboarding Intercom-style (Passe 31)
Tour guide qui se declenche automatiquement a la 1ere connexion :
- Overlay sombre avec trou spotlight (SVG mask) sur l'element guide
- Glow dore autour de l'element eclaire
- Bulle explicative animee avec titre + description + icone
- Navigation : Precedent / Suivant / Passer (+ clavier fleches/Escape)
- Dots de progression (done/current)
- Confettis + toast de felicitations a la fin
- 10 profils de tour (avocat, dentiste, orthodontiste, prothesiste,
  paramedical, sci, coiffeur, btp, createur, default) — 5-6 etapes chacun
- Memorisation en BDD (tour_completed, tour_skipped, tour_restart_count)
- Bouton "Refaire le tour" disponible dans les parametres
- SQL 32 : enrichissement user_onboarding_state
- API : 4 nouveaux endpoints (tour-completed, tour-skipped, tour-restart, tour-steps)

## 2.19 Module Mon Site Internet Premium (Passe 33)
Module payant dans le dashboard (onglet sidebar avec badge Premium).
3 options : creer de zero (chatbot guide), analyser site existant
(scraping + audit), uploader medias locaux (drag-drop).
- Site Builder Chatbot : 8 etapes conversationnelles, preview live,
  themes 12 options, slogan IA, publication checkmark dore SVG
- Import Site : Puppeteer/Cheerio scraping, audit design/securite/SEO
  avec scores A-F, import assets en DB
- Asset Picker : grid responsive, filtres type/contexte, auto-select
  Claude, selection HD, validation pour site builder
- Upload Manuel : drag-drop max 500 MB, progress bar, R2 ou local
- SQL 33 : site_analyses, analyzed_pages, imported_assets, societe_modules
- API : /api/site-analysis/* (7 endpoints) + /api/media/upload

## 2.21 JADOMI Ads — Regie publicitaire verticale (Passe 34)
Regie pub self-serve type Meta/TikTok/LinkedIn, 100% dentaire verifie.
Double revenu : droit entree mensuel (49-999EUR) + consommation pub (CPC/CPM/CPA).
- Landing commerciale /jadomi-ads (hero, stats, pricing 3 tiers, comparatif Facebook, FAQ)
- Dashboard annonceur /dashboard-annonceur (8 panels SPA type Meta Ads Manager)
- Wizard creation campagne 5 etapes (objectif, ciblage, budget, creatif, lancement)
- Ciblage ultra-precis : profession, specialite, region, structure, anciennete, comportement
- Encheres : bid * quality_score, priorite tier (Enterprise > Pro > Starter)
- Composant JadomiAdSlot (banner 728x90, sidebar 300x250, native-feed)
- Wallet prepaid + auto-recharge + Stripe subscriptions
- Admin moderation campagnes (auto Claude Vision + revue manuelle)
- 11 tables SQL : ad_campaigns, ad_creatives, ad_impressions, ad_clicks,
  ad_conversions, advertiser_wallets, advertiser_subscriptions,
  audience_segments_saved, ad_templates, ad_media_library + ALTER societes
- 25+ endpoints API /api/ads/* (CRUD, delivery, wallet, subscription, admin)
- Clients cibles : societes dentaires (labos, fabricants), centres formation,
  dentistes formateurs (question auto wizard)

## 2.22 JADOMI Studio — Hub IA creation publicitaire (Passe 34.2)
Marketplace d'IA verticalisee dentaire. Orchestrateur d'APIs.
"Creez des pubs qualite studio (2000EUR) pour 50-200EUR."
- Pattern AI Provider (base + 7 providers concrets)
- Router central avec gestion coins, rate limits, R2 upload, logging
- Prompt enhancer Claude (brief simple → prompt technique optimise)
- Moderateur pre-generation (code deontologie dentaire)
- Bibliotheque personnelle de creations sauvegardees
- 12 API endpoints /api/studio/* (generate-image, generate-video,
  generate-voice, generate-avatar, stock/images, stock/videos,
  library CRUD, enhance-prompt, providers-status, wallet)
- APIs integrees V1 : OpenAI (DALL-E 3, Sora 2, TTS), ElevenLabs,
  HeyGen, Unsplash (gratuit), Pexels (gratuit)
- Dashboard annonceur enrichi : tab Studio Creatif avec 6 sous-tabs
  (images, videos, voix, avatars, stock, bibliotheque)
- Modal generation 4 etapes (brief, recap+prompt, loading, resultat)
- Landing publique /jadomi-studio
- Fallback gracieux : providers indisponibles grises dans l'UI
- Tarification coins : images 30-100, videos 40-360, voix 10-30,
  avatars 200+, stock GRATUIT
- Marges : images 87-98%, videos 87%, voix 93-98%, avatars 68%
- SQL 35 : ai_generations_log, studio_library, studio_rate_limits
  + seed features_pricing pour Studio

## 2.23 CMS 3 formules Studio (Passe 36)
Dashboard CMS pour sites vitrines avec 3 niveaux de service :
- Classic 29EUR/mois : site gere par equipe JADOMI, 2 modifs/mois max
- Pro 79EUR/mois : CMS complet (editeur visuel, photos, historique, blog)
- Expert 199EUR/mois : CMS avance + A/B testing + multi-langue + effet Hollywood
Scanner URL integre pour analyser sites existants (WordPress, Shopify, Wix...)
et recommander l'approche (reconstruire, ameliorer, refuser).
- Middleware forfait : bloque Classic du CMS, propose upgrade
- Middleware quotas : photos, pages, modifications verifie cote serveur
- 7 tables SQL (39_cms_formules.sql) + RLS policies
- 17 endpoints API /api/studio/cms/* et /api/studio/analyse/*
- Dashboard frontend : Pro/Expert/Classic avec differenciation visuelle
- Onglet JADOMI Studio dans sidebar dashboard principal

## 2.5 Autres modules existants (a auditer)
JADOMI Green (reseau anti-gaspillage), Suggestions, Micro, Annuaire,
Conforme facture, Mes documents, Fournisseurs, Mailing & campagnes
(HTML, ciblage, stats, RGPD), Module Compta/Tresorerie, Scanner IA
factures, Scan releves bancaires.

## 2.20 Wizard Societe Simplifie (Passe 33)
Wizard avocat reduit a 3 etapes (infos → specialites → recap).
Etapes visual/structure/domain/optional/preview retirees (deplacees
dans module Mon Site Internet du dashboard). Min 1 specialite au
lieu de 3. Liste enrichie : 18 domaines de droit + 8 types
d'intervention. Contentieux et Arbitrage separes. Conseil ajoute.
Audit orthographique complet (accents corrigés partout).

===============================================================
# 3. SOCIETES DU FONDATEUR
===============================================================

## Precision Dentaire (Cabinet dentaire, Roubaix)
Proprietaire 100% Karim. Utilise comme cabinet client test sur JADOMI.
Site test : siteId a8ac57cc-90d2-4ca2-a16b-b288cc437620

## DENTALEVOLUTION (SAS, vente materiel dentaire)
Karim + 2 associes (~33% chacun). S'inscrit sur JADOMI comme
fournisseur NORMAL. Principe "Chinese Wall" strict : aucun favoritisme
algorithmique. DENTALEVOLUTION grandit par merite (prix, qualite,
service), pas par favoritisme JADOMI.

## LK Immo (SCI)
Societe immobiliere de Karim. Module Immobilier JADOMI.

===============================================================
# 4. MODELE ECONOMIQUE
===============================================================

## Revenus SaaS dentistes (/tarifs)
| Palier | Prix | Theme |
|---|---|---|
| Essentiel | 29EUR/mois | Ivoire & Or |
| Standard | 79EUR/mois | Clinical White |
| Illimite | 149EUR/mois | Ocean Deep - "Le plus choisi" |
| Prestige | 199EUR/mois | Midnight Emerald + Logo IA inclus |
| Signature | 279EUR/mois | Royal Purple |

Upsell : Generation logo IA one-shot +59EUR

## Revenus marketplace GPO (fournisseurs)
| Tier | Prix/mois | Slots | Cible |
|---|---|---|---|
| Bronze | 0EUR | 1 | PME locales |
| Silver | 500EUR | 3 | Distributeurs regionaux |
| Gold | 1 500EUR | 8 | Distributeurs nationaux |
| Platinum | 4 000EUR | 20 | Henry Schein, DPI, GACD |

## Revenus regie JADOMI Ads (annonceurs)
| Tier | Prix/mois | Campagnes | Cible |
|---|---|---|---|
| Starter | 49EUR | 1 | Formateurs independants, petits labos |
| Pro | 199EUR | 5 | LearnyLib, French Tooth, Julie, Logos_W |
| Enterprise | 999EUR | Illimite | Henry Schein, Dentsply, Planmeca, 3M |

+ Consommation pub : CPC 0.50-2EUR / CPM 10-30EUR / CPA 50-200EUR
+ Wallet prepaid avec auto-recharge

## Projections
- **24 mois** : 500 cabinets x 150EUR/mois + 50 fournisseurs = ARR ~1,3 MEUR
  -> Valo 6x = **7,8 MEUR**
- **60 mois** : 10 000 cabinets + 300 fournisseurs = ARR ~15 MEUR ->
  Valo **90-150 MEUR**

===============================================================
# 5. INFRASTRUCTURE TECHNIQUE
===============================================================

## Stack
- Backend : Node.js + Express
- Serveur : Ubuntu 22.04, IP 141.94.10.182
- Process : PM2 app "jadomi" port 3001
- BDD : Supabase (PostgreSQL)
- Stockage : Cloudflare R2
- Frontend : HTML/CSS/JS vanilla
- Domaine : https://jadomi.fr

## IA utilisee
- Anthropic Claude API : Vision, assistants, reformulation, chatbot
- OpenAI API : DALL-E 3 (generation logos)
- FFmpeg : traitement videos

## Variables .env
- ANTHROPIC_API_KEY
- OPENAI_API_KEY (logo IA + Studio DALL-E/Sora/TTS)
- ELEVENLABS_API_KEY (Studio voix premium — a ajouter)
- HEYGEN_API_KEY (Studio avatars parlants — a ajouter)
- UNSPLASH_ACCESS_KEY (Studio stock photos — a ajouter)
- PEXELS_API_KEY (Studio stock videos — a ajouter)
- Supabase keys
- Cloudflare R2
- SMTP (OVH Pro : pro1.mail.ovh.net)

## Repertoires
- /home/ubuntu/jadomi/ (repo principal)
- /home/ubuntu/jadomi/api/ (endpoints backend)
- /home/ubuntu/jadomi/public/ (frontend statique)
- /home/ubuntu/jadomi/sql/ (migrations SQL)
- /home/ubuntu/jadomi/lib/ (modules core : gpo-queue, gpo-scheduler, emails)
- /home/ubuntu/jadomi/scripts/ (seed, migrations one-shot)
- /home/ubuntu/jadomi/.env (secrets)

===============================================================
# 6. HISTORIQUE DES PASSES
===============================================================

## Passes 1-13 (avant 21 avril 2026) -- Fondations
Stock, GPO, SOS, Green, Compta, Scanner, Mailing, multi-societes,
sites vitrines v1.

## Passe 14 (nuit 21->22 avril 2026) -- 12 themes couleurs
Table vitrines_themes avec 12 palettes. Live preview dans dashboard.

## Passe 15 -- Fix dark mode adaptatif
Detection auto luminance WCAG. 7 variables CSS. Header/nav/sections
adaptatifs.

## Passe 16 -- Fix UX dashboard
Croix dismiss 30x30 glassmorphism, auto-load content editor, boutons
Desktop/Tablette/Mobile encadres, labels lisibles.

## Passe 18 (22 avril matin) -- Onboarding immersif v2
8 etapes orchestrees, chatbot vouvoiement premium, carousel 12 themes
Netflix-style avec transformation live background. Fichiers :
onboarding-v2.html + .css (995 lignes) + .js (966 lignes). SQL 20.

## Passe 19 (22 avril matin) -- Correctifs + Logo IA + Pricing
Fix bulles chat (mode immersive/chat), carte carousel agrandie
(420x580, scale 1.12), etape logo IA 3 options + 4 variantes DALL-E 3,
page /tarifs scroll storytelling 5 sections. SQL 21 (is_primary).

## Passe 20 (22 avril) -- Module GPO Smart Queue Auction
Fichiers crees (17 fichiers) :
- sql/vitrines/22_gpo_smart_queue.sql (8 tables : suppliers,
  supplier_subscriptions, gpo_requests, gpo_request_attempts,
  market_prices, target_prices, supplier_ratings, supplier_client_history)
- lib/gpo-queue.js (Weighted Round-Robin + haversine + computeDeadline)
- lib/gpo-scheduler.js (timeout handler, polling 60s, escalade auto)
- lib/emails/supplier-offer.js (templates inscrit/non-inscrit + retry x3)
- api/gpo/index.js + requests.js + suppliers.js + public.js +
  target-prices.js + ratings.js
- public/supplier-offer.html (page fournisseur tokenisee, responsive)
- public/admin/gpo-suppliers.html (4 onglets : dashboard, fournisseurs,
  tarifs, demandes)
- scripts/seed-suppliers-dental.js (50 fournisseurs dentaires FR)
- server.js modifie (mount GPO + routes /supplier/offer/:token + /admin/gpo)
- index.html modifie (bouton "Commander via JADOMI GPO" dans Panier
  intelligent + modal tracking live avec polling 5s)
[FAIT ✅ 24/04/2026] migration SQL 22 executee en prod Supabase.
TODO post-deploy : node scripts/seed-suppliers-dental.js

## Passe 21 (22 avril) -- Fix notifications dentiste + auth GPO + UI commandes
Bugs corriges :
- BUG 1 : Auth bouton GPO (getGpoAuth() multi-fallback : jadomiMultiSocietes
  -> jadomi_session -> sb-auth-token -> selectedSocieteId)
- BUG 2 : Notification dentiste quand fournisseur accepte (3 canaux :
  email via lib/emails/dentist-offer-accepted.js, notification in-app
  via table notifications existante, modal tracking live)
- BUG 3 : Page "Appels d'offres" branchee sur gpo_requests (liste +
  modal detail + bouton accepter contre-proposition)
- BUG 4 : final_price_eur calcule proprement apres accept (computeFinalPrice)
- BUG 5 : Fallback prix estimes (20EUR marche / 17EUR cible) quand
  target_prices vide
Fichiers crees :
- lib/emails/dentist-offer-accepted.js (email accepte + email echec)
- sql/vitrines/23_notifications_gpo_types.sql (ALTER CHECK constraint)
Fichiers modifies :
- api/gpo/public.js (email + notif in-app + computeFinalPrice)
- api/gpo/requests.js (fallback prix estimes)
- index.html (getGpoAuth(), chargerAppelsOffres(), voirDetailGpo(),
  updateGpoTracking enrichi, page-devis avec liste GPO)
[FAIT ✅ 24/04/2026] migration SQL 23 executee en prod Supabase.

## Passe 22 (22 avril) -- UX 3 modes + Groupon dentaire + Logistique
- Migration SQL 24 : supplier_warehouses, transport_rates,
  group_purchase_campaigns, group_purchase_items, shipping_labels
- UI unifiee : bouton "Commander" avec modal 3 modes
- Module /api/groupage (campaigns + scheduler polling 60s)
- Module /api/logistics (warehouses, calculate, labels)
- Regle 150EUR appliquee (gratuit si >=, dentiste paie sinon)
- Emails groupage (triggered/expired avec notification participants)
- Generation PDF etiquettes expedition (pdfkit)
- Demande adresse entrepot via token public
- Seed 18 tarifs transport Chronopost/TNT/GLS/DPD/Colissimo
- Sidebar : fusion "Appels d'offres" + "Paniers groupes" -> "Commandes"
[FAIT ✅ 24/04/2026] migration SQL 24 executee en prod Supabase.
TODO post-deploy : node scripts/seed-transport-rates.js

## Passe 23 (22 avril) -- Polish UX + Onglet Paniers Groupes + Cleanup
- Nouvel onglet sidebar "Paniers groupes" avec badge count live
- Page dediee avec grid cards + timers live + progress bars
- 3 tabs : actives / mes participations / historique
- Suppression bouton "Panier" redondant (remplace par modal 3 modes)
- Terminologie "Non aboutie" -> "Sans reponse"
- Animation confetti au "Rejoindre" via canvas-confetti
- Bouton "Inviter un confrere" sur cards campagnes (email)
- Endpoint POST /api/groupage/campaigns/:id/invite
- Cloche notifications en topbar avec panel dropdown
- SQL 25 pret : nettoyage donnees test (isabelle, Protein Granarola)
- Polling auto 30s pour badge sidebar + notifications

## Passe 24 (22 avril soir) -- Wizard Avocat Premium + Video + OVH + Modules
Fichiers crees (18 fichiers) :
- sql/vitrines/26_chatbot_config.sql (tables chatbot config + conversations)
- sql/vitrines/27_client_portal.sql (tables client_accounts, dossiers, documents, messages)
- sql/vitrines/28_appointments.sql (tables appointment_types, availability_slots, appointments, settings)
- api/vitrines/ai-assistants.js (6 endpoints : slogan, subtitle, legal, bio, section, translate)
- api/vitrines/chatbot-public.js (chatbot IA public widget : message + config)
- api/client-portal/index.js (register, login JWT, dossiers CRUD, documents R2, messages)
- api/appointments/index.js (types, slots, book, ics, admin CRUD complet)
- public/vitrines/chatbot-widget.js (widget JS auto-injectable FAB + panel)
- public/vitrines/site-public.html (template video hero cinema + parallax)
- public/vitrines/espace-client.html (portail client SPA login/dashboard/dossier)
- public/vitrines/rendez-vous.html (booking 5 etapes : type, calendrier, creneau, form, confirmation)
Fichiers modifies :
- wizard-societe.html (+700 lignes : parcours premium avocat 9 etapes)
- api/vitrines/domains.js (integration OVH API + patterns avocat)
- api/vitrines/index.js (mount chatbot-public + ai-assistants + routes)
- server.js (mount /api/client-portal + /api/appointments)
- package.json (+@ovhcloud/node-ovh)
Focus : experience bluff pour epouse avocate de Karim, qualite >= archers.fr
[FAIT ✅ 24/04/2026] SQL 26 + 27 + 28 executees en prod Supabase.

## Passe 25 (22 avril nuit) -- Coach JADOMI (Welcome + Tooltips)
Fichiers crees :
- sql/vitrines/29_user_onboarding_state.sql (table etat onboarding user)
- lib/coach/profession-contexts.js (7 profils : avocat, dentiste,
  prothesiste, sci, coiffeur, btp, default — features, quickwins, tooltips)
- api/coach/index.js (7 endpoints : state, welcome-shown/completed/skipped,
  tooltip-seen, toggle-tooltips, generate-welcome)
- public/js/coach-welcome.js (modal welcome 3 etapes auto-injectable)
- public/js/coach-tooltips.js (systeme tooltips data-coach-tip-* attributes)
Fichiers modifies :
- server.js (mount /api/coach)
- index.html (include coach scripts + data-coach-tip-id sur sidebar items)
- organisation.html (include coach scripts)
[FAIT ✅ 24/04/2026] SQL 29 executee en prod Supabase.

## Passe 26 (22 avril nuit) -- Landing Page Cinematic jadomi.fr
Fichiers crees :
- public/landing.html (1605 lignes, landing cinematique 10 sections)
- public/demo.html (935 lignes, demo interactive standalone mock data)
Fichiers modifies :
- server.js (route / → public/landing.html, /demo → public/demo.html)
10 sections : hero typing+shimmer, switcher 7 metiers, carousel 12
themes, animation paniers groupes scroll-driven, visualisation GPO beam,
spotlight Coach, demo interactive, pricing 4 tiers, social proof, CTA+footer.
Demo : mini-dashboard 4 metiers, sidebar dynamique, 15+ panels mock data.
Qualite cible : Linear.app / Stripe.com niveau.

## Passe 27 (23 avril 2026) -- Landings Metier Dedies + Photos IA
Fichiers crees (10 fichiers, 7 689 lignes HTML + 14 photos) :
- scripts/generate-landing-photos.js (generation DALL-E 3 automatique)
- public/landing.html (refait : hub minimaliste 375 lignes, grid 7 cards)
- public/avocats.html (1013 lignes, landing avocat modele)
- public/dentistes.html (1021 lignes, landing dentiste)
- public/coiffeurs.html (1026 lignes, landing coiffeur)
- public/btp.html (1064 lignes, landing artisan BTP)
- public/prothesistes.html (1062 lignes, landing prothesiste)
- public/sci.html (1060 lignes, landing SCI)
- public/createurs.html (1068 lignes, landing createur)
- public/assets/landings/{7 metiers}/hero.webp + portrait.webp (14 photos)
Chaque landing : hero Ken Burns + slider prestige 5 slides + pain points
+ features grid + themes recommandes + temoignage + pricing + CTA.
14 photos DALL-E 3 HD generees (2.1 MB total), style cinematographique
coherent. Cout : ~1.12 USD.
server.js : 7 routes metier + route /assets statique ajoutees.

## Passe 28 (23 avril 2026) -- Device Mockups MacBook/Browser + Video Demo
Fichiers crees : public/js/device-mockup.js, scripts/capture-slides.js,
scripts/generate-demo-videos.js. Slider prestige wrappe dans MacBook 3D
frame (avocats, dentistes, btp, prothesistes) ou Browser window (coiffeurs,
sci, createurs). Section video demo ajoutee entre hero et pain points.
Composant auto-injectable avec parallax scroll.

## Passe 29 (23 avril 2026) -- Refacto Metiers Premium + Paramedical
Fichiers crees (5 nouvelles landings + hub refait) :
- public/chirurgiens-dentistes.html (1064 l, rename de dentistes)
- public/orthodontistes.html (1074 l, NOUVEAU)
- public/prothesistes-dentaires.html (1105 l, rename de prothesistes)
- public/professions-paramedicales.html (1162 l, NOUVEAU, 8 specialites)
- public/services-bien-etre.html (1137 l, remplace coiffeurs, recentre)
- public/landing.html (555 l, refait avec 5 groupes hierarchie)
6 nouvelles photos DALL-E 3 (orthodontistes, paramedicaux, bien-etre).
Hub restructure : Medical premium (3 XL) + Paramedical (1 XL) + Juridique
+ Gestion/Artisanat (3) + Bien-etre (1 XL). Nav dropdown Medical.
Redirections 301 : /dentistes, /prothesistes, /coiffeurs.
Terminologie corrigee : Dentiste → Chirurgien-dentiste.
Coach : contextes orthodontiste + paramedical ajoutes.

## Passe 30 (23 avril 2026) -- JADOMI Timeline + Hotfix noms propres
Fichiers crees :
- sql/vitrines/30_timeline.sql (3 tables : treatment_timelines,
  timeline_steps, timeline_photos)
- api/timeline/index.js (20 endpoints : praticien CRUD, patient lecture,
  portfolio public, upload photos R2 + Claude Vision, PDF, consent)
- public/vitrines/timelines.html (dashboard praticien : liste, detail,
  slider avant/apres, upload photos, notes IA)
- public/vitrines/mes-traitements.html (vue patient : timeline, slider
  cinematographique avec autoplay, partage)
- public/js/portfolio-slider.js (composant portfolio auto-injectable)
Fichiers modifies :
- server.js (mount /api/timeline)
- public/avocats.html (hotfix : Amrane → Dubois, noms fictifs)
Feature killer : aucun SaaS dentaire francais ne propose ca.
[FAIT ✅ 24/04/2026] SQL 30 executee en prod Supabase.

## Passe 31 (23 avril 2026) -- Tour Guide Interactif Intercom-style
Fichiers crees :
- sql/vitrines/32_tour_guide.sql (enrichissement user_onboarding_state)
- public/js/coach-tour-guide.js (composant tour SVG spotlight + tooltip)
- lib/coach/tour-steps.js (10 profils metier, 5-6 etapes chacun)
Fichiers modifies :
- api/coach/index.js (+4 endpoints : tour-completed, tour-skipped,
  tour-restart, tour-steps)
- index.html (auto-declenchement tour au 1er login)
- organisation.html (inclusion scripts tour)
Inspiration : Intercom Product Tours, Shepherd.js, intro.js.
[FAIT ✅ 24/04/2026] SQL 32 executee en prod Supabase.

## Passe 33 (23 avril 2026 soir) -- Refonte UX + Import Site + Site Builder
Feedback terrain epouse avocate (8 bugs). Refonte complete :
Fichiers crees (8 fichiers, ~2000 lignes) :
- sql/vitrines/33_passe33_modules_analysis.sql (4 tables)
- public/vitrines/site-builder.html (chatbot 8 etapes + preview live)
- public/vitrines/import-site.html (analyse URL + progress + rapport)
- public/vitrines/upload-media.html (drag-drop + upload R2)
- public/vitrines/import-assets.html (asset picker + filtres + auto-select)
- api/site-analysis/index.js (scraping Puppeteer + audits design/secu/SEO)
- api/media-upload.js (upload multipart + R2 + fallback local)
Fichiers modifies :
- wizard-societe.html (min 1 spe, 18 domaines + 8 interventions, accents)
- organisation.html (onglet Mon Site Internet Premium + tour steps)
- server.js (mount /api/site-analysis + /api/media)
Decisions : wizard simplifie 2 min, site = module dashboard payant,
3 options (creer/analyser/uploader), asset picker granulaire.
[FAIT ✅ 24/04/2026] SQL 33 executee en prod Supabase.
TODO : installer puppeteer/axios, configurer Stripe.

## Passe 34 (23 avril 2026 nuit) -- JADOMI Ads (regie publicitaire verticale)
Regie pub self-serve type Meta/TikTok/LinkedIn, 100% dentaire verifie.
Fichiers crees (6 fichiers, ~8000 lignes) :
- sql/vitrines/34_jadomi_ads.sql (11 tables : ad_campaigns, ad_creatives,
  ad_impressions, ad_clicks, ad_conversions, advertiser_wallets,
  advertiser_subscriptions, audience_segments_saved, ad_templates,
  ad_media_library + ALTER societes)
- api/ads/index.js (25+ endpoints : CRUD campagnes, delivery auction,
  wallet Stripe, subscription, admin moderation, Claude Vision analyse)
- public/jadomi-ads.html (landing commerciale premium Linear/Stripe)
- public/dashboard-annonceur.html (SPA 8 panels type Meta Ads Manager,
  wizard campagne 5 etapes, analytics Chart.js, wallet prepaid)
- public/js/ad-slot.js (composant reutilisable : banner/sidebar/native)
Fichiers modifies :
- server.js (mount /api/ads + routes /jadomi-ads + /dashboard-annonceur)
- public/landing.html (section "Qui peut utiliser JADOMI" 6 cards)
- wizard-societe.html (cards societe dentaire + centre formation +
  question formateur DPC avec toggle auto is_formation_provider)
Nouveaux clients cibles : societes dentaires, centres formation, formateurs.
Double revenu : abonnement 49-999EUR/mois + consommation CPC/CPM/CPA.
[FAIT ✅ 24/04/2026] SQL 34 executee en prod Supabase.
TODO : configurer STRIPE_SECRET_KEY.

## Passe 34.2 (23 avril 2026 nuit) -- JADOMI Studio (Hub IA creation publicitaire)
Marketplace d'IA verticalisee dentaire, orchestrateur d'APIs best-in-class.
Fichiers crees (18 fichiers, ~3200 lignes) :
- sql/vitrines/35_jadomi_studio.sql (3 tables : ai_generations_log,
  studio_library, studio_rate_limits + seed features_pricing)
- lib/ai-studio/providers/base-provider.js (interface commune)
- lib/ai-studio/providers/openai-image.js (DALL-E 3 images)
- lib/ai-studio/providers/openai-video.js (Sora 2 videos)
- lib/ai-studio/providers/openai-tts.js (voix OpenAI TTS)
- lib/ai-studio/providers/elevenlabs.js (voix premium ElevenLabs)
- lib/ai-studio/providers/heygen.js (avatars parlants HeyGen)
- lib/ai-studio/providers/unsplash.js (stock photos gratuit)
- lib/ai-studio/providers/pexels.js (stock videos gratuit)
- lib/ai-studio/router.js (orchestrateur : wallet, rate limits, R2, log)
- lib/ai-studio/prompt-enhancer.js (Claude optimise briefs → prompts)
- lib/ai-studio/moderator.js (validation deontologie dentaire)
- api/studio/index.js (12 endpoints : generation, stock, library, wallet)
- public/css/studio.css (design premium dark+gold glassmorphism)
- public/js/studio-ui.js (logique front StudioUI : tabs, modal, API calls)
- public/jadomi-studio.html (landing publique vitrine)
Fichiers modifies :
- public/dashboard-annonceur.html (tab Studio Creatif + 6 sous-tabs +
  modal generation 4 etapes + cards providers)
- server.js (route /jadomi-studio + mount /api/studio module)
APIs integrees : OpenAI (DALL-E 3, Sora 2, TTS), ElevenLabs, HeyGen,
Unsplash, Pexels. Cles env : ELEVENLABS_API_KEY, HEYGEN_API_KEY,
UNSPLASH_ACCESS_KEY, PEXELS_API_KEY (a ajouter par Karim).
Fallback gracieux : providers sans cle grises dans l'UI.
[FAIT ✅ 24/04/2026] SQL 35 executee en prod Supabase.
TODO : ajouter cles API dans .env, tester DALL-E 3.

## Passe 34.3 (23 avril 2026 nuit) -- Demos JADOMI Studio (galerie visuelles)
Generation de demos visuelles pour la landing /jadomi-studio.
Fichiers crees :
- scripts/generate-studio-demos.js (generateur DALL-E 3 + upload R2)
- public/assets/studio-demos.json (URLs R2 des demos generees)
Fichiers modifies :
- public/jadomi-studio.html (refonte complete : hero carousel infini
  6 images auto-scroll, galerie demos 6 cards avec lightbox fullscreen,
  badges DALL-E 3 HD, tags cout/type, responsive mobile)
6 images DALL-E 3 HD (1792x1024) generees et uploadees sur R2 :
formation-implanto, catalogue-premium, gestion-cabinet, congres-adf,
prothese-ceramique, audience-ciblee. Total : 17.12 MB, cout $0.72.
Sora 2 non disponible via API programmatique (webapp only pour l'instant).
Landing passe de texte-only a showcase visuel impactant.

## Passe 35 (23 avril 2026) -- Refonte visuelle premium Awwwards
Transformation visuelle niveau Awwwards (Linear, Stripe, Apple).
Dogfooding : JADOMI = vitrine ultime de ce qu'on peut creer.
Fichiers crees (30+ fichiers, ~3000 lignes) :
- remotion/ : Root.tsx, index.ts, config.ts, 3 compositions
  (HeroHomepage, AdTemplate, StatsAnimation), 4 elements
  (JadomiLogo, GoldParticles, TextReveal, CounterAnimation)
- api/studio/generate-ad-remotion.js (endpoint Remotion 50 coins)
- api/studio/generate-premium-ad.js (pipeline complet 150 coins,
  Sora 2 + ElevenLabs + Remotion, marge 89%)
- public/js/animations/ : 10 fichiers (gsap-core, scroll-reveals,
  counters, interactions, particles-three, dataflow-three,
  hero-homepage, hero-ads, hero-studio, lottie-loader, index)
- public/css/animations.css (premium hover, marquee, lightbox, responsive)
- 3 videos Pexels HD (hero-homepage, hero-ads, hero-studio)
- 3 compositions Remotion rendues (hero, stats, ad-template)
- scripts/generate-passe35-pexels-videos.js (Pexels API)

## Passe 35.2 (23 avril 2026) -- Fix galerie + demo live Remotion
Fix images galerie /jadomi-studio cassees (R2 inaccessible).
Fichiers crees :
- scripts/fix-studio-gallery-images.js (DALL-E 3 → local)
- 6 images DALL-E 3 HD en local /public/assets/studio-demos/*.webp
  (PNG→WebP via ffmpeg, 132-399 KB chacune au lieu de 2.5-3.5 MB)
Fichiers modifies :
- jadomi-studio.html : URLs R2 → chemins locaux WebP + section
  "Demo Live" Remotion (video ad-template + 3 etapes + CTA)
- remotion/compositions/AdTemplate.tsx : v2 enrichie 10s (300 frames),
  4 phases (intro logo, titre+prix, info cards, CTA+outro)
- css/animations.css : styles demo-live-section complets + responsive
Ad-template re-rendu : 1.7 MB, 10s, motion design avec spring physics.

## Passe 35.3 (23 avril 2026) -- Photos reelles Pexels + overlay JADOMI
Feedback Karim : "images DALL-E font trop ChatGPT / pas realiste".
6 images DALL-E remplacees par vraies photos Pexels HD + overlay Sharp :
- Gradient dark bas + titre blanc + sous-titre or + badge JADOMI STUDIO
- WebP optimise : 46-85 KB chacune (48x plus leger que PNG DALL-E)
- Photographes credites : Fauntleroy, kaboompics, Bertelli, weCare Media
- Script : scripts/generate-real-gallery-images.js (Pexels API + Sharp)
- Cout : 0 EUR. Decision : vraies photos >> IA pour credibilite B2B.
- scripts/generate-passe35-videos.js (Sora 2 API)
- scripts/generate-passe35-images.js (DALL-E 3 API)
- public/assets/passe-35/ (lottie, videos, images directories)
Fichiers modifies :
- landing.html (hero premium + particules + stats + marquee)
- jadomi-ads.html (Three.js dataflow + typing + 3D tilt pricing)
- jadomi-studio.html (orbiting logos + price shrink + scroll reveals)
- dashboard-annonceur.html (carte Remotion + modal templates)
- server.js (routes Remotion + premium-ad)
Libs : gsap, three, lottie-web, lenis. CDN : GSAP 3.12, Three r128.

## Passe 36 (24 avril 2026) -- CMS 3 formules Studio (Classic/Pro/Expert)
Dashboard CMS complet pour les sites vitrines avec 3 formules tarifaires.
Scanner de sites existants pour analyse automatique avant onboarding.
Fichiers crees (8 fichiers, ~2600 lignes) :
- sql/vitrines/39_cms_formules.sql (7 tables : studio_forfaits,
  studio_abonnements, site_contenus, site_contenus_historique,
  site_photos, site_demandes_modif, site_analyses + RLS + seeds)
- api/studio/cms/index.js (17 endpoints CMS : CRUD contenus/photos/
  demandes, middleware forfait/quotas, rollback, mon-forfait, forfaits)
- api/studio/analyse/index.js (scanner URL : detection plateforme
  WordPress/Shopify/Wix/Squarespace/Webflow, scores perf/SEO/complexite,
  recommandation auto reconstruire/ameliorer/refuser)
- public/studio/cms/index.html (dashboard CMS : Pro/Expert editor +
  Classic demande + cards forfaits + historique + photos drag&drop)
- public/studio/onboarding/index.html (wizard : choix site existant,
  scanner URL avec animation, rapport recommandation, selection forfait)
- AUDIT_SITES_CMS.md (audit technique complet avant construction)
Fichiers modifies :
- server.js (montage modules CMS + Analyse + routes /studio/*)
- public/organisation.html (onglet JADOMI Studio dans sidebar :
  Vue d'ensemble, Mon site, Creer/analyser, Mes pubs, Abonnement)
- CODEX.md (nettoyage TODO SQL, note audit, mise a jour passe)
Middleware forfait : Classic bloque du CMS avec CTA upgrade.
Middleware quotas : photos/pages/modifications verifie cote API.
Differenciation Expert : theme gold, sections avancees (A/B, multi-langue).
SQL 39 execute en prod (societe_id corrige manuellement par Karim).
TODO : integrer Stripe pour les 3 forfaits.

## Passe 36.2 (24 avril 2026) -- Homepage v2 Editorial Minimalism
Refonte homepage jadomi.fr (fichier separe index-v2.html, pas en prod).
Design system : Editorial Minimalism (Stripe/Linear/Apple inspiration).
Palette : creme chaud #FAFAF8 + bleu profond #2D3A8C + or #8A7239.
Typography : Fraunces italic display + Inter body + Syne prix.
10 sections : header sticky blur, hero video Pexels ambiance, 3 piliers,
4 metiers premium (photos Pexels), 8 autres metiers grid, 3 formules
(Classic 29EUR/Pro 79EUR/Expert 199EUR), temoignages, 3 etapes, FAQ 6
questions, CTA final dark, footer 4 colonnes.
Animations : IntersectionObserver reveal + stagger 80ms + compteurs.
Responsive 375/768/1024/1440 + prefers-reduced-motion.
3 videos hero Pexels (Pavel Danilyuk + Kampus Production).
4 photos metiers Pexels (Arda Kaykisiz, cottonbro, Numan Gilgil, kaboompics).
Skills utilises : ui-ux-pro-max (guidelines), brand, design-system.
TODO : validation Karim, choix video hero, remplacement temoignages,
mockups screenshots formules, mise en prod (switch route /).

## Passe 37 (24 avril 2026) -- Nouveaux prix + sites demo + acces sites existants
Nouveau modele tarifaire hybride creation + abonnement :
- Classic 199EUR creation + 29EUR/mois (0 modif incluse, 49EUR/unite)
- Pro 499EUR creation + 49EUR/mois (CMS illimite) LE PLUS CHOISI
- Expert 899EUR creation + 79EUR/mois (CMS avance + Hollywood)
Module acces sites existants (FTP/SSH/WordPress) :
- 7 endpoints /api/studio/sites-existants/*
- Chiffrement AES-256-GCM pour credentials (cle SITE_CREDENTIALS_KEY)
- Instructions par hebergeur (Hostinger, OVH, Infomaniak, WordPress, Shopify)
- Test connexion live (WordPress REST API)
- Dashboard /studio/sites-existants/ avec grid cards
Sites demo 3 formules en ligne :
- /demo/classic (site minimal), /demo/pro (moderne), /demo/expert (premium dark+gold)
- Donnees fictives (Dr Exemple), badge demo + lien onboarding
Cards formules avec iframes sandbox des demos + double prix visible.
Wizard onboarding enrichi : pre-selection forfait, etape acces hebergeur,
test connexion, recap paiement creation + mensuel.
Page Classic renouvelee : 0 modif gratuite, option 49EUR/unite ou upgrade Pro.
SQL 40 : 5 nouvelles tables (paiements_creation, modifications_ponctuelles,
sites_existants, sites_existants_credentials, sites_existants_interventions).
TODO : executer SQL 40 dans Supabase Dashboard, integrer Stripe, moteur IA.

===============================================================
# 7. DECISIONS STRATEGIQUES
===============================================================

1. **Vouvoiement premium partout** -- Ton concierge 5*, zero emoji chatbot
2. **Chinese Wall DENTALEVOLUTION** -- Fournisseur normal, zero favoritisme
3. **1 commande = 1 fournisseur** -- Anti-pollution, simplicite UX
4. **Green-Test finance par fournisseur** -- Pas par JADOMI
5. **Transparence asymetrique GPO** -- Fournisseurs voient tarif cible
6. **Acquisition virale fournisseurs** -- Via vraies commandes, pas pub
7. **Simplicite radicale UI** -- IA decide, user choisit entre propositions
8. **Regle 150EUR frais de port** -- Gratuit si panier >= 150EUR (paye par fournisseur)
9. **Anonymat par chaine logistique** -- JADOMI controle transport, pas besoin d'anonymisation
10. **Groupon dentaire 48h / 5 cabinets min** -- Double trigger + urgence + progression visible
11. **UX unifiee 1 bouton 3 modes** -- Simplifier radicalement au lieu d'empiler les entrees
12. **Coach JADOMI personnalise** -- Onboarding et tooltips adaptes par profession pour maximiser adoption. Inspire de Notion/Linear/Stripe.
13. **JADOMI Cinematic** -- Positionnement visuel premium noir+or, landing page fusionnant Linear/Stripe/Notion/Framer/Apple.
14. **Landings par metier > Landing mixte** -- Message cible = conversion x3. Strategie Stripe/Shopify/Notion validee. 1 page par audience.
15. **Segmentation respectueuse** -- Kine ≠ coiffeur. Paramedicaux (Ordre, secret medical, CPAM) distincts du bien-etre. Signal de respect = conversion.
16. **Terminologie correcte** -- Chirurgien-dentiste (pas dentiste). Le titre officiel du metier est un signal de credibilite.
17. **JADOMI Timeline = moat concurrentiel** -- Suivi visuel chronologique patient avant/apres. Feature killer. Idee originale Karim 4h du matin 23 avril 2026.
18. **Zero nom propre reel sur le site public** -- Noms fictifs uniquement (Dubois, Martin, Leroy, Moreau).
19. **Tour guide actif > tooltips passifs** -- Un tour interactif etape par etape est 3x plus efficace pour l'activation qu'un tooltip au hover.
20. **Wizard simple, site dans dashboard** -- Le wizard cree le compte cabinet (2 min gratuit). Le site internet est un module payant premium dans le dashboard, pas force dans le wizard. Feedback epouse avocate 23 avril 2026.
21. **Import + create + upload = 3 options** -- Module Mon Site Internet propose 3 chemins compatibles : creer de zero, analyser existant, uploader medias locaux. L'utilisateur qui a deja un site ne doit pas etre force a repartir de zero.
22. **JADOMI Ads = regie publicitaire verticale** -- Modele Meta/TikTok/LinkedIn mais 100% dentaire verifie. Double revenu (abonnement + consommation). Ciblage RPPS/ADELI impossible a truquer. ROI x5 vs Facebook pour annonceurs.
23. **Annonceurs = nouveaux clients** -- Societes dentaires (Henry Schein, Dentsply), centres formation (LearnyLib, French Tooth), dentistes formateurs. Question auto dans wizard pour detecter les formateurs.
24. **Wallet prepaid** -- Systeme TikTok
25. **JADOMI Studio = marketplace IA verticale** -- Orchestrateur d'APIs (DALL-E, Sora, ElevenLabs, HeyGen, Unsplash, Pexels). UX simplifiee + vertical dentaire + audience captive. Moat : 42k dentistes + prompts optimises + wallet integre. Comparable OpenRouter/Replicate mais non-dev-focused.
26. **Gratuit + payant en escalier** -- Stock photos/videos gratuit (fidélisation) puis IA payante par tier (standard → premium → luxe). Le gratuit attire, le premium convertit. : l'annonceur recharge son wallet, la pub debite en temps reel. Auto-recharge optionnelle. Pas de facturation post-hoc complexe.
27. **Dogfooding premium** -- Si JADOMI vend des sites IA et des videos aux pros sante, le site JADOMI lui-meme DOIT etre la vitrine ultime. Niveau Awwwards (Linear, Stripe, Apple). Conversion x2, ARPU x2, credibilite Fortune 500.
28. **Motion design > avatars** -- Focus Remotion + Sora 2 pour la generation video. Pas de Synthesia/HeyGen pour l'instant. Avatars humains plus tard quand traction validee.

===============================================================
# 8. ROADMAP
===============================================================

## Court terme (semaine)
- [x] Finaliser Passe 20 (GPO Smart Queue)
- [x] Fix notifications dentiste + auth GPO (Passe 21)
- [x] UX unifiee + Logistique + Groupon (Passe 22)
- [x] Onglet paniers groupes + Polish UX (Passe 23)
- [x] Wizard avocat premium + Video hero + OVH (Passe 24)
- [x] Chatbot IA + Espace client + RDV en ligne (Passe 24)
- [x] Coach JADOMI : welcome personnalise + tooltips (Passe 25)
- [x] Landing page cinematic + demo interactive (Passe 26)
- [x] 7 landings metier dedies + 14 photos DALL-E 3 (Passe 27)
- [x] Device mockups MacBook/Browser (Passe 28)
- [x] Refacto 5 groupes metier + paramedical + terminologie (Passe 29)
- [x] JADOMI Timeline : suivi visuel patient avant/apres (Passe 30)
- [x] Tour Guide Interactif Intercom-style (Passe 31)
- [x] Executer migration SQL 22-32 dans Supabase [FAIT ✅ 24/04/2026 - audit confirme]
- [ ] Configurer OVH_APPLICATION_KEY + SECRET + CONSUMER_KEY dans .env
- [ ] Lancer seed fournisseurs : node scripts/seed-suppliers-dental.js
- [ ] Test live avec l'epouse de Karim ce soir
- [x] Refonte UX wizard + dashboard + module site internet (Passe 33)
- [x] Executer migration SQL 33 dans Supabase [FAIT ✅ 24/04/2026 - audit confirme]
- [ ] Installer puppeteer + axios sur VPS (npm install)
- [x] JADOMI Ads : regie publicitaire verticale dentaire (Passe 34)
- [x] JADOMI Studio : hub IA creation publicitaire dentaire (Passe 34.2)
- [x] Demos Studio : 6 images DALL-E 3 HD + galerie landing (Passe 34.3)
- [x] Refonte visuelle premium Awwwards (GSAP + Three.js + Remotion) (Passe 35)
- [x] CMS 3 formules Studio + scanner sites existants (Passe 36)
- [ ] Generer videos Sora 2 : node scripts/generate-passe35-videos.js
- [ ] Generer images DALL-E 3 : node scripts/generate-passe35-images.js
- [x] Executer migration SQL 34 dans Supabase [FAIT ✅ 24/04/2026 - audit confirme]
- [x] Executer migration SQL 35 (Studio) dans Supabase [FAIT ✅ 24/04/2026 - audit confirme]
- [ ] Ajouter ELEVENLABS_API_KEY, HEYGEN_API_KEY, UNSPLASH_ACCESS_KEY, PEXELS_API_KEY dans .env
- [ ] Configurer STRIPE_SECRET_KEY dans .env
- [ ] Configurer OPENAI_API_KEY pour DALL-E generation creatives
- [ ] Contacter LearnyLib / French Tooth pour beta annonceur
- [ ] Feedback post-test utilisateur
- [ ] Parler aux 2 associes DENTALEVOLUTION
- [ ] RDV avocat (CGV + partenariat)
- [ ] Audit complet modules existants
- [ ] Nettoyer 5 sites dupliques en BDD

- [ ] Passe 38 : Systeme JADOMI Coins (wallet tokens type PlayStation/Steam)
  - Packs : 100/500/1000/2500/10000 coins
  - Gamification : bonus quotidien, quetes, niveaux Bronze→Diamant
  - Integration abonnements : Standard 100 coins/mois, Premium 500, Elite 1500
  - SQL preparatoire deja cree : sql/vitrines/38_coins_wallet_structure.sql

## Moyen terme (1 mois)
- [ ] 5 clients beta payants identifies
- [ ] Base 200+ fournisseurs seedee
- [ ] Scripts seed + import fournisseurs depuis factures
- [ ] Stripe pour abonnements fournisseurs
- [ ] Module notation post-commande

## Long terme (3-6 mois)
- [ ] Agents IA autonomes (nuit)
- [ ] Expansion metiers (avocats, kines, notaires)
- [ ] Expansion pays (Belgique, Suisse, UK)
- [ ] Levee de fonds (valo 7-10MEUR)

===============================================================
# 9. PROFIL FONDATEUR
===============================================================

- **Nom** : Dr Karim Bahmed
- **Metier principal** : Dentiste a Roubaix
- **Statut JADOMI** : Fondateur solo (code avec Claude Code)
- **Abonnement** : Claude Max 20x (200EUR/mois)
- **DENTALEVOLUTION** : 2 associes (33% chacun)
- **Epouse** : Avocate (focus group naturel, tres critique)
- **Contact avocat pro** : a appeler pour RDV partenariat CGV
- **Personnalite** : ACHARNE (14h de code nocturne possible)
- **Philosophie produit** : Simplicite radicale + WAOUH visuel
- **References design** : Vercel v0, Linear, Arc Browser, Apple

===============================================================
# 10. BUGS CONNUS & TODO
===============================================================

## Bugs a corriger
- 5 sites dupliques en BDD (garder a8ac57cc-90d2-4ca2-a16b-b288cc437620)
- Doublons produits dans Panier intelligent
- ~~Migrations SQL 22-29 pas encore executees dans Supabase~~ [RESOLU ✅ 24/04/2026 - toutes migrations 22-38 en prod]
- Schedulers GPO + Groupage loggent erreurs (normal tant que SQL pas execute)
- OVH necessite 3 cles dans .env (Karim doit les generer sur eu.api.ovh.com/createToken/)
- Test mobile iOS a verifier (autoplay video parfois bloque Safari)
- JWT_SECRET du client-portal utilise fallback — ajouter dans .env pour production

## Corriges par Passe 33
- Wizard specialites avocat min 3 -> min 1
- Contentieux et Arbitrage fusionnes -> separes
- Manque Conseil dans domaines -> ajoute
- Fautes accents wizard (selection, generation, verification, etc)
- Site force dans wizard -> deplace dans dashboard (module payant)
- Pas d'option site existant -> 3 options (creer/analyser/uploader)

## Corriges par Passe 23
- Acces paniers groupes en 3 clics -> 1 clic (onglet sidebar dedie)
- Bouton "Panier" redondant supprime
- Terminologie "Non aboutie" -> "Sans reponse"
- SQL 25 pret pour nettoyage donnees test

## TODO produit
- ~~Executer SQL 22-29 dans Supabase~~ [FAIT ✅ 24/04/2026 - toutes migrations 22-38 en prod]
- Lancer node scripts/seed-suppliers-dental.js (SQL 22 deja en prod)
- Lancer node scripts/seed-transport-rates.js apres SQL 24
- Tests beta avec 5 cabinets reels
- Restaurer vrais emails fournisseurs
- Negocier contrat transporteur
- Integrer carte geographique cabinets participants (v2)
- Notifications push mobiles (service worker)
- Tester onboarding v2 avec epouse avocate
- Ajouter OPENAI_API_KEY dans .env pour DALL-E 3
- Appeler contact avocat pour RDV CGV partenariat

===============================================================
# 11. SECURITE & ACCES
===============================================================

NE PAS stocker mots de passe / cles API dans ce document.
Utiliser 1Password ou Bitwarden pour :
- SSH serveur (ubuntu@141.94.10.182)
- Supabase, Cloudflare R2, Anthropic, OpenAI, Stripe, DNS, Email admin

===============================================================
# 12. SESSIONS DE CADRAGE STRATEGIQUE
===============================================================

## Session 24 avril 2026 (matinée) - Cadrage JADOMI Studio

### Décisions stratégiques prises avec Karim :

**1. Positionnement JADOMI Studio**
- JADOMI Studio = UN ONGLET dans le dashboard JADOMI (pas plateforme séparée)
- COMPLÉMENT des logiciels métier (Julie, Secib, Logos_w) - PAS un remplaçant
- Cerveau IA qui orchestre les APIs (GPT-5, Claude, DALL-E, ElevenLabs, Pexels...)
- Le client guide avec 3-5 choix simples, le Studio route, les APIs exécutent

**2. Cibles prioritaires (4 métiers)**
- Chirurgien-dentiste
- Prothésiste dentaire
- Orthodontiste
- Avocat

**3. Les 3 portes du Studio**
- Porte 1 : SITE (créer/améliorer son site + upgrades)
- Porte 2 : PUB / EMAILING (PDF, bannières, campagnes)
- Porte 3 : VIDÉO (améliorer vidéos importées, PAS créer from scratch)

**4. Modèle économique**
- 3 forfaits mensuels style ChatGPT/Claude :
  * STARTER 29€/mois (quotas bas)
  * PRO 79€/mois (le plus choisi)
  * EXPERT 199€/mois (quasi illimité)
- Règle dépassement : BLOCAGE + proposition d'upgrader (style Spotify Free)
- PAS de tokens/crédits à la carte visibles au client

**5. Transparence IA / Protection du savoir-faire**
- Mention "Propulsé par JADOMI IA" OBLIGATOIRE partout (conformité AI Act)
- JAMAIS nommer les modèles (GPT-5, Claude, etc.) - protection concurrence
- Niveaux = "JADOMI IA Classic / Pro / Expert" (pas les technos)
- Compteurs visibles d'usage mensuel (quotas restants)

**6. Décisions écartées**
- ❌ Tokens/crédits à la carte (usine à gaz)
- ❌ Remplacement des logiciels métier (impossible)
- ❌ Avatars Synthesia/HeyGen (pas maintenant)
- ❌ Sora 2 API (pas disponible publiquement)
- ❌ Images DALL-E pour marketing (trop "IA reconnaissable")
- ❌ Benchmark cabinet vs concurrents (data non accessible)

### Prochaines actions :
- Installer les skills design (UI/UX Pro Max, Remotion, Vercel)
- Différencier visuellement les 3 formules (site-classic/pro/expert)
- Construire l'onglet Studio dans le dashboard
- Intégration Stripe pour les 3 forfaits

### Note audit 24 avril 2026
24 avril 2026 : audit SQL confirme, toutes migrations 22-38 appliquees en prod Supabase.
Tables chatbot : utilisent deja le prefixe vitrine_chatbot_* (correct).
Tables coins (Passe 38) : sql/vitrines/38_coins_wallet_structure.sql cree (user_coins_wallet).

===============================================================
FIN DU CODEX -- Actualise automatiquement par Claude Code a chaque passe
===============================================================
