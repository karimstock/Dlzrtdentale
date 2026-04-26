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

## Methode Builder/Reviewer OBLIGATOIRE
Pour chaque tache non-triviale dans une passe :
1. Lancer des agents BUILDERS en parallele (1 par tache)
2. Des qu'un builder finit, lancer un agent REVIEWER derriere
3. Le reviewer verifie : securite, bugs, perf, edge cases, XSS, IDOR
4. Le reviewer corrige directement + node -c apres chaque fix
5. Bilan des corrections dans le rapport de passe
Instauree Passe 52. Resultats : 57 bugs rattrapes sur 3 passes (52-54).

## BASEPLAN — Documents fondateur OBLIGATOIRE
La BASEPLAN regroupe TOUS les documents fondateur du projet :
- docs/DOSSIER-AVOCAT-JADOMI.html (dossier juridique, CGV, questions avocat)
- docs/business-plan-jadomi.html (business plan banque, projections, marche)
- docs/dossier-avocat-jadomi.html (version complementaire avec annexes)
A chaque mise a jour du CODEX (fin de passe), verifier si la BASEPLAN
doit etre enrichie (nouvelles features → impact juridique ou business).
Accessible dans le dashboard admin onglet "Documents" (organisation.html).
Envoyable par email via /api/admin/send-documents.
