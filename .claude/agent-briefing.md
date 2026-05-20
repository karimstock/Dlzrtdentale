# JADOMI — Briefing Agent (LIRE EN PREMIER)

> Ce document donne le contexte complet du projet aux agents Claude Code.
> Sans ce briefing, tu travailles à l'aveugle. LIS TOUT avant d'agir.

## 1. C'EST QUOI JADOMI

Plateforme SaaS B2B française pour professionnels de santé (dentistes, kiné, ortho...),
avocats, BTP, SCI, créateurs, services bien-être. Gère agenda, stock, compta, labo,
site vitrine, mails, IA copilot, signature électronique, etc.

- **Serveur** : Ubuntu 22.04, IP 141.94.10.182, Node.js + Express (server.js ~13000 lignes)
- **BDD** : Supabase (PostgreSQL) — ref: vsbomwjzehnfinfjvhqp
- **Frontend** : HTML/CSS/JS vanilla, ~220 pages, 22+ dashboards
- **PM2** : fork mode, port 3001 derrière Nginx (SSL jadomi.fr + jadomi.be)
- **Fondateur** : Karim (karim_bahmed@yahoo.fr) — seul développeur avec Claude Code

## 2. ARCHITECTURE FICHIERS

```
/home/ubuntu/jadomi/
├── server.js              # Point d'entrée principal (~13000 lignes)
├── .env                   # Secrets (JAMAIS toucher)
├── api/                   # Modules API (copilot, brain, vitrines, dentiste-pro, etc.)
├── lib/                   # Librairies internes (ia-router, agents, brain)
├── public/                # Frontend statique
│   ├── *.html             # 47 pages racine (landing, login, register, métiers...)
│   ├── admin/             # dentiste-pro.html, jadomi-ia.html, scan-stats.html
│   ├── labo/              # 20+ pages (dashboard, stock, facturation, tournées...)
│   ├── btp/               # dashboard, chantiers, devis, factures, ouvriers, stock
│   ├── medecin/           # dashboard.html (SPA avec showPage)
│   ├── kine/              # dashboard.html
│   ├── orthodontiste/     # dashboard.html
│   ├── orthophoniste/     # dashboard.html
│   ├── osteopathe/        # dashboard.html
│   ├── podologue/         # dashboard.html
│   ├── psychomotricien/   # dashboard.html
│   ├── sage-femme/        # dashboard.html
│   ├── dieteticien/       # dashboard.html
│   ├── patient/           # index.html (PWA patient)
│   ├── ide/               # dashboard.html (infirmiers)
│   ├── sci-dashboard/     # dashboard.html (SCI immobilier)
│   ├── juridique/         # dashboard, clients, agenda
│   ├── services/          # dashboard, stock, prestations
│   ├── bien-etre/         # dashboard.html
│   ├── createur/          # dashboard.html
│   ├── studio/            # hub, cms, mon-site, mes-sites, flyer-builder, video-creator
│   ├── vitrines/          # dashboard, edit, site-public, aide, rendez-vous
│   ├── showroom/          # dashboard, index
│   ├── equipment/         # offres, propose
│   ├── deals/             # index.html
│   ├── booking/           # index.html (réservation publique)
│   ├── visio/             # index.html (visioconférence)
│   ├── rush/              # nouvelle-demande, suivi-commande, mes-demandes
│   ├── conformite/        # index.html
│   ├── annuaire/          # index.html
│   ├── voice/             # index.html (commande vocale)
│   ├── support/           # index, admin, communaute, tutoriels
│   ├── js/                # jadomi-copilot.js (widget global)
│   └── assets/            # images, fonts, videos
├── docs/                  # Documents fondateur (BASEPLAN)
├── sql/                   # Scripts SQL (vitrines, migrations)
├── scripts/audit-teams/   # 7 équipes audit sécurité + team lead
├── docker/docuseal/       # Signature électronique (DocuSeal)
├── uploads/               # Fichiers uploadés
└── CODEX.md               # Mémoire persistante projet (LIRE AUSSI)
```

## 3. DISTINCTION CRITIQUE : VITRINES vs DASHBOARDS

### Pages VITRINES (marketing, publiques, pour visiteurs non-connectés)
Ce sont des landing pages. Un lien vers une vitrine depuis un dashboard = BUG.

| Route | Fichier | Description |
|-------|---------|-------------|
| / | public/landing.html | Landing page principale |
| /chirurgiens-dentistes | public/chirurgiens-dentistes.html | Vitrine dentistes |
| /orthodontistes | public/orthodontistes.html | Vitrine ortho |
| /prothesistes-dentaires | public/prothesistes-dentaires.html | Vitrine prothésistes |
| /avocats | public/avocats.html | Vitrine avocats |
| /professions-paramedicales | public/professions-paramedicales.html | Vitrine paramédical |
| /btp | public/btp.html | Vitrine BTP |
| /sci | public/sci.html | Vitrine SCI |
| /createurs | public/createurs.html | Vitrine créateurs |
| /services-bien-etre | public/services-bien-etre.html | Vitrine bien-être |
| /infirmiers | public/infirmiers.html | Vitrine IDE |
| /jadomi-ads | public/jadomi-ads.html | Vitrine publicité |
| /tarifs | public/tarifs.html | Page tarifs |
| /demo | public/demo.html | Démo interactive |
| /login | public/login.html | Connexion |
| /register | public/register.html | Inscription |
| /cgv | public/cgv.html | CGV |
| /mentions-legales | public/mentions-legales.html | Mentions légales |
| /contact | public/contact.html | Contact |

### Pages DASHBOARDS (espaces de travail, connectés, pour utilisateurs)
Ce sont des apps. Un bouton dans un dashboard DOIT pointer vers un autre dashboard.

| Route | Fichier | Description |
|-------|---------|-------------|
| /organisation.html | public/organisation.html | Hub admin principal (onglets sT) |
| /dentiste | index.html (racine) | Dashboard dentiste (showPage) |
| /admin/dentiste-pro.html | public/admin/dentiste-pro.html | Copilot dentaire |
| /labo/dashboard.html | public/labo/dashboard.html | Dashboard labo |
| /btp/dashboard.html | public/btp/dashboard.html | Dashboard BTP |
| /sci-dashboard | public/sci-dashboard/dashboard.html | Dashboard SCI |
| /juridique/dashboard.html | public/juridique/dashboard.html | Dashboard juridique |
| /services/dashboard.html | public/services/dashboard.html | Dashboard services |
| /ide/dashboard.html | public/ide/dashboard.html | Dashboard IDE |
| /bien-etre/dashboard.html | public/bien-etre/dashboard.html | Dashboard bien-être |
| /showroom/dashboard.html | public/showroom/dashboard.html | Dashboard créateur |
| /commerce.html | commerce.html (racine) | Dashboard commerce |
| /medecin | → public/medecin/dashboard.html | Dashboard médecin |
| /kine | → public/kine/dashboard.html | Dashboard kiné |
| /orthodontiste | → public/orthodontiste/dashboard.html | Dashboard ortho |
| /orthophoniste | → public/orthophoniste/dashboard.html | Dashboard orthophoniste |
| /osteopathe | → public/osteopathe/dashboard.html | Dashboard ostéo |
| /podologue | → public/podologue/dashboard.html | Dashboard podologue |
| /sage-femme | → public/sage-femme/dashboard.html | Dashboard sage-femme |
| /psychomotricien | → public/psychomotricien/dashboard.html | Dashboard psychomotricien |
| /dieteticien | → public/dieteticien/dashboard.html | Dashboard diététicien |
| /comparateur | public/comparateur.html | Comparateur prix |
| /rappels | public/rappels.html | Rappels patients |
| /dashboard-annonceur | public/dashboard-annonceur.html | Dashboard pubs |
| /studio/hub.html | public/studio/hub.html | Hub studio |
| /studio/cms/ | public/studio/cms/index.html | CMS sites |
| /vitrines/dashboard.html | public/vitrines/dashboard.html | Dashboard vitrines |

### Pages PROFILS PUBLICS (profil d'un pro visible par les patients)
| Route | Usage |
|-------|-------|
| /expert/{slug} | Profil public avocat/juridique |
| /artisan/{slug} | Profil public artisan BTP |
| /showroom/{slug} | Profil public créateur |
| /booking/{slug} | Page réservation publique |
| /pro/{slug} | Profil public pro santé |

## 4. FICHIERS À LA RACINE (hors public/)

Ces fichiers sont servis par des routes Express explicites, pas par express.static :
- `index.html` → servi via app.get('/dentiste') — c'est le dashboard dentiste
- `commerce.html` → servi via app.get('/commerce.html')
- `membres-societe.html` → servi via app.get('/membres-societe.html')
- `settings-societe.html` → servi via app.get('/settings-societe.html')
- `admin.html` → servi via app.get('/admin.html')
- `checkout.html` → servi via app.get('/checkout.html')
- `mobile.html` → servi via app.get('/m')

ATTENTION : les fichiers dans public/ sont servis par express.static SANS option
`extensions: ['html']`. Donc `/organisation` (sans .html) NE FONCTIONNE QUE si une
route Express explicite existe. `/organisation.html` fonctionne via express.static.

## 5. NAVIGATION INTERNE

### organisation.html — Hub admin
- Navigation sidebar par `sT('tabname', this)` → affiche `#t-tabname`
- Onglets : overview, compta, users, messages, analytics, sectors, plans, settings,
  securite, brain-dashboard, brain-mail, brain-tasks, fourmiliere, documents,
  signature, rapide, mes-orgas, equipment, scraping, test-apps, app-mobile,
  ai-credits, studio-home, studio-abo
- Switch sociétés via `oS(id, type)` → utilise table `MR[type]` pour rediriger
- Module Routes (MR) : { cabinet_dentaire: '/dentiste', sci: '/sci-dashboard',
  orthodontiste: '/orthodontiste', juridique: '/juridique/dashboard.html', etc. }

### Dashboards santé (medecin, kine, ortho, etc.)
- Navigation interne par `showPage('pagename')` → affiche `#page-pagename`
- Lien "Mon Cabinet" → `/organisation.html` (ou `/organisation` avec route Express)
- Lien "Facturation" → `/billing.html`

### Dashboards labo
- Navigation sidebar avec liens href relatifs (stock.html, facturation.html, etc.)
- Tabs internes par `switchTab('name')` → affiche `#tab-name` ou `#panel-name`
- Lien retour → `/organisation`

### Dashboards BTP
- Sidebar avec liens href relatifs (chantiers.html, devis.html, etc.)
- Lien "Ma page publique" → `/artisan/{slug}` (PAS /expert/)

## 6. EMAILS OFFICIELS

- `contact@jadomi.fr` : pages publiques (footer, CGV, support)
- `noreply@jadomi.fr` : envois automatiques (notifications, confirmations)
- `karim_bahmed@yahoo.fr` : email admin/fondateur (JAMAIS sur page publique)

## 7. RÈGLES FONDATEUR (ABSOLUES)

1. NE JAMAIS supprimer une route, un lien, un dashboard sans demande explicite
2. NE JAMAIS toucher server.js sans `node -c` + backup horodaté
3. NE JAMAIS modifier : mobile.html, api/rush.js, api/emailService.js, api/admin.js,
   routes/prothesistes.js, routes/commandes.js, .env
4. Vouvoiement premium dans le code (chatbot, emails, UI)
5. Zéro emoji dans les messages chatbot utilisateurs
6. Accents FR obligatoires (spécialité, pas specialite)
7. Max 10 fichiers modifiés par passe
8. Backup avant modification de server.js
9. `node -c` avant tout reload PM2
10. `pm2 reload` (pas restart) pour zero downtime

## 8. PROVIDERS IA

| Provider | Usage | RGPD |
|----------|-------|------|
| DeepSeek | Intent parsing (anonymisé) | Non (Chine) → anonymisation obligatoire |
| Mistral | Copilot, classification mails | Oui (FR) |
| Claude | Fallback Copilot, cas complexes | Oui |
| Gemini | Vision, images via NanoBanana | Variable |
| OpenAI | DALL-E 3, TTS | Non (US) |

## 9. SÉCURITÉ

- 101 tables avec RLS + policies
- Gate password sur toutes les pages (gate middleware dans server.js)
- Helmet + CORS strict + rate limiting
- UFW firewall actif
- Fail2ban actif
- SSL Let's Encrypt (valide jusqu'au 6 juillet 2026)
- Clé anon != service_role (vérifié)

## 10. BUGS COURANTS À VÉRIFIER

Quand tu audites les boutons/liens :
- Un lien `/sci` dans un dashboard = BUG (c'est la vitrine). Le bon = `/sci-dashboard`
- Un lien `/expert/` dans BTP = BUG. Le bon = `/artisan/`
- Un lien `/organisation` sans .html = OK (route Express ajoutée)
- Un lien `/index.html` = souvent BUG (le fichier n'est pas dans public/)
- `openOrgaPerso()` = fonction qui n'existe pas, toujours un bug
- `#documents` dans organisation.html = faux, l'ID est `#t-documents`
- `stock.html#scanner` = faux, l'ID est `#tab-scanner`
- Tabs : vérifier le PRÉFIXE d'ID (t-, tab-, panel-, pane-, page-, sec-)
