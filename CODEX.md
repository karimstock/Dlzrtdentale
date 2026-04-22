# JADOMI — CODEX
> Document de reference maitre du projet JADOMI
> Source unique de verite, actualise automatiquement par Claude Code
> A coller au debut de chaque nouvelle conversation Claude pour synchronisation instantanee

**Derniere mise a jour** : 23 avril 2026
**Derniere passe** : Passe 29 — Refacto Metiers Premium + Paramedical + Terminologie
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

## 2.5 Autres modules existants (a auditer)
JADOMI Green (reseau anti-gaspillage), Suggestions, Micro, Annuaire,
Conforme facture, Mes documents, Fournisseurs, Mailing & campagnes
(HTML, ciblage, stats, RGPD), Module Compta/Tresorerie, Scanner IA
factures, Scan releves bancaires.

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
- OPENAI_API_KEY (a ajouter pour activer logo IA)
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
TODO post-deploy : executer migration SQL 22 dans Supabase, puis
node scripts/seed-suppliers-dental.js

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
TODO post-deploy : executer migration SQL 23 dans Supabase

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
TODO post-deploy : executer migration SQL 24, node scripts/seed-transport-rates.js

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
TODO post-deploy : executer SQL 26 + 27 + 28 dans Supabase

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
TODO post-deploy : executer SQL 29 dans Supabase

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
- [ ] Executer migration SQL 22-29 dans Supabase
- [ ] Configurer OVH_APPLICATION_KEY + SECRET + CONSUMER_KEY dans .env
- [ ] Lancer seed fournisseurs : node scripts/seed-suppliers-dental.js
- [ ] Test live avec l'epouse de Karim ce soir
- [ ] Feedback post-test utilisateur
- [ ] Parler aux 2 associes DENTALEVOLUTION
- [ ] RDV avocat (CGV + partenariat)
- [ ] Audit complet modules existants
- [ ] Nettoyer 5 sites dupliques en BDD

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
- Migrations SQL 22-29 pas encore executees dans Supabase
- Schedulers GPO + Groupage loggent erreurs (normal tant que SQL pas execute)
- OVH necessite 3 cles dans .env (Karim doit les generer sur eu.api.ovh.com/createToken/)
- Test mobile iOS a verifier (autoplay video parfois bloque Safari)
- JWT_SECRET du client-portal utilise fallback — ajouter dans .env pour production

## Corriges par Passe 23
- Acces paniers groupes en 3 clics -> 1 clic (onglet sidebar dedie)
- Bouton "Panier" redondant supprime
- Terminologie "Non aboutie" -> "Sans reponse"
- SQL 25 pret pour nettoyage donnees test

## TODO produit
- Executer SQL 22-29 dans Supabase (priorite critique)
- Lancer node scripts/seed-suppliers-dental.js apres SQL 22
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
FIN DU CODEX -- Actualise automatiquement par Claude Code a chaque passe
===============================================================
