# JADOMI — CODEX
> Document de reference maitre du projet JADOMI
> Source unique de verite, actualise automatiquement par Claude Code
> A coller au debut de chaque nouvelle conversation Claude pour synchronisation instantanee

**Derniere mise a jour** : 17 mai 2026
**Derniere passe** : Passe 86 (18 mai 2026) — Copilot + Panneau lateral + 10K mails
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
- Module logistique : entrepots fournisseurs, regle 150EUR (gratuit si >=)
- Fournisseur expedie avec son propre transporteur
- Frais de port proposes par le fournisseur (< 150EUR), valides par le client
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
- Classic 19EUR/mois (0EUR creation) : site gere par equipe JADOMI, 2 modifs/mois max
- Pro 39EUR/mois (149EUR creation) : CMS complet (editeur visuel, photos, historique, blog)
- Expert 69EUR/mois (299EUR creation) : CMS avance + A/B testing + multi-langue + effet Hollywood
Scanner URL integre pour analyser sites existants (WordPress, Shopify, Wix...)
et recommander l'approche (reconstruire, ameliorer, refuser).
- Middleware forfait : bloque Classic du CMS, propose upgrade
- Middleware quotas : photos, pages, modifications verifie cote serveur
- 7 tables SQL (39_cms_formules.sql) + RLS policies
- 17 endpoints API /api/studio/cms/* et /api/studio/analyse/*
- Dashboard frontend : Pro/Expert/Classic avec differenciation visuelle
- Onglet JADOMI Studio dans sidebar dashboard principal

## 2.26 JADOMI IDE — Module Infirmiere Liberale Complet (Passe 68)
Plateforme complete pour IDEL (infirmiers diplomes d'etat liberaux).
Positionnement : aucun concurrent ne fait tout ca.

### Dashboard IDE (/ide/dashboard.html)
- Planning pro multi-vue : jour / 3 jours / semaine
- Filtre par praticien (chips cliquables)
- Mode plein ecran avec panel lateral d'options
- Rotation automatique des infirmieres tous les 3 jours
- Optimisation intelligente : creneaux fixes (insuline 6h30) > proximite > flexible (Alzheimer 11h)
- Patients meme rue groupes, badge "Retour" si 2 passages meme zone
- Rappels/post-it par date sur le planning
- Reporter une visite au lendemain avec repositionnement auto
- Donnees demo Marrakech avec noms mixtes arabes/europeens

### Mode Tournee Active (step-by-step)
- Choix Waze ou Google Maps au demarrage
- Liste ordonnee des visites avec etapes numerotees
- Gros bouton "Termine" → GPS capture silencieusement → navigation suivante automatique
- Stop pharmacie unique integre dans le parcours (tous traitements regroupes)
- Patients chroniques badges (rose), pilulier (violet), urgent (rouge clignotant), 2x/jour (orange)
- Bouton "Patient confirme" → ecran simplifie pour le patient
- Bouton "Faire signer" → pad signature optionnel
- Mode hors ligne : file d'attente localStorage, sync auto au retour reseau

### Preuve de Passage Certifiee (table ide_preuves_passage — SQL deploye)
- API POST /api/ide/visite/:id/checkin — horodatage SERVEUR (pas le telephone)
- Geolocalisation GPS arrivee + depart
- Geofencing Haversine : distance exacte au domicile patient (< 15m = "Sur place")
- Signature patient sur ecran tactile (canvas PNG)
- Confirmation patient depuis SON telephone (double preuve GPS independante)
- Log immuable non modifiable apres enregistrement
- Onglet "Mes passages" : historique par date, badges GPS/signe/confirme
- Attestation JADOMI extractible par visite ou par periode, prete a imprimer
- Positionnement : "Votre bouclier en cas de controle" (pas un mouchard)

### Scanner Ordonnance IA (Premium 89EUR/mois)
- API POST /api/ide/ordonnances/analyser — Claude analyse photo ordonnance
- Extraction medicaments, dosages, posologie, voie d'administration
- Score de confiance par medicament (vert > 80%, orange 50-79%, rouge < 50%)
- Alerte medicaments a risque (insuline, morphine, heparine, methotrexate, digoxine)
- Manuscrite : tente l'analyse, flag confiance basse si illisible
- Validation OBLIGATOIRE par l'infirmiere ligne par ligne
- Gate par formule : ordoScan = true uniquement sur Premium

### Dictee Vocale + Media Medecin
- Web Speech API (fr-FR) : l'infirmiere dicte ses notes, texte temps reel
- Photo/video/vocal : capture camera + MediaRecorder
- Envoi securise au medecin traitant via Care Network (/api/ide/visite/:id/send-medecin)
- Insertion dans care_partages (cercle de soins existant)

### App Patient enrichie (/patient/)
- Nouvel onglet "Mes visites" : visites du jour + historique + confirmation GPS
- Bouton "Confirmer la presence de mon infirmier(e)" → GPS patient enregistre
- Flag type utilisateur dans profil : patient direct / representant sur place / representant distant
- Representant distant = PAS de GPS croise (evite faux positifs fils a 200km)
- API POST /api/patient/confirm-visit

### PWA Installable
- manifest.json dedie (/ide/manifest.json)
- Service Worker (/ide/sw.js) : precache + network-first + cache fallback
- Icone SVG JADOMI IDE
- Installable sur Android (Chrome) et iOS (Safari)

### Connexions modules existants
- JADOMI Sign (Passe 55) branche sur contrats de remplacement IDE (AES eIDAS)
- Care Network (Passe 53) branche sur envoi medias au medecin
- Comptabilite existante reutilisee (meme scanner IA)

### Courriers officiels (docs/)
- courrier-ars-preuve-passage.html — presentation systeme tracabilite, langage simple
- courrier-cpam-tracabilite.html — 5 niveaux de preuve, schema passage type

### Formules tarifaires IDE
| Formule | Prix | Patients | Infirmiers | Compta | Ordonnances | Scanner IA |
|---------|------|----------|------------|--------|-------------|------------|
| Essentiel | 29EUR | 30 | 1 | Non | Non | Non |
| Pro | 49EUR | Illimite | 3 | Oui | Upload | Non |
| Premium | 89EUR | Illimite | Illimite | Oui | Upload+Email | Scanner IA |

### Fichiers cles
- public/ide/dashboard.html (~2700 lignes)
- public/ide/manifest.json + sw.js
- public/ide/demande-soins.html + soins-ville.html
- public/patient/js/pages/mes-visites.js
- public/infirmiers.html (page vitrine optimisee)
- docs/courrier-ars-preuve-passage.html
- docs/courrier-cpam-tracabilite.html
- server.js : 50+ endpoints /api/ide/*

## 2.24 JADOMI Care Network — Reseau de Soins interprofessionnel (Passe 53)
Extension du Triangle Photo : coordination N praticiens autour d'un patient.
- Cercle de soins : chaque patient a N praticiens (internes JADOMI ou externes)
- Partages inter-praticiens : photos, videos, notes, documents entre membres du cercle
- Adressage patient : praticien refere un patient a un confrere avec preuves visuelles
- Vue patient : equipe de soins visible (sans messages interprofessionnels confidentiels)
- Professions supportees : dentiste, kine, medecin, osteo, dermato, orl, ophtalmo, etc. (22)
- 2 tables SQL : care_circle + partages, 1 vue care_team_view
- 12 endpoints API /api/dentiste-pro/reseau/* (11 fonctionnels + mark-as-read)
- Roles cercle : referent (primaire), membre, consultant
- Urgences : routine, urgent, immediat
- Upload media : 25 Mo max (photo/video/PDF)

## 2.25 JADOMI Sign — Signature Electronique Premium (Passe 55)
Module de signature electronique integre, base sur DocuSeal
(open source self-hosted) + couche premium JADOMI Sign.

### Niveau de signature
**AES (Signature Electronique Avancee)** conforme a l'article 26 du reglement eIDAS.
- Hash SHA-256 du document
- Piste d'audit immutable (hash-chaining, anti-falsification)
- Signature PAdES PKCS#7 integree au PDF (verifiable dans Adobe Acrobat)
- Horodatage TSA externe RFC 3161 (FreeTSA — non qualifie, valide pour AES)
- Verification OTP SMS du signataire (Twilio/OVH SMS)
- Certificat de completion PDF auto-genere
- QR code + URL de verification publique (token HMAC)

Upgrade vers QES (Qualifiee) prevu quand :
- TSA qualifiee eIDAS deployee (Certigna/Universign ~30€/mois)
- Certificat AC reconnu (~150€/an)
- Verification d'identite renforcee (piece d'identite + OCR)
- Validation juridique par avocat specialise eIDAS

### Positionnement honnete vs DocuSign
| Critere | DocuSign | JADOMI Sign |
|---|---|---|
| Niveau eIDAS | SES + AES + QES | AES — Article 26 prouve |
| Hash document | SHA-256 | SHA-256 |
| Hebergement | Cloud USA/EU | Self-hosted France (Roubaix) |
| Cout | 25-65$/user/mois | Inclus dans abonnement JADOMI |
| Souverainete RGPD | DPA + Cloud Act | Souverainete totale (auto-heberge) |
| Workflows | Tres avances (conditionnel, parallele) | Basique (sequentiel, multi-signataires) |
| Integrations | 350+ natives | Native dans JADOMI uniquement |
| Apps mobiles | iOS + Android natifs | Web responsive |
| KYC integre | Identite, biometrie | Email + SMS OTP |
| Horodatage | TSA qualifiee | FreeTSA RFC 3161 (non qualifiee, valide pour AES) |
| Maturite | 25 ans | Recent (avril 2026) |

**Notre force** : souverainete donnees France + integration native JADOMI
(devis BTP, plans dentaires, contrats avocats) + pas de cout par signature.

### Validation technique (27 avril 2026)
Tests reels effectues et prouves :
- PAdES PKCS#7 : /Type /Sig + /ByteRange + /Contents + adbe.pkcs7.detached → VALIDE
- TSA FreeTSA RFC 3161 : reponse 6192 chars base64 → VALIDE
- Audit hash-chain SHA-256 : 7 entrees, chaine verifiee → VALIDE
- PDF : 1393 → 35145 octets apres signature (33 Ko de signature crypto)

### Ce qu'on peut legitimement dire
- "Signature electronique avancee (AES) conforme eIDAS Article 26"
- "PAdES PKCS#7 verifiable par Adobe Acrobat Reader"
- "Horodatage tiers RFC 3161 + hash SHA-256 + audit trail hash-chained"
- "Heberge en France a Roubaix — souverainete totale"
- "Validite juridique — Code civil articles 1366 et 1367"

### Ce qu'on ne dit PAS
- "Horodatage qualifie eIDAS" (FreeTSA non qualifie)
- "Certificat emis par autorite de confiance" (auto-signe)
- "Signature qualifiee (QES)" (nous ne sommes pas QES)

### Nuances connues (non bloquantes pour AES)
1. FreeTSA n'est pas dans la EU Trusted List — valide pour AES, pas pour QES
2. Certificat auto-signe — Acrobat montrera "identite non verifiee" (cert AC ~150€/an prevu)
3. Identification declarative — renforcee par attestation du professionnel JADOMI

### Architecture
- **DocuSeal** : moteur de signature (Docker, port 3100, auto-heberge)
- **JADOMI Sign** : couche premium (lib/jadomi-sign.js v2.0)
  - Signature PAdES integree au PDF (@signpdf + certificat PKCS12)
  - Hash SHA-256 anti-falsification
  - Horodatage TSA RFC 3161 (FreeTSA.org)
  - Piste d'audit immutable hash-chained
  - Verification OTP SMS (Twilio/OVH SMS)
  - QR code verification publique HMAC

### Fonctionnalites
- Signature manuscrite canvas HTML5 (dessin + adoption texte cursif)
- Wizard 4 etapes : Document → Destinataire → Options → Recapitulatif
- Upload PDF/images + templates DocuSeal
- Autocomplete entreprises (API gouv.fr)
- Roles signataire : Client, Patient, Fournisseur, Partenaire, Avocat, Confrere
- Categories : Devis, Contrat, Mandat, Plan de traitement, Attestation, Facture
- Multi-signataires, rappels auto, delai configurable
- Gestionnaire documents : tri par categorie, date, statut
- Vue liste + grille, selection multiple, envoi par email
- Detail avec timeline audit trail hash-chained
- Page verification publique (/verify-signature)
- Verification OTP SMS avant signature (optionnel)

### REGLE OBLIGATOIRE
**Toute signature electronique dans JADOMI doit passer par JADOMI Sign.**
Cela inclut : contrats de mandat, devis BTP, devis dentaires, documents
avocat, tout document necessitant une signature.

### Fichiers cles
- signature.html (2306 lignes) — Module complet UI
- lib/jadomi-sign.js v2.0 — Moteur (PAdES, TSA, hash-chain, verification)
- lib/otp-sms.js — Verification SMS OTP signataire
- public/verify-signature.html — Page verification publique
- certs/jadomi-sign.p12 — Certificat PKCS12 pour PAdES
- docker/docuseal/docker-compose.yml — Config Docker DocuSeal
- sql/vitrines/57_signed_documents.sql — Table signed_documents

### Endpoints API
- GET /api/documents/signed — Liste documents signes (filtres avances)
- GET /api/documents/signed/:id — Detail document
- GET /api/documents/signed/:id/download — Telecharger PDF signe (PAdES)
- GET /api/documents/signed/:id/certificate — Telecharger certificat completion
- POST /api/documents/signed/:id/resend — Renvoyer demande signature
- POST /api/documents/signed/send-email — Envoyer documents par email
- POST /api/documents/request-signature — Creer demande signature
- GET /api/documents/categories — Arbre categories/sous-categories
- POST /api/webhooks/docuseal — Webhook DocuSeal (signature completee)
- GET /api/signatures/verify — Verification publique (sans auth)
- GET /api/docuseal/templates — Proxy templates DocuSeal
- POST /api/signatures/send-otp — Envoyer code SMS verification
- POST /api/signatures/verify-otp — Verifier code SMS

### Securite — Roadmap ameliorations
- [x] Hash SHA-256 document
- [x] Certificat de completion PDF
- [x] Verification publique HMAC + QR
- [x] Piste audit immutable hash-chained
- [x] Signature PAdES integree au PDF
- [x] Horodatage TSA externe (FreeTSA)
- [x] Verification OTP SMS signataire
- [x] AES eIDAS Article 26 — prouve et valide (27/04/2026)
- [ ] TSA qualifiee eIDAS (Certigna/Universign) — quand budget
- [ ] Verification piece d'identite (OCR) — Phase 2
- [ ] PAdES-LTV (Long Term Validation) — re-tampons periodiques
- [ ] Chiffrement E2E des PDFs (cle derivee mot de passe user)
- [ ] Backup off-site S3 OVH (docs signes)
- [ ] App mobile native signature
- [ ] Workflows conditionnels (si X signe → Y recoit)
- [ ] Signature qualifiee QES via partenaire certifie

### Dashboard Documents (organisation.html)
- Card CODEX ajoutee (Voir / Telecharger / Copier le lien)
- Section "Documents Signes" complete avec filtres, categories, selection
- Vue liste + grille, envoi par email, telecharger certificat

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

## Revenus marketplace GPO — Slots fournisseurs (historique)
| Tier | Prix/mois | Slots | Cible |
|---|---|---|---|
| Bronze | 0EUR | 1 | PME locales |
| Silver | 500EUR | 3 | Distributeurs regionaux |
| Gold | 1 500EUR | 8 | Distributeurs nationaux |
| Platinum | 4 000EUR | 20 | Henry Schein, DPI, GACD |

## Modele Fournisseurs — 3 Paliers (Passe 56)
JADOMI propose 3 niveaux de partenariat fournisseur :

### Bronze (gratuit) — pour tester
- Abonnement : 0EUR/mois
- Commission : 12% par vente (deduite du reversement)
- Visibilite : standard dans le catalogue
- Frais port >= 150EUR HT : a charge du fournisseur
- Ideal : petit fournisseur, < 20 commandes/mois

### Silver (pro) — le plus courant
- Abonnement : 299EUR/mois
- Commission : 5% par vente
- Visibilite accrue + badge Silver
- Priorite GPO : +1 position dans la file
- Acces stats avancees
- Rentable des 5 980EUR/mois de ventes
- Ideal : moyen fournisseur, 20-100 commandes/mois

### Gold (premium) — les gros
- Abonnement : 799EUR/mois
- Commission : 0%
- Visibilite maximale + badge Gold + 1ere position
- Priorite GPO : +3 positions
- Account manager dedie (quand equipe)
- Analytics premium
- Rentable des 6 658EUR/mois de ventes
- Ideal : gros fournisseur, 100+ commandes/mois

### Logique SAV simplifiee
- JADOMI = infrastructure (paiement, facturation, logistique)
- SAV produit = le fournisseur gere directement
- JADOMI met en contact client <-> fournisseur via messagerie
- Si fournisseur ne repond pas sous 48h : relance + score baisse
- Modele Doctolib : mise en relation, pas intermediation SAV

### Flux de paiement
1. Client paye par CB/PayPal via Stripe
2. JADOMI encaisse
3. Fournisseur livre
4. Apres confirmation livraison + 14 jours : JADOMI reverse
5. Reversement = montant commande - commission (selon palier) - frais port si applicable

## Architecture Marketplace Finale (Passe 56)

### Principe : JADOMI = Infrastructure, pas intermediaire
JADOMI est l'OS du B2B dentaire. Comme Doctolib pour les RDV,
JADOMI pour les achats : mise en relation + paiement + facturation.

### Ce que JADOMI gere
- Prise de commande (catalogue, panier, paiement CB/PayPal)
- Facturation electronique au nom du fournisseur (mandat art. 289 CGI)
- Encaissement + reversement J+14 apres livraison (Stripe Connect)
- Mise en relation client-fournisseur (messagerie integree)
- Signature electronique des mandats (JADOMI Sign AES eIDAS)

### Ce que JADOMI ne gere PAS
- Logistique (le fournisseur expedie avec son propre transporteur)
- SAV produit (le fournisseur gere directement avec le client)
- Calcul frais de port (le fournisseur propose, le client valide)
- Etiquettes transport (le fournisseur genere les siennes)

### Flux de commande
1. Dentiste commande + paye par CB
2. Fournisseur recoit notification anonyme (produits + region)
3. Fournisseur accepte → identite client revelee
4. Si < 150€ HT → fournisseur propose frais port → client valide
5. Fournisseur expedie + saisit tracking
6. Livraison confirmee → J+14 → JADOMI reverse (minus commission)
7. SAV = entre fournisseur et client via messagerie JADOMI

### Protection anti-demarchage (contractuelle, pas technique)
- Identite client revelee seulement apres acceptation commande
- Clause de non-demarchage dans le mandat (12 mois post-resiliation)
- Interdiction de marketing dans les colis
- Penalite 5 000€ par infraction
- Vrai lock-in = prix GPO + facilite + multi-fournisseur + facture auto

### Frais de port
- >= 150€ HT : livraison gratuite (fournisseur paye son transport)
- < 150€ HT : fournisseur propose ses frais → client valide ou refuse
- Pas de forfait JADOMI, le fournisseur connait ses propres tarifs

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

## Emails officiels JADOMI
- **contact@jadomi.fr** : email public (pages contact, CGV, mentions legales, footer, support utilisateur)
- **noreply@jadomi.fr** : emails automatiques (notifications, confirmations, factures, mailing)
- **karim_bahmed@yahoo.fr** : admin auth uniquement (NE JAMAIS afficher publiquement)
- REGLE : aucune page publique ne doit afficher l'email personnel du fondateur

## REGLE ABSOLUE — NE JAMAIS CASSER / SUPPRIMER (instauree Passe 67)
Apres l'incident catastrophique de la Passe 66 (audit 9 agents qui a
casse 60+ fichiers, routes, dashboards, navigation, securite), le
fondateur impose cette regle INVIOLABLE :
1. **NE JAMAIS supprimer** une route, un lien, un onglet, un dashboard
   ou une fonctionnalite existante sans demande EXPLICITE du fondateur.
2. **NE JAMAIS reorganiser** les middlewares Express ou l'ordre des routes
   dans server.js — l'ordre existant est FONCTIONNEL, le changer casse tout.
3. **NE JAMAIS faire d'audit massif** touchant 60+ fichiers en une seule
   passe — les audits doivent etre INCREMENTAUX (max 10 fichiers par audit).
4. **TOUJOURS tester** les routes critiques apres modification :
   / (landing), /index.html (dashboard), /ide, /orthodontiste,
   /prothesiste-dashboard, /chirurgiens-dentistes, /tarifs, /docs.
5. **TOUJOURS creer un backup** avant de modifier server.js, index.html,
   landing.html, organisation.html.
6. **Un audit ne doit JAMAIS** modifier la navigation, les liens, les
   redirections ou le comportement visible de l'application — seulement
   la securite interne (headers, validation, auth).
Violation = incident de production. Zero tolerance.

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
(Classic 19EUR/Pro 39EUR/Expert 69EUR), temoignages, 3 etapes, FAQ 6
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
- Classic 0EUR creation + 19EUR/mois (0 modif incluse, 49EUR/unite)
- Pro 149EUR creation + 39EUR/mois (CMS illimite) LE PLUS CHOISI
- Expert 299EUR creation + 69EUR/mois (CMS avance + Hollywood)
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
SQL 40 execute en prod par Karim.

## Passe 38 (24 avril 2026) -- Interventions IA automatiques sur sites existants
Moteur d'intervention IA qui modifie les sites des pros automatiquement.
Pipeline 8 etapes : charger credentials → connecter FTP/WordPress →
analyser demande via Claude Sonnet (JSON strict) → refuser si complexe →
backup SHA-256 (90j) → appliquer diffs chirurgicaux → verifier site 200 →
log duree + cout IA.
Securites : blacklist fichiers sensibles (wp-config, .env, .htaccess,
checkout), rollback auto si erreur, max 5/site/jour et 10/pro/jour.
API /api/studio/interventions/* (6 endpoints) : demande-libre, action-rapide,
status polling, historique, rollback, actions-rapides.
10 actions rapides predefinies : telephone, horaires, adresse, email,
couleur, photo, texte, optimiser images, avis Google, SEO.
Dashboard /studio/mes-sites/ : layout 2 colonnes avec preview iframe,
grid 10 actions rapides, demande libre, status temps reel, historique
avec rollback 1 clic.
SQL 41 : ALTER interventions (11 colonnes), CREATE backups + actions_predefinies.
Dependance : basic-ftp. Cout IA estime : ~5 centimes/intervention.
SQL 41 execute en prod.

## Passe 38b (24 avril 2026) -- 60 themes premium + creation sites JADOMI
60 themes CSS premium (20 par metier, partages dentiste+orthodontiste) :
- Classic (4/metier) : Clean, Standard, Modern, Fresh/Cabinet/Light/Civic
- Pro (6/metier) : Swiss, Nordic, Zen, Oxford, Trust, Artisan, etc.
- Expert (10/metier) : Ocean Deep, Obsidian, Aurora, Versailles, Film Noir,
  Horloger, Bauhaus, Cinema, Glassmorphism, Wabi-Sabi, etc.
Architecture : template HTML de base (_base/template.html) + CSS par theme.
Moteur generation sites (services/site-generator.js) : template → HTML final.
IA assistant (services/ia-assistant.js) : 3 suggestions texte/palette/photos.
API /api/studio/sites-jadomi/* (14 endpoints) : CRUD sites, upload, themes,
  suggestions IA, versions, rollback, changement theme, stub migration OVH.
Dashboard /studio/mon-site/ : cockpit 2 colonnes + wizard creation 5 etapes.
Routage /sites/:slug/ pour servir les sites clients generes.
SQL 42 : sites_jadomi, themes_sites (60 seeds), sections, versions, suggestions_ia.
SQL 43 : ajout colonne tier + 60 themes repartis classic/pro/expert.
Fix bug boucle infinie polling import-site.html (status undefined → poll eternel).
Fix validation URL permissive (normalise auto https://).
Fix colonne source_url → url_analysee (api/site-analysis).
SQL 41, 42, 43 executes en prod.

## Passe 41 (24 avril 2026) -- Chatbot Vitrines v3 premium
Redesign premium du chatbot creation de site (/vitrines/onboarding-v3.html).
Design editorial inspire du site Expert (Cormorant Garamond + Inter + palette creme/or/nuit).
Layout 50/50 conversation/preview, typing dots dores, upload drag-drop, device switcher.
Backend INCHANGE (api/vitrines/chat.js, 23 professions supportees).
Selecteur formule (Classic/Pro/Expert) au debut.
Galerie themes modale avec filtres + badges PRO/EXPERT (4/10/20 selon formule).
Systeme VISUAL_CHOICES palette (cards couleurs cliquables dans le stream IA).
CTA completion → dashboard /vitrines/mon-site.html.
Fix upload sequentiel photos (zone + reste visible, compteur, remove button).
Remotion compositions Expert (PhotosCinematic slideshow + VideoEnhanced intro/outro).
Base connaissances metiers (5 JSON : dentiste, orthodontiste, implantologue, prothesiste, avocat).
Generation contenu IA par metier (api/vitrines/generate-section, catalogues equipements/specialites).
SQL 44, 45, 46 pour formule_choisie, categories photos, vitrines_pages.

## Passe 42-43 (24 avril 2026) -- Workflow amelioration site existant
Cablage E2E des 3 briques (scanner P36 + credentials P37 + interventions P38).
Scanner P33 Puppeteer (casse) remplace par P36 Cheerio dans import-site.html.
Scanner enrichi : videos MP4/YouTube/Vimeo, PDFs, detection hebergeur DNS.
Fix test connexion WordPress (retrait /wp-admin de l'URL API REST).
import-assets.html refait : scores visuels + plateforme + medias + 3 modes.
3 modes amelioration : Staging (clone sans credentials) / Automatique (P37) / Nouveau site.
Backend staging : api/vitrines/staging (create, status) + scrape HTML/CSS/images.
staging-modifier.html : chatbot IA + iframe staging temps reel.
deploy-options.html : 3 options deploiement (ZIP/migration JADOMI/auto).
export-wizard.html : guide interactif WooCommerce (etapes + upload CSV/XML).
Table staging_sites. SQL 47.
TODO : executer SQL 44-47, integrer Stripe, mode Upload fichiers, guides Shopify/Prestashop.

## Passe 61 (28 avril 2026) -- 7 dashboards metiers + Audit securite profond
7 dashboards professionnels complets crees (Pattern A single-file tab-based) :
- public/osteopathe/dashboard.html (1589 lignes, theme violet #8b5cf6, 8 tabs)
- public/orthophoniste/dashboard.html (1714 lignes, theme cyan #06b6d4, 9 tabs)
- public/psychomotricien/dashboard.html (1574 lignes, theme pink #ec4899, 8 tabs)
- public/dieteticien/dashboard.html (1648 lignes, theme vert #22c55e, 9 tabs)
- public/sci-dashboard/dashboard.html (1370 lignes, theme bleu #3b82f6, 8 tabs)
- public/createur/dashboard.html (1346 lignes, theme orange #f97316, 8 tabs)
- public/bien-etre/dashboard.html (1704 lignes, theme fuchsia #d946ef, 10 tabs)
Chaque dashboard : sidebar accordeon, KPIs, modals CRUD, demo data, mobile responsive,
auth Supabase, PWA meta, toast notifications, empty states, filtres.
14 routes ajoutees dans server.js (7 + trailing slash).
7 landings enrichies avec bouton "Acceder au dashboard".
6 bugs fixes dans dashboards par reviewers (init incomplete + async auth).
Audit securite profond : 25 vulnerabilites trouvees (5 CRITICAL, 9 HIGH, 8 MEDIUM, 3 LOW).
15 corrections appliquees :
1. Auth ajoutee sur /api/scan/lookup et /api/scan/search
2. Admin check sur /api/suggestions/admin
3. Rate limit 5/h sur /api/equipment/propose
4. SQL static serving supprime (/sql/vitrines)
5. Upload limite a 25 MB (etait 500 MB)
6. XSS contenu_html sanitise (signature electronique)
7. Health endpoint stripped (plus d'info memoire/uptime)
8. SSRF protection sur scraper (IP privees bloquees)
9. Admin security-scan auth corrigee (email au lieu de role)
10. IDOR staging corrige (ownership check societe_id)
Re-audit final : 13/13 PASS.
TOTAL : 18 fichiers modifies, 11 020 lignes ajoutees.

## Passe 62 (28 avril 2026) -- Audit meticuleux complet + 36 corrections
6 agents d'audit deployes en parallele (server.js, dashboards, API backend,
scan/GPO/equipment, signature/juridique, landing/navigation).
113 problemes identifies, 36 corriges immediatement :
CRITIQUES corriges (9) :
- Path traversal /patient et /labo-pro (resolve + startsWith)
- Proxy Claude API sans auth (ajout auth + CORS strict)
- site-analysis JWT sans verification signature (→ supabase.auth.getUser)
- Open redirect mailing click tracking (whitelist domaines)
- Stripe webhook sans secret = rejete (plus de parsing brut)
- GPO route mismatch (flux fournisseur etait mort : aliases 307 ajoutes)
- Rate limit OTP public (3 SMS/15min, 10 verif/15min)
- ms-switcher.js + manifest.json copies dans public/ (12 dashboards fixes)
- Endpoint /api/ide/visite/:id/notes cree (notes etaient perdues)
HAUTS corriges (11) :
- 3 IDOR (communication, peremption, GPO confirm-counter)
- Body spread injection (SCI biens/locataires, mailing campagnes)
- Table GPO inexistante products → products_database
- PostgREST injection sanitisee (showroom, scan-engine, labo/stock)
- Path traversal espace-client upload
- Content-Disposition header injection (coffre + espace-client)
- File upload type validation (coffre + espace-client)
MOYENS corriges (8) :
- Password timing-safe (coffre + espace-client)
- HMAC token 16→32 chars + suppression fallback secret
- OTP TTL aligne 60s→5min
- Chatbot public rate limit 10/min/IP
Pages legales creees : cgv.html, mentions-legales.html, contact.html.
19 fichiers modifies, 757 lignes ajoutees.

## Passe 66 (28 avril 2026) -- Aide/FAQ/Forum + Dashboard infirmier + Rappels + Orthographe
La plus grosse passe de l'histoire du projet. 4 vagues d'agents (builders, reviewers,
analystes concurrence, correcteurs orthographe).

### Modules aide et support (4 modules)
1. Tickets Support : SQL 66, API /api/support (8 user + 4 admin endpoints), frontend
   /support/index.html + admin.html, satisfaction rating, SLA indicators
2. Tutoriels Video : 15 tutos interactifs, API /api/support/tutorials (4 endpoints),
   frontend /support/tutoriels.html, progress dashboard, step animations
3. Aide Contextuelle : widget JS /js/contextual-help.js, 9 contextes (stock, orga,
   signature, timeline, facturation, etc.), FAQ accordion inline, integre sur 11 pages
4. Forum Communaute : SQL 67, API /api/forum (12 endpoints), frontend /communaute,
   8 categories, reputation, tags, markdown, leaderboard, badges profession

### Analystes concurrence (18 features ajoutees)
- Zendesk/Freshdesk : auto-suggestions FAQ, detection priorite, reponses pre-ecrites
  admin, SLA indicators (vert/orange/rouge), FAQ inline contextuel
- Discourse/Stack : reputation points, tags/labels, markdown, topics lies, notifications
  sur reponse, badges profession (avantage concurrentiel JADOMI)
- Notion/Loom/Stripe : progress ring SVG, difficulty meter, step animations CSS,
  search groupee Algolia-style, feedback pouces, checklist onboarding, breadcrumbs

### Dashboard infirmier complet
- Dashboard /ide/dashboard.html (1800+ lignes), 9 onglets : Tableau de bord,
  Planning du jour, Patients, Soins recurrents, Ordonnances, Comptabilite,
  Mon cabinet, Infirmieres, Absences
- 33 endpoints API /api/ide/* deja existants branches
- 3 formules tarifaires : Essentiel 29EUR, Pro 49EUR, Premium 89EUR
- Feature gating : delai notifications (30/5/0 min), patients (30/illimite),
  tournees (1/multi/IA), rayon (5/15/30 km), acceptations (2/10/illimite)
- Flux patient -> infirmiere : page /ide/demande-soins.html (upload ordonnance,
  geocodage, recherche infirmiere par rayon, premiere arrivee premiere servie)
- SQL 68 : ide_demandes_soins + ide_abonnements
- Pages SEO par ville : /soins/:ville (dynamique, Schema.org MedicalBusiness)
- QR code + flyer imprimable dans le dashboard infirmiere

### Listes de diffusion mailing
- SQL 69 : mailing_lists, mailing_list_contacts, mailing_list_campaigns, mailing_packs
- API /api/mailing/lists (12 endpoints : CRUD, contacts, import CSV, envoi, stats, quota)
- UI 4 onglets dans mailing.html (Campagnes, Listes, Bases, Forfait)
- Pricing : 500 gratuit, 2500 a 5EUR, 10K a 15EUR, 50K a 49EUR, illimite 99EUR

### Rappels automatiques + SMS + Web Push
- SQL 70 : rappels_config, rappels_envois, sms_wallet, sms_packs, push_subscriptions
- lib/rappels-scheduler.js : cron 15 min, 9 templates (J-2, J-1, H-2, post-soin,
  recall 6 mois/1 an, anniversaire, avis Google, ordonnance expiration)
- lib/sms-sender.js : OVH SMS API avec mode simulation
- api/rappels.js : 9 endpoints (config, historique, stats, wallet SMS, packs)
- api/push.js : Web Push notifications (VAPID, service worker)
- Cascade intelligente : email (gratuit) -> push 6h (gratuit) -> SMS urgent (payant)
- Tracking pixel + bouton "Je confirme" / "J'annule" dans les emails
- 4 packs SMS : 100 a 8EUR, 500 a 35EUR, 1000 a 59EUR, 5000 a 249EUR
- Dashboard /rappels.html : config, historique, wallet SMS

### AIPD CNIL + documents juridiques
- docs/AIPD-JADOMI.html : analyse impact 10 pages, 5 risques, plan action HDS
- 15 questions pour l'avocate (eIDAS, HDS, B2B mailing, DPO, assurances...)
- CGV enrichies : Article 10 "Donnees de sante" (base legale, conservation, droits)
- Card AIPD dans dashboard Documents (organisation.html)

### Corrections orthographiques massives
- 40 agents deployes, ~3100 corrections d'accents sur tout le site
- Regle inscrite dans CLAUDE.md : zero tolerance orthographe a chaque passe
- Documents BASEPLAN (avocat, business plan) : ~1250 corrections

### Remplacement emails
- 28 occurrences karim_bahmed@yahoo.fr remplacees par contact@jadomi.fr / noreply@jadomi.fr
- Convention : contact@ (public), noreply@ (auto), perso (admin auth uniquement)
- Inscrit dans CODEX + CLAUDE.md

### Corrections reviewers (129 fixes)
- Tickets Support reviewer : 13 fixes (UUID validation, FK cascade, aria, keyboard)
- Tutoriels reviewer : 13 fixes (XSS, slug validation, loading/error states)
- Aide Contextuelle reviewer : 7 fixes (double-init, inline onclick, focus trap, z-index)
- Forum reviewer : 14 fixes (search injection, XSS sanitizer, view count inflation)
- Dashboard infirmier reviewer : 63 fixes (59 accents + 1 XSS + 2 bugs + 1 perf)
- Flux patient reviewer : 19 fixes (5 secu critiques + 1 bug + 13 accents)

Totaux Passe 66 : ~150 nouveaux endpoints API, ~20 nouvelles pages/composants,
5 migrations SQL (66-70), ~3100 corrections orthographe, 129 bugs/vulns corriges,
18 features concurrentielles, ~15000 lignes de code ajoutees.

## Passe 68 (30 avril 2026) -- Module IDE infirmiere complet
La passe la plus ambitieuse pour le vertical infirmier. Aucun concurrent
francais ne propose l'ensemble de ces features.

Fichiers crees (6) :
- public/ide/manifest.json + sw.js (PWA installable)
- public/patient/js/pages/mes-visites.js (confirmation GPS patient)
- public/assets/icons/ide-192.svg
- docs/courrier-ars-preuve-passage.html + courrier-cpam-tracabilite.html

Fichiers modifies (22) :
- public/ide/dashboard.html : planning pro multi-vue, mode tournee active,
  preuve passage GPS, scanner ordonnance IA, dictee vocale, capture media,
  mode hors ligne, pharmacie dans tournee, rotation 3 jours, optimisation
  intelligente insuline/Alzheimer, attestation extractible, donnees demo Marrakech
- server.js : 4 nouveaux endpoints (checkin, send-medecin, confirm-visit,
  analyser ordonnance), JADOMI Sign branche sur contrats remplacement
- public/infirmiers.html : page vitrine refaite 2x (21→6 features + 7→4 killers)
- public/professions-paramedicales.html : lien infirmiers corrige, topbar supprimee
- public/login.html : nettoyage auth, redirections propres
- public/organisation.html : auth guard inline, carte infirmiere mise en valeur,
  courriers ARS/CPAM dans documents
- public/patient/index.html + profil.js : onglet visites + flag representant
- 10 pages vitrines : liens .html nettoyes, topbar supprimee

SQL deploye : CREATE TABLE ide_preuves_passage (prod Supabase)

28 fichiers modifies, 3584 insertions, 473 suppressions.

## Passe 69 (1 mai 2026) -- App livreur GPS + 11 pages prothesiste + fix IDE planning
La passe la plus massive pour le vertical prothesiste : tout le backend
de la Passe 65 (119 endpoints, 28 tables) a enfin son frontend complet.

### App Livreur Prothesiste (GPS temps reel)
Systeme complet de suivi de livraison prothesiste ↔ cabinet dentaire :
- App mobile livreur PWA (public/labo/livreur-app.html, 1213 lignes)
  - Auth par token (pas de compte Supabase necessaire)
  - Feuille de route step-by-step, gros boutons mobile
  - GPS tracking toutes les 30s (watchPosition)
  - Navigation Waze/Google Maps 1 tap
  - Boutons "Termine" / "Absent" / "J'arrive bientot"
  - Notification automatique au dentiste a chaque etape
- Page suivi admin temps reel (public/labo/suivi-livreurs.html, 840 lignes)
  - Carte Leaflet + OpenStreetMap dark tiles
  - Positions livreurs en direct, refresh 15s
  - Panel livreurs : progression, prochain arret, ETA
  - Recherche par nom dentiste (quand un dentiste appelle)
  - Generation lien app pour le livreur
- Backend : 7 nouveaux endpoints /api/labo/tournees/app/*
  (position, demarrer, arret/valider, notifier-arrivee, terminer)
  + generer-token + positions/live
- SQL 72 : ALTER labo_livreurs (+5 colonnes token/GPS),
  CREATE labo_positions_livreur, CREATE labo_notifications_dentiste
  + 9 index + RLS complet. Execute en prod.

### 11 pages frontend dashboard prothesiste (TOUTES NOUVELLES)
Sidebar reorganisee en 6 sections avec 22 liens au total.
Fichiers crees (11 pages, ~8800 lignes frontend) :
- public/labo/production.html (766 l) — Kanban 8 etapes, QR code, stats
- public/labo/remakes.html (698 l) — Refabrications, causes, qualite
- public/labo/techniciens.html (600 l) — CRUD techniciens + KPI, export CSV
- public/labo/garanties.html (783 l) — Garanties par type, reclamations, config
- public/labo/planning.html (864 l) — Planning hebdo techniciens + conges
- public/labo/chat.html (664 l) — Chat temps reel dentiste-labo, 2 panels
- public/labo/expeditions.html (849 l) — Expeditions, tracking timeline, etiquettes
- public/labo/shade.html (687 l) — Shade IA Claude Vision, colorimetrie [PREMIUM]
- public/labo/maintenance.html (724 l) — Machines, interventions, alertes [PREMIUM]
- public/labo/fichiers3d.html (764 l) — STL/OBJ/PLY upload, versions, validation [PREMIUM]
- public/labo/reseau.html (1420 l) — Reseau solidaire 5 onglets (annuaire,
  profil, annonces, achats groupes, entraide), charte 100% France

### Fix dashboard IDE infirmiere (planning)
Fichier modifie : public/ide/dashboard.html (3600→4760 lignes)
- FIX "Generer le planning" : messages clairs (X visites/Y jours, ou "ajoutez
  des soins recurrents"), plus de "mode demonstration" silencieux
- FIX "Rappel" : rappels visibles pour toutes les dates + header sticky
- AJOUT "+ RDV" : modal complet creation RDV patient avec :
  - Recherche patient existant ou creation nouveau inline
  - Niveau de criticite (1x/jour, 2x/jour, prioritaire, urgent)
  - Disponibilite patient (matin, apres-midi, apres 16h, flexible)
  - Creneau auto-suggere par l'IA selon dispo + criticite
  - Type de soin, infirmiere, duree
- AJOUT Notes/Taches : 3 types (rappel, tache a faire, note), taches cochables
- FIX Navigation : bouton home topbar, bouton "Retour" en plein ecran
- FIX Mobile : FAB "+" flottant, toolbar responsive, bouton "Accueil"

Total Passe 69 : 13 nouvelles pages, ~10000 lignes de code, 7 endpoints,
3 tables SQL, sidebar prothesiste completee de 8 a 22 liens.

## Passe 70 (1 mai 2026) -- Pub video tournees + simulation Nord + notifications travaux + fixes

### Corrections navigation (bugs Passe 69)
- Fix acces rapide "Cabinet dentaire" : pointait vers landing.html (vitrine)
  au lieu du dashboard dentiste. Nouvelle route /dentiste dans server.js.
- Fix mapping MR cabinet_dentaire : index.html → /dentiste
- Fix comptabilite IDE : supprime le data-gate="compta" qui bloquait
  le module comptabilite derriere la formule Pro. Maintenant accessible
  a tous comme dans les autres dashboards (kine, podologue, sage-femme...).
- Ajout section "JADOMI Studio" dans acces rapide : 4 cartes (Creer un site,
  Mon site CMS, Mes sites, Apercu) + filtre Studio.

### Simulation tournees Nord de la France
- SQL sql/labo/80_simulation_tournees_nord.sql : 160 dentistes (40 par
  secteur × 4 coursiers), semaine complete 5-10 mai 2026.
- 4 coursiers avec tokens app mobile.
- 48 tournees, 960 demandes de passage, 960 arrets.
- Scenario LIVE : coursier en route vers le cabinet Dr Bahmed avec
  notifications et positions GPS simulees.
- Villes : Lille, Roubaix, Tourcoing, Wattrelos, Croix, Villeneuve-d'Ascq,
  Marcq-en-Baroeul, Mons, Hem, Armentieres, Lambersart, La Madeleine,
  Lomme, Loos, Seclin, Halluin, Houplines, Saint-Andre, Forest, Sainghin.

### Notification liste des travaux au depart coursier (FEATURE)
- Nouvelle fonction notifierDentistesDepart() dans routes/labo/tournees-livreur.js
- Au demarrage d'une tournee (dashboard ou app livreur), chaque dentiste
  de la feuille de route recoit une notification avec :
  • La liste complete de ses travaux (references, type livraison/recuperation, nb colis)
  • Le nom du coursier et le creneau (matin/apres-midi)
  • Message "Verifiez que tout est en ordre avant son arrivee"
- Double notification : labo_notifications_dentiste + pushNotification (cloche dentiste)
- Permet a la secretaire d'anticiper : si un travail manque, decaler le patient.

### Dashboard labo — section tournees
- Ajout bloc "Tournees de la semaine" sur le dashboard principal prothesiste
  avec 5 KPI (tournees, livrees, en attente, en cours, km) + liste tournees du jour.
- Fix feature gate : le fondateur (karim_bahmed@yahoo.fr) bypass le gate
  pour tester toutes les fonctionnalites.

### Video pub Remotion — TourneesPub (48.5s, 1080p)
- Composition remotion/compositions/TourneesPub.tsx : 8 scenes motion graphics
  avec personnages SVG, van JADOMI, batiments, notifications.
- Scene 0 : Intro accroche "Au plus pres des prothesistes, des livreurs
  et des dentistes. La livraison de protheses, reinventee."
- Scene 1 : Le labo finalise et cree le BL
- Scene 2 : L'assistante dentaire recoit la liste des travaux (telephone,
  notification pop, bulle reaction)
- Scene 3 : Van coursier route avec feuille de route 620px, GPS trail
- Scene 4 : Notification approche "8 min", assistante prepare
- Scene 5 : Arrivee, echange colis, validation passage + confettis
- Scene 6 : Suivi GPS 4 coursiers temps reel carte Nord
- Scene 7 : CTA "Vos livraisons meritent l'excellence"
- Musique synthetique generee (50s, 108 BPM, nappes + kick + melodie)
- Aucun vrai nom dans la video ni sur les pages publiques.
- Video integree en autoplay sur la page vitrine prothesistes-dentaires.html.

### Page vitrine prothesistes-dentaires.html — section tournees
- 8 etapes visuelles en timeline avec mockups interactifs :
  01 Le labo prepare, 02 Feuille de route, 03 Anticipation (liste travaux),
  04 Recalcul intelligent, 05 Notification temps reel, 06 Preparation cabinet,
  07 Validation passage, 08 Suivi GPS temps reel.
- KPI bar : 40 arrets/coursier/jour, -35% km, 8 min anticipation, GPS live.
- Video pub integree sous le titre avec autoplay muted loop.
- Zero noms reels : tous remplaces par "Cabinet A.", "Coursier B", etc.

### Fichiers modifies
- server.js : route /dentiste ajoutee
- organisation.html : fix acces rapide cabinet dentaire + ajout section Studio
- public/ide/dashboard.html : supprime gate compta
- public/labo/dashboard.html : section tournees semaine + loadTourneesWeek()
- public/prothesistes-dentaires.html : section tournees 8 etapes + video
- routes/labo/tournees-livreur.js : notifierDentistesDepart()
- routes/labo/feature-gate.js : bypass fondateur
- remotion/Root.tsx : TourneesPub composition
- remotion/compositions/TourneesPub.tsx : 8 scenes motion graphics (NOUVEAU)
- remotion/compositions/TourneesLivreurDemo.tsx : version mockup UI (NOUVEAU)
- sql/labo/80_simulation_tournees_nord.sql : simulation 160 dentistes Nord (NOUVEAU)
- public/assets/videos/tournees-pub.mp4 : video 48.5s 1080p (NOUVEAU)
- public/assets/audio/tournees-music.mp3 : musique synthetique 50s (NOUVEAU)

Total Passe 70 : 2 compositions Remotion, 1 SQL simulation, 1 feature backend,
13 fichiers modifies, video pub 48.5s deployee.

## Passe 71 (3 mai 2026) -- Refonte prothesiste + Module Patient/Case + Dashboards API

### Refonte positionnement prothesiste
- Nettoyage formules pricing (suppression features fantomes)
- Carrousel features + suppression jargon kanban
- Protocole photo transforme en fil de suivi par cas
- Ouverture page prothesistes + Label Jadomi + video 13 features

### Module Patient + Case V1
- Module patient CRUD + case prothetique
- Dashboard Mes Cas + Mes Patients branches API
- Fix SQL RLS pour securite des donnees patients

Fichiers : public/prothesistes-dentaires.html, routes/labo/, public/labo/dashboard.html,
sql/labo/ (RLS fix).

## Passe 72 (3 mai 2026) -- Refonte cascade demos + realignement tarifs CMS marche

### Cascade qualitative des 3 sites demos
- Ancien Pro (Playfair/Inter) promu en nouveau Classic (meme design, bandeau Classic)
- Ancien Expert (Cormorant Garamond premium) promu en nouveau Pro (bandeau Pro)
- Nouveau Expert INEDIT cree : design dark cinematique (#0A0A0B), video hero
  autoplay plein ecran (expert-hero.mp4), grain film SVG, animations entree
  sequentielles (fadeUp staggered), cards expertise hover gold bar, galerie
  masonry 12-col asymetrique, boutons pill dores, typography Playfair Display + Inter,
  responsive complet, aria-labels accessibilite.

### Realignement tarifaire CMS sur marche francais
Anciens prix : Classic 29EUR/Pro 49-79EUR/Expert 199EUR (creation 199-899EUR)
Nouveaux prix : Classic 19EUR/Pro 39EUR/Expert 69EUR (creation 0/149/299EUR)
Position vs concurrence :
- Mon Site Dentiste : 19EUR → JADOMI Classic = 19EUR (aligne)
- Denti-site.fr : 38EUR → JADOMI Pro = 39EUR (bat avec meilleur design)
- LSF : 49-129EUR → JADOMI Expert = 69EUR (ecrase en qualite)

### Fichiers tarifs modifies (11 fichiers)
- public/studio/onboarding/index.html (cards + constante PRIX)
- public/studio/cms/index.html (fallback prix)
- public/vitrines/onboarding-v3.html (formule selector)
- public/vitrines/import-assets.html (prix Pro)
- public/index-v2.html (cards formules + FAQ + pillar desc)
- docs/DOSSIER-AVOCAT-JADOMI.html (tableau revenus + modules)
- docs/dossier-avocat-jadomi.html (2 occurrences)
- docs/business-plan-jadomi.html (2 occurrences)
- docs/CODEX-JADOMI.html (module CMS)
- sql/vitrines/39_cms_formules.sql (seeds forfaits)

### Orthographe
14 corrections accents dans Classic (demonstration, conventionné, accessibilité,
complète, problematiques, detartrage, devitalisations, realises, protheses,
adaptees, qualite, ou, adaptee, meme, secretariat, journee, a Paris).

NOTE IMPORTANTE : les tarifs JADOMI plateforme (Essentiel 29EUR, Standard 79EUR,
Premium 199EUR, Signature 279EUR) sont INCHANGES. Seul le module CMS Sites
Vitrines a sa propre tarification 19/39/69EUR, distincte des abonnements plateforme.

Confirmation : aucune reference aux anciens prix CMS ne subsiste.
Confirmation : tarifs JADOMI plateforme principale INCHANGES.

## Passe 65 (28 avril 2026) -- Plateforme prothesiste complete + reseau solidarite
La plus grosse passe du projet. 15 nouveaux modules labo + dashboard complet.
1. Suivi production 8 etapes + QR code tracking (10 endpoints)
2. Gestion remakes/refabrications + analytics qualite (6 endpoints)
3. Techniciens CRUD + KPI dashboard labo complet (7 endpoints + CSV export)
4. Garanties par type prothese + reclamations (8 endpoints)
5. Chat temps reel dentiste-labo + portail magic link (10 endpoints)
6. Photo shade management + analyse IA Vision colorimetrie (7 endpoints)
7. Expeditions + tracking + etiquettes (9 endpoints)
8. Planning techniciens + conges + charge (8 endpoints)
9. Maintenance machines (four, fraiseuse, imprimante 3D) (9 endpoints)
10. Fichiers 3D STL/OBJ + validation portail dentiste (10 endpoints)
11. Portail patient suivi cas (PREMIERE MONDIALE) (3 endpoints)
12. Reseau solidarite prothesistes FR: annuaire, sous-traitance,
    achats groupes, entraide forum, charte 100% France (20 endpoints)
13. Achats groupes materiaux entre prothesistes (5 endpoints)
14. Dashboard prothesiste 2267 lignes, 15 onglets, theme #be185d
15. 3 formules tarifaires: Essentiel 49EUR, Pro 99EUR, Premium 179EUR
16. Feature gating middleware (21 features gatees)
17. Landing prothesiste enrichie + charte 100% France
9 corrections securite (4 CRITICAL IDOR, 2 HIGH, 3 MEDIUM)
SQL: 28 nouvelles tables, 77 RLS policies, 47 indexes
Total: 119 nouveaux endpoints API, ~10000 lignes de code

## Passe 64 (28 avril 2026) -- Billing API + getDatabaseStats RPC + xlsx→exceljs
3 chantiers :
1. API Billing : GET /api/billing/status + POST /api/billing/portail
   (Stripe Customer Portal). 3-layer subscription lookup (subscriptions →
   abonnements → societes), fallback gracieux sans Stripe, billing.html fixe.
2. getDatabaseStats() : 100K lignes en memoire → 0 lignes. RPC SQL
   get_database_stats() single call. Migration sql/services/64_database_stats_rpc.sql.
3. xlsx → exceljs : package abandonne (6 CVEs) remplace dans import-grille.js
   et commerce.js. Gestion formules, richText, Date ExcelJS.
5 corrections reviewers : stripe_customer_id leak → has_stripe boolean,
auth middleware deduplique, ExcelJS rich objects, richText/Date handling.
Fichiers : server.js, api/billing/index.js, services/products-database.js,
routes/labo/import-grille.js, api/multiSocietes/commerce.js, public/billing.html.

## Passe 63 (28 avril 2026) -- Voice Assistant + Factur-X PDF + GPO checkout
4 chantiers majeurs :
1. JADOMI Voice Assistant : assistant conversationnel Claude Sonnet integre
   dans dashboard principal. Web Speech API (STT/TTS) + 7 endpoints :
   recherche documents, renvoi par email, generation courriers IA,
   creation BL vocal labo, facture temps reel par dentiste.
2. Factur-X embarque dans PDF : XML EN 16931 integre comme piece jointe
   PDF (AF relationship Alternative), metadata XMP, conformite Sept 2026.
   Service pdf-generator.js enrichi (genererFacturePdfFacturX).
3. GPO checkout complet : webhook checkout.session.completed branche avec
   generation Factur-X commerce, emails confirmation client+fournisseur
   (vouvoiement), payout J+30, notification in-app fournisseur.
4. 13 corrections reviewers : XSS emails (escHtml), null guards profiles,
   doc.on error handlers PDF, AF Data→Alternative, scoping variables,
   unhandled promise .catch(), dentiste supprime skip batch.
Fichiers modifies : server.js, services/pdf-generator.js,
routes/labo/factures-labo.js, services/facturx-generator.js, index.html.

## Passe 77 (nuit 10->11 mai 2026) — JADOMI Copilot + Agenda World-Class
SESSION HISTORIQUE : naissance de JADOMI Copilot, le premier copilote IA
pour dentistes. Session marathon fondateur (~8h de travail non-stop).

### Agenda intelligent (tab-agenda.js + agenda.js API)
- Catalogue de 80 actes dentaires reels en 10 categories
  (Consultation, Conservateur, Endodontie, Parodontologie,
  Prothese conjointe, Prothese adjointe, Chirurgie, Orthodontie,
  Esthetique, Pedodontie)
- Durees realistes par acte (endo molaire 90min, detartrage 30min, etc.)
- Enchainements automatiques (empreinte couronne → pose 8j plus tard)
- API CRUD complete sans auth (mode test)
- Mode in-memory (pas besoin de Supabase pour tester)
- Seed optimise (planning propre) + seed chaos (planning burnout)
- Gestion chevauchements visuels (colonnes cote a cote)
- Correction fuseau horaire UTC/Paris

### Tracker temps + statut patient
- Statut patient : planifie → arrive → en_soin → termine / absent
- Boutons : Patient arrive / Absent / Demarrer le soin / Terminer
- Chrono en temps reel (MM:SS)
- Calcul retard patient (arrivee vs horaire prevu)
- Badges visuels sur les blocs RDV (vert=a l'heure, rouge=retard)
- Temps moyen par acte (apres X seances)

### JADOMI Copilot (barre flottante)
- Barre fixe en bas de l'ecran pendant le soin
- Chrono + nom patient + acte + point rouge pulsant
- Reconnaissance vocale Web Speech API (0€ de cout)
- Detection actes par mots-cles (composite, detartrage, extraction...)
- Arret vocal ("on a fini", "termine", "c'est bon")
- Transcription live + sauvegarde batchee toutes les 10s
- Mode chrono sans micro si micro indisponible

### Parametres personnalisables (localStorage)
- Heure debut/fin (9h-20h par defaut)
- Hauteur cellules (compact/normal/grand)
- Jours affiches (Lun-Ven / Lun-Sam / Lun-Dim)
- Couleurs par categorie (10 color pickers)
- Pause dejeuner configurable
- Alertes retard + actes lourds consecutifs

### Vue plein ecran
- Bouton "Plein ecran" avec cellules adaptatives
- Ligne rouge temps reel sur colonne du jour
- Marques demi-heure dans chaque cellule
- Touche Echap pour sortir

### Page JADOMI IA (jadomi-ia.html)
- Page dediee avec 6 cards premium (Agenda, Voice, Cas Cliniques,
  Snap Photos, Questionnaires, Mon Equipe)
- Accessible depuis Precision Dentaire → menu JADOMI IA
- Bouton "Retour au cabinet"
- Design glassmorphism dark premium

### Infrastructure
- Page verrou (gate) avec mot de passe Jadomi2026
- Correction bug "const res duplique" dans dentiste-pro.html
- Correction token auth multi-format (supabase_token, jadomi_session, sb-auth)
- robots.txt bloque tout (Disallow: /)
- Cache nginx desactive (dev mode)
- Fix handleLogout → /login.html au lieu de /
- Lien Cabinet dentaire → /admin/dentiste-pro dans organisation.html

### Cross-Search V2 (scraping)
- Ancien cross-search arrete (0 matches, URLs 404/403)
- Nouveau cross-search-v2.js : APIs directes (Venta + Henry Schein)
- GACD comme base de reference (38K produits)
- Rapports email automatiques tous les 500 produits
- En cours d'execution (~27h estimees)

### Fichiers crees/modifies
- CREE : public/admin/js/tab-agenda.js (2400+ lignes)
- CREE : api/dentiste-pro/agenda.js (960+ lignes, 80 actes)
- CREE : public/admin/jadomi-ia.html (page hub)
- CREE : scripts/cross-search-v2.js (750 lignes)
- MODIFIE : public/admin/dentiste-pro.html (bug fix, token multi-format)
- MODIFIE : index.html (cards JADOMI IA, hash navigation, scroll fix)
- MODIFIE : server.js (gate, routes, Permissions-Policy micro)
- MODIFIE : public/landing.html (lien /login sans .html)

## Session Studio 14-15 mai 2026 — ZENDO + Flyer Builder (VALIDÉ + EN COURS)

### PARTIE 1 : ZENDO Flyer & Landing (VALIDÉ — terminé)
Voir détails ci-dessous.

### PARTIE 2 : Flyer Builder Dashboard (EN COURS)
Construction d'un builder de flyers interactif avec IA.

**Livré et en prod :**
- API `api/studio/flyer-builder.js` — 1132 lignes
- Frontend `public/studio/flyer-builder/index.html` — 1759 lignes
- Moderator renforcé `lib/ai-studio/moderator.js` — 133 lignes
- Table Supabase `studio_flyer_projects` créée
- Template ZENDO en base (id: f90ed21a)
- 4 agents DeepSeek (rédacteur, designer, copywriter, photo advisor)
- Patron local gratuit (moteur de règles, 0 appel API)
- Fallback auto DeepSeek → Mistral → Claude
- Scraper Cheerio intelligent (trouve la page produit WooCommerce)
- Gemini edit-image (détourage, composite, amélioration)
- Recherche photos Unsplash intégrée
- Export PDF Puppeteer
- Hub Studio câblé (card Flyer → /studio/flyer-builder)
- Preview premium style ZENDO (4 pages A4)
- Modal edit image avec suggestions client-friendly
- Assistant IA interactif avec recommandations pro
- Barre de progression sur les slots

**Bugs connus à fixer :**
- Le détourage auto ne se déclenche pas toujours côté frontend
- Le bouton + (modifier) mouline parfois sans résultat visible
- Le scraper est fragile sur les sites non-WooCommerce
- La preview ne reflète pas toujours les dernières modifications

**Règle ABSOLUE Gemini :**
Chaque prompt envoyé à Gemini pour éditer une image DOIT inclure :
"UTILISE UNIQUEMENT le produit de cette image, NE le remplace PAS,
NE modifie PAS sa forme/couleur/design. Le produit = sujet principal."
Implémenté dans flyer-builder.js (routes /edit-image et /edit-image-url).

**8 erreurs documentées** dans feedback_flyer_builder_bugs.md — LIRE AVANT de toucher au builder.

### Erreurs commises à NE PLUS RÉPÉTER

**Architecture :**
- NE JAMAIS utiliser `prompt()` natif → toujours un modal stylé
- NE JAMAIS mélanger multer (FormData) et express.json() sur la même route → créer 2 routes séparées (/edit-image et /edit-image-url)
- NE JAMAIS envoyer un chemin relatif (/studio/...) à fetch() côté serveur → vérifier si local, lire avec fs.readFileSync
- NE JAMAIS utiliser `text.replace` sur du HTML dans un template string → ça casse les tags

**Scraping :**
- NE JAMAIS envoyer le message utilisateur complet comme product_name → extraire le nom du produit avec regex (filtrer mots génériques : camera, dentaire, scanner, etc.)
- NE JAMAIS prendre le premier slug qui matche → vérifier que c'est une page PRODUIT (add-to-cart) pas une CATÉGORIE
- NE JAMAIS comparer avec accents vs sans accents → normaliser NFD avant comparaison
- TOUJOURS essayer /produit/slug/ EN PREMIER (WooCommerce standard)
- TOUJOURS essayer les paires de mots avant les mots seuls (panda-free avant camera)

**DeepSeek :**
- DeepSeek renvoie souvent ```json ... ``` au lieu de JSON pur → toujours nettoyer les backticks avant JSON.parse
- DeepSeek invente des specs si on lui dit pas explicitement de ne pas le faire → ajouter "UNIQUEMENT les infos du contenu scrappé" dans le prompt
- Le MODERATION_SYSTEM_PROMPT trop agressif fait refuser les demandes légitimes → alléger pour les agents métier

**Frontend :**
- L'URL detection doit être AVANT l'appel orchestrate, pas après
- Les images externes (URLs) ne peuvent pas être fetch() par le navigateur (CORS) → passer par le serveur
- innerHTML supprime les overlays (progress bar) → vérifier avant de re-render

---

## Session Studio 14 mai 2026 — ZENDO Flyer & Landing Page (VALIDÉ)
Session de 4h. Création complète d'une landing page + flyer PDF premium
pour Dental Evolution (client loupes dentaires ZENDO).

### Résultats livrés
- Landing page interactive (fond noir, vidéos, animations) → `/studio/generated/zendo-flyer/`
- Flyer PDF 4 pages A4 (fond crème premium) → `zendo-flyer-2026.pdf`
- 9 vidéos Vidu (3 dentistes img2video, rotation 3D, etc.)
- Photos composites NanoBanana/Gemini (blonde + brun avec VRAIES loupes MultiVision)
- 5 produits détourés ImageMagick (vraie transparence PNG)
- Template ZENDO ajouté en base Supabase (studio_templates)
- Hub Studio mis à jour avec exemple ZENDO
- PDF envoyé par email au fondateur
- Backup complet dans backup-v7/ (55 fichiers)
- Coût total : ~$2.80

### Workflow validé (à reproduire pour tous les futurs flyers)
1. Upload vraies photos → Gemini édite (ouvre branches, détoure, composite)
2. Fondateur valide les photos AVANT vidéo
3. Vidu img2video (PAS text2video) avec photo validée
4. ImageMagick détourage (PAS Gemini → quadrillage)
5. Puppeteer PDF

### Erreurs à ne plus faire
- text2video pour loupes → Vidu invente ses propres loupes
- Gemini "transparent" → quadrillage baked dans l'image
- Confondre les modèles (Vision Direct ≠ Posture 45° ≠ MultiVision)
- Déclarer terminé sans vérifier visuellement

### Prochain chantier Studio
- **Flyer Builder** : dashboard visuel avec templates + slots images + NanoBanana/Vidu intégrés + export PDF/ZIP white-label. Le template ZENDO = premier template.
- **Intégration WordPress** : export white-label pour sites clients existants (reverse proxy ou ZIP statique)

---

## Passe 79 (12 mai 2026) — SESSION MONSTRE : Mistral IA + Comparateur + GPS + App Flutter
SESSION MARATHON (~10h). Analyse concurrence, integration Mistral,
comparateur de prix, triage urgence, scoring patient, scrapers,
carte GPS MapLibre, app Flutter améliorée.

### Analyse concurrentielle
- Matisse Dentaire (Substances Actives SAS) — logiciel dentaire, bon marketing
- rcpt.ai — télésecrétariat vocal IA, 100€/mois/praticien
- Dentelo — comparateur + stock, 29-130€/mois, 200K produits
- Coompy (Scan&Stock) — comparateur GRATUIT, 75K produits, affiliation
- CONSTAT : JADOMI a plus de features que tous mais mal présenté

### Intégration Mistral AI (IA française souveraine)
- SDK @mistralai/mistralai v2.2.1 installé
- Clé API JADOMI active (org 1f3e9c5e, tier Experiment gratuit)
- Endpoint POST /api/mistral créé
- Router IA POST /api/ia/router (Ollama → Mistral → Claude)
- Proxy /api/claude intercepte Haiku → Mistral Small auto (économie 15x)
- Architecture 3 niveaux : Ollama (0€) → Mistral (0.13€/M) → Claude (3€/M)
- Scan date péremption basculé sur le router IA (Pixtral si dispo)

### Comparateur de prix
- API GET /api/comparateur/search créée (172K produits, 16 fournisseurs FR)
- API GET /api/comparateur/product/:ref
- API GET /api/comparateur/stats
- Page publique /comparateur (accessible sans login, dark premium)
- Onglet "Comparateur prix" dans sidebar dashboard (remplace Flash Deals vide)
- Bouton "+ Panier" → GPO (au lieu de "Voir" qui renvoie chez le concurrent)
- Prix contrat affiché en doré (remise fournisseur configurée)
- Bouton "Voir" admin-only (détection JWT karim_bahmed@yahoo.fr)
- Prix comparés affichés après scan code-barres
- Nettoyage données : espagnol viré, doublons fusionnés, 204 prix aberrants purgés
- Validation import : prix > 0.10€ et < 50 000€

### Scrapers prix
- Cron scrape-all-apis.js corrigé (mauvais chemin)
- Cron réorganisé : APIs fiables d'abord (GACD Algolia, Venta ES, Henry Schein)
- Venta API rafraîchi : 78K produits (Doctor AI + Doctor Strong + Mega Dental)
- DGD scraper Cheerio créé (sans navigateur = indétectable, bypass anti-bot)
- DGD : 2164 produits extraits avec refs fabricant + vrais prix HT
- Fix prix DGD : article_prix (vrais prix) au lieu de gamme_prix (parasites)
- Rotation IP + proxy intégrés (ProxyScrape) pour anti-ban
- Crawlee + Playwright Firefox prêt (alternative Puppeteer)

### Triage urgence IA (17 motifs)
- 17 motifs d'urgence dentaire codés dans brain.js
  (infection, pulpite, fracture dent/appareil/bridge, descellement couronne/bridge
  court/long, hémorragie, alvéolite, trauma, avulsion, prothèse blessante, fil ortho,
  perte obturation)
- 4 niveaux : critique (🔴), haute (🟠), modérée (🟡), basse (🟢)
- Durées par défaut → praticien ajuste → IA apprend (moyenne 10 derniers actes)
- Intégré dans le modal RDV de l'agenda (bouton "Trier")
- Auto-remplit durée + notes avec le motif
- Endpoints /api/ia-secretary/triage et /urgence-motifs

### Scoring patient
- scorePatient() : fiabilité 0-100 (ponctualité, absences, annulations)
- No-show -15pts, absent excusé -3pts, retard >20min -8pts
- Annulation <2h -10pts, 2-24h -4pts, >24h -1pt
- Bonus fidélité (+5 si >10 RDV, +10 si >20 RDV)
- 5 niveaux : excellent/bon/moyen/risque/problématique
- Recommandations automatiques par niveau

### Absence patient améliorée
- 3 types : non excusé (no-show), excusé (a prévenu), annulé par cabinet
- Bouton "Annuler l'absence" (erreur de saisie) → restaure le RDV
- Score patient impacté différemment selon le type

### Planning chaos 3 mois
- seed-chaos étendu à 12 semaines (configurable)
- 2036 RDV générés, persistés en Supabase
- Lundi-vendredi, 9h-20h, planning blindé
- Double-booking, pas de pause midi, chirurgie à 18h
- Paramètre samedi configurable

### Proposer un autre créneau (amélioré)
- Filtre par jour de la semaine (Lundi, Mardi...)
- Filtre par plage horaire (entre 10h et 12h)
- Bouton "Chercher" qui rafraîchit les créneaux
- Pas de 15 min (au lieu de 30)
- Jusqu'à 8 résultats (au lieu de 5)

### Modules branchés dans server.js (6 nouveaux)
- /api/ia-secretary — Secrétaire IA (analyse, optimisation, vocal, multi-métier)
- /api/connector — Connecteur logiciel dentaire (Logos, Doctolib, CSV)
- /api/ia-doc — IA Documentaire
- /api/cas-clinique — Cas cliniques
- /api/questionnaire-medical — Questionnaire médical
- /api/snap — QR photos patients

### Infirmier ajouté dans brain.js
- 14 actes (toilette, injection, chimio, palliatif, sonde, stomie...)
- 9 règles d'or (géo-optimisation, jamais 3 toilettes de suite, pause palliatif)
- Horaires 06:30-19:00, rotation 3 jours, max 15 patients/tournée
- Total : 6 métiers (dentiste, médecin, kiné, orthodontiste, sage-femme, infirmier)

### App Flutter (jadomi-app) — 7 commits pushés
1. Settings cabinet : nouveaux patients, RDV en ligne, chat bridé, modules assistants
2. Fix 3 bugs bloquants : AppColors, logout, endpoint voice
3. Chat patient bridé : 5 msg/jour max, 200 car max, TextField disabled
4. Triage urgence dans agenda : badges 🔴🟠🟡🟢 + badge NEW + score patient
5. GPS réel : geolocator remplace simulation Paris (48.86, 2.35)
6. Carte MapLibre : widget JadomiMap réutilisable, markers numérotés, auto-fit bounds
7. Flow Uber livreur : LIVRÉ → bottom sheet → suivant auto → notif ETA dentiste
8. Message dentiste visible sur chaque arrêt de tournée
9. MapTiler key configurée (streets-v2-dark)

### Fichiers créés
- CREE : public/comparateur.html (page publique comparateur)
- CREE : scripts/scrape-dgd-cheerio.js (scraper DGD sans navigateur)
- CREE : scripts/scrape-dgd-fiches.js (scraper DGD Puppeteer + rotation IP)
- CREE : scripts/scrape-dgd-crawlee.js (scraper Crawlee + Playwright Firefox)
- CREE : scripts/match-scraped-to-products-v2.js (matching V2 par ref fabricant)
- CREE : jadomi-app/lib/services/gps_service.dart (GPS réel + geofencing)
- CREE : jadomi-app/lib/widgets/jadomi_map.dart (carte MapLibre)
- CREE : jadomi-app/lib/screens/settings_cabinet_screen.dart (paramètres cabinet)

### Fichiers modifiés
- server.js (Mistral client, endpoints comparateur/mistral/ia-router, validation prix)
- lib/ia-router.js (niveau Mistral ajouté, fallback cascade)
- lib/ia-secretary/brain.js (infirmier, triage urgence 17 motifs, scorePatient)
- api/ia-secretary/index.js (endpoints triage + urgence-motifs)
- api/dentiste-pro/agenda.js (seed-chaos 12 semaines, sauvegarde Supabase)
- index.html (comparateur intégré, scan→prix, Flash Deals viré, admin detection)
- public/admin/js/tab-agenda.js (triage urgence modal, absence 3 types, replan filtré)
- scripts/cron-scrape-all.sh (APIs d'abord, Puppeteer en fallback)
- scripts/scrape-venta-api.js (ref_fabricant capturée)
- jadomi-app : 8 fichiers Flutter modifiés/créés

## Passe 81 (16 mai 2026) — GPS Navigation Infirmier(e) + Organisation Mobile

SESSION MARATHON. Construction complete du systeme de navigation GPS
turn-by-turn pour les infirmier(e)s, style Waze/Google Maps.

### GPS Navigation Infirmier — JADOMI Maps v2
- Carte Leaflet plein ecran avec bottom sheet (patient en cours + suivant + km + ETA)
- Itineraire OSRM complet avec distances/temps par segment
- Plugin **leaflet-rotate** : carte tourne dans la direction du deplacement
- Boussole toggle Nord/Bearing (mode Waze)
- Voiture infirmiere SVG (croix medicale, phares, roues) au lieu de fleche
- Point bleu pulsant en vue d'ensemble, voiture en navigation
- Fleches directionnelles bleues le long du trace de route
- Card patient a la destination (nom, heure, soin)
- Instructions aux intersections (tournez a droite/gauche, rond-point, arrivee)
  avec marqueurs ronds SVG sur la carte
- Indicateur de vitesse (km/h) rond noir
- Horloge live sur la carte
- Heure actuelle + heure d'arrivee estimee dans le panneau
- GPS simulation sur desktop (voiture qui avance le long de la route)
- Banniere rouge "Aucune donnee GPS" comme Waze
- Detection "Position approximative" iOS + popup guide utilisateur
- **Snap-to-route** : projection GPS sur la route OSRM (precision ~0-5m)

### Boutons Navigation
- **Arrive** (vert) : enregistre preuve GPS (lat, lng, accuracy, timestamp)
  en base Supabase — justificatif CPAM/assurance
- **Absent** (rouge, croix) : no-show, impact scoring patient
- **Annule** (orange, trait) : patient a prevenu, moins grave
- **Suivant** (bleu) : marque arrive + nav auto vers le prochain
- Compteur patients restants visible

### Statuts visuels noms patients
- Vert + pastille : patient a vu la notification
- Orange + pastille : pas encore vu
- Rouge + croix : absent (no-show)
- Orange barre : annule (a prevenu)
- Vert + check : visite terminee

### POI sur la carte
- Pharmacies + stations essence via Overpass API (rayon 800m)
- Emojis cliquables avec popup nom

### Alertes communautaires (style Waze)
- Table Supabase `alertes_route` (7 types, expiration 2h, RLS)
- Endpoints GET/POST /api/ide/alertes-route
- Bouton signaler flottant : travaux, bouchon, accident, route barree,
  police, danger, verglas
- Les utilisateurs JADOMI renseignent les autres en temps reel

### Vue patient temps reel (Uber-like)
- Page /patient/suivi-infirmier.html (acces via lien unique token)
- Carte avec position live de l'infirmier(e) (polling 5s)
- ETA en gros, nom infirmier(e), soin prevu
- Bouton "Je ne serai pas la" → signale absence
- Endpoints : GET /api/ide/visite/:id/tracking-live, POST patient-absent
- Endpoint demo : /api/ide/visite/demo/tracking-live

### Organisation mobile
- Hamburger menu + bottom nav (5 onglets) + slide panel
- Top bar fixe JADOMI + deconnexion
- Menu slide : Administration, Documents, Studio, Acces rapides
- Liens vers tous les dashboards metiers

### SQL
- sql/82_alertes_route.sql : table alertes communautaires + index + RLS

### Fichiers crees
- CREE : public/patient/suivi-infirmier.html (vue patient Uber-like)
- CREE : sql/82_alertes_route.sql (alertes communautaires)

### Fichiers modifies
- public/ide/dashboard.html (+2500 lignes GPS navigation)
- server.js (endpoints tracking-live, patient-absent, alertes-route, demo)
- organisation.html (navigation mobile)

### Prochain chantier
- Brancher le meme GPS navigation dans l'app livreur prothesiste
  (public/labo/livreur-app.html) — meme code, labels differents
- Vue dentiste temps reel (comme vue patient)
- Tracker lecture notification (notif_viewed)
- Scoring patient (no-show, annulations)

---

===============================================================
# ⚠ ATTENTION — TACHES CRITIQUES A PREVOIR
===============================================================

Les taches ci-dessous sont PLANIFIEES et doivent etre traitees dans
les prochaines passes. NE PAS les oublier.

## 🟢 BUILD FLUTTER FIXÉ (Passe 81)
7 erreurs corrigées, flutter analyze = 0 erreur.
Build iOS uploadé sur App Store Connect (build 36).
Permissions Info.plist ajoutées : NSMicrophone, NSSpeechRecognition, NSLocation.
RESTE À FAIRE :
- [ ] Ajouter ITSAppUsesNonExemptEncryption=false dans Info.plist
  (export compliance — modifier directement sur GitHub)
- [ ] Relancer build iOS sur Codemagic → TestFlight
- [ ] Dashboard IDE infirmier : erreur 401 à investiguer (token auth)

## 🔴 CATALOGUE ZENDO — EN COURS
319 images NIC scrappées. Page sélection photos créée.
Template loupes = référence design (Playfair Display, cards crème/or).
RESTE À FAIRE :
- [ ] Karim sélectionne les bonnes photos (pas les boîtes)
- [ ] Reconstruire avec template exact du flyer loupes
- [ ] Photo couverture (NanoBanana — clé Gemini US à renouveler)
- [ ] Photo Irriflex pour Hypoclean
- [ ] Prix validés : 24,90-29,90€ catalogue, 22,90€ offre x10

## 🔵 VISION CABINET BRAIN + COPILOT (nouveau)
Architecture à rédiger : Desktop Agent (Tauri) + Cloud + Cabinet Brain
+ Mail Copilot (OAuth) + Connecteurs (Doctolib, Logos, caméras).
Document détaillé demandé par le fondateur.
Serveur HDS prévu pour héberger les données de santé.

## Comparateur — chantiers prioritaires (Passe 80)
- [ ] Cross-matching fournisseurs par ref fabricant (le coeur du comparateur)
- [ ] Prix REMISÉS au lieu de catalogue (Venta API special_price)
- [ ] Photos produits dans le comparateur
- [ ] Pages de vente style Matisse (SEO, conversion)
- [ ] Scraper DGD : relancer catégories manquantes (Cheerio bypass OK)
- [ ] Tester comparateur visuellement sur jadomi.fr

## App Flutter — à terminer (Passe 80)
- [ ] Carte MapLibre : corriger widget (erreurs compilation)
- [ ] Navigation turn-by-turn (Phase 2 : Valhalla Docker sur 2ème VPS)
- [ ] App patient JADOMI Care (recherche praticien, détection nouveau patient)
- [ ] Micro-animations et polish design
- [ ] Questionnaire patient (TODO dans patient_home_screen)

## Architecture (URGENT — avant tout ajout de feature)
⚠ REGLE ABSOLUE : Chaque metier = fichiers separes. On touche dentiste,
on casse PAS infirmiere, avocat, prothesiste, BTP, SCI. Cette regle
s'applique a CHAQUE organisation, CHAQUE metier, CHAQUE module.
Toujours agir de cette maniere. JAMAIS de big bang, JAMAIS de refacto
qui casse un autre module. Tester AVANT et APRES chaque modification.

- [ ] Separer index.html (10K lignes, 26 pages) en modules JS
      Chaque onglet dans son propre fichier :
      tab-stock.js, tab-analytics.js, tab-compta.js, tab-fournisseurs.js,
      tab-commandes.js, tab-communication.js, tab-economies.js, etc.
      index.html ne garde que le squelette (sidebar + topbar + conteneurs)
- [ ] Separer tab-agenda.js (2400 lignes) en core/copilot/settings/modals
- [ ] Separer agenda.js API (catalogue dans fichier separe)
- [ ] Appliquer la meme separation a TOUS les dashboards metier :
      /dentiste/ → ses fichiers
      /ide/ → ses fichiers
      /labo/ → ses fichiers
      /juridique/ → ses fichiers
      /btp/ → ses fichiers
      /medecin/ → ses fichiers
- [ ] Chaque onglet = 1 fichier. On touche un truc, on casse pas le reste.

## Agenda — features manquantes
- [ ] Multi-actes par seance (3 caries + detartrage = 1 creneau)
- [ ] Jours travailles personnalisables (pas le mercredi, samedi 1/2)
- [ ] Analyse IA planning sur plusieurs semaines (score burnout)
- [ ] JADOMI IA recommandations optimisation
- [ ] Prevu vs Realise (SANS double saisie — Copilot enregistre)
- [ ] Temps total incluant encaissement + prise RDV suivant
- [ ] Moyennes intelligentes par acte/praticien (apres X seances)

## Copilot — a finaliser
- [ ] Tester micro (reboot PC fondateur)
- [ ] Detection actes vocaux precis (numeros de dents 16, 26, 36)
- [ ] Traduction patient temps reel (a la demande)
- [ ] Multi-langues patient (arabe, turc, polonais — Roubaix)

## Scraping — comparateur prix (COEUR DE JADOMI)
⚠ REGLE ABSOLUE : A chaque nouvelle session Claude, VERIFIER que le
scraping/cross-search tourne, qu'il produit des resultats, et ameliorer
le matching si necessaire. Ne JAMAIS laisser un script tourner pour rien.
- [ ] Cross-search V2 en cours — surveiller les resultats
- [ ] Ameliorer matching (sous-refs, prix promo vs catalogue)
- [ ] Rapports email reguliers karim_bahmed@yahoo.fr
- [ ] Fournisseurs a matcher : GACD (base), DoctorStrong, DoctorAI,
      MegaDental, Henry Schein, DentalClick, Dentaltix,
      DentalGoodDeal, DPI (Dental Promotion), Gerho, Cap Dentaire,
      Dental Prive, Godentaire, Leone, Promodentaire
- [ ] Capturer prix catalogue ET prix promo (contrat -38% sur catalogue)
- [ ] 225 000+ refs scrapees — les mettre TOUTES en base Supabase

## Pages JADOMI IA
- [ ] Brancher Cas Cliniques aux vrais modules
- [ ] Brancher Snap Photos
- [ ] Brancher Questionnaires
- [ ] Brancher Mon Equipe

## IA locale
- [ ] Moteur de regles local (0€) pour cas simples
- [ ] Ollama (modele 7B CPU) pour NLP basique
- [ ] Claude API uniquement pour cas complexes
- [ ] Objectif : reduire couts IA de 70-80%

## API logiciels de gestion
- [ ] Connecteur LOGOS_w / Julie / Visiodent
- [ ] Eviter double saisie actes CCAM

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
28. **Tarifs CMS alignes marche** -- 19/39/69EUR/mois (Classic/Pro/Expert). Position imbattable face a Mon Site Dentiste (19EUR), Denti-site.fr (38EUR), LSF (49-129EUR). Marge brute preservee (~85% grace a infra R2/Cloudflare et automation IA). Creation : 0/149/299EUR. NOTE : tarification CMS distincte des abonnements plateforme JADOMI (Essentiel/Standard/Premium/Signature).
29. **Motion design > avatars** -- Focus Remotion + Sora 2 pour la generation video. Pas de Synthesia/HeyGen pour l'instant. Avatars humains plus tard quand traction validee.

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
- [x] Audit complet modules existants
- [x] Fix Scan & Stock : waterfall unifie + camera decoder + peremption Sonnet (Passe 51)
- [x] Base produits world-class : products_database + 8 scripts import (Passe 51)
- [x] Enrichissement EUDAMED EU : +13 406 produits, 19 321 EUDAMED total (Passe 51b)
- [x] Detection lignes "suivra"/reliquat sur factures : pas de stock (Passe 51b)
- [x] Contrats fournisseur type DPI : prix catalogue vs prix reel (Passe 51b)
- [x] Detection white label : meme produit sous marques differentes (Passe 51b)
- [x] Intelligence prix multi-fournisseurs : supplier_prices + insights (Passe 51)
- [x] Dashboard scan analytics : /admin/scan-stats.html (Passe 51)
- [x] Executer SQL scan/*.sql dans Supabase Dashboard [FAIT 26/04/2026]
- [x] JADOMI Compare + Intelligence Achats (Passe 52)
- [x] Renaming OEM → terminologie dentiste (Passe 52)
- [x] Endpoint /api/scan/search multi-resultats avec prix compares (Passe 52)
- [x] Onglet Economies JADOMI dans index.html (Passe 52)
- [x] Spend Analytics : depenses par categorie/fournisseur/mois (Passe 52)
- [x] Historique prix graphique par produit type CamelCamelCamel (Passe 52)
- [x] Alertes prix Price Watch (Passe 52)
- [x] Benchmark anonyme inter-cabinets (Passe 52)
- [x] GPO enrichi avec preuves prix marche fournisseurs (Passe 52)
- [x] Fix perf N+1 queries + doublon prix scan engine (Passe 52)
- [x] Executer SQL Passe 52 dans Supabase Dashboard [FAIT 26/04/2026]
- [ ] Lancer import GUDID : node scripts/import-gudid.js --all
- [ ] Lancer enrichissement IA : node scripts/enrich-products-ia.js
- [ ] Activer pgvector + embeddings : node scripts/generate-embeddings.js
- [ ] Lancer scrapers FR : node scripts/scrape-henry-schein.js + scrape-gacd.js
- [ ] Nettoyer 5 sites dupliques en BDD

- [x] JADOMI Care Network : reseau de soins interprofessionnel (Passe 53)
- [x] Strategie facturation GPO : Solution A "Revelation post-acceptation" (Passe 53)
- [x] Audit securite massif : 221 vulns identifiees, 136 corrigees sur 50 fichiers (Passe 54)
- [x] Infrastructure securite : headers, TLS 1.2+, UFW, backups, health check, integrite SHA-256 (Passe 54)
- [x] Supabase RLS : 39 policies deployees et testees (Passe 54)
- [x] MFA/2FA TOTP : endpoints + dashboard + Supabase admin active (Passe 54)
- [x] BASEPLAN v2.0 : 3 documents fondateur reecrits (Passe 54)
- [x] Dashboard securite + documents + 2FA parametres (Passe 54)
- [ ] Executer SQL 56 dans Supabase (security_reports)
- [ ] Executer migration SQL 53 dans Supabase (reseau de soins)
- [ ] Executer SQL 54 dans Supabase (table gpo_orders)
- [ ] Solution C "Mandat de facturation" (quand 50+ cabinets) — creation SAS/cooperative
- [x] Factur-X EN 16931 conforme (XML + PDF embarque) — reste Chorus Pro connecteur
- [ ] Passe 38 : Systeme JADOMI Coins (wallet tokens type PlayStation/Steam)
  - Packs : 100/500/1000/2500/10000 coins
  - Gamification : bonus quotidien, quetes, niveaux Bronze→Diamant
  - Integration abonnements : Standard 100 coins/mois, Premium 500, Elite 1500
  - SQL preparatoire deja cree : sql/vitrines/38_coins_wallet_structure.sql

- [x] 7 dashboards metiers complets : osteopathe, orthophoniste, psychomotricien, dieteticien, SCI, createur, bien-etre (Passe 61)
- [x] Audit securite profond : 25 vulns, 15 corrigees, re-audit 13/13 PASS (Passe 61)
- [x] 7 landings enrichies avec bouton "Acceder au dashboard" (Passe 61)
- [x] 14 routes server.js pour nouveaux dashboards (Passe 61)
- [ ] Configurer STRIPE_WEBHOOK_SECRET (CRITICAL — webhooks non verifies)
- [ ] Remplacer regex XSS signature par DOMPurify server-side
- [ ] Tester 7 nouveaux dashboards sur mobile reel
- [ ] Deployer en prod (pm2 reload)
- [x] JADOMI Voice Assistant : 7 endpoints + frontend integre (Passe 63)
- [x] Factur-X embarque dans PDF labo (PDF/A-3, AF Alternative) (Passe 63)
- [x] GPO checkout complet : Factur-X + emails + payout J+30 + notif (Passe 63)
- [x] 13 corrections reviewers securite/bugs (Passe 63)
- [x] API Billing : /api/billing/status + /portail Stripe (Passe 64)
- [x] getDatabaseStats RPC SQL (100K rows → 0) (Passe 64)
- [x] xlsx → exceljs migration (6 CVEs eliminees) (Passe 64)
- [x] 5 corrections reviewers billing+exceljs (Passe 64)
- [ ] Executer SQL 64 (get_database_stats RPC) dans Supabase Dashboard
- [x] Plateforme prothesiste complete : 15 modules labo, 119 endpoints (Passe 65)
- [x] Suivi production 8 etapes + QR code tracking labo (Passe 65)
- [x] Chat temps reel dentiste-labo + portail magic link (Passe 65)
- [x] Photo shade management + analyse IA Vision colorimetrie (Passe 65)
- [x] Fichiers 3D STL/OBJ + validation portail dentiste (Passe 65)
- [x] Portail patient suivi cas PREMIERE MONDIALE (Passe 65)
- [x] Reseau solidarite prothesistes FR : annuaire, sous-traitance, achats groupes (Passe 65)
- [x] Dashboard prothesiste 2267 lignes, 15 onglets (Passe 65)
- [x] 3 formules tarifaires prothesiste + feature gating middleware (Passe 65)
- [x] 9 corrections securite (4 CRITICAL IDOR, 2 HIGH, 3 MEDIUM) (Passe 65)
- [x] Module IDE infirmiere complet : tournees Waze, preuve passage, scanner ordo IA (Passe 68)
- [x] Preuve passage GPS certifiee : horodatage serveur + geofencing + signature patient (Passe 68)
- [x] Mode tournee active step-by-step : Waze/Maps, 1 tap termine, nav auto (Passe 68)
- [x] Scanner ordonnance IA Claude : extraction medicaments, alerte dosage, validation inf (Passe 68)
- [x] Dictee vocale + photo/video au medecin via Care Network (Passe 68)
- [x] App patient : confirmation visite GPS + flag representant distant (Passe 68)
- [x] PWA installable IDE (manifest + service worker) (Passe 68)
- [x] JADOMI Sign branche sur contrats remplacement IDE (Passe 68)
- [x] Page vitrine infirmiers optimisee : 6 features + 4 killers (Passe 68)
- [x] Auth guard inline localStorage (pas de cookie/middleware) (Passe 68)
- [x] Redirections .html 302 + liens internes nettoyes (Passe 68)
- [x] Table ide_preuves_passage deployee en prod Supabase (Passe 68)
- [ ] Executer MIGRATION_COMPLETE_65.sql dans Supabase Dashboard
- [x] App livreur PWA + tracking GPS temps reel (Passe 69)
- [x] Page suivi en direct admin carte Leaflet (Passe 69)
- [x] 7 endpoints app livreur (position, demarrer, valider, notifier) (Passe 69)
- [x] SQL 72 deploye : positions_livreur + notifications_dentiste (Passe 69)
- [x] 11 pages frontend prothesiste : production, remakes, techniciens, garanties, planning, chat, expeditions, shade, maintenance, fichiers3d, reseau (Passe 69)
- [x] Sidebar prothesiste reorganisee 6 sections, 22 liens (Passe 69)
- [x] Fix IDE planning : "Generer" messages clairs + rappels sticky (Passe 69)
- [x] IDE modal "+ RDV" : creation patient inline, criticite, dispo, creneau auto (Passe 69)
- [x] IDE notes/taches : 3 types, taches cochables (Passe 69)
- [x] IDE navigation : bouton home, retour plein ecran, FAB mobile (Passe 69)
- [x] Fix acces rapide Cabinet dentaire → pointait vers vitrine (Passe 70)
- [x] Fix comptabilite IDE accessible sans gate (Passe 70)
- [x] Ajout Studio dans acces rapide (Passe 70)
- [x] Notification liste travaux au depart coursier (Passe 70)
- [x] Dashboard labo : section tournees semaine (Passe 70)
- [x] Simulation 160 dentistes Nord SQL (Passe 70)
- [x] Video pub tournees Remotion 48.5s motion graphics (Passe 70)
- [x] Video integree sur page vitrine prothesistes (Passe 70)
- [x] Section tournees 8 etapes sur vitrine prothesistes (Passe 70)
- [x] Bypass feature gate pour fondateur (Passe 70)

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
- **2 soeurs** : Infirmieres liberales (motivation module IDE, test terrain)
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
- Schedulers GPO + Groupage loggent erreurs (normal tant que SQL pas execute)
- OVH necessite 3 cles dans .env (Karim doit les generer sur eu.api.ovh.com/createToken/)
- Test mobile iOS a verifier (autoplay video parfois bloque Safari)
- CSP unsafe-inline (dette technique — a remplacer par nonces/hashes quand refacto frontend)
- ~~npm xlsx abandonne (6 CVEs)~~ [CORRIGE Passe 64 — migre vers exceljs]
- STRIPE_WEBHOOK_SECRET non configure (webhook rejete si absent — configurer dans Stripe Dashboard)
- ~~billing.html n'existe pas~~ [CORRIGE Passe 64 — API billing + page fonctionnelle]
- Videos demo manquantes (demo-dentistes.mp4, demo-coiffeurs.mp4) — demo-prothesistes FAIT (Passe 70)
- ~~getDatabaseStats() charge 100K lignes en memoire~~ [CORRIGE Passe 64 — RPC SQL 0 rows]
- P12 certificat sans passphrase (stocker passphrase en env var)
- N+1 queries /api/achats/price-watches (batch needed)
- Navigation inconstante entre anciennes et nouvelles landings (nav .html vs sans)

## Corriges par Passe 65
- 4 CRITICAL IDOR : acces cross-labo sur production, remakes, techniciens, garanties → societe_id check
- 2 HIGH : auth manquante sur chat websocket + portail magic link sans expiration → fix
- 3 MEDIUM : XSS sur noms fichiers 3D upload, rate limit manquant sur forum solidarite, CSV injection export techniciens → sanitize

## Corriges par Passe 64
- stripe_customer_id expose au client → remplace par has_stripe boolean
- Auth middleware copie-colle dans billing → import depuis multiSocietes/middleware
- ExcelJS rich objects (formulas, richText, Date) → extraction .result/.richText/.toISOString
- Champ inutile stripe_subscription_id dans select societes → supprime
- Commerce headers+data richText/Date non geres → fix complet

## Corriges par Passe 63
- XSS emails GPO : inputs utilisateur non echappes dans HTML → escHtml() ajoute
- Coercion numerique quantity/price dans emails → Number() wrapping
- Scoping profiles dans webhook → variables declarees hors try/catch
- Fetch profiles dupliques (4→2 requetes) → consolidation
- Unhandled promise IIFE webhook → .catch() ajoute
- Null guard supplier_id/user_id → early return avec log
- AF relationship Factur-X Data→Alternative (conformite standard)
- doc.on('error') manquant sur 4 generateurs PDF → reject(err)
- Null checks facture/prothesiste/dentiste dans PDF generator
- Dentiste supprime dans batch /generer → continue + log (pas crash)

## Corriges par Passe 62
- Path traversal /patient et /labo-pro → resolve+startsWith
- Proxy Claude API sans auth → auth+CORS strict
- site-analysis JWT decode sans signature → supabase.auth.getUser
- Open redirect mailing → whitelist domaines jadomi.fr
- Stripe webhook sans secret → rejete (503)
- GPO route mismatch → aliases 307 (flux fournisseur retabli)
- OTP public sans rate limit → 3 SMS/15min + 10 verif/15min
- ms-switcher.js + manifest.json → copies dans public/
- Notes IDE jamais sauvegardees → endpoint PATCH cree
- 3 IDOR (communication, peremption, GPO confirm-counter) → societe_id check
- Body spread SCI/mailing → whitelist champs
- Table GPO products → products_database
- PostgREST injection → sanitisation %_,().
- Content-Disposition injection → RFC 5987 encodeURIComponent
- File upload sans filtre → whitelist extensions
- Password non timing-safe → crypto.timingSafeEqual
- HMAC 16→32 chars + fallback secret supprime
- OTP TTL 60s→5min (alignement message SMS)
- Chatbot public → rate limit 10/min/IP
- Pages legales creees : cgv.html, mentions-legales.html, contact.html

## Corriges par Passe 61
- Scan endpoints sans auth → requireAuth() ajoute (/api/scan/lookup, /api/scan/search)
- Suggestions admin accessible a tous → admin email check ajoute
- Equipment propose sans rate limit → 5/heure max
- SQL files publics → /sql/vitrines static serving supprime
- Upload 500 MB → reduit a 25 MB
- XSS contenu_html signature → sanitisation regex (script + on*)
- Health endpoint leak memoire/uptime → stripped a status+timestamp
- SSRF scraper → isPrivateUrl() bloque IPs privees/localhost/metadata
- Admin security-scan broken role check → email check
- Staging IDOR → ownership verification societe_id
- 3 dashboards init incomplete (osteopathe, SCI, createur) → corrige par reviewers
- 3 dashboards async auth race condition → await ajoute

## Corriges par Passe 51
- Waterfall scan barcode : etape IA simulee au frontend → unifie via 1 appel backend
- Camera barcode : flux video sans decodage → html5-qrcode branche, decode en temps reel
- Photo peremption : Haiku prompt basique → Sonnet expert + confidence score exploite
- FormData/JSON incohérent dans analyzePhotoDate() → JSON seul (corrige echec systematique)
- Compression photo 0.85 → 0.92 pour meilleure OCR
- Data URL prefix non strip avant envoi API → strip automatique cote backend

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
- Executer SQL 53 (reseau_soins) dans Supabase Dashboard
- ~~Executer SQL 56 (security_reports) dans Supabase Dashboard~~ [FAIT ✅ 26/04/2026]
- Ajouter permission 'reseau' aux membres equipe existants pour activer le module

## TODO Securite (Passe 54)
- ~~.env expose publiquement~~ [CORRIGE ✅]
- ~~18 IDOR corriges~~ [CORRIGE ✅]
- ~~7 SQL injections~~ [CORRIGE ✅]
- ~~18 mass assignment~~ [CORRIGE ✅]
- ~~RLS Supabase 39 policies~~ [DEPLOYE ✅]
- ~~MFA TOTP endpoints~~ [DEPLOYE ✅]
- ~~imap → imapflow migration~~ [FAIT ✅]
- ~~Auto-pentest script~~ [CREE ✅ — score 84/100]
- ~~Contrat mandat facturation PDF~~ [FAIT ✅ — endpoint + bouton dashboard]
- ~~Auto-pentest score 84/100~~ [FAIT ✅]
- Configurer fail2ban (apt-get toujours en cours — relancer apres)
- Activer Cloudflare free (WAF + DDoS gratuit) — Karim doit changer DNS OVH
- Remplacer xlsx par exceljs (6 CVEs restantes npm — chantier code)
- CSP strict sans unsafe-inline (refacto frontend necessaire — gros chantier)
- Fixer le dernier error leak sur route 404 generique (pentest FAIL mineur)
- ~~Ajouter pentest-jadomi.sh au cron mensuel~~ [FAIT ✅]

## Bugs Dashboard Documents — CORRIGES Passe 54
- ~~bouton Contrat Mandat ouvrait page signature~~ [CORRIGE — boutons Voir+Telecharger sur chaque carte]
- ~~bouton Envoyer email ne marchait pas~~ [CORRIGE — variable tk au lieu de db.auth.getSession]
- ~~page moulinait~~ [CORRIGE — doublon let mfaFactorId cassait tout le JS]
- ~~texte inputs noir sur fond sombre~~ [CORRIGE — color:#fff]
- ~~page signature erreur sans token~~ [CORRIGE — mode apercu]
- ~~manque envoi contrat au fournisseur~~ [CORRIGE — endpoint /api/facturation/mandates/send]
- ~~manque created_by dans supplier_mandates~~ [CORRIGE — retire du insert]
- ~~organisation.html doublon fichier racine vs public/~~ [CORRIGE — cp systematique]

## Etat Dashboard Documents (fin Passe 54)
5 cartes ar-card avec boutons Voir + Telecharger :
- Dossier Avocat (HTML)
- Business Plan (HTML)
- Dossier Juridique Complet (HTML)
- Contrat Mandat Facturation (PDF 6 pages, 12 articles niveau avocat d'affaires)
- Page Signature Fournisseur (apercu si pas de token)
2 blocs envoi cote a cote :
- Envoyer les 4 documents par email (3 HTML + 1 PDF)
- Envoyer le contrat a un fournisseur (autocompletion API gouv.fr, SIRET/ville auto)

## API Entreprise (Passe 54)
GET /api/entreprises/search?q=... — Recherche entreprise via recherche-entreprises.api.gouv.fr
Gratuit, sans cle, retourne nom/siren/siret/adresse/ville/activite.
Utilise dans le dashboard Documents pour autocompletion fournisseurs.

## Contrat Mandat Facturation (Passe 54)
PDF genere par lib/mandate-contract-pdf.js — 11 articles simplifies (Passe 56) :
Art.1 Objet (289-I-2 CGI), Art.2 Obligations JADOMI, Art.3 Obligations Fournisseur,
Art.4 Conditions financieres (3 paliers Bronze/Silver/Gold), Art.4b Frais livraison,
Art.4c Non-demarchage et protection commerciale (12 mois, penalite 5 000EUR),
Art.5 Coordonnees bancaires, Art.6 Duree/Resiliation,
Art.7 Acceptation electronique, Art.8 Loi applicable,
Art.9 SAV (fournisseur responsable, 48h, suspension apres 3 non-reponses),
Art.10 Paiement/Reversement (3 paliers, J+14 apres livraison),
Art.11 Expedition/Suivi (48h, fournisseur expedie avec son transporteur).
Endpoints : GET /api/facturation/mandate-template/pdf (modele vierge)
GET /api/facturation/mandate/:id/pdf (mandat specifique)
POST /api/facturation/mandates/send (creer + envoyer email signature au fournisseur)
Fichier PDF statique : docs/Modele-Mandat-Facturation-JADOMI.pdf

## Passe 58 (27 avril 2026) -- Gestionnaire documents + Signature electronique + Sidebar accordeon

### OTP Fix (3 bugs critiques)
- Fix code OTP incorrect : normalisation phone (E.164) avant cle store
- Timer 60s countdown live avec barre progression (bleu→orange→rouge)
- Bouton "Renvoyer le code" avec cooldown 30s anti-spam + feedback visuel
- TTL aligne serveur/front a 60 secondes

### PDF Contrat Complet
- PDF mandat passe de 5 lignes a 11 articles complets (juridiquement valide)
- Nom complet signataire + titre + IBAN masque + mentions eIDAS
- Plus de "SIRET : N/A"

### Gestionnaire Documents (index.html + server.js)
- POST /api/documents/upload (multer, PDF/JPG/PNG/DOCX, 20MB max)
- DELETE /api/documents/signed/:id (verification permissions)
- Vue dossiers par categorie (Contrats, Factures, Devis, Juridique, Avocat, Administratif)
- Modal upload drag & drop + filtres categorie/statut/recherche + pagination
- Champ "Nom du patient" pour devis dentaires (stocke dans metadata JSONB)
- Methode Builder/Reviewer : 12 corrections dont 1 IDOR critique, 5 XSS, path traversal

### Coffre-fort chiffre (categories sensibles)
- Categories Avocat/Juridique redirigees vers coffre-fort AES-256-GCM
- Badge cadenas sur dossiers sensibles, upload chiffre automatique
- Endpoint POST /api/avocat/coffre/dossiers ajoute

### Signature Electronique integree
- Onglet Signature dans index.html ET organisation.html (plus de redirect casse)
- Envoi documents a signer (destinataire, email, patient, type, upload)
- Tableau documents signes avec stats, badges statut, actions (PDF, certificat, renvoyer)

### Sidebar Accordeon Premium
- 7 categories cliquables dans index.html (hub dentiste)
- 3 categories dans organisation.html
- Fleche animee dans badge arrondi, hover glow subtil
- Etat ouvert/ferme persiste en localStorage
- Auto-ouverture du groupe parent a la navigation
- Style premium visible : titres #b0b8c8, hover blanc, badges accent

### Autocomplete Patients / Clients
- GET /api/clients/autocomplete?q= — recherche dans 3 sources (signed_documents metadata,
  avocat_clients, jadomi_clients_autocomplete)
- POST /api/clients/save — sauvegarde automatique du nom au submit
- Composant autocomplete sur les champs patient dans index.html et organisation.html
- Dropdown avec badges (Enregistre/Client), debounce 250ms, navigation clavier
- Le nom est sauvegarde automatiquement apres chaque envoi de document

### Dossier Avocat v3.0
- Rewrite complet: 12 sections, 45 questions (au lieu de 33), 15 articles CGV
- Nouvelles sections: Architecture Marketplace B2B, JADOMI Sign eIDAS, Coffre-fort Avocat, Finances/TVA
- 27 modules documentes, 33 documents a produire classes par priorite

### JADOMI Equipment — Systeme Groupon Equipement Dentaire
- Page formulaire fabricant/revendeur publique: /equipment/propose
  Design premium glassmorphism, paliers de prix dynamiques, upload photo, panier type revendeur
- API: POST /api/equipment/propose (public, rate limited)
  GET /api/equipment/proposals + PATCH status (admin)
  Notification email admin + confirmation fabricant automatique
- Onglet Equipment dans organisation.html: dissociation Dispositifs / Consommables
  Dispositifs: 12 fabricants (3Shape, Dentsply, Planmeca, KaVo, etc.) en 4 sous-categories
  Consommables: 12 fournisseurs (Ivoclar, 3M, Septodont, Straumann, etc.) en 5 sous-categories
- Email commercial HTML premium pret a envoyer aux fabricants
- Dashboard: tableau propositions recues, calcul benefices commission 10%, changement statut
- Lien formulaire copiable, email type, envoi par mail

### Commits Passe 58 (12 commits)
1. fix(sign): OTP timer 60s + resend + PDF contrat 11 articles
2. feat(docs): Gestionnaire documents complet — upload, dossiers, tri
3. feat(docs): Signature electronique integree + coffre-fort + champ patient
4. feat(sign): Onglet Signature electronique dans hub dentiste
5. feat(ui): Sidebar accordeon premium — categories cliquables
6. fix(ui): Sidebar accordeon — visibilite + toggle fonctionnel
7. feat(ux): Autocomplete patients/clients — 3 sources, sauvegarde auto
8. feat(legal): Dossier Avocat v3.0 — 12 sections, 45 questions, CGV v3.0
9. feat(equipment): JADOMI Equipment — onglet dashboard + emails fabricants
10. feat(equipment): Systeme complet — formulaire public + API + notifications
11. feat(equipment): Dissocier dispositifs medicaux / consommables
12. chore(codex): update final Passe 58

## Passe 57 (27 avril 2026) -- JADOMI Sign AES integre au mandat fournisseur
Integration complete de JADOMI Sign dans la page de signature du mandat.
Avant : simple checkbox + nom. Maintenant : flux AES complet.
- Canvas signature manuscrite (dessin + adoption texte cursif)
- Verification OTP SMS (endpoints publics /send-otp-public et /verify-otp-public)
- Telephone obligatoire dans le formulaire fournisseur
- Generation PDF PAdES du mandat signe (lib/jadomi-sign.js)
- Certificat de completion genere automatiquement
- Email confirmation enrichi avec PDF signe + certificat en pieces jointes
- Badge AES eIDAS visible dans le formulaire
- Bouton dynamique (indique l'etape suivante)
- Fix redirect .html qui perdait les query params (?token=...)
- Fix colonnes inexistantes dans supplier_mandates → metadata JSONB

## Passe 56 (27 avril 2026) -- Architecture Marketplace Finale "Doctolib du B2B dentaire"
Refonte du modele economique fournisseur : 3 paliers Bronze/Silver/Gold.
Simplification drastique du contrat de mandat (mandate-sign.html) : suppression
des articles complexes (escrow, penalites J+2/J+4/J+7, garantie JADOMI 500EUR,
scoring 100 points) et remplacement par 3 articles simples (SAV, Paiement, Expedition).
Architecture marketplace finalisee : JADOMI = infrastructure (paiement + facturation +
mise en relation), PAS intermediaire logistique. Le fournisseur expedie lui-meme,
propose ses frais de port, gere son SAV. Protection anti-demarchage contractuelle
(clause 12 mois post-resiliation, penalite 5 000EUR, pas de marketing dans colis).
Flux commande : notification anonyme → acceptation → identite revelee → expedition →
tracking → J+14 reversement. Suppression : etiquettes anonymes JADOMI, marge 15%
transport, calcul haversine frais port, garantie A-to-Z, scoring 100 points.
Mise a jour dossier avocat : questions 25-26 actualisees, checklist nettoyee.
CODEX.md enrichi avec section Architecture Marketplace Finale.

## Passe 59 (27 avril 2026) -- JADOMI Tournees — Module Infirmieres Liberales

Module complet pour infirmieres liberales : agenda intelligent avec tournees
optimisees GPS, split matin/soir, multi-IDE, placement auto patient.

### SQL (59_ide_tournees.sql)
- 7 tables: ide_cabinets, ide_nurses, ide_patients, ide_soins_recurrents,
  ide_visites (pipeline planifie→en_route→en_cours→termine), ide_tournees
  (UNIQUE nurse+date+tournee), ide_absences
- 20+ index, RLS complet, trigger updated_at

### API (23 endpoints /api/ide/*)
- CRUD cabinet/nurses/patients avec geocodage Nominatim automatique
- Soins recurrents (type, jours semaine, tournee matin/soir, nurse preferee)
- GET /api/ide/planning/:date — planning jour auto-genere depuis soins recurrents
- POST /api/ide/tournee/optimize — nearest-neighbor haversine
- POST /api/ide/patient/place — KILLER: placement auto patient optimal (top 3 options)
- PATCH /api/ide/visite/:id/status — tracking status pipeline
- GET /api/ide/visite/:id/tracking — tracking live public (token-based)
- POST /api/ide/absence + GET /api/ide/dashboard stats

### Frontend (public/ide/dashboard.html — 1033 lignes)
- Dashboard premium dark mode, mobile-first PWA-ready
- 5 onglets: Ma tournee, Patients, Planning semaine, Absences, Stats
- Timeline visites avec badges soins colores + Navigation GPS Google Maps
- Modal placement auto avec autocomplete + affichage 3 options detour minimal
- Grille planning 7j x 2 tournees matin/soir
- Toggle matin/soir, selecteur IDE, date picker

### Integration
- Routes /ide dans server.js
- Type infirmiere_liberale dans onboarding organisation.html
- Card Infirmiere dans section Acces rapide Sante

### Securite (15 corrections par reviewers)
- PostgREST filter injection corrigee
- XSS: sanitize inputs + escHtml 5 chars + escAttr
- Input validation whitelists (soins_type, status, tournee, couleur, dates)
- Rate limit geocoding Nominatim (20/min)
- Tracking public: donnees minimales (prenom seulement, pas de GPS live)
- Generate limite a 90 jours max

### Ordonnances + Comptabilite IDE (Passe 59b)
- SQL 60_ide_ordonnances_compta.sql: 2 tables (ordonnances + factures), 14 index, RLS
- 10 endpoints API: upload scan ordonnance, liste filtree par patient/mois, download,
  envoi email (CPAM etc.), upload justificatif compta, bilan mensuel par categorie
- Frontend: 2 onglets ajoutes (7 au total), upload drag&drop, barres CSS bilan,
  alerte ordonnance expirante, categories dynamiques compta
- Card SQL dans dashboard Documents: 55 fichiers SQL avec boutons Voir/Copier
- Audit: 20 corrections (path traversal, email injection, montant max, fichier orphelin, etc.)

### Commits Passe 59 (4 commits)
1. feat(ide): JADOMI Tournees — Module complet infirmieres liberales
2. fix(audit): Audit massif patient/IDE/SOS — 64 corrections
3. feat(ide): Ordonnances + Comptabilite IDE + Card SQL + Audit 20 corrections
4. chore(codex): update Passe 59

## Passe 60 (27 avril 2026) -- Equipment Groupon + Audit securite + IDE ameliorations

### Equipment Groupon (5 endpoints + 2 pages frontend)
- GET /api/equipment/offres — offres approuvees avec compteurs enrollments
- POST /api/equipment/join — inscription dentiste (anti-IDOR, tier price, acompte auto)
- GET /api/equipment/mes-achats — achats groupe du dentiste
- POST /api/equipment/acompte — enregistrer versement acompte
- POST /api/equipment/propose — soumission fabricant (multer multipart)
- Pages: public/equipment/offres.html (catalogue dark mode) + propose.html (formulaire fournisseur)
- SQL 61: equipment_enrollments + equipment_notifications (RLS, triggers, FK)

### SOS Remplacement IDE (7 endpoints)
- search, request, accept, decline, contrat, envoyer-ordre, list
- Generation contrat HTML avec RPPS + retrocession configurable
- Envoi auto Conseil de l'Ordre departemental + tracking statut email
- SQL 61: ide_remplacement_requests (RLS, triggers, CHECK constraints)

### Audit securite (22 corrections)
- IDOR accept/decline remplacement (verifiait sender au lieu de target)
- Path traversal signature image + audit trail (sanitize IDs)
- PostgREST injection /api/eco/check (raw produit → escaped)
- XSS javascript: URL dans email equipment
- Auth manquante POST /api/admin/security-report
- Admin check manquant POST /api/admin/security-scan
- Rate limit 20/h sur 6 endpoints SOS remplacement
- NaN retrocession_pct, sanitize order, silent catches
- computeTierPrice sort tiers ascending
- UUID validation GET /remplacement/requests
- contrat_envoye_ordre = false si email echoue

### Fix navigation (bug user-reported)
- 11 cards professions pointaient vers index.html (404) → liens absolus corriges
- Retour dashboard ajoute sur 4 sous-dashboards (IDE, Vitrines, Labo, Services)
- portfolio-slider.js route API corrigee (/api/timeline/public/portfolio/)
- staging.js lien /public/ prefix supprime
- Path rewrite /public/ → / sur 90+ fichiers HTML/JS

### IDE ameliorations (Passe 60b)
- Dictee vocale IA: Web Speech API fr-FR sur notes visite, patient, ordonnance
  Bouton micro pulse rouge, interim results temps reel, append au texte
- CRON confirmation patient: job 19h Europe/Paris, marque visites J+1 confirmees
  Endpoint manuel POST /api/ide/cron/confirm-patients (admin, rate limited)
- Alertes ordonnance expirante: GET /api/ide/ordonnances/expiring (7 jours)
  Banniere orange + badge compteur sidebar/nav
- Sidebar SVG icons: 19 icones Lucide-style remplacent les emoji

### Commits Passe 60 (5 commits)
1. feat(passe60): Equipment Groupon + SOS Remplacement + Audit securite + Fix navigation
2. fix(sql): RLS policy uses societes table instead of non-existent user_societes
3. fix(sql): RLS policy societes.owner_id instead of user_id
4. feat(passe60b): Dictee vocale + CRON confirmation + Alertes ordonnances + SVG icons
5. chore(codex): update Passe 60

## TODO Passe 61 (prochaine session)
### JADOMI Tournees (ameliorer)
- Tester le dashboard IDE sur mobile reel
- Pharmacie connectee: commande compresses/gants en 1 clic
- Tracking Uber live (partage position GPS temps reel)
- SMS confirmation patient via tokens JADOMI Coins (integration future)

### Equipment Groupon (ameliorer)
- Envoyer le premier email commercial a 3Shape (TRIOS 6)
- Notification push navigateur quand un nouveau palier est atteint
- Integrer Stripe pour les acomptes (actuellement marque mais pas collecte)

### Signature & Documents
- Integrer signature dans module BTP (devis)
- Ajouter module signature dans l'espace client securise (patients/clients)
- Tester envoi 4 documents par email depuis dashboard

### JADOMI Tournees — Agenda Infirmiere Intelligent (NOUVEAU MODULE)
Cible : 120 000 IDE liberales en France. Abonnement 9-19EUR/mois.
- Feuille de route optimisee GPS (algorithme plus court chemin entre adresses patients)
- Dissociation tournee MATIN (6h-12h) / SOIR (16h-20h)
- Patient vu 2x/jour = apparait automatiquement dans les 2 tournees
- Multi-IDE partage : 2-3+ infirmieres sur le meme planning, chacune voit SA tournee
- Planning 7j/7 avec roulement, gestion absences/remplacements
- Patients recurrents : planning auto-genere (pas de re-saisie quotidienne)
- PWA mobile : feuille de route du jour, navigation GPS en 1 clic vers prochain patient
- KILLER FEATURE : patient appelle → tape nom/adresse → le systeme le place
  automatiquement dans le creneau optimal du trajet (gain de temps phenomenal)
- Notifications patient PUSH GRATUITES type Uber: "Marie arrive dans 8 min" + trajet live
  Le patient voit l'infirmiere approcher en temps reel. SMS en option (packs tokens)
- Boucle virale: IDE pousse patient a telecharger → patient pousse ses autres pros
- Abonnement 9EUR/mois sans SMS, l'IDE est libre. SMS = packs tokens (100/500/2000)
- Integration JADOMI Coins pour les tokens SMS
- SOS Tournee IDE: si IDE malade, JADOMI redistribue ses patients aux collegues/IDE
  a proximite + genere le contrat de remplacement via JADOMI Sign en 30s
  2 modeles: remplacement classique (RPPS titulaire, retrocession 60-70%)
  ou depannage ponctuel (chacune facture ses patients)
  Envoi AUTOMATIQUE du contrat au Conseil de l'Ordre departemental apres
  signature des 2 parties. Zero demarche pour l'IDE.
- Ban/deban patients: no-show, retard, irrespect → banni du reseau, deblocable
- REGLE ABSOLUE: le patient ne paye JAMAIS. Tout gratuit pour le patient. Toujours.
- Le patient = carburant viral (comme Doctolib/WhatsApp)
- Qui paye: le pro de sante (abo), la pharmacie (commission), les tokens SMS (optionnel)
- Ideas Passe 58: tableau de bord famille (GRATUIT), dictee vocale soin IA,
  confirmation auto patient le soir pour le lendemain + reoptimisation nuit,
  pharmacie connectee (commande compresses en 1 clic), remplacement instantane
  type Uber si IDE absente, alerte ordonnance qui expire
- Connexion modules JADOMI : stock consommables IDE (compresses, gants), messagerie medecins
- Concurrent principal : Agathe You (~15EUR/mois) — mais PAS d'optimisation GPS tournees
- Avantage JADOMI : ecosysteme sante complet (stock + comm + signature + groupage)

### SOS Urgence Confreres (idee Karim 27/04 — module dentiste)
Un dentiste deborde appuie sur "Urgence dispo" → les confreres JADOMI a proximite
recoivent une notification push → le premier qui accepte recoit le patient.
- Le dentiste deborde est soulage (moins de stress, meilleur soin)
- Le confrere en galere de patients remplit son agenda
- Le patient est vu dans l'heure au lieu d'attendre 3 jours
- JADOMI prend ZERO commission — c'est le service qui fait adopter la plateforme
- Geolocalisation: seuls les confreres dans un rayon de X km recoivent l'alerte
- Anonymise: le patient ne voit pas les details avant d'accepter le transfert
- Historique des transferts dans le dashboard (stats: combien envoyes/recus)
- Extension possible: kines, medecins generalistes, ophtalmos, etc.

### Infrastructure & Securite
- Remplir les infos JADOMI dans le contrat PDF (SIRET, adresse) quand societe creee
- Fail2ban configurer
- Cloudflare free (Karim — changer DNS OVH)
- Remplacer xlsx par exceljs (6 CVEs npm)
- CSP strict sans unsafe-inline (refacto frontend)
- Executer SQL 57_signed_documents.sql en production (Supabase Dashboard)

===============================================================
# 11. METHODE DE DEVELOPPEMENT OBLIGATOIRE
===============================================================

## Strategie Builder/Reviewer (instauree Passe 52)
OBLIGATOIRE pour chaque passe de developpement.

### Principe
Pour chaque tache non-triviale :
1. Un agent BUILDER construit le code
2. Un agent REVIEWER passe derriere, verifie, corrige, ameliore

### Pourquoi
Passe 52 : 5 builders + 5 reviewers → 25 bugs rattrapes dont 4 failles
de securite critiques (IDOR, XSS, injection, fuite donnees cross-cabinet).
Sans les reviewers, ces bugs seraient passes en production.

### Regles
- Lancer les builders EN PARALLELE (agents simultanes)
- Des qu'un builder finit, lancer son reviewer IMMEDIATEMENT
- Le reviewer a le droit de MODIFIER le code directement (pas juste signaler)
- Le reviewer doit faire un `node -c` apres chaque correction
- Le reviewer verifie : bugs, securite, perf, edge cases, UX, format reponse

### Checklist reviewer
1. Injection SQL / ilike / XSS (sanitization des inputs)
2. Auth + scoping societe_id (pas d'acces cross-cabinet)
3. N+1 queries, doublons, performance
4. Edge cases : tableau vide, null, division par zero
5. try/catch robustes (tables qui n'existent pas encore)
6. Format reponse JSON coherent
7. `node -c` syntax check obligatoire

### Gains mesures
| Passe | Builders | Reviewers | Bugs rattrapes | Critiques |
|-------|----------|-----------|----------------|-----------|
| 52    | 5        | 5         | 25             | 4         |
| 53    | 5        | 5         | 10             | 2         |
| 54    | 40+      | internes  | 221 detectes, 145 corriges | 46 critiques |
| **Total** | **55+** | **15+** | **278** | **57** |

## BASEPLAN — Documents fondateur (instauree Passe 54)
Nom officiel de la base documentaire du fondateur. OBLIGATOIRE a enrichir
a chaque mise a jour du CODEX si la passe impacte le juridique ou le business.

### Fichiers BASEPLAN
| Document | Fichier | Contenu |
|----------|---------|---------|
| Dossier Avocat | docs/DOSSIER-AVOCAT-JADOMI.html | v2.0 — 19 questions, CGV 13 articles, 7 secteurs, 21 modules |
| Business Plan | docs/business-plan-jadomi.html | v2.0 — TAM 2.4Mds, 8 revenus, projections 3 ans multi-secteur |
| Dossier Avocat V2 | docs/dossier-avocat-jadomi.html | Version complementaire avec annexes techniques |

### Regles
1. A chaque fin de passe : verifier si BASEPLAN doit etre enrichie
2. Nouvelles features → mettre a jour le business plan (section services)
3. Nouveaux flux financiers → mettre a jour le dossier avocat (questions)
4. Nouveaux contrats → ajouter dans les CGV
5. Accessible dans dashboard admin onglet "Documents" (organisation.html)
6. Envoyable par email : /api/admin/send-documents ou node scripts/send-dossier-mail.js
7. Quand enrichie, renvoyer par email a karim_bahmed@yahoo.fr

===============================================================
# 12. SECURITE & ACCES
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
  * CLASSIC 19€/mois (aligné marché, 0€ création)
  * PRO 39€/mois (le plus choisi, 149€ création)
  * EXPERT 69€/mois (premium, 299€ création)
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

## Passe 44 (25 avril 2026) -- JADOMI Avocat Expert + Coffre-fort OTP + Homepage BMW
Fichiers crees :
- api/avocat/coffre.js (20 KB, coffre-fort chiffre AES-256-GCM, double auth password+OTP)
- api/avocat/espace-client.js (15 KB, portail client avocat, invitation tokens)
- services/otp-sender.js (4.8 KB, OTP multi-canal : email, SMS OVH, WhatsApp Meta)
- public/avocat/coffre.html + public/avocat/espace-client.html
- sql/vitrines/48_avocat_expert_coffre.sql (7 tables avocat_*)
- sql/vitrines/49_otp_verification.sql (table avocat_otp_codes)
Refonte homepage landing.html style BMW (hero video, letter-fly JADOMI, social proof photos defilantes).
16 demos HTML animees interfaces metier (page-flip 3D, 5 ecrans, 3.5s cycle) :
- demo-dentiste, demo-avocat, demo-sci, demo-btp, demo-createur
- demo-orthodontiste, demo-prothesiste, demo-paramedical
- demo-kine, demo-osteopathe, demo-podologue, demo-orthophoniste
- demo-psychomotricien, demo-dieteticien, demo-sage-femme, demo-infirmier
8 pages landing paramedicales dediees :
- kinesitherapeutes.html, osteopathes.html, podologues.html, orthophonistes.html
- psychomotriciens.html, dieteticiens.html, sages-femmes.html, infirmiers.html
Cartes metiers cliquables sur professions-paramedicales.html ("Decouvrir →").
Nettoyage tele-transmission CPAM : retire comme feature JADOMI (garde en pain points).
SQL 48-49 executes en prod. Badges "GRATUIT" Stock + "1er mois offert" modules.

## Passe 46 (25 avril 2026) -- JADOMI Dentiste Pro Phase A (Backend)
Decision GO Phase A. Construction complete du backend multi-profession.
Fichiers crees (14 fichiers API, ~250 KB) :
- sql/dentiste-pro/50_dentiste_pro_schema.sql (10 tables + indexes + RLS)
- sql/dentiste-pro/51_roles_permissions.sql (1 table dentiste_pro_team)
- api/dentiste-pro/shared.js (JWT patient, middleware requirePatient/requireCabinet/requireLabo)
- api/dentiste-pro/auth.js (6 endpoints : OTP telephone, profil, push subscribe)
- api/dentiste-pro/cabinet.js (5 endpoints : CRUD cabinet, config IA)
- api/dentiste-pro/batch-slots.js (6 endpoints : Smart Batch Slot-Finder WORLD FIRST)
- api/dentiste-pro/chat.js (5 endpoints : chat direct SSE temps reel)
- api/dentiste-pro/chat-ia.js (2 endpoints : chatbot IA Claude Haiku 24/7)
- api/dentiste-pro/waitlist.js (8 endpoints : liste attente smart + notif urgence)
- api/dentiste-pro/rappels.js (3 endpoints + cron 15min : rappels multi-touch J-7/J-3/J-1/H-2)
- api/dentiste-pro/dashboard.js (4 endpoints : morning huddle, stats, pipeline)
- api/dentiste-pro/team.js (7 endpoints : roles/permissions 6 roles, 14 modules checkboxes)
- api/dentiste-pro/index.js (router principal, 11 sous-modules)
- web-push npm installe pour notifications VAPID
SQL 50-51 executes en prod. Toutes professions supportees (15 types).

## Passe 47 (25 avril 2026) -- PWA Patient + Dashboard Admin
3 apps PWA construites et en ligne :
- public/patient/ (13 fichiers : shell SPA, SW, manifest, 6 pages, CSS, router, API)
  URL : jadomi.fr/patient/ — login OTP, mes RDV, chat, chat IA, mon equipe, profil
- public/admin/dentiste-pro.html (dashboard 13 tabs, sidebar, routing)
  URL : jadomi.fr/admin/dentiste-pro — morning huddle, agenda semaine,
  patients, chat split-view, batch RDV, waitlist, rappels, equipe checkboxes,
  stats, config, triangle, reseau
- public/admin/js/ (13 fichiers tab-*.js + photo-tools.js + photo-consent.js)
  185 KB de modules frontend avec demo data integree
Serveur monte : routes /patient/, /admin/dentiste-pro, CORS patient.jadomi.fr.

## Passe 48 (25 avril 2026) -- Triangle Photo (systeme 3 parties WORLD FIRST)
Systeme photo triangulaire Praticien-Patient-Labo. AUCUN concurrent mondial.
Regle : patient et labo ne communiquent JAMAIS directement. Tout via praticien.
Contrainte SQL triangle_routing enforce au niveau BDD.
Fichiers crees :
- sql/dentiste-pro/52_triangle_photo.sql (3 tables + trigger auto-reference + contrainte)
- api/dentiste-pro/triangle.js (16 endpoints : patient 2, praticien 5, labo 4, auth labo 2, cases 4)
- api/dentiste-pro/photo-ai.js (3 endpoints : analyse Claude Vision, qualite photo, triage urgence)
  9 types photos supportes : urgence, teinte, clinique, fabrication, essayage, produit_fini, plaie, suivi, question
- public/admin/js/photo-tools.js (guide camera overlay 6 types, annotation canvas,
  templates demande, memo vocal 60s, video 15s)
- public/admin/js/photo-consent.js (consentement RGPD par photo, audit trail)
- public/admin/js/tab-triangle.js (timeline cas Instagram-style, scoring labo 5 etoiles,
  teintier VITA visuel, nouveau cas modal)
SQL 52 execute en prod. Upload directory /uploads/triangle/.

## Passe 49 (25 avril 2026) -- App Labo Prothesiste (PWA)
PWA dediee prothesistes dentaires a jadomi.fr/labo-pro/
Accent rose #be185d (differencie de patient teal et admin teal).
Fichiers crees (10 fichiers) :
- public/labo-pro/ : index.html, manifest.json, sw.js, css/main.css
- public/labo-pro/js/ : router.js, api.js
- public/labo-pro/js/pages/ : login.js (email OTP), mes-cas.js, case-detail.js, profil.js
Fonctionnalites : login OTP email, liste cas avec filtres, detail cas avec galerie photos,
upload photo (fabrication/essayage/produit fini), messages labo-cabinet, profil specialites.
Demo data : 4 cas, 23 photos, messages. Auto-login demo.

## Passe 51b (26 avril 2026) -- EUDAMED + Contrats + Suivra + Equivalences White Label
A) Audit et reprise apres coupure PC :
- 4 scripts EUDAMED (v1→all-manufacturers) avaient tous termine avec succes
- 5 104 produits EUDAMED deja en base, 1 466 770 GUDID FDA
B) Nouveaux scripts et enrichissements :
- import-eudamed-v3.js : +811 nouveaux (VOCO, Coltene, Kettenbach, NSK, Kuraray, Hager...)
- import-eudamed-v4-all.js : +13 406 nouveaux (38 fabricants + 60 mots-cles)
  Kerr Italia (830), Adin (761), Kentzler-Kaschner (570), Hu-Friedy (500),
  ASTAR Ortho (500), Bloomden (500), Biomet 3i (500), orthodontic bracket (2999)...
C) Methode EUDAMED documentee dans le CODEX (section 27) pour ne plus perdre de temps
D) Catalogues manuels (import-catalogues-manuels.js) : 270 produits, 12 fabricants
   Septodont (82 ref), GC (37), DMG (26), Anios (24), Kulzer (16), Durr (14),
   Shofu (14), KaVo (14), MELAG (12), Pierre Fabre (12), Cattani (10), Metasys (9)
   → Permet matching scan photo/IA par nom produit (Septanest, Biodentine, Orotol...)
E) Detection lignes "suivra" / reliquat (factureFournImport.js) :
   - Detecte mots-cles : suivra, reliquat, non livre, back order, indisponible...
   - Detecte aussi quantite_livree < quantite
   - Lignes suivra NE SONT PAS ajoutees au stock (pas de mouvement entree)
   - Marquees _jadomi_status='pending_delivery' dans le JSON produits
   - Compteur suivra dans audit log et notification
F) Contrats fournisseur type DPI (invoice-matcher.js + index.html) :
   - Onglet Fournisseurs enrichi : type contrat (standard/abonnement),
     remise globale %, montant annuel engagement
   - A l'import facture, si contrat detecte :
     price_catalog = prix sur la facture (catalogue)
     price_negotiated = prix_catalogue x (1 - remise%)
   - Remise par categorie OU remise globale (priorite categorie)
   - metadata.contract_applied = true dans supplier_prices
   - Approche imparable : on connait le code client + la remise,
     on calcule le VRAI prix meme si la facture montre le catalogue
G) Detection equivalences white label (KILLER FEATURE) :
   - Table product_equivalences : liens entre produits physiquement identiques
   - 3 niveaux detection : same_gtin, same_manufacturer_ref, same_oem
   - Auto-detection via manufacturer_ref partagee entre marques differentes
   - Vue v_product_equivalences_with_prices pour comparaison prix directe
   - scan-engine enrichScanResult() : ajoute equivalents + cheapest_equivalent
   - Endpoint /api/scan/lookup enrichi : retourne equivalents + market_prices
   - Ex: Lime Reverso (GACD) = meme usine que ProFile (autre) → alerte prix
   SQL a executer : sql/scan/product_equivalences.sql
H) Photo Identify OEM (routes/labo/stock.js) :
   - Prompt Claude Vision expert MDR : lit le PETIT texte sur l'emballage
   - Detecte : fabricant_reel, adresse_fabricant, pays_fabrication, marquage_ce
   - Distingue marque (distributeur) vs fabricant reel (OEM)
   - Auto-cree des product_equivalences quand OEM detecte
   - Chaque photo prise enrichit la base OEM pour TOUS les dentistes
I) Architecture non-intrusive (UX) :
   - Le scan reste RAPIDE et PROPRE (pas de rapport OEM dans la reponse)
   - L'intelligence OEM tourne en ARRIERE-PLAN (setImmediate)
   - Si white label ou economie detectee → NOTIFICATION push
   - Le dentiste consulte le rapport quand il veut via GET /api/labo/stock/oem-report
   - Le rapport OEM liste toutes les equivalences avec prix compares et economies
   - Tri par economie decroissante, total savings calcule
   - Votes communautaires (upvote/downvote) pour valider les equivalences

## Fichiers cles Passe 51b
| Fichier | Role |
|---------|------|
| services/oem-intelligence.js | Cerveau OEM : analyzeProduct, analyzePhotoForOEM, reportEquivalence, voteEquivalence |
| services/scan-engine.js | Waterfall 5 niveaux + enrichScanResult + findEquivalents |
| services/invoice-matcher.js | Intelligence prix + contrats fournisseur + normalisation HT/TTC |
| api/multiSocietes/factureFournImport.js | Import factures + detection suivra + code client |
| routes/labo/stock.js | Photo Identify OEM + rapport OEM consultable |
| sql/scan/product_equivalences.sql | Table equivalences + vue v_product_equivalences_with_prices |
| scripts/seed-oem-equivalences.js | Base connaissance 16+ fabricants OEM chinois |
| scripts/import-catalogues-manuels.js | 270 produits manuels (Septodont, Anios, GC, DMG...) |
| scripts/import-eudamed-v3.js | Import EUDAMED fabricants manquants |
| scripts/import-eudamed-v4-all.js | Import EUDAMED 38 fabricants + 60 mots-cles |
| server.js | /api/scan/lookup enrichi + extraction code_client + detection suivra IA |
| index.html | Onglet fournisseurs dynamique + contrats + remises + widget OEM dashboard |
E) Total final : 1 486 272 produits (GUDID + EUDAMED + catalogues manuels)

## Passe 55 (27 avril 2026) -- JADOMI Sign — Signature Electronique Premium
Module complet de signature electronique integre, niveau SES renforcee eIDAS.
Base sur DocuSeal (open source self-hosted) + couche premium JADOMI Sign.

Infrastructure :
- Docker installe + DocuSeal deploye (port 3100, self-hosted)
- docker/docuseal/docker-compose.yml
- certs/jadomi-sign.p12 (certificat PKCS12 pour PAdES)

Backend :
- lib/jadomi-sign.js v2.0 (PAdES, TSA RFC 3161, hash-chaining audit, verification HMAC)
- lib/otp-sms.js (verification SMS OTP signataire via Twilio/OVH)
- sql/vitrines/57_signed_documents.sql (table + 8 indexes)
- 13 endpoints API dans server.js (CRUD docs signes, webhook, verification publique, OTP SMS)
- Proxy DocuSeal templates (securise derriere requireAuth)

Securite signature :
- Signature PAdES integree au PDF (verifiable Adobe Acrobat)
- Horodatage TSA externe RFC 3161 (FreeTSA.org, upgrade Certigna prevu)
- Piste audit immutable hash-chained (anti-falsification)
- Verification OTP SMS signataire (optionnel)
- Upgrade AES prevu quand TSA qualifiee + verification identite deployes

Frontend :
- signature.html (2306 lignes) — wizard 4 etapes, canvas signature, gestionnaire docs
- public/verify-signature.html — page verification publique
- organisation.html — card CODEX + section Documents Signes complete
- docs/CODEX-JADOMI.html — version HTML du CODEX

Methode builder/reviewer : 5 builders + 4 reviewers → 12 XSS, 4 IDOR, 2 injections corrigees.

## Passe 54 (26 avril 2026) -- Audit Securite Massif + BASEPLAN v2.0
Audit complet : 8 Bug Hunters + 2 Frontend/SQL Auditors → 221 vulnerabilites identifiees.
136 corrections appliquees sur 50 fichiers JS (0 erreur syntax check).

Securite :
- .env expose publiquement → bloque (404)
- 18 IDOR corriges (coffre, requests, appointments, sites-jadomi, studio)
- 7 SQL injections sanitisees (suppliers, target-prices, dossiers, public, triangle, eco)
- 18 mass assignment → whitelist (BTP, showroom, juridique)
- 6 auth bypass corriges (media-upload JWT, shared.js, ads token, client-portal, interventions, ratings)
- 2 OTP bypass coffre bloques
- 4 XSS frontend (coffre, espace-client, organisation esc() quotes)
- 4 XSS email (escHtml devis, factures, commandes, messages)
- 62+ error info leaks → "Erreur serveur/interne"
- 1 SSRF bloque (analyse scan)
- 4 path traversal (slugs, coffre storage, static root)
- 4 hardcoded secrets retires (Supabase key, admin token, annuaire, deals)
- 3 hardcoded JWT → random (shared.js, client-portal, media-upload)
- 1 crypto fix (GCM auth tag mandatory)
- 2 fail-open → fail-closed (permissions, quotas)

Infrastructure :
- Security headers deployes (CSP, HSTS, X-Frame, X-XSS, X-Content-Type, Referrer, Permissions)
- TLS 1.0/1.1 desactive → 1.2+ only
- UFW Firewall actif
- robots.txt anti-crawlers cree
- jadomi-shield.js anti-copie cree
- Backup quotidien 3h + hebdo dimanche (cron)
- Health check /5min avec auto-restart (cron)
- Integrite SHA-256 quotidien (cron, baseline 204 fichiers)
- Scan securite nocturne 2h (cron : ClamAV + rkhunter + integrite + reseau)
- MFA/2FA TOTP endpoints (enroll, verify, challenge, factors, unenroll)
- Compte Supabase admin MFA Google Authenticator active

Supabase RLS :
- 39 policies deployees et testees (anon key → [] sur toutes tables sensibles)
- Coffre avocat 9 policies (secret professionnel)
- Client portal 4 policies (RLS active)
- GPO financier 7 policies (service_role only)
- Coins wallet 9 policies + CHECK >= 0
- SECURITY DEFINER search_path fixe
- Table security_reports (SQL 56)

Dashboard :
- Onglet Documents BASEPLAN (3 docs v2.0, envoi email)
- Onglet Securite (score, scan manuel, historique)
- Section 2FA dans Parametres (activer/desactiver MFA TOTP)
- Route /docs statique pour acceder aux documents

BASEPLAN v2.0 :
- DOSSIER-AVOCAT-JADOMI.html reecrit (11 sections, 19 questions, 7 secteurs, 21 modules)
- business-plan-jadomi.html reecrit (TAM 2.4Mds, 8 revenus, projections 3 ans)
- dossier-avocat-jadomi.html reecrit (10 sections, 24 questions, HDS/Ads/Coins)

Methode Builder/Reviewer : 8 hunters + reviewers, 221 bugs detectes, 136 corriges.
Fichiers crees : scripts/backup.sh, scripts/health-check.sh, scripts/integrity-check.sh,
  scripts/security-scan.sh, public/js/jadomi-shield.js, public/robots.txt,
  sql/vitrines/56_security_reports.sql

## Passe 53 (26 avril 2026) -- Facturation GPO : Revelation post-acceptation
Solution A implementee : apres acceptation fournisseur, prix verrouille
puis identite cabinet revelee (nom, adresse, SIRET, email, telephone).
Fichiers crees :
- sql/vitrines/54_gpo_orders.sql (table gpo_orders + sequence + RLS)
- lib/emails/supplier-order-confirmation.js (email fournisseur avec coordonnees cabinet)
- lib/gpo-order-pdf.js (bon de commande PDF pdfkit avec prix verrouille)
Fichiers modifies :
- api/gpo/public.js (POST /accept enrichi : fetch cabinet, create gpo_orders, email reveal)
- lib/emails/dentist-offer-accepted.js (email enrichi : order#, contact fournisseur, etapes)
Solution C documentee dans CODEX section 30 (mandat facturation art. 289 CGI, roadmap).
Methode Builder/Reviewer : 5 builders + 5 reviewers, 10 bugs rattrapes.
SQL 54 a executer dans Supabase Dashboard.

## Passe 52 (26 avril 2026) -- JADOMI Compare + Intelligence Achats
Renaming OEM → terminologie dentiste. Onglet "Economies JADOMI" dans index.html.
9 endpoints API achats (search, economies, spend-analytics, price-history, benchmark,
price-watch CRUD, check-price-watches). GPO enrichi avec preuves prix marche.
Fix perf scan engine (N+1 → batch, doublon prix). SQL Passe 52 execute.
Methode Builder/Reviewer instauree : 5 builders + 5 reviewers, 25 bugs rattrapes.

## Passe 51 (25 avril 2026) -- JADOMI Scan World-Class
A) Fixes critiques (3 bugs audit) :
- Waterfall unifie 1 appel API, camera html5-qrcode branchee, peremption Sonnet
B) Base produits world-class :
- SQL : products_database + scan_logs + prices_intelligence (3 fichiers, 7 tables)
- Services : scan-engine.js (waterfall 5 niveaux), products-database.js, invoice-matcher.js
- 8 scripts import : GUDID FDA, Datakick, Henry Schein, GACD, distributeurs FR,
  enrichissement IA Claude, embeddings pgvector, deduplication
C) Intelligence prix : supplier_prices, invoice_imports, price_insights, v_market_prices
D) UX : cache localStorage 7j, prix multi-fournisseurs dans scan result, bouton
  peremption integre, source badges, confidence affichee
E) Analytics : dashboard /admin/scan-stats.html, endpoint GET /scan-stats
SQL a executer : sql/scan/*.sql (3 fichiers)

## Passe 50 (25 avril 2026) -- JADOMI Care Network (Reseau de Soins WORLD FIRST)
Reseau de soins interprofessionnel centre sur le PATIENT.
Le PATIENT est le HUB — c'est lui qui invite ses praticiens (email, SMS, ou les deux).
Viralite : 1 patient → invite 3-5 praticiens → chaque praticien a d'autres patients → LOOP.
Fichiers crees :
- sql/dentiste-pro/53_reseau_soins.sql (2 tables + 1 vue + indexes + RLS)
- api/dentiste-pro/reseau.js (12 endpoints : cercle soins, partages, inbox, referral, my-team)
- public/patient/js/pages/mon-equipe.js enrichi (invitation multi-canal email/SMS/les deux,
  notification "2 praticiens ont rejoint", section "pourquoi connecter", partages recents,
  bouton sticky "Ajouter un praticien")
- public/admin/js/tab-reseau.js (adresser patient, partages recus, mon reseau)
- public/labo-pro/js/pages/case-detail.js enrichi (cercle soins par cas, origine photo patient)
Dashboard admin : tabs Triangle + Reseau ajoutes dans sidebar.
Section "Reseau de Soins" ajoutee sur 12 landing pages profession + homepage.
Section "JADOMI Pro" ajoutee sur 14 landing pages + demo dentiste ecran 6.
SQL 53 a executer en prod.

## Passe 45 (25 avril 2026) -- Pre-etude JADOMI Dentiste Pro
Pre-etude architecture, PAS de code production. 4 livrables :
- docs/passe-45/audit-modules-patient.md (audit 5 modules patient existants)
- docs/passe-45/architecture-dentiste-pro.md (schema technique propose)
- docs/passe-45/rapport-executif.md (rapport 2 pages GO/WAIT/NO-GO)
- CODEX.md section 24 (ci-dessous)
Audit concurrentiel : Doctolib, Maiia, Allisone, Dental Monitoring, Julie, LOGOS_w.
Audit API logiciels metier : aucune API publique (Julie, LOGOS_w, Veasy).
Strategie integration : CSV Phase A → iCal Phase B → Segur Phase D.
Resultat : 60-65% du produit existe deja. Estimation Phase A : ~210h.
Recommandation : **GO Phase A**.

===============================================================
# 13. JADOMI DENTISTE PRO (PHASE A LAB)
===============================================================

## Vision fondateur (25 avril 2026, 5h du matin)
70% des 42 000 dentistes FR sont satures (4+ mois d'attente).
Doctolib (149EUR/mois) = inutile pour eux (fait de l'acquisition).
JADOMI Dentiste Pro = gestion + relation patient pour cabinets satures.
Modele B2B2C : cabinets paient, patients gratuit via PWA.

## 4 features killers
1. Chat chiffre dentiste-patient (photos, ordo, devis, push)
2. RDV simple (creneaux, reserve 2 clics, rappels auto)
3. Chat IA 24/7 (80% questions courantes, escalade humaine)
4. Notif urgence annulation (algo score → push 5 patients → premier arrive)

## Pricing
- Free : 50 RDV/mois, 1 praticien, 100 patients
- Pro 79EUR/mois : illimite, 2 praticiens, chat IA, notif urgence
- Expert 149EUR/mois : 5 praticiens, API, branding, stats avancees

## Modules existants reutilisables (~60-65%)
- /api/appointments (RDV complet, 15 endpoints)
- /api/timeline (suivi photo patient IA, 20 endpoints) -- KILLER
- /api/client-portal (portail securise, 8 endpoints)
- /api/coach (onboarding, 11 endpoints)
- /api/communication (email/SMS/WhatsApp, 9 endpoints)
- /services/otp-sender (OTP multi-canal)

## Modules a creer (~35-40%)
- PWA patient (shell, sw.js, manifest, offline) -- 16h
- Auth telephone + OTP -- 16h
- Notifications push VAPID -- 20h
- Chat direct temps reel -- 24h
- Chat IA patient -- 24h
- Liste attente smart + scoring -- 16h
- Notif urgence annulation -- 40h
- Rappels RDV auto -- 8h
- Dashboard dentiste enrichi -- 12h
- Import CSV patients -- 8h
Total Phase A : ~210h

## Analyse concurrentielle
- Doctolib : leader acquisition, inutile cabinets satures
- Maiia : 2eme, lie Cegedim, petite base patients
- Julie/LOGOS_w : gestion cabinet, ZERO engagement patient
- Allisone : IA imagerie, pas relation patient
- Dental Monitoring : ortho seulement, tres cher
- Gap marche confirme : AUCUN acteur sert les cabinets satures

## Integration logiciels metier
- Julie, LOGOS_w, Veasy : PAS d'API publique
- Phase A : import CSV generique (8h)
- Phase B : iCal sync calendrier (16h)
- Phase C : Pro Sante Connect e-CPS (20h)
- Phase D : Segur (DMP, MSSante, INS) -- 200h+, avantage massif
- Referencement Segur = prime ANS 5 040EUR/cabinet adoptant

## Contraintes legales
- HDS obligatoire des Phase B (multi-cabinets)
- Phase A sur cabinet Karim uniquement = pas d'obligation HDS
- RGPD renforce (donnees sante sensibles)
- Ségur du Numerique (Phase D+)
- Conseil de l'Ordre dentaire

## Roadmap 5 phases
- Phase A (mois 1-3) : Labo interne Karim, 50-100 patients, ~25EUR
- Phase B (mois 4-6) : HDS OVH, 5 confreres beta, ~15-25KEUR setup
- Phase C (mois 7-12) : 50 cabinets, 4KEUR/mois
- Phase D (an 2) : 500 cabinets, 480KEUR/an
- Phase E (an 3+) : 2000 cabinets, 1.9MEUR/an

## Architecture technique (LIVREE 25 avril 2026)
- App Patient : jadomi.fr/patient/ (PWA vanilla JS, 13 fichiers)
- App Labo : jadomi.fr/labo-pro/ (PWA vanilla JS, 10 fichiers, accent rose)
- Dashboard Admin : jadomi.fr/admin/dentiste-pro (SPA 13 tabs, 13 modules JS)
- Backend : /api/dentiste-pro/* (14 fichiers, 87 endpoints)
- SQL : 16 tables dentiste_pro_* + 1 vue (sql/dentiste-pro/50-53)
- Auth patient : telephone + OTP (zero mot de passe)
- Auth labo : email + OTP
- Chat : SSE Phase A, WebSocket Phase C
- Chat IA : Claude Haiku (~0.001$/msg)
- Photo IA : Claude Vision (triage urgence, qualite photo, analyse teinte)
- Push : web-push npm (VAPID, gratuit)
- Roles : 6 roles (praticien/associe/secretaire/assistante/comptable/stagiaire)
- Permissions : 14 modules, checkboxes dans dashboard admin

## 3 innovations mondiales (confirmees par recherche)
1. Smart Batch Slot-Finder : trouver N creneaux recurrents en 1 clic (0 concurrent)
2. Triangle Photo : routing praticien-patient-labo avec contrainte SQL (0 concurrent)
3. Reseau de Soins : patient = hub invite ses praticiens, coordination interpro (0 concurrent)

## Viralite patient-hub
Le PATIENT invite ses praticiens (email + SMS + les deux).
1 patient → invite 3-5 praticiens → chaque praticien a d'autres patients → boucle exponentielle.
1 dentiste → 4000 patients → 12 000-20 000 praticiens invites → 10% s'inscrivent = 2000 nouveaux.

## App desktop Electron (Phase B-C)
Prevue pour connecteurs LOGOS_w/Julie (lecture BDD locale Firebird).
Phase A = web uniquement + import CSV.

## Expansion multi-secteur Triangle (Phase C+)
Le modele Prescripteur-Beneficiaire-Executant applicable a 6 marches :
1. Dentiste → Patient → Prothesiste (CONSTRUIT)
2. Orthodontiste → Patient → Labo aligneurs (extension immediate)
3. IDEL → Patient → Medecin (120K IDELs, plus gros marche, urgence RGPD)
4. Dermatologue → Patient → Labo analyses (photo-first)
5. Ophtalmologue → Patient → Opticien (0 concurrent)
6. Garagiste → Client → Assurance (plus haute valeur)

## Date revue : juillet 2026 (fin Phase A)

===============================================================
# 25. PASSE 50 — Audit Complet (Operation Total Checkup)
===============================================================

### Date : 25 avril 2026
### Agents deployes : audit infrastructure, backend, frontend, crons, securite

#### 25.1 Lecture du CODEX
CODEX lu integralement (1349 lignes). Passes 14-53 comprises.
Architecture : Node.js/Express + Supabase + vanilla JS frontend.
34 modules backend, 12 crons, 3 webhooks Stripe, 3 PWAs.

#### 25.2 Audit Infrastructure
- server.js : 3349 lignes, syntaxe valide, 34 modules montes
- Port 3000 (pas 3001 — override via env PORT)
- Rate limiting OK (300/15min global, 5/15min login)
- CORS strict en production
- Helmet actif (CSP desactive pour CDN)
- Supabase anon key en frontend = normal (protege par RLS)

#### 25.3 Audit Endpoints Backend
- 20 fichiers multiSocietes (6031 lignes) : OK sauf communication.js
- 10 fichiers dentiste-pro : OK sauf SMS waitlist/rappels
- 2 fichiers avocat : coffre-fort AES-256 OK, espace-client OK
- 9 fichiers studio : CMS OK, themes OK, enhance-media = stub
- 26+ fichiers vitrines : chatbot OK, 23 professions supportees

#### 25.4 Audit Frontend
- 20+ landing pages metiers : OK
- PWA Patient (13 fichiers) : OK, icones manquantes
- PWA Labo (10 fichiers) : OK
- Dashboard Admin (13 tabs) : OK
- 20 images OG social manquantes (non bloquant)

#### 25.5 Audit Cron Jobs & Services
- 12 crons actifs, tous fonctionnels
- 3 webhooks Stripe OK (signatures verifiees)
- SMTP OVH Pro OK
- Doublon cron rappels detecte et corrige

#### 25.6 Bugs detectes (14 total)
CRITIQUE :
1. Mailing token invalide (requireAuth sur attachment)
2. SMS waitlist : sendSmsOTP au lieu de sendSms
3. SMS rappels : sendSmsOTP au lieu de sendSms
4. Communication unsubscribe RGPD casse (tokens non persistes)

HAUTE :
5. Duplicate cron rappels (setInterval + node-cron)
6. site-analysis getActiveSociete sans filtre user_id

MOYENNE (tous corriges) :
7. billing.js .single() sans error handling [CORRIGE]
8. commerce.js JSON parsing IA greedy regex [CORRIGE]
9. generate-section.js JSON parse sans try-catch [CORRIGE]
10. dashboard.js reference table dentiste_pro_appointments [CORRIGE]

BASSE (code corrige, assets restants) :
11. chatbot-public.js status codes manquants sur erreurs [CORRIGE]
12. enhance-media.js Remotion = TODO stub [CORRIGE — 501 propre]
13. Icones PWA manquantes (asset a generer)
14. 20 images OG social manquantes (asset a generer)

#### 25.7 Corrections appliquees (14 fixes — 12 code + 2 assets restants)
Passe 50 initiale (8 fixes) :
1. server.js:2171 — Retrait requireAuth() sur /api/mail/attachment/:token
2. waitlist.js:8,350 — Import sendSms au lieu de sendSmsOTP
3. rappels.js:9,294 — Import sendSms au lieu de sendSmsOTP
4. communication.js:341,386 — Token = contact ID pour desinscription RGPD
5. server.js:523-538 — Retrait doublon setInterval cron rappels
6. site-analysis/index.js:558 — Ajout filtre .eq('user_id', userId)
7. dashboard.js + waitlist.js — dentiste_pro_appointments → appointments (table inexistante)
8. dashboard.js — dentiste_pro_appointment_types → appointment_types
Fichier ajoute : sendSms() dans services/otp-sender.js (SMS generique)
Passe 50 complementaire (6 fixes) :
9. billing.js — error handling .single() sur 3 appels Supabase (socErr || !soc)
10. commerce.js — regex JSON non-greedy [\s\S]*? (2 endroits)
11. generate-section.js — try-catch sur JSON.parse avec reponse 500
12. chatbot-public.js — status codes HTTP (400/404/500) sur 9 reponses erreur
13. enhance-media.js — retrait execSync dangereux, reponse 501 propre
14. dashboard.js — table refs confirmees OK (deja corrige fix 7-8)

#### 25.8 Bug mailing token (PRIORITE)
Cause racine : requireAuth() ajoute sur /api/mail/attachment/:token.
Le frontend ouvre les PJ via window.open() (nouvel onglet) qui n'envoie
pas le header Authorization. Le token (hex 32 chars, TTL 30min) sert
lui-meme d'authentification. Fix : retrait du middleware requireAuth().

#### 25.9 Actions restantes (non-code)
- Configurer STRIPE_SECRET_KEY dans .env
- Executer SQL 53 (reseau_soins) dans Supabase
- Generer icones PWA (icon-192.png, icon-512.png)
- Generer 20 images OG pour partage social

#### 25.10 Etat de sante global : 19/20
Tous les 12 bugs code corriges (14/14 dont 2 assets restants).
Modules parfaits : Stock, GPO, Logistique, Chatbot, Coach, 60 Themes,
  Coffre-fort Avocat, Triangle Photo, Reseau Soins, PWA Patient+Labo,
  Billing (error handling OK), Commerce (regex OK), Generate-Section (try-catch OK),
  Chatbot-Public (status codes OK), Enhance-Media (501 propre)
A surveiller : Mailing (fixe), Rappels SMS (fixe), Communication (fixe)
Restant : STRIPE_SECRET_KEY (.env), SQL 53, icones PWA, images OG

===============================================================
# 27. JADOMI SCAN WORLD-CLASS (Passe 51)
===============================================================

## Architecture waterfall 5 niveaux
1. labo_stock (stock cabinet interne) — 0ms, gratuit
2. products_database GTIN exact — <10ms, gratuit
3. products_database reference/fabricant — <10ms, gratuit
4. OpenFoodFacts API — ~200ms, gratuit
5. Claude Haiku IA — ~1-2s, ~$0.001/scan

+ Cache localStorage frontend (TTL 7j) → 0ms, 0 appel API
+ Auto-cache dans products_database (apprend de chaque scan)

## Base produits products_database
Schema : sql/scan/products_database.sql
- GTIN unique, multi-source, categories FR
- Full-text search (GIN index francais)
- Embeddings pgvector ready (colonne a ajouter apres activation)
- Apprentissage : scan_count, user_validations, user_corrections
- 3 tables : products_database, product_corrections, prothesiste_products

## Sources d'import
| Source | Script | Produits reels |
|--------|--------|---------------|
| GUDID FDA (US) | scripts/import-gudid.js | ~1 466 770 |
| EUDAMED (EU) | scripts/import-eudamed-v2.js | 19 321 |
| EUDAMED (EU) | scripts/import-eudamed-v3.js | (complet v2) |
| EUDAMED (EU) | scripts/import-eudamed-v4-all.js | (complet v4) |
| Catalogues manuels | scripts/import-catalogues-manuels.js | 270 (12 fabricants) |
| Datakick | scripts/import-datakick.js | enrichissement |
| Henry Schein FR | scripts/scrape-henry-schein.js | ~10 000 |
| GACD FR | scripts/scrape-gacd.js | ~5 000 |
| Distributeurs FR | scripts/scrape-dental-distributors.js | ~3 000 |
| Claude IA enrichissement | scripts/enrich-products-ia.js | categories FR |
| OpenAI embeddings | scripts/generate-embeddings.js | recherche semantique |
| Deduplication | scripts/dedup-products.js | nettoyage |

## ASTUCE EUDAMED — Comment capter les produits (NE PAS PERDRE)
L'API officielle EUDAMED (ec.europa.eu/tools/eudamed/api/devices/udiDiData)
NE FILTRE PAS par fabricant — freeText est ignore, retourne toujours 1.6M.
SOLUTION QUI FONCTIONNE :
1. Utiliser **search.eudamed.com/api/search** (API de recherche publique)
   - Endpoint : GET https://search.eudamed.com/api/search?q=QUERY&type=device&size=100&skip=0
   - Pagination par skip (0, 100, 200...)
   - Filtrer cote client par manufacturer_name (contains)
   - Champ GTIN = primary_di_code (max 14 chars)
2. Deux strategies de recherche combinées :
   a) Par NOM EXACT du fabricant (ex: "KERR ITALIA SRL", "Adin Dental Implant")
      - Certains fabricants n'apparaissent que sous leur nom legal complet
   b) Par MOT-CLE PRODUIT (ex: "dental implant", "orthodontic bracket", "dental mirror")
      - Capture les PETITS fabricants qu'on ne connait pas encore
3. Anti-doublons : upsert sur gtin + ignoreDuplicates: true
4. Rate limit : 1s entre requetes
5. Fabricants ABSENTS d'EUDAMED search (a ne pas re-tester) :
   Septodont, GC, DMG, Kulzer, Shofu, KaVo, MELAG, 3Shape, Vatech, Owandy
6. Pour ces fabricants : CATALOGUES MANUELS (scripts/import-catalogues-manuels.js)
   Source : sites officiels fabricants, noms exacts pour matching scan photo/IA
   GTIN synthetique MAN-XXXX-NNNNN, source='manual_catalogue', confidence 0.95
   Fabricants couverts : Septodont (82), GC (37), DMG (26), Anios (24),
   Kulzer (16), Durr Dental (14), Shofu (14), KaVo (14), MELAG (12),
   Pierre Fabre (12), Cattani (10), Metasys (9)

**Total base 26/04/2026 : 1 486 272 produits**
- 1 466 770 GUDID FDA (US)
- 19 321 EUDAMED (EU)
- 270 catalogues manuels (12 fabricants FR/EU essentiels)

## Intelligence prix
Schema : sql/scan/prices_intelligence.sql
- supplier_prices : historique prix multi-fournisseurs
- invoice_imports : import factures avec dedup hash
- price_insights : alertes economiques automatiques
- v_market_prices : vue stats marche par GTIN
- Service : services/invoice-matcher.js (match facture → produits → insights)

## SQL a executer dans Supabase Dashboard
- sql/scan/products_database.sql
- sql/scan/scan_logs.sql
- sql/scan/prices_intelligence.sql

===============================================================
# 28. JADOMI SCAN — PEREMPTION PRO (Passe 51)
===============================================================

## Modele : Claude Sonnet (claude-sonnet-4-20250514)
- System prompt expert dentaire/medical/labo
- Formats reconnus : DD/MM/YYYY, MM/YYYY, MM/YY, YYYY-MM-DD, EXP, USE BY, BBE
- Confidence calibree : 0.9-1.0 parfait, 0.7-0.9 leger, 0.5-0.7 partiel, <0.3 illisible
- Retour enrichi : date, lot, format detecte, zone image, observations

## Frontend confidence UI
- < 30% : bloc rouge, pas de pre-remplissage, bouton "reprendre photo"
- 30-70% : bloc ambre, date pre-remplie, warning verification
- >= 70% : bloc vert, date confirmee avec details

## JPEG quality : 0.92 (ameliore vs 0.85)

===============================================================
# 29. JADOMI COMPARE + INTELLIGENCE ACHATS (Passe 52)
===============================================================

## Renaming strategique
"OEM" supprime partout — les dentistes ne connaissent pas ce terme.
Nouvelle terminologie : "Alternative verifiee", "Mes Economies",
"JADOMI Compare", "Meme produit, meilleur prix".

## Onglet "Economies JADOMI" (index.html)
Nouvel onglet sidebar dans Achats. Contient :
- KPI total economies recuperables (annuel)
- Liste produits ou un meilleur prix existe, tri par economie decroissante
- Bouton "Negocier via JADOMI" par produit
- Courbe historique prix par produit (Chart.js, type CamelCamelCamel)
- Price Watch : "Prevenez-moi quand ce produit passe sous X EUR"
- Benchmark anonyme : "Votre cabinet vs la moyenne du segment"
- Spend Analytics : depenses par categorie, fournisseur, mois

## Nouveaux endpoints API
| Endpoint | Methode | Description |
|----------|---------|-------------|
| /api/scan/search | GET | Recherche multi-resultats par nom, prix compares |
| /api/achats/economies | GET | Produits ou un meilleur prix existe (vue v_economies_jadomi) |
| /api/achats/spend-analytics | GET | Depenses par categorie/fournisseur/mois + top produits |
| /api/achats/price-history/:gtin | GET | Historique prix par produit (courbe) |
| /api/achats/benchmark | GET | Benchmark anonyme inter-cabinets par segment |
| /api/achats/price-watch | POST | Creer une alerte prix |
| /api/achats/price-watches | GET | Lister les alertes prix actives |
| /api/achats/price-watch/:id | DELETE | Desactiver une alerte prix |
| /api/achats/check-price-watches | POST | Verifier si des alertes se declenchent |
| /api/labo/stock/economies-report | GET | Rapport economies (ex oem-report, retrocompat) |

## GPO enrichi avec preuves prix
Quand JADOMI envoie au fournisseur via GPO :
- Email et page tokenisee enrichis avec "Prix marche constates"
- Liste des prix concurrents prouves par factures
- Tarif cible JADOMI avec pourcentage reduction
- Le fournisseur voit les prix de ses concurrents → pression d'alignement

## SQL Passe 52 (execute en prod 26/04/2026)
Fichier : sql/scan/passe52_compare_intelligence.sql
- Table price_watches (alertes prix)
- Table spend_snapshots (snapshots mensuels)
- Table cabinet_benchmarks (benchmark anonyme)
- Vue v_economies_jadomi (produits moins cher ailleurs)
- Vue v_spend_by_category (depenses par categorie)
- Vue v_spend_by_supplier (depenses par fournisseur)
- Vue v_price_history (historique prix pour courbes)
- Vue v_benchmark_category (benchmark anonyme par categorie)
- Fonction check_price_watches() (declenchement alertes)

## Fix performance scan engine
- findEquivalents() : batch queries (11 → 3 requetes)
- enrichScanResult() : parametre existingPrices evite doublon getProductPrices()

## Securite (corrige par review)
- Injection ilike sanitizee dans /api/scan/search
- XSS corrige dans emails GPO fournisseur (escHtml)
- XSS corrige dans onclick UI economies (escAttr)
- IDOR corrige sur /api/achats/* (verification acces societe)
- Fuite donnees cross-cabinet corrigee sur price-history
- Validation GTIN (format + longueur)
- Division par zero protegee (savings, trend)

## Fichiers cles Passe 52
| Fichier | Modifications |
|---------|--------------|
| server.js | +9 endpoints achats, renaming notif, fix IDOR |
| services/scan-engine.js | Fix N+1, batch queries, doublon prix |
| services/oem-intelligence.js | Renaming messages user-facing |
| routes/labo/stock.js | Renaming notif + endpoint economies-report |
| lib/emails/supplier-offer.js | Prix marche dans emails GPO + escHtml |
| api/gpo/public.js | Prix marche dans page fournisseur + escLike |
| public/supplier-offer.html | Section market intelligence frontend |
| index.html | Onglet Economies complet + widget "Mes Economies" |
| sql/scan/passe52_compare_intelligence.sql | 3 tables + 5 vues + 1 fonction |

## Benchmark concurrence mondiale
JADOMI a maintenant 5 features UNIQUES (detection alternatives, prix factures,
GPO rotation, groupage, photo IA) + toutes les features des meilleurs
(Alara, ZenOne, Torch Dental, Coupa) : spend analytics, price watch,
benchmark anonyme, historique prix.

===============================================================
# 30. STRATEGIE FACTURATION GPO (Passe 53)
===============================================================

## Probleme resolu
Le GPO JADOMI est ANONYME pendant la negociation. Mais apres acceptation,
le fournisseur doit facturer le cabinet (nom, adresse, SIRET obligatoires).
La facturation electronique devient obligatoire le 1er septembre 2026.

## Solution A — "Revelation post-acceptation" (EN PROD)
1. Negociation ANONYME : "Cabinet #JD-4827 veut 200 boites de Septanest"
2. Fournisseur accepte le prix → PRIX VERROUILLE contractuellement
3. JADOMI revele l'identite : nom, adresse, SIRET, email, telephone
4. Fournisseur facture DIRECTEMENT le cabinet
5. Le cabinet deduit normalement (comptabilite classique)
Avantage : zero intermediaire, zero risque fiscal.
Le fournisseur ne peut PAS modifier le prix apres acceptation.

## Solution C — "Mandat de facturation" (ROADMAP, quand 50+ cabinets)
Article 289 du CGI autorise un tiers a emettre des factures
AU NOM ET POUR LE COMPTE du fournisseur.
1. Le fournisseur signe un mandat de facturation avec JADOMI
2. JADOMI emet la facture au nom du fournisseur → vers le cabinet
3. Le cabinet recoit une facture legale (deductible)
4. JADOMI gere la facturation electronique 2026 pour tous
5. Le fournisseur n'a RIEN a faire (argument commercial massif)
Avantage : anonymat PERMANENT, JADOMI controle tout le flux,
facturation electronique as a service, enrichissement auto base prix.
Prerequis : creation structure juridique JADOMI (SAS ou cooperative achats)

## Facturation electronique 2026
- Obligatoire 1er sept 2026 (grandes entreprises + ETI)
- Obligatoire 1er sept 2027 (PME + micro)
- JADOMI peut devenir plateforme de facturation pour ses fournisseurs
- Argument commercial : "Vous n'avez rien a faire, JADOMI s'en occupe"
- API a integrer : Chorus Pro / plateforme agreee

## Enrichissement base de prix
| Methode | Rapidite | Donnees |
|---------|----------|---------|
| Scraping catalogues publics | Immediat | Prix catalogue (sans remise) |
| Connexion logins fournisseurs (modele Minti) | Rapide | Prix negocies reels |
| Import factures PDF (deja fait P51) | Progressif | Prix reels payes |
| Crowdsource scans (deja fait P51) | Progressif | Prix verifies |

## Table gpo_orders (SQL 54)
Commande confirmee avec identites revelees, prix verrouille,
bon de commande PDF, suivi livraison + facturation.
Statuts : confirmed → order_sent → acknowledged → shipped → delivered → invoiced → completed
Numerotation : JD-YYYY-NNNN (sequence PostgreSQL)

===============================================================
# 31. PASSE 73 (4 mai 2026) — Gestion Equipe + Auth Kling + Video Home
===============================================================

## 31.1 Gestion Equipe Collaborateurs (FAIT)
Systeme complet pour inviter assistantes/secretaires/comptables avec
permissions granulaires par module. Le praticien choisit ce que chaque
collaborateur peut voir.

### Fichiers modifies
- public/admin/dentiste-pro.html : onglet Equipe branche sur vraie API
  (suppression DEMO_TEAM, appels GET/POST/PUT/DELETE reels)
- api/dentiste-pro/team.js : +1 endpoint GET /check-invitation
  (verification publique token invitation pour page inscription)
  + lien invitation corrige vers /equipe/invitation

### Fichiers crees
- public/equipe/invitation.html : page inscription collaborateur
  (clic lien email → creation compte Supabase + acceptation invitation)
  Design premium noir/indigo, jauge mot de passe, affichage permissions
- public/equipe/profil.html : page profil collaborateur
  (voir son role, ses permissions, changer mot de passe)
- server.js : +2 routes /equipe/invitation et /equipe/profil

### Systeme permissions dashboard
Au chargement du dashboard dentiste-pro, appel GET /team/my-permissions.
Si pas owner, les onglets sidebar non autorises sont masques.
Mapping tab→permission : agenda, patients, chat, stock, comptabilite,
facturation, statistiques, configuration, waitlist, rappels, ia-config.
Bouton "Mon profil" ajoute pour collaborateurs.

### Roles predefinies (deja dans team.js depuis P51)
| Role | Agenda | Patients | Chat | Stock | Compta | Factu | Stats | Config |
|------|--------|----------|------|-------|--------|-------|-------|--------|
| Praticien (owner) | oui | oui | oui | oui | oui | oui | oui | oui |
| Associe | oui | oui | oui | oui | oui | oui | oui | oui |
| Secretaire | oui | oui | oui | non | non | non | non | non |
| Assistante | oui | oui | oui | non | non | non | non | non |
| Comptable | non | non | non | non | oui | oui | oui | non |
| Stagiaire | oui | oui | non | non | non | non | non | non |

Permissions modifiables par le praticien via toggles (14 modules).

## 31.2 Auth Kling JWT HMAC-SHA256 (FAIT)
Provider Kling corrige pour utiliser JWT signe au lieu de Bearer simple.
L'API Kling v1 exige : header {alg:HS256,typ:JWT} + payload {iss:accessKey,
exp:+30min, iat:now, nbf:now-5} + signature HMAC-SHA256 avec secretKey.

### Fichiers modifies
- lib/ai-studio/providers/kling.js : constructor accepte (accessKey, secretKey)
  avec fallback sur KLING_ACCESS_KEY/KLING_SECRET_KEY du .env.
  Nouvelle methode _generateJWT(). _getRequestConfig() utilise le JWT.
- Backup : kling.js.backup-20260504

### Test auth
- scripts/test-kling-auth.js : test connexion 0 unit → 200 OK SUCCEED
- KLING_ACCESS_KEY et KLING_SECRET_KEY ajoutes au .env

## 31.3 Video Home Page "Je suis JADOMI" (EN COURS)

### Concept
Avatar JADOMI qui traverse des univers : cabinet dentaire, labo
prothesiste, voiture coursier, tournee infirmiere. L'avatar entre
dans chaque monde et explique ce que JADOMI fait pour ce metier.
3 cibles : dentiste, prothesiste, infirmiere liberale.

### Voix-off ElevenLabs (FAIT)
- Voix : Julien (zlP1wgh6FsmMZswaDa2M) — Parisien, calm & friendly
- ElevenLabs plan Starter (5$/mois) active
- Settings : stability 0.35, similarity 0.85, style 0.60 (expressif orateur)
- 6 segments generes, 67s total
- Fichiers : public/assets/audio/home/01-intro.mp3 a 06-final.mp3
  + voiceover-complete.mp3

### Texte voix-off valide par le fondateur
"Bonjour... je m'appelle JADOMI. Je suis une intelligence artificielle,
au service des professionnels. Chirurgiens-dentistes... prothesistes...
infirmieres... avocats... et bien d'autres. Je suis la pour vous
faciliter la vie — vous economiser du temps, et de l'argent. Du concret.
Pas de blabla.

Docteur... vous perdez du temps avec vos commandes ? Je scanne vos
factures. Je surveille vos stocks. Et je vous trouve les meilleurs
prix du marche — automatiquement.

Au labo... chaque prothese a son suivi. Reception... fabrication...
cuisson... expedition. Votre dentiste voit tout, en temps reel. Et
les tournees de livraison ? C'est moi qui les organise.

Votre coursier... sait exactement ou aller. Dans quel ordre. Avec le
suivi GPS, pour chaque cabinet. Le dentiste est prevenu... avant meme
que la couronne arrive.

Infirmiere... vos tournees sont pretes, chaque matin. La route...
l'ordre des patients... et a chaque porte — une preuve de passage
horodatee et geolocalisee. Pour travailler l'esprit tranquille.

Je suis JADOMI... et ce n'est que le debut."

### Kling image-to-video (test OK)
- 1 clip test genere : kling-avatar-raw.mp4 (5.1s, 1152x768, 3.8 MB)
- Lip-sync demarre mais interrompu (a reprendre)
- Reste a faire : 5-6 clips multi-univers avec Kling
- Budget : ~60-70 units sur 100 trial restants (~80 apres test)

### Musique de fond (A FAIRE)
- PeacockMusic recommande par le fondateur (peacock-music.com)
- Chercher piste cinematic corporate ~70-80s
- Telecharger et mixer avec voix-off

### Assemblage final (A FAIRE)
- Pipeline : clips Kling multi-univers + voix-off + musique → FFmpeg
- Cible : video 60-70s, 1080p, qualite pub TV
- Integrration sur home page jadomi.fr

### Scripts crees
- scripts/fetch-home-video-assets.js (stock Pexels — pas utilise dans V finale)
- scripts/generate-voiceover-final.js (ElevenLabs Julien)
- scripts/test-kling-auth.js (validation JWT)
- scripts/test-kling-lipsync.js (pipeline image2video + lipsync)
- scripts/find-french-voice.js (recherche voix FR)

## 31.4 SQL deployes cette session
- SQL 53 (reseau_soins) — FAIT
- SQL 54 (gpo_orders) — FAIT (avec DROP POLICY IF EXISTS)
- SQL 57 (signed_documents) — FAIT
- MIGRATION_COMPLETE_65 — DEJA EN PROD (confirme par query pg_tables)
- SQL 64 (get_database_stats RPC) — DEJA EN PROD (confirme par SELECT)

## 31.5 Bugs / Notes
- Push GitHub bloque par fichiers GUDID >100 MB dans l'historique Git.
  36 commits pushes sur 141 (par lots de 10-15). 105 restants.
  Solution a planifier : git-filter-repo pour exclure data/gudid/ ou Git LFS.
  NE PAS toucher a l'historique sans accord explicite du fondateur.
- ElevenLabs : plan Starter active (10 000 credits)
- Kling : ~80 units trial restants (1 clip test consomme ~10-15)

===============================================================
# 12. COMPARATEUR PRIX MULTI-FOURNISSEURS
===============================================================

## Architecture
- Table Supabase : `scraped_prices` (supplier_name, product_name, brand,
  reference, category, price, price_original, discount_percent, url, scraped_at)
- Constraint unique : supplier_name + product_name (upsert)
- API import : POST /api/scan/import-prices (CORS *, lots de 500)
- API recherche : GET /api/scan/compare-name/:name (ilike fuzzy)
- API scan : GET /api/scan/compare-price/:gtin (code barre)

## Fournisseurs scrapes (Passe 74 — 7 mai 2026)
| Fournisseur   | Methode               | Produits | Status    |
|---------------|-----------------------|----------|-----------|
| GACD          | XHR navigateur        | 42 000   | IMPORTE   |
| Mega Dental   | Puppeteer sitemap VPS | 19 514   | IMPORTE   |
| Doctor AI     | Puppeteer sitemap VPS | ~7 400   | EN COURS  |
| Doctor Strong | Puppeteer search VPS  | ~7 000   | EN COURS  |
| DentalClick   | Puppeteer search VPS  | ~3 000   | EN COURS  |
| Dentaltix     | Puppeteer sitemap VPS | ~1 451   | EN COURS  |

## Scripts scraper (repertoire scripts/)
- scrape-doctorai-sitemap.js   : Puppeteer stealth, sitemap 7408 URLs
- scrape-doctorstrong-vps.js   : Puppeteer stealth, categories + search alpha
- scrape-dentalclick-vps.js    : Puppeteer stealth, search alpha
- scrape-dentaltix-sitemap.js  : Puppeteer stealth, sitemap FR 1447 URLs
- scrape-mega-proxy.js         : ScraperAPI (optionnel, non utilise)
- Scripts navigateur console : public/js/mega-v2-oneliner.js,
  dai-alpha-v3.js, ds-alpha-v3-fast.js, dc-alpha-v2.js, dtx-alpha.js

## Logs VPS (nohup, survivent a deconnexion PC)
- /tmp/doctorai-sitemap.log
- /tmp/dentaltix-sitemap.log
- /tmp/doctorstrong-vps.log
- /tmp/dentalclick-vps.log

## Page import-relay : public/import-relay.html
Recoit les donnees par postMessage ou coller JSON manuel.
Envoie par lots de 500 a /api/scan/import-prices.

## Fonctionnalite comparateur panier intelligent
Le dentiste/prothesiste peut :
1. Rechercher un produit par nom → voir les prix chez tous les fournisseurs
2. Scanner un code barre → meilleur prix instantane
3. Creer un panier → JADOMI optimise le panier en repartissant
   les achats par fournisseur pour obtenir le cout total minimum
4. Alertes prix : notification quand un produit passe sous un seuil

## Automatisation hebdomadaire
- Cron VPS : chaque dimanche 3h du matin
- Script : scripts/cron-scrape-all.sh
- Ordre : GACD → Mega Dental → Doctor AI → Dentaltix → Doctor Strong → DentalClick
- Logs : /tmp/jadomi-cron-scrape.log + logs individuels par date
- Les prix sont automatiquement mis a jour dans scraped_prices (upsert)
- Duree totale estimee : ~16h (tout sequentiel pour eviter surcharge VPS)

## TODO Passe 74 (restant)
- [ ] Interface recherche comparateur dans dashboards dentiste/prothesiste
- [ ] Panier intelligent : optimisation multi-fournisseur cout minimum
- [ ] Henry Schein : ajouter au comparateur (site a analyser)

## Analyse concurrentielle — Askara.ai (09/05/2026)

### Qui sont-ils
- **Fondateurs** : Benjamin Fitouchi (dentiste), Franck Bezu (dentiste), Jules Lagadic (CTO), Shirley Barioz
- **Prix** : 35€/mois/dentiste (annuel ~27€/mois)
- **Users** : 3 200 praticiens (mai 2026)
- **Lancement** : Août 2024

### Ce qu'Askara fait
- Dictaphone IA → document en 50 secondes
- Active Consult : écoute conversation 90min → multi-documents automatiques
- 9 types documents : CR consultation, courrier confrère, CR implant, certificat, ordonnance, CR cone beam, bon de labo
- Intégrations : Julie + Logos_w uniquement
- STT propriétaire (pas OpenAI/ChatGPT)
- HDS + ISO 27001 (via hébergeur)

### Ce qu'Askara NE fait PAS (avantages JADOMI)
1. Pas de vision cabinet (que documentation)
2. Pas d'imagerie / détection pathologies
3. Pas de connexion prothésiste / triangle photo
4. Pas de comparateur prix fournisseurs (JADOMI = 155K+ produits, 20+ fournisseurs)
5. Pas de QR code patient photos (innovation mondiale JADOMI)
6. Pas de gestion stock
7. Pas d'achat groupé (JADOMI Equipment Groupon)
8. Pas de module patient complet
9. Pas de réseau solidarité / SOS confrères
10. Plan Platinium (téléphonie IA, agenda) PAS ENCORE DISPONIBLE chez eux

### État actuel JADOMI vs Askara — ce qu'on a déjà
| Feature                          | Askara | JADOMI | Statut JADOMI            |
|----------------------------------|--------|--------|--------------------------|
| Dictée vocale                    | ✅ Pro  | ✅ Base | Web Speech API fr-FR     |
| Document auto consultation       | ✅ 9    | ❌      | A CONSTRUIRE             |
| Écoute active conversation       | ✅ 90min| ❌      | A CONSTRUIRE             |
| Courriers IA pro                 | ✅      | ✅      | 5 types, Claude Sonnet   |
| Analyse ordonnance IA            | ❌      | ✅      | Claude Vision (Passe 68) |
| Connexion prothésiste            | ❌      | ✅      | 119 endpoints, 15 modules|
| Comparateur prix                 | ❌      | ✅      | 155K+ refs, 20+ sites   |
| Triangle photo QR                | ❌      | ✅      | Innovation mondiale      |
| Achat groupé                     | ❌      | ✅      | Equipment Groupon        |
| Module patient                   | ❌      | ✅      | Cas + photos + suivi     |
| Réseau solidarité                | ❌      | ✅      | SOS confrères            |

### Stratégie JADOMI — "Mieux qu'Askara"
1. NE PAS copier leur STT pur (2 ans d'avance sur le speech-to-text)
2. Utiliser Whisper/Deepgram + fine-tune vocabulaire dentaire
3. Se concentrer sur la valeur ajoutée EN AVAL du document :
   - Bon de labo → envoi DIRECT au prothésiste via JADOMI
   - Ordonnance → analyse IA + alerte interactions
   - CR consultation → archivage patient + partage confrère sécurisé
4. Positionnement : "Askara = dictaphone IA" vs "JADOMI = plateforme complète"
5. Le comparateur 155K+ produits = imbattable, Askara ne l'aura jamais
6. QR code patient + triangle photo = unicité mondiale

### TODO — Module "IA Documentaire JADOMI" (faire mieux qu'Askara)
Phase 1 — Dictée vocale pro :
- [ ] Upgrade STT : Whisper API ou Deepgram avec vocabulaire dentaire
- [ ] Enregistrement audio persistant (stockage sécurisé HDS)
- [ ] Transcription en temps réel avec corrections IA
Phase 2 — Génération documents IA (les 9 types d'Askara + nos bonus) :
- [ ] CR consultation automatique depuis dictée/notes
- [ ] Courrier confrère IA (déjà partiellement fait)
- [ ] CR implant / CR cone beam
- [ ] Certificat médical
- [ ] Ordonnance assistée IA (on a déjà l'analyse, ajouter la génération)
- [ ] Bon de labo → connecté au prothésiste JADOMI (avantage unique)
- [ ] Devis détaillé patient
- [ ] Consentement éclairé
- [ ] Lettre correspondant (spécialiste)
Phase 3 — Écoute active (le killer feature d'Askara) :
- [ ] Mode "consultation" : micro ouvert pendant la consultation
- [ ] IA écoute et génère multi-documents en fin de consultation
- [ ] Détection automatique des actes, diagnostics, prescriptions
- [ ] Résumé patient en 1 clic
Phase 4 — Avantages JADOMI exclusifs (ce qu'Askara ne pourra JAMAIS faire) :
- [ ] Bon de labo IA → envoi direct au prothésiste connecté
- [ ] CR + photos intra-buccales → dossier patient enrichi
- [ ] Ordonnance → vérification prix comparateur intégré
- [ ] Document signé électroniquement (PAdES, déjà en place)
- [ ] Archivage coffre-fort chiffré AES-256-GCM (déjà en place)

## Passe 76 (9 mai 2026) -- IA Documentaire + Questionnaire Medical + Connecteur Logiciel

La passe qui transforme JADOMI en cerveau IA medical. Benchmark mondial
(USA, Chine, Coree, Japon) realise avant construction. Objectif : ecraser
Askara.ai sur leur propre terrain + ajouter ce qu'aucun concurrent ne fait.

### Benchmark concurrentiel mondial
- **USA** : Abridge (#1 KLAS, $5.3B), Suki ($299/mois), Freed ($79), Pearl Voice (dentaire), Nabla
- **Chine** : iFlytek (75 000 institutions, score 95.4 MedBench), WeChat mini-programs triage
- **Coree** : Soombit AI (image radio → rapport texte auto, approuve regulateur)
- **Japon** : NEC (dialogue → dossier structure, -116h/an/medecin)
- **France** : Askara (35€/mois Pro 3min, ~90€/mois Premium Active Consult)

### Module 1 : IA Documentaire JADOMI
Backend api/ia-doc/index.js (13 endpoints) :
- POST /transcribe — Whisper API (99 langues, detection auto, 0.006$/min)
- POST /translate — Traduction medicale Claude (vocabulaire dentaire specialise)
- POST /generate-document — 10 types documents (CR, bon labo, certificat, devis...)
- POST /session/start + /end + /segment — Sessions consultation avec timer
- GET /session/:id/transcript — Transcription complete
- POST /session/:id/generate-all — Claude analyse + genere tous docs pertinents
- GET /quota — Suivi consommation
- POST /tts — Text-to-Speech OpenAI (lecture traduction au patient)
- POST /upload-media — Upload photos/radios (camera telephone OU import)
- POST /analyze-media — Claude Vision analyse radios dent par dent (notation FDI)
- POST /generate-certificat — Certificat medical descriptif PDF avec photos integrees

Frontend onglet "IA Documentaire" dans dashboard dentiste-pro :
- 4 modes : Dictee rapide, Consultation (timer 60min), Traduction live, Certificat/CR photos
- Web Speech API gratuit en francais (0€), Whisper pour langues etrangeres
- Gestion pauses naturelles (restart auto 100ms apres silence Chrome)
- Accumulation texte entre redemarrages (pas de perte)
- Upload photos : drag & drop OU camera telephone (capture="environment")
- Analyse Claude Vision en temps reel sous chaque photo
- Generation PDF certificat avec photos integrees, en-tete cabinet, ITT, signature

Securite medicale :
- Ordonnance JAMAIS generee automatiquement par generate-all
- Brouillons marques "VERIFICATION OBLIGATOIRE PAR LE PRATICIEN"
- Dosages manquants = "[A PRECISER PAR LE PRATICIEN]"
- Consentement eclaire aussi marque brouillon

Traduction live 99 langues :
- Patient parle arabe/berbere/turc/urdu → Whisper detecte → Claude traduit → TTS repond
- Francais = Web Speech API (0€), etranger = Whisper (0.006$/min)
- VAD (Voice Activity Detection) locale → on paye QUE quand quelqu'un parle
- Cout reel : ~0.32€/consultation etrangere, ~0.02€/consultation FR

SQL sql/76_ia_documentaire.sql : 4 tables (ia_doc_sessions, ia_doc_segments,
ia_doc_documents, ia_doc_usage), 11 index, RLS, trigger updated_at.

### Module 2 : Questionnaire Medical Patient
Backend api/questionnaire-medical/index.js (6 endpoints) :
- POST /send — Envoie lien unique au patient (email), token 32 chars, expire 30j
- GET /:token — Retourne questionnaire adaptatif (public, rate limited)
- POST /:token/submit — Soumet reponses + signature, cree patient auto
- GET /patient/:id/medical — Questionnaire complet + alertes + expiration
- GET /alerts/:id — Alertes medicales actives (pour IA ordonnance)
- GET /check-expiry — Patients > 12 mois (relance)

4 questionnaires par profession : dentiste, kine, osteopathe, infirmiere.
6 sections adaptatives : Identite, Allergies, Traitements, Coeur, Antecedents, Dentaire.
Questions conditionnelles (showIf) : si "oui" cardiaque → sous-questions valves.
10 alertes medicales auto-detectees :
- ALLERGIE_PENICILLINE (severity critical) → contre-indication amoxicilline
- ALLERGIE_LATEX, ALLERGIE_ANESTHESIQUE
- RISQUE_HEMORRAGIQUE (AVK, antiplaquettaires) → protocole hemorragie
- RISQUE_ONM (bisphosphonates) → eviter extractions
- ENDOCARDITE_ANTIBIOPROPHYLAXIE (valvulopathie) → amoxicilline 2g avant geste
- GROSSESSE → medicaments contre-indiques
- DIABETE_CICATRISATION → suivi cicatrisation
- IMMUNODEPRESSION, RADIOTHERAPIE_CERVICOFACIALE

Frontend public/questionnaire/index.html : page patient mobile-first,
fond creme #FAFAF8, gros boutons Oui/Non tactiles (52px), progress bar
8 etapes, signature electronique canvas, confirmation animee.

Pas de double saisie : le patient se CREE dans JADOMI en remplissant
le questionnaire. L'assistante tape juste nom + telephone.
Regle 12 mois : pas de doublon, relance seulement si > 12 mois.

SQL sql/77_questionnaire_medical.sql : 3 tables (patients_jadomi,
questionnaire_medical_invitations, questionnaire_medical_signatures),
10 index dont GIN sur alertes_medicales, RLS, trigger updated_at.

### Module 3 : Connecteur Logiciel Dentaire
Framework lib/connector/framework.js : ConnectorAdapter (classe abstraite)
+ SyncEngine (sync temps reel, poll configurable, stats).

4 adaptateurs :
- lib/connector/adapters/logos.js — Firebird reader, auto-detect tables,
  discoverSchema(), mapping configurable. Pour Logos_w, Julie, Visiodent.
- lib/connector/adapters/doctolib.js — Playwright, compte assistant/secretaire
  legitime, lecture agenda, parse patients, comportement humain (delais aleatoires,
  frappe lettre par lettre). Le praticien cree un compte secretaire JADOMI.
- lib/connector/adapters/doctolib-ical.js — Lecteur iCal (non utilisable,
  Doctolib n'a pas de lien iCal natif).
- lib/connector/adapters/generic-csv.js — Import CSV universel, auto-detection
  colonnes.

Backend api/connector/index.js (9 endpoints, auth admin) :
- POST /test — Tester connexion Firebird ou Doctolib
- GET /discover — Decouverte schema + auto-detection tables patients/RDV
- POST /configure — Sauvegarder mapping tables/colonnes
- POST /sync-now — Sync manuelle
- GET /status — Statut sync
- POST /start + /stop — Sync temps reel
- POST /import-csv — Import CSV patients
- GET /patients-preview — Preview 20 premiers patients

Frontend onglet "Connecteur" dans dashboard dentiste-pro :
- Progress steps visuels (1-4), card statut connexion (pastille verte/rouge),
  selection logiciel (7 options), formulaire connexion Firebird,
  decouverte schema, import CSV drag & drop, sync temps reel toggle,
  tableau patients synchro, historique syncs.

SQL sql/78_connector.sql : 2 tables (connector_config, connector_sync_log),
RLS, indexes, trigger updated_at.

### Decision strategique : JADOMI = cerveau IA AU-DESSUS de Doctolib
JADOMI ne remplace PAS Doctolib. JADOMI se branche dessus via compte
assistant/secretaire et ajoute l'intelligence medicale :
- Questionnaire medical auto avant RDV
- Alertes CI/allergies pendant consultation
- Traduction live pour patients etrangers
- CR + certificat avec photos/radios
- Comparateur prix integre
- Suggestion : JAMAIS d'action sur l'agenda sans validation praticien
- REGLE ABSOLUE : ne JAMAIS supprimer ou deplacer un RDV sans confirmation

### Vision "Gestion Intelligente des Urgences" (ROADMAP)
Quand un patient appelle en urgence :
1. IA trie les urgences par gravite (douleur, trauma, infection)
2. IA regarde l'agenda du dentiste → propose de recaser
3. Si annulation → propose le creneau a un patient urgent en attente
4. Si trop d'urgences → regarde les agendas des confreres a proximite
5. Propose au confrere en manque de patients de prendre l'urgence
6. Entraide inter-cabinets = meilleure gestion, meilleur soin
7. Le dentiste VALIDE toujours, l'IA ne fait que proposer

### BDPM (Base de Donnees Publique des Medicaments)
API gouvernementale gratuite (data.gouv.fr) identifiee pour securiser
les ordonnances IA : dosages officiels, contre-indications, grossesse,
interactions. A integrer dans le generate-document type ordonnance.
Cout : 0€. Mise a jour : 2x/jour par l'ANSM.

### Fichiers crees cette passe (16 fichiers)
- api/ia-doc/index.js (13 endpoints, ~800 lignes)
- api/questionnaire-medical/index.js (6 endpoints)
- api/connector/index.js (9 endpoints)
- lib/connector/framework.js (SyncEngine + ConnectorAdapter)
- lib/connector/adapters/logos.js (Firebird)
- lib/connector/adapters/doctolib.js (Playwright)
- lib/connector/adapters/doctolib-ical.js (iCal)
- lib/connector/adapters/generic-csv.js (CSV)
- public/questionnaire/index.html (page patient mobile)
- sql/76_ia_documentaire.sql (4 tables)
- sql/77_questionnaire_medical.sql (3 tables)
- sql/78_connector.sql (2 tables)

### Fichiers modifies
- server.js (+3 modules montes : ia-doc, questionnaire, connector)
- public/admin/dentiste-pro.html (+3 onglets : IA Doc, Connecteur, Certificat photos)

### SQL a executer dans Supabase Dashboard
- sql/76_ia_documentaire.sql
- sql/77_questionnaire_medical.sql
- sql/78_connector.sql

### TODO Passe 76 (restant)
- [ ] Executer SQL 76, 77, 78 dans Supabase Dashboard
- [ ] Creer compte secretaire JADOMI dans Doctolib Pro
- [ ] Trouver chemin .fdb Logos au cabinet (lundi)
- [ ] Configurer connecteur Doctolib (email + mot de passe compte assistant)
- [ ] Configurer connecteur Logos (chemin Firebird + user/password)
- [ ] Integrer API BDPM dans generation ordonnance (verification medicaments)
- [ ] Tester questionnaire medical sur mobile reel
- [ ] Tester dictee vocale + traduction sur Chrome mobile

### Complements Passe 76 (meme session, 9 mai 2026 apres-midi/soir)

Ajouts dashboard Precision Dentaire (index.html) :
- Fix bug critique : accolade manquante dans updateVocalUI() ligne 2653
  qui cassait TOUT le JS du dashboard (aucun onglet ne marchait)
- 7 nouveaux onglets dans la sidebar (groupe "JADOMI IA") :
  Agenda, Equipe, JADOMI Voice, Cas Cliniques, Snap Photos, Passeports, Questionnaires
- Page mobile JADOMI Voice : /voice (dictee, consultation, traduction, certificat)
- Fix navigation multi-societes : MR mapping corrige (index.html → /index,
  sci.html → /sci-dashboard, commerce.html → /commerce)
- Fix login : bouton voir mot de passe + lien "Mot de passe oublie"
- Fix dashboard SCI : lit societe_active_id du localStorage + affiche nom societe

Snap Photos ameliore :
- Bouton flip camera (selfie ↔ arriere)
- Mode video natif (camera app du telephone, pas MediaRecorder navigateur)
- Bouton importer depuis galerie
- Mode multi-capture : photos/videos s'accumulent, "Envoyer tout" en batch
- Tokens snap expires dans 30 jours (pas 24h)
- Backend accepte videos jusqu'a 500 MB
- Token reutilisable (pas marque "used" apres premier upload)

5 Passeports premium crees :
- /documents/passeport-blanchiment.html (design noir/or, zoom Ken Burns sourire)
- /documents/passeport-facettes.html (6 seances, entretien, aliments)
- /documents/passeport-implant.html (8 etapes, consignes post-op J1-J7)
- /documents/passeport-rehabilitation.html (10 etapes, alimentation progressive)
- /documents/passeport-orthodontie.html (mois par mois, gouttieres/bagues, contention)

Module Cas Clinique deploye :
- api/cas-clinique/index.js (8 endpoints : CRUD, medias, notes, partage prothesiste/patient)
- sql/80_cas_clinique.sql (3 tables : cas_cliniques, cas_clinique_medias, cas_clinique_notes)
- Lien avec snap QR code (cas_id dans snap_tokens)

Scraping en cours :
- Henry Schein : enrichissement 39 923 refs (nom, marque, prix, description, sous-refs)
  Script ameliore pour visiter chaque page produit (extractFullProductInfo)
- DPI : enrichissement 9 623 refs relance
- Gerho : 50 000+ produits en cours
- 3 catalogues PDF parses par Claude Vision (673 produits)
- Matching cross-fournisseur lance (161K produits, 3 passes : ref, nom, fuzzy Jaccard)

Patients Doctolib :
- 7 735 patients importes dans patients_jadomi (Precision Dentaire)
- 5 photos Bouamama Farida recues via snap QR code
- Compte assistant Doctolib cree et connecte (agenda lu)

Regles instaurees :
- Verification syntaxe JS AVANT et APRES chaque edit HTML (new Function())
- Une accolade manquante = tout le dashboard casse = INACCEPTABLE
- Numero telephone JADOMI : JAMAIS dans le code public, que dans .env

### ROADMAP APP FLUTTER (PROCHAINE SESSION DEDIEE)

App Flutter existante : github.com/karimstock/jadomi-app (clone sur VPS)
Screens actuels : Login, Home, Stock, Scanner, Invoice, Bank Statement,
Mail Scan, Analytics, Deals + Vocal Service

Screens a ajouter pour couvrir TOUT JADOMI :
- [ ] Agenda JADOMI (remplacer Doctolib 200€/mois)
- [ ] JADOMI Voice (dictee, traduction 99 langues, consultation)
- [ ] Cas Cliniques (creer cas, QR code, photos/videos, timeline)
- [ ] Snap Photos (camera integree, multi-capture, envoi batch)
- [ ] Passeports (vue patient, avant/apres, evolution)
- [ ] Questionnaire Medical (envoi + liste patients)
- [ ] Equipe (inviter collaborateurs, permissions)
- [ ] Comparateur Prix (recherche, scan → meilleur prix multi-fournisseur)
- [ ] Chat prothesiste (messagerie, Triangle Photo)
- [ ] Notifications push (rappels, urgences, alertes medicales)
- [ ] Mode hors-ligne (cache local, sync au retour reseau)
- [ ] Connecteur Doctolib (lecture agenda en temps reel)
- [ ] Module patient (le patient voit son passeport, ses RDV, ses documents)

Objectif : app native qui remplace Doctolib + Askara + tout en 1

### Vision "Coursier mutualise prothesistes" (IDEE FUTURE)
Petits labos dans le meme secteur mutualisent un coursier auto-entrepreneur.
JADOMI optimise les tournees multi-labos. Modele Uber pour les protheses.
Coursier gagne 80-120€/jour, labo economise ~1000€/mois vs salarie.
JADOMI prend 15-20% commission. Backend tournees deja construit (Passe 69-70).

## Passe 78 (11 mai 2026) — Agenda World-Class + IA Locale + Comparateur Prix
SESSION MARATHON : agenda refait de zero niveau Doctolib+, IA locale Ollama deployee,
pipeline verification prix 6 equipes, scraping DentalClick + DentalGoodDeal.

### Pipeline Verification Prix (6 equipes)
Architecture complete pour verifier les matches prix entre fournisseurs :
1. Normalisateurs : structurent chaque produit (marque, gamme, conditionnement)
2. Matchers : score structuré (gamme + marque + conditionnement)
3. Controleurs : regles metier (accessoire ≠ produit, prix coherent)
4. Experts : re-analysent uncertain + rejected (familles produit, prix/unite)
5. Recuperation : re-cherche sur Venta avec requetes precises
6. Rapport : verified + probable = fiable
Resultat : 2287 matches fiables sur 2588 (88.4%), 830 faux matches corriges.
Scripts : scripts/verify-matches-pipeline.js, scripts/recover-matches.js

### Scraping DentalClick (7565 + 6398 produits)
- v4 (console navigateur) : 6020 produits + 21155 sous-refs = 8245 lignes importees
- v5 (fiches individuelles) : 6398 sous-refs mais parser a recalibrer
- Methode : script console colle sur dentalclick.fr (pas de Puppeteer, bloque IP)
- Classes CSS : .product-card, .product-card__name, .product-card__final-price-with-save
- Nettoyage auto : prefixe "Brand" enleve, doublons "Selectionner" supprimes
- Scripts : public/js/dc-v4.js, dc-v5.js, dc-import.js

### Scraping DentalGoodDeal (dentiste + prothesiste)
- Plateforme ptahcms : produits dans onclick (pas dans href)
- Site dentiste (dentalgooddeal.com) : 3314 fiches trouvees, scraping OK
- Site prothesiste (prothesiste.dentalgooddeal.com) : 555 fiches, 809 sous-refs
- Scripts : public/js/dgd-v2.js, dgd-proto-v1.js
- Guide complet : SCRAPING-CONSOLE-GUIDE.md
- BUG A CORRIGER : le parser de prix est FAUX sur DGD. Tous les produits
  ont le meme prix (2.25€ / 1022.4€ barre) — le parser attrape un prix
  parasite du footer/sidebar au lieu du vrai prix dans le tableau produit.
  Ne PAS importer les fichiers DGD v2/proto-v1 tant que le parser n'est
  pas recalibre. Il faut identifier les bons selecteurs CSS pour les prix
  dans les fiches produit DGD (structure differente de DentalClick).
  Meme probleme sur DentalClick v5 (prix 1.16€ partout).
  Le v4 DentalClick (7565 produits) est fiable et importe.

### Agenda intelligent (tab-agenda.js + agenda.js)
Features ajoutees :
- Multi-actes par seance (1 RDV = plusieurs actes avec dents)
- Jours travailles personnalisables (par jour, matin/aprem, horaires custom)
- Mode solo (1 clic GO = arrive + soin + copilot)
- Boutons rapides sur les blocs RDV (arrive, copilot, fin)
- Drag & drop pour deplacer les RDV
- Clic droit : modifier, cas clinique, passeport, replanifier, annuler
- Annulation + notification patient + proposition creneaux
- Historique annulations avec restauration
- Alerte planning en retard + suggestions
- QR code check-in patient (page publique + API + impression)
- Email confirmation automatique avec pixel tracking
- Indicateurs email lu / confirme sur les blocs RDV
- Proposition passeport auto en fin de copilot

### Copilot premium
- Modal choix avec/sans micro avant lancement
- Mode chrono (sans micro) : timer + ajout manuel actes
- Design glassmorphism (blur, glow, gradient, animation slide-up)
- Gros chrono 28px lumineux
- Detection numeros de dents FDI (vocal "seize"→16 + numerique)
- 20 keywords dentaires (composite, implant, blanchiment, cone beam...)
- Actes structures {categorie, acte, dents[]} sauvegardes dans le RDV

### Cas Clinique unifie
- Fusionne : photos/videos patient + passeport + notes + partage
- "Snap Photos" supprime comme module separe
- Accessible depuis clic droit agenda (nom patient pre-rempli)
- 4 actions : Photos/videos (QR), Passeport (choix type + avec/sans photo), Notes, Partager (prothesiste/patient)
- Passeports accessibles aussi depuis JADOMI IA (modal choix patient)

### JADOMI IA Local (lib/ia-router.js)
Architecture 3 niveaux pour reduire les couts :
- Niveau 1 REGLES LOCALES (0€, <1ms) : detection actes, dents FDI, alertes medicales, classification, suggestion passeport
- Niveau 2 OLLAMA Mistral 7B (0€, ~5sec) : resume notes, messages patient, classification produits
- Niveau 3 CLAUDE API (payant, dernier recours) : traduction, analyse photos, documents complexes
- 8 templates documents a 0€ (lib/ia-templates.js) : CR consultation, CR implant, certificat, courrier confrere, ordonnance, devis, bon labo, consentement eclaire
- Economie estimee : 90% (de ~$150/mois a ~$10/mois)
- Endpoints : /api/ia-local/health, /detect, /summarize, /message, /document, /templates

### Email confirmation + tracking
- Email auto envoye a la creation du RDV (si email patient fourni)
- Design JADOMI teal avec heure/date/acte
- Pixel tracking invisible (1x1 PNG transparent)
- Bouton "Confirmer ma presence" → page confirmation
- Endpoints : /api/dentiste-pro/agenda/track/:id/pixel.png, /confirm/:id
- Indicateurs visuels sur les blocs agenda : email envoye/lu/confirme

### Infrastructure
- Table Supabase dentiste_pro_agenda deployee (sql/81_agenda.sql)
- Endpoint /api/scan/import-prices cree (CORS ouvert)
- Ollama installe sur VPS (Mistral 7B + Qwen 2.5 3B)
- Pages JADOMI IA corrigees (plus de "Bientot disponible")
- Guide scraping console : SCRAPING-CONSOLE-GUIDE.md

### Fichiers crees
- scripts/verify-matches-pipeline.js (pipeline 5 equipes)
- scripts/recover-matches.js (equipe 6 recuperation)
- lib/ia-router.js (routeur IA 3 niveaux)
- lib/ia-templates.js (8 templates documents)
- api/ia-local/index.js (endpoints IA locale)
- public/js/dc-v4.js, dc-v5.js, dc-import.js (scrapers DentalClick)
- public/js/dgd-v2.js, dgd-proto-v1.js (scrapers DentalGoodDeal)
- public/agenda/checkin.html (page QR check-in patient)
- sql/81_agenda.sql (table agenda Supabase)
- SCRAPING-CONSOLE-GUIDE.md

### Fichiers modifies
- public/admin/js/tab-agenda.js (refonte complete agenda)
- api/dentiste-pro/agenda.js (multi-actes + check-in + email + tracking)
- public/admin/jadomi-ia.html (passeports + modules + modal)
- index.html (pages JADOMI IA corrigees)
- server.js (import-prices + ia-local)

## Passe 79 (17 mai 2026) — App Mobile Flutter + Simulateur Dashboard

### Simulateur App Mobile
- Build Flutter web deploye a /app-preview/ (flutter build web --base-href=/app-preview/)
- Nouveau tab "App Mobile" dans sidebar Acces rapide avec cadre iPhone 15 Pro
- Status bar live (heure, signal, wifi, batterie) + Dynamic Island + home indicator
- Iframe charge la vraie app Flutter compilee (pas un mockup)
- CSP desactive pour /app-preview (app admin interne, pas public)
- Gate middleware autorise /app-preview, /canvaskit, .wasm sans auth

### Reorganisation sidebar organisation.html
- Accordion "Acces rapide" avec sous-boutons : Tous les modules, Equipment, Scraping, App Mobile, Credits IA
- Chaque sous-bouton ouvre son propre onglet dedie (pas de melange)
- Fix priorite catch-all server.js : public/ servi avant root/ (evite fichier obsolete)
- Fix cache HTML : no-cache sur fichiers .html pour voir les changements immediatement

### App Flutter (jadomi-app/)
- Supabase auth + AdminHubScreen pour admin
- LoginScreen pour utilisateurs standards
- Config : supabaseUrl, anonKey, apiBase = https://jadomi.fr/api
- Scanner, MapLibre, DeepSeek OCR, Geolocator integres

### Fichiers modifies
- server.js (CSP, gate, cache headers, catch-all priority)
- public/organisation.html (tab app-mobile, sidebar reorganisee)
- public/app-preview/ (rebuild Flutter web complet)

## Passe 82 (17 mai 2026) — Dashboards natifs Flutter + donnees test Lille/Roubaix

### Dashboard Prothesiste natif (labo_dashboard_screen.dart)
- Carte temps reel positions livreurs (refresh 15s via /labo/tournees/positions/live)
- Bottom nav native : Production / Suivi carte / Livreurs / Plus
- Bouton retour AppBar
- Livreurs ouvre LivreurScreen natif (plus d'ouverture web externe)
- Suivi carte affiche SnackBar (ecran natif a venir)

### Dashboard IDE natif (ide_dashboard_screen.dart)
- Navigation JADOMI au lieu de Waze/Google Maps par defaut
- Bouton retour AppBar ajoute
- Fix status tournee : 'termine' (pas 'terminee')
- Bouton "Dashboard complet" ouvre la version web

### Drawer dentiste refonte (home_screen.dart)
- Sections organisees : ESSENTIEL (natif) + PLUS (web)
- Snap Photos renomme "Scanner"
- Liens web ouverts via url_launcher (plus natif quand disponible)

### Fixes UI globaux
- Fausse status bar retiree du simulateur
- Care : AppBar propre avec bouton retour
- Avocat : ecran natif 4 cards (coffre, clients, agenda, compta)
- Patient : ameliorations UI
- Admin Hub : WebView JADOMI integree
- jadomi_map_stub.dart : conditional import pour compilation web

### Backend fixes
- Jointure arrets tournee : adresse_ligne1 (pas adresse) + retrait latitude/longitude inexistants
- Routes app livreur accessibles sans auth Supabase

### Donnees de test creees en base
- Labo Prothese du Nord : 4 livreurs (Nordine, Youssef, Antoine, Mehdi)
- Tournee Nordine 17/05 matin : 5 arrets a Lille (Dupont, Martin, Lefebvre, Bernard, Moreau)
- 5 demandes de passage creees (origine: dentiste)
- Cabinet IDE Roubaix : 5 patients (Delcourt, Bouali, Vandenberghe, Carpentier, Deroubaix)
- 5 visites IDE matin Roubaix

### Build et deploiement
- Flutter build web deploye /app-preview/ avec tous les fixes
- PM2 reload OK, server stable

### Fichiers modifies (jadomi)
- routes/labo/tournees-livreur.js (jointure arrets fix)
- uploads/flyers/_metadata.json + PDF ZENDO

### Fichiers modifies (jadomi-app)
- lib/screens/labo_dashboard_screen.dart (carte live + bottom nav + livreur import)
- lib/screens/ide_dashboard_screen.dart (nav JADOMI + bouton retour)
- lib/screens/home_screen.dart (drawer refonte)
- lib/screens/admin_hub_screen.dart (WebView enrichi)
- lib/screens/livreur_screen.dart (fixes)
- lib/screens/navigation_map_screen.dart (ameliorations)
- lib/screens/patient_home_screen.dart (UI)
- lib/widgets/jadomi_map.dart (markers livreurs)
- lib/widgets/jadomi_map_stub.dart (nouveau — stub web)
- lib/screens/jadomi_webview_screen.dart (nouveau — WebView native)
- pubspec.yaml + pubspec.lock (url_launcher)

### Demandes en attente (prochaine session)
1. Page accueil web dentiste (pas ouvrir direct sur stock)
2. Lien dentiste <-> prothesiste (module connexion cabinet/labo)
3. Bouton retour Care a verifier

## Passe 83 (17 mai 2026 soir) — Pages accueil tous metiers + Chat IA patient + Navigation GPS

### Pages d'accueil (12 dashboards)
- Cabinet dentaire (index.html) : accueil avec KPIs stock, raccourcis, alertes
- Dentiste Pro (dentiste-pro.html) : accueil agenda, patients, labo
- IDE, medecin, orthodontiste, kine, podologue, orthophoniste, psychomotricien, dieteticien, sage-femme, bien-etre, createur
- Chaque accueil : KPIs metier, raccourcis rapides, alertes, prochains RDV/taches
- Orthographe : 130+ corrections d'accents sur 12 fichiers

### Module Dentiste ↔ Prothesiste
- Onglet Mon Labo restructure (3 sous-onglets : Labos, Cas, Chat Labo)
- Bouton "Relier a un labo" sur les cas sans labo + nom labo affiche
- API liaison bidirectionnelle (liaison-labo.js + liaison-dentiste.js)
- SQL : table liaisons_cabinet_labo (83)

### App Patient — Chat IA + RDV automatise
- Backend chat-patient-ia.js : DeepSeek (0.14EUR/M) + fallback local mots-cles
- Prise de RDV automatisee : intent detection → recherche creneaux → proposition → confirmation
- Moderation ZERO TOLERANCE (insultes/sexuel/racisme → blocage)
- Triage urgence dentaire : cellulite (critique), fracture/expulsion (critique), abces (urgent), douleur (semi-urgent)
- Conseils premiers secours adaptes (garder morceau dans lait, compression hemorragie)
- Inscription automatique liste urgence cabinet + notification dentiste
- Envoi photos/documents (radio, devis mutuelle, courrier specialiste)
- Resume pre-RDV pour le dentiste (ce que le patient a dit, soins a prevoir, documents)
- Gestion famille (multi-profils : conjoint, enfant, parent)
- Reponse multilingue (detection langue + code retourne pour TTS)
- SQL : tables chat_patient_ia_messages (84) + patient_famille_membres (85)

### App Flutter Patient
- Ecran chat IA (transcription vocale multilingue speech_to_text, cards creneaux RDV)
- Ecran gestion famille (CRUD membres)
- Page accueil enrichie (cards Assistant JADOMI + Ma famille)
- Login enrichi (profil complet a l'inscription)

### Navigation GPS tournee IDE (Leaflet)
- Carte Leaflet avec rotation bearing (sens de la route)
- Barre instructions turn-by-turn en haut (fleche + distance + nom de rue)
- Barre patient en bas (nom + heure + soin + ETA)
- Compteur vitesse + panneau limite + clignotement depassement
- Instructions vocales (Web Speech API, gratuit, cooldown 8s)
- Zones de danger OSM (radars fixes via Overpass API, gratuit)
- Alertes communautaires (signaler travaux, bouchon, zone de danger)
- Trace 3 couches (ombre + bordure + centre lumineux)
- Simulation GPS desktop (500ms/point, vitesse realiste)
- POI pharmacies/stations essence a proximite

### Organisation
- JADOMI Copilot dans acces rapide (ex "Dentiste Pro")
- Societe dentaire (orga generique pour les societes dentaires)
- Mon Equipe fonctionnel (invite par email, 6 roles, permissions, retirer)
- Mes pubs deplace de cabinet dentaire vers DentalEvolution
- Carte livreurs Labo → lien vers suivi-livreurs.html (existant)

### Infrastructure
- MCP Supabase configure (acces direct BDD, token permanent)
- 3 tables SQL creees et validees (83, 84, 85)
- PM2 reload OK, toutes routes montees
- Commits : jadomi (4ef158d) + jadomi-app (b9c04a1)

### Priorites prochaine session
1. Build Flutter Codemagic (MapLibre natif pour navigation)
2. Push jadomi (erreur 500 GitHub temporaire)
3. Tester chat IA patient dans l'app
4. Fleches directionnelles sur la carte (a refaire proprement sur MapLibre)
5. Polir sites Expert + Product Compositor
6. Migration HDS — des devis OVH recu

## Passe 84 (18 mai 2026) — Cabinet Brain + Mail Copilot

### Document d'architecture
- docs/ARCHITECTURE-CABINET-BRAIN.html (1 775 lignes, 15 sections)
- Vision complete : Desktop Agent (Tauri v2), Cloud, Cabinet Brain,
  Mail Copilot, Connecteurs, systeme d'agents IA, securite RGPD/HDS,
  stack technique, multi-tenant SaaS, roadmap MVP → avancee
- Card ajoutee dans Documents BASEPLAN (organisation.html)

### Cabinet Brain — API + Dashboard
- 5 tables SQL deployees sur Supabase :
  cabinet_brain, cabinet_brain_documents, cabinet_brain_events,
  cabinet_brain_rules, cabinet_brain_tasks
- RLS + GRANT + 2 fonctions RPC (search_brain_documents, get_brain_stats)
- pgvector active pour recherche semantique (embeddings 1536)
- API /api/brain/* — 17 endpoints :
  GET/PUT identity, GET/POST/DELETE documents, GET search,
  GET/POST/PUT/DELETE rules, POST rules/:id/correct (feedback loop),
  GET/POST/PUT/DELETE tasks, GET events, GET stats, GET digest, POST ask
- Dashboard "Mon Cabinet" dans organisation.html — 3 onglets :
  Mon cabinet (resume + recherche + infos repliable),
  Mes mails (copilot), Mes taches (todo + auto)
- Ajout lien "Mon Cabinet" dans 10 dashboards metier
  (dentiste-pro, IDE, medecin, kine, orthodontiste, sage-femme,
  podologue, dieteticien, psychomotricien, orthophoniste)

### Mail Copilot — branche sur scanner existant
- api/brain/mail-copilot.js — 6 endpoints :
  POST connect (test IMAP + sauvegarde comptes_email_societe),
  GET accounts, DELETE accounts/:id,
  POST sync (lire mails + classifier + indexer factures dans brain_documents),
  POST draft (JADOMI redige reponse avec contexte Brain),
  POST send (envoi SMTP via compte du praticien),
  POST compose ("envoie un mail au comptable" → JADOMI compose)
- Utilise comptes_email_societe EXISTANT (pas de table doublon)
- Tables mails_copilot + comptes_email_copilot supprimees (doublons)
- Classification mails locale 0EUR (regex, mots-cles, fournisseurs connus)
- Cascade IA : Local (0EUR) → Mistral (0.13EUR/M, RGPD FR) → Claude (fallback)
- DeepSeek JAMAIS sur donnees mails (Data Guard bloque)
- Factures PDF detectees auto-indexees dans cabinet_brain_documents

### Fichiers crees
- CREE : docs/ARCHITECTURE-CABINET-BRAIN.html
- CREE : sql/86_cabinet_brain.sql (5 tables + fonctions + RLS)
- CREE : api/brain/index.js (877 lignes, 17 endpoints)
- CREE : api/brain/mail-copilot.js (350 lignes, 6 endpoints)

### Fichiers modifies
- server.js (mount /api/brain)
- organisation.html (sidebar Mon Cabinet, 6 panels Brain, Mail Copilot UI)
- public/admin/dentiste-pro.html (lien Mon Cabinet)
- public/medecin/dashboard.html (lien Mon Cabinet)
- public/kine/dashboard.html (lien Mon Cabinet)
- public/orthodontiste/dashboard.html (lien Mon Cabinet)
- public/sage-femme/dashboard.html (lien Mon Cabinet)
- public/podologue/dashboard.html (lien Mon Cabinet)
- public/dieteticien/dashboard.html (lien Mon Cabinet)
- public/psychomotricien/dashboard.html (lien Mon Cabinet)
- public/orthophoniste/dashboard.html (lien Mon Cabinet)

### Decisions
- "Brain" renomme "Mon Cabinet" partout (comprehensible par le praticien)
- 7 onglets fusionnes en 3 (Mon cabinet, Mes mails, Mes taches)
- Mail Copilot = pas de doublon avec scanner existant, meme table comptes_email_societe
- Classification mails = locale (0EUR), pas d'IA. Mistral pour les reponses.
- Migration OVH HDS : commercial appelle mercredi 21 mai 2026 (GPU + HDS)

### Priorites prochaine session
1. Tester connexion Gmail avec mot de passe d'application
2. Optimiser scanner compta existant : Mistral Pixtral au lieu de Claude (20x moins cher)
3. Build Flutter Codemagic
4. Push jadomi (erreur 500 GitHub)
5. Tester chat IA patient dans l'app

## Passe 85 (18 mai 2026 soir) — JADOMI Copilot Global + Mail Copilot enrichi

### JADOMI Copilot — Widget flottant global
- public/js/jadomi-copilot.js (347 lignes) — widget auto-injectable
- FAB violet bottom-right, panneau chat glassmorphism slide-in
- Micro vocal integre (Web Speech API, 0EUR, fr-FR)
- Badge notifications rouge clignotant (mails en attente + taches urgentes)
- Detection contexte page automatique (stock, agenda, labo, orga...)
- Suggestions cliquables dans le message d'accueil
- Inclus dans : organisation, index, dentiste-pro, IDE, medecin, kine, ortho
- api/copilot/index.js (570 lignes) — backend unique

### Detection d'intent locale (0EUR, instantanee)
20+ categories detectees par regex + normalisation sans accents :
- mail, compose, agenda, patient, urgence, stock, comparateur
- compta, labo, rappels, traitement, stats, equipe, site, document
- greeting, merci, aide, general
- Tolere : fautes orthographe, accents manquants, tutoiement,
  abreviations (bjr, slt, mel, rdv, g, jveu, stp)
- 75/75 tests passes (batterie complete)

### Reponses directes (pas d'IA quand inutile)
- "mes mails du jour" → requete mails_inbox, retour direct
- "mails d'hier" / "de lundi" / "cette semaine" → parseDate() langage naturel
- "resume boite" → stats directes (non lus, attendent reponse, factures)
- "mails importants" → filtre needs_response + priority urgent/high
- "retrouve reservation voiture" → recherche mots-cles dans sujet/body
- "mes factures" → requete financial_type dans mails_inbox
- "envoie un mail au comptable" → Agent Mistral Compositeur, vrai mail pret

### Filtrage bruit (isNoiseMail)
Filtre automatiquement : newsletters, promos, sondages, notifs systeme
(Yahoo/Google), webinaires, charite/crowdfunding, rapports auto JADOMI,
maintenance services tiers, DEKRA, France Travail, ClearCorrect summaries

### Mail Copilot — Daemon sync permanent
- Daemon node-cron toutes les 5 min, sync automatique IMAP
- Table mails_inbox (SQL 88) — tous les mails classes en permanence
- Sequence numbers (pas UIDs — fix Yahoo IMAP)
- Scan dossier Envoyes pour marquer mails deja repondus
- 30 mails par batch, remonte jusqu'a janvier 2026
- Classification 19 categories locales (fournisseur, comptable, banque,
  labo, patient, assurance, facture, juridique, rh, formation, ordre,
  impots, commercial, notaire, cpam, mutuelle, informatique, immobilier,
  maintenance)
- Detection documents financiers : facture vs devis vs avoir vs relance
  vs mise en demeure vs bon commande vs bon livraison vs releve
- Detection "attend une reponse" : questions, demandes documents/validation
  /paiement/rdv, relances, urgence

### Agents Mistral enrichis
- 4 agents (classifieur 12 categories, redacteur, extracteur, compositeur)
- System prompts detailles avec exemples concrets
- Compositeur : trouve les contacts du cabinet, compose le mail complet
- validateResponse() corrige : regex tutoiement strict (plus de faux positif)
- Cascade : Local (0EUR) → Mistral (0.13EUR/M) → Claude (fallback)

### Fichiers crees
- CREE : api/copilot/index.js (570 lignes)
- CREE : public/js/jadomi-copilot.js (347 lignes)

### Fichiers modifies
- server.js (mount /api/copilot)
- lib/ai-studio/jadomi-brain.js (fix validateResponse tutoiement)
- lib/brain/mail-sync-daemon.js (fix since scope, sequence numbers Yahoo)
- lib/brain/mail-scorer.js (19 categories, isNoiseMail enrichi)
- api/copilot/index.js (20+ intents, parseDate, isNoiseMail, handlers directs)
- index.html, organisation.html, dentiste-pro.html, IDE, medecin, kine, ortho
  (inclusion jadomi-copilot.js)
- index.html (Comptabilite = onglet principal sidebar)

### Decisions
- 1 seul chatbot pour TOUT JADOMI (pas un par module)
- Widget flottant present sur toutes les pages (pas un onglet)
- Reponses directes depuis la BDD quand possible (pas d'IA)
- IA uniquement pour : composer un mail, repondre a une question complexe
- Le dentiste tutoie, JADOMI vouvoie toujours
- Titre "Docteur" dans toutes les reponses
- Migration OVH HDS : commercial appelle mercredi 21 mai 2026

### Passe 86 (18 mai 2026 soir) — Panneau lateral + lecture mails + import 10K + DeepSeek

- Widget split view : chat gauche + panneau lateral droit (cards, brouillon, lecture)
- Cards mail cliquables → "Lire" telecharge le contenu complet depuis IMAP a la demande
- Body sauvegarde en cache apres premier chargement
- Brouillon mail editable (contenteditable) avec bouton Envoyer + Modifier via chat
- Import bulk 10 000 mails (ranges IMAP 500, bypass limite Yahoo SEARCH 1000)
- 9 000 mails classes : 649 fournisseurs, 448 banque, 232 factures, 398 formations...
- Capture factures auto : PDF joints + factures inline (corps mail)
- 10+ factures PDF captees (EDF, Anthropic, CIC, comptable, fournisseurs)
- DeepSeek intent parser pour requetes ambigues (0.00003 EUR/req)
  "mon notaire depuis 2026" → category:notaire, since:2026-01-01
- parseDate enrichi : "depuis 2 semaines", "depuis 3 mois", jours de la semaine
- Fix greeting : "salut retrouve mes mails" ne bloque plus sur greeting
- Fix notaire faux positif : "compromis" → "compromis de vente"
- Fix isNoiseMail : VistaPrint, Boulanger, messagerie vocale Free, noreply
- Fix needs_response : noreply = JAMAIS reponse attendue
- 6 faux positifs corriges en BDD automatiquement
- Compta handler redirige vers le vrai scanner (index.html) pas de faux resultats
- Raccourcis directs sur page accueil organisation (Compta, Precision Dentaire, Stock, Comparateur)
- Lien Comptabilite dans sidebar Mon Cabinet

### Priorites prochaine session
1. AUTO-SCANNER FACTURES : brancher le scanner existant (analyserDocumentIA + Claude)
   sur le compte mail connecte du Copilot. Scan automatique, resultats par mois,
   checkboxes validation. Meme UI que index.html#compta mais automatique.
2. Panneau lateral : afficher les factures scannees avec checkboxes comme dans index.html
3. Tester le copilot widget sur mobile
4. Brancher le copilot sur l'agenda IA (analyzeDay, optimizeDay, detectGaps)
5. Build Flutter Codemagic
6. Push jadomi (erreur 500 GitHub)

===============================================================
FIN DU CODEX -- Actualise automatiquement par Claude Code a chaque passe
Derniere mise a jour : 18 mai 2026 (Passe 85 — JADOMI Copilot Global)
===============================================================
