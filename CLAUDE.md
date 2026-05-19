# Instructions systeme Claude Code -- Projet JADOMI

REGLES OBLIGATOIRES AVANT ET APRES CHAQUE PASSE :

## Au DEBUT de chaque session Claude Code
1. LIRE /home/ubuntu/jadomi/CODEX.md pour se synchroniser avec l'etat
   actuel du projet.
2. LIRE /home/ubuntu/jadomi/CODEX-UPDATE-RULES.md pour connaitre les
   regles d'actualisation.

## A la FIN de chaque passe de developpement
1. OBLIGATOIRE : Mettre a jour CODEX.md selon CODEX-UPDATE-RULES.md.
2. OBLIGATOIRE : Inclure dans le rapport final une ligne explicite :
   "CODEX.md mis a jour -- section 6 (historique) + 8 (roadmap) +
   10 (bugs)"
3. OBLIGATOIRE : Commit git separe :
   "chore(codex): update after Passe X"

## Philosophie
CODEX.md est la MEMOIRE PERSISTANTE du projet. Si CODEX.md n'est pas
actualise, le fondateur perd sa continuite entre sessions Claude.
C'est INACCEPTABLE.

## Convention de ton
- Vouvoiement premium obligatoire partout dans le code (chatbot,
  emails, UI).
- Zero emoji dans les messages chatbot utilisateurs.
- References design : Vercel v0, Linear, Arc Browser, Apple.

## Standards qualite
- CSS animations : cubic-bezier(.16, 1, .3, 1), 300-600ms
- 60 FPS garantis sur animations
- Fallbacks robustes partout (try/catch, timeout, retry)
- Responsive mobile/tablet/desktop obligatoire
- Accessibilite : aria-label, focus-visible, WCAG AA contraste

## Emails officiels — OBLIGATOIRE (ATTENTION DISTINCTION CRITIQUE)
- contact@jadomi.fr : tout ce qui est VISIBLE PUBLIQUEMENT (pages, footer, CGV, support)
- noreply@jadomi.fr : tout ce qui est envoye automatiquement (notifications, confirmations)
- karim_bahmed@yahoo.fr : email de CONNEXION du fondateur + ADMIN_EMAIL dans le code
  → C'est cet email qui est dans Supabase Auth, c'est avec lui que le fondateur se connecte
  → TOUTES les verifications admin (isAdmin, AE, ADMIN_EMAIL) DOIVENT utiliser cet email
  → NE JAMAIS le remplacer par contact@jadomi.fr dans les checks d'auth/admin
  → NE JAMAIS l'afficher sur une page publique (footer, CGV, landing, etc.)
- REGLE : "public = contact@jadomi.fr" mais "auth/admin code = karim_bahmed@yahoo.fr"
- INCIDENT PASSE 66 : l'audit a remplace l'email admin partout par contact@jadomi.fr,
  rendant tout le hub organisation invisible (isAdmin=false). NE PLUS JAMAIS FAIRE CA.

## Fichiers intouchables
Ne JAMAIS modifier sans demande explicite :
- mobile.html
- api/rush.js
- api/emailService.js
- api/admin.js
- routes/prothesistes.js
- routes/commandes.js
- .env

## Securite production
- Backup horodate avant chaque modification de server.js
- node -c (syntax check) avant tout reload PM2
- pm2 reload (pas restart) pour zero downtime
- Validation etape par etape, pas de big bang

## REGLE ABSOLUE — NE JAMAIS CASSER / SUPPRIMER (Passe 67)
Instauree apres l'incident catastrophique Passe 66 (audit 9 agents,
60+ fichiers casses, routes detruites, dashboards appauvris).
1. NE JAMAIS supprimer une route, un lien, un onglet, un dashboard
   ou une fonctionnalite existante sans demande EXPLICITE du fondateur
2. NE JAMAIS reorganiser les middlewares Express ou l'ordre des routes
   dans server.js — l'ordre existant est FONCTIONNEL
3. NE JAMAIS faire d'audit massif touchant 60+ fichiers — max 10 par audit
4. TOUJOURS tester les routes critiques apres modification
5. TOUJOURS creer un backup avant de modifier server.js, index.html,
   landing.html, organisation.html
6. Un audit ne doit JAMAIS modifier la navigation, les liens, les
   redirections ou le comportement visible — seulement la securite interne
Violation = incident de production. Zero tolerance.

## Code Teams — Protocole multi-agents JADOMI (ex Builder/Reviewer)
Instauree Passe 52, enrichie Passe 88. Remplace la methode Builder/Reviewer simple.
Skill : .claude/skills/code-teams

### Phase 1 — ARCHITECTE (modele principal)
1. Analyser la demande, decouper en sous-taches independantes
2. 1 tache = 1 fichier max, identifier les dependances
3. Creer les taches avec TaskCreate, briefer chaque builder

### Phase 2 — BUILDERS (agents paralleles, isolation worktree)
- isolation: "worktree" obligatoire si le builder modifie du code
- Prompt COMPLET et autonome (contexte, fichiers a lire, patterns)
- 1 builder = 1 fichier, JAMAIS plus
- node -c obligatoire avant de terminer
- MAX 5 builders en parallele

### Phase 3 — REVIEWERS (1 par builder, en parallele)
- Securite (XSS, injection, IDOR, OWASP Top 10)
- Bugs (null checks, edge cases, off-by-one)
- Performance (N+1 queries, memoire)
- Orthographe FR (accents, vouvoiement, pas d'emoji)
- Corrige directement + node -c apres chaque fix

### Phase 4 — INTEGRATEUR (modele principal)
- Verifier TOUS les changements (pas faire confiance au resume)
- Verifier coherence inter-fichiers (imports, API contracts)
- node -c sur TOUS les fichiers modifies
- Si HTML : verifier JS avec new Function()

### Phase 5 — DEPLOYEUR
- git add fichiers specifiques (pas git add .)
- Commit structure (feat/fix/refactor + description)
- TaskUpdate pour chaque tache completee
- Rapport Code Teams en fin de passe

### Regles Code Teams
- MAX 10 fichiers modifies par passe
- NE PAS utiliser pour les taches triviales (1 fichier, < 20 lignes)
- Chaque builder DOIT lire le fichier cible AVANT de le modifier
- Fichiers intouchables : JAMAIS dans un builder (voir liste ci-dessus)

## Orthographe et accents — ZERO TOLERANCE
Regle instauree Passe 66 par le fondateur. L'orthographe est CRITIQUE
pour la credibilite B2B aupres des professionnels de sante et avocats.
1. A chaque passe, deployer des agents CORRECTEURS D'ORTHOGRAPHE
   sur TOUS les fichiers modifies (HTML, JS strings, emails, docs)
2. Tous les textes en francais DOIVENT avoir les accents corrects
   (e, e, e, a, u, c, i, o) — JAMAIS "specialite" toujours "spécialité"
3. Verifier : accents, grammaire, accord, conjugaison, vouvoiement
4. NE PAS toucher : noms de variables, classes CSS, IDs, attributs HTML
5. Les documents BASEPLAN (avocat, business plan) doivent etre PARFAITS
6. Chaque passe doit inclure dans le rapport : "Orthographe verifiee —
   X corrections sur Y fichiers"
Resultats Passe 66 : 20 agents deployes, corrections massives sur tout le site.

## Supabase GRANT OBLIGATOIRE sur chaque nouveau SQL (mai 2026)
A partir du 30 octobre 2026, Supabase n'expose plus automatiquement
les tables "public" a l'API. Sans GRANT explicite, supabase-js retourne
erreur 42501. CHAQUE migration SQL qui cree une table DOIT inclure :
1. GRANT SELECT ON public.table TO anon;
2. GRANT SELECT, INSERT, UPDATE, DELETE ON public.table TO authenticated;
3. GRANT SELECT, INSERT, UPDATE, DELETE ON public.table TO service_role;
4. ALTER TABLE public.table ENABLE ROW LEVEL SECURITY;
5. Au moins 1 policy RLS (meme permissive pour commencer)
Violation = table invisible pour le frontend. Zero exception.
Avant octobre 2026 : auditer TOUTES les tables existantes.

## BASEPLAN — Documents fondateur OBLIGATOIRE
La BASEPLAN regroupe TOUS les documents fondateur du projet :
- docs/DOSSIER-AVOCAT-JADOMI.html (dossier juridique, CGV, questions avocat)
- docs/business-plan-jadomi.html (business plan banque, projections, marche)
- docs/dossier-avocat-jadomi.html (version complementaire avec annexes)
A chaque mise a jour du CODEX (fin de passe), verifier si la BASEPLAN
doit etre enrichie (nouvelles features → impact juridique ou business).
Accessible dans le dashboard admin onglet "Documents" (organisation.html).
Envoyable par email via /api/admin/send-documents.
