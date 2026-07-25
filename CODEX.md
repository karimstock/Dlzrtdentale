# JADOMI — CODEX
> Document de reference maitre du projet JADOMI
> Source unique de verite, actualise automatiquement par Claude Code
> A coller au debut de chaque nouvelle conversation Claude pour synchronisation instantanee

**Derniere mise a jour** : 25 juillet 2026
**Derniere passe** : Session 25 juillet — RAPPROCHEMENT BANCAIRE DANS LA FICHE FACTURE (demande fondateur). Le lien facture<->prelevement vivait UNIQUEMENT dans le releve (`t.facture.doc_id`, pose par `_comptaRematch`) : depuis une facture, impossible de savoir si elle avait ete payee, ni de corriger un rapprochement automatique faux. AJOUTE 4 routes user-scoped HORS du prefixe `/api/compta/` (piege archi requireSociete) : `GET /api/compta-rapprochement/:docId` (lit le lien A L'ENVERS), `GET /api/compta-rapprochement/:docId/candidats` (lignes de releve classees par proximite montant puis date, montant exact en tete, recherche libre `q`, ligne actuelle et lignes deja occupees signalees), `POST /api/compta-rapprochement/lier`, `POST /api/compta-rapprochement/delier`. Les 2 tables de la compta sont gerees (`documents_compta` user-scoped via `dc:<id>` et `cabinet_brain_documents` societe-scoped ; acces societe verifie par `_comptaScanAutoAutorise`). INTEGRITE (compta = zero erreur) : une facture ne justifie QU'UNE ligne — `_comptaRematch` collecte desormais TOUTES les factures deja accrochees (tous les mois) avant de matcher, un lien MANUEL n'est jamais ecrase, et une facture DELIEE a la main est memorisee (`rapprochement_refuse`) donc le rapprochement automatique ne la recolle plus, meme apres re-analyse du mois (etat repris dans la fusion `analyser-releve`). UI (index.html) : bloc « Rapprochement bancaire » dans la fiche facture — « Rapprochee au prelevement du 12/03/2026 — PRLV SEPA EDF 459.20 € », releve + auto/manuel, boutons « Lier a une autre ligne » (selecteur avec recherche) et « Ce n'est pas ce prelevement » ; plus de bouton PDF mort sur le releve (`has_pdf !== false`). TESTS : `scripts/_e2e_rapprochement.js` (souverain, n'imprime que des compteurs, snapshot+restauration des releves) 30/30 OK sur les vrais releves + 10/10 OK sur une ecriture auto-scannee ; node -c OK, JS index.html valide par new Function(), pm2 reload OK, e2e compta global inchange (704 tx, equilibre OK). Branche feat/multi-societes, NON pushe.

**Passe precedente** : Session 24 juillet — COMPTA IMPORT REPARE + MULTI-FICHIERS. Le fondateur : « je veux importer mes factures mais ça marche pas, et je ne peux même pas en importer plusieurs d'un coup ». RACINE du « ça marche pas » trouvee dans les logs (24/07 12:11:26) : `/api/analyser-document` n'etait PAS exempte du timeout global 30 s (`app.use('/api/')`, server.js:189) ; or la RTX du cabinet a FROID met 25-30 s (chargement du modele vision en VRAM) → le timeout tirait pile pendant l'analyse, envoyait une reponse, puis la RTX finissait et l'endpoint refaisait `res.json` → `ERR_HTTP_HEADERS_SENT` (double envoi) → 500 cote fondateur ALORS QUE la RTX avait REUSSI (`[analyse] cabinet-10-10-0-3 (agent) -> BAHM KARIM DENTISTE`). Le routage RTX marche ; c'etait le timeout qui tuait l'import. FIX : route ajoutee a `longRoutes` (exemptee du 30 s) + timeout propre 120 s dans l'endpoint + gardes `if(!res.headersSent)` sur analyser-document ET valider-document. IMPORT MULTI-FICHIERS (index.html) : input `multiple` + drop multi + `pcComptaAnalyseFiles()` (traitement SEQUENTIEL — une seule RTX 8 Go) → chaque doc pre-trie par la RTX (fournisseur/type/montant/pro-perso) → liste revue par le praticien → « Importer les N selectionnes » (`pcComptaImporterBatch`). 1 seul fichier = comportement inchange. Les factures importees retombent dans `documents_compta`, rapprochees auto au releve au chargement de l'onglet Releve. Backups horodates, node -c OK, JS valide par new Function(), pm2 reload OK, 401 sans auth (pas de crash). NON pushe (branche feat/multi-societes sale). A TESTER par le fondateur : re-importer, verifier que ca passe meme RTX froide. **AJOUT (commits `e7d621a`, `e5a9a03`)** : (a) panneau d'analyse REMONTE sous la zone de depot + barre de progression (avant : sous les 6 cartes, il fallait scroller) ; (b) FOURNISSEUR = l'EMETTEUR jamais le CLIENT — facture Free Pro s'affichait « Bahmed » (lui) au lieu de « Free Pro » : les 2 prompts (LOCAL+Claude) corriges + garde-fou `_normaliseDoc` (repli sur le NOM DE FICHIER via `selfNames`/`filename`, ex FreePro->« Free Pro ») ; bug archi repare au passage — `PROMPT_LOCAL` etait local a `analyserDocumentLocal` mais reference par Mistral = ReferenceError silencieuse (tier EU casse), hisse au scope module ; (c) IMPORT AUTOMATIQUE zero-clic (batch ET fichier unique) — analyse RTX -> valider-document dans la foulee, plus de bouton « Importer les N ». **SUITE MEME SESSION** : (d) DEVISE DETERMINISTE (commit `f1e0155`) — `lib/compta/devises.js` `assurerEuro()` : le modele IDENTIFIE la devise, le CODE convertit (facture EURL DENTOXCELLENCE 140000 DZD stockee « 140000 € » -> 966 €, corrigee en base). (e) JADOMI creee comme SOCIETE (SAS, id `e1fa165e`) + TRI PAR SOCIETE auto (commit `6d11453`) — `lib/compta/route-societe.js` (routeSociete par destinataire), champ `destinataire` ajoute aux prompts, worker scan-factures route `cabinet_brain_documents.societe_id` ; JADOMI + LK Immo cibles valides. (f) SCAN AUTO SUR LA RTX LE JOUR (commit `6a91362`) — `mail-sync-daemon` : cron 6h remplace par tick opportuniste 8h-20h30 (RTX en ligne = `_rtxCabinetEnLigne`, noeud kind 'agent') + filet serveur 21h05 (sans RTX = classique) ; INTERRUPTEUR par societe (`modules 'scan_auto_off'`, endpoints `/api/compta-scan-auto`, toggle UI). (g) TOILE D'ARAIGNEE — recuperation justificatifs multi-fils (commits `a4d598c` v1, `6b9ca36` v2) : fils = nom de fichier/sujet memorise par le scan (fil d'Ariane) + numero de facture + marchand ; montant = VERIFICATEUR jamais chercheur ; fils forts SANS date + jamais noyes ; CORPS de mail -> PDF via `lib/html-to-pdf` ; regle d'or anti-pub = corroboration marchand + numero/montant exact (jamais une pub qui parle de prix). Reel : 8 justificatifs combles (Anthropic, Stayforlong, Booking x2, AliExpress x3, OVH), PDF valides, reste Uber One 5,99€. (h) GMAIL en APP-PASSWORD illimite (OAuth expirait a 7j) — insere dans comptes_email_societe (chiffre coffre), onboarding dentiste : liens directs + retrait auto des espaces du mot de passe. (i) Bouton « 👤 C'est perso » par facture (commit `c06e13c`) — `PATCH /api/compta/entries/:id/perso`, type 'personnel' ajoute a NON_CHARGE_TYPES (exclu des totaux, garde tracee). RESTE : afficher/lier le rapprochement bancaire dans la fiche facture ; dedup retroactive ; Uber One. TOUT deploye (pm2 reload), commite en LOCAL (branche feat/multi-societes, NON pushe).

**Passe precedente** : Session 17 juillet — VAGUE 2 BUSINESS + INVERSION SHADE (commit `0abf844`). Les 4 derniers modules IA en dur passent par la cascade souveraine : `routes/labo/stock.js` (4 appels), `api/multiSocietes/commerce.js` (3), `api/showroom/produits.js` (1), `routes/labo/shade.js`. Plus AUCUN provider IA codé en dur dans ces fichiers. Socle ajouté : **`sovereignJson()`** dans `lib/ia-router.js` = extraction JSON + **escalade sur confiance** (le nœud local répond d'abord, gratuit ; si le JSON est illisible ou s'auto-évalue sous le seuil, on relance sur le nœud suivant au lieu d'accepter un résultat faible) + `opts.excludeNodeIds`/`opts.numCtx` (additifs). Prouvé en réel : cas facile = france-ovh seul ; seuil non atteint = parcours France→Mistral EU→Claude US ; `sensitive` = France UNIQUEMENT (l'escalade ne peut pas faire fuir la donnée). **DÉCOUVERTE : `shade.js` n'était PAS du business** — il envoyait les PHOTOS CLINIQUES du patient à Claude US pour DEVINER la teinte (donnée de santé hors UE, rescapée de la vague 1 car rangée côté « labo »). Sans valeur clinique de surcroît : une teinte se relève au teintier/spectrophotomètre, une photo non calibrée ne tranche pas A2 vs A3 (le prompt demandait à l'IA de rattraper le « cast couleur »). **Décision fondateur : inverser comme radio-plan** → le praticien RELÈVE (obligatoire, 400 sinon), l'IA STRUCTURE son relevé en local/souverain et n'ouvre JAMAIS la photo (qui reste pièce de référence du dossier). Testé : zéro invention (zones non relevées laissées à null). Module vide (0 cas/0 photo en base) = aucune régression. 2 bugs pré-existants corrigés au passage : regex d'extraction JSON non-gourmand (`/\{[\s\S]*?\}/`) qui tronquait le JSON → 422 à tort (commerce) ; front shade affichait des champs mockés que le back n'écrit jamais (teinte_ia/confidence/zones_analysees) → branché sur les vraies données. Détail : mémoire project_cascade_souveraine_ia.
**Passe du 17 juillet (autre session, plus tôt)** : ÉCRAN « Comparateur de mes prix » LIVE dans dentiste-pro (commit `07a6d4d`, additif, testé e2e). DÉCOUVERTE : `supplier_prices.gtin` contient la référence FOURNISSEUR, pas un code-barres → 0 € d'économie tant qu'on compare par gtin ; le pont existe (`product_clusters`, 5646 clusters) → comparer par `cluster_id`. Nouvelle priorité 1 avant l'extension navigateur. Voir la section dédiée en fin de CODEX + mémoire project_comparateur_pipeline_etat.
**Passe precedente** : Session 16 juillet (soir) — CASCADE IA SOUVERAINE (RGPD) : 9 modules IA sensibles (patient/santé + secret avocat) rebranchés du cloud US vers la RTX cabinet / le serveur France (Ollama qwen3.6) — plus AUCUNE donnée de santé ni de dossier client ne part aux USA, et 0 € par appel. Ajout de `sovereignText`/`sovereignVision` dans `lib/ia-router.js` (pilotés par `lib/onprem/node-registry` : `dataClass:'sensitive'` ⇒ RTX+France uniquement). Modules souverains : certificat (ia-doc), radio-plan, chat patient, extraction fiche patient, cas-clinique paro, photos patient, secrétaire IA (était OpenAI), analyses avocat, legal-engine. CHANGEMENT DE PRINCIPE radio-plan : l'IA ne LIT plus la radiographie (jugée non concluante) — le praticien DICTE sa lecture (obligatoire), l'IA la structure/améliore + bâtit le plan (5 spécialistes + arbitre + auditeur, en local). Testé (structuration fidèle FDI, zéro hallucination). Reste : scan produit/stock (données business, 2e vague économies). Détail : mémoire project_cascade_souveraine_ia. — (matin) MODULE CERTIFICAT DESCRIPTIF : l'IA rédige (ne lit plus la radio), signature manuscrite réelle sur le PDF, « Compléter »/« Déverrouiller » un signé, radios stockées durablement (coffre + compression sharp) au lieu de /tmp, nom praticien garanti, envoi patient via lien propre jadomi.fr/d/<token> + garde-fou date de naissance (fini le lien supabase brut au porteur), profession cabinet normalisée, UX premium (modales/toasts, « Voir » avec Signer intégré), CSP frame-src blob. Fichiers : api/ia-doc/index.js, api/ia-doc/patient-download.js (nouveau), api/dentiste-pro/cabinet.js, public/admin/dentiste-pro.html, server.js.
**Passe precedente** : Session 10 juillet (2) — MODULE ÉQUIPE : JOURNÉE VIVANTE (bidirectionnelle). Recadrage fondateur : l'outil doit être INDISPENSABLE à l'assistante ET NOURRIR le cerveau ; simple/ludique/intelligent ; la féliciter ; JADOMI priorise et trouve le meilleur moment ; la pause est sacrée ; elle dicte pour ne rien oublier ; elle alimente les habitudes de CHAQUE dentiste. AVANT = écran LECTURE SEULE, « fait » déduit de l'horloge, zéro écriture retour. 4 slices livrées (feat/multi-societes, node -c + new Function() + Playwright OK, pm2 reload, backup) : **Slice 1 `7f7cfb7`** — PATCH /team/tasks/:id (valider fait/en cours/reporter/annuler/note/réattribuer ; done→completed_at ; manager=tout, membre=ses tâches) + POST /team/tasks/quick (capture perso tout membre). Colonnes RÉELLES cabinet_brain_tasks, ZÉRO migration ; status libre, placement_status contraint (a_placer|placee). **Slice 2 `8afa543`** — moteur-journee.js placement SCORÉ « meilleur moment » (urgent au plus tôt ; regroupement même métier ; appels pas avant 9h ; pause jamais un creux → pauses[]+enPause) + route remonte les tâches VRAIMENT faites (completed_at) → anneau progression{faites,total,pct} sincère. **Slice 3 `a63854e`** — POST /team/voice (audio mémoire jamais persisté → lib/equipe/transcription.js Whisper SOUVERAIN autonome zéro OpenAI, WHISPER_BASE_URL absent=503 honnête → lib/equipe/parse-taches.js modèle souverain JSON + repli heuristique qui ne perd jamais ses mots) ; /tasks/quick accepte aussi texte libre. **Slice 4 `5ba1d24`+`0275e18`** — ma-journee.html interactif : bouton Fait/pastille → PATCH → anneau réel + félicitation + confettis fin de journée ; barre capture micro(MediaRecorder→/voice)+saisie « videz votre tête, rien ne se perd » ; carte pause « C'est votre pause, profitez » ; urgence badge+tri ; 🎙️ origine vocale. Fix visibilité (paintLive ne reconstruit que si signature change, sinon lignes opacity:0). **Slices 5-7 (suite, prod, commitées)** : **Slice 5** — ajout d'habitude EN UN GESTE sous chaque plateau (« ＋ Ajouter une habitude du praticien » → POST /team/habitudes mode `ajouter` append+dédup ; /journee expose la clé categorie + praticiens_connus) = l'assistante nourrit le cerveau en travaillant (brique fondateur « tel dentiste fait ses soins avec digue »). **Slice 6** — « ce qui a bougé » : diff client prevSlots → badge « décalée (était HH:MM) » + bandeau « Journée réorganisée » quand une urgence repriorise. **Slice 7** — tâches récurrentes : modèle quotidien (status='modele', recurrence JSONB {freq:'quotidien'}) matérialisé en 1 instance/jour (materialiserRecurrences, idempotent) ; toggle « ↻ tous les jours » dans la capture ; icône ↻. ⚠️ recurrence=JSONB (filtrer freq en JS, pas .eq). Vérifié Playwright (0 erreur, boutons/toggle/form OK). RESTE module Équipe : onboarding Doctolib « à l'échelle » = décision produit (Front desk télésecrétariat vs éditeur accrédité) + formulaire self-service connector_config par société, PAS .env (nécessite feu vert fondateur + éventuel enrôlement Doctolib) ; gérer/supprimer les récurrences ; praticien réel du bloc via agenda pour cibler l'habitude. Recherche Doctolib « à l'échelle » (4 agents) : abandonner compte+.env par cabinet ; voies = Front desk télésecrétariat (whitelist IP=pas de 2FA) OU éditeur accrédité api-interf + Ségur 3 niveaux ; onboarding = formulaire + connector_config par société, jamais .env. Voir mémoires project_dash_equipe_journee, project_hub_agenda_apis, feedback_produit_pas_hack_mono_cabinet.
**Derniere passe (10 juil 1)** : Session 10 juillet — MODULE ÉQUIPE / CONNEXION DOCTOLIB AUTONOME (reprise avant activation live). Vérifié toute la chaîne endpoints→session persistante→pont `dentiste_pro_agenda` = cohérente et prête (GET /doctolib/status répond 401, gardé). Constat .env : `DOCTOLIB_EMAIL/PASSWORD/PIN` = compte PERSO du fondateur, utilisés SEULEMENT par des scripts manuels `scripts/*.js` (jamais le serveur en marche) ; `DOCTOLIB_INBOX_EMAIL/_PASSWORD` = ABSENTES (à ajouter par le fondateur). **CORRIGÉ un footgun** (commit `5aae978`) : le fallback mot de passe de `POST /doctolib/login` (`api/dentiste-pro/team.js`) lisait `process.env.DOCTOLIB_PASSWORD` (compte perso) → se loguer avec l'e-mail JADOMI + le mdp perso = échec silencieux ; remplacé par variable DÉDIÉE `DOCTOLIB_JADOMI_PASSWORD`. Donc NE PAS écraser DOCTOLIB_PASSWORD : ajouter seulement `DOCTOLIB_INBOX_EMAIL`+`DOCTOLIB_INBOX_PASSWORD` ; le mdp du compte JADOMI se saisit UNE FOIS dans l'UI (`public/equipe/connexion-doctolib.html`). **AJOUTÉ des captures de diagnostic** (commit `2c53fb1`) : `snap()` dans `lib/connector/doctolib-session.js` écrit screenshot+URL+DOM(inputs/boutons) dans `uploads/doctolib-sessions/debug/` (gitignoré) aux points ambigus (2FA détectée, login/code refusé, agenda vide) → ajuster les vrais sélecteurs 2FA en regardant la vraie page dès la 1re activation LIVE. Tests purs (loggedInUrl/parseName/dateRange) OK, node -c + pm2 reload OK. RESTE = actions fondateur : créer le compte JADOMI délégué dans Doctolib (Paramètres>Comptes, Administrateur), ajouter les 2 vars .env, puis /equipe/connexion-doctolib (Vérifier→saisir mdp→Activer→coller le code 2FA)→Synchroniser ; ENSUITE seulement sync récurrente + test redistribution absence (ne pas construire la récurrence avant validation live des sélecteurs = spéculatif).
**Derniere passe (prec. 5-6 juil)** : Session 5-6 juillet — AUDIT SÉCURITÉ PLATEFORME (multi-tenant/IDOR + souveraineté). Branche `feat/multi-societes`. Découverte de fondation : TOUTES les routes tournent en `admin()` service_role (RLS bypassée) → cloisonnement = filtre applicatif `.eq('societe_id'/'cabinet_id')` SEUL ; un filtre oublié = IDOR inter-cabinets. **VOLET A — CARE (données santé) : BOUCLÉ sur les critiques**, 2 commits. **Commit `70d8478`** (14 fichiers) = 17 correctifs IDOR/auth Care + 4 fuites audio : patient-app /confirm-visit (IDOR write) ; photo-ai ×3 (AUTH CASSÉE Bearer jamais vérifié + IDOR + SSRF → `identifyAuth()` réel + scope cabinet/patient + garde SSRF ; NB `dentiste_pro_photos` n'a PAS de colonne patient_id → scope patient via sender_id OU metadata->>patient_id) ; cas-clinique /create (scope societe_id) ; questionnaire /check-expiry (fail-closed) ; chat /read (scope patient) ; triangle /cases/:id joins + PUT validation + /my-photos + /photos/read (resolveActorCabinet tri-acteur) ; **appointments /admin/* = 1 middleware unique validant site_id ∈ societe (ferme 11 routes d'un coup)** ; batch-slots GET /series* + reschedule + delete (scope cabinet appelant) ; agenda 6 routes praticien (requireCabinet, fin du faux cabinet 'default'/'Mode Test') + /checkin durci (cabinet validé + réponse générique anti-énumération + rate-limit + fix frontend tab-agenda.js showQRCodeModal→GET /qrcode car le kiosque codait ?cabinet=default en dur) + seed-chaos verrouillé + /qrcode. **Commit `2556326`** = rate-limit OTP verify (2 couches : IP dédié 10/15min + compteur otp_attempts, invalidation après 5 échecs). Care coche bloquants lançables #1(routes sans auth) #2(IDOR santé) #3(OTP) #4(audio hors-UE). SOUVERAINETÉ : 4 fuites AUDIO coupées d'OpenAI/USA vers Whisper self-hosted (env `WHISPER_BASE_URL`, absent=503, aucun envoi hors UE) : chat-patient-ia, avocat/enquete-transcription (AUDITION harcèlement, secret pro), ia-doc /transcribe, lib/agenda-ia. Déploiement Speaches (Docker 127.0.0.1:8971, pas de GPU sur srv 217) = APRÈS Care. **VOLET B — CARTOGRAPHIE (photo, NON corrigé)** : 🔴 FaceMatch (repo séparé /home/ubuntu/facematch-api) = CATASTROPHIQUE, aucune fondation d'auth, biométrie art.9 servie sans auth + path traversal + zip-slip + IDOR tenant total + secrets réels en clair sur disque + serveurs exposés Internet (217.182.132.136/141.94.10.182) → RÉSOLU (nuit 6 juil) : silo SQLite autonome facmatch.db, PAS connecté à la base patients JADOMI (aucune clé Supabase dans .env, aucune requête patients_jadomi) → vrais patients JADOMI JAMAIS exposés, seulement données de test FaceMatch. Exposition publique COUPÉE (pm2 stop facematch-api port 8000 + kill uvicorn port 8001, rien n'écoute, jadomi intact). RESTE demain : désactiver vhost nginx facematch.bak (sudo, 502 en attendant) + réécrire couche d'auth avant tout vrai scan ; 🔴 `/uploads` = express.static PUBLIC sur tout l'arbre (photos patients Care + audio auditions) = fondation transverse, patron cible = avocat/coffre.js (AES-GCM + serve authentifié) ; 🔴 rush-fichiers download/stream/:id non auth ; 🔴 moat comparateur (`/api/comparateur/search|stats|semantic` ANONYMES → scraped_prices ~219K exfiltrable + import-prices écriture anonyme) — mais prix négociés supplier_prices bien cloisonnés ; 🔴 multiSocietes/communication.js (JWT sans requireSociete → societe_id du header client → PII patients inter-cabinets) ; 🟠 studio/flyer-builder /projects/* IDOR non auth + generate-premium-ad débit wallet non auth ; ✅ SAINS : labo, multiSocietes core (PAS d'élévation de privilège), brain/mail (**BUG 15 RÉSOLU** : mdp IMAP chiffré AES-256-GCM au repos, jamais loggé, jamais renvoyé par l'API), studio core. Ordre correction post-Care proposé (rien lancé, à figer) : /uploads (retro-affecte Care) → communication.js → moat → flyer-builder → FaceMatch (réécriture). Feuille de route Ollama TEXTE (bloquant lancement Care) : #1 copilot=**DeepSeek CHINE** (anonymisation ILLUSOIRE : masque emails/tel + ~15 mots-clés figés mais PAS les noms ni le contenu clinique libre ; contredit règle documentée anti-DeepSeek) ; #2 ia-doc génération doc ; #3 ia-secretary. Marketing (pub/logo) = 🟢 laissé. Git : working tree a du BRUIT préexistant (prothesistes.js INTOUCHABLE, XML gudid) → toujours `git add` CIBLÉ.
**Derniere passe (prec.)** : Session 5 juillet — AUDIT FABLE 5 JURISPRUDENCE AVOCAT (dashboard-v2, section « Jurisprudence de la semaine » alimentée par Judilibre). 6 bugs signalés, chacun VÉRIFIÉ contre le code ET les données Judilibre live AVANT correction. 5 corrigés + déployés (branche `feat/multi-societes`, pm2 reload zero-downtime, cache `avocat_home_cache` purgé + régénéré, bruit résiduel=0 sur 5 arrêts, arrêt de référence 25-15.732 INTACT). (1) Fuite métadonnées brutes : `lib/legal-providers/jurisprudence-analyzer.js` injectait le `titrage` (libellés de matière EN CAPITALES ex. « STATUT COLLECTIF DU TRAVAIL ») dans resume_faits/points_cles même quand un sommaire existe, + le front affichait `d.solution` brut via `text-transform:capitalize` (« qpcother »→« Qpcother »). FIX : helpers `solutionLabel()` (map code→libellé, inconnu=null=badge masqué), `isMatterLabel()`/`usablePoints()` (rejettent tout texte sans minuscule), `matiereLabel()` (table accentuée fermée) ; CAS 1 synthétise faits/points DEPUIS LE SOMMAIRE officiel (accentué), fallbacks n'injectent plus jamais `titrage` (points_cles=[]) ; nouveaux champs `solution_label`+`matiere` ; front = badge lisible + chip matière discret. (2) Troncature fondement : `.slice(0,220)` coupait « du 21 dec|embre 1950 » → troncature au dernier mot avant 300 + « … » + texte complet en `title`. (4) Tendances 0% partout : `api/avocat/home-juridique.js` `/tendances-public` codait `evolution_percent:0` en dur, `/tendances` authed mettait 100% quand N-1 vide → les deux passent à `null` (front masque la cellule, jamais de faux %). (5) 2 boutons alerte simultanés (HTML statique) → conteneur `#abo-cta` re-rendu par `renderAboCta()` = 1 seul CTA + fréquence si abonné. (6) « Bonjour Maître » figé → `personalizeWelcome()` lit `/api/juridique/profil` (nom), « Maître » neutre. AUCUNE migration Supabase. Backups `.bak-fable5-20260705`. **BUG 3 (accents) : diagnostic Fable INVALIDÉ empiriquement** — Judilibre sert les champs `visa` (fondement) ET `titrage` (matière) SANS accents à la source (24-19.702 : sommaire « déplacement/attaché/décembre » accentué mais visa « deplacement/attache/decembre » nu) ; AUCUN `normalize('NFD')` chez nous. Contenu principal désormais accentué via le sommaire ; matières ré-accentuées par table fermée ; décision fondateur = fondement/visa laissé VERBATIM (ré-accentuation auto risquée : « attache » ambigu). 3 fichiers : jurisprudence-analyzer.js, home-juridique.js, dashboard-v2.html.
**Derniere passe (5)** : Session 4 juillet (5) — CERTIFICAT MÉDICAL : REFONTE UX COMPLÈTE (retour fondateur en direct). Contexte : reprise sur le module certificat descriptif après coupure. Corrections livrées + reload PM2 (branche `feat/multi-societes`, api/ia-doc/index.js + public/admin/dentiste-pro.html) : (1) BUG RACINE « mes coordonnées ne s'enregistrent pas » = `PUT /api/dentiste-pro/cabinet` renvoyait 404 « Aucun cabinet configuré » (la société n'a PAS de fiche `dentiste_pro_cabinets`) → le front affichait le faux « Configuration sauvegardée localement (API non connectée) » = perdu. FIX `saveCabinetConfig()` : PUT puis POST /cabinet en fallback (crée la fiche si absente) + affiche la VRAIE erreur. `loadCabinetConfig()` : si pas de cabinet → EFFACE les valeurs de démo (Saint-Michel / 12 rue de la Santé) pour qu'elles ne polluent plus les certificats. (2) INFOS PRATICIEN : champs « Nom du praticien signataire » + « RPPS/ADELI » ajoutés dans Configuration (stockés dans `dentiste_pro_cabinets.config` JSONB), chargés/sauvés, envoyés à la génération (avant : adresse/rpps/tel codés VIDES). En-tête + « Je soussigné, Dr… » + signature reprennent le praticien. (3) « Voir » ouvrait un `alert()` texte → ouvre le VRAI PDF archivé (`GET /documents/:id/pdf`, repli texte). (4) DESIGN PDF premium : en-tête cabinet/praticien + filet vert, titres de sections colorés, PHOTOS EN ANNEXE ENCADRÉES (fit sans déformation + légende + analyse), pied légal + bloc signature. (5) ANTI-MARKDOWN : l'IA sortait du markdown (`**`, `|`, tableaux, `---`) affiché brut + doublons (titre/cabinet/formule répétés). FIX prompt = TEXTE BRUT only, titres MAJUSCULES, PAS d'en-tête/titre/formule (ajoutés autour), suppression de la phrase « le soussigné ne certifie pas la réalité des faits » (conditionnel suffit) ; ET renderer PDF durci (strip `*`/`**`/`#`, saut des séparateurs, tables `| a | b |`→`a : b`). (6) SUPPRIMER : `DELETE /documents/:id` (scopé société + efface le PDF du bucket) + bouton avec confirmation renforcée si signé. (7) MODIFIER (sans tout refaire) : snapshot des saisies dans `metadata.input` à la génération ; `editDocument()` repeuple le formulaire ; génération en mode UPDATE via `document_id` (pas de doublon ; signé = immuable → 403). Anciens documents sans snapshot → ÉDITEUR DE TEXTE direct (overlay) qui régénère le PDF via `raw_text` (nouveau param : texte utilisé tel quel, sans IA). (8) Garde-fou timeout 120s conservé. node -c + new Function() sur JS inline OK, test PDF pdfkit + test regex anti-markdown OK. RESTE (à reprendre) : le fondateur doit SAISIR ses vraies infos dans Configuration (nom cabinet, Dr Bahmed Karim, adresse Roubaix, RPPS, tél) puis Enregistrer — vérifier que ça persiste (création fiche cabinet) ; régénérer un certificat PROPRE avec radio jointe (annexe visible) ; l'éditeur raw_text ne réembarque pas les photos des anciens docs ; envisager en-tête auto depuis profil société. AUCUN email métier envoyé sans validation.
**Derniere passe (4)** : Session 4 juillet (4) — REPRISE APRES COUPURE PC (rebuild exe cabinet). (1) FIX TIMEOUT CERTIFICAT : la route longue `/api/ia-doc/generate-certificat` (redaction Claude 4096t + PDF + photos + archivage HDS) depassait le timeout global 30s de server.js -> garde-fou propre 120s (`req/res.setTimeout(120000)`), la route est deja dans `longRoutes`. Teste e2e (token admin magic-link + societe Precision Dentaire) : **200 + vrai PDF en 11s**, doc draft de test nettoye (DB + bucket HDS). Commit jadomi `e71ad66`. AUCUN email envoye (cette route n'en envoie pas). (2) EXE CABINET FaceMatch REBUILD : fix resilience du moteur HD dans `facematch-api modules/webscan` -> COLMAP `_colmap_loads()` ne retient l'exe que s'il DEMARRE vraiment (detecte DLL manquante / quarantaine antivirus via STATUS_DLL_NOT_FOUND), `ensure_engines` re-telecharge 1x sinon degrade proprement vers pycolmap embarque, `reconstruct()` repli SILENCIEUX pycolmap si le pipeline HD lache, Windows `SetErrorMode`+`CREATE_NO_WINDOW` = ZERO pop-up « colmap.exe erreur systeme » chez le dentiste. Commit `faa7f95` pousse sur `main` (repo karimstock/facematch-cabinet) -> CI `build-cabinet.yml` rebuild `FaceMatch 3D.exe` + installeur (release cabinet-latest). (3) JUMEAU NUMERIQUE 3D publie (viewer patient permanent + `/api/facematch/publish` dans longRoutes) commit `29f818e`. (4) facematch-agent : viewer 3D 100% HORS-LIGNE (Three.js/OrbitControls/PLYLoader vendorises dans `vendor/` + route statique `/vendor` + bundle exe via `--add-data`) commit `bee74d5` pousse, CI rebuild. RESTE : verifier les 2 builds CI (facematch-cabinet + facematch-agent) au vert et republier les exe ; `facematch-api modules/webscan` reste = prov/reconstruct commites. Branche jadomi `feat/multi-societes`.
**Derniere passe (3)** : Session 4 juillet (3) — CERTIFICAT Phase 2 (persistance + signature immuable) + BUG MAJEUR CORRIGÉ. Le save DB des certificats ne fonctionnait JAMAIS (insert utilisait `patient_name` inexistante, et `type=certificat_initial`/`status=brouillon`/`content_html` NULL violaient les contraintes CHECK+NOT NULL) → chaque certificat était silencieusement perdu. Corrigé : insert sur vraies colonnes (`type='certificat'`, `status='draft'`, `content_html` généré, `metadata.doc_kind` garde la sémantique réelle, nom patient dans metadata). Nouveaux endpoints `/api/ia-doc/documents` (GET liste scopée société), `/documents/:id` (GET détail), `/documents/:id/sign` (POST signature IMMUABLE : draft→signed, garde-fou `.neq('status','signed')` anti-double-signature, `validated_at`+`validated_by`). Front `dentiste-pro.html` : « Mes documents » branché sur la base (loadDocuments fetch DB, lazy-render à l'ouverture onglet), bouton « Valider et signer » (confirm → immuable), documents signés = lecture seule (badge Verrouillé, plus de bouton Valider), viewDocument fetch détail. Preuve E2E service-role OK (insert draft, sign→signed, double-sign bloqué). Contraintes DB `ia_doc_documents` : type∈{certificat,ordonnance,devis}, status∈{draft,signed,validated,sent}. Sélecteur patients-reels AJOUTÉ (recherche /api/dentiste-pro/patients-reels/search, index-based, renseigne patient_id ; FK vérifiée OK vers patients_jadomi ; selectCertPatient affiche TOUTES les infos : naissance/sexe/tél/email/dernière consultation). STOCKAGE HDS + ENVOI PATIENT AJOUTÉS : bucket privé `ia-doc-pdf` (créé), le PDF est archivé à la génération (metadata.pdf_path), endpoints `GET /documents/:id/pdf` (re-téléchargement) et `POST /documents/:id/send-email` (documents SIGNÉS uniquement → lien de téléchargement signé 7j envoyé au patient via emailService, journalisé dans metadata.sent_history). Front : bouton « Envoyer au patient » sur les documents signés (prompt email, défaut = email du patient lié). Round-trip storage prouvé. RESTE Phase 2 : journal de versions complet. PRINCIPE FONDATEUR (4 juil) : « pour tous les passeports c'est idem » = même patrimoine (patients réels + auto-remplissage + envoi email). Passeport patient (tab-jadomi-ia.js) : déjà conforme (patients-reels + email prérempli + POST /send-passeport fonctionnel). COEFFICIENT MASTICATOIRE = CERTIFICAT AUTONOME (décision fondateur : « à part »). Découplé (bouton « Insérer dans un certificat » + masticationToCertificat SUPPRIMÉS, libellé corrigé), relié aux vrais patients (searchMasticPatient), et la route /coefficient-masticatoire-pdf le PERSISTE comme document (metadata.doc_kind='coefficient_masticatoire', archivé HDS) → hérite des endpoints génériques Mes documents/signature/envoi. Full standard atteint.
**Derniere passe (2)** : Session 4 juillet (2) — CERTIFICAT MÉDICAL DESCRIPTIF (Phase 1) + 2 bugs labo. (1) Règle ZÉRO-INVENTION durcie dans le backend `/api/ia-doc/generate-certificat` : l'IA met en forme UNIQUEMENT la saisie du praticien, faits au conditionnel+guillemets, champ vide = absent (pas de placeholder), ITT jamais suggérée, section « Diagnostic » déductive supprimée. (2) Parcours certificat initial structuré (`dentiste-pro.html`) : examen exo-buccal + endo-buccal avec ODONTOGRAMME FDI réutilisable (`JADOMI_ODONTOGRAM`, dents concernées), retentissement DESCRIPTIF (sans coefficient masticatoire — celui-ci est réservé à l'AUTRE certificat, complémentaire/consolidation, décision fondateur), ITT optionnelle, réserves, bandeau « généré par IA — à valider », dictée générique `dicterInto(fieldId)` sur chaque étape, formulaire visible dès l'ouverture (photos optionnelles). (3) Bugs : `/labo/chat` envoie X-Societe-Id (fini la boucle), `/labo/planning` supprime le fallback `getDemoTechs()` (faux techniciens → état vide). RESTE certificat : Phase 2 (validation/immuabilité/HDS/versions), Phase 3 (chaîne complémentaire + coefficient masticatoire ICI), Phase 4 (notes internes + rappels suivi), PDF annexes légendées, sélecteur patients-reels, en-tête auto depuis profil société. Branche `feat/multi-societes`, node -c + pm2 reload OK.
**Derniere passe (1)** : Session 4 juillet — CONSOLIDATION AUDITS FABLE 5 (R1→R8) + PHASE 9 (débranchage dentiste-pro). (1) CACHE = cause racine des « fixes invisibles » : `server.js` mettait no-cache seulement sur `.html`, pas les `.js` externes (tab-agenda.js caché 24h) → ajout no-cache pour `.js`/`.css`. (2) Comparateur : le vrai crash était `cmpSearch` INLINE dans `index.html` (pas `comparateur.html`) — gardes `hasPrice` sur tous les `.toFixed` → « Prix indisponible ». (3) Éjection labo : `production/chat/remakes/garanties/planning.html` lisaient de mauvaises clés localStorage (`sb-access-token`, `labo_session`…) → `resolveLaboToken()` scanne la vraie clé Supabase `sb-<ref>-auth-token`. Les routes labo n'étaient PAS 404 (401/Profil requis). (4) dentiste-pro : 403 `my-permissions` = rôle réel `proprietaire` non reconnu (corrigé 3 endroits : shared.js, team.js:84 et :575) ; dédup appels today/stats/pipeline via `dashGet` (cache 5s) ; blocs accueil branchés sur `/dashboard/today`. (5) compta : badge « À vérifier » >10k, regex homoglyphes durcie (attrape Tᥱmᥙ/Sephorɑ), toggle 0€, accents (« Validées », mois), Analytics via fallback société localStorage. (6) stock : statut périmé prime sur le niveau (plus de « Optimal »+« EXPIRÉ »). (7) PHASE 9 : TOUS les onglets dentiste-pro débranchés des mocks — Rappels→`/dashboard/rappels-today`, Chat→`/chat/conversations`, Agenda/Pipeline/Patients/Waitlist/Stats en états vides honnêtes. ZÉRO faux patient dans la source. Branche `feat/multi-societes`, backups + node -c + pm2 reload OK. RESTE : chargement messages chat, TVA extraction (pipeline IA), mail statut Yahoo menteur, dédup rétroactive compta (dry-run), pipeline accents, ticker LEFEVRE (vraie donnée), profil labo à configurer par le fondateur.
**Proprietaire** : Dr Karim Bahmed (dentiste Roubaix + fondateur JADOMI)

**⚠️ PATTERN PERMANENT — /uploads est GATÉ (URL signée) depuis le 6 juil.** `server.js` ne sert plus `/uploads` en `express.static` ouvert : un gate sépare les dossiers PUBLICS (whitelist marketing : studio-photos, studio-videos, flyers, flyer-builder, staging, ads, imported + 1er segment = UUID société pour les sites vitrines) des dossiers SENSIBLES (tout le reste = **deny-by-default**, exige une URL signée). Helper unique `lib/uploads-signing.js` : `signUploadUrl(path,{ttlSec\|long})`, `signIfUpload(url)` (relatif OU absolu), `signJsonMiddleware(keys)` (signe auto les clefs d'URL d'un routeur), `verifyUploadRequest()`. Clé HMAC dérivée de `JWT_SECRET`, fail-closed. **RÈGLE POUR TOUTE FUTURE SESSION : si tu ajoutes un module qui écrit dans `/uploads/<sensible>/` et renvoie l'URL au frontend (`<img>`/`<audio>`), tu DOIS signer l'URL À LA SORTIE (stocke le chemin BRUT en DB, signe à la lecture) via `signIfUpload()` ou monte `signJsonMiddleware()` sur le routeur — sinon 403 direct.** TTL `{long:true}` pour les liens permanents (passeport blanchiment). Filet : les 403 sont journalisés dans `logs/uploads-gate-denied.log` (path + referer). Déjà câblés : chat-patient-ia (patient-docs), cas-clinique (+passeport long), snap (long), facematch (long), triangle+cases+reseau (middleware routeur), patients-reels. Vérifiés NON concernés (servis par endpoint authentifié ou fichier détruit après usage, jamais en `/uploads` statique) : copilot (analyse serveur only), enquetes-audio (audio supprimé après transcription Whisper), releves/releves-analyses/releves-pdf (JSON/PDF lus côté serveur), ordonnances (`docs/uploads` = mount distinct hors gate), mail-replies (JSON serveur), coffre (endpoint déchiffré authentifié). Différés par décision d'archi — VÉRIFIÉS sûrs : **rush/stl** — le vrai flux labo passe par R2 (upload `/api/rush/fichiers/upload` chiffré) + download `GET /api/rush/fichiers/download|stream/:id` (URL présignée R2 48h ou `res.download` auth), **hors gate**. Les seuls émetteurs `/uploads/stl/` sont des réponses d'upload legacy (`api/rush.js POST /upload-stl` + `api/routes/commandes.js` intouchable) dont le path n'est pas re-rendu (prothesiste.html ignore la réponse). **0 hit nginx sur `/uploads/stl` depuis >2 semaines** → rien à câbler, différer sûr. **imported** — endpoint `POST /api/media/upload` (monté `/api/media`) appelé UNIQUEMENT depuis `public/vitrines/` (upload-media + export-wizard) = contexte studio/vitrine, MIME image/vidéo only, stockage R2 (servi par Cloudflare) ; local `/uploads/imported/` = fallback dormant (dir inexistant). Reste PUBLIC (média vitrine affiché sur sites anonymes — le signer casserait les vitrines). Durci le 6 juil : `POST /api/media/upload` valide désormais `societe_id` (contre `user_societe_roles`, 403 si non possédé, absent=null non attribué pour préserver export-wizard) ET `analysis_id` (contre `site_analyses.societe_id` possédée, 403 si étrangère, 404 si inexistante) — même classe d'IDOR que bug 16, source de vérité réutilisée (`api/multiSocietes/middleware.admin`). 7 branches vérifiées contre données prod (studio 200, société/analysis étrangère 403, inexistante 404, passthroughs 200). N'impacte pas l'affichage public (endpoint upload-only). `imported` reste PUBLIC. À NE PAS faire : whitelister un dossier contenant de la PII pour « régler » un 403.

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

## Session 25 juillet 2026 (suite) — Compta : le rapprochement devient un MOTEUR a plusieurs yeux, et il se souvient
Branche `feat/multi-societes`, commit `2eb5991`. Suite directe de la session ci-dessous : la regle de rapprochement etait enfouie dans `server.js` et tenait en une ligne (montant a 2 % pres + un mot du fournisseur dans le libelle), dupliquee entre le rapprochement automatique et le calcul de certitude.
- **Nouveau `lib/compta/rapprochement.js`** (SOURCE UNIQUE, 100 % deterministe, zero appel IA) : plusieurs regards INDEPENDANTS sur une meme paire prelevement <-> facture, chacun rendant une preuve ou rien — **le montant** (au centime, porte d'entree non negociable), **le nom** (mot entier de preference : « edf » ne matche pas « medfinance »), **la memoire** des libelles deja rattaches, **la reference** de facture presente dans le libelle, **la chronologie** (une facture posterieure au debit = alerte), **la devise d'origine** (« PAIEMENT CB 1024 CNY » face au `montant_original`), **le mode de paiement** (especes contre prelevement = alerte).
- **Le vert se merite** : `sur` (vert) exige le montant au centime + au moins une preuve FORTE + aucune alerte + AUCUNE AMBIGUITE (une seule facture peut pretendre a la ligne). Tout le reste est rattachable mais reste orange « a verifier ». Mieux vaut un trou qu'une erreur.
- **LA MEMOIRE (regle fondateur « ce qui est reconnu une fois se rejoue tout seul »)** : chaque lien pose ou confirme par le praticien enseigne « ce libelle bancaire = ce fournisseur ». La signature d'un libelle ignore dates, montants et numeros qui changent chaque mois ; **quand la banque ne nomme personne (« PRLV SEPA 4578 »), on retient le numero de mandat**, stable d'un mois sur l'autre — c'est exactement le cas ou le praticien avait besoin qu'on se souvienne. Stockee en LOCAL a cote des releves (`_alias-rapprochement.json`), elle ne quitte jamais le serveur France.
- **Un rapprochement deja pose n'est JAMAIS defait** : le moteur plus strict ne s'applique qu'aux lignes orphelines.
- **BUG attrape et corrige** : le fichier de memoire vit dans le dossier des releves, ou **tout `*.json` etait lu comme un MOIS** — il serait apparu comme un MOIS FANTOME dans l'onglet Releve (cf l'incident du faux « fevrier »). `_comptaEstFichierReleve` ecarte les fichiers de travail prefixes `_` aux **6 endroits** qui listent ce dossier.
- **Tests** : `node scripts/_test_moteur_rapprochement.js` = **27/27** (unitaire, donnees inventees) ; `node scripts/_e2e_rapprochement.js` = **43/43** sur les vraies routes (5 checks ajoutes : memoire ecrite, apprise au bon fournisseur, rejouee le mois suivant, et pas de mois fantome ; releves restaures a l'identique, empreinte SHA-256 verifiee). `node -c` + `pm2 reload` OK.
- **Mesure a blanc** (`scripts/_mesure_moteur_rapprochement.js`, n'imprime que des compteurs) : 384 debits, 45 deja rapproches, 339 orphelins -> **54 ont une facture au centime**, dont **1 seul** que le moteur accepte de trancher seul (preuve forte + sans ambiguite) et **53 rendus au praticien en orange, dont 36 ambigus** (plusieurs factures du meme montant). Le moteur ne rattache pas plus qu'avant : il rattache MIEUX, et dit pourquoi.
- **LA FILE DE VALIDATION (commit `8ab49b5`)** : `GET /api/compta-rapprochement/pistes` rend EN UN APPEL tous les prelevements sans facture avec les factures qui peuvent les justifier (jusqu'a 3 possibilites par ligne, classees, avec leurs raisons). Une facture n'est jamais proposee sur deux lignes a la fois. Bouton « 🕸 Pistes de rapprochement » dans l'onglet Releve : le praticien valide a la chaine au lieu de chasser ligne par ligne (chaque validation passe par `lier`, donc apprend un alias et marque orange si ce n'est pas certain). Mesure reelle : **30 pistes presentees, 439 ms, zero facture proposee deux fois** ; 53 lignes ont une facture au centime, l'ecart venant des lignes deja justifiees autrement et de la regle « une facture = une ligne ».

## Session 25 juillet 2026 — Compta : le rapprochement bancaire visible (et corrigeable) DEPUIS la facture
Branche `feat/multi-societes`. Demande fondateur : « dans la fiche d'une facture, je veux voir a quel prelevement elle est rapprochee, et pouvoir la relier a une autre ligne si le rapprochement s'est trompe ».
- **Fichiers** : `server.js` (4 routes + `_comptaRematch` durci + fusion `analyser-releve`), `index.html` (bloc fiche facture + selecteur de ligne), `scripts/_e2e_rapprochement.js` (nouveau test souverain).
- **Lecture a l'envers** : `GET /api/compta-rapprochement/:docId` retrouve la ligne de releve qui porte la facture (le lien est stocke dans le releve, pas dans la facture). Affiche « Rapprochee au prelevement du JJ/MM/AAAA — LIBELLE X € », le mois du releve et si le rapprochement est automatique ou fait a la main.
- **Correction manuelle** : `GET .../candidats` (debits classes montant exact d'abord, puis ecart et proximite de date ; recherche libre `q` pour les libelles qui ne nomment pas le marchand type « PRLV PAYPAL » ; ligne actuelle et lignes deja occupees signalees), `POST .../lier`, `POST .../delier`.
- **Integrite compta** : une facture ne justifie QU'UNE ligne (pre-passe des factures deja accrochees dans `_comptaRematch`, tous mois confondus) ; un lien manuel n'est jamais ecrase par l'automatique ; une facture deliee a la main est refusee durablement sur cette ligne (`rapprochement_refuse`), y compris apres re-analyse du mois.
- **Les 2 tables** gerees : `documents_compta` (`dc:<id>`, user-scoped) et `cabinet_brain_documents` (societe-scoped, acces verifie) ; pas de bouton PDF mort pour les ecritures sans fichier.
- **SENS INVERSE — PROPOSITIONS (meme session, commit `837f321`)** : `GET /api/compta-rapprochement/suggestions?periode=&idx=` propose, pour un prelevement orphelin, les factures qui peuvent coincider. **REGLE FONDATEUR : montant AU CENTIME PRES, sinon on ne propose pas** (« un a peu pres en compta, c'est une erreur qui attend son heure » ; le cas mensualite EDF reste couvert par la recherche guidee 🔎). Les DEUX tables sont fouillees — `cabinet_brain_documents` (les 213 factures du scan mail) etait totalement invisible au rapprochement jusqu'ici. Factures deja accrochees ailleurs exclues. Chaque proposition porte ses RAISONS (montant identique au centime / nom present dans le libelle / ecart en jours).
- **ETAT « A VERIFIER » (couleur differente, demande fondateur)** : la certitude est CALCULEE — `sure` = montant au centime ET fournisseur nomme dans le libelle (vert) ; tout le reste = rattache mais `rapprochement_a_verifier` (orange), jamais fondu dans le vert. `POST /api/compta-rapprochement/confirmer` = « j'ai verifie, c'est elle » -> vert. UI : section « Rapprochements a verifier » dans le releve, badge orange dans les listes de transactions, bloc orange + bouton de confirmation dans la fiche facture.
- **PIEGE EXPRESS attrape par le test** : `/api/compta-rapprochement/suggestions` etait avalee par `/:docId` (declaree avant) et repondait 200 « aucun lien » au lieu de proposer. Les routes litterales doivent etre declarees AVANT les routes a parametre.
- **Mesure reelle** : 384 debits, 314 orphelins ; 54 orphelins ont une facture au centime pres (26 sans ambiguite, 28 avec plusieurs candidates), dont 5 grace aux factures du scan mail.
- **Tests** : `node scripts/_e2e_rapprochement.js` = 38/38 OK sur les vrais releves (snapshot + restauration verifiee par empreinte), 10/10 OK sur une facture auto-scannee, 401 sans token, 403/404 sur une autre societe. node -c + new Function() + pm2 reload OK.

## Session 16 juillet 2026 (soir) — CASCADE IA SOUVERAINE : fin des fuites de données de santé vers les USA
Branche `feat/multi-societes`. Retour fondateur : « waw c'est grave, RGPD bafoué, j'ai une RTX, ça doit être fonctionnel, on a tout fabriqué ». Constat : les modules IA construits AVANT l'orchestrateur on-premise appelaient le cloud US en direct (Anthropic/OpenAI) — donnée patient et secret avocat partaient aux USA. Ce n'est pas N bugs, c'est **1 décision d'archi** : tout ce qui est sensible passe par la cascade souveraine.

**Ajout `lib/ia-router.js`** : `sovereignText(system, user, {dataClass,maxTokens})` et `sovereignVision(system, user, images[], {dataClass})` — cascade pilotée par `lib/onprem/node-registry.pickChain`. `dataClass:'sensitive'` ⇒ SEULS les nœuds souverains (RTX cabinet tier 0 + serveur France OVH tier 1, Ollama `qwen3.6:35b-a3b`) sont éligibles ; Mistral/Claude/DeepSeek refusent le 'sensitive' (config `onprem-nodes.json`). Retour `{text,nodeId,sovereign,tier}` ; erreur claire si tout le souverain est down (jamais de fuite silencieuse). « Souverain » = la donnée reste en France ; le serveur France couvre TOUT LE MONDE (avocat sans RTX, dentiste sur PC portable), la RTX est un bonus tier 0.

**9 modules rebranchés + testés live** (pm2 reload, node -c) : `api/ia-doc` (certificat, callClaude→sovereignText), `api/dentiste-pro/chat-ia`, `.../patients` (vision), `api/cas-clinique` (paro+reco), `api/ia-secretary` (adaptateur `sovereignChat` remplace OpenAI/gpt-4o-mini), `api/avocat/analyses` (helper callClaude), `api/avocat/legal-engine`, `api/dentiste-pro/photo-ai` (vision, URL→base64), `api/radio-plan`. Déjà souverain avant : `lib/compta/analyse-document`.

**CHANGEMENT DE PRINCIPE radio-plan (décision fondateur)** : l'IA ne LIT PLUS la radiographie (« on n'est pas fort dessus, pas concluant ; le but c'est d'aider à établir le plan, pas d'analyser »). Nouveau `SYS_STRUCTURER` : le praticien DICTE sa lecture (`observations_vocales` désormais OBLIGATOIRE → 400 si absente), l'IA la structure/améliore sans rien inventer, puis les 5 spécialistes + arbitre + auditeur bâtissent le plan — tout en local, texte uniquement (image plus envoyée à l'IA, imageBlock→null ; image conservée pour affichage/dossier). Les 3 endpoints (/analyze,/refine,/compte-rendu) ne streament plus token-par-token (bufferisé puis envoyé). Coût IA local = 0. Testé : lecture dictée « 26 carie mésiale, 36 dévitalisée reprise distale, 46 absente, perte osseuse modérée » → structurée fidèlement, FDI correct, zéro invention.

**Perf honnête** : texte ~15-20 s/étape ; plan complet quelques minutes sur serveur France (CPU), rapide sur RTX. **RESTE** : scan produit/stock (`routes/labo/stock.js`, `api/showroom/produits.js`, `routes/labo/shade.js`, `api/multiSocietes/commerce.js`) = données business (économies, pas RGPD) → 2e vague ; `avocat/enquete-interne`+`moteur-strategique` déjà Mistral EU (pas USA). Cloud légitime (contenu public) : `vitrines/*`, `studio/*`, `ai-studio/*` → ne pas toucher. Mémoire : `project_cascade_souveraine_ia`.

## Session 16 juillet 2026 — MODULE CERTIFICAT DESCRIPTIF : l'IA rédige (ne lit plus), signature réelle, radios durables, envoi patient sécurisé
Branche `feat/multi-societes`. Retour terrain fondateur (dentiste, en consultation). Fichiers : `api/ia-doc/index.js`, `api/ia-doc/patient-download.js` (nouveau), `api/dentiste-pro/cabinet.js`, `public/admin/dentiste-pro.html`, `server.js`. `node -c` + `new Function()` OK, `pm2 reload`, backups. Aucune migration SQL (bucket créé via API). Fixes data en base (adresse cabinet+société, `praticien_nom`, reconstruction snapshot Adem).
- **Certificat : l'IA n'ANALYSE PLUS la radio.** Vision auto (`analyze-media`) débranchée du flux : le praticien saisit son analyse radiographique (champ `cert-analyse-radio`), l'IA REFORMULE seulement. Racine : l'IA ratait une fracture 11 et hallucinait. Cf [[feedback-lecture-radio-dentaire]].
- **Signature réelle** : pavé canvas (`openSignaturePad`) → apposée sur le PDF (zone signature) → `/sign` verrouille. Avant = verrou logique sans signature visible.
- **Évolution d'un signé** : « Compléter » = nouvelle version datée (dup snapshot, original intact) ; « Déverrouiller » = `POST /documents/:id/unlock` (correction d'erreur). Un signé = photo datée médico-légale.
- **Radios DURABLES + compressées** : avant dans `/tmp` (effacées au reboot → « radios disparues »). Désormais compression `sharp` (~90 %) + coffre Storage `ia-doc-media`. `getMediaBuffer` (/tmp cache→coffre), `GET /media/:id` (aperçu). `media_ids` réinjectés à la signature (sinon la radio sautait).
- **Nom praticien OBLIGATOIRE** : était vide → garde-fou serveur (récupère `config.praticien_nom`) + `praticien_nom="Dr Bahmed Karim"`.
- **Envoi patient PRO + SÛR** : lien brut `supabase.co` (au porteur) → lien propre `jadomi.fr/d/<token>` (HMAC crypto, 7 j) + garde-fou DATE DE NAISSANCE (`patient-download.js` monté sur `/d`). Règle permanente [[feedback-patient-facing-pro-securise]].
- **Profession cabinet** : contrainte DB refusait `chirurgien_dentiste` (et 8 autres libellés) → normalisation vers l'enum + libellé exact en `config.profession_precise`. Bug voisin corrigé : PUT /cabinet écrivait `telephone` dans `email`.
- **UX premium** : `confirm/prompt/alert` natifs → modales JADOMI + toasts. « Voir » = aperçu PDF in-app (iframe) + bouton Signer. CSP `frame-src`/`object-src` : ajout `blob:` (aperçu PDF).

## Session 7 juillet 2026 — DURCISSEMENT PRÉ-LANCEMENT : XSS multi-modules + seed fantôme + RLS produits
Branche `feat/multi-societes`. Discipline « on ne suppose pas corrigé » (✅ = commit réel + test live ; cf incident commit fantôme #20). Registre = `SECURITY-AUDIT-REGISTRY.md`.
- **XSS stocké dentiste-pro** (commit `caa28f7`, VALIDÉ LIVE : nom `<img onerror>` → inerte) : nom patient/membre injecté brut en `innerHTML` à 3 sites (connecteur import CSV `renderPatients`, team-card, onclick delete) → `esc()`. Audit complet : tous les autres rendus déjà échappés. Même commit : bug fonctionnel « patient créé invisible » (`createPatient()` UI routé `/patients` legacy → `/patients-reels` = source lue par la liste ; `prenom` NOT NULL respecté).
- **XSS avocat + patient** (commit `ba70952`) : `avocat/dashboard.html` = 8 rendus non échappés (dossiers, panel, saisies temps, honoraires, relances, **noms de pièces uploadées** = attaquant-contrôlable, timeline, domaine) → `escapeHtml`. Décision : NE PAS basculer sur `dashboard-v2.html` (parité vérifiée : la v2 est un espace par-dossier, il lui manque clients/dossiers/coffre/relances/risques/recherche/visio) → porter l'échappement dans l'ancien. `patient/login.js` = XSS **reflété NON authentifié** via `?cabinet=` (lien piégé → overlay phishing) → `esc()` local. RESTE (batch suivant) : app patient `chat.js`/`mes-cas.js`/`mes-rdv.js`/`mes-visites.js`/`documents.js` (aucun helper esc).
- **Seed fantôme « données d'un autre »** (finding #48) : nouveau compte dentaire affichait 14 produits (« Protein Granarola », « isabelle »). Racine : table `produits` (20 seed orphelin `owner_id=NULL` + 4 compte test) **lisible par `anon` en direct** (aucune RLS) → dump inter-cabinets. FAIT : table vidée (24→0 via service_role node) = compte vierge honnête. RESTE (1 geste fondateur) : exécuter `sql/produits_rls.sql` (RLS owner + REVOKE anon ; service_role bypasse → zéro régression, y compris marketplace eco/check). Péremption `/summary-user` déjà scopée `user_id` (pas la fuite). #50 = décision produit modèle portée stock cabinet/praticien (chantier séparé).
- NB Git : working tree contient du BRUIT préexistant (prothesistes.js INTOUCHABLE modifié, XML gudid) → `git add` CIBLÉ, jamais `git add .`.

## Session 5-6 juillet 2026 — AUDIT SÉCURITÉ PLATEFORME (multi-tenant/IDOR + souveraineté données)
Branche `feat/multi-societes`. Contexte : audit systématique déclenché sur le cloisonnement inter-cabinets. Découverte de fondation TRANSVERSE : 100% des routes en `admin()` service_role (RLS Supabase bypassée), donc le cloisonnement repose UNIQUEMENT sur le filtre applicatif `.eq('societe_id'/'cabinet_id')` — un filtre oublié = IDOR inter-cabinets. Méthode : 6 vérifications par route (auth ? scope revalidé sur chaque id ? validation ? filtre société sur chaque requête ? fuite de champ sensible ? effets de bord ?), agents d'audit parallèles (lecture seule) puis vérification manuelle en code de chaque ❌ AVANT correction.
**VOLET A — CARE (données de santé) : bouclé sur les critiques.** Commit `70d8478` (14 fichiers) = 17 IDOR/auth + 4 fuites audio ; commit `2556326` = rate-limit OTP. Détail des correctifs : voir l'entrée « Derniere passe » en tête de CODEX. Points saillants : (a) photo-ai avait une AUTH CASSÉE (le token Bearer n'était jamais vérifié, `Bearer x` passait) + SSRF via photo_url → helper `identifyAuth()` + garde `isSafePhotoUrl()` ; (b) appointments /admin/* = fix SYSTÉMIQUE par 1 middleware unique au point de montage `router.use('/admin')` validant que le `site_id` (header/query/body, public) appartient bien à `req.societe` — ferme 11 routes d'un coup ; (c) agenda avait un routeur ENTIER sans auth (faux cabinet 'default'/'Mode Test' via un `router.use` master-fake) → requireCabinet sur les 6 routes praticien (le frontend envoyait déjà token+X-Societe-Id, zéro régression), /checkin (borne kiosque) durci en réponse générique anti-énumération + cabinet validé + rate-limit, avec fix frontend paire (le kiosque codait `?cabinet=default` en dur). SOUVERAINETÉ (RGPD art.9) : 4 points de transcription audio envoyaient l'audio à OpenAI/USA (chat patient, AUDITION avocat harcèlement = secret pro, dictée praticien ia-doc, secrétaire IA agenda) → tous basculés sur un Whisper self-hosted via env `WHISPER_BASE_URL` (endpoint OpenAI-compatible ; absent = 503/null, AUCUN envoi hors UE). Déploiement Speaches (Docker bind 127.0.0.1:8971, modèle faster-whisper CPU — pas de GPU sur srv 217) programmé APRÈS Care.
**VOLET B — CARTOGRAPHIE (photo complète, RIEN corrigé hors Care) :** classement du plus exposé au plus sûr — (1) 🔴 FaceMatch (repo SÉPARÉ `/home/ubuntu/facematch-api`, vrai module biométrique ; le module `facematch` de jadomi = 2 routes leurres) : AUCUNE fondation d'autorisation, biométrie (visages/DICOM/scans 3D) servie sans auth sur des dizaines de routes, path traversal, zip-slip, IDOR tenant total, secrets réels en clair sur disque (.env), `encrypt_data` = faux AES (XOR maison), serveurs liés 0.0.0.0 exposés Internet (217.182.132.136 / 141.94.10.182) = prototype NON déployable sur vrais patients → RÉSOLU (nuit 6 juil) : FaceMatch = silo SQLite autonome, PAS connecté à la base patients JADOMI (pas de credentials Supabase, pas de sync) → vrais patients jamais exposés. Exposition publique COUPÉE (pm2 stop + kill 8000/8001). RESTE : désactiver vhost nginx (sudo) + réécrire la couche d'auth ; (2) 🔴 `/uploads` servi en `express.static` PUBLIC (server.js:3226) = photos patients Care + audio auditions avocat accessibles par simple obscurité de nom → fondation transverse, patron cible = `avocat/coffre.js` (chiffrement AES-256-GCM au repos + route de serve authentifiée qui vérifie le propriétaire) ; (3) 🔴 rush-fichiers download/stream/list par id SANS auth ; (4) 🔴 moat comparateur : `/api/comparateur/search|stats|semantic` ANONYMES exposent toute la base `scraped_prices` (~219K prix, 25 fournisseurs) + `/api/scan/import-prices` = écriture anonyme (empoisonnement) — MAIS les prix négociés confidentiels par cabinet (`supplier_prices`) sont bien cloisonnés sur /api/achats/* ; (5) 🔴 `multiSocietes/communication.js` : JWT sans `requireSociete`, `societe_id` pris du header client → PII patients inter-cabinets ; (6) 🟠 studio/flyer-builder /projects/* IDOR non auth + generate-premium-ad débit wallet non auth. SAINS : labo (scope prothesiste dérivé serveur), multiSocietes core (PAS d'élévation de privilège — vérifié), brain/mail (**BUG 15 = NON-BUG** : mdp IMAP chiffré AES-256-GCM au repos, jamais loggé, jamais renvoyé par l'API — seule réserve : clé de chiffrement par défaut en dur si ENCRYPTION_KEY absent), studio core. Ordre de correction post-Care PROPOSÉ (rien lancé, à figer avec le fondateur) : /uploads (retro-affecte Care) → communication.js → moat → flyer-builder → FaceMatch. Feuille de route Ollama TEXTE (bloquant lancement Care) : #1 `copilot`=DeepSeek CHINE (anonymisation illusoire : masque emails/tel + ~15 mots-clés médicaux figés mais PAS les noms — malgré le commentaire — ni le contenu clinique libre ; contredit la règle documentée anti-DeepSeek ; ex. « ostéonécrose sous biphosphonates » part verbatim) ; #2 ia-doc génération doc médical ; #3 ia-secretary. Marketing (pub/logo/image) = 🟢 pas de PII, laissé sur OpenAI. NB Git : working tree contient du BRUIT préexistant (prothesistes.js INTOUCHABLE modifié, XML gudid supprimés) → toujours `git add` CIBLÉ sur ses fichiers, jamais `git add .`.

## Session 5 juillet 2026 — AUDIT FABLE 5 : 6 bugs Jurisprudence de la semaine (module Avocat)
Branche `feat/multi-societes`. 3 fichiers : `lib/legal-providers/jurisprudence-analyzer.js`, `api/avocat/home-juridique.js`, `public/avocat/dashboard-v2.html`. Fable 5 a fourni un brief de 6 bugs sur `/avocat/dashboard` (section « Jurisprudence de la semaine », Judilibre). Méthode fondateur respectée : reproduire/vérifier CHAQUE point en code + curl Judilibre live AVANT de coder, verdict VRAI/FAUX/DÉJÀ-FAIT, puis corriger 1→6.
- **BUG 1 (fuite métadonnées brutes) — VRAI, corrigé.** Racine : l'analyseur retombait sur `titrage` (matières EN CAPITALES : « STATUT COLLECTIF DU TRAVAIL », « QUESTION PRIORITAIRE DE CONSTITUTIONNALITE ») pour `resume_faits`/`points_cles`, MÊME sur les arrêts avec un bon sommaire ; et le front rendait `d.solution` brut via `text-transform:capitalize` (Judilibre `solution="qpcother"` → « Qpcother »). Fix : `solutionLabel()` (map code→libellé lisible, code inconnu → null → badge masqué, jamais de valeur brute), `isMatterLabel()`/`usablePoints()` (un vrai point contient des minuscules), `matiereLabel()` (table `MATIERE_ACCENTS` fermée et accentuée). CAS 1 (sommaire officiel) synthétise désormais faits/points À PARTIR DU SOMMAIRE (1 appel IA, accentué, ancré) ; tous les fallbacks n'injectent plus `titrage` (points_cles=[]). Exposés : `solution_label`, `matiere`. Front : badge solution mappé + chip « matière » discret (jamais en Faits/Points).
- **BUG 2 (troncature fondement) — VRAI, corrigé.** Front `.slice(0,220)` coupait « du 21 dec ». → troncature intelligente (dernier espace avant 300 + « … ») + texte complet en infobulle `title`.
- **BUG 3 (accents supprimés) — CAUSE FABLE INVALIDÉE (preuve live).** Judilibre sert `visa` (fondement) et `titrage` (matière) SANS accents à la source (24-19.702 : sommaire accentué, visa nu). AUCUN `normalize('NFD')` dans le pipeline (le seul est dans `verification-docs.js`, hors sujet), `stripHtml` n'y touche pas → aucune migration de base. Mitigation : contenu principal désormais tiré du sommaire accentué + matières ré-accentuées (table). Décision fondateur : fondement/visa laissé VERBATIM (ré-accentuation auto risquée, « attache » ambigu).
- **BUG 4 (tendances 0% partout) — VRAI, corrigé.** Le dashboard appelle `/tendances-public` qui codait `evolution_percent:0` en dur ; `/tendances` authed mettait 100% quand la période N-1 est vide (fenêtre `updated_at` ≠ date de décision). → les deux renvoient `null` quand pas de N-1 fiable, le front masque la cellule (jamais de faux %). Compteurs intacts (Licenciement 198, Inaptitude 53…).
- **BUG 5 (2 boutons alerte) — VRAI, corrigé.** « Activer » et « Désactiver » étaient tous deux en HTML statique. → conteneur `#abo-cta` re-rendu par `renderAboCta(actif,freq)` : 1 seul CTA, fréquence affichée si abonné, état conservé au rechargement.
- **BUG 6 (Bonjour Maître générique) — VRAI, corrigé.** Le seul override du header ne se déclenchait que déconnecté. → `personalizeWelcome()` lit `GET /api/juridique/profil` (nom), fallback « Bonjour Maître », « Maître » neutre (pas de Mme/M.).
- **Déploiement/preuve** : node -c + `new Function()` (3 blocs JS inline) OK, pm2 reload zero-downtime, cache `avocat_home_cache` (jurisprudence_semaine/tendances/a_retenir) purgé + régénéré, audit live = 0 bruit résiduel, 25-15.732 (référence Fable) intacte. Backups `.bak-fable5-20260705`. AUCUNE migration Supabase. Cf mémoire `project_veille_juridique_ancrage`.

## Session 4 juillet 2026 (3) — CERTIFICAT Phase 2 : persistance réelle + signature immuable
Branche `feat/multi-societes`. 2 fichiers (`api/ia-doc/index.js`, `public/admin/dentiste-pro.html`).
- **BUG MAJEUR CORRIGÉ** : le save DB des certificats n'a JAMAIS marché. L'insert `ia_doc_documents` visait `patient_name` (colonne inexistante) et posait `type='certificat_initial'`, `status='brouillon'`, sans `content_html` → violait `type_check` (∈ certificat|ordonnance|devis), `status_check` (∈ draft|signed|validated|sent) et NOT NULL sur `content_html`. Tout partait dans le `catch` best-effort silencieux : ZÉRO certificat persisté. Corrigé : `type='certificat'`, `status='draft'`, `content_html` généré (escape+pre-wrap), nom patient + `doc_kind` (certificat_initial|compte_rendu) dans `metadata`, `patient_id` (null tant que pas de sélecteur).
- **Endpoints** (requireAuth = auth+société) : `GET /api/ia-doc/documents` (liste scopée `societe_id`, mappe metadata.patient_name), `GET /api/ia-doc/documents/:id` (détail content_text/html), `POST /api/ia-doc/documents/:id/sign` (signature IMMUABLE : refuse si déjà `signed` 409, update `status=signed`+`validated_at`+`validated_by` avec garde-fou concurrent `.neq('status','signed')`).
- **Front** : `loadDocuments()` fetch la vraie base (plus de tableau local éphémère), lazy-render à l'ouverture de l'onglet ia-doc, `certDocHeaders()` (getToken+patSocieteId comme le reste du dashboard), bouton « Valider et signer » (confirm explicite → immuable), documents `signed` = lecture seule (badge « Verrouillé », bouton Valider retiré), `viewDocument` fetch détail, `generateCertificat` recharge la liste au lieu d'un push local.
- **Preuve E2E** (service-role, société Precision Dentaire c8fe3f0f) : insert draft OK, sign→signed OK, double-signature bloquée (immuabilité prouvée). Reload pm2 OK, health 200, endpoints 401 sans auth.
- **RESTE Phase 2** : sélecteur patients-reels (renseigner `patient_id`), stockage HDS du PDF signé (actuellement seul le texte est persisté, le PDF est régénéré à la volée), journal de versions complet. Puis Phase 3 (certificat complémentaire/consolidation + coefficient masticatoire), Phase 4 (notes internes + rappels).

## Session 4 juillet 2026 (2) — CERTIFICAT MÉDICAL DESCRIPTIF (Phase 1) + 2 bugs labo
Branche `feat/multi-societes`. Module IA Documentaire dentiste-pro. Règle cardinale posée par le fondateur : l'IA structure/reformule UNIQUEMENT la saisie du praticien, ZÉRO invention.
- **Backend zéro-invention** (`api/ia-doc/index.js`, POST `/generate-certificat`) : system prompt réécrit (faits au conditionnel+guillemets, champ vide = absent, ITT jamais suggérée/calculée, aucune section déductive type « Diagnostic »). Nouveaux champs formatés dans l'ordre médico-légal : examen_exo_buccal, dents_concernees (FDI), examen_clinique (endo-buccal), retentissement, reserves.
- **Parcours certificat initial** (`public/admin/dentiste-pro.html`, objet `iaDoc`) : sections structurées — identité déclarée, faits rapportés, examen exo-buccal, examen endo-buccal avec ODONTOGRAMME FDI (`window.JADOMI_ODONTOGRAM` mode simple, dents cliquées = concernées, détail par le texte du praticien), examens complémentaires (upload existant), retentissement DESCRIPTIF, ITT optionnelle, réserves, bandeau « Document généré par IA — à relire et valider ». Dictée généralisée `dicterInto(fieldId)` (+ `applyVoice` odontogramme sur dictée endo). Formulaire affiché dès l'ouverture (photos optionnelles).
- **DISTINCTION CLÉ (fondateur)** : le certificat initial descriptif ≠ le certificat avec coefficient masticatoire. Le coefficient masticatoire (évaluation séquellaire) est réservé au 2e certificat (complémentaire/consolidation, Phase 3), JAMAIS dans l'initial. Le bouton « Insérer dans un certificat » du coefficient sera rebranché vers ce 2e document.
- **Bugs labo** : `/labo/chat` `headers()` envoie X-Societe-Id (fini « X-Societe-Id requis » en boucle). `/labo/planning` `loadTechnicians` : suppression du fallback `getDemoTechs()` (faux Marie Dupont… → tableau vide honnête ; 404 = profil labo non configuré).
- Fichiers (4) : `api/ia-doc/index.js`, `public/admin/dentiste-pro.html`, `public/labo/chat.html`, `public/labo/planning.html`.
- **RESTE** : Phase 2 (Valider et signer → immuabilité lecture seule, journal versions, stockage HDS lié patients-reels, horodatage), Phase 3 (chaîne certificat complémentaire/consolidation immuable + réévaluation coefficient masticatoire), Phase 4 (notes internes non imprimées + rappels de suivi via module Rappels), PDF avec photos en annexes numérotées légendées, en-tête auto depuis profil société (RPPS/ADELI/adresse), sélecteur patients-reels.

## Session 4 juillet 2026 — CONSOLIDATION AUDITS FABLE 5 (R1→R8) + PHASE 9 (débranchage dentiste-pro)
Branche `feat/multi-societes`. Auditeur navigateur externe (« Fable 5 ») colle des rapports détaillés ; méthode : reproduire en curl / lire le code / vérifier la base AVANT de coder (les audits mislabellent souvent 401→404 et la cause racine). Backups + node -c + pm2 reload respectés.
- **CACHE (cause racine des « fixes invisibles »)** : `server.js` `express.static(public,{maxAge:'1d'})` ne posait no-cache que sur `.html`, pas les `.js` externes → `tab-agenda.js` figé 24h côté navigateur. FIX : `setHeaders` ajoute `Cache-Control: no-cache` pour `.js`/`.css` (revalidation ETag). C'est ce qui rendait invisibles tous les correctifs frontend.
- **Comparateur** : le vrai crash `toFixed` était `cmpSearch` INLINE dans `index.html` (pas `comparateur.html`) — gardes `hasPrice`/`isFinite` sur chaque `.toFixed` des offres + `best_price` + widget scan → « Prix indisponible », pas de bouton panier sans prix.
- **Éjection labo → /organisation** : `production/chat/remakes/garanties/planning.html` lisaient de mauvaises clés localStorage (`sb-access-token`, `labo_session`, `session`, `jadomi_session`) inexistantes → token null → éjection. FIX : `resolveLaboToken()` scanne la VRAIE clé Supabase `sb-<ref>-auth-token` (pattern de `tab-agenda.js getToken()`). Les routes labo n'étaient jamais 404 (401 `missing_token` sans session, `{"error":"Profil requis"}` si profil labo non configuré).
- **dentiste-pro** : 403 `/team/my-permissions` = rôle réel `proprietaire` non reconnu (le code n'acceptait qu'`owner`/`admin`) → corrigé 3 endroits (`shared.js` requirePermission, `team.js:84` helper manager, `team.js:575` my-permissions) ; le fondateur EST proprietaire sur société c8fe3f0f (Precision Dentaire, cabinet 22227205 existe). Dédup appels today/stats/pipeline via `dashGet` (cache 5s partagé accueil+dashboard). Blocs accueil (Alertes/Activité/RDV) branchés sur `/dashboard/today` réel + états vides.
- **compta** (`api/compta/index.js`) : badge « ⚠ À vérifier — exclue des totaux » sur écritures >10k (DENTOXCELLENCE), regex homoglyphes durcie (plage `ᤀ-᥿` inclut Tai Le → attrape « Tᥱmᥙ »/« Sephorɑ »), toggle masquer les 0€, accents (« Validées », mois). Analytics `/dentiste` : `eqHeaders()` fallback `localStorage.societe_active_id` + retry → fini le 400 « Société manquante » (le `month` était géré, Fable 5 se trompait de cause).
- **stock** (`index.html`) : colonne Rythme — le statut périmé PRIME (plus de « 🟢 Optimal » + « ⚠ EXPIRÉ » juxtaposés).
- **PHASE 9 — débranchage dentiste-pro** (`public/admin/dentiste-pro.html`) : suppression des 8 tableaux `DEMO_*` (Sophie Lefebvre, Robert Blanc…). Rappels→`/dashboard/rappels-today`, Chat list→`/chat/conversations` ; Agenda/Pipeline (via renderScheduleReal/renderPipelineReal), Patients (param réel), Calendrier, Liste d'attente, graphe hebdo + KPIs stats (156/92% en dur → 0) = états vides honnêtes. Preuve : `curl /admin/dentiste-pro` → ZÉRO faux patient dans la source.
- Fichiers (15) : `server.js`, `index.html`, `public/admin/dentiste-pro.html`, `public/admin/js/tab-agenda.js`, `public/comparateur.html`, `public/labo/{production,chat,remakes,garanties,planning,bons-livraison}.html`, `api/compta/index.js`, `api/dentiste-pro/{dashboard,shared,team}.js`.
- **RESTE** : chargement des messages chat par conversation, extraction TVA (pipeline IA en amont), mail statut Yahoo « connectée » menteur, dédup rétroactive compta (dry-run à valider + backup), pipeline accents (source ASCII), ticker LEFEVRE (vraie notif patient, décision fondateur), profil labo à configurer par le fondateur pour activer BL/factures.

## Session 2 juillet 2026 — VEILLE JURIDIQUE niveau mondial (anti-hallucination + auto quotidienne + 4 points) + FIX coffre-fort
Branche `feat/multi-societes`. Déclencheur : l'épouse avocate a vu la veille inventer des arrêts. Testé + en ligne, NE RIEN CASSER respecté (backups, node -c, pm2 reload).
- **Verrou anti-hallucination FAIL-CLOSED** (`lib/legal-providers/jurisprudence-analyzer.js`) : apport tiré de la RÉPONSE DE LA COUR uniquement, jamais des faits (corrige l'arrêt d'omission de statuer 25-13.725 résumé à tort en requalification CDD) ; juge de fidélité 2e passe + `findInventedCitations` (article absent du texte réel = rejet) ; sinon `metadonnees_seules`. Décision de procédure (art. 1014) → pas d'apport inventé.
- **Vraie veille automatisée** `scripts/veille-refresh.js` (cron 7h) : Cass. soc. + cours d'appel sociales (`judilibre.js` gère `jurisdiction=ca`), 30 j, dédup, ancré+vérifié, stocké DATÉ (`metadata.decision_date`). `à-retenir` (`home-juridique.js` `getRecentAnchored`) sur du récent + libellé honnête ; cache d'affichage vidé en fin de refresh.
- **4 points (benchmark Doctrine/Predictice/KeyCite/Shepard's)** : (1) signal de fiabilité/citateur `jurisprudence-citateur.js` (portée B/R/L, postérité « cité par N », visa, rapprochements) sur chaque carte ; (2) alerte email perso `veille-abonnements.js` (store `data/`, endpoints `/abonnement`) + `scripts/veille-digest.js` (digest dédupliqué par arrêt, crons hebdo/quotidien, `VEILLE_DRYRUN`) ; (3) textes Legifrance/JORF `textes-veille.js` (source='loda', endpoint `/textes-recents`, carte UI) ; (4) réseau de citations (visa+rapprochements).
- **FIX coffre-fort** (`api/avocat/coffre.js`) : `requireAvocat` ne posait pas `req.userEmail` → OTP email sans destination → déverrouillage impossible. Ajout `req.userEmail`/`req.user`.
- Fichiers : +5 (`jurisprudence-citateur.js`,`veille-abonnements.js`,`textes-veille.js`,`veille-refresh.js`,`veille-digest.js`) ; M `jurisprudence-analyzer.js`,`legal-formateurs.js`,`judilibre.js`,`home-juridique.js`,`coffre.js`,`dashboard-v2.html`. Crons système : refresh + digest hebdo + digest quotidien.
- EN ATTENTE : MCP Supabase hors-ligne (headless) → abonnements en fichier à migrer vers table `veille_abonnements` ; détection « overruled » réelle (revirement) ; panneau cours d'appel séparé.

## Session 29 juin 2026 — FORMATION AVOCAT niveau AVANCÉ + SIMULATEUR D'INDEMNITÉS « vivant » + onboarding épouse premium
Branche `feat/multi-societes`. Tout testé + en ligne. NE RIEN CASSER respecté (backups, node -c, pm2 reload, prod HTTP 200).
- **Enregistreur écran intégré** `public/formation/enregistrer.html` + endpoints `/api/formation/record-chunk|record-finish` (getDisplayMedia→MediaRecorder→upload par morceaux). Code d'accès tolérant casse (jadomi2026).
- **Module formation niveau AVANCÉ** `private/formation/formation-avance-deficab.html` : 68 slides (PDF→images), oral verbatim Whisper large-v3 ancré par OCR des n° de page (`scripts/avance-ocr-timeline.py` + `avance-inject-oral.py`), fiches, 1 note rouge prouvée (tranche 2 2026 : 35 040 → 32 040 €), copilote. Route gated `/formation/formation-avance-deficab`.
- **Débutant** passé en VERBATIM intégral (17 blocs, depuis transcripts) + **collapse « Voir tout l'oral »** dans les 2 modules. **Page de choix** `/formation/formations` (2 cartes Débutant/Avancé).
- **Cerveau assistant ANONYMISÉ** `data/formation-deficab-knowledge.js` (0 mention formateur, enrichi Avancé + exercices chiffrés) ; chaînes scrubbées dans `formation-deficab-ia.js` + `ia-juridique.js`. RÈGLE : ne jamais citer le formateur (risque IP).
- **SIMULATEUR D'INDEMNITÉS** `public/avocat/simulateur.html` (NEUF) sur `api/avocat/simulateur-indemnites.js` (scrubbé + taux saisissables → coût employeur exact à l'euro, validé exercice 250 000 € ; **mandataire social** ventilation dédiée) : temps réel + 3 curseurs + 2 graphes animés + 15 bulles d'aide + copilote (/api/avocat/ia) + comparateur + **doc client A4 imprimable**. Liens menu dashboard (Outils : Simulateur + Formations) + **assistant IA flottant** bas-droite.
- **Épouse Louiza Amrane** : mail d'invitation ENVOYÉ (OVH) + **RÈGLE PREMIUM** `api/multiSocietes/societes.js` (bootstrap-cabinet + POST /) : signup reconnu par e-mail OU nom/prénom → plan `illimite` auto.

## Session 28 juin 2026 (soir) — BUILDER : générateur MULTI-PAGES fidèle au template + fixes aperçu
Commit `7742b72`. Branche `feat/multi-societes`. Tout testé + live www.jadomi.fr.
**Problème de fond résolu** : le client choisit un template (ex « déroulant multi-pages » expert-scroll) et PAIE la formule, mais le site généré sortait « basique » — `resolveThemeCode` rabattait tous les templates sur 1-2 layouts, et 70+ thèmes n'ont pas de `template.html` (fallback `_base`). Règle fondateur posée : **la formule/le template choisi et payé DOIT être respecté**.
- **Nouveau thème générable `law_expert_scroll`** = portage fidèle de `public/studio/templates/site-expert-scroll-avocat` (accueil scroll-vidéo GSAP 5 séquences + 6 sous-pages : cabinet, expertises, équipe, résultats, contact, mentions). Fichiers : `templates/themes/law_expert_scroll/{template.html, defaults.json, style-pages.css, pages/*.html}`.
- **`services/site-generator.js`** : ajout du rendu MULTI-PAGES (rend `pages/*`, copie `css/`) + nouveaux blocs de données au format du thème (`expertises_cards_html` .c, `equipe_cards_html` .tm, `equipe_detail_html`, `nom_court`, `ville`/`ville_suffix`/`ville_phrase` déduits de l'adresse). Le bloc multi-pages ne s'active QUE si le thème a un dossier `pages/` → zéro régression single-page (e2e 9/9 OK).
- **`server.js`** : `/sites/` et `/sites-staging/` EXEMPTÉS du middleware strip-`.html` (sinon sous-pages = 404) + `express.static(..., {extensions:['html']})`. Backup horodaté fait, node -c + pm2 reload.
- **`builder.html`** : `resolveThemeCode` mappe `expert-scroll-avocat` + `pro-scroll-avocat` → `law_expert_scroll`. Fixes aperçu : clic upload ne fait plus remonter la page (input fichier `position:fixed`), fallback vidéo illisible (plus d'écran noir), plus de reload aveugle de l'iframe, cibles photo élargies.
- **PHASE B FAITE (29 juin, commit `9a16f56`) — intake enrichi** : distinction NOM DE LA STRUCTURE (marque + raison sociale) vs NOM DU PRATICIEN (titre Maître/Dr + nom) ; question SOLO/GROUPE avec saisie des associés (Nom — spécialité) → section `equipe` → page Équipe multi-praticiens ; email pro proposé (`contact@cabinet-<nom>.fr`) ; nom « Bahmed » en dur supprimé de `METIER_PROFILES`. Fonctions builder.html : `setExercice`/`finPraticiens`/`askCoordonnees`/`proposEmails`. Vérifié e2e 9/9 (template `law_expert_scroll`, page Équipe = 2 praticiens).
- **RESTE (bonus, non bloquant)** : porter d'AUTRES templates premium en thèmes générables multi-pages (même méthode que `law_expert_scroll`) pour couvrir tous les métiers/formules (dentaire, prothésiste, paramédical, société).

## Session 28 juin 2026 — BUILDER DE SITE branché de bout en bout (création → staging jadomi → correction IA → OVH)
Le builder conversationnel (`/studio/mon-site/builder`) était une coquille NON branchée : aucun appel à `/creer` ni `/publier`, `siteData` purement local, aperçu = template démo bidouillé, cul-de-sac final. NE RIEN CASSER respecté (backup builder.html, node -c + new Function sur tout le JS, pm2 reload, prod HTTP 200, aucun fichier intouchable modifié, aucun achat OVH déclenché).
- **Vision fondateur (validée)** : le client construit → site créé + hébergé D'ABORD sur JADOMI (`jadomi.fr/sites/<slug>`, gratuit, staging) → il teste, si ça bugue il l'écrit à l'IA qui corrige toute seule (en respectant son forfait) → quand IL VALIDE explicitement → boom hébergement OVH automatique (domaine + déploiement). Jamais d'OVH avant validation.
- **2 systèmes de templates réconciliés** : les templates immersifs (démo, non générables) vs les thèmes du moteur (`templates/themes/*`, pilotés données). Créé **1er template immersif RÉELLEMENT générable** : `templates/themes/law_immersive_parallax/` (template.html à placeholders + defaults.json). Enregistré dans `themes_sites` (métier avocat, tier pro).
- **Moteur étendu** (`services/site-generator.js`, additif) : support `{{video_hero}}` (depuis `hero.video`), `photo_about`, `logo_initials` (déduit du nom), `telephone_raw` (lien tel:), et **fusion `defaults.json` par thème** (fallback générique quand un champ est vide — réutilisable pour tous les futurs thèmes immersifs).
- **Backend** (`api/studio/sites-jadomi/index.js`, additif) : `POST /upload-photo-pre` (upload photo AVANT création, miroir de upload-video) + `PUT /:id/section-cle/:cle` (MAJ/création d'une section par sa clé, fusion + régénération auto).
- **Builder rewiré** (`public/studio/mon-site/builder.html`) : `resolveThemeCode()` (template choisi → thème générable), création réelle du site en fin d'étape Infos (`createRealSite` → POST /creer + lie vidéo/photo au hero + bascule l'aperçu sur le VRAI site `/sites/<slug>/`), `generateTexts` corrigé (404 → `/:id/suggest-text` + persiste services/description), `selectSlogan` persiste + régénère, fix IDs dupliqués des zones d'upload (cause du « rien ne se passe après la vidéo »), upload photos RÉEL.
- **Étape finale refondue** : `finalizeAndReview` (publie + montre le site staging + 2 choix) ; `applyCorrection` (parse langage naturel → corrige téléphone/email/adresse/slogan via sections + régénère) ; `startHosting`/`checkDomain`/`confirmHosting` (vérif dispo OVH + prix réel → réservation après clic explicite → `migrer-ovh`). `resolveOvhPlan` respecte le forfait (classic/pro/expert).
- **TESTÉ bout en bout en HTTP réel** (token de session admin via magiclink) : creer 201, section-cle 200, suggest-text 200 (3 prop.), publier 200, **check-domain 200 mode LIVE dispo 4,99€ (vraie API OVH)**, page staging 200 avec nom+vidéo injectés, accès public https://jadomi.fr/sites/... 200. Scripts de régression : `scripts/test-immersive-gen.js` + `scripts/test-builder-e2e.js`.
- **Sites démo en ligne** : https://jadomi.fr/sites/test-immersif-mqy9e9cz/ et /sites/cabinet-e2e-test-mqy9mawe/
- **RESTE** : (1) rendre génératables les AUTRES templates immersifs (3D, walkthrough, scroll) + métiers (dentiste/prothésiste) sur le même schéma defaults.json ; (2) IA de correction PLUS autonome (au-delà du parsing par mots-clés : comprendre une demande libre et éditer n'importe quelle section/couleur/section entière) ; (3) gating réel des modules par forfait dans le builder ; (4) déploiement OVH effectif à tester en vrai (non déclenché : argent réel).

## Session 26 juin 2026 — JADOMI ON-PREMISE : orchestrateur + mesh WireGuard + agent .exe (RÉEL bout en bout)
Construction de l'infrastructure IA souveraine « se greffer au GPU du cabinet ». NE RIEN CASSER respecté (backups server.js, node -c, pm2 reload ; prod HTTP 200 tout du long).
- **Orchestrateur de nœuds** (`lib/onprem/node-registry.js` + `config/onprem-nodes.json`, NEUFS) : registre + santé + routage « nœud le + proche capable ». 3 niveaux de confiance par sensibilité (`dataClass`) : sensible→France/cabinet only, business→exclut la Chine, public→tous. Cascade France→Mistral(UE)→Claude(US)→DeepSeek(CN). Routage MULTI-RTX « carte libre » (heartbeat push : moins de jobs + plus de VRAM libre, TTL 90s). Souveraineté = propriété de l'archi, plus un if.
- **Câblé dans la compta** : `analyserDocumentIA` (server.js) consulte l'orchestrateur (vision/business) ; `analyserDocumentLocal(.,.,ollamaUrl)` + `ollamaGenerate({baseUrl})` (additif, défaut localhost = zéro impact). Repli sûr historique. Comportement identique aujourd'hui, prêt pour les RTX.
- **Page confidentielle** `/admin/onprem` (`private-pages/onprem-nodes.html`, HORS public/, portail mot de passe fondateur GATE_COOKIE) + endpoint `/api/onprem/nodes` gardé. Bouton « Générer un code ».
- **Mesh WireGuard RÉEL** : serveur OVH 217.182.132.136:51820, sous-réseau 10.10.0.0/24, `wg-quick@wg0` permanent, UFW 51820/udp. Pont root `scripts/jadomi-agent` → `/usr/local/bin/jadomi-wg-peer.sh` (sudoers limité, anti-injection, add/remove/list IP). Enrôlement auto : `POST /api/onprem/enroll-token` (fondateur) + `/api/onprem/enroll` (agent : code+pubkey→peer créé→config renvoyée) + `/api/onprem/heartbeat` (auth = source mesh 10.10.0.x).
- **Agent Windows .exe AUTO-CONSTRUIT** : repo privé `github.com/karimstock/jadomi-agent` (build GitHub Actions windows-latest + ps2exe = « Codemagic pour Windows »). `install-jadomi-agent.ps1` tout-en-un : auto-détecte GPU, WireGuard+Ollama (winget), enrôle, monte tunnel, pare-feu mesh-only, heartbeat planifié, modèle dimensionné à la VRAM.
- **TESTÉ EN RÉEL sur la RTX 2070 du fondateur** : 7 étapes OK, tunnel handshake (mesh 10.10.0.3), serveur atteint l'Ollama du cabinet via le tunnel, **inférence réelle pilotée depuis le serveur : 95 tokens/s sur le GPU** (moondream). Modèle puissant qwen2.5vl en téléchargement.
- **BUGS corrigés** : v1 fermait la fenêtre sans montrer l'erreur (try/catch+pause) ; ordre revu (tunnel/RTX d'abord) ; chemins Ollama complets. **BUG connu à corriger** : `OLLAMA_HOST=0.0.0.0` casse `ollama pull` côté client Windows (contourné en pilotant le pull depuis le serveur). HEARTBEAT Windows n'apparaît pas encore dans l'orchestrateur (piste : registerNode à l'enrôlement).
- Détails complets : mémoires `project_jadomi_onpremise` + `feedback_onprem_zero_connaissance`.

## Session 24 juin 2026 — Compta : import réparé + justificatifs auto + analyse LOCALE souveraine
- **BUG IMPORT FACTURE (photo/PDF) réparé à 3 couches** (commit 02a269b) : (1) `missing_token` — le front n'envoyait pas de token sur `/api/analyser-document` + `/api/valider-document` → helper `pcAuthHeaders()` + `await _getFreshToken()`. (2) `Erreur serveur` — `valider-document` insérait avec le client ANON (bloqué RLS) → service-role (`supabaseAdmin`/`dbW`). (3) « sans fichier » — fichier d'origine pas stocké → upload bucket `documents-compta` + `storage_path`. Anti-doublon rétroactif (ré-import rattache le PDF).
- **RÉCUPÉRATION AUTO DES JUSTIFICATIFS** (commits 02a269b, b8807e6) : `POST /api/compta/recuperer-justificatifs` + `/etat` + bouton « 🔎 Récupérer les justificatifs manquants ». Retrouve dans les mails (Outlook/Yahoo/Gmail/IMAP) le PDF joint OU le corps HTML (capture AliExpress/Amazon) de chaque facture sans fichier. Matching pur souverain (PAS de Claude). Arrière-plan (`_recupererJustificatifsBg`) + progression. **CRON quotidien 03h40 Europe/Paris** (`_sweepJustificatifsQuotidien`). ANTI-PUB (retour fondateur) : signal transactionnel obligatoire (montant exact/PDF/mots commande) + rejet pub ; marchand bruyant (>6 mails) = montant exigé, unique = 1 mail transac suffit ; montants à séparateurs de milliers. **Résultat réel : 175/188 factures avec justificatif.** Respecte les règles perso. Script ref `scripts/_run_recup_justif.js`.
- **ANALYSE FACTURE LOCALE D'ABORD** (commit 2a28117) : `analyserDocumentIA` route vers `qwen3.6:35b-a3b` (VISION, sur jadomi-srv) d'abord = GRATUIT + souverain ; Claude (Sonnet) en MODE SECOURS si incomplet (`_analyseExploitable`). `analyserDocumentLocal` (image→qwen vision, PDF→pdf-parse+qwen). `ollamaGenerate` (lib/ia-router.js) accepte `options.images`. **Supprime le risque de coût incontrôlé** (secrétaire 1000 factures = ~0€). NB lien secrétaire (compta-snap) n'utilise DÉJÀ aucune IA.
- **BUG LIEN SECRÉTAIRE** (commit 0e6dbbd) : bloqué sur « Envoi » = photo iPhone HEIC trop lourde sur réseau mobile (backend OK en 0,5s). Fix `public/capture-facture` : compression photo CLIENT (canvas→JPEG 1600px, ~10Mo→300Ko) + timeout 90s.
- ⚠️ Découverte : `qwen3.6:35b-a3b` EST multimodal (vision), testé (ancienne note « texte seul » fausse). Voir mémoires project_compta_mail_rapprochement, project_jadomi_onpremise, feedback_rib_verite_pro_perso.

## Session 23 juin 2026 — Boucle « module parfait » + audit compta soldé (25 défauts)
- **BOUCLE RÉUTILISABLE construite** : `scripts/workflows/loop-module-parfait.js` (orchestration multi-agents : Mémoire → Audit 7 axes → Verify adversarial → Synthèse → Build worktree → Review → Test E2E → Apprend) + `scripts/_e2e_compta.js` (test e2e SOUVERAIN, n'imprime que des agrégats, jamais de donnée bancaire). Branchée sur la mémoire Supabase DÉJÀ existante (`jadomi_task_queue`, `jadomi_learnings`, `cabinet_brain_rules`, lib/boss/). Paramétrable (mode audit/fix/full/e2e + target). Voir mémoire project_boucle_module_parfait.
- **AUDIT COMPTA soldé** : 25 défauts confirmés (0 CRITICAL, 3 HIGH, 15 MEDIUM, 7 LOW), TOUS corrigés/vérifiés/déployés en 4 commits (da02c41, 04a7f20, 9e6c24f, cdd1ce4). Chaque lot : reviewer adversarial PASS + node -c + e2e PASS + pm2 reload OK. Faits : 3 HIGH (récap annuel mort = 6 fonctions front sans token/X-Societe-Id, import mail silencieux, rescan IMAP avorté → try/catch par lot) ; cloisonnement multi-société (7 routes + 2 inserts filtrent societe_id, 10 docs legacy NULL rattachés à Precision Dentaire AVANT déploiement) ; LOW (DoS upload compta-snap, lien secrétaire révocable, next_numero NaN, attacher-facture refuse crédit, HT sans TVA = franchise, retry IMAP, fenêtre +45j bornée, bug `.insert().catch()` → `.then(ok,err)` dans mail-sync-daemon).
- RÈGLE IMAP confirmée : TOUTE boucle `for await (client.fetch(batch))` doit être en try/catch par lot (Command failed transitoire). PIÈGE cloisonnement : vérifier `WHERE societe_id IS NULL` AVANT d'ajouter un filtre strict (sinon docs invisibles). Fichiers : server.js, index.html, api/compta/index.js, api/compta-snap/index.js, api/brain/mail-copilot.js, lib/brain/mail-sync-daemon.js. Voir mémoire project_compta_mail_rapprochement.

## Session 22 juin 2026 — Consolidation compta (bugs racine + récup PDF + auth)
- **BUG RACINE IMAP** : `client.search()` renvoie des n° de SÉQUENCE mais le code faisait `fetch(..., {uid:true})` -> `parsed=null` partout -> AUCUNE facture jamais lue (Yahoo). Corrigé (search `{uid:true}`) dans retrouver-factures + mail-copilot fetchRecentMails. La recherche de factures marche ENFIN.
- **Snapshot figé rejoué au CHARGEMENT** (GET /api/compta-releves) : règles apprises (`_comptaChargerRegles`), rapprochement factures DB (`_comptaRematch`), loyers SCI/quittances (`_comptaReappliquerLoyers`) ré-appliqués à la lecture (avant : « la règle tient pas »). Throttle 1x/45s (perf). RE-ANALYSE préserve le travail manuel (fusion par date+montant+libellé).
- **Garde-fou mois** : le mois d'un relevé = MOIS DOMINANT des vraies dates (jamais le parser) -> impossible de ranger mars sous février (incident corrigé, faux 2026-02 supprimé, vrai février ré-uploadé = 123 op.). **Relevés PDF ARCHIVÉS** en local France (`uploads/releves-pdf/`, GET /api/compta-releve/:periode/pdf, bouton 📄 Relevé PDF) pour le comptable.
- **Reçus dans le CORPS du mail -> PDF** : le scan stocke le corps HTML (rapide), PDF généré À LA DEMANDE au clic (puppeteer `lib/html-to-pdf`, cache) + conversion fond `_rendrePdfRecusEnAttente` (auto après scan + bouton « 📄 Reçus → PDF »). **Récup script** `scripts/_recup_pdf_factures.js` : 50 PDF récupérés ; 5 vides écartés -> **99 PDF valides** sur 104. **ZIP** « 📦 Toutes les factures (PDF) » (GET /api/compta/factures-zip, archiver).
- **Factures visibles** : onglet Factures alignée sur `pcSocieteId()` (même société que Relevé, fini « je vois rien »). Badge **📄 PDF / — sans fichier** par ligne. **PayPal propose+confirme** : GET /propositions (factures même montant) + POST /attacher-facture (confirmation, anti-couac). **Pro sans facture + note** (modale, justifie_sans_facture, + règle permanente tag `sans_facture`). **Onglet Démo** (`lib/demo-societes`, sociétés démo séparées, exclues du routage). **Scan mensuel borné** (before) -> fini « décembre 2025 sort juin 2026 ».
- **AUTH RACINE** (`api/multiSocietes/middleware.js`) : `authSupabase` + `requireSociete` lisent le token ET la société en QUERY (`?access_token=&societe_id=`) -> ouvrir un PDF/ZIP dans un onglet marche (fini missing_token / societe_id_manquant). nginx : timeout 900s sur endpoints de scan ; SSE scan-progress avec token en query.
- RESTE (validé fondateur) : consolidation archi = 1 seul système de factures (documents_compta vs cabinet_brain_documents) + scans ASYNC (ne plus tenir une requête 15 min) + bloquer capture emails de contestation/litige + récup des ~36 factures encore sans fichier. Fichiers : server.js, index.html, api/multiSocietes/middleware.js, api/compta/index.js, api/compta-snap/index.js, lib/html-to-pdf.js, lib/demo-societes.js, scripts/_recup_pdf_factures.js. Voir mémoire project_compta_mail_rapprochement.

## Session 21 juin 2026 — Capture factures mail + rapprochement RIB fiable + mode secrétaire
- **Connexion boîtes mail** : Gmail/Yahoo en mot de passe d'application (OAuth scope restreint = audit CASA trop cher), Outlook OAuth. Détection auto fournisseur + aide cliquable (index.html).
- **Capture factures par mail — 5 bugs corrigés** (server.js scan-intelligent) : Gmail = scanner [Gmail]/All Mail (archivage), factures EN (invoice/receipt/payment), reçus de paiement = justificatifs, Outlook fetch par paquets (Command failed sur gros volume), corps HTML-only. Ajout plage de dates (since), anti-doublon par contenu (date+montant+fournisseur), routage société (routerSoc), petite boîte = tous les corps. 147 factures captées déc.2025→juin.
- **Rapprochement RIB ↔ factures** : COMBO montant ET nom obligatoire (évite collisions type EDF→hôtel). POST /api/compta-releve/rematch (calcul pur LOCAL, zéro Claude) + bouton "Rapprocher mes factures". retrouver-factures : recherche from→subject→corps→montant. 212/464 lignes rapprochées (relevés janv→mai), 100% confirmées.
- **Mode secrétaire** (api/compta-snap + public/capture-facture) : liens permanents (uploads/scan-links.json, pas de table SQL), page isolée = liste des factures manquantes uniquement → photo multipage + société par facture + match direct. Boutons Compta→Import "QR Téléphone" + "👩‍💼 Lien secrétaire". Zéro accès relevés/dashboard.
- Relevés analysés 100% LOCAL (parser/Ollama), jamais Claude. Fichiers : server.js, index.html, api/compta-snap/index.js, public/capture-facture/index.html, scripts/_backfill_dec2025.js, _rematch_releves.js, _search_orphans.js.

## Session 20 juin 2026 (soir) — UI cartes mois + detection recurrentes + perso/pro + badge rapproche
- **UI relevés refondue** (index.html) : fini le mur de donnees -> **cartes mois par mois** (pcRenderMoisCards) cliquables, clic -> detail (pcRenderReleveDetail) : bandeau fiabilite, Recettes/Depenses/vir.internes, lignes orphelines 🔴 "A traiter" avec boutons **Perso / Pro+charger facture / 📷 QR**, listes Entrees/Sorties repliables. _releveData global.
- **Detection auto charges recurrentes** : bouton "🔁 Détecter mes charges récurrentes" (si >=2 mois) -> pcDetectRecurrentes scanne tous les mois, groupe par libelle normalise (pcNormLib, retire PRLV/SEPA/VIR..., garde 3 mots), garde ce qui revient >=3 mois, montant median (ou "variable" si ecart >15%). Panneau avec cases + menu **Pro/Perso** par ligne -> pcRegisterRecurrentes POST /api/compta/charges-recurrentes. Serveur matchRecurrente : comparaison "squash" (ignore espaces/tirets) pour matcher "MACSF-ASSU-" avec mot-cle "macsf assu".
- **Recurrente PERSO** (ex VIR SEPA AMRANE NASSIM 450 = famille du fondateur) : categorie 'perso' -> sous_type='perso'. matchRecurrente -> transaction professionnel=false (reconnue donc PAS d'alerte, mais classee perso non deductible, comptee dans total_perso, signalee au comptable). 
- **Badge "Vérifié au relevé"** : analyse-releve persiste `rapproche=true` sur les factures matchees (documents_compta) -> Mes Factures affiche le badge (corrige : teste `doc.rapproche` boolean, plus `doc.rapprochement`). deviseBadge deja present (USD/DZD).
- Recurrentes claires reperees sur 5 mois CIC : LK Immo, EDF, SFR, Free, MACSF(x3), URSSAF(x2), TGS, AG2R, Doctolib, GG Capital, MDA HE, Salaire Nadia Aouidj, Euro-Information, + fournisseurs dentaires (Technident/Prothexpert/Straumann/DPI/Dentalevolution). Amrane Nassim = PERSO.

## Session 20 juin 2026 (apres-midi) — LECTEUR RELEVES DETERMINISTE + devises + perso/pro
- **BUG releves CIC** : l'analyse via Ollama renvoyait `{"` (vide) sur un vrai releve (22k car) -> JSON.parse echec -> erreur "pas pu etre lu". Ollama+format:json flanche sur gros texte. ROOT CAUSE trouvee en recuperant un releve depuis la boite mail du fondateur (il se les etait auto-envoyes : sujets "Relever janvier/fev").
- **SOLUTION : parseur DETERMINISTE `lib/releve-parser.js`** (`parseReleveCIC`). Lit les colonnes par POSITION (pdfjs transform x) : Debit (x~409-444) vs Credit (x~480-503), seuil dynamique via en-tetes "Debit/Credit EUROS" (ancrage `^` strict pour ne pas matcher "CREDITEUR"). ZERO IA, zero hallucination, montants exacts. **VERIFICATION par le solde** : solde_debut + credits - debits == solde_fin (janvier ET fevrier : EQUILIBRE au centime = preuve que toutes les lignes sont lues). Categorisation par mots-cles (CPAM=recette, EDF=charge...). "VIR VIREMENT INTERNE" = `mouvement_interne` (neutre, exclu du CA).
- **Endpoint `/api/analyser-releve` (server.js ~7166)** : voie 1 = parseur deterministe ; voie 2 (secours, format inconnu) = Ollama local. Bug "Cannot set headers" corrige (returns propres). Reponse enrichie : source, fiable, equilibre, solde_debut/fin, total_recettes, total_depenses, mouvements_internes, chiffre_affaires, depenses_reelles. Le releve N'EST PAS stocke sur disque (donnee sensible, traitement memoire). Front (index.html pcRenderReleve) : bandeau "Lecture exacte verifiee" + cases Recettes/Depenses/vir.internes/Sans facture.
- **DEVISES (demande fondateur)** : detection + conversion EUR. USD : Anthropic x4 + Supabase convertis au taux BCE (frankfurter.dev) de la date (colonnes devise_originale/montant_original/taux_conversion/converti). SIFA = EUR en fait (USD = juste le RIB). DZD : formation DENTOXCELLENCE 150000 DZD payee especes = ~977 EUR (taux open-er-api 153.58, BCE ne cote pas le dinar) -> doc 52 corrige (etait 276 EUR errone, scan image mal lu). Jasper = EUR (laisse).
- **DANGER scans image** : factures photo lues a l'aveugle = montant faux (276 au lieu de 977). 14/66 factures marquees `tags:['a_verifier']` (scan image / HTML sans vrai PDF / sans PDF) -> montant non fiable, jamais fondu dans le total. Principe : JADOMI prepare, l'expert-comptable certifie ; le rapprochement bancaire = verite de ce qui est paye.
- **Vision dossier comptable** (voir memoire project_dossier_comptable) : relevés par mois, perso/pro sur lignes orphelines (matchee=pro auto), QR photo facture (bonus), export 1 clic au comptable (factures+relevés+Madelin+SNIR/URSSAF). Scan mail = coeur ("topissime"). RESTE A FAIRE : boutons perso/pro + signalement perso, rangement par mois, export comptable, QR photo.

## Session 20 juin 2026 — Verification backfill + fix liasse fiscale + completion 0 EUR
- **RESULTAT BACKFILL (19 juin soir)** : 17 factures importees / 100 analysees, source `rescan_mail`. Rapport `/tmp/backfill-report.json`. Constat cle : TOUS les mails `has_pdf=true` de `mails_inbox` datent de mai/juin 2026 (117, dont 116 deja `compta_done`, 1 restant) -> le re-scan ne peut PAS retrouver les factures aout 2025->avril 2026 (elles viennent de l'ancien systeme `documents_compta`, jamais presentes comme mails). Re-scan donc termine.
- **BUG MAJEUR corrige — liasse fiscale comptee en charge** : doc `documents_compta` id **248 = CEPROX, 24574 EUR, type "autre"**, importe par le re-scan. Verifie via Claude sur le PDF : c'est une **liasse fiscale BNC (formulaire 2035-SD)** emise par le cabinet comptable CEPROX pour Me AMRANE (epouse du fondateur, activite juridique Roubaix), exercice 2025. Les 24574 EUR = RECETTES/CA, PAS une charge du cabinet dentaire. Reclasse `type_document='liasse_fiscale'` (montant conserve pour tracabilite, backup `backups/doc248-CEPROX-liasse-*.json`).
- **Exclusion code** (`api/compta/index.js`) : ajout `NON_CHARGE_TYPES = ['devis','liasse_fiscale','bilan','bilan_comptable']` -> remplace les 3 filtres `!== 'devis'` (loadDocsComptaEntries, /entries, /summary). `isNonComptable` renforce : detecte liasse fiscale / bilan / declaration de resultat / 2035-SD / 2031 / 2065 / 2050 / BNC. Garde-fou aussi dans le re-scan live (`api/brain/mail-copilot.js`) : prompt + type `liasse_fiscale`, guard `NON_CHARGE`. node -c OK, pm2 reload OK.
- **Completion factures 0 EUR** : re-extraction IA depuis PDF en bucket (script `scripts/_reextract_zero.js`, backup `backups/reextract-zero-*.json`). 4 corrigees : Apple 99 EUR, Hotel Pastel 312,86 EUR, PROTHEXPERT 2669,22 EUR, Verisure 89,48 EUR. **OVH + Free = pas de vrai PDF** (entete `<!doctype`, l'email ne contenait qu'un lien -> page HTML stockee) -> a recuperer manuellement depuis l'espace client.
- **POINT COMPTA REEL (apres fix)** : 71 docs comptes (1 exclu = CEPROX). **TOTAL CHARGES CABINET = 37615,61 EUR TTC** (etait 62189 avec la liasse). Mai 2026 retombe de 26368 a 1794,80 EUR. Restent 6 docs a 0 EUR (OVH/Free/Information Dentaire/SIFA/2x Verisure) + 6 sans PDF + 7 sans date.
- **POINTEUSE / rapprochement bancaire — OUTIL RENFORCE + 100% LOCAL (souverainete donnees)** : le fondateur charge ses releves PDF via la plateforme (bouton "Analyser mon releve bancaire PDF", onglet Comptabilite > Releve bancaire, index.html). Endpoint `POST /api/analyser-releve` (server.js ~7166).
  - **SECURITE / RGPD (demande explicite du fondateur 20 juin)** : un releve bancaire est une donnee hautement sensible (secret bancaire, donnees de l'epouse). Il ne doit JAMAIS partir chez un sous-traitant etranger (Anthropic USA). -> L'extraction des transactions se fait desormais EXCLUSIVEMENT par le modele LOCAL Ollama (`iaRouter.ollamaGenerate`, qwen3.6:35b-a3b sur 127.0.0.1:11434, serveur dedie OVH France). AUCUNE donnee bancaire ne sort du serveur. pdf-parse local pour le texte. En cas d'indispo Ollama -> 503 explicite (rien n'est envoye ailleurs en fallback). `lib/ia-router.js` : ajout support `options.num_ctx` (relevé long, sinon Ollama plafonne ~4096 tok). Backup `backups/ia-router.js.bak-*`.
  - **Qualite matching** : (1) transaction<->facture par SCORE (montant tolerance serree 2%/1 EUR + bonus date <=5j + fournisseur normalise sans accents) au lieu de l'ancien "premier doc a +/-10 EUR"; (2) exclut les docs NON_CHARGE (liasse/bilan/devis); (3) NOUVEAU sens inverse `factures_sans_prelevement` (factures de la periode du releve non retrouvees comme prelevement) + bloc d'affichage front. Lecture seule, ne persiste rien.
  - **Teste bout-en-bout en local** (scripts/_test_e2e_releve.js) : faux releve -> 6/6 transactions extraites (~33 s), smsmode 49 EUR correctement signale "SANS FACTURE", EDF/PROTHEXPERT/LK Immo/Apple rapproches. node -c OK (server.js + ia-router.js), pm2 reload OK. Backup `backups/server.js.bak-20260620_084239`.
  - NB souverainete : le RE-SCAN des factures fournisseurs (PDF) utilise encore Claude (mail-copilot.js + scripts/_backfill-compta.js) — moins sensible (docs commerciaux) mais a basculer en local aussi si le fondateur le souhaite (limite : qwen local = texte seul, pas de vision pour PDF scannes images). EN ATTENTE : le fondateur depose ses releves.
- **CHARGES RECURRENTES reconnues (demande fondateur 20 juin)** : LK Immo = SCI du fondateur, il EDITE lui-meme les factures de loyer (3000 EUR/mois) -> n'arrivent pas par mail. Pour que la pointeuse ne les signale pas en "facture manquante" : systeme de charges recurrentes. Stockees dans `documents_compta` (type `charge_recurrente`, source `recurrente`, date null, `tags`=mots-cles, total_ttc=montant attendu) -> AJOUTE a NON_CHARGE_TYPES (exclu des totaux de charges). CRUD : `GET/POST/DELETE /api/compta/charges-recurrentes` (api/compta/index.js). Dans `/api/analyser-releve` : si un debit ne matche aucune facture MAIS matche une charge recurrente (mot-cle dans libelle + montant a +/-5% si defini) -> statut `recurrent` (badge bleu "RÉCURRENT", PAS d'anomalie). Front : rendu badge + sous-libelle. Seed LK Immo 3000 EUR fait (id 249, scripts/_seed_recurrente_lkimmo.js). Teste (scripts/_test_recurrent.js) : LK Immo reconnu sans facture, 3500 EUR rejete (loyer anormal flague), smsmode reste anomalie. Le fondateur peut ajouter OVH/Free/assurances (endpoint POST, ou je les seed). node -c OK, pm2 reload OK.
- **UPLOAD MULTI-RELEVES (20 juin)** : le fondateur a janvier->mai, doit pouvoir charger PLUSIEURS fichiers. `pcComptaUploadReleve` passe en `multiple=true` ; nouvelle fonction `pcComptaAnalyseReleves(files)` boucle et analyse chaque PDF en local l'un apres l'autre (~30 s/releve), affichage par fichier (entete nom + periode) + compteur. `pcRenderReleve(data)` factorise le rendu (ajout case "Récurrents" dans la grille stats). Bouton renomme "Analyser mes relevés bancaires PDF" + mention multi-fichiers. index.html uniquement (servi du disque, pas de reload). JS valide (new Function).
- Scripts diagnostic ajoutes dans `scripts/` : `_point_compta.js`, `_point_final.js`, `_reste_rescan.js`, `_gros_montants.js`, `_chercher_bilans.js`, `_inspect_doc.js`, `_diag_pdf.js`, `_reextract_zero.js`, `_fix_doc248.js`.

## Session 19 juin 2026 (soir) — REFONTE COMPTABILITÉ cabinet (/dentiste = index.html)
Le fondateur signale : compta "vide / tout disparu". Diagnostic + refonte complète.
- **CAUSE RACINE données** : la compta du cabinet (factures, comptes mail) était étiquetée `societe_id` = **DENTALEVOLUTION** (c2e2b1a1) au lieu de **Precision Dentaire** (c8fe3f0f). RAPATRIÉ via UPDATE (script node + service role) : 3 comptes mail + 218 cabinet_brain_documents + 1 event + 10 262 mails_inbox -> Precision Dentaire. Backup réversible : `backups/societe-repatriation-*.json`.
- **DEUX SYSTÈMES COMPTA EN PARALLÈLE** (découverte clé) :
  - `documents_compta` (clé **user_id**, PAS societe_id) : 55 docs, **49 avec PDF** (bucket storage `documents-compta`), montants justes, bien catégorisés (août 2025 -> avril 2026). C'est le système FONCTIONNEL d'origine.
  - `cabinet_brain_documents` (clé societe_id) : 218 entrées auto-scan mai-juin 2026, **texte seul, montants souvent 0, sans PDF**.
  - -> `/api/compta/entries` + `/summary` UNIFIENT les 2 (dedupeEntries par date+montant+fournisseur, garde la version AVEC PDF). Filtre non-comptable (invitations/pubs/newsletters). Exclusion devis. Calcul HT (TTC-TVA ou /1.2). parseMontant récupère le montant du texte si dispo.
- **UI compta** (index.html) : onglet "Comptabilité" direct (plus d'accordéon "compta>compta"), hub en **cards** (Importer/Mes Factures/Relevé annuel/TVA/Relevé bancaire), Fournisseurs+Économies déplacés dans Achats. "Mes Factures" : lit `by_day`, **groupé par mois**, période défaut = Année. Fiche détail premium : **Ouvrir le PDF** (fetch /api/compta/document/:id/pdf), Valider, **Supprimer** (DELETE documents_compta OU reject cabinet_brain). 
- **BUG fix** : `window.jadomiMultiSocietes?.societeId` (jamais défini) remplacé par `.active?.id || localStorage('societe_active_id')` partout (faisait X-Societe-Id vide -> compta vide).
- **RE-SCAN factures FONCTIONNEL** : `POST /api/brain/mail/rescan-compta` (mail-copilot.js). Cible `has_pdf=true` (117 vrais PDF, pas le junk classé "facture"). Matche par **message_id** (le `mail_uid` stocké est un HASH, PAS un vrai UID IMAP -> fetch UID échoue). Télécharge PDF -> upload bucket -> extraction Claude (`type:document` base64 pdf) montant/date/fournisseur -> insert documents_compta. Marque `financial_type=compta_done` (anti-boucle). TESTÉ : EDF -> 333,04 € extrait du vrai PDF. Bouton "Re-scanner mes factures" (Importer) + boucle front multi-comptes. Backfill serveur lancé (script `scripts/_backfill-compta.js`, envoie rapport mail).
- **Litige smsmode** : facturé mai 2026 alors que résilié 08/01/2025 (confirmé par eux le 09/01). Mail de contestation **ENVOYÉ** depuis karim_bahmed@yahoo.fr -> facturation-client@smsmode.com (SMTP yahoo, mot de passe app déchiffré). RÈGLE rappelée : jamais envoyer sans OK explicite du fondateur (respecté).
- **PROCHAINE ÉTAPE demandée** : le fondateur enverra ses RIB -> "pointeuse" (rapprochement bancaire + détection factures manquantes).
- Fichiers : api/compta/index.js, api/brain/mail-copilot.js, index.html. Commits : 47c20f9, 87f41c9, 9236a0b, + fixes compta.

## Session 19 juin 2026 — Passeports patient multi-types + Coefficient masticatoire
Module dentiste (onglets jadomi-ia + ia-doc). 4 livrables demandes par le fondateur.
- **Archi passeports par type (fix)** : la page `public/documents/passeport-blanchiment.html`
  est en realite le passeport GENERIQUE type-aware. `tab-jadomi-ia.js` ouvrait la vraie page
  seulement pour blanchiment -> desormais pour TOUS les types (handoff localStorage). Libelles
  ajoutes pour implant/orthodontie/facettes/rehabilitation. `/p/:token` etait deja generique.
- **Passeport implantaire** : carte d'implant structuree (marque, systeme, reference, Ø, longueur,
  lot, torque, position FDI, pilier, date). Stockee dans `cas_cliniques.metadata.implants[]`
  (JSONB, AUCUNE migration — MCP Supabase non dispo cette session). Route `POST /api/cas-clinique/:id/implants`
  (recalcul/sanitize serveur, read-modify-write preservant public_token). Exposee au patient dans
  `/public/:token` (dispositif medical implantable = tracabilite, IRM, soins futurs). Editeur dans
  `tab-jadomi-ia.js` (setupImplants) + rendu carte dans la page passeport.
- **Passeport ODF** : resume orthodontie (appareil, phase, date debut, contention) dans
  `metadata.odf`. Route `POST /:id/odf`. Section dediee patient + mise en avant contention.
- **Coefficient masticatoire** : NOUVEAU. Module `public/admin/js/coefficient-masticatoire.js`
  (odontogramme FDI cliquable, barème OFFICIEL docudent.fr : maxillaire 2/1/4/3/3/5/5/2,
  mandibule 1/1/4/3/3/5/5/3 par quadrant = 25, total 100 ; regle de l'antagoniste : une dent ne
  compte que si elle ET son antagoniste sont fonctionnels ; option exclure dents de sagesse avec
  renormalisation). Recalcul SERVEUR dans `api/ia-doc` + route `POST /coefficient-masticatoire-pdf`
  (pdfkit). Carte + zone dans l'onglet ia-doc de `dentiste-pro.html`. Bouton "Inserer dans un
  certificat" (pre-remplit l'examen clinique — pipeline certificat existant intact).
- NB : le CERTIFICAT MEDICAL DESCRIPTIF existait deja (`api/ia-doc` POST /generate-certificat, pdfkit + photos).
- Verifie : node --check tous fichiers, new Function() scripts inline OK, pm2 reload OK, routes 401 sans auth, calcul teste (100% denture complete, 11,1% perte pour 1ere molaire absente, 0% edente total). Backups .bak-* horodates.
- Fichiers : api/cas-clinique/index.js, api/ia-doc/index.js, public/admin/js/tab-jadomi-ia.js,
  public/admin/js/coefficient-masticatoire.js (nouveau), public/documents/passeport-blanchiment.html, public/admin/dentiste-pro.html.

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
- [x] Audit RLS complet : 93 tables sans RLS identifiees + SQL correctif genere (Passe 90)
- [x] Armure RLS Guardian : event trigger auto-RLS + audit quotidien + endpoint admin (Passe 90)
- [ ] Executer sql/security/FIX_RLS_ALL_TABLES.sql dans Supabase (93 tables)
- [ ] Executer sql/security/ARMURE_RLS_GUARDIAN.sql dans Supabase (protection permanente)
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
- [x] Compta : rapprochement bancaire affiche DANS la fiche facture (25 juillet)
- [x] Compta : relier/delier a la main une facture a une ligne de releve (25 juillet)
- [x] Compta : une facture ne peut plus justifier deux prelevements (25 juillet)
- [x] Compta : propositions de factures au CENTIME PRES sur un prelevement orphelin (25 juillet)
- [x] Compta : les factures du scan mail entrent enfin dans le rapprochement (25 juillet)
- [x] Compta : etat « a verifier » en orange + confirmation par le praticien (25 juillet)
- [x] Compta : moteur de rapprochement multi-yeux + memoire des libelles (25 juillet)
- [x] Compta : file de validation « Pistes de rapprochement » (25 juillet)
- [ ] Compta : dernier trou justificatif Uber One 5,99 € (tout petits recus HTML sans numero)
- [ ] Compta : dedup RETROACTIVE des doublons en base (dry-run a valider, destructif)
- [ ] Pousser la branche feat/multi-societes proprement

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

## Résolus — Session 25 juillet (compta, rapprochement)
- ~~Depuis une facture, impossible de savoir si elle avait ete payee (le lien n'existait que dans le releve)~~ [CORRIGE — bloc « Rapprochement bancaire » dans la fiche facture]
- ~~Un rapprochement automatique faux ne pouvait pas etre corrige~~ [CORRIGE — lier a une autre ligne / delier, le lien manuel fait autorite]
- ~~Une meme facture pouvait etre accrochee a DEUX prelevements (dedup limitee au fichier en cours)~~ [CORRIGE — pre-passe tous mois dans `_comptaRematch`]
- ~~Une facture deliee a la main etait recollee au chargement suivant~~ [CORRIGE — `rapprochement_refuse`, survit meme a une re-analyse du mois]
- ~~Bouton « 📄 Voir » propose sur des factures sans fichier (404)~~ [CORRIGE — masque si `has_pdf` faux]
- ~~Les 213 factures captees par le scan mail (`cabinet_brain_documents`) etaient invisibles au rapprochement~~ [CORRIGE — les 2 tables fouillees dans les propositions]
- ~~Route `/suggestions` avalee par `/:docId` (200 au lieu de proposer)~~ [CORRIGE — routes litterales declarees avant les parametres]

## Résolus — Session 16 juillet (module certificat descriptif)
- ~~Certificat : l'IA analysait la radio elle-même (ratait une fracture, hallucinait)~~ [CORRIGE — le praticien saisit, l'IA reformule]
- ~~Radios/photos du certificat disparaissaient (stockées dans /tmp, effacées au reboot)~~ [CORRIGE — coffre Storage `ia-doc-media` + compression sharp]
- ~~Signer effaçait la radio du PDF (media_ids non réinjectés) et le snapshot des saisies (form → éditeur texte)~~ [CORRIGE]
- ~~Nom du praticien absent du certificat (obligatoire)~~ [CORRIGE — garde-fou serveur + praticien_nom]
- ~~Envoi patient : lien brut supabase.co « au porteur » (ni pro ni sûr)~~ [CORRIGE — jadomi.fr/d/<token> + garde-fou date de naissance]
- ~~PUT /cabinet : profession `chirurgien_dentiste` rejetée par la contrainte DB ; `telephone` écrit dans `email`~~ [CORRIGE]
- TODO non urgent : contrainte DB `dentiste_pro_cabinets_profession_type_check` à élargir (DDL) pour stocker les libellés fins directement (contourné par `config.profession_precise`).

## Bugs a corriger
- **CRITIQUE** : 93 tables sans RLS — SQL correctif pret, attente execution (Passe 90)
- Migration SQL 89 a verifier si executee proprement (agents_workflow)
- UI dashboard preferences fourmiliere pas encore cree (backend only)
- Push + SMS effectifs dans recasage auto du dispatcher (emet evenement mais pas encore les notifs reelles)
- ~~Module avocat : jurisprudence — fuite métadonnées brutes (Qpcother, matières en majuscules dans Faits/Points), fondement tronqué, tendances 0% partout, 2 boutons alerte, Bonjour Maître générique~~ [CORRIGE 5 juil — audit Fable 5, 5 bugs ; bug 3 accents = limitation source Judilibre, fondement verbatim]
- Module avocat jurisprudence : le champ `visa` (Fondement) reste sans accents car Judilibre le sert nu à la source (pas de correctif code — décision verbatim). Piste future non urgente : sourcer le fondement depuis le `summary` accentué quand il couvre le visa.
- 5 sites dupliques en BDD (garder a8ac57cc-90d2-4ca2-a16b-b288cc437620)
- Doublons produits dans Panier intelligent
- Schedulers GPO + Groupage loggent erreurs (normal tant que SQL pas execute)
- OVH necessite 3 cles dans .env (Karim doit les generer sur eu.api.ovh.com/createToken/)
- Test mobile iOS a verifier (autoplay video parfois bloque Safari)
- ~~FaceMatch upload 10% puis echoue~~ [CORRIGE Session 10 juin — streaming JSON]
- ~~FaceMatch serveur port 8001 pas persistant~~ [CORRIGE — PM2 facematch-implant]
- FaceMatch : tester scan end-to-end avec nouveau build TestFlight (build en cours 10 juin)
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

## Session 24 juin 2026 — Cadrage architecture JADOMI ON-PREMISE / IA locale / Mesh / Fédéré
> Doc complet : `docs/ARCHITECTURE-ONPREMISE-CABINET.md`. Mémoire : `project_jadomi_onpremise`.

**Vision (Karim) :** JADOMI tourne sur le matériel que le cabinet POSSÈDE DÉJÀ. Les cabinets équipés en imagerie 3D ont des **GPU RTX qui dorment** → JADOMI les exploite pour faire tourner l'IA EN LOCAL, gratuitement, **sans qu'aucune donnée patient ne quitte le cabinet** (RGPD/secret médical béton). Argument de vente : « JADOMI transforme le GPU que vous avez déjà payé en datacenter IA privé ».

**Cascade « ressource la plus proche capable »** (déjà active sur la compta) : GPU RTX cabinet (LAN) → serveur France JADOMI (qwen3.6) → Claude (cas durs).

**Déploiement PAR PALIERS (l'archi s'adapte, n'exige rien) :** 🟢 P0 = aucun matériel → cloud serveur France (LA MAJORITÉ, plancher, déjà construit) ; 🟡 P1 = 1 PC avec GPU → local gratuit (sweet spot, équipés) ; 🔵 P2 = full on-prem hyperviseur+multi-GPU+NAS (RARE = cabinet de Karim = VITRINE/pilote). L'on-premise est un palier PREMIUM, pas la v1.

**Infra réelle cabinet Karim (P2) :** Lenovo ThinkStation P3 Ultra (128 Go RAM, 2×4 To RAID, PAS de GPU, **HYPERVISEUR** : fait tourner Logosw + radio en VM) = hub orchestrateur + base + coffre. 4× workstations RTX = calcul IA. Synology NAS = sauvegarde 3-2-1 + Home Assistant. → JADOMI se livre comme **VM appliance** (OVA/qcow2/VHDX) importée sur l'hyperviseur. ⚠️ À confirmer : VRAM des RTX + type d'hyperviseur.

**JADOMI MESH (« VPN dans l'app ») :** chaque appareil JADOMI = nœud d'un mesh privé chiffré, communication INSTANTANÉE P2P (portable thin → RTX cabinet, 3 cabinets reliés, accès distant). Intégrer **WireGuard + headscale** (OSS, auto-hébergé), connexions SORTANTES only (rien exposé), contrôle d'accès centralisé. JAMAIS de crypto maison. Roadmap.

**RÉSEAU FÉDÉRÉ (horizon 2-3 ans) :** « 100 dentistes 100 RTX » NE veut PAS dire partager les GPU pour traiter du patient (= mur RGPD : la donnée doit être déchiffrée pour être lue → exposée sur la machine d'un tiers → INTERDIT). La bonne voie = **federated learning** : on envoie le MODÈLE vers les données (chaque cabinet entraîne chez lui sur sa RTX), seules les LEÇONS (poids, pas les données) remontent → modèle dentaire qui BAT le cloud sur le dentaire, sans qu'aucune donnée ne bouge. Effet réseau + moat. Partage GPU autorisé UNIQUEMENT intra-cabinets du même propriétaire OU tâches non-sensibles (Studio/pub).

**Honnêteté stratégique (exigée par Karim, « pas là pour recevoir des fleurs ») :** la techno IA-locale/edge n'est PAS nouvelle ; la valeur = application verticale dentaire + GPU déjà payé + packaging RGPD, que les concurrents (cloud/mono-poste) ne font pas. Stratégie produit solide, pas techno inédite.

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

### Corrections fin de session
- Scan Envoyes desactive du daemon 5min (crash Yahoo, fait dans bulk import)
- max_tokens Claude 1500 → 3000 pour eviter JSON tronque
- Auto-repair JSON tronque (ferme accolades/crochets manquants)
- Nginx timeout 600s ajoute pour /api/copilot/ et /api/brain/
- Fix "compromis" faux positif notaire → "compromis de vente"
- Fix greeting "salut retrouve mes mails" ne bloque plus
- Widget auth : auto-fetch societe_id via /api/societes au chargement
- Scan factures POST (pas SSE, nginx buffer) avec barre progression simulee

### Bugs connus a corriger
- Scan factures depuis le copilot peut faire crasher le serveur (memory)
  → Solution : le faire UNIQUEMENT via le cron 6h, pas en temps reel
- Le scanner compta index.html demande encore email/mdp manuellement
  → Brancher sur comptes_email_societe (identifiants deja sauvegardes)
- 392 restarts PM2 accumules → reset le compteur apres stabilisation
- tab-agenda.js:1371 renderSkeleton null → bug existant non lie au copilot

### Passe 87 debut (19 mai 2026) — Fourmiliere multi-agents + securite DeepSeek

- Fourmiliere complete : 7 fichiers lib/agents/ + shared-intelligence.js
- Dispatcher : 5 workflows (mail_received, rdv_cancelled, stock_alert, patient_request, user_command)
- Memory : memoire Supabase partagee entre agents, contexte enrichi system prompt
- Learning : corrections utilisateur → regles, propagation locale→globale a 95% confidence
- Agent-agenda : detection annulation, creneaux libres, optimisation planning journee
- Agent-patient : resume patient, pre-consultation, actions en attente
- Agent-stock : alertes rupture, meilleur prix, commande groupee par fournisseur
- Worker scan-factures : child_process separe pour eviter crash memoire serveur
- Migration SQL 89 : table agents_workflow + colonnes apprentissage brain_rules
  → A EXECUTER sur Supabase Dashboard (pas d'acces SQL direct dans cette session)

SECURITE CRITIQUE :
- trustLevel dans buildAgentContext : 'full' (Claude/Mistral RGPD) ou 'none' (DeepSeek)
- DeepSeek (serveurs chinois) recoit ZERO contexte cabinet — intent parsing pur
- Message anonymise avant envoi DeepSeek (noms, emails, tels, pathologies → placeholders)
- Reinjection des vrais noms APRES parsing, cote serveur JADOMI uniquement
- Mistral (Mistral AI Paris, conforme RGPD) → trustLevel 'full', contexte complet autorise

### Branchement copilot ↔ fourmiliere (19 mai 2026)

- Copilot intent 'patient' → dispatcher workflow patient_request (historique enrichi)
- Copilot intent 'urgence' → agent-agenda findReplacement (creneaux disponibles)
- Copilot intent 'stock' → agent-stock stockSummary (etat stock temps reel)
- Copilot intent 'agenda' → agent-agenda optimizeDay (analyse journee + suggestions)
- System prompt enrichi avec memoire partagee (buildAgentContext trustLevel=full)
- Daemon mail sync → emet mail_received sur le bus fourmiliere a chaque mail

### Bouton tournee infirmier (19 mai 2026)
- "Demarrer la tournee" depuis accueil → ouvre DIRECTEMENT la carte JADOMI
- Fetch visites du jour via /api/ide/planning/, tri par heure, startTourneeMode()
- Plus de redirection vers le planning — la carte s'ouvre immediatement

### Priorites suite Passe 87
1. EXECUTER migration SQL 89 sur Supabase Dashboard (BLOQUANT pour agents_workflow)
2. Copilot actions directes : creer RDV, annuler RDV (avec validation praticien)
3. Enrichir le message accueil : "3 factures triees, 2 mails urgents, 1 patient a annule"
4. Tester copilot sur mobile
5. Build Flutter Codemagic
6. Push jadomi (erreur 500 GitHub)
7. Commercial OVH HDS mercredi 21 mai

### Passe 88 (19 mai 2026) — Fourmiliere connectee + Module Avocat complet

**Fourmiliere multi-agents — Branchements :**
- Migration SQL 89 : table agents_workflow + colonnes learning (scope, agent_source, times_applied, disabled_at, etc.) sur cabinet_brain_rules
- Dispatcher branche sur bus mail_received : auto-dispatch mails interessants (factures, urgents, reponse attendue)
- Preferences fourmiliere par cabinet : 10 comportements configurables (auto/propose/off)
  annulation_detection, annulation_action, recasage, tri_factures, brouillon_reponse, alerte_stock, commande_stock, resume_pre_consultation, suivi_patients_perdus, optimisation_planning
- API GET/PUT /api/copilot/fourmiliere-prefs
- Recasage intelligent branche sur dentiste_pro_waitlist existante (scoring 0-100, urgence slots, claim atomique)
- _stepHandleCancelledRdv utilise agent-agenda.findReplacement (plus classifyIntent)
- _stepRecaserCreneau : mode propose (attente validation dentiste) ou auto (lance urgence_slot + notifs)
- Copilot ecoute bus copilot_notification + workflow_completed (notifications en attente consommees par /message et /dashboard-summary)
- Fix localhost:3001 → process.env.PORT dans copilot scan-factures
- Tables redondantes waitlist + recasage_proposals supprimees (doublons de dentiste_pro_*)

**App patient JADOMI Care — Routes manquantes :**
- Nouveau fichier api/dentiste-pro/patient-app.js (7 routes)
- GET /patient/appointments, /visites, /cases, /documents
- PATCH /patient/appointments/:id (annulation → declenche fourmiliere rdv_cancelled)
- PATCH /patient/profile, DELETE /patient/profile (RGPD anonymisation)
- POST /patient/confirm-visit
- Monte dans dentiste-pro/index.js

**Audit global JADOMI — Systemes deconnectes identifies :**
- Bus copilot_notification et workflow_completed etaient orphelins → branches
- Patient annulation via app ne declenchait pas le recasage → branche
- 5 modules orphelins identifies (Rush, BTP, Avocat, Groupage, Services) → conserves
- Routes /patient/* frontend appelaient des endpoints inexistants → crees

**Module Avocat complet (5 nouveaux fichiers) :**
- api/avocat/timetracking.js : chrono start/stop par dossier, entries manuelles, auto-calcul montant (taux_horaire x duree), summary facturables vs non
- api/avocat/workflow.js : pipeline 10 etapes (nouveau→en_cours→mise_en_etat→audience→delibere→jugement→appel→execution→clos→archive), transitions historisees, deadlines auto, delai d'appel 30j auto-calcule, vue pipeline groupee
- api/avocat/honoraires.js : generation note d'honoraires depuis le chrono (lignes honoraires + debours), TVA 20%, provision, mentions Art. 289 CGI, numerotation auto NH-YYYY-NNNN, statuts brouillon/envoyee/payee_partiel/payee/annulee/contentieux
- api/avocat/relances.js : detection impayes, 3 niveaux (J+30 courtois, J+60 ferme, J+90 mise en demeure Art. 174 decret 91-1197), auto-passage contentieux
- api/avocat/dashboard.js : CA mensuel avec evolution, honoraires factures vs encaisses, taux recouvrement, dossiers actifs par domaine, heures facturables/taux occupation, impayes, top clients, anciennete dossiers
- Migration SQL 93 : tables avocat_time_entries, avocat_dossier_transitions, avocat_honoraires, avocat_relances + enrichissement avocat_dossiers (etape, domaine, juridiction, numero_rg, dates audience/delibere/jugement/appel, taux_horaire_defaut, montants)
- Toutes les routes montees dans server.js sous /api/avocat/*

### Passe 88 suite (19 mai 2026 apres-midi) — Visio + Copilot + Compta + Code Teams

**Visio universelle JADOMI :**
- api/visio/index.js : 11 endpoints, WebRTC P2P natif, zero tiers
- Salle d'attente (guest attend que le pro demarre, polling 3s)
- Client externe : lien seul, entre son nom, zero inscription
- Transcription IA : Web Speech API fr-FR + Mistral resume + sauvegarde dossier
- Consentement RGPD obligatoire (modal des deux cotes)
- Bouton "Visio" dans dentiste-pro.html (agenda) + coffre.html (avocat)
- Migration SQL 94 : table visio_sessions + GRANTS + RLS
- Route publique /visio/:token (pas d'auth requise)

**Copilot refonte majeure :**
- Reponses directes sans IA pour 70% des cas (stock, agenda, urgence, stats, etc.)
- DeepSeek etendu anonymise pour TOUS les intents ambigus (deepseekParseGeneral)
- Cerveau dynamique : cache memoire 5 min par cabinet (contacts, produits, patients, fournisseurs, regles apprises)
- detectIntent enrichi par les vrais noms du cabinet (Dupont=comptable, GACD=stock)
- Prompt Mistral restructure (question, intent, donnees, exemples, garde-fous)
- Verification coherence post-reponse (keywords check, fallback safe)
- Upload fichier : POST /message-with-file (multer 25MB, Claude Vision analyse PDF/images)
- Bus copilot_notification : notifications fourmiliere dans les reponses

**Mails — Separation importants/pubs :**
- Tri en 3 categories : importants, autres, pubs&newsletters
- Fournisseurs mixtes (Doctor Strong, GACD) : facture=important, promo=pub
- KNOWN_NEWSLETTER_SENDERS : blacklist pure (CotizUp, Allomouton, Vistaprint...)
- MIXED_SENDERS : detection par mots-cles sujet (facture vs festival)
- Mails HTML affiches dans iframe sandbox (images, formatage preserves)
- body_html sauvegarde en cache metadata pour eviter re-fetch IMAP

**Compta universelle :**
- api/compta/index.js : 9 endpoints (entries, summary, validate, reject, manual, export CSV, send-comptable, preferences)
- Vue triee jour/mois/annee, KPIs (total HT/TTC/TVA, valides/en attente)
- Auto-categorisation par mots-cles fournisseur (10 categories cabinet dentaire)
- Onglet "Mes Factures" dans index.html (frontend complet)

**Pipeline matinal automatique :**
- 6h00 : daemon sync mails + dailyInvoiceScan
- Post-scan : auto-classification compta des nouvelles factures
- Rapport matinal stocke dans brain_events (morning_scan_report)
- Copilot dashboard-summary affiche le rapport au premier chargement

**Onboarding nouveau client :**
- POST /api/brain/mail/onboarding-scan : chaine complete en 1 appel
- Etape 1 : bulk import 6 derniers mois (dedup mail_uid)
- Etape 2 : scan factures worker (Mistral + Claude, checksum dedup)
- Etape 3 : auto-classification compta
- Endpoint /connect retourne suggest_import si premiere connexion

**Code Teams — Protocole multi-agents :**
- Skill .claude/skills/code-teams
- 5 phases : Architecte > Builders (worktree) > Reviewers > Integrateur > Deployeur
- tmux Agent Teams active dans settings projet
- MAX 5 builders paralleles, 10 fichiers par passe
- Instauree Passe 88, remplace Builder/Reviewer simple

**UI fourmiliere :**
- Panneau "Fourmiliere IA" dans organisation.html (Mon Cabinet)
- 10 toggles configurables : Auto (vert) / Proposer (bleu) / Desactive (rouge)
- API GET/PUT /api/copilot/fourmiliere-prefs

### Bugs connus apres Passe 88
- Migration SQL 89 a verifier si executee proprement (agents_workflow)
- Module avocat : backend complet, UI frontend a construire (chrono, kanban, honoraires)
- Push + SMS effectifs dans recasage auto du dispatcher (emet evenement mais pas encore les notifs reelles)
- Frontend onboarding : proposer le bulk import quand suggest_import=true
- Tester le copilot refactore en production (pm2 reload)
- Le copilot widget doit gerer l'upload fichier (drag-drop PDF dans le chat)

### Passe 89 (19 mai 2026 soir) — Videos pub HyperFrames + Code Teams Flutter + Fixes

**Videos publicitaires HyperFrames (4 videos):**
- Pub principale JADOMI 21s : jadomi.fr/assets/videos/pubs/jadomi-pub-premium.mp4
- Pub IDE Infirmiere 21s : jadomi.fr/assets/videos/pubs/jadomi-ide-pub.mp4
- Pub Prothesiste Labo 21s : jadomi.fr/assets/videos/pubs/jadomi-prothesiste-pub.mp4
- Video tournees IDE 40s : jadomi.fr/assets/videos/pubs/jadomi-tournees-ide.mp4
- Outils : HyperFrames (HTML→MP4), Vidu AI (12+ videos img2video), ElevenLabs (voix Nicolas FR), Kokoro TTS, GSAP, Gemini (composites)
- 5 iterations (v1→v5) : meme infirmiere, audio Vidu strippe, voix naturelle, musique ambient, PiP JADOMI, pas de mention controle
- Cout total Vidu : ~500 credits (off-peak turbo)

**Code Teams Flutter (5 builders paralleles):**
- Builder 1 : Splash screen anime JADOMI (logo dore, fade-in + scale, 2.5s navigation auto)
- Builder 2 : Navigation MapLibre (ETA, distance, FAB recentrer, marqueurs pulsants, route teal)
- Builder 3 : Tournee IDE (barre progression X/Y, timer, cards colorees, animations smooth)
- Builder 4 : Login premium (gradient, glow logo, stagger fade-in, error anime)
- Builder 5 : Home + Drawer (header premium, sections groupees Essentiel/Outils/Plus, "Bonjour Dr")
- 6 fichiers, +969 / -717 lignes, 0 erreurs flutter analyze
- Push GitHub (10 commits), Codemagic ios-testflight a declencher manuellement

**Fixes production:**
- Page IDE : 2 </script> dans strings JS (lignes 6343 et 6922) cassaient tout le JS apres
- Page organisation : doublon function esc() (ligne 2424 const + ligne 4751 function) crashait JS
- Page organisation : backdrop-filter blur mobile supprime (topbar, bottomnav, menu)
- Scan securite : endpoint POST /api/internal/security-report cree, JSON 00→0, RLS supabaseAdmin
- Scan securite : GET utilise mauvais endpoint → corrige vers /api/admin/security-reports?limit=1
- Tournee IDE : simulation GPS auto remplacee par vrai navigator.geolocation.watchPosition
- Installation ClamAV + rkhunter + fail2ban en cours

**Etat disque : 89% (11 Go libres) apres nettoyage backups + npm cache**

### Passe 90 (20 mai 2026) — Securite RLS urgente + Armure protection + Fix mobile organisation

**Contexte : alerte Supabase "rls_disabled_in_public" recue par email**

**Audit securite RLS complet :**
- 93 tables sans RLS identifiees sur 374 (critique — donnees patients, factures, wallets exposees)
- SQL correctif genere : sql/security/FIX_RLS_ALL_TABLES.sql (ALTER TABLE + GRANT + policies)
- Policies intelligentes : societe_id, user_id, lecture seule, admin only selon type de table

**Armure RLS Guardian (protection permanente) :**
- sql/security/ARMURE_RLS_GUARDIAN.sql : event trigger auto-RLS sur CREATE TABLE
- Fonctions jadomi_rls_audit() + jadomi_rls_vulnerabilities() pour scan quotidien
- Endpoint GET /api/admin/rls-audit (server.js)
- Script cron scripts/rls-guardian-check.js (7h03 quotidien, alerte email)

**Fix bug mobile organisation.html :**
- Probleme : .mob-menu-overlay{display:block!important} forcait overlay noir permanent
- Tout l'ecran assombri et fige sur mobile, seul Copilot visible (z-index 99990)
- Fix : classe .mob-menu-visible au lieu de !important, paddingTop mobile

**SQL en attente d'execution (besoin mot de passe BDD ou MCP Supabase)**

### Passe 91 (20 mai 2026 soir) — Session monstre : Templates + Stripe + OVH + Audit

SECURITE (full vert 22/22) :
- Nginx backups nettoyes, logrotate PM2, DocuSeal 127.0.0.1, 33 updates systeme

AUDIT LIENS (30+ corrections) :
- Booking fetch URLs, route /organisation, MR 9 metiers, ancres cassees
- BTP /expert/→/artisan/, boutons openOrgaPerso morts, vitrines vs dashboards

COPILOT AMELIORE :
- Mail perso vs pro (detection automatique ton)
- Modifier via chat garde le brouillon
- Demandes creatives (coeurs ASCII)
- Bouton mobile remonte (bottom:80px)

12 TEMPLATES CREES :
- 5 v1 metier : avocat, kine, BTP, beaute, immo
- 5 v2 Awwwards : dentiste (2253L dark/light), avocat (Cormorant), beaute (Vogue), immo (carrousel), BTP (industrial)
- Exploded view implant (scroll animation)
- 52 photos reelles dans dentiste v2

9 VIDEOS VIDU GENEREES :
- Walkthrough avocat, beaute, BTP, immo, kine, ortho, prothesiste + dentaire

MODULE CREATION SITES COMPLET :
- Stripe test mode (checkout + webhook + abonnements)
- OVH simulation (check domaine + provisioning + deploy)
- Onboarding : templates filtres par metier client + carousel
- Bugs fixes : collision ID step-2, 18 fautes orthographe, 4 sections CMS
- Table site_hebergements creee

===============================================================
# MODULE CREATION SITES INTERNET — REFERENCE COMPLETE
===============================================================

## Architecture pipeline (session 5 juin 2026)

### Flux complet post-paiement (1 seul appel API)
POST /api/studio/orchestrator/provision { site_id, domain, formule }
  1. Achat domaine OVH via panier API (~7-9EUR/an .fr)
  2. Attente zone DNS (polling 10s x 30 tentatives)
  3. Config DNS auto : A → VPS 141.94.10.182, MX (5 serveurs), SPF, DMARC, SRV autodiscover, CNAME autoconfig
  4. Generation site HTML (site-generator.js : template + sections + theme)
  5. Setup Nginx vhost + Let's Encrypt SSL auto (scripts/setup-client-domain.sh)
  6. Creation boites mail OVH MX Plan (1/3/5 selon formule)
  7. Email de bienvenue au client avec identifiants mail
  8. Statut → active, site live sur https://domaine-client.fr

### Formules tarifaires
- Classic 19EUR/mois (0EUR creation) : site + domaine + SSL + 1 boite mail + 2 modifs/mois
- Pro 39EUR/mois (149EUR creation) : + 3 boites mail + CMS complet + blog
- Expert 69EUR/mois (299EUR creation) : + 5 boites mail + CMS avance + A/B testing + multi-langue

### Fichiers backend (API)
- lib/ovh-client.js : client OVH API singleton partage (appKey, appSecret, consumerKey)
- api/studio/ovh-hosting.js : module principal, monte tous les sous-modules, auth middleware
- api/studio/ovh-domain.js : /check, /suggest, /purchase, /list (achat domaines)
- api/studio/ovh-dns.js : /setup, /records/:domain, /setup-dkim, /audit/:domain
- api/studio/ovh-mail.js : /create, /list/:domain, /reset-password, /delete, /redirect, /redirections/:domain
- api/studio/site-orchestrator.js : pipeline complet 8 etapes, async, retry-ssl, retry-mail
- api/studio/contact-form.js : formulaire contact public, honeypot, rate limit, email notif
- api/studio/stripe-checkout.js : Stripe checkout + webhook + abonnements
- api/studio/sites-jadomi/index.js : CRUD sites, themes, sections, upload, publier, rollback
- api/studio/cms/index.js : CMS dashboard, middleware forfait/quotas
- api/vitrines/chat.js : chatbot onboarding IA (23 professions, Claude Sonnet)
- api/vitrines/domains.js : suggestions domaines, check DNS, OVH live check
- api/vitrines/generate-section.js : generation contenu IA par metier
- services/site-generator.js : moteur HTML (template + sections + CSS theme + sitemap + robots.txt + GA)
- services/ia-assistant.js : suggestions texte/palette/photos (Claude + Pexels)
- scripts/setup-client-domain.sh : Nginx vhost + certbot SSL + headers securite

### Fichiers SQL
- sql/vitrines/33_passe33_modules_analysis.sql (4 tables)
- sql/vitrines/39_cms_formules.sql (7 tables : studio_forfaits, studio_abonnements, site_contenus, site_contenus_historique, site_photos, site_demandes_modif, site_analyses)
- sql/studio/42_sites_crees_jadomi.sql (sites_jadomi, sites_jadomi_sections, sites_jadomi_versions, suggestions_ia)
- sql/studio/43_themes_sites_tier.sql (themes_sites : 60 seeds classic/pro/expert)
- sql/studio/05_site_hebergements.sql (hebergement OVH, statut, domain, plan)
- sql/studio/06_site_contact_submissions.sql (soumissions formulaire contact + RLS + GRANT)

### Themes (68 themes premium)
- 20 par metier (dentiste, avocat, sante...), repartis Classic (4) / Pro (6) / Expert (10)
- Architecture : templates/themes/_base/template.html + CSS par theme
- Styles : Clean, Swiss, Nordic, Zen, Ocean Deep, Obsidian, Aurora, Versailles, Film Noir, Bauhaus, Glassmorphism, Wabi-Sabi...

### SEO integre (session 5 juin)
- Open Graph meta tags (og:title, og:description, og:image, og:url, og:type, og:locale)
- Twitter Cards (twitter:card, twitter:title, twitter:description, twitter:image)
- JSON-LD LocalBusiness schema (nom, description, telephone, adresse, email, url)
- Canonical URL, robots meta (index, follow)
- Favicon support (placeholder)
- robots.txt genere automatiquement
- sitemap.xml avec lastmod + changefreq + priority
- Google Analytics injectable (champ ga_tracking_id dans section SEO)

### Anti-spam email (session 5 juin)
- jadomi.fr : score 100/100 (SPF + DKIM 2 cles + DMARC + 5 MX)
- Domaines clients : DMARC auto dans le setup DNS
- DKIM activable via /api/studio/ovh/dns/setup-dkim
- Audit anti-spam par domaine : /api/studio/ovh/dns/audit/:domain
- Redirections email gratuites (direction@, compta@, rdv@ → Gmail perso)

### API OVH (cles production)
- Application : JADOMI Sites (56157972695d0137)
- Droits : full access (GET/POST/PUT/DELETE sur /*)
- Consumer Key : 9e386f8ceb79a599e47191a9ecf06a50
- Compte OVH : bk1405647-ovh (karim bahmed)
- Domaines existants : jadomi.fr, jadomi.be, facematch.dental
- Email Pro : pro2.mail.ovh.net (noreply@jadomi.fr, contact@jadomi.fr)
- VPS IP : 141.94.10.182

### Formulaire de contact (session 5 juin)
- Endpoint public : POST /api/sites/contact/submit (pas d'auth)
- Honeypot anti-bot (champ website invisible)
- Rate limit : 5 soumissions par IP par heure
- Sanitisation XSS (strip HTML tags)
- Stockage : table site_contact_submissions (avec RLS)
- Notification email automatique au proprietaire du site
- Frontend : formulaire integre dans template base

### TODO RESTANT POUR PRODUCTION
- [ ] Executer SQL 06_site_contact_submissions.sql dans Supabase
- [ ] Monter contact-form.js dans server.js (route /api/sites/contact)
- [ ] Tester pipeline E2E complet (achat domaine → site live)
- [ ] Configurer moyen de paiement OVH (CB) pour achats domaines auto
- [ ] Installer certbot sur VPS si pas deja fait (sudo apt install certbot python3-certbot-nginx)
- [ ] Ajouter WYSIWYG editor dans CMS Pro/Expert (Quill.js ou TipTap)
- [ ] Optimisation images : WebP auto via sharp (deja installe)
- [ ] CDN pour /sites-clients/ (Cloudflare ou R2)
- [ ] Dashboard admin : vue des provisioning en cours/echoues
- [ ] Retry automatique si DNS/mail/SSL echoue (state machine avec exponential backoff)
- [ ] Integration Google Search Console (soumettre sitemap auto)
- [ ] Widget RDV integrable (Doctolib embed ou Calendly)
- [ ] Module avis Google Business Profile (scrape + affichage)
- [ ] Multi-langue (traduction Claude, infrastructure DB existante)

INFRA :
- Agent briefing cree (.claude/agent-briefing.md) pour que les sous-agents aient le contexte JADOMI
- Briefing enregistre en memoire pour toutes les futures sessions

### Passe 92 (21 mai 2026) — Jadomi Legal Engine + Dashboard Avocat + Flutter + Copilot Headless

**Matin (11h-16h) — Passe 92a :**
- Dashboard Avocat initial : 4→8 onglets (+ Coffre-fort, Visio, Espace Client, Assistant IA)
- Copilot upload fichier + onboarding bulk import
- Images realistes Gemini exploded view implant (vis, pilier, couronne, coupe anatomique)
- App Flutter refonte : splash, navigation MapLibre, tournee IDE, login, home drawer
- Configuration IA (ex-Fourmiliere) dans Parametres Flutter
- Copilot Unifie + Claude Code Headless Sonnet + streaming SSE + fix 502/400

**Apres-midi (19h40) — Passe 92b :**
- Dashboard Avocat : chatbot IA juridique integre (prompts IRAC, citations colorees)
- Fix IDE planning : JOIN ide_patients pour noms/adresses
- Accents corriges, tabs scrollables mobile

**Soir (21h-22h) — Passe 92c : JADOMI LEGAL ENGINE (Code Teams 5 builders) :**

SQL (6 tables, RLS, GRANT, indexes) :
- avocat_pieces : documents rattaches aux dossiers (14 types, OCR, importance)
- avocat_analyses : analyses IA structurees (7 types, score confiance, JSON)
- avocat_timeline_events : chronologie auto (13 types evenements)
- avocat_contradictions : detection incoherences (6 types, gravite, actions)
- avocat_pieces_manquantes : pieces suggerees par l'IA
- avocat_audit_logs : tracabilite complete

Backend (15 endpoints, 2 fichiers) :
- api/avocat/legal-engine.js : upload pieces multer 25MB, extraction PDF, appel Claude structure
- api/avocat/analyses.js : timeline auto, contradictions, pieces manquantes, resume, audience

Dashboard UI refonte premium (1179→2028 lignes, 12 onglets) :
- Design Awwwards : gradient header SVG, multi-layer shadows, gold accents
- 8 onglets existants conserves intacts
- 4 nouveaux : Pieces (drag-drop), Timeline (frise verticale), Risques (score SVG), Audience (print)
- Garde-fou juridique permanent sur chaque onglet IA
- Badges confiance vert/orange/rouge

- Couronne zircone implant : image Gemini remplacee (vraie prothese, pas dent naturelle)
- server.js : 2 routes montees (Legal Engine + Analyses IA) + route /avocat/dashboard

**Fichiers crees/modifies :**
- sql/juridique/02_legal_engine.sql (266L)
- api/avocat/legal-engine.js (660L)
- api/avocat/analyses.js (468L)
- public/avocat/dashboard.html (2028L)
- server.js (+18L)
- public/assets/images/implant/couronne-zircone.png (remplacee)

### Bugs connus apres Passe 92
- Exploded view implant : couronne OK mais animation scroll a polir (non prioritaire)
- Visio dans dashboard avocat : placeholder, pas branchee sur vrai service (Jitsi/Daily.co)
- OCR images : marque qualite_ocr='faible', Claude Vision en phase 2
- Bucket Supabase Storage 'avocat-pieces' : a creer manuellement si pas existant

### Passe 93 (22 mai 2026) — Audit complet module Avocat

**Audit de relecture integrale du code Avocat (9 fichiers API + 1 dashboard HTML) :**

Etat actuel du module Avocat :
- 9 fichiers API backend (~3 812 lignes) : legal-engine.js(660L), analyses.js(468L), dashboard.js(387L), workflow.js(375L), timetracking.js(374L), honoraires.js(410L), relances.js(302L), coffre.js(483L), espace-client.js(353L)
- 1 dashboard HTML (~2 028 lignes) : public/avocat/dashboard.html — 12 onglets
- 2 pages secondaires : coffre.html, espace-client.html
- 2 fichiers SQL : 01_juridique_module.sql, 02_legal_engine.sql (6 tables Legal Engine)
- Total module : ~5 840 lignes

**6 bugs frontend/backend mismatch identifies :**
1. KPIs : frontend cherche ca_mois/taux_encaissement, API retourne ca_mois_courant/taux_recouvrement → KPIs affichent "--"
2. Entries chrono : frontend cherche amount/billable/start_time/dossier_reference, API retourne montant/facturable/started_at/relation joinee
3. toggleBillable envoie {billable:val}, API attend {facturable:val} → toggle ne marche pas
4. Pipeline : API retourne {pipeline:{},counts:{}} groupe par etape, frontend attend un tableau plat
5. Relances : frontend cherche data.relances, API retourne {pending:[...]}
6. Accents manquants dans textes HTML : "Chronometre", "Demarrer", "Selectionner", "etape", "Delibere", "securise", "Generer", "Visioconference" — violation regle orthographe

**Points forts confirmes :**
- Securite : AES-256-GCM coffre, double auth OTP, audit trail, timing-safe compare, path traversal check
- IA : Claude Sonnet analyse dossier JSON structure, score confiance, disclaimer juridique obligatoire
- Workflow : 10 etapes, auto-calcul delai appel 30j, deadlines
- Facturation : TVA 20% ou exo art. 261-4-1° CGI, NH-YYYY-XXXX, relances 3 niveaux

**Dette technique identifiee :**
- Middleware requireAvocat duplique 9 fois (meme code exact) → a factoriser
- Visio : placeholder non branche

### Passe 93 suite (22 mai 2026) — Mega-session Avocat complète

**22 commits, ~10 000 lignes, 17 modules Avocat en production.**

INTEGRATION PISTE / LEGIFRANCE / JUDILIBRE :
- OAuth2 PISTE connecte (piste-auth.js, legifrance.js, judilibre.js)
- 562 799 decisions Cour de cassation accessibles temps reel
- 30 672 articles Code du travail, 1 160 711 textes JORF
- 15 endpoints legal-data (codes, jurisprudence, JORF, recherche unifiee)
- API testee en production : token OK, recherches OK

IA JURIDIQUE RAG :
- legal-rag.js : enrichit les reponses IA avec sources reelles AVANT appel Claude
- ia-juridique.js : assistant IA qui cite les VRAIS articles, jamais de faux
- code-travail-base.js : 16 articles fondamentaux + 6 arrets de principe pre-charges
- Routeur multi-provider (legal-ia-router.js) : Ollama 0€ → DeepSeek 0.14€ → Mistral 0.25€ → Claude 3€
- 7 agents IA formes (agents-formation.js) + BOSS Claude superviseur

VEILLE JURIDIQUE + MEMOIRE :
- 3 formateurs IA (veilleur/indexeur/connecteur) cron 6h03 quotidien
- Ingestion massive : 436 decisions indexees, 35 themes couverts
- Memoire par dossier (legal_dossier_memory) + veille contextuelle
- Cout ingestion : 0.15$ pour 436 decisions (DeepSeek)

SIMULATEUR DROIT DU TRAVAIL PRO (1628 lignes) :
- 4 types contrat (CDI/CDD/interim/apprentissage)
- 12 motifs rupture avec consequences exactes
- 10 CCN formules exactes (Syntec, Metallurgie, Commerce gros, HCR, BTP×3, Banque, Pharmacie, Transport)
- 6 statuts (ouvrier → cadre dirigeant)
- Bareme Macron 30 paliers + TPE
- Regime fiscal complet (80 duodecies, CSG/CRDS, cotisations, 30% RC)

STRATEGIE DE DEPART (636 lignes) :
- 7 scenarios compares (demission → PSE) avec classement fiscal
- Optimiseur de montage (ventilation indemnite + non-concurrence + outplacement)

COPILOT AVOCAT (5 assistants, 600 lignes) :
- classify-attachment : auto-classement pieces par dossier (Mistral RGPD)
- draft-response : brouillons reponse 7 types (Mistral)
- detect-deadlines : extraction delais + alertes (Ollama 0€)
- summarize-mail : resume 5 lignes + faits + timeline (Mistral)
- draft-conclusions : squelette I/II/III (Claude)

ENQUETES INTERNES :
- enquete-transcription.js : Whisper verbatim (0.36$/h), croisement automatique Claude
- enquete-post-traitement.js : 80+ corrections juridiques dictionnaire + IA, identification interlocuteurs, export Word 3 formats
- Formation complete : 3 rapports recherche (theorique + pratique + tous types), guides entretiens (95 questions), 7 modeles documents

COPILOT LIVE (406 lignes) :
- Web Speech API temps reel (fr-FR, continuous)
- Detection live : dates, montants, noms, durees
- 20 pistes juridiques auto (licenciement, harcelement, discrimination...)
- Suggestions de questions (DeepSeek)
- Alertes urgentes (suicide → 3114, violence)
- Compte-rendu automatique fin de session (Mistral RGPD)
- Question rapide a l'IA pendant la consultation

MEMOIRE AGENTS 3 COUCHES :
- agent-memory.js : court terme (prompt caching) + moyen terme (sessions) + long terme (learnings)
- Boucle apprentissage : correction → stockage → validation → promotion en rule
- Tables : agent_learnings + agent_sessions

DASHBOARD V2 :
- Sidebar fixe (nuit) + header KPIs + contenu (creme)
- 17 sections (gestion + intelligence juridique + outils avances)
- Simulateur, Copilot Live, Enquetes integres
- Design Linear/Notion/Vercel, glassmorphism, Cormorant Garamond + Inter
- Route /avocat/dashboard → V2, /avocat/dashboard-v1 → ancien

TABLES SUPABASE CREEES (10 nouvelles) :
- legal_data_cache, legal_api_calls, legal_dossier_memory, legal_veille_log
- agent_learnings, agent_sessions
- enquete_transcriptions, enquete_croisements
- copilot_live_sessions
- + colonne veille_keywords sur avocat_dossiers

FIX :
- 6 bugs mismatch frontend/backend dashboard V1 corriges
- 70+ accents corriges
- JORF endpoint corrige (fond: JORF + UN_DES_MOTS)
- Modele Claude corrige (claude-sonnet-4-6 sans date)
- Disque nettoye : 70% → 54% (+15 Go recuperes)

FICHIERS CREES (25+) :
- lib/legal-providers/ : piste-auth.js, legifrance.js, judilibre.js, legal-rag.js, legal-ia-router.js, legal-formateurs.js, legal-ingestion.js, agents-formation.js, code-travail-base.js
- api/avocat/ : legal-data.js, veille-juridique.js, ia-juridique.js, copilot-avocat.js, simulateur-travail.js, strategie-depart.js, enquete-transcription.js, enquete-post-traitement.js, copilot-live.js
- public/avocat/dashboard-v2.html
- sql/ : 03_legal_data_cache.sql, 04_legal_memory_veille.sql, 01_agent_learnings.sql, EXECUTE_ALL_LEGAL.sql

CLES .env AJOUTEES :
- PISTE_API_KEY, PISTE_API_SECRET, PISTE_OAUTH_CLIENT_ID, PISTE_OAUTH_CLIENT_SECRET

### Passe 94-98 (23 mai 2026) — Bloomberg prud'homal complet

**8 modules crees, 40 endpoints, 5 tables SQL, +5 043 lignes :**

HOME PAGE INTELLIGENTE (/api/avocat/home) :
- GET /jurisprudence-semaine : Judilibre chambre sociale + analyse DeepSeek (cache 24h)
- GET /a-retenir : synthese IA hebdomadaire 5-7 bullet points
- GET /alertes : agregation deadlines + contradictions + pieces manquantes + veille
- GET /dossiers-prioritaires : top 5 tries par score urgence (audience/deadline/pieces/contradictions)
- GET /tendances : 6 themes prud'homaux, evolution % sur 90 jours
- Dashboard V2 : section Accueil refaite avec 5 blocs dynamiques

SCORING SOLIDITE DOSSIER (/api/avocat/scoring) :
- POST /calculer/:dossierId : 5 scores (preuves 30%, coherence 20%, risques 25%, strategie 25%)
- GET /scores/:dossierId + /scores-batch
- POST /recommandations/:dossierId : 3-5 actions IA pour ameliorer le dossier

GENERATION DOCUMENTAIRE (/api/avocat/documents) :
- 8 templates prudhomaux : requete CPH, conclusions, bordereau, mise en demeure, demande renvoi, courrier client, courrier confrere, note audience
- POST /generer : template + IA hybride (Mistral RGPD)
- POST /generer-ia/:dossierId : generation 100% Claude
- lib/legal-providers/templates-prudhomaux.js (8 templates HTML complets)

VISIO AVOCAT (/api/avocat/visio) :
- Jitsi Meet integration (gratuit, pas de cle API)
- POST /rooms : creation salle avec config Jitsi optimisee
- POST /rooms/:id/invite : lien client avec displayName
- GET /embed/:id : iframe integration
- Table avocat_visio_rooms

KNOWLEDGE GRAPH + MEMOIRE COLLECTIVE (/api/avocat/knowledge) :
- POST /graph/build/:dossierId : graphe noeuds/relations via DeepSeek
- POST /memoire/apprendre/:dossierId : analyse anonymisee dossiers clos
- GET /memoire/rechercher : recherche par domaine/contentieux/mots-cles
- GET /memoire/tendances : patterns strategies gagnantes
- Table avocat_memoire_collective (anonymisee obligatoirement)

MODE AUDIENCE MOBILE (/api/avocat/audience) :
- POST /preparer/:dossierId : fiche synthetique via Claude (points forts/faibles, jurisprudences, anticipation adverse)
- GET /checklist/:dossierId : 8 verifications pre-audience auto
- POST /notes/:dossierId : prise de notes pendant audience
- Optimise lecture mobile (texte court, listes)

SECRETAIRE JURIDIQUE (/api/avocat/secretaire) :
- 12 commandes rapides (requete, conclusions, bordereau, mise en demeure, renvoi, courrier client, confrere, substitution, transmission, RPVA, note audience, convocation)
- POST /executer : template ou Mistral selon commande
- POST /executer-batch : execution parallele multi-commandes
- POST /personnaliser : modification IA sur document existant

VERIFICATION ANTI-ERREURS (/api/avocat/verification) :
- POST /verifier/:documentId : 15 controles (RG, juridiction, noms, dates, coherence, IA optionnel)
- POST /verifier-dossier/:dossierId : audit global pre-audience (7 checks)
- POST /verifier-pieces/:dossierId : completude par type contentieux (licenciement/harcelement/heures supp/inaptitude)
- GET /rapport/:dossierId : rapport HTML complet

TABLES SUPABASE CREEES (5 nouvelles) :
- avocat_dossier_scores (scoring multi-criteres)
- avocat_home_cache (cache home page 24h)
- avocat_documents_generes (documents generes)
- avocat_visio_rooms (salles Jitsi)
- avocat_memoire_collective (enseignements anonymises)

AUSSI CETTE SESSION :
- Creation SASU JADOMI sur LegalPlace (12 activites NAF declarees)

### Passe 99 (23 mai 2026) — Frontend avocat complet + Visio native + Tracker email

VISIO NATIVE WebRTC (remplace Jitsi) :
- WebRTC P2P chiffre bout en bout, ZERO tiers externe, RGPD natif
- Signaling WebSocket /ws/visio (Node.js natif, pas de lib externe)
- Page /visio/:roomId avec camera, micro, partage ecran, audio seul
- STUN Google + TURN serveur configurable
- api/avocat/visio.js : 426 lignes, 7 endpoints

INVITATION EMAIL PREMIUM :
- Modal "Inviter par email" (nom client, email, date, heure, nom avocat)
- Email HTML premium depuis noreply@jadomi.fr (branding JADOMI dore)
- Fix bug : sendEmail→sendMail (le service exportait sendMail)
- Pixel tracker invisible (image 1x1 GIF base64, UUID unique)
- GET /track/:trackId (public, sans auth) → marque metadata.opened=true + opened_at
- GET /statut-invitation/:roomId → l'avocat voit si client a ouvert
- Badge "Email lu" (vert) / "Email envoye" (orange) dans liste consultations

FRONTEND DASHBOARD V2 (1177→1750 lignes, +573) :
- Modal Nouveau Client : 6 champs (nom, prenom, email, tel, entreprise, poste)
- Modal Nouveau Dossier : 13 champs (type contentieux, client dropdown, juridiction CPH, section, RG, CCN, employeur, anciennete, salaire, grade, stade procedural)
- Onglet Agenda : calendrier mensuel navigable, badges audiences (rouge) + echeances (orange), ajout evenement, types (audience/echeance/rdv/rappel)
- Simulateur V2 : 10 scenarios (licenciement cause reelle, eco, inaptitude, faute grave, harcelement, discrimination, rupture conventionnelle, prise acte, travail dissimule, requalification CDD), bareme Macron, jauges visuelles, optimisation fiscale, recherche decisions similaires
- API coffre.js : POST /clients et POST /dossiers avec validation
- Fix "Chargement..." infini → "Connectez-vous" si pas de token apres 2s

COMMITS :
- d084bd9 feat(visio): Tracker ouverture email + fix sendMail
- d222025 feat(avocat): Frontend complet — Nouveau client, Dossier, Agenda, Simulateur V2
- 016b7db feat(visio): Plateforme visio JADOMI native WebRTC P2P

A FAIRE (Passe 100+) :
- MOTEUR DOCUMENTAIRE INTELLIGENT : entetes contextuelles, conclusions, rappel des faits, courriers, assignations auto-generes depuis dossier vivant (18 modules decrits dans le master prompt)
- Dossier vivant : vue complete timeline + pieces + strategie + scoring connectes
- Questions intelligentes par type de contentieux (backend existe, pas de UI)
- Module enquetes internes complet (7 composants Sapin II)
- Simulateur pension alimentaire + prestation compensatoire
- Calculateur Dintilhac (prejudice corporel)
- Audit social automatise (checklist 200 points)
- Factoriser requireAvocat (duplique 25+ fois)
- Frontend Knowledge Graph (D3.js/Cytoscape)
- Frontend Secretaire (panel commandes rapides)
- Frontend Verification (bouton "verifier avant envoi")
- Mode audience temps reel
- Anti-hallucination (niveaux : verifie/probable/a verifier/non source)
- IoT : brancher Home Assistant + Hikvision
- OVH production : cles API
- Stripe production : test → live

### Passe 100 (23 mai 2026) — Restructuration architecture + Dossier Vivant + Moteur Strategique

SIDEBAR NETTOYEE (24 → 11 onglets) :
- Cabinet : Accueil, Dossiers, Clients, Agenda
- Finances : Honoraires, Relances, Chronometre
- Outils : Copilot IA, Recherche, Visio, Coffre, Entete cabinet, Memoire Cabinet
- Tout le reste vit dans le DOSSIER VIVANT (plein ecran quand on clique sur un dossier)

DOSSIER VIVANT (OS du dossier juridique) :
- Vue plein ecran avec 8 onglets contextualises sur le dossier
- Vue d'ensemble, Timeline, Pieces, Mails (filtre email client), Strategie, Documents, Honoraires, Agenda
- Header sticky : RG, section CPH, juridiction, score solidite
- Copilot IA contextualise sur le dossier actif
- 774 lignes ajoutees

MOTEUR DOCUMENTAIRE INTELLIGENT (api/avocat/documents.js — 1637 lignes) :
- 10 types documents : conclusions, requete CPH, courrier client/confrere, bordereau, convention honoraires, renvoi, note audience, mise en demeure, attestation
- Entete cabinet configurable (14 champs)
- Variables contextuelles par dossier
- Verification anti-erreur avant export
- Honoraires manuels (sans time entries)

COPILOT IA JURIDIQUE :
- 3 onglets : Chat IA / Boite mail IMAP / Analyser document
- Connexion IMAP (Gmail, Outlook, OVH Pro, Yahoo)
- Tri auto mails (client, juridiction, fournisseur, urgent)
- Brouillon IA, classer dans dossier

AGENDA MULTI-COULEUR :
- 8 types (audience=rouge, echeance=orange, rdv_client=bleu, confrere=violet, rappel=gris, delibere=rose, mediation=vert, expertise=cyan)
- 3 vues : mois/semaine/jour
- Creneaux en ligne pour clients

UI COMPLETES (5 nouveaux onglets) :
- Mode Juge (5 jauges SVG), Mode Adversaire, Mode Negociation
- Memoire Cabinet (preferences + apprentissage style)
- Questions IA (10 types × 8-10 questions)

TIMELINE INTERACTIVE :
- Alternee gauche/droite, badges colores, filtres, importance etoiles

HONORAIRES ENRICHIS :
- 4 KPIs, filtres, badges statuts, detail + email

Email client OBLIGATOIRE a la creation

COMMITS : f6a8770, 31618a4, 7b5ec38, 6e9589b, 2a03af4, d084bd9, d222025

Dashboard V2 : 4809 lignes (vs 1177 au debut de la session)

=== VISION PRODUIT CLE — MOTEUR INTELLIGENCE STRATEGIQUE ===

Decide le 23 mai 2026 avec le fondateur. C'est LA bombe JADOMI.
Voir memoire : project_moteur_strategique.md

CONCEPT : Chaque dossier = cas strategique exploitable.
Le dossier contient : contexte, preuves structurees, strategie, actions procedurales, issue finale, post-mortem, enseignements.

3 NIVEAUX :
1. Memoire privee cabinet (MVP) — apprend des dossiers clos du cabinet
2. Patterns anonymises + GPS multi-chemins (Phase 2)
3. Reseau Strategique JADOMI donnant-donnant (V2-V3)

6 COUCHES PAR DOSSIER :
1. Contexte enrichi (12 types contentieux, 6 statuts, 6 types employeur, CCN, secteur)
2. Preuves structurees (18 types, force probatoire, axe strategique, statut)
3. Strategie utilisee (principale/secondaires/abandonnee/adverse)
4. Actions procedurales (10 types, consequence strategique)
5. Issue finale (montants par axe, resultat detaille)
6. Post-mortem obligatoire (retour experience, enseignements, pattern extrait)

IMPORT DECISION dans le dossier :
- Jugement CPH, arret CA, protocole transactionnel
- Parse montants par chef de demande, motivation, articles

GPS STRATEGIQUE MULTI-CHEMINS :
- N chemins par dossier (harcelement, obligation securite, heures sup, negociation)
- Chaque chemin : solidite, preuves, risques, taux reussite cabinet, tendance reseau

ROADMAP :
- Phase 1 : tables + onglets Dossier Vivant (issue, post-mortem, import)
- Phase 2 : similarite, GPS, stats cabinet, scoring explicable
- Phase 3 : reseau anonymise, opt-in, patterns partages

A FAIRE PHASE 1 :
- Enrichir avocat_dossiers (+15 champs strategiques)
- Creer tables : avocat_strategies, avocat_issues, avocat_post_mortem, avocat_patterns
- Onglets Dossier Vivant : Issue finale, Post-mortem, Import decision, Dossiers similaires
- Backend API moteur strategique

## Session Formation 24 mai 2026 — Slides IA + Image cabinet

### Formation dentisterie numerique (27 juin 2026)
Fichier : public/formation/index.html (97 slides Reveal.js)
Commits ce jour : 3 (session + chronologies + slide IA)

### Slide 10 — "L'IA change la donne" (REFAITE)
- Titre : "En 2026, l'IA ne comble plus les trous. Elle ameliore l'empreinte."
- Col. gauche : 5 fonctions IA (detection caries, filtrage soft tissue,
  limites prep auto -32% remakes, design couronne 4x plus rapide, heatmap guidage)
- Col. droite : 5 marques comparees (TRIOS 6 25K, Primescan 2 20K,
  Medit i900 10K, Panda Smart 8K, iTero Lumina 22K) — meme IA partout
- Punchline : "Ce n'est plus la camera. C'est l'IA derriere."
- Source principale : Roth et al. 2025, Journal of Dentistry (120 scans TRIOS 5)
- Notes orales completes avec pauses et montee dramatique

### Slide 11 — "Le numerique c'est aussi l'image du cabinet"
- Etude Dodi 2025, Dentistry Journal (597 patients) :
  91.9% preferent numerique, 77.6% paient plus cher
- 4 freins + reponses sourcees (budget/prothesiste/age/silicone)
- France 25-30% vs Nordiques 60-70%

### Images ajoutees (PMC open access)
- ai-mesh-before-after.jpg (point clouds 5-20% manquant)
- ai-mesh-overlay.jpg (reconstruction deep learning)
- scan-deviation-colormap.jpg, scan-superimposition.jpg, scan-clean-colormap.jpg

## Session 25 mai 2026 — JADOMI Code + Formation

### JADOMI Code (systeme multi-agents autonome)
- Interface web : jadomi.fr/code/ (auth Supabase + MFA TOTP)
- Chat streaming SSE, multi-agents grille, vocal, drag&drop fichiers
- Boss daemon 24/7 (tmux) : queue taches, auto-retry, review IA haiku
- 10 teams qualifiees (dev, secu, legal, finance, ops, marketing, support, formation, product, all)
- Brain compresse 604 tokens, file index 1009 fichiers, vector store 2632 chunks pgvector
- Context router ~1500 tokens/worker, session memory, memoire collective
- Hooks auto-review, cron scheduler (audit lundi, health daily, KPIs vendredi)
- Dashboard analytics : jadomi.fr/code/dashboard.html
- API: admin-copilot (stream/upload), boss (queue/approve/reject), formation-editor
- Passe par abonnement Max 20x uniquement (pas API payante)

### Formation dentisterie numerique (104 slides)
- Restructuration complete : cas cliniques en climax
- Slide video cordon cinema plein ecran (auto-play)
- Stats France corrigees : ~40% (UFSBD/Comident 2023), Nordiques >60%
- Prix Panda corrige : a partir de 9990 euros
- Slide IA "critere de choix" deplacee apres section cameras (#19)
- Section "Ere de la donnee" : titre + 3 etudes sourcees (Cantu, Krois, Mangano) + 3 niveaux IA
- Slide #12 refaite : triangulation vs confocal (HTML, style Zendo)
- 4 slides Smile Cloud ajoutees (intro, photos, videos cote a cote, confrontation IA vs reel, conclusion)
- Theme Zendo CSS global (fond noir, cards glassmorphism violet degrade)
- Editeur formation API (slides, upload images)
- Launca supprimee (pas connue)

Derniere mise a jour : 25 mai 2026 (Session JADOMI Code + Formation)

## Session 26 mai 2026 — Avocat : Client/Dossier + Plaidoirie IA + Dashboard intelligent

### Bug fix creation client/dossier
- ALTER TABLE avocat_clients : ajout civilite, adresse, type_client, raison_sociale, siret, forme_juridique, representant_nom, representant_prenom
- ALTER TABLE avocat_dossiers : ajout notes
- Support client societe (toggle personne physique / societe dans le modal)
- Fix mapping type_contentieux frontend → backend (coffre.js)
- GET /api/avocat/coffre/clients retourne maintenant tous les champs societe

### Orchestrateur Plaidoirie IA (nouveau : api/avocat/plaidoirie.js — 471 lignes)
- POST /api/avocat/plaidoirie/prepare — endpoint unique qui orchestre :
  1. Chargement dossier + pieces + client
  2. Analyse timeline + contradictions + pieces manquantes
  3. Chargement trame custom (si selectionnee) ou template par defaut
  4. Generation conclusions IA via Claude (faits, discussion avec fondements juridiques, par ces motifs)
  5. Score juge automatique (0-100) + ameliorations suggerees
- Onglet "Plaidoirie IA" dans le Dossier Vivant (dashboard-v2.html)
- Boutons Copier + Imprimer
- Teste : score 85/100, 4 arguments, pieces citees par numero
- Timeout Express exempte pour /api/avocat/plaidoirie et /api/avocat/copilot

### Dashboard Dossiers intelligent
- Signal IA sur chaque dossier : conseil contextuel selon etape + date audience
  (ex: "Audience dans 5j — Verifiez vos conclusions et pieces")
- Grouper par : client / etape / type contentieux (en-tete visuel + compteur)
- Colonne "Signal IA" dans la vue tableau (remplace "Taux h.")
- Client affiche en gras dans chaque card dossier

### Fichiers modifies (4)
- api/avocat/coffre.js (28 lignes)
- api/avocat/plaidoirie.js (471 lignes, nouveau)
- public/avocat/dashboard-v2.html (+2500 lignes)
- server.js (6 lignes)

## Session 27 mai 2026 — Formation : montage video pro chemin de scan

### Montage video complet (montage-scan-complet.mp4 — 29 MB, 3m32)
- 5 segments ffmpeg : maxillaire (99s), mandibule (67s), occlusion (22s), verification (10s), correction IA (20s)
- Videos bouche filmees en PORTRAIT (Honor Porsche Design, rotate=90) → flou lateral style YouTube
- Fenetre PC en PiP bas droite (520x268) avec bordure cyan, apparait synchro au moment du scan
- Labels Playfair Display (titres) + Inter (corps) integres dans la video
- Musique orchestrale fond (mixkit, libre de droits) volume 18%, fondu entree/sortie
- Flash "Correction par IA" en dore 1 seconde au moment cle (3:00 sur video PC)

### Slide intro + video plein ecran
- Slide #23 : titre "Le chemin de scan" en Playfair Display, badge "Cas reel filme au cabinet"
- Slide #24 : video plein ecran autoplay (muted → unmute 150ms, contourne blocage navigateur)

### Corrections
- Panda Free → Panda Smart dans toute la presentation (17 occurrences)

### Timings valides par le fondateur
- Maxillaire : bouche 0:00-1:39 (prep 0-26s visible), PC 0:06-1:19 (apparait a 26s)
- Mandibule : bouche 0:00-1:07 (sechage 0-6s visible), PC 1:55-2:56 (apparait a 6s)
- Occlusion : bouche 0:00-0:22, PC 3:31-3:49 (apparait a 2s)
- Verification : PC 5:26-5:36 (10s)
- Correction IA : PC 2:50-3:10 (20s, inclut dedoublement 36/37 + correction + manipulation)

## Session 28 mai 2026 — Formation : tissus mous + labo prothesiste + technologies cameras

### Refonte section Gestion des Tissus (section 04)
- 6 slides narratives fideles au prompt fondateur (parcours personnel)
  1. Le numerique ne pardonne pas (+ 4 photos STL 3D : sang, gencive, coloration)
  2. Ma premiere erreur : le produit miracle (+ 3 photos STL pate mal eliminee)
  3. Le vrai tournant : biotype gingival (PTFE vs cordon + Ruggiero 2025)
  4. Stabiliser plutot qu'agresser (Astringedent + temporisation + BOPT)
  5. Cas clinique bridge maxillaire (comparatif 6 produits)
  6. Video montage complet (2min, musique orchestrale, titres incrustes)
- Video cordon gardee (slide cinema plein ecran)
- Montage ffmpeg v3 : extraits precis v1 (teflon 0:00-0:20, 3:02-3:10, 6:00-6:15, 7:00-7:13, 8:16-8:21)
  + v2 pate VOCO (0:15-0:40) + v3 rincage (0:03-0:17) + v4 scan (0:03-0:12)
  + photos PiP (bobine, limites plein ecran 4s, scan ecran)
  + son clinique coupe, musique orchestrale 18% seule
  + flou lateral pro sur videos portrait

### Section Vision du Laboratoire
- Slide titre ajoutee (style gradient bleu + dore #C9A84C)
- CAS 4 gencive : photos N&B remplacees par video couleur (47s)
- 2 nouvelles slides ajoutees :
  - Video rectification prothesiste (3min05, cinema plein ecran)
  - Punchline "Rectification = Supposition = Perte de precision"
- CAS 2 trous + CAS 6 difference : deja en video couleur (session precedente)

### Animation 3 technologies cameras
- 1 slide SVG animee remplace 3 slides texte separees
- Triangulation (#29B6F6) + Confocale (#C9A84C) + Stereophotogrammetrie (#2DC653)
- Animations SVG bouclables (faisceaux, plans focaux, nuage de points)

### Corrections slides
- Chronologies 1/2/3 : dots recalcules (max 129px), CSS cx-dot-desc absolu, SVG ajuste
- Slide #3 camera : video inline (fix flottement Reveal.js background)
- Slide #9 : titres gauche = titres droite (6 cards alignees)
- Shining 3D enleve de slide chemin de scan
- 7 slides redondantes supprimees (115 → 111 slides)
- Cas Reda deplace vers section Cas Cliniques (plus dans section IA)

### Infrastructure
- Upload limit : 500Mo → 2Go (multer + nginx)
- nginx : proxy_request_buffering off pour uploads rapides
- nginx : location /api/formation/upload-video avec timeout 900s
- Nettoyage disque : rushes scan supprimes (~750Mo liberes)

## Session 1er juin 2026 — Audit fonctionnel Dentiste + Prothesiste

### Audit Dashboard Dentiste Pro — 100% fonctionnel
- 18 onglets sidebar audites : accueil, dashboard, agenda, patients, cases,
  mon-labo, triangle, chat, reseau, batch, waitlist, rappels, equipe,
  connector, ia-doc, ia-config, stats, config — TOUS OK
- 29 routes API dentiste-pro testees — TOUTES repondent (200 ou 401 auth)
- 29 tables Supabase referencees — TOUTES existent
- 5 fichiers JS (copilot, tab-agenda, tab-cases, tab-triangle, tab-reseau) — OK
- 3 liens navigation (organisation, login, profil equipe) — OK

### Bug fixe : chat.js table inexistante
- api/dentiste-pro/chat.js:29 referencait `societes_membres` (table inexistante)
- Remplace par `user_societe_roles` (table existante et utilisee partout ailleurs)
- Le chat praticien-patient fonctionne maintenant correctement

### Audit Prothesiste / Labo — tout monte
- 30 pages frontend labo chargent (dashboard, stock, production, facturation,
  catalogue, expeditions, bons-livraison, suivi-livreurs, techniciens, livreur-app)
- 27 modules API montes (rush 7 routes, labo 6 modules, commandes)
- PWA livreur operationnelle

### Auth gate preservee
- Le fondateur avait mis un mot de passe pour garder le site prive
- Les vitrines metier restent protegees par l'auth gate (voulu)

### Session 2 juin 2026 — Formation Deficab + JADOMI IA Avocat enrichi

#### Formation Deficab HTML (private/formation/formation-complete-deficab.html)
- 1682 lignes, 18 sections orales completes, 68 diapos PDF cliquables
- 3 videos Whisper transcrites (~4h, 5649 segments)
- 11 notes de verification rouge (cross-check droit positif) + 9 notes orange (opinions Boudin)
- Boudin : 9/10 concordances avec le droit positif, tous les arrets verifies
- Protection par mot de passe (cookie deficab_auth, 30 jours)
- Fichier deplace dans private/formation/ (hors public/)
- Routes Express : GET /formation/formation-complete-deficab + POST /formation/deficab-auth

#### Simulateur indemnites enrichi (api/avocat/simulateur-indemnites.js — 1551 lignes)
- 5 endpoints : /simuler, /comparer, /bareme-ifc, /pass/:annee, /indemnite-legale
- Methode Boudin 4 etapes complete
- 9 ameliorations : bug RC retraite corrige, faute grave + preavis, IT execution separee,
  arret 2025, AT/MP, net imposable ameliore, alertes Boudin, references JP

#### JADOMI IA Formation Deficab (api/avocat/formation-deficab-ia.js)
- Endpoint : /api/avocat/formation-deficab-ia/message (POST, streaming SSE)
- Modele : Claude Sonnet 4.6 (bon rapport qualite/prix)
- Knowledge base : data/formation-deficab-knowledge.js (757 lignes, 25 691 chars)
  - 13 sections : methode 4 etapes, 15 cas specifiques, bareme IFC, differe chomage
  - 8 opinions Boudin signalees, 8 arrets verifies, 12 exemples few-shot
- RAG Legifrance + Judilibre integre
- Auth : cookie deficab_auth (pas de Bearer token)
- Widget chatbot integre dans la page formation (bouton flottant, streaming temps reel)
- Rate limiting : 20 msg/min + 50 msg/jour par IP
- 3 niveaux de filtrage GRATUIT avant appel IA :
  1. Bavardage (salut, merci, bye) → reponse polie, 0 euro
  2. Hors sujet (meteo, recettes) → recadrage + suggestions juridiques, 0 euro
  3. Juridique → Claude Sonnet avec knowledge Boudin + RAG, ~0.04 euro
- Cout estime : 1-6 euros/avocat/mois selon usage

#### IA Juridique principale enrichie (api/avocat/ia-juridique.js)
- Modele corrige : claude-sonnet-4-6 (au lieu de claude-sonnet-4-6-20250514)
- Injection automatique knowledge Boudin quand question sur indemnites de rupture
- Routage intelligent : Mistral pour questions simples, Claude Sonnet OBLIGATOIRE
  pour tout ce qui touche aux indemnites/rupture/fiscal (regex de detection)
- Mistral reste pour : definitions, articles, prescriptions (~0.01 euro)
- Claude Sonnet pour : analyses, indemnites, montages (~0.04 euro)

#### Commits session 2 juin 2026
- 757ace7 feat(formation): V2+V3 transcrites et injectees
- dc16170 feat(formation): refonte COMPLETE du contenu oral
- 823529a feat(formation): notes de verification juridique
- b2a343b feat(avocat): enrichir simulateur indemnites — 9 ameliorations
- e303618 feat(formation): protection par mot de passe
- 19cabae feat(avocat): JADOMI IA Formation Deficab — chatbot expert
- a226361 feat(avocat): knowledge base Boudin enrichi — 757 lignes

Derniere mise a jour : 2 juin 2026 (Session Formation Deficab + JADOMI IA Avocat)

## Session 4 juin 2026 — Refonte scan FaceMatch + auth gate Qonto + disque

### Refonte complete scan LiDAR FaceMatch (5 commits)
Diagnostic : l'approche ARKit sceneReconstruction (.mesh) est concue pour
scanner des PIECES, pas des visages. Mesh trop low-res, bloque a 3-8%.

**Nouvelle approche : point cloud direct depuis depth map LiDAR**
- Desactive sceneReconstruction, active sceneDepth uniquement
- Extraction directe du depth map (256x192 @ 60Hz, 49K mesures/frame)
- Deprojection pixels depth → points 3D world space via camera intrinsics
- Grille 3D 1.5mm deduplication multi-frames
- Triangulation organisee (2x2 quad → 2 triangles, edge filter 10mm)
- Couleurs RGB projetees depuis camera (cache a 2Hz)
- Normales calculees depuis faces du mesh

**Mode 2 passes (comme Qlone Dental)**
- Passe 1 : scan tete complete 360° (30-40cm), 50K points cible
- Passe 2 : zoom sourire (8-25cm) pour detail dents 2x plus precis
- Bouton "Sourire" → "Terminer" (ou "Passer" si pas besoin)
- Les 2 passes fusionnent dans la meme grille 3D

**UI mise a jour**
- Passe 1 : chips "Tete" + "360°" vert, gros % progress
- Passe 2 : chips "Zoom dents" jaune, compteur points
- Bouton capture adapte par passe (vert/jaune)
- Plus d'auto-capture : l'utilisateur decide quand c'est bon

**Fichiers modifies (repo karimstock/facematch-ios)**
- FaceMatch/Capture/FaceScanSession.swift (reecrit ~750 lignes)
- FaceMatch/Capture/FaceScanARView.swift (simplifie, plus de mesh overlay)
- FaceMatch/Views/ScanView.swift (UI 2 passes)
- CFBundleVersion bumpe a 11

### Auth gate jadomi.fr desactivee temporairement
- Qonto demande a voir le site pour validation du compte pro JADOMI SAS
- Auth gate commentee dans server.js (middleware verrou)
- Backup horodate cree avant modification
- A REACTIVER des que Qonto valide

### Nettoyage disque VPS (97G/97G → 78G/97G)
- Disque 100% plein detecte (14 Mo libres)
- 4 backups daily supprimes (~11.6G liberes)
- 1 backup weekly supprime (~2.9G libere)
- Logs PM2 tronques
- Backup le plus recent (4 juin) conserve
- data/gudid/extracted/ (16G XML) non touche (fondateur refuse)

### Ouverture compte Qonto
- Societe JADOMI SAS — ENF Active, forfait Smart 289€/an HT
- Depot capital en cours, certificat sous 12h apres validation
- Reponse a Qonto redigee : JADOMI = SaaS, pas marketplace

Derniere mise a jour : 4 juin 2026 (Session FaceMatch + Qonto + disque)

## Session 7 juin 2026 — Nouveau serveur RISE-M + Reveil de Qwen

### Migration OVH RISE-M validee (jadomi-srv, IP 217.182.132.136)
- Ryzen 9 9900X 16c/32t, 64 Go DDR5, 467 Go RAID NVMe (18% utilise)
- DNS jadomi.fr + jadomi.be bascules, HTTPS 200, PM2 stable, 11 crontabs migres
- Double-run 7 jours jusqu'au ~14 juin, puis couper ancien VPS 141.94.10.182
- ATTENTION : le .git de /home/ubuntu/jadomi n'a PAS ete migre — recuperer
  l'historique git depuis l'ancien VPS AVANT de le couper
- A FAIRE : verifier SMTP/SPF avec la nouvelle IP

### Securite durcie (le serveur etait sorti de migration SANS firewall)
- UFW active : deny par defaut, seuls 22/80/443 ouverts
- fail2ban installe + actif (jail sshd)
- OSRM Docker rebinde 127.0.0.1:5000 (Docker contourne UFW — recree avec
  -p 127.0.0.1:5000:5000, memes params, routing teste OK)
- Ollama deja en 127.0.0.1 only, SSH cles uniquement

### Nouveau cerveau IA local : qwen3.6:35b-a3b (MoE)
- Benchmarks CPU reels : qwen3.6:35b-a3b = 20,9 tok/s (35B total, 3B actifs/token)
  vs qwen2.5:32b dense = 3,1 tok/s (teste puis supprime) vs llama3.1:8b = 12,6 tok/s
- Lecon : sur CPU le goulot = bande passante DDR5 → MoE obligatoire
- PIEGE : qwen3.6 est un modele "thinking" → think:false OBLIGATOIRE dans
  l'appel API sinon il raisonne 2000+ tokens avant de repondre (2 min vs 5 s)
- DeepSeek API : ON GARDE tant qu'il y a du credit (43,64 $ verifie), toujours
  bride par Data Guard. Quand epuise → basculer local, NE PAS recharger

### Reveil de Qwen — le niveau Ollama etait MORT depuis la migration
- DECOUVERTE : ia-router.js et legal-ia-router.js pointaient sur qwen2.5:14b,
  analyzer.js sur mistral:7b — modeles PAS installes sur le nouveau serveur
- Chaque appel Ollama echouait ("model not found") → fuite vers Mistral/Claude payants
- 3 fichiers corriges (backups dans backups/reveil-qwen-20260607/) :
  1. lib/ia-router.js : OLLAMA_MODEL=qwen3.6:35b-a3b, FAST=llama3.1:8b,
     ollamaGenerate enrichi (think:false, options.system, options.json=schema
     JSON impose via format Ollama, timeout 120s), OLLAMA_SCHEMAS ajoutes,
     OLLAMA_TASKS reecrites avec few-shot + schemas (normalizeProduct,
     extractStructured, classifyProduct, matchProducts, generatePatientMessage
     avec JADOMI_BASE_PROMPT en system)
  2. lib/legal-providers/legal-ia-router.js : meme modele + think:false + timeout 120s
  3. lib/scrape-ia/analyzer.js : meme modele + think:false (API /api/chat)
- Tests reels valides : normalisation produit JSON parfait, "la seize" dicte
  → dent 16 FDI, gutta-percha → endodontie en 1,2 s, SMS patient vouvoiement
  parfait, cross-match Septanest 2 fournisseurs → 100/100
- pm2 reload jadomi OK, site 200
- Reviewer agent passe derriere (methode Builder/Reviewer)

### Prochaines etapes Qwen warrior (plan valide fondateur)
- Phase 2 : RAG avec nomic-embed-text (deja installe) sur les 225K produits,
  CCAM, jurisprudence — pgvector Supabase
- Phase 3 : outils (lookup Supabase, calculs exacts)
- Phase 4 : fine-tuning LoRA "Qwen-JADOMI" — dataset genere par Claude depuis
  les vraies taches, GPU loue quelques heures

PAS DE COMMIT GIT : le depot .git n'existe plus sur ce serveur (voir ci-dessus)

### Suite de soiree (apres coupure SSH) — RAG + Moteur cross-matching

**Phase 2 Qwen : RAG 100% local DEPLOYE**
- Decision : stockage vectoriel LOCAL (SQLite + sqlite-vec v0.1.9) au lieu de
  pgvector Supabase — pas d'acces DDL cette session (MCP OAuth perdu avec
  .claude.json) ET de toute facon meilleur : recherche sub-ms, zero reseau,
  souverainete totale Roubaix
- npm install better-sqlite3 sqlite-vec (PIEGE sqlite-vec : rowid exige un
  BigInt, sinon "Only integers are allowed")
- Nouveau module lib/rag/ : embedder.js (nomic-embed-text, prefixes
  search_document:/search_query: obligatoires), store.js (SQLite WAL,
  data/rag/products.db), index.js (searchProducts, buildContext, status)
- scripts/rag-index-products.js : indexe scraped_prices (238 329 produits,
  pas 225K !) via REST keyset pagination, resumable (meta.last_sb_id),
  105 embeds/s → ~40 min
- ia-router : OLLAMA_TASKS.searchCatalog + answerCatalog (RAG + Qwen repond
  avec les vraies donnees — teste : compare les prix, calcule le prix unitaire
  des boites, zero invention)
- Endpoint public GET /api/comparateur/semantic?q= (recherche langage naturel,
  "NiTi mandibule" trouve les arcs nickel-titane inferieurs) — DEPLOYE, site 200

**Moteur cross-matching produits (scripts/match-products.js) — LE chantier
"1 produit = N revendeurs" reclame par le fondateur**
- DECOUVERTE : les colonnes matched_product_id, matched_gtin, match_confidence,
  manufacturer_ref existent dans scraped_prices depuis le debut — TOUTES NULL.
  Chaque fournisseur a sa ref interne (GACD=SAP 18 chiffres, doctorstrong=slug,
  dentalree=V-856/014C) → aucun croisement possible par ref
- Pipeline : candidats par embeddings (KNN, dist<0.32) → signature variants
  (nombres, teintes, tailles) → comparaison des MOTS → zone grise → verdict Qwen
  (cache match_verdicts, jamais re-juge) → union-find → PATCH Supabase groupe
- CALIBRATION CRITIQUE (3 iterations, verification VISUELLE a chaque fois) :
  1. Distance seule = piege : "Olive n°21" vs "n°23" d=0.230 (proches mais
     produits differents) → tokens numeriques differents = rejet auto
  2. Nombres egaux ne suffisent PAS : "Gradia 2.7ml CV" vs "BW" = teintes
     differentes → tout mot different en code court (CV, BW, LG, UG) ou
     couleur = rejet auto
  3. AVEC/SANS retires des stopwords ("Avec Torque" ≠ "Sans Torque")
- Resultat echantillon 3000 produits : 760 groupes multi-fournisseurs propres
  (ex: IPS E-Max Ceram NO3 a 189,16€ chez doctorstrong+doctorai+megadental)
- /api/comparateur/search groupe maintenant par matched_product_id en priorite
- Matching complet lance en arriere-plan apres fin d'indexation

**Tournee livreur : TESTABLE SUR IPHONE (zero code touche)**
- Le diagnostic agent annoncait un bug de routage 401 — FAUX, verifie moi-meme :
  la route /api/labo/tournees/app/tournee marche, 401 = token invalide normal
- Vrai blocage : aucune tournee du jour en base. Cree tournee test (Antoine
  LEROY, Labo Prothese du Nord) + 4 demandes de passage + 4 arrets
  Lille/Roubaix via REST
- PIEGES constraints : creneau='matin' (pas 'journee'), navigation_app
  n'accepte PAS 'jadomi' (constraint a corriger — regle fondateur carte JADOMI
  par defaut !), type_passage='recuperation' (pas 'collecte'), demande_id NOT NULL
- Lien test envoye au fondateur : /labo/livreur-app?token=95796182...

**Diagnostics Passe FONCTIONNEL (3 agents, lecture seule) — fixes EN ATTENTE
de validation fondateur, fichier par fichier**
1. Invitation assistantes (api/dentiste-pro/team.js) : construit a 99% MAIS
   (a) email d'invitation avale les erreurs en silence (ligne ~657),
   (b) CRITIQUE : accept-invitation ne cree PAS la ligne user_societe_roles
   → l'assistante ne peut pas acceder au dashboard apres creation de compte,
   (c) header X-Societe-Id a verifier dans apiFetch de dentiste-pro.html
2. Tournees IDE : admin n'a pas de cabinet IDE → 404 sur toutes les API IDE.
   Geoloc iOS : timeout 5s trop court, toast erreur invisible
3. FaceMatch : le serveur est PRET et n'a JAMAIS recu un seul upload (dossier
   uploads vide, logs vides). Le code iOS est dans le repo GitHub
   karimstock/facematch-ios (PAS sur le serveur), refonte 4 juin (point cloud
   depth map, build 11). Symptome "detecte visage puis rien" = regression
   probable dans FaceScanSession.swift apres la refonte. Demander au fondateur :
   TestFlight ou Xcode direct ?

**Recuperation .git ancien VPS** : cle ed25519 generee sur jadomi-srv, commande
one-liner donnee au fondateur pour autoriser la cle sur 141.94.10.182 (AVANT
le 14 juin). NB : facematch-ios est sur GitHub karimstock → verifier si jadomi
y est aussi.

## Session 9 juin 2026 — FaceMatch refonte complete + concurrent Giantix/Qlone

### Concurrent identifie : Giantix (giantix.com)
- Logiciel gestion cabinet dentaire tout-en-un, IA "Orelia"
- Telephonie IA 24/7, transcription consultations, analyse radios
- Pas un concurrent direct (gestion cabinet), mais confirme le marche IA dentaire

### Concurrent scan : Qlone Dental
- Scan 3D facial par photogrammetrie, export exocad/3Shape
- JADOMI FaceMatch vise a faire mieux : LiDAR + texture 4K + auto

### Refonte complete scan FaceMatch (10+ commits)

**Remplacement ObjectCaptureSession → LiDAR direct**
- ObjectCaptureSession (objets statiques) ne marchait pas pour visages vivants
- Nouveau : capture depth LiDAR frame par frame (4fps, 60 max)
- Sourire obligatoire avant scan, auto-finish quand couverture complete

**UX premium 2026**
- Silhouette anatomique visage (bezier curves avec oreilles/tempes/machoire)
- Points verts LiDAR temps reel (SceneKit point cloud, ~1400 pts, 10fps)
- CoreHaptics : vibration continue + pulse par capture + countdown
- Auto-start : sourire+distance OK 2s → 3-2-1 → scan auto
- Scanning line animee + glow pulsant + corner brackets

**Texture baking 4K (serveur)**
- xatlas UV unwrap + projection multi-vues → atlas 4096x4096
- Export OBJ + MTL + face_texture.png
- Pipeline : TSDF → Poisson → xatlas → texture bake

**Rendu PBR (iOS)**
- ColoredMeshPreviewView.swift cree + ajoute au xcodeproj
- PBR materials, studio lighting 3 pts, HDR bloom, auto-rotation
- Charge PLY (vertex colors) ou OBJ+texture (4K)

**Streaming temps reel**
- Endpoints : /stream/start, /stream/frame, /stream/finish
- Chaque frame uploadee pendant le scan en background
- Reconstruction quasi-instantanee apres scan

**Bugs fixes**
- python-multipart limite 1024KB → endpoint JSON /api/reconstruct/json
- np.frombuffer read-only → .copy() ajoute
- CoreHaptics.framework ajoute au xcodeproj

**Bug en cours a la fin de session 9 juin**
- ~~Upload bloque a 10%~~ [CORRIGE Session 10 juin]
- ~~Serveur port 8001 relance manuellement~~ [CORRIGE — PM2 facematch-implant]

## Session 10 juin 2026 — FaceMatch fix pipeline complet

### Diagnostic et corrections (4 fixes)

**1. Serveur port 8001 DOWN (CORRIGE)**
- modules/app.py (reconstruction, implants) n'etait pas lance
- nginx routait /api/reconstruct → port 8001 → connection refused → 502
- Fix : ajoute a PM2 sous nom "facematch-implant", pm2 save fait

**2. stream/frame → 400 Bad Request (CORRIGE)**
- python-multipart bloquait sur champs Form >256KB (depth_data_b64, rgb_jpeg_b64)
- Fix serveur : stream/start, stream/frame, stream/finish convertis en JSON (Request body)
- Fix iOS : UploadService.swift — multipart → JSON pour les 3 endpoints streaming
- Teste OK : 516KB/frame, reponse 200 en <1s

**3. Batch upload 50 Mo → connexion perdue (CORRIGE)**
- reconstructFromKeyframes() envoyait 60 keyframes en 1 JSON blob (~50 Mo)
- Sur mobile = timeout/connexion perdue systematiquement
- Fix : remplace par streaming frame-by-frame (stream/start → 60x stream/frame → stream/finish)
- Progression visible : "Envoi capture 12/60..." avec barre de progression reelle

**4. App se met en veille pendant le scan (CORRIGE)**
- UIApplication.shared.isIdleTimerDisabled = true dans ScanView.onAppear
- Remis a false dans onDisappear

### Fichiers modifies
- facematch-api/modules/reconstruction/router.py (stream endpoints → JSON)
- facematch-ios/FaceMatch/API/UploadService.swift (multipart → JSON + batch → streaming)
- facematch-ios/FaceMatch/Views/ScanView.swift (idle timer + progression detaillee)

### Etat a la fin de session
- Serveur OK (PM2 facematch-implant port 8001)
- Streaming JSON teste OK cote serveur
- 3 commits pushes sur facematch-ios (idle timer + JSON streaming + batch fallback)
- Build Codemagic en cours → TestFlight dans ~15 min
- **A TESTER** : nouveau scan complet end-to-end avec le nouveau build

Derniere mise a jour : 10 juin 2026 (Session FaceMatch fix pipeline)

## Session 11 juin 2026 — FaceMatch reconstruction 3D (gros debug)

### Problemes identifies et corriges
1. **stream/finish bloquant** → rendu ASYNC (retourne job_id, polling toutes les 2s)
2. **Texture baking O(n⁴)** → SUPPRIME (utilisait des boucles pixel par pixel impossibles)
3. **Intrinsics cx/cy** → ARKit met cx en [2][0] pas [0][2] (matrice transposee vs CV standard)
4. **Image resolution** → iOS envoyait 1024px redimensionne mais intrinsics pour 1920px original. Fix: envoi original_width/original_height
5. **Depth 1.5m** → capture murs/meubles. Reduit a 50cm (visage only)
6. **60 frames / 15 sec** → pas le temps de tourner. Monte a 120 frames / 40 sec
7. **FLIP_YZ manquant** → ARKit Y-up/Z-back vs Open3D Y-down/Z-forward. Ajout `FLIP_YZ @ np.linalg.inv(pose)`
8. **PLY double** → Three.js ne lit pas float64. Export ASCII
9. **PM2 sans venv** → transformers introuvable. Reconfigure avec venv/bin/python3
10. **Codemagic build 281** → doublon. Offset monte a 300

### Architecture actuelle
- **Serveur** : TSDF Open3D + Poisson lissage + vertex colors
- **Viewer web** : Three.js PLYLoader sur /view/{job_id} — zero telecharge mobile
- **iOS** : polling async avec progress step-by-step (5 etapes visuelles)
- **PM2** : facematch-implant avec venv Python (transformers precharge au startup)

### Etat fin de session — PAS ENCORE FONCTIONNEL
- Le FLIP_YZ reduit le volume (143cm → 56cm) mais le mesh fait encore 56cm au lieu de ~20cm pour un visage
- Les frames s'alignent mieux mais pas parfaitement
- Hypotheses restantes a tester :
  - Le flip est peut-etre au mauvais endroit (pose @ flip vs flip @ inv(pose))
  - Il manque peut-etre la rotation orientation (portrait/paysage) dans la pose
  - Les intrinsics sont peut-etre pour une resolution intermediaire, pas capturedImage
  - Il faudrait tester avec le repo StrayVisualizer (reference GitHub confirmee fonctionnelle)
- Le viewer 3D web marche (Three.js) mais montre un mesh deforme pas un visage

### Commits iOS (build TestFlight 383+)
- f0cf59b async polling + progress UI
- 02f74c3 messages pro (pas de jargon)
- ed3f791 fix intrinsics original_width
- 97ba3ea 120 captures / 40s
- 784a701 fix build number offset
- 7b9d430 qualite max voxels + 2048px RGB
- 068c6f0 download timeout 120s
- 8b4b3ba viewer web 3D (WebViewer3D.swift)

### Prochaine session — TODO
- [ ] Cloner StrayVisualizer (GitHub kekeblom/StrayVisualizer) et comparer le pipeline
- [ ] Tester les 3 variantes de flip : flip@inv(pose), inv(pose@flip), inv(pose) sans flip
- [ ] Verifier si camera.viewMatrix(for: .portrait) est necessaire au lieu de camera.transform
- [ ] Logger les intrinsics reelles envoyees par iOS (fx, fy, cx, cy, orig_w, orig_h)
- [ ] Ajouter le confidence map ARKit (filtrer les pixels LiDAR bruites)
- [ ] Si TSDF ne marche toujours pas : tester ARMeshAnchor (mesh direct ARKit sans serveur)

Derniere mise a jour : 11 juin 2026 (Session FaceMatch reconstruction debug)
## Session 12 juin 2026 — Reconciliation serveurs (ancien->nouveau) + Judilibre sync

### Contexte : deux serveurs avaient diverge depuis la migration
- Migration 7 juin -> ancien VPS (141.94.10.182) et nouveau (jadomi-srv 217.182.132.136)
  ont travaille en parallele pendant le double-run, branche feat/multi-societes forkee
  a partir de l'ancetre commun f96dbc4 (session 5 juin)
- Nouveau serveur (prod, DNS bascule) : 2 commits propres = RAG 238K + cross-matching (7 juin)
- Ancien serveur : 4 commits propres = FaceMatch docs (sessions 9/10/11) + Judilibre (12 juin)
- origin (karimstock/Dlzrtdentale) en retard de 316 commits sur les deux

### Reconciliation faite (serveur-a-serveur, sans passer par origin disque-plein)
- Backup nouveau serveur AVANT : tag git backup-new-srv-20260612 (= 5d2499d)
- Ancien serveur ajoute en remote git lecture seule (oldsrv via SSH ed25519), fetch
- git merge --no-ff oldsrv/feat/multi-societes dans feat/multi-societes du nouveau serveur
- Seul conflit : CODEX.md (sessions des deux cotes) -> resolu en gardant TOUT (7+9+10+11 juin)
- Verifie : zero chevauchement entre les fichiers des commits ancien et les modifs
  non-committees locales (api/dentiste-pro/*, lib/boss, lib/brain, api/studio/* du 6-8 juin)
  -> ces modifs en cours sont preservees intactes

### Judilibre sync (origine : mail SDER Cour de cassation, 20 decisions modifiees)
- lib/legal-providers/judilibre.js : + getTransactionalHistory + getAllTransactionalHistory
- lib/legal-providers/judilibre-sync.js (NOUVEAU) : job sync auto + purgeAndRefresh
- api/avocat/legal-data.js : + 3 endpoints admin (POST /judilibre/sync, GET /sync/status,
  POST /judilibre/purge)
- ecosystem.config.js : + cron PM2 judilibre-sync toutes les 12h
- scripts/judilibre-purge-20260612.js : purge one-shot des 20 decisions
- ATTENTION : endpoint PISTE /transactionalHistory retourne 403 (scope/permissions du
  compte PISTE, PAS un bug serveur). Mail envoye au SDER pour l'acces. En attendant,
  purge manuelle via POST /api/avocat/legal-data/judilibre/purge fonctionne.
- Mail de reponse envoye a anonymisation.sder.courdecassation@justice.fr

## Session 12 juin 2026 — Reconciliation serveurs + Radio Plan IA + Judilibre

### Reconciliation des deux serveurs (migration VPS)
- Ancien serveur (disque plein) et nouveau serveur avaient diverge depuis le 5 juin
- Ancien : FaceMatch docs (9-11 juin) + Judilibre sync (12 juin)
- Nouveau : RAG 238K + cross-matching (7 juin)
- Solution : ajout ancien comme remote git SSH, merge direct serveur-a-serveur
- Backup prealable (tag backup-new-srv-20260612), merge a68cf20
- Zero conflit sauf CODEX.md (resolu manuellement)

### Judilibre deploye en production
- .env avait deja les cles PISTE + Supabase
- PM2 : jadomi recharge + process cron judilibre-sync (12h)
- 403 sur /transactionalHistory = scope pas encore accorde par le SDER
- Mail deja envoye au SDER pour obtenir l'endpoint
- Purge des 20 decisions SDER = INUTILE (cache = Cassation uniquement, pas d'appel)

### Concurrent Giantix — analyse complete du flyer
- Flyer recupere depuis boite Yahoo via IMAP (mail-sync-daemon)
- Giantix = tout-en-un cabinet : RH, dossier clinique, stocks, TPE, portail correspondant
- IA "Orelia" : assistant 24/7, analyse radios, dictee, stats
- **Conclusion : JADOMI a deja toutes les features IA de Giantix + des exclusives**
  - Exclusif JADOMI : FaceMatch 3D, comparateur prix 1.4M produits, mail copilot, triage urgence IA, traduction 99 langues

### Radio Plan IA — NOUVELLE FEATURE (en prod)
- **Concept** : capture ecran radio Vatech → Claude Vision analyse → plan de traitement auto
- **Parcours** : bouton capture ecran (Screen Capture API) + dictee vocale (Web Speech API) → Claude Sonnet Vision → plan de traitement structure (phases, actes, dents FDI, durees)
- **Fichiers crees** :
  - `api/radio-plan.js` — API analyse (Claude Vision + catalogue 80+ actes)
  - `public/radio-plan.html` — Interface capture + dictee + resultats
- **Onglets ajoutes** :
  - Dashboard dentiste-pro : onglet "Radio Plan" avec badge IA
  - Dashboard organisation : onglet "Radio Plan IA" dans accordeon "Mon Cabinet"
- **URL directe** : jadomi.fr/radio-plan
- **Cout** : ~0.04$ par analyse (negligeable)
- **Dictee optionnelle** : le praticien peut ajouter des observations non visibles a la radio (caries debutantes, mobilites, sondages)

### Etat de la production
- jadomi.fr HTTP 200, port 3001
- Mail sync daemon : 9967 mails synchro, 3 comptes actifs
- 1 486 272 produits en catalogue
- Module Radio Plan IA : en ligne et fonctionnel
- FaceMatch API : pas en PM2 sur ce serveur (a remonter si besoin)

### Audit honnete des features
- **Beaucoup de features a 80% mais 0% terminee end-to-end**
- Decision : finir une feature a 100% avant d'en commencer une nouvelle
- Radio Plan IA = premiere feature terminee et deployee end-to-end
- Prochaines priorites a definir par le fondateur

Derniere mise a jour : 12 juin 2026 (Session reconciliation + Radio Plan IA)

## Session 13 juin 2026 — JCI rapatrie + teste + push GitHub (nouveau serveur Ryzen)

### Contexte : reprise sur le NOUVEAU VPS (217.182.132.136), JCI etait reste sur l'ancien
- Le commit JCI (6083c01) + radio-plan (b116cf5) + gitignore XML (6961763) avaient ete
  faits sur l'ancien serveur (141.94.10.182) mais JAMAIS rapatries ici
- Diagnostic : ce serveur etait sur a68cf20 (merge), historiques diverges depuis 300389e

### Rapatriement JCI (commit merge 689f97a)
- git fetch oldsrv (remote SSH vers l'ancien serveur)
- git merge oldsrv/feat/multi-societes -> 1 seul conflit (CODEX.md, sessions des 2 cotes),
  resolu en gardant TOUT le contenu des deux sessions du 12 juin
- 17 fichiers JCI + radio-plan rapatries, node -c OK sur tous
- pm2 reload jadomi -> JCI EN PRODUCTION : GET /api/jci/plugins renvoie les 5 plugins
- Modifs non-committees preexistantes du working tree : preservees intactes (zero chevauchement)

### Test debat end-to-end JCI (plugin dental) — VALIDE
- scripts/jci-test-debate.js : pipeline complet sans appel LLM (le moteur orchestre, ne genere pas)
- Flux : createDebate -> 4 opinions independantes -> 2 contradictions (dont risk_assessor veto)
  -> 1 tour de debat -> synthese -> Trust Engine -> decision
- Resultat : Trust=wait (52% confiance, contradictions non resolues) -> decision ATTENDRE
  (= le moteur sait dire "j'attends" au lieu de trancher a tort, comportement JCI attendu)
- Persistance verifiee sur Supabase : jci_debates (1), jci_opinions (7), jci_decisions (1 ATTENDRE)

### Push GitHub — RESOLU (le blocage des gros fichiers dans l'historique)
- Cause : 39 fichiers >100MB dans l'historique (limite hard GitHub) = data/gudid (700MB jsonl,
  504MB zip, ~32 XML), 6 catalogues PDF uploads/flyers, 5 videos formation >100MB
- Methode validee par le fondateur : git-filter-repo sur un CLONE BARE separe (jadomi-clean.git),
  le working tree /home/ubuntu/jadomi JAMAIS touche (videos + WIP sur disque intacts)
- Nettoyage : strip blobs >100MB + suppression complete data/gudid -> .git 5GB -> 2.7GB
- Videos formation <100MB (video-01/02) CONSERVEES comme demande
- Push incremental par 32 checkpoints (limite 2GB/push GitHub) : feat/multi-societes synchronise
  sur origin (tip d7483f3), JCI verifie present sur GitHub via API, 0 fichier >100MB
- Tag de sauvegarde : pre-github-cleanup-20260613-1259 (sur 689f97a)

### ATTENTION — point ouvert : working tree diverge d'origin
- Le depot de travail /home/ubuntu/jadomi a TOUJOURS l'ancien historique lourd (5GB)
  et ne partage plus aucun SHA avec origin (qui a l'historique nettoye)
- Pour repush incremental futur : soit re-cleaner+pousser depuis un clone bare, soit
  realigner le working tree sur l'historique nettoye (en preservant le WIP) — A DECIDER
- jadomi-clean.git conserve sur disque comme repo "propre" de reference

Derniere mise a jour : 13 juin 2026 (JCI rapatrie + teste + push GitHub propre)

## Session 13 juin 2026 (suite) — Conception DENTAL KNOWLEDGE ENGINE (DKE)

### Decision strategique : le DKE est le SOCLE scientifique des modules dentaires
Discussion fondateur. Le but reste le PLAN DE TRAITEMENT. Pour etre serieux il faut
du savoir dentaire reel, pas l'opinion fabriquee d'un LLM. Le DKE se branche au-dessus
de JCI (JCI reflechit/debat/decide, le DKE sait/prouve) sans modifier JCI.

### Le triple combo (validé fondateur)
1. SCIENCE — litterature internationale, sources LEGALES gratuites (modele Judilibre) :
   PubMed/E-utilities, Europe PMC (+OA fulltext), Semantic Scholar, Cochrane, ClinicalTrials.
   Limite unique : pas de redistribution du texte integral PAYANT (abstract+DOI+synthese OK).
2. REGLEMENTATION FR — CCAM, 100% Sante (paniers RAC 0 / modere / libre), C2S, conventions
   (Ameli/Legifrance, donnee publique). On INGERE la nomenclature, on n'improvise pas la CCAM.
3. PERSONNALISATION PATIENT — couverture (C2S/mutuelle/sans), facteurs de risque, moyens.

### Regles d'or gravees
- Zero affirmation clinique sans citation VERIFIABLE (4 verrous anti-hallucination :
  reponse ancree, citations verifiees vs base, niveau de preuve affiche, abstention via Trust JCI).
- Le profil de couverture definit le plan PAR DEFAUT, jamais le PLAFOND des options
  (patient C2S = plan RAC 0 par defaut MAIS options superieures toujours proposees et chiffrees).
- Plan a options chiffrees : RAC 0 / modere / libre avec reste a charge selon profil.
- Toujours "aide a la decision, validation praticien", jamais de diagnostic autonome.

### Specialites : paro, implanto, endo, prothese/esthetique, ORTHO, chirurgie, omni
### 2 veilles datees/versionnees : scientifique (par specialite du praticien) + reglementaire

### LIVRABLE : docs/DKE-cahier-des-charges.md (architecture, schema SQL, agents, workflow
Radio Plan V2, roadmap MVP 3 mois + 12 mois, budget). Radio Plan = 1er client du DKE.
Roadmap finissable : Phase 0 = finir Radio Plan v1 (lien patient) ; Phase 1 = DKE MVP thin
branche sur Radio Plan ; puis experts + reglementaire + ortho ; puis ParoAI.

### DKE Phase 0 — FAIT (13 juin) : Radio Plan branche sur le dossier patient
- Table radio_plan_analyses creee sur Supabase (id, cabinet_id, patient_id, societe_id,
  created_by, observations, result jsonb, created_at) + index + GRANT + RLS + policies.
  DDL applique via la session MCP du fondateur (le MCP Supabase n'est PAS connecte sur ce
  serveur ; ni psql, ni token Management, ni mot de passe DB dans .env, ni RPC exec_sql reelle).
- api/radio-plan.js : + POST /save (enregistre l'analyse liee au patient, scope cabinet via
  requireCabinet de dentiste-pro/shared) + GET /patient/:id (historique).
- public/radio-plan.html : etape "0. Dossier patient" (recherche live via
  /api/dentiste-pro/patients/search, header X-Societe-Id) + bouton "Enregistrer dans le dossier".
- Deploye : pm2 reload OK, page 200, endpoints montes et proteges (missing_token sans auth),
  table testee (insert/lecture). Test navigateur praticien complet a faire cote front.
- Prochaine etape DKE = Phase 1 (socle dke_knowledge + ingestion PubMed/EuropePMC).

### Session 13 juin (soir) — Radio Plan ameliore + REPRISE ICI la prochaine fois
- Radio Plan : passe en Opus 4.8 + streaming (texte au fur et a mesure, plus de blocage).
  Fixes : max_tokens 8000, garde res.headersSent, nginx proxy_read/send_timeout 300s,
  compteur de secondes UI. Capture ecran : getDisplayMedia({video:true}) (tous les modes).
- Onglet Radio Plan remonte en position 5 (apres Patients) dans dentiste-pro.html.
- ALTERNATIVES selon les moyens du patient : chaque acte couteux propose alternatives
  (economique/intermediaire/premium + remboursement 100_sante/panier_maitrise/hors_panier),
  option COMPROMIS (RAC0+libre), et COUT COMPLET avec prerequis (implant+greffe -> propose
  bridge/PAP sans greffe). Affiche sous chaque acte. Detail RAC reste INDICATIF (DKE phase 1).
- Cout Opus 4.8 : 5$/25$ par M tokens => ~0,10-0,20 EUR / analyse. Negligeable a faible volume.
- GARDE-FOU coût EN ATTENTE : sql/ai-usage-daily.sql ecrit (table quota journalier par user),
  PAS encore execute ni cable. A faire : executer le SQL via MCP fondateur + cabler limite
  journaliere + message upsell dans /analyze (fail-open).

### PROCHAINE ETAPE VALIDEE : DKE Phase 1 — couche REGLEMENTATION FR d'abord (pas la science)
Raison : douleur live = RAC exact (bridge 24/27, compromis, greffe). Plan :
- Etape 1a : verifier dispo open data CCAM dentaire + paniers 100% Sante (Ameli/data.gouv/Legifrance)
- Etape 1b : table dke_actes (code CCAM + libelle + base rembours. + panier + conditions) + ingestion
- Etape 1c : Radio Plan affiche RAC reel + tarif + reste a charge
- Puis science PubMed/EuropePMC ensuite (pour ParoAI/recommandations cliniques).
Ne PAS inventer la CCAM : ingerer l'officiel, le dentiste valide.

### Etape 1b EN COURS — sourcing donnees (13 juin soir)
- CCAM dentaire : 231 codes+libelles dispo OPEN DATA (Licence Ouverte 2.0), telecharge dans
  /tmp/ccam.csv depuis data.gouv (interhop-actes-ameli.csv). MAIS : codes+libelles seulement,
  PAS de tarif/base remboursement, PAS de panier 100% Sante.
- Grille HLF + paniers (le RAC reel en €) : PAS en open data CSV. Source = convention dentaire
  annexe IV (Legifrance) + ameli pro. Ameli=403 bots, sante.gouv=captcha.
- VOIE CHOISIE = API Legifrance (PISTE). On a deja lib/legal-providers/legifrance.js +
  piste-auth.js + credentials .env (PISTE_OAUTH_CLIENT_ID/SECRET). Token PISTE OK.
- BLOCAGE : API Legifrance renvoie 429 (/search) + 403 (/consult) de façon constante =>
  l'app PISTE n'est PROBABLEMENT PAS abonnee a l'API Legifrance (abonnement separe de Judilibre).
  ACTION FONDATEUR : sur piste.gouv.fr, ajouter l'API "Legifrance" aux abonnements de l'app
  (comme il avait fait pour Judilibre). Ensuite legifrance.js marche sans modif.
- ALTERNATIVE (voie A) : le fondateur (dentiste, acces ameli pro) fournit la grille HLF/paniers
  (PDF/Excel), je la structure dans dke_actes, il valide. Plus rapide, n'attend pas PISTE.
- INSIGHT PRODUIT majeur (fondateur) : surfacer les actes REMBOURSABLES que le praticien oublie
  (le patient y a droit) = super-pouvoir DKE. Section "Remboursements possibles" dans Radio Plan.
  Optimisation LEGITIME (pas sur-codage), dentiste valide l'eligibilite.
- Scope CORRIGE : pas "40 actes choisis par moi" mais TOUTE la grille officielle des paniers
  (centaines d'entrees : matiere x position de dent). Moi=tuyauterie, dentiste=validation.

### SOURCING RESOLU (13 juin soir) — le fondateur a fourni les PDF officiels
- API Legifrance bloquee (pas d'abonnement possible), scraping bloque partout. SOLUTION : le
  fondateur (dentiste) a uploade les docs officiels via jadomi.fr/formation/upload.
- Fichiers dans /home/ubuntu/uploads/incoming/ ET copies dans data/dke-sources/ (gitignored, serveur) :
  * annexes-convention-dentaires-avenant2.pdf (175 p) = ANNEXE IV (HLF) + ANNEXE V (paniers RAC0/maitrise/libre) = LA GRILLE COMPLETE
  * memo-synthetique-convention-dentaire-25fevrier.pdf (12 p) = synthese Ameli 2024 (deja lu/extrait, OK)
  * joe_20230825...legifrance.pdf (222 p) = JO convention 2023-2028
- PREUVE faite : lecture PDF + extraction OK (ex memo: HBLD031 TR 182,75/max 829,25 ; vernis HBLD045 25e ;
  paro HBJA003/171/634+HBQD001 etendus a 6 ALD). Le Read tool lit les PDF (param pages, max 20/req).
- FAIT (13 juin soir) : extraction annexe V + ANNEXE II via scripts/dke-parse-convention.py ->
  707 ACTES (fusion JO Legifrance 2023 + avenant2 2026) : 60 RAC0 + 67 maitrise + 43 libre + 537 soins/chir, base de
  remboursement Secu (1.01.2026) ET HLF la ou applicable. 594 libelles. Verifie : detartrage
  HBJD001 base 28,92e ; HBLD031 base 182,75e + HLF 1133e. sql/dke-actes.sql (CREATE dke_actes
  colonnes code/libelle/panier/hlf_2026/base_remboursement + 617 upserts) + JSON. TOUT COMMITE.
  Lacunes mineures a affiner : ~23 libelles vides, qq bases manquantes sur prothese, qq codes
  absents (HBMD042...). Le dentiste valide + on affine. Source 222p JO Legifrance pas encore parsee.
  Rapport envoye par mail au fondateur (karim_bahmed@yahoo.fr via noreply@, sendMail OK).
- TABLE dke_actes CREEE + 707 ACTES INSERES sur Supabase (13 juin soir, via supabase-js). LIVE & verifie
  (HBJD001 base 28,92 ; HBLD073 rac0 453,20 ; HBLD031 rac0 1133+182,75).
- RESTE (reprise) :
  2) brancher Radio Plan sur dke_actes (afficher panier + HLF reel par acte propose). 3) dentiste
  valide la liste. 4) enrichir libelles manquants (62/170 vides) depuis annexe II + base remboursement.
  NB : panier libre = pas de HLF (tarif libre). Codes en doublon (ex HBLD073) -> rac0 prioritaire.

## Session 13 juin 2026 (suite) — GrowthOS construit + DECISION "tout reprendre et rendre fonctionnel"

### GrowthOS BY JADOMI (nouveau module, sur JCI, multi-tenant) — CONSTRUIT + EN PROD
Systeme d'intelligence commerciale autonome : trouver / scorer / convertir des prospects en
automatique. Construit avec la methode Builder/Reviewer (workflow 16 agents + fondations posees
a la main). Tout passe node -c, monte dans server.js apres JCI (app.use('/api/growthos')), pm2
reload OK, API repond (19 agents servis).
- Plugin JCI : lib/jci/plugins/growth.json — Conseil de Direction (6 analystes + 9 contradicteurs
  = 15 voix), risk_officer = veto. Valide par JCI.
- lib/growthos/ : llm.js (DeepSeek volume + Claude sensible + Ollama fallback, via DATA GUARD),
  registry.js (19 agents, 9 actifs / 10 planifies), agent-brain.js (runCouncil fait debattre via
  JCI, opinions LLM en parallele, synthese CEO, veto respecte), revenue-engine.js (bestActionToday
  + dailyBrief = brief 5 min), tenants.js + config/tenants/jadomi.json (multi-tenant generique,
  cible = config), db.js, agents/{lead-hunter,enrichment,scoring,demo-builder}.js.
- api/growthos.js : routes agents/tenants/leads/hunt/enrich/score/demo/brief/best-action/council/
  actions(+approve/reject)/capture. RIEN n'est envoye sans validation (actions en status 'draft').
- public/growthos/index.html (dashboard CEO) + inscription.html (capture mail inbound, LIVE).
- sql/growthos.sql : 6 tables (tenants/leads/opportunities/actions/daily_briefs/memory) + GRANT
  + RLS. APPLIQUE dans Supabase par le fondateur (editeur SQL) le 13 juin — TESTE end-to-end :
  capture OK (lead en base), brief OK (genere DeepSeek), Conseil OK (debat 15 voix en 20s, veto
  Risk Officer fonctionnel sur une question Google Ads 500e -> NON, 14 contre 1).
- Tuile "GrowthOS" ajoutee dans les acces rapides de public/organisation.html (-> /growthos).
- societe_id du tenant jadomi = UUID (11111111-...) car JCI stocke societe_id en uuid.

### QUALITE — mensonge retire (exigence fondateur)
Page inscription.html : claim "Copilot vocal — actes saisis a la voix" = MENSONGER (pas
operationnel) -> retire, remplace par du verifiable (comparateur 172K produits / 16 fournisseurs).
Regle reaffirmee : on ne promet QUE ce qui est reel. Credibilite B2B.

### DECISION STRATEGIQUE MAJEURE (fondateur) — change le cap
Le fondateur arrete d'empiler des features. Constat lucide : "on n'a pas fini, il reste beaucoup
de taf, on doit TOUT REPRENDRE et rendre TOUT fonctionnel." Beaucoup de modules sont des facades
ou marchent a moitie. Nouveau mode de travail = FINIR l'existant, pas ajouter du neuf.
- Le comparateur (meilleur actif reel, module vendable seul) "compare TROP MAL" (cross-matching
  faible) -> c'est LE chantier prioritaire : le rendre irreprochable.
- Plan convenu : (A) CARTE DE VERITE = audit fonctionnel honnete de chaque module (vert marche /
  jaune a moitie / rouge casse), priorise par valeur. (B) Reparer un module a la fois jusqu'a
  irreprochable, en commencant par le comparateur.

### A FAIRE (reprise prochaine session)
1. CARTE DE VERITE : tester en vrai tous les modules, noter l'etat fonctionnel reel.
2. COMPARATEUR : diagnostiquer pourquoi le cross-matching compare mal (lib/scrape-ia/cross-matcher.js,
   lib/rag, scripts/crossmatch-pdf-db.js) et le rendre fonctionnel = priorite n°1.
3. GrowthOS : Lead Hunter a besoin d'une cle GOOGLE_PLACES_API_KEY pour chasser (degrade sans).
   Agents 'planned' a allumer plus tard (ads = budget, social = comptes connectes).

### BUGS / DETTE identifies cette session
- Comparateur : cross-matching faible, comparaisons mauvaises (priorite).
- Working tree tres lourd (~1089 fichiers diverge) : TOUJOURS git add cible, jamais git add .

Derniere mise a jour : 13 juin 2026 (GrowthOS construit + EN PROD ; cap = tout reprendre et rendre fonctionnel, comparateur prioritaire)
- ODF/ORTHO + INFIRMIER (analyse 13 juin) : PAS dans la convention dentaire. ODF = NGAP (lettre-cle
  TO=2,15e dans ce doc, mais coefficients TO90/75/50 dans la NGAP = autre doc). Infirmier = convention
  infirmiere + NGAP (AMI/AIS/BSI) = autre doc. A recuperer (Ameli/Legifrance) pour etendre dke_actes
  aux modules ortho et IDE. Actes CCAM ortho-lies (contention HBLD051/053, traction) DEJA dans les 707.
### PASSE Radio Plan V2 — 14 juin 2026 (RCP contradictoire + CCAM versionnee + garde-fou cout + creation patient par capture)
Fichiers : api/radio-plan.js, public/radio-plan.html, api/dentiste-pro/patients.js, public/admin/dentiste-pro.html (backup .backup-20260614_222445), lib/radio-memory.js (NEW), scripts/dke-parse-convention-v2.py (NEW), scripts/seed-dke-ccam.js (NEW), scripts/_run-sql.js (NEW), sql/dke-ccam-versioned.sql (NEW), sql/radio-usage.sql (NEW), data/dke-sources/dke-{actes-v2,tarifs,paniers}.json (NEW).
Livre :
- UX module radio : saisie texte+vocale (zone editable + dictee), historique des plans patient, RAC en puces couleur (RAC0/modere/libre/mixte), pronostic par dent (conservable/douteux/non_conservable), donnees_a_confirmer, ALERTES (lesions suspectes risque tumoral, contacts defaillants, obturations non etanches, periapical) en banniere rouge. Bug bouton retour corrige.
- QUALITE CLINIQUE : "conservation par defaut" (corrige sur-extraction : dent restauree != racine residuelle, perte osseuse moderee = surfacage pas extraction, radio ne montre pas mobilite/sondage).
- RCP CONTRADICTOIRE A LA CARTE : observateur -> 5 specialistes EN PARALLELE choisis par le praticien selon le patient (endo/paro/prothese/implanto/generaliste, cases a cocher) -> arbitre (conserve par defaut). Si un specialiste n'est pas convoque, l'arbitre ne propose rien de son ressort (ex: pas d'implanto = pas d'implant). + /refine (le praticien critique le plan).
- CCAM VERSIONNEE : parser v2 du JO Legifrance (Annexe II 6 tarifs dates + Annexe V 4 HLF dates) -> 706 actes / 922 tarifs / 286 paniers -> tables Supabase dke_ccam_actes/tarifs/paniers + vue dke_ccam_actuel (tarif+panier en vigueur a current_date, gere echeancier +3% 2026). Branche dans radio-plan.js (buildCcamReference injecte les 157 actes a panier). SQL execute via API Management Supabase (scripts/_run-sql.js, token sbp_).
- GARDE-FOU COUT : plafond ~10 EUR/mois/cabinet (RADIO_CAP_EUR, fondateur ILLIMITE), table radio_usage, comptage des tokens reels de tous les appels. CREDIT VISIBLE qui descend (GET /api/radio-plan/credit + pastille frontend). ~18-36 analyses/mois selon equipe.
- MEMOIRE plans similaires : lib/radio-memory.js (RAG local sqlite-vec + Ollama nomic, base data/rag/plans.db), indexe a /save, injecte les cas similaires du cabinet a /analyze.
- CREATION PATIENT PAR CAPTURE (dash pro) : POST /api/dentiste-pro/patients/extract (Claude Vision lit une capture du logiciel de gestion -> champs patient), modale #modal-add-patient dans dentiste-pro.html (openPatientModal reel). Ecrit dans dentiste_pro_patients.
SQL execute : dke-ccam-versioned.sql (+ vue + GRANT/RLS), radio-usage.sql.
Verif Doctolib (demande fondateur) : extraction patients OK (7735 dans patients_jadomi via scripts Playwright manuels) mais LECTURE SEULE, pas branche dans l'app, pas de pilotage, session de mai expiree. Vrais patients = patients_jadomi (PAS dentiste_pro_patients).
RESTE : (1) liste patients reelle + dossier unifie sur patients_jadomi, (2) pilotage Doctolib (annuler/poser RDV) + exposer dans l'UI, (3) packs Stripe pay-as-you-go (recharge du credit). CODEX.md mis a jour (section 6).

### 15 juin 2026 — Dental Evolution : Campagne PANDA + infra mail (serveur DE Hostinger, HORS repo jadomi)
- FLYERS PANDA refaits (edition PDF via PyMuPDF/venv .venv-pdf) : prix du site, retrait promo + date perimee, profondeur 0a23mm, prix rouge centre, langue Panda Free "Francais, Anglais" (etait Chinois/Anglais). Combos Bamboo+Smart=16480 / Bamboo+Free=17480, brochure Bamboo Ultra (encart 6490), brochure Smart (adresse Villeneuve-d'Ascq).
- ANTI-SPAM DE (cause = wp_mail PHP mail() non signe) : mu-plugin dental-smtp.php = SMTP Hostinger authentifie (smtp.hostinger.com:465, contact@) => DKIM => boite de reception. Vaut pour TOUS les mails DE.
- HUB INTERNE prive /flyers-panda/ (htaccess Basic Auth, catalogue ZENDO = WIP prive) + PAGE PUBLIQUE /scanners-panda/ (flyers+videos PANDA, formulaire lead => contact@ via mu-plugin dental-panda-lead.php). Onglet "Flyers & videos" dans dashboard admin DE.
- CAMPAGNE PANDA 260 dentistes : base AFPPCD (contacts-dentistes.xls nettoyee STOP/bounces) + 3 cabinets Nassim. mu-plugin dental-panda-campaign.php = envoi par lots WP-Cron auto-replanifie, 2 variantes regular/nassim, perso "Bonjour Dr X". Programmee 15 juin 06h00 FR. Hero = GIF flyers defilants 164Ko (Yahoo refuse >~1Mo). Arret: wp option update de_panda_stop 1. Detail: memoire agent project_panda_flyers.md.

## Session 15 juin 2026 — Radio Plan IA fiabilise + socle DKE (connaissances sourcees)

Grosse session de fiabilisation du module Analyse Radio, pilotee par le fondateur (dentiste)
qui a teste en reel et corrige chaque faute. Validee "c'est tres bien".

### Corrections cliniques (prompts api/radio-plan.js)
- Lecture : ne JAMAIS inventer un soin ; le composite est radio-opaque comme le metal → matériau
  jamais deduit de la densite ("restauration radio-opaque, a confirmer") ; attelle de contention
  composite reconnue = signal de pronostic terminal ; alveolyse terminale = donnee RADIO lisible →
  avulsion + remplacement, PAS d'acharnement (interdiction conservation lourde retraitement+couronne
  sur dent terminale) ; qualite d'image = technique reelle (pano nette = "bonne"), pas les limites de
  modalite ; imagerie complementaire CLAIRE (retro long cone + CBCT pour lesions du bloc anterieur
  maxillaire) sans spammer.
- Charting present/absent : l'IA lit MAL sur une pano (limite de perception). SOLUTION = le praticien
  donne le schema. ODONTOGRAMME cliquable (radio-plan.html etape 2) : cycle presente→absente→couronne→
  soin→endo→implant + dictee/texte des absentes. Envoye `chart_dentaire{presentes,absentes,etats}`.
  buildChartBlock() l'injecte comme VERITE NON NEGOCIABLE (observateur+arbitre) : listes exactes,
  jamais remplacer une dent presente, etats declares acquis (moins de tokens, zero erreur matériau).
- Juridique : "Couverture" supprimee (profilage interdit = discrimination). "Paniers a comparer"
  (RAC0/maitrise/libre multi-select) met en avant sans filtrer. Obligation d'information / perte de
  chance : rien coche → toute la palette chiffree ; paniers coches → on respecte. L'outil AIDE, c'est
  le dentiste qui informe. Retire : decochage auto implanto + "implanto absent → aucun implant".
- Tech : max_tokens 16000 (anti-troncature), parseur JSON robuste frontend, streaming affiche propre.

### Socle DKE — connaissances sourcees (chaque agent s'ancre avant de parler)
- lib/dke/knowledge-store.js (SQLite+sqlite-vec, data/rag/dke-knowledge.db, nomic 768d).
- scripts/dke-ingest-knowledge.js (Europe PMC = PubMed/MEDLINE JSON, legal). 440 entrees ingerees :
  radiologie 97, paro 76, endo 73, implanto 65, prothese 63, generaliste 39, ortho 27.
- lib/dke/specialist-knowledge.js : groundingBlock() → references a CITER, fail-open. Cable dans
  radio-plan.js (observateur=radiologue + chaque specialiste). RESTE : HAS, plus de volume, validation
  dentiste, citations au frontend.
- Concurrence (dit franchement) : Claude/GPT = LLM generalistes au coude-a-coude, AUCUN n'egale les
  modeles de vision dentaire dedies (Overjet/Pearl/Denti.AI) en DETECTION. Notre angle = raisonner/
  planifier/chiffrer/documenter avec dentiste dans la boucle ; integrer un modele CV dedie plus tard.

### Module COMPTE-RENDU "pour tout" — FAIT (15 juin)
POST /api/radio-plan/compte-rendu (4 types : consultation / courrier confrere / CR radiologique /
devis-info patient). Reutilise l'analyse deja faite (previous_result) → ne repaie PAS la RCP, juste
1 appel Opus 4000 tok + meme garde-fou cout. Frontend radio-plan.html : carte #cr-card (apparait avec
un plan), 4 boutons type → generateCR() stream dans #cr-text EDITABLE, copyCR(), printCR() (fenetre
mise en page → impression/PDF navigateur). Vouvoiement, zero emoji, n'invente rien (champs [a completer]).

### Affinages 15 juin (tests reels fondateur) + reduction cout
- Odontogramme : nouvel etat "condamnee / a extraire (T)" dans le cycle (presente→absente→condamnee→
  couronne→soin→devitalisee→implant ; T en 2 clics). buildChartBlock : dents condamnees = non_conservable,
  AVULSION + remplacement, INTERDICTION de tout soin conservateur dessus (pas de retro "pour preciser",
  surfacage, retraitement, couronne). Le dentiste a vu l'os (0-2mm), il fait foi.
- Anti-hallucination renforcee : etats declares = EXHAUSTIFS. Une dent presente non marquee = SANS
  tenon/ancrage/couronne/endo → l'IA n'en invente AUCUN (reglait un faux tenon invente sur 11). Si elle
  croit voir un element non declare, elle le signale "a confirmer" sans l'affirmer ni planifier dessus.
- Lesions peri-apicales : ne JAMAIS ecrire "aucun foyer" sur terrain a risque sans inspecter chaque apex ;
  toute radioclarte apicale → alertes + retro long cone + CBCT ; lesion SIGNALEE PAR LE PRATICIEN = certaine
  (impose imagerie). Capture d'ecran coupee = source (pas le code) → conseiller l'IMPORT FICHIER (pano
  complete+nette). Apercu radio agrandi (max-height 78vh) + lightbox plein ecran au clic (Echap pour fermer).
- COUT : 5 specialistes passes sur Sonnet 4.6 (MODEL_SONNET), observateur+arbitre restent Opus 4.8
  (MODEL_OPUS). ~-40 %/analyse (0,40-0,60$ → 0,25-0,35$). NB : costEurFromTokens facture encore tout au
  tarif Opus → sur-estime un peu (prudent). A ajuster au vrai tarif Sonnet si besoin.
- INCIDENT : API Claude tombee a court de credit ("credit balance too low") → toutes les analyses
  echouaient. Fondateur a recharge 100$. Conseiller auto-reload sur console.anthropic.com.

## Session 16 juin 2026 — Tri des 2 dashboards (menus) + vrai dossier patient branche

Demande fondateur : "on doit mieux trier, on a 2 dashboards, le PRO via l'agenda = patients, le
classik = gestion cabinet, mais tout est mal organise". Decision validee : TRI PAR LES MENUS d'abord
(sur/rapide, additif, reversible, ZERO section deplacee entre fichiers) + brancher le vrai dossier patient.

### Diagnostic (carte des 2 dashboards)
- Classik = index.html (servi a /dentiste, titre "Gestion de stock dentaire"). Deja ~90% cabinet ;
  seul l'accordeon "JADOMI IA" melangeait le monde patient.
- PRO = public/admin/dentiste-pro.html (servi a /admin/dentiste-pro, 301 depuis .html). Sidebar en
  vrac : modules cabinet (Mon Labo, Reseau, Equipe, Connecteur, Chat IA Config, Config) interleaves
  entre les modules patient (Agenda, Patients, Radio, Mes cas, Batch, Liste d'attente, Rappels).
- "Mes cas" (PRO, API /api/dentiste-pro/cases) != "Cas Cliniques" (classik, API /api/cas-clinique) =
  2 modules DIFFERENTS, pas un doublon. Ne pas fusionner.
- Dossier patient du PRO etait une MAQUETTE : renderPatients() inline sur 8 DEMO_PATIENTS codes en dur.
  tab-patients.js (API reelle) existait mais n'etait PAS charge.

### FAIT (4 edits PRO + 1 edit classik, backups .backup-20260616_110056)
- PRO dossier patient REEL : charge js/tab-patients.js ; section #tab-patients = <div id="pro-patients-root">
  (table demo retiree) ; init + switchTab('patients') appellent window.JADOMI_PRO.renderPatients(root)
  (namespace, pas de collision avec le global inline). Bouton "Ajouter par capture" (openPatientModal
  Vision) CONSERVE. Module a fallback demo+banniere si API 401 -> zero casse hors connexion.
- PRO sidebar reorganisee en 3 sections labellisees (script Python, SVG preserves a l'identique) :
  PATIENTS & CLINIQUE (accueil,dashboard,agenda,patients,radio-plan,cases,batch,waitlist,rappels) /
  COMMUNICATION & OUTILS (triangle,chat,ia-doc,stats) / GESTION CABINET (mon-labo,reseau,equipe,
  connector,ia-config,config) + lien "Mon Cabinet" -> /organisation conserve. 19 boutons, aucun perdu.
- CLASSIK : accordeon "JADOMI IA" -> renomme "Espace patient" (icone dent), rendu EXPANDABLE
  (toggleNavGroup ; avant le titre redirigeait et rendait les sous-items inaccessibles), 1er item =
  "Dashboard PRO (agenda)" -> /admin/dentiste-pro.html. Cas Cliniques/Snap Photos/Questionnaires/Voice
  conserves + acces /admin/jadomi-ia preserve en sous-item. Rien supprime.
- Validation : 2 pages HTTP 200, node --check sur le gros inline JS du PRO (99K) = OK, grep integrite OK.
- Pas de modif server.js (fichiers statiques) -> pas de reload PM2.

### RESTE (prochaine passe - "deplacer le code", non fait ici)
- snap-photos / questionnaires / passeports / ia-voice : leur CODE vit encore dans index.html (classik).
  Pour un tri "physique" complet il faudra relocaliser ces sections dans le PRO (option deplacement de
  code, plus risquee) ou les exposer via deep-link /dentiste#section depuis le PRO.
- Unification patients_jadomi (7735) <-> dentiste_pro_patients : "pour bientot", pas maintenant (regle
  des 2 mondes). Le module patient du PRO tape /api/dentiste-pro/patients = correct selon la regle.
- filterPatients() (PRO) devenu code mort (input retire) - inoffensif, a nettoyer plus tard.

## Session 16 juin 2026 (suite) — Equipe unifiee + Module Blanchiment Lot 1

### Equipe : un seul module, au cabinet
2 modules "Equipe" doublonnes (PRO onglet equipe + classik "Mon Equipe") tapaient la MEME API
/api/dentiste-pro/team. Decision fondateur : un seul, au classik (cabinet). PORTE les fonctions
avancees du PRO (permissions 14 modules + roles) dans le classik : bouton "Droits" par membre +
editeur autonome (modale creee en JS, namespace eqPerm, styles inline) reutilisant eqHeaders() et
PUT /team/:id/permissions + /role. Onglet Equipe RETIRE du PRO (menu + section + garde renderTeam).
Fichiers : index.html (eqPerm* apres eqRemove + bouton dans eqLoadTeam), dentiste-pro.html.

### Module BLANCHIMENT — Lot 1 (live)
Reanalyse : pas un module mais 3 systemes deconnectes (doc passeport statique 6 seances en dur ;
QR Snap casse car pointe vers checkin.html qui ignore les photos + token mono-usage ; IA teinte
photo-ai.js orpheline sur autre table). Decisions fondateur : photo optionnelle, seances affichees
SEULEMENT si contenu, upload direct PAR LE PRATICIEN (le manque qui bloquait) + QR garde, teinte
SAISIE PAR LE DENTISTE (ZERO IA, "le dentiste est le mieux place"), photos typees visage/sourire,
envoi au patient avec OK. Spec complete en memoire project_blanchiment.md.
- Construit SANS nouvelle table (pas d'acces SQL/MCP dans la session) sur cas-clinique (type=blanchiment,
  vrais patients patients_jadomi). Backend : ajout GET /api/cas-clinique/patients/search?q= (patients_jadomi,
  scope societe). Front : public/admin/js/tab-blanchiment.js (module autonome) + onglet "Blanchiment"
  dans le PRO + hook switchTab. Liste suivis, nouveau suivi (autocomplete patient), seances dynamiques,
  teinte (chips VITA), note, upload photos multiples typees. Stockage sans DDL : teinte = ⟦teinte:X⟧ en
  tete de note, type photo = JSON dans media.note, seance = note.etape. node -c OK, live HTTP 200.
- RESTE : Lot 2 (QR patient reparе multi-seances), Lot 3 (vue avant/apres par type + envoi patient avec
  apercu+OK), Lot 4 (nettoyer ancien modal QR-ou-rien + coquilles vides).

### JADOMI IA integre au dashboard PRO (16 juin, recadrage fondateur "pas de doublon, ameliorer l'existant")
- Le module Blanchiment isole etait un DOUBLON du beau hub jadomi-ia.html. Recadrage : mettre JADOMI IA
  DANS le PRO + le rendre fonctionnel. Fait : onglet "JADOMI IA" (public/admin/js/tab-jadomi-ia.js)
  reprend le design cartes-par-soin du hub + le rend FONCTIONNEL sur cas-clinique : 5 passeports
  (blanchiment/implant/facettes/orthodontie/rehabilitation=autre), patient avec CREATION A LA VOLEE
  (non bloquant, via POST /api/dentiste-pro/patients-reels), suivi seances/photos typees/notes, teinte
  VITA (blanchiment uniquement). Ancien tab-blanchiment.js SUPPRIME. jadomi-ia.html -> redirige vers
  /admin/dentiste-pro?tab=jadomi-ia (plus de doublon). node -c OK, live 200.
  AMELIORATIONS (16 juin, tests reels fondateur) :
  - Patient affiche email + telephone (recherche, liste, fiche). Champ email ajoute a la creation a la volee.
  - ENVOI au patient par EMAIL (POST /api/cas-clinique/:id/send-passeport) : email saisissable/corrigeable
    (pre-rempli si en fiche), apercu + message editable + bouton Envoyer (rien sans action), envoi via
    emailService noreply@jadomi.fr. L'email saisi est ENREGISTRE dans patients_jadomi.email. PAS de SMS
    (payant, decision fondateur). Donnees : 7736 patients, 6358 avec tel, seulement 920 avec email.
  - AVATAR patient : la photo uploadee avec le type "Visage souriant" devient l'avatar (best-effort ->
    patients_jadomi.metadata.photo_url dans add-media, ne bloque jamais l'upload). Affiche en rond
    (photo ou initiales) dans recherche / liste / en-tete fiche. cas-clinique list+detail et patients-reels
    renvoient la photo. "tete + nom" demande par le fondateur.

### Dossier patient rebranche sur patients_jadomi (FAIT 16 juin)
- Nouveau routeur api/dentiste-pro/patients-reels.js (liste/search/fiche/create sur patients_jadomi
  ~7736, scope req.societe.id) monte dans index.js. tab-patients.js: API_BASE -> /patients-reels.
  L'ancienne API /patients (dentiste_pro_patients) reste INTACTE (utilisee ailleurs: radio-plan). node -c OK, 401 = montee.
- jadomi-ia.html: carte "Blanchiment" redirige desormais vers /admin/dentiste-pro?tab=blanchiment (nouveau module)
  au lieu de l'ancien modal openPasseportIA. Les autres passeports (implant/facettes...) restent sur l'ancien ecran.
- Tri 2 dashboards non termine : reste a sortir du PRO Connecteur/Stats/Config/Chat IA Config (vers classik),
  remonter Reseau+Mon Labo en section patient, ajouter Questionnaires+Passeports, nettoyer coquilles classik.

### JADOMI IA / Passeport patient — module complet (16 juin 2026, soir)
Gros chantier piloté par le fondateur en tests réels (patiente BENARAB Karima). Tout est LIVE.

- **Onglet "JADOMI IA" dans le PRO** (public/admin/js/tab-jadomi-ia.js, namespace window.JADOMI_IA) : accueil
  cartes par soin (design jadomi-ia repris), 5 passeports (blanchiment/implant/facettes/orthodontie/
  rehabilitation=type 'autre'). Patient avec autocomplétion (patients_jadomi) + CRÉATION À LA VOLÉE
  (non bloquant, POST /api/dentiste-pro/patients-reels). jadomi-ia.html redirige vers l'onglet.
- **Séances dynamiques** : teinte VITA (chips, blanchiment uniquement, ZÉRO IA), note, 2 emplacements
  photo Visage souriant + Sourire (gros plan) + Autre, ajoutées ENSEMBLE dans la même séance. Affichage
  par vue, suppression photo (× sur chaque photo, DELETE /media/:id et /snap-photo/:id).
- **Photo Visage = avatar patient** (best-effort dans add-media -> patients_jadomi.metadata.photo_url),
  affiché dans recherche/liste/fiche (tête + nom).
- **QR patient réparé** : POST /api/snap/create (sans cas_id = colonne inexistante, bug corrigé) -> page
  /snap/:token (ROUTE AJOUTÉE dans server.js, elle manquait = 404 historique). Guidage live "plein visage
  puis sourire" + étiquetage vue (snap_photos.metadata.vue) + auto-actualisation du dash (polling 4s,
  stop nav + 5min). server.js : routes app.get('/snap/:token') et app.get('/p/:token').
- **Passeport beau & dynamique** : public/documents/passeport-blanchiment.html rendu dynamique (script lit
  ?cas+&soc+&t en mode praticien, OU /p/<token> en mode public). Rempli avec vraies données (patient,
  teintes avant/après, photos, timeline séances). Durée traitement corrigée ("variable, jusqu'à ~1 mois
  et demi", plus "10-15 jours"). Bouton "Voir le passeport" ouvre le doc.
- **Envoi au patient par EMAIL** (POST /api/cas-clinique/:id/send-passeport) : message éditable (apercu+OK),
  salutation formelle "Bonjour [Civilité] Nom Prénom" (nom en casse propre via title-case, civilité Mme/M.
  auto si sexe connu sinon boutons rapides), signature "Dr Bahmed Karim", bouton "Voir mon passeport" ->
  LIEN PUBLIC SÉCURISÉ. emailService noreply@jadomi.fr.
- **LIEN PUBLIC SÉCURISÉ** : jeton unique aléatoire (crypto 16o) stocké dans cas_cliniques.metadata.public_token.
  Route GET /api/cas-clinique/public/:token (AUCUNE auth, lecture seule, ne renvoie QUE ce passeport, pas
  tel/email patient). jadomi.fr/p/<token>. Mauvais jeton = 404. Révocable/expirable (metadata).
- **SÉCURITÉ multi-société** : helper dentalSocieteId() (cabinet_dentaire) dans cas-clinique + patients-reels
  -> le monde patient vise TOUJOURS Precision Dentaire (c8fe3f0f), jamais les 3 autres sociétés. patients_jadomi
  = 7736 vrais patients (la table) ; dentiste_pro_patients (15) abandonnée pour le dossier patient.
- **INCIDENT email patient (corrigé)** : la feature "enregistrer l'email à l'envoi" écrasait l'email patient
  quand le fondateur testait avec son email. Email de BENARAB (karima5902@hotmail.fr) écrasé puis restauré
  manuellement. GARDE-FOU : on ne remplit l'email que si la fiche n'en a PAS (jamais d'écrasement) ET jamais
  un email interne/admin (karim_bahmed@yahoo.fr, contact@, noreply@). LEÇON : ne jamais écraser une donnée
  patient existante sans intention explicite.

## Session 18 juin 2026 — Radio Plan IA : AGENT AUDITEUR (self-critique) deploye

Contexte : benchmark de la concurrence (WeDiagnostix/Logosw, US Pearl/Overjet/VideaHealth, Chine OralGPT)
puis recherche mondiale de modeles de detection. CONCLUSION : aucun modele open-source gratuit/CPU/licence
commerciale avec numerotation FDI n'existe (OralGPT 46% + GPU + dataset non-commercial ; OralBBNet = notebooks
sans poids ; SerdarHelli = segmentation seule). Sans GPU (le fondateur n'en a pas/veut pas) -> on prend la
METHODE, pas les modeles. Option reserve si la detection devient le goulot : Diagnocat (EU, CE+RGPD, 129€/mois
= 500 panos) — mais DECIDE NON necessaire (la fiabilite vient du praticien qui valide, pas du modele).

Livre (upgrade qualite n°1, GRATUIT, 0 GPU, sur l'API Claude existante) :
- `api/radio-plan.js` : /analyze passe de 3 a 4 etapes. L'arbitre (Opus) genere le plan EN MEMOIRE (plus
  streame token par token), puis un AGENT AUDITEUR (Sonnet 4.6, const AUDITEUR_SYS + fn auditPlan()) relit
  le plan selon 9 regles (coherence present/absent, pas de remplacement de dent presente, pas d'extraction
  sur perte legere/moderee, pas d'acharnement terminal, respect dents condamnees praticien, anti-hallucination,
  alternatives obligatoires, mentions de prudence preservees, codes catalogue stricts via ACTES_REF).
  Renvoie {"need_revision":false} ou {"need_revision":true,"corrections":[],"plan_corrige":{}}. NON BLOQUANT :
  echec/JSON non parsable -> plan original conserve (zero regression). Heartbeat garde actif pendant arbitre+
  audit, coupe avant l'envoi du plan final en 1 fois. Client radio-plan.html INCHANGE. Narration "1/4..4/4".
- Test reel : 3 fautes injectees (46 presente+absente, extraction sur perte moderee, implant sur dent
  presente) -> 3 detectees+corrigees, ~23s, ~0,025€/audit. `module.exports.__auditPlan` expose (tests, non HTTP).
- Backup `api/radio-plan.js.bak-20260618-*`. node -c OK, pm2 reload jadomi (port 3001), route /credit 401 OK.

ROADMAP : (cochee) auditeur self-critique. (a faire) upgrade n°2 = ZOOM zones suspectes (re-soumettre crops
apex/zones douteuses a Opus, pur prompting, sans GPU) — APRES validation du fondateur au cabinet le 19 juin.
BUGS/TODO : RAS sur l'auditeur. Le fondateur TESTE l'auditeur au cabinet le 19 juin sur 2-3 vraies radios.

## Session 21 juin 2026 — Compta : Capture facture par QR (etape 7 dossier comptable) BRANCHEE

CONTEXTE : les 5 releves CIC du fondateur (Bahmed Karim EI, janv->mai) se lisent
PARFAITEMENT via le parseur deterministe (142/123/197/127/115 tx, equilibre=true au
centime sur les 5). Lecture CIC = VALIDEE sur donnees reelles. Le blocage historique
(releves CIC illisibles) est resolu.

FAIT (Chantier A — etape 7 "QR photo facture", le placeholder alert() est branche) :
- NOUVEAU module api/compta-snap/index.js : jeton en memoire (TTL 30 min, pas de table),
  POST /create (auth -> QR PNG via lib qrcode, vrai QR scannable), GET /:token (public),
  POST /:token/upload (public, multer memoire, N photos), GET /:token/status (auth, poll).
  Photo(s) -> sharp (rotate EXIF + resize + jpeg) -> pdfkit (1 photo = 1 page A4) ->
  upload bucket Storage 'documents-compta' (${userId}/${hash}.pdf) -> insert documents_compta
  (type 'facture', source 'photo_qr', tags ['a_verifier','photo_qr'], a completer).
- NOUVELLE page mobile public/capture-facture/index.html (camera, multi-photos, envoi).
- server.js : montage app.use('/api/compta-snap',...) + route page app.get('/capture-facture/:token').
  BACKUP server.js + index.html (backups/*.bak-20260621_065812). node -c OK, pm2 reload OK.
- index.html : pcTxQr() (bouton orphelin "Photo QR") branche -> modal pcOuvrirCaptureFacture()
  (QR + suivi live par polling /status). + carte visible "QR Telephone" dans l'onglet Import.
- TESTE END-TO-END (script jetable, user_id reel, nettoyage) : photo->PDF->Storage->insert OK.

FAIT (Chantier B — notes & regles "URSSAF = forcement pro", 21 juin) :
- Backend server.js : regles stockees dans documents_compta type 'regle_compta'
  (fournisseur=mot_cle, sous_type='pro'|'perso', note_fiscale=note) — ZERO nouvelle table.
  Endpoints GET /api/compta/regles, POST /api/compta/regle (upsert par mot_cle),
  DELETE /api/compta/regle/:id. /api/analyser-releve charge les regles et applique
  appliquerRegle() : si squash(mot_cle) dans squash(libelle) -> classe pro/perso (fait
  autorite, ecrase la deduction auto), pose la note, et vaut acquittement (pas d'alerte,
  exclu de documents_manquants).
- Front index.html : bouton "⚙ Regle" sur chaque ligne orpheline -> formulaire inline
  (mot-cle pre-rempli via pcNormLib, Pro/Perso, note) -> POST + application client immediate
  a TOUS les mois charges (pcAppliquerRegleClient) + re-render. Badge "⚙ Pro/Perso (regle)"
  + note dans les listes. Gestionnaire "⚙ Mes regles" (modal liste + suppression).
  Filtre orphelines exclut desormais les lignes reglees. node -c OK, JS valide, pm2 reload OK.
- Teste : endpoints 401 sans auth ; insert regle + matching squash (URSSAF->pro avec note) OK.

FAIT (BUG persistance releves — etape 8, 21 juin) :
- PROBLEME signale par le fondateur : apres analyse des releves janv->mai puis rechargement
  de la page, tous les mois disparaissaient (_releveData = 100% en memoire navigateur,
  releve jamais stocke). 
- FIX : /api/analyser-releve persiste desormais l'ANALYSE (pas le PDF brut) sur le serveur
  dedie France : uploads/releves-analyses/<userId>/<periode>.json (souverainete OK, rien ne
  sort du serveur). Nouveaux endpoints GET /api/compta/releves (recharge) + DELETE
  /api/compta/releve/:periode (retirer un mois). Front : pcChargerRelevesSauves() appele a
  l'ouverture de l'onglet releve + apres analyse (union des mois) ; bouton "Retirer ce mois".
- NB : les analyses faites AVANT ce fix ne sont pas sauvees -> le fondateur doit reanalyser
  ses 5 releves UNE fois ; ensuite ils persistent.

FAIT (frais bancaires auto-justifies, 21 juin) :
- Fondateur : les lignes FORFAIT COM CB = commissions du terminal CB du cabinet (frais
  bancaires pro, JAMAIS de facture separee, le releve est le justificatif).
- /api/analyser-releve : map SANS_FACTURE { charges_sociales:'pro', impots:'perso' } ->
  auto_justifie=true : jamais 'sans facture' (releve = justificatif), exclu alertes +
  documents_manquants + orphelines, note + badge front par categorie. URSSAF/cotisations =
  PRO deductible. IMPOTS (impot sur le revenu) = PERSO non deductible (confirme fondateur).
  IMPORTANT : FORFAIT COM CB (frais terminal CB) RETIRE de l'auto-justifie -> le prestataire
  envoie des factures (fondateur), donc charge pro NORMALE qui reclame sa facture (rapprochement
  ou a attacher via QR/upload). Une regle fondateur reste prioritaire (override).

FAIT (notes auto par ligne, 21 juin) :
- /api/analyser-releve genere une note par transaction (tracabilite preuve de paiement) :
  modePaiement(libelle) deduit virement/prelevement/cheque/carte/retrait. noteAuto() :
  facture rapprochee -> 'Facture du <date> payee le <date releve> par <mode>' ; URSSAF ->
  'Cotisation sociale payee le X par Y' ; impot -> 'Impot (personnel, non deductible) paye...' ;
  recurrente -> '<fournisseur> paye le X par Y'. Champ mode_paiement ajoute. Front : note en
  italique gris sous chaque ligne (pcRenderTxListe). Accents OK.

FIX CRITIQUE (shadowing routes compta, 21 juin) :
- BUG : 'Erreur : societe_id_manquant' au clic 'Memoriser la regle', ET le rechargement des
  releves persistes echouait silencieusement. CAUSE : le routeur app.use('/api/compta', ...)
  applique router.use(requireAuth()) qui exige une SOCIETE (requireSociete) avant de tomber
  sur mes routes directes /api/compta/regle(s) et /api/compta/releve(s) -> interceptees.
- FIX : routes sorties du prefixe -> /api/compta-regle(s) et /api/compta-releve(s) (comme
  /api/compta-snap qui marche). Front index.html mis a jour. requireAuth (user only) suffit.
- BONUS découvert : la periode d'un releve = mois DOMINANT (pas 1ere date) -> un releve de
  mars commencant le 28/02 n'ecrase plus fevrier (5 releves = 5 fichiers). Refaire l'analyse
  des 5 mois une fois (l'ancien fevrier avait ete ecrase par mars).

FAIT (virement interne/perso = perso auto, 21 juin) :
- /api/analyser-releve : estVirementPerso(t) -> si categorie 'mouvement_interne' OU 'perso'
  dans le libelle => professionnel=false (jamais une charge du cabinet). Note + badge
  '↔ perso (interne/perso)'. Une regle explicite du fondateur reste prioritaire (override).

FAIT (transparence + correction des classements auto, 21 juin) :
- Demande fondateur : le praticien doit VOIR ce qui a ete classe automatiquement (perso
  ecartes, justifies) et pouvoir corriger ('non ca c'est pro').
- Front pcRenderReleveDetail : section 'Classe automatiquement' listant les lignes perso_auto
  + auto_justifie, avec raison + bouton 'Non, c'est Pro/Perso' -> pcCorrigerLigne ouvre le
  formulaire de regle (pcRegleForm reutilisable) pre-rempli avec l'inverse, mot-cle EDITABLE.
  pcMotCleLigne ameliore : evite les mots generiques (virement/prelevement) -> mot distinctif
  (PERSO, URSSAF, DGFIP...). pcAppliquerRegleClient efface perso_auto/auto_justifie (la regle
  explicite remplace le classement auto). Frontend pur (index.html).

FAIT (Chantier C phase 1 — rapprochement loyers -> quittances SCI, 21 juin) :
- /api/analyser-releve : charge les SCI du fondateur (user_societe_roles type sci). Pour chaque
  debit dont le libelle contient le nom d'une SCI (ex 'LK Immo' -> squash 'lkimmo'), trouve la
  quittance du mois+annee au montant proche (tol 2%) et la marque 'payee' (date_paiement = date
  releve, preuve = le virement). Idempotent. Cote cabinet : loyer = pro, acquitte (document_trouve).
  Mois sans quittance -> loyers_sans_quittance (signale 'a generer'). Payload : loyers_rapproches
  + loyers_sans_quittance. Front : section 'Loyers rapproches a vos SCI' (marquees payees + mois
  manquants avec lien /sci-dashboard). Donnees reelles : LK Immo, loyer 3000/mois, 5 quittances
  (mars+avril 2026 manquantes). Teste matching read-only OK.
FAIT (Chantier C phase 2 — generation auto des quittances manquantes, 21 juin) :
- /api/analyser-releve : si un loyer est paye SANS quittance, on GENERE la quittance (locataire
  matche par montant, sinon actif/premier ; numero via rpc next_numero ; statut 'payee',
  date_paiement = date virement). Aucun email. Reversible cote SCI. quitsLocaux evite le
  double-generation dans une meme analyse. Locataire LK Immo = b6464903 'karim bahmed ei'
  (existait bien ; erreur de requete precedente). Teste : generation+cleanup OK (periode 2099).
  loyers_rapproches porte 'genere:true' -> front affiche 'generee et marquee payee'.
RESTE (Chantier C phase 3, optionnel) :
- Idem pour factures_sci (autres clients factures, pas seulement loyer SCI). Verifier l'ecriture
  compta_sci/compta_entries des 2 cotes lors du paiement.

FAIT (Multi-societe compta — PHASE 1, 21 juin) :
- MIGRATION SQL (fondateur via SQL editor) : documents_compta + colonne societe_id + index,
  246 docs existants -> cabinet Precision Dentaire (c8fe3f0f...). Pas de DDL possible cote agent
  (ni token Management ni exec_sql).
- Backend : /api/analyser-releve, /api/compta-regle(s), /api/compta-releve(s), /api/compta-snap
  acceptent societe_id (optionnel, repli legacy). Lecture documents_compta filtree par societe,
  releves persistes en sous-dossier uploads/releves-analyses/<userId>/<societeId>/, regles et
  factures capturees taguees societe_id. 5 analyses cabinet migrees dans le sous-dossier cabinet.
- Front : selecteur de societe en haut de l'onglet Releve (pc-compta-societe, _comptaSocieteId,
  defaut cabinet/localStorage), pcSocieteId() transmis a TOUS les appels compta. Changement de
  societe -> recharge la vue de cette societe. La compta est cloisonnee par societe.
FAIT (Multi-societe PHASE 2 — routing auto des factures scrapees, 21 juin) :
- api/brain/mail-copilot.js rescan-compta : le prompt Claude extrait aussi 'destinataire'
  (raison sociale du client). routerSociete(destinataire) matche (squash) contre les societes
  du fondateur -> societe_id de la facture ; defaut = societe du compte mail. Insert
  documents_compta avec societe_id + tag 'route_auto' si routee ailleurs que le compte.
  => une boite mail partagee, chaque facture part dans la bonne compta. Teste sur 4 societes.
RESTE (Multi-societe, finitions) :
- Correction manuelle d'une facture mal routee (reassigner societe_id depuis 'Mes Factures').
- Etendre le selecteur de societe aux onglets Factures/Annuel/TVA (relier comptaLoadFactures
  au selecteur). Brancher la 2e boite Outlook tient deja : la connecter via l'ecran Boite mail,
  les factures se routent par destinataire.

FAIT (vue unifiee des boites mail, 21 juin) :
- Outlook OAuth EN PROD : app Azure JADOMI (multi-tenant+perso) creee, MICROSOFT_CLIENT_ID/SECRET
  en .env, table microsoft_oauth_tokens creee. Teste : karimrx59@hotmail.com connectee en 1 clic.
- GET /api/compta-boites-mail : liste unifiee des 3 sources (comptes_email_societe IMAP +
  microsoft_oauth_tokens + yahoo_oauth_tokens), dedup par email (garde l'OAuth). Front : panneau
  'Mes boites mail' en haut de l'ecran Boite mail (pcChargerBoitesMail). Liens 'Ajouter un compte'
  corriges (restent sur place au lieu de partir vers organisation.html).
FAIT (lecture mails unifiee, 21 juin) :
- GET /api/compta-mail/inbox?source=&email= : lit les 25 derniers mails d'une boite, TOUTES
  sources : Outlook OAuth (XOAUTH2 via microsoft-oauth.imapConfigFor + getMicrosoftAccessToken),
  Yahoo OAuth (getYahooAccessToken), IMAP (mail-copilot.decryptPassword+buildImapConfig exportes).
  Front : chaque boite du panneau est cliquable -> affiche from/objet/date/PJ (pcVoirMails).
  TESTE EN REEL : boite Outlook karimrx59 lue (65249 mails, XOAUTH2 OK).
RESTE (client mail unifie) :
- Brancher le SCAN factures sur les boites OAuth (Outlook/Yahoo) via XOAUTH2 + routing destinataire
  (reutiliser imapConfigFor + l'analyse de rescan-compta). One-click Yahoo+Gmail : soumettre apps
  a Yahoo/Google (Gmail OAuth a coder comme Outlook). Lire le CORPS d'un mail + actions (repondre).

FAIT (recherche ciblee des factures manquantes, 21 juin) :
- Idee fondateur : ne PAS scanner les 65k mails. Partir des prelevements SANS facture du releve
  (Amazon, AliExpress...) et aller chercher EXACTEMENT ces factures dans les boites.
- POST /api/compta-mail/retrouver-factures : pour chaque orpheline -> motCleMarchand(libelle)
  (CB AMAZON->amazon, AMZN MKTP->amazon, aliexpress, sncf, ovh...), IMAP search {from:marchand,
  since:date-10j, before:date+5j} sur la boite, extrait le PDF via Claude, verifie le montant
  (tol 3%), insere documents_compta (societe_id, rapproche, source mail_cible). Boucle sur
  toutes les boites connectees. Front : bouton 'Retrouver ces factures dans mes boites mail'
  sur la section orphelines, rattache les lignes trouvees + re-render. Helper boiteImapConfig
  (refactor inbox). node -c OK, deps mailparser/imapflow/anthropic OK, marchand teste.

FAIT (nettoyage intelligent boite mail + fix token, 21 juin) :
- POST /api/compta-mail/menage-analyse : scanne les 1000 derniers, propose UNIQUEMENT les pubs
  (entete List-Unsubscribe) SANS piece jointe (jamais une facture), groupe par expediteur.
  POST /api/compta-mail/menage-execute : DEPLACE vers la corbeille (special-use \\Trash, fallback
  trash/corbeille/deleted), jamais de suppression definitive, apres accord. Front : bouton 🧹
  par boite + modal (cases a cocher par expediteur). TESTE sur Hotmail : 300 scannes -> 182 pubs,
  2 mails avec PJ proteges. CB2/Amazon/Booking/Netflix... detectes.
- FIX _getFreshToken : repli sur window.jadomiMultiSocietes.token (corrige 'missing_token' du
  panneau boites mail quand getSession() ne renvoyait rien).

FAIT (SCAN INTELLIGENT UNIFIE, 21 juin) :
- POST /api/compta-mail/scan-intelligent : lit le CORPS de chaque mail d'un paquet (500-700),
  3 paniers via regex _SCAN (FACT/PROMO/PERSO/BULK) + IA pour les factures. FACTURE (PDF ou
  corps : 'votre commande', 'reçu de paiement'...) -> extraite + rangee documents_compta (routee
  societe par destinataire). PUB pure (List-Unsubscribe + BULK sender + PROMO + pas FACT) ->
  liste apercu. PERSO/institutionnel (ecole/admin/sante/banque + tout sans signal) -> INTOUCHABLE.
  Capture facture = ACTIVE (additif sur). Nettoyage = APERCU (menage-execute renvoie 403).
  TESTE Hotmail 150 mails : 25 factures (PayPal/Amazon Chronodrive justes), 18 pubs (Kappa/Booking/
  Trainline), 107 proteges (71%). Front : bouton 🔍 Scan par boite + modal resultat ; 🧹 = apercu.
RESTE : reactiver le nettoyage (menage-execute) APRES validation protocole + dossier dedie vs
corbeille ; pagination du scan sur les 65k ; Gmail OAuth ; brancher scan sur boites IMAP via le bouton.

FAIT (vrai client mail + fix Yahoo, 21 juin) :
- GET /api/compta-mail/message?source=&email=&uid= : contenu complet d'un mail (from/subject/
  date/html/text/attachments) via boiteImapConfig + simpleParser.
- Front : clic sur une boite -> modal plein ecran (pcOuvrirMailClient) : cards mails (avatar
  initiale coloree, expediteur/objet/date/PJ) ; clic mail -> lecture en grand (HTML en iframe
  sandbox='' = pas de JS, ou texte). Style theme (--surface/--accent indigo). Remplace l'ancien
  deroulant etrique.
- FIX dedup boites : rang outlook(3)>imap(2)>yahoo-oauth(1). Yahoo OAuth ne LIT PAS les mails
  (scope non approuve) -> on garde l'IMAP Yahoo (mot de passe) qui marche. Corrige 'Command failed'.

FAIT (MODULE MAIL dedie, 21 juin) :
- Le mail sort de la compta : nav-item '📬 Mail' (apres Comptabilite) + page-mail (showPage('mail')
  -> pcMailModuleInit -> pcChargerBoitesMail('pc-mail-boites')). titles.mail='Mail'. La page
  contient : boutons Connecter Outlook (OAuth) / Connecter une boite (renvoie au form compta),
  + le client mail unifie (boites cliquables -> modal lecture). pcChargerBoitesMail(targetId)
  parametree pour servir compta ET le module Mail. Le SCRAPING factures reste en compta (le
  scan alimente documents_compta). Acces aux mails = module Mail ; factures = compta.

FAIT (Copilot mail : reponse IA + dictee vocale, 21 juin) :
- POST /api/compta-mail/draft (Claude redige une reponse FR vouvoiement a partir de l'email +
  consigne optionnelle) et /api/compta-mail/reply (envoi SMTP : boiteSmtp gere Outlook OAuth
  XOAUTH2 smtp.office365.com + IMAP password via SMTP_CONFIGS/custom_host, Hostinger 465 SSL).
  Envoi UNIQUEMENT sur clic explicite (regle 'jamais envoyer sans valider').
- Front : dans la lecture d'un mail, bouton '✍️ Repondre' -> composer (textarea + '✨ Brouillon IA'
  + '🎙️ Dicter' via Web Speech API fr-FR + 'Envoyer'). _mailCourant stocke le contexte. Le
  fondateur voit/modifie le brouillon avant d'envoyer.

FAIT (mail multi-dossiers : Spam/Envoyés/Corbeille, 21 juin) :
- /api/compta-mail/inbox & /message acceptent ?folder=inbox|spam|sent|drafts|trash ;
  resoudreDossier(client,type) mappe via special-use (\\Junk/\\Sent/\\Trash/\\Drafts) +
  fallback nom. /api/compta-mail/folders liste les dossiers dispo. Front : onglets dans le
  client (pcRenderMailTabs/pcChangeFolder/pcChargerDossiers). Teste Hotmail (Junk/Sent/Deleted).
RESTE (mail V2, demande fondateur) :
- PROGRAMMER des envois (mail differe) : table + cron + UI date/heure.
- UI client mail : le fondateur n'aime pas la 'card qui s'ouvre' (modal) -> vue pleine page
  (liste + lecture en panneau) plutot qu'un modal.
- 'et bien plus' : recherche dans les mails, marquer lu/non-lu, supprimer, pieces jointes telechargeables.

RESTE :
- Chantier C : rapprochement releve <-> factures EMISES. VIR LOYER LK IMMO (SCI, module
  api/multiSocietes/sci.js, table factures_sci + PATCH /factures/:id/paiement deja existant)
  -> marquer la facture SCI 'payee' par virement a la date du releve (preuve = le virement),
  des deux cotes (LK IMMO encaisse + cabinet charge). Generique pour tous les locataires/clients.
- AMELIORATION possible etape 7 : extraction IA locale (fournisseur/montant/date) de la photo.

### BUILDER DE SITE — VALIDE BOUT EN BOUT (29 juin 2026)
Conception de site prouvee de bout en bout sur le vrai serveur (port 3001, vrai token, vraie BDD).
- services/theme-resolver.js (NOUVEAU) : traduit un CODE GALERIE (ce que l'UI envoie, ex
  'expert-dentiste-v2') vers un THEME REELLEMENT GENERABLE (dent_expert_scroll) -> le site
  publie = le design choisi. Mapping TEMPLATE_TO_THEME (dentaire + avocat). Utilise par
  /creer ET /changer-theme. RESTE : porter les vrais designs distincts dent_expert_v1/v2/full
  (aujourd'hui ils retombent tous sur dent_expert_scroll) + metiers kine/beaute/BTP/immo.
- api/studio/sites-jadomi/index.js : resolution du theme dans /creer ; upload-video (multer 600 Mo
  + compression ffmpeg H.264/1080p/CRF24/faststart/sans-audio, teste 504 Ko -> 29 Ko) ;
  upload-photo-pre (pre-creation, servie via /uploads).
- services/site-generator.js : generation MULTI-PAGES (dossier pages/ du theme rendu avec les
  memes donnees) ; dent_expert_scroll & law_expert_scroll = 6 pages chacun.
- api/studio/stripe-checkout.js : bypass admin (creation gratuite sans Stripe pour ADMIN_EMAIL).
- api/studio/ovh-{dns,domain},site-orchestrator.js : VPS_IP -> 217.182.132.136 (serveur dedie).
- TESTS DE NON-REGRESSION : scripts/test-builder-e2e.js (2 scenarios : avocat direct +
  code galerie dentaire -> multi-pages 6/6 + 0 placeholder + design choisi=publie) et
  scripts/test-upload-e2e.js (compression video + photo). Tous VERTS. Nettoyage auto.
- PROCHAIN CHANTIER (demande fondateur) : ameliorer les templates existants / en ajouter.

### MODULES VIVANTS — Plomberie + Chatbot souverain (29 juin 2026)
Les modules du builder ne s'activaient JAMAIS (siteData.modules = coquille vide). Desormais
selectionner un module l'ACTIVE reellement sur le site genere.
- services/site-generator.js : buildModulesSnippet/injectModules — injecte le widget des modules
  (chatbot) dans index.html ET chaque page multi-pages, avant </body>. Additif (0 module = inchange).
- api/studio/sites-jadomi/index.js : POST /:id/modules — persiste la liste dans la section 'modules'
  (+ config chatbot : greeting adapte au metier) puis regenere le site.
- public/studio/mon-site/builder.html : finishModules() POST reellement les modules ; etape Modules
  reformulee avec la VALEUR concrete (le "pourquoi") ; chatbot = actif, agenda/visio/paiement/blog = "bientot".
- CHATBOT SOUVERAIN (api/vitrines/chatbot-public.js) :
  * OLLAMA local d'abord (qwen3.6, 127.0.0.1:11434) via lib/ia-router, Claude en SECOURS.
  * PAR PROFESSION : PROFESSION_GUIDE (avocat/dentiste/ortho/prothesiste/sante) — role + ligne rouge
    (avocat = jamais de conseil juridique ; dentiste = jamais de diagnostic).
  * ANTI-JAILBREAK : JAILBREAK_PATTERNS -> reponse cadree, pas de fuite de prompt ("pas de clients qui s'amusent").
  * resolveCabinet() : marche pour vitrines_sites ET sites_jadomi (builder). Contournement FK :
    vitrine_chatbot_configs/conversations sont verrouillees par FK sur vitrines_sites -> pour un site
    builder, la config est lue dans la section 'modules' et les conversations sont en MEMOIRE process
    (zero modif schema). Les sites vitrines gardent leur comportement DB inchange.
- TEST : scripts/test-chatbot-modules-e2e.js = 8/8 VERT (creation -> activation -> widget injecte ->
  config -> reponse Ollama cadree au cabinet -> jailbreak bloque -> nettoyage).
- RESTE modules : Agenda avocat (enrichir module juridique existant : conflit d'interets + qualif domaine
  + RGPD + echeances ; recherche faite), Visio (reutiliser /api/visio WebRTC natif), Paiement (Stripe
  Connect marketplace client->JADOMI->pro deja amorce server.js), Blog. + reordonner les questions du builder.

### AGENDA AVOCAT — deontologie (29 juin 2026)
Enrichit le module juridique EXISTANT (pas appointment_types). Migration 07 appliquee par le fondateur.
- sql/juridique/07_agenda_avocat.sql : +colonnes juridique_reservations (domaine_droit, nature,
  qualite_client, partie_adverse, dossier_id, premier_rdv, echeance, consentement_rgpd, consentement_at,
  conflit_flag) + statut 'en_attente_verification' ; +offres (nature, paiement, pieces_a_apporter) ;
  +dossiers (partie_adverse, juridiction, numero_rg). 100% additif (IF NOT EXISTS).
- api/juridique/conflit.js (NOUVEAU) : verifierConflit(profilId, clientNom, partieAdverse) croise
  client/partie adverse avec dossiers + reservations du cabinet (ilike sur jeton principal).
- api/juridique/public.js (reserver) : pour un AVOCAT, domaine_droit + consentement_rgpd OBLIGATOIRES ;
  si conflit -> RDV GELE (statut en_attente_verification, conflit_flag, AUCUN paiement Stripe) + mail
  d'alerte a l'avocat ; sinon flux normal + champs avocat + consentement_at trace.
- public/expert/index.html : formulaire + champs (domaine, nature, partie adverse, case RGPD) ;
  FIX chemin (/api/juridique/public/reserver) + FIX date_rdv/heure_rdv (la date du RDV etait perdue) ;
  gestion ecran "demande en cours de verification".
- TEST : scripts/test-conflit-avocat-e2e.js = 9/9 (conflit -> gele sans paiement ; RGPD/domaine requis ;
  RDV normal -> paiement + consentement trace). Nettoyage auto.
- RESTE agenda (bonus) : echeances procedurales J-30/J-15/J-7, pieces a apporter par domaine, badge
  "conflit a verifier" sur public/juridique/agenda.html.

### MODULE VISIO — modele DASHBOARD (30 juin 2026, commits 9f15d5f puis CORRECTION 0d039ab)
DECISION FONDATEUR (a retenir) : la visio N'EST PAS un bouton public sur la vitrine. Un praticien
n'est pas un standardiste -> un bouton public = demandes intempestives non sollicitees. La visio se
PILOTE depuis le DASHBOARD praticien : il cree une consultation et envoie le lien au patient/client
de SON choix. Ce modele EXISTE DEJA : dentiste (public/admin/dentiste-pro.html lancerVisio() ->
POST /api/visio/rooms authentifie -> lien copie/envoye par email) et avocat (api/avocat/visio.js +
public/avocat/dashboard-v2.html ; consultation payante via JADOMI deja construite).
- PREMIER JET (9f15d5f) ERRONE puis ANNULE (0d039ab) : bouton public sur la vitrine + endpoint public
  POST /api/visio/public/site-room + widget public/vitrines/visio-widget.js + injection generator.
  TOUT RETIRE (le widget public, l'endpoint = vecteur d'abus, l'injection). builder.html : module visio
  reformule "depuis votre tableau de bord, vous lancez et envoyez le lien au patient (aucun bouton public)".
- FIX CONSERVE (vraie correction, repare la visio AVOCAT) : api/juridique/index.js enregistrait
  app.get('/visio/:token') en index.html pour TOUS les tokens, masquant la route canonique server.js:1598.
  Les tokens 'jadomi-' (avocats via api/avocat/visio.js) n'avaient donc JAMAIS la page P2P native WS
  (index.html exige une session DB via /rooms/join, absente cote avocat). Desormais : jadomi- ->
  public/visio/jadomi-visio.html (signaling WebSocket /ws/visio, P2P pur sans DB), autres tokens ->
  index.html inchange (additif). jadomi-visio.html lit ?name (defaut neutre "Praticien").
- ARCHI page native : une room = token partage dans l'URL ; jadomi-visio.html = P2P via WebSocket
  /ws/visio (lib/visio-signaling.js), sans session DB. Le dashboard dentiste utilise lui POST /rooms
  (token uuid -> index.html riche PDF/fichiers + session DB) : inchange.
- TEST : scripts/test-visio-modules-e2e.js = 10/10 (GARDE-FOU aucun widget public injecte + endpoint
  public 404 + POST /api/visio/rooms exige auth + routing jadomi-/legacy + signaling P2P 2 pairs).
- RESTE modules : paiement marketplace (Stripe Connect, reglementaire), blog.

### BUILDER — reordonner les questions (30 juin 2026, commit 9de8c21)
Ordre illogique corrige (demande fondateur) : on demandait Video/Photos AVANT de savoir qui
vous etes. Nouvel ordre : Template -> Infos -> Textes(services/approche) -> Video (SEULEMENT si
le theme a un fond video) -> Photos -> Modules -> Publication.
- public/studio/mon-site/builder.html : STEPS reordonne ; askStep() passe d'un switch indexe par
  NUMERO a un dispatch par STEPS[i].id (l'ordre ne depend plus que du tableau -> robuste, on ne
  jongle plus avec des numeros). goToStepId() remplace advanceStepTo(4) code en dur.
- themeHasVideo() : saute l'etape Video si le theme n'a pas de fond video. Liste = verite terrain
  (templates/themes/<code> avec balise <video>) + filet heuristique (video|scroll|parallax|
  walkthrough|immersive|cinema|particles|exploded|room_3d). Ex : law_clean/dent_clinical_white =
  pas de video ; dent_expert_scroll/law_immersive_parallax = video.
- Site cree en fin d'Infos (comme avant) ; Video/Photos venant desormais APRES, leurs uploads
  PERSISTENT en live (updateSiteSection hero.video / hero.photo + showRealPreview), + filet
  createRealSite avant l'etape Modules. Uploads toujours pre-creation (upload-video/upload-photo-pre,
  sans site_id) si le site n'existe pas encore.
- TEST : scripts/test-builder-order-e2e.js (Playwright, pilote le vrai chat, session injectee) = 6/6 :
  theme video -> infos->textes->video->photos ; theme sans video -> Video SAUTEE. Non-regression
  generation (scripts/test-builder-e2e.js) : OK (multi-pages 6/6, video OK).

### Session 9 juillet 2026 — MODULE EQUIPE : cerveau secretaire + connexion Doctolib autonome
Suite du module Equipe (dash equipe dentaire, moteur de journee branche sur l'agenda).
Voir memoire project_dash_equipe_journee + project_hub_agenda_apis pour le detail.

SAVOIR METIER ENRICHI (commit f5f4bd4) : lib/equipe/savoir-metier.js. SAVOIR_SECRETAIRE
reecrit sur recherche verifiee (24 faits, sources primaires ameli/Legifrance/CCAM ATIH) :
FSE/SESAM-Vitale, NOEMIE=RSP vs ARL, mode degrade (papier blanc), REFORME tiers payant EBD
60/40 du 1er avril 2025, devis normalise Annexe III, 100% Sante. SAVOIR_CCAM enrichi
(structure AAAANNN, association code 4, cotations a risque avulsions/curetage/endo). Tarifs
dates et indicatifs, jamais inventes. + Alertes proactives dans /team/journee.

CONNEXION DOCTOLIB AUTONOME (commits 074ef69, 773a527, 0954cc9, 2d7331e) :
- Verdict recherche (5 agents) : AUCUNE API Doctolib, AUCUN flux iCal natif. La seule voie =
  compte collaborateur delegue dedie, pilote en session navigateur authentifiee (2FA obligatoire).
  C'est ce qu'utilisent les 350+ telesecretariats partenaires. Cap long terme = FHIR GAP.
- PONT lib/connector/pont-agenda.js : RDV connecteur (motif texte) -> dentiste_pro_agenda
  (categorie via resolveCategorie -> assistance deduite). Dedup applicatif, n'ecrase jamais un
  RDV manuel. Teste e2e sur cabinet reel Precision Dentaire (societe->cabinet 22227205).
- GUIDE public/equipe/connexion-doctolib.html (lien depuis composer) : pas-a-pas
  (Parametres>Comptes Doctolib, adresse JADOMI), statut live.
- ONBOARDING lib/connector/doctolib-onboard.js : repere le mail d'invitation Doctolib dans la
  boite JADOMI (IMAP lecture seule) + extractActivationLink (teste). Config .env requise :
  DOCTOLIB_INBOX_EMAIL/_PASSWORD.
- SESSION lib/connector/doctolib-session.js : login compte JADOMI + relais 2FA (mise en attente,
  code colle une fois) + storageState persiste (uploads/doctolib-sessions, GITIGNORE) reutilise
  sans re-login. readAgenda via session -> pont. Endpoints team.js /doctolib/status /scan /login
  /2fa /sync (requireCabinet, GARDES : ne touchent Doctolib que sur clic fondateur).
- RESTE : 1re activation LIVE = clic fondateur (validera selecteurs 2FA reels). Puis brancher la
  sync sur le moteur. On reprend a la maison.

### Session 10 juillet 2026 — EQUIPE : lien secretaire factures (UX) + scan TOUJOURS dans le dash
Suite du module Equipe. Voir memoire project_dash_equipe_journee + project_compta_integrite.

M5 — REFONTE LIEN SECRETAIRE (public/capture-facture/index.html) : la page de scan n'est plus un
pave de factures. Cartes MENSUELLES repliables (le mois courant ouvert, le reste plie), RECHERCHE
par nom (accent-insensible), carte dediee « Autre facture a photographier » pour tout ce qui n'est
pas encore dans la base. But rappele par le fondateur : ranger dans le module compta les factures
ABSENTES de la base (prelevements sans justificatif). Backend inchange (/upload /manquantes /:token).
Fix : boite de succes vide (okmsg partait en class "msg ok" -> display:block) corrigee.

SCAN FACTURE TOUJOURS A PORTEE (demande fondateur : « ce lien / ce QR doit toujours etre dans le
dash assistante et secretaire ») :
- Backend GET /api/compta-snap/team-link (api/compta-snap/index.js) : tout MEMBRE d'une societe
  recupere LE lien permanent DU PROPRIETAIRE de la compta (resolution du proprietaire via
  user_societe_roles, cloisonnement a la societe de l'appelant). Cle : l'upload classe sous
  documents_compta.user_id = proprietaire, donc les factures tombent dans la compta du DENTISTE,
  jamais celle de la secretaire. Idempotent (reutilise le lien existant). Lecture seule pour
  l'equipe ; creation/revocation restent au proprietaire (create-permanent / revoke-permanent).
  L'endpoint create-permanent etait ORPHELIN (aucune UI ne l'appelait) -> le lien n'etait visible
  nulle part, d'ou la demande.
- Front public/equipe/ma-journee.html : bouton fixe « Scanner une facture » (toujours present) +
  fiche QR + lien copiable + « Ouvrir sur ce telephone ». Charge via team-link au demarrage.
  Teste Playwright (fab + fiche OK, 0 erreur console) ; endpoint 401 sans auth.
- RESTE (envoye par mail au fondateur) : rebrancher le scan OCR sur le routeur souverain ouvert
  (aujourd'hui Mistral/Claude en dur, cf feedback_architecture_ouverte) ; modules RH M1-M4 ;
  1re activation LIVE Doctolib (clic fondateur + contact partenariats).

### Session 16 juillet 2026 — Scan factures souverain + Prix negocies (socle "mieux que Minti")

POINT #1 — SCAN OCR FACTURES = 100% ROUTE (architecture ouverte, 0 provider en dur). Commit 0017193.
- Constat : le fichier cite dans la reprise (api/copilot/scan-factures-sse.js) etait MORT (require nulle part).
  Le vrai chemin de prod = POST /api/brain/mail/scan-factures -> fork lib/workers/scan-factures-worker.js,
  qui appelait Claude EN DUR (en double : scanApiMode + scanDaemonMode) + pre-tri Mistral en dur.
- Fix : SOURCE UNIQUE lib/compta/analyse-document.js (extraction fidele de analyserDocumentIA de server.js
  + etape cloud EU Mistral que l'ancienne cascade sautait). Cascade routee via pickChain(node-registry) :
  RTX cabinet -> serveur France Ollama -> cloud EU Mistral -> Claude US (dernier recours). dataClass 'business'
  (choix fondateur : facture = donnee business, cloud EU puis US en secours, jamais bloquant).
- server.js dedup (-236 lignes inline), worker + sse rebranches. Teste e2e : facture GACD lue EN LOCAL
  (france-ovh ollama), gratuit, 28s, HT/TVA/TTC/produits corrects. Backup backups/server.js.bak.point1.

POINT #2 — DOCTOLIB SELF-CONNECT : deja fait a ~90% (analyse en profondeur). Ecran public/equipe/connexion-doctolib.html
  -> /api/dentiste-pro/team/doctolib/* (par societe), session persistee disque + relais 2FA (lib/connector/
  doctolib-session.js), mot de passe JAMAIS stocke (plus sur que chiffre). Fix schema : sql/79_connector_fix.sql
  APPLIQUE par le fondateur (adapter_type 'doctolib'/'doctolib_ical' + statuts + colonne last_sync). Commit e33184b.
  DECISION fondateur : NE PAS auto-loguer (risque blocage) -> passer par le PARTENARIAT OFFICIEL Doctolib Connect
  en tant qu'EDITEUR, seulement avec de la traction. Message de contact prepare (pas envoye, trop tot). Voir
  memoire project_doctolib_secretaire (a jour). Doctolib N'EST PAS la priorite ; connexion = dernier maillon,
  archi connecteur generique deja prete a recevoir toute source (Doctolib API / Google Cal / CalDAV / FHIR).

MODULE COMPARATEUR "MES PRIX NEGOCIES" (modele Minti, en mieux) — ETAPE A (socle) construite + testee :
- Analyse en profondeur : le comparateur PUBLIC (scraped_prices, 252892 prix, 25 fournisseurs) + le regroupement
  produits (product_clusters + cross-matcher IA + RAG) EXISTENT. L'infra prix-par-cabinet (supplier_prices avec
  price_catalog/price_negotiated/societe_id, moteur services/invoice-matcher.js, insights, panier) EXISTE mais
  etait VIDE (jamais alimentee) et les endpoints /economies /benchmark lisaient des colonnes FANTOMES
  (price_ht/category/best_market_price absentes).
- Commit 03b3fee : extraction locale (analyse-document PROMPT_LOCAL) enrichie -> sort les lignes produits
  (designation/reference/quantite/prix HT+TTC) + code_client. Le worker de scan mail appelle desormais
  matchInvoiceToProducts -> chaque facture nourrit supplier_prices (prix negocies reels du cabinet). Teste e2e.
- Commit ffa7489 : nouvel endpoint GET /api/achats/comparateur-cabinet (lit les VRAIES colonnes) -> pour chaque
  produit achete, compare le prix du cabinet au meilleur prix connu tous cabinets (intelligence collective) et
  designe le moins cher + l'economie. Logique testee (20e vs 15e -> -25%). LIVE (401 sans token).
- VISION fondateur clarifiee : se connecter a TOUS ses comptes fournisseurs -> voir le moins cher direct ->
  NEGOCIER. Voie sure = EXTENSION navigateur (lit le prix negocie depuis la session ouverte, 0 mot de passe
  stocke, POC Henry Schein existe dans extension/) et NON stockage d'identifiants (risque blocage, lecon Doctolib).
  Moat vs Minti = donnees collectives -> alertes "negociez" (deja codees) + achat groupe multi-cabinets.

RESTE (prochaine session) :
1. ETAPE B : extension navigateur multi-fournisseurs + relais backend (connexion comptes -> prix negocies en direct).
2. NEGOCIATION : alertes "negociez -X%" + achat groupe a paliers (patron mu-plugin dental-groupbuy-pro existe).
3. Doctolib : 1re activation LIVE + contact partenariats (quand traction). Modules RH M1-M4. Dedup retroactive compta.
4. Bug pre-existant : services/invoice-matcher.js generateCheapestBasket lit p.societe_id non selectionne (currentPrice toujours undefined).

===============================================================
PASSE 17 JUILLET 2026 -- ECRAN COMPARATEUR + DECOUVERTE "IDENTITE PRODUIT"
===============================================================

FAIT (commit 07a6d4d) -- ECRAN "Comparateur de mes prix" (PRIORITE 1 du plan de reprise) :
- public/admin/js/tab-comparateur-prix.js (NOUVEAU) : module d'onglet IIFE (patron tab-patients.js),
  expose window.JADOMI_PRO.renderComparateurPrix. Par produit : mon fournisseur / mon prix / le moins
  cher / meilleur prix / mon economie + badge "Negociez chez X". 4 KPIs (economie potentielle, produits
  compares, a negocier, au meilleur prix). Etats vide + erreur + cabinet non configure.
- public/admin/dentiste-pro.html : 5 insertions PUREMENT ADDITIVES (sidebar GESTION CABINET, conteneur
  #tab-comparateur-prix, <script>, entree titles, lazy-render dans switchTab). server.js NON modifie
  (l'endpoint existait deja et etait LIVE). Backup backups/dentiste-pro.html.bak.20260717-073119.
- 2 pieges d'archi contournes : (a) apiFetch() prefixe '/api/dentiste-pro' EN DUR -> inutilisable pour
  /api/achats/* ; (b) /api/achats/* lit la societe dans le QUERY param, pas dans X-Societe-Id, et
  req.user.societe_id est TOUJOURS undefined -> sans ?societe_id= la route renvoie 400 systematiquement.
- Teste e2e Playwright : 3 etats (peuple/vide/erreur) + 1 passe sur les VRAIES donnees avec un vrai jeton
  (magiclink genere via service_role, aucun email envoye) => 4 produits Septodont affiches, 0 erreur JS,
  charge XSS de facture echappee, IDOR 403 sur une autre societe, 400 sans societe_id.

DECOUVERTE MAJEURE -- le moteur affichera 0 EUR d'economie tant que l'IDENTITE PRODUIT n'est pas resolue :
- Etat reel de supplier_prices AUJOURD'HUI : 4 lignes, 1 seule societe (Precision Dentaire c8fe3f0f),
  1 seul fournisseur (Septodont). => aucune intelligence collective possible, il n'y a qu'un cabinet.
- PLUS GRAVE (structurel) : services/invoice-matcher.js:195 fait `let gtin = ref` (la reference imprimee
  sur la facture) ; si aucun match dans products_database, il CREE le produit avec ce gtin (ligne 251-259).
  Resultat en base : gtin = '11675', '11676', '10584G' -> ce sont des REFERENCES INTERNES FOURNISSEUR,
  pas des codes-barres (un vrai GTIN fait 13-14 chiffres). Mesure : longueurs observees = 5 et 6 chars,
  et 0 gtin partage par plusieurs societes.
- Or /api/achats/comparateur-cabinet compare par `.in('gtin', chunk)`. Deux fournisseurs vendant le MEME
  produit ont des references DIFFERENTES -> jamais le meme "gtin" -> comparaison impossible. Meme avec
  1000 factures scannees, chaque produit restera "je suis le moins cher" a 0 EUR.
- LE PONT EXISTE DEJA : product_clusters (5646 clusters) + cross-matcher IA + RAG, construits pour le
  comparateur PUBLIC (memoire project_comparateur_pipeline_etat). La vraie suite = comparer par
  cluster_id, pas par gtin (cote invoice-matcher a l'ecriture et/ou cote endpoint a la lecture).
- => NOUVELLE PRIORITE 1 avant l'extension navigateur : sans identite produit, l'extension ne fera
  qu'alimenter plus vite une base qui ne compare rien.

### Session 17 juillet 2026 — VAGUE 2 BUSINESS + INVERSION SHADE (commit 0abf844)

FIN DES PROVIDERS IA EN DUR. Les 4 derniers fichiers cites dans le "RESTE" de la cascade souveraine
passent par le routeur : routes/labo/stock.js (4 appels), api/multiSocietes/commerce.js (3),
api/showroom/produits.js (1), routes/labo/shade.js. Verifie AVANT de coder : les 4 sont bien VIVANTS
en prod (montes via routes/labo/index.js, api/showroom/index.js, api/multiSocietes/index.js) — lecon
du scan-factures-sse.js mort.

SOCLE — lib/ia-router.js :
- sovereignJson(system, user, {dataClass, images, minConfidence, confidenceField, numCtx, maxAttempts})
  = extraction JSON + ESCALADE SUR CONFIANCE (choix fondateur). Le noeud local repond d'abord (gratuit) ;
  si le JSON est illisible OU s'auto-evalue sous le seuil, on relance sur le noeud SUIVANT au lieu
  d'accepter un resultat faible. Les cas faciles ne coutent rien, les cas durs gardent la qualite cloud.
  Retourne {json, confidence, nodeId, tier, sovereign, escalated, attempts[]} — attempts = tracabilite
  du parcours reel (indispensable pour prouver l'absence de fuite).
- opts.excludeNodeIds + opts.numCtx sur sovereignText/sovereignVision (ADDITIFS, zero impact appelants).
- PROUVE EN REEL (3 cas) : (A) cas facile "GACD" => france-ovh SEUL, conf 0.85, 12,8s, 0 EUR ;
  (B) seuil impossible => parcours france-ovh -> cloud-mistral -> cloud-claude (l'escalade marche) ;
  (C) dataClass 'sensitive' + seuil impossible => france-ovh UNIQUEMENT, le cloud n'est jamais atteint.
  La souverainete ne depend pas d'un if mais de la chaine pickChain : l'escalade ne PEUT pas fuir.

BUSINESS (economies, donnees non patient) :
- stock.js : code-barres (seuil 0.4), peremption VISION (0.7), fournisseur (0.6), photo-identify OEM
  VISION (0.7). Seuils NON cosmetiques : products_database et suppliers_directory sont PARTAGES entre
  cabinets — une fiche inventee par un modele faible les pollue pour TOUS. enriched_by = vrai nodeId
  (etait 'claude_haiku' en dur). Gardes ANTHROPIC_API_KEY (503) retires : le local n'a pas besoin de cle.
- commerce.js : num_ctx elargi a 64k car 80 Ko de HTML scrape depassaient le contexte 16k par defaut et
  etaient tronques EN SILENCE (= liste de produits incomplete = prix manquants, degradation invisible).
  Les PDF sont desormais extraits en LOCAL via pdf-parse (Ollama n'ingere pas un PDF brut, contrairement
  au bloc 'document' d'Anthropic) puis routes en texte — meme patron que lib/compta/analyse-document.js.
  PDF scanne sans texte => 422 honnete ("envoyez une photo ou un CSV") au lieu d'un echec obscur.
- showroom/produits.js : sortait encore d'un claude-3-haiku-20240307 (modele de 2024).

SHADE — INVERSION (decision fondateur, meme principe que radio-plan) :
- CONSTAT : routes/labo/shade.js n'etait PAS du business. Il telechargeait les PHOTOS CLINIQUES du
  patient (labo_shade_photos) et les envoyait a claude-sonnet-4-6 AUX USA pour DEVINER la teinte.
  Donnee de sante hors UE — rescapee de la vague 1 parce que rangee du cote "labo/stock" et pas
  "patient". La classification "business" du plan de reprise etait donc fausse (verifiee sur le code).
- Objection clinique du fondateur (dentiste) : "aucun interet d'envoyer une IA pour dire quelle teinte".
  Fondee : une teinte se releve au teintier ou au spectrophotometre (VITA Easyshade, instrument CALIBRE).
  Une photo de telephone (balance des blancs inconnue, eclairage) ne tranche pas A2 vs A3 — le prompt
  demandait d'ailleurs a l'IA de rattraper le "cast couleur", aveu de la faiblesse.
- USAGE REEL VERIFIE EN BASE : labo_shade_cases = 0 ligne, labo_shade_photos = 0 ligne. Jamais utilise.
- APRES : POST /cases/:id/analyser exige `releve_teinte` (400 sinon). L'IA STRUCTURE le releve du
  praticien (prompt calque sur SYS_STRUCTURER de radio-plan : zero invention, zone non relevee => null,
  ambigu => "(a preciser par le praticien)"), en dataClass 'sensitive' => RTX/France uniquement.
  L'IA n'ouvre JAMAIS la photo ; les photos restent pieces de reference du dossier.
- TESTE : releve incomplet ("A2 dominant, cervical A3, corps A2, rien sur le bord incisif") =>
  incisif null, translucidite null, texture null, A2/A3 respectes, manques listes dans points_a_preciser.
  Zero invention. 25s sur france-ovh (CPU), gratuit.
- FRONT public/labo/shade.html aligne : champ "Releve de teinte au teintier" (dictable) + bouton
  "Structurer mon releve" (ne depend plus de la presence d'une photo).

2 BUGS PRE-EXISTANTS CORRIGES AU PASSAGE :
1. commerce.js : le regex d'extraction JSON etait NON-GOURMAND (/\{[\s\S]*?\}/) => sur
   {"produits":[{...}]} il s'arretait au premier '}' et rendait du JSON invalide => 422 a tort.
   _extractJson (gourmand) corrige les 2 endpoints d'import.
2. public/labo/shade.html affichait des champs MOCKES que le back n'a jamais ecrits (teinte_ia,
   confidence, zones_analysees, notes_ia) — invisible car 0 cas en base. Rebranche sur les vraies
   colonnes (teinte_finale, analyse_ia) ; le panneau "Analyse IA - Zones detectees" (mensonger apres
   l'inversion) devient "Teinte relevee au teintier" ; stats "Confiance moyenne %" => "Releves structures".

RESTE (cascade souveraine) :
- avocat/enquete-interne.js + moteur-strategique.js : deja Mistral EU (RGPD-ok), full-local plus tard.
- api/brain/mail-copilot.js : parsing facture (business) — non traite cette passe.
- NE PAS toucher : vitrines/*, studio/*, ai-studio/* (contenu public marketing => cloud legitime).
- Brancher la RTX du cabinet dans le mesh = tier 0 => vision rapide + tout local (le serveur France
  couvre deja tout le monde sans RTX, mais la vision CPU est lente : ~25s texte, plus en vision).

### Session 17 juillet (suite) — LA RTX ETAIT BRANCHEE POUR RIEN (commit 987ff7c)

CONTEXTE : le fondateur a lance `irm jadomi.fr/cf.ps1?v=4 | iex` sur PC10 -> tache heartbeat
PERMANENTE creee, noeud `cabinet-10-10-0-4` (RTX 2070) en tier 0, up, souverain. L'exe etait
DEJA installe (C:\Program Files\JADOMI Cabinet\) : seule la tache planifiee du heartbeat
n'avait jamais tenu (bug schtasks corrige le 1er juillet, jamais rejoue sur ce poste).

PUIS TEST DE BOUT EN BOUT (demande du fondateur : "voir si c'est fiable") -> BUG DE FOND.
- Le modele par defaut du code (ia-router: qwen3.6:35b-a3b) est celui du SERVEUR FRANCE.
  La RTX a qwen2.5:7b / qwen2.5vl:7b. On lui demandait un modele qu'elle n'a pas :
  `{"error":"model 'qwen3.6:35b-a3b' not found"}`.
- ollamaGenerate NE LEVE PAS d'exception la-dessus : il resout une chaine VIDE. L'appelant
  conclut "rien" et passe au noeud suivant SANS AUCUN LOG. => GPU enregistre, en ligne,
  jamais utilise, et personne ne pouvait le voir. Il l'aurait ete depuis 2 semaines.
- Le mesh/heartbeat/registre/classifieur marchaient tous : seul le NOM DU MODELE manquait.

FIX (racine, dans le registre) : `_resolveModel(node, state, capability)` choisit le modele
d'apres les modeles REELLEMENT probes du noeud (vision -> qwen2.5vl, texte -> qwen2.5/llama3,
ecarte moondream) ; `pickChain()` le pose sur les copies renvoyees. REGLE DE PRUDENCE : si le
noeud possede le modele par defaut => undefined => ZERO changement (france-ovh intact, verifie).
sovereignText/Vision passaient deja `model: node.model` -> repares sans y toucher.
analyse-document : `analyserDocumentLocal(b64, mediaType, url, MODEL)` (ne passait que l'URL).

BUG COMPTA GRAVE trouve dans la foulee (independant du modele) : le prompt exige une date ISO,
un modele leger rend "13/03/2026". En aval le worker fait new Date(d).toISOString() :
  '13/03/2026' -> RangeError => le worker PLANTE sur ce document
  '03/04/2026' -> 2026-03-04 => lu 4 MARS alors que la facture dit 3 AVRIL, EN SILENCE
=> `_normaliseDate()` (convention FR jour/mois/annee) applique a TOUT resultat de noeud, filet
Claude compris. Format inconnu -> null (mieux vaut pas de date qu'une date fausse).

MESURES REELLES (vraie facture PDF DENTAL EVOLUTION 997,89 EUR, vrai code de prod) :
- AVANT fix : [analyse] france-ovh  (RTX sautee en silence)
- APRES fix : [analyse] cabinet-10-10-0-4 (agent) = RTX. 21s vs 43,7s France => 2x.
- Vision A CHAUD : RTX 0,6-0,8s vs France CPU 4,2-6,4s => ~7x. (A FROID : 25-30s, chargement
  du projecteur vision en VRAM -> ne pas conclure sur un 1er appel, piege ou je suis tombe.)
- 3 passages : fournisseur/TTC/date identiques + ISO => stable. Bascule RTX debranchee :
  france-ovh reprend, meme resultat. Apres pm2 reload : le noeud revient seul en ~40s.

LIMITES A SAVOIR :
- Le noeud actuel est PC10 = le PC DE TRAVAIL du fondateur (dev, ecrans, logiciels), PAS le
  socle prevu. Le socle = PC07 (3050 8Go) + PC11 (3060 12Go, mesh 10.10.0.6) ; PC11 est MUET
  depuis 7 jours (handshake WG vieux de 7j). PC11/12Go est la bonne cible : 8 Go sont justes.
- 8 Go = vision 5,1 Go + texte 4,7 Go NE TIENNENT PAS ensemble -> Ollama decharge/recharge en
  alternant facture/photo (20-30s a froid a chaque bascule). 12 Go reglerait ca.
- `/api/onprem/nodes` : gpu/vram sont sous `load`, PAS a la racine (piege de lecture).

===============================================================
FIN DU CODEX -- Actualise automatiquement par Claude Code a chaque passe
Derniere mise a jour : 17 juillet 2026 (VAGUE 2 SOUVERAINE [commit 0abf844] : stock/commerce/showroom/shade
routes, 0 provider IA en dur ; socle sovereignJson = escalade sur confiance, prouve en reel [cas facile =
local seul ; cas dur = France->Mistral EU->Claude US ; sensitive = France UNIQUEMENT] ; SHADE INVERSE comme
radio-plan : il envoyait les PHOTOS CLINIQUES patient a Claude US pour deviner la teinte -> desormais le
praticien releve au teintier, l'IA structure en local et n'ouvre jamais la photo [teste : zero invention] ;
2 bugs pre-existants corriges : regex JSON non-gourmand -> 422 a tort, front shade sur champs mockes.
— Plus tot le 17 : ECRAN "Comparateur de mes prix" LIVE dans dentiste-pro [commit 07a6d4d, teste e2e] ;
DECOUVERTE : supplier_prices.gtin contient des references fournisseur et non des codes-barres -> comparaison
inter-fournisseurs impossible tant qu'on compare par gtin ; le pont = product_clusters/RAG deja construits)
===============================================================

===============================================================
NUIT DU 17 JUILLET — ACHATS, PRIX FAUX, SECURITE DES SECRETS
===============================================================

1) ECRAN "Comparateur de mes prix" -> CONSTRUIT PUIS RETIRE (revert 3d97478).
   Le fondateur a signale un doublon : la page "Economies" du classik (index.html:2000)
   fait deja ca, en plus riche. Et l'onglet violait la regle des 2 dashboards
   (fournisseurs/achats = classik, PAS dentiste-pro qui est 100% patient).
   Pourquoi la page Economies parait morte : /api/achats/economies lit la vue
   v_economies_jadomi (0 ligne) puis retombe sur des colonnes INEXISTANTES
   (price_ht, best_market_price) -> renvoie toujours vide. Elle est a REBRANCHER
   sur /api/achats/comparateur-cabinet, pas a reconstruire.
   LECON : l'agent d'exploration a dit vrai (aucun onglet achats dans dentiste-pro)
   mais ignorait la regle produit. Lire les memoires AVANT de coder.

2) EXTENSION NAVIGATEUR -> capte vraiment les prix (commit 38dbfc4).
   Le POC lisait les prix Henry Schein puis les JETAIT. Desormais : adapters/ (1
   fournisseur = 1 fichier), interceptor generique, background.js (envoi signe),
   link.js (liaison AUTO quand le dentiste ouvre jadomi.fr connecte : zero saisie).
   + lib/achats/extension-key.js (jeton HMAC, aucun mot de passe) ; endpoints
   GET /api/achats/extension-key + POST /api/achats/prix-extension.
   SOURCE UNIQUE : passe par matchInvoiceToProducts (meme pipeline que les factures).
   BUG REEL TROUVE AU TEST : le CORS n'autorisait que jadomi.fr -> TOUT appel de
   l'extension partait en 500. Origines chrome-extension:// autorisees (l'id change
   a chaque install, c'est la cle signee qui protege). Teste e2e dans un vrai
   Chromium : liaison auto OK, 3 prix captes/envoyes, remise REELLE lue chez le
   fournisseur (catalogue 62,40 -> paye 46,08 = -26%).
   LIMITE ASSUMEE : l'extension ne capte que ce que le dentiste REGARDE. Decision
   fondateur : aspiration en tache de fond avec sa session deja ouverte (option C).

3) PRIX FAUX DU COMPARATEUR — signale par le fondateur, CONFIRME, PIRE QUE PREVU.
   Cas : 37,00 EUR affiche pour un produit vendu 128,04 EUR (eDentalMarket).
   - Cause #1 PROUVEE : scraper-engine.js:348 fait querySelector('.a,.b,.c') qui
     renvoie le premier element DU DOCUMENT, pas le premier selecteur -> il lisait
     le TOTAL DU PANIER (span.value-top.price, 0,00 EUR). Correctif ecrit + teste
     (128,04 EUR lu) mais NON COMMITE (voir cause #2).
   - Cause #2 NON RESOLUE : la meme page donne 128,04 en HTTP brut et 106,70 dans
     un navigateur (JS du site qui reecrit en HT ; le libelle "Taxes incluses"
     devient faux). 106,70 x 1,20 = 128,04. Livrer le correctif tel quel
     remplacerait un prix faux VISIBLE par un prix faux CREDIBLE. Refuse.
   - Cause #3, LA VRAIE : la base est PERIMEE. 252 892 prix ; 0,2% < 7 jours,
     3,4% < 30 jours, 86,7% > 60 jours (releves du 6 mai au 13 juillet). Minti met
     a jour QUOTIDIENNEMENT. Verification de 15 produits contre les vraies pages :
     9 justes / 6 FAUX = 40% d'erreur (dont un coffret affiche 207,34 alors qu'il
     vaut 103,82 : on fait passer le moins cher pour le plus cher).
   - LIVRE (5acc726) : _prixIncoherent() sur /search ET /product/:ref, seuils
     MESURES sur 32 000 lignes (pas choisis au juge) : masque prix>2x barre (666
     lignes) et remise>80% (172 lignes) = ~2,6%. NE masque PAS remise>50% (1 847
     lignes : les discounters gonflent le prix barre, ce sont de VRAIES promos —
     un 1er jet masquait 92% des gants nitrile) ni prix>barre (5 260 lignes dont
     56% au rapport 1,15-1,25 = TTC face a HT, pas une incoherence).
     + BUG corrige : /search re-comparait best_price avec p.price BRUT apres
     normalisation TTC -> un prix HT pouvait s'afficher en "meilleur prix".
   - CONCLUSION STRATEGIQUE (fondateur) : le catalogue public est une bequille
     datee ; les COMPTES CONNECTES sont la verite (frais, reels, remise comprise).

4) SECURITE — deux trouvailles graves, corrigees et prouvees.
   - FUITE INTER-CABINETS (0ef6f45) : invoice-matcher.js interrogeait la table
     `fournisseurs` SANS filtre societe_id via admin() (bypass RLS). Le contrat du
     cabinet B servait a calculer les prix du cabinet A. PROUVE avant/apres : ancien
     code -> B paye 72 EUR avec la remise 40% de A ; nouveau -> B paye 120 EUR.
     Fallback "cherche sans societe_id" RETIRE. Sans risque : table vide (0 ligne).
   - CLE DE CHIFFREMENT PUBLIQUE (0fb1588 + 4f5ec48 + 6eb61d0) : ENCRYPTION_KEY
     absente du .env -> le code se rabattait sur SUPABASE_SERVICE_ROLE_KEY[0..32] =
     "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpX" = l'en-tete standard d'un JWT, IDENTIQUE sur
     tous les projets Supabase. Les mots de passe des boites mail des cabinets
     etaient chiffres avec une cle PUBLIQUE. 7 copies du helper (l'inventaire en
     annoncait 5) -> toutes basculees sur lib/crypto-vault.js (source unique, LEVE
     si la cle manque, relit l'ancien format pour ne rien casser).
     RE-CHIFFREMENT APPLIQUE sur les 4 comptes reels. Verifie : JADOMI lit, la cle
     publique ne lit PLUS, connexion IMAP REELLE OK (mot de passe intact).
     Le coffre utilise SITE_CREDENTIALS_KEY (deja en .env, 64 hex = 32 octets).

RESTE / PROCHAINE SESSION :
a) ECRAN "Mes comptes fournisseurs" (decision fondateur : modele Minti, identifiants
   dans JADOMI — Minti annonce "Connectez vos identifiants une seule fois").
   BLOQUEUR : SUPABASE_ACCESS_TOKEN absent du .env et pas de MCP en session headless
   -> impossible de creer la table du coffre (scripts/_run-sql.js en a besoin).
   Patron a suivre : sites_existants_credentials (donnees_chiffrees/iv/tag +
   teste_le/dernier_test_ok), PAS comptes_email_societe. Enrichir la page
   page-fournisseurs (index.html:830) qui existe deja — attention : elle persiste en
   double (Supabase ET localStorage) avec try/catch VIDES -> le dentiste croit avoir
   enregistre alors que rien n'est parti ; et le badge "Connecte" est cosmetique
   (s'affiche des qu'un code client est rempli). La table `fournisseurs` est un
   FANTOME : vivante et utilisee, mais dans AUCUNE migration -> a officialiser
   (sql/91_) avec societe_id NOT NULL + RLS.
b) Aspiration en tache de fond par l'extension (option C validee).
c) Correctif scraper-engine (ecrit, non commite) : ne livrer qu'avec la base HT/TTC
   tranchee ET une re-collecte fraiche, sinon inutile.

===============================================================

===============================================================
17 JUILLET (nuit, suite) — ACHATS : LA VRAIE ARCHITECTURE (recherche directe)
===============================================================
VIRAGE decide par le fondateur, PROUVE, a ne plus perdre (memoire
project_achats_recherche_directe) :

- PAS de scraping / PAS de miroir catalogue. Le dentiste tape un produit ->
  JADOMI cherche EN DIRECT dans la base de chaque fournisseur connecte, avec la
  session du cabinet, en parallele -> le moins cher -> panier.
- PROUVE sur le compte reel Henry Schein : recherche browserless
  Search.aspx?searchkeyword= (458 ms) + prix POST JSONRequestHandler.ashx
  (180 ms). Navigateur UNE fois (connexion), ensuite appels HTTP directs
  (cookies + jeton `n` du HTML + header iscallingfromcms). Remises reelles
  constatees (-54% sur une aiguille : 19,49 -> 8,99).
- GACD = Cloudflare Turnstile bloque l'IP datacenter du serveur DEFINITIVEMENT
  (5 methodes testees). -> tourner sur le NOEUD RTX DU CABINET (IP residentielle
  passe Cloudflare + identifiants restent au cabinet = souverainete). Infra
  existante lib/onprem.
- Le systeme de MAIL PANIER existe deja et est branche = module GPO
  (api/gpo/*, lib/emails/supplier-offer.js) : routage sequentiel + lien
  fournisseur (accepter/refuser/contre-proposer) + relances. BOMBE : target_prices
  VIDE -> tout mail annonce 17 EUR. Les 50 gpo_suppliers ont l'email du fondateur
  (test) -> rien parti a un vrai fournisseur.

Commits du soir : ecran comparateur retire (doublon) ; garde-fou prix faux
_prixIncoherent (5acc726) ; cloisonnement invoice-matcher (0ef6f45) ;
lib/crypto-vault source unique + re-chiffrement cles mail PUBLIQUES (0fb1588/
4f5ec48/6eb61d0) ; extension capte prix (38dbfc4) ; routes+table fournisseurs
(52900c6) ; connexion Henry Schein REELLE + noms + ref fabricant (02c39d3/afeec5d).

RESTE : (1) module rechercher(terme) browserless par adaptateur ; (2) endpoint
/api/achats/recherche parallele -> moins cher ; (3) barre recherche + panier ;
(4) stock bas -> recherche -> GPO ; (5) deployer sur le noeud RTX. NE PAS
reprendre le scrape complet (capturer par rayon = abandonne).
===============================================================

===============================================================
21 JUILLET 2026 — ACHATS : LE VERROU RECHERCHE->PRIX EST LEVE + CHAINE CONSTRUITE
===============================================================
LE "POINT NON RESOLU" DU 17 JUIL EST RESOLU, 100% COTE SERVEUR (pas de noeud
requis pour Henry Schein). Cause reelle du corps vide : PAS structurelle. Deux
erreurs cumulees -> (1) la session disque etait EXPIREE (~4 jours) : Henry Schein
voyait le serveur DECONNECTE -> prix de recherche = 0 ; (2) on RECONSTRUISAIT
l'appel JSONRequestHandler.ashx (corps vide).
LA BONNE METHODE : laisser la page recherche declencher SES PROPRES appels prix,
les ECOUTER (page.on('response')) et SCROLLER pour armer le lazy-load — comme
capturer() sur les rayons, comme l'extension. PROUVE EN REEL sur le compte du
fondateur (session fraiche) : Search.aspx?searchkeyword=g-aenial -> 25 produits,
3 appels prix BATCHES -> 18-19 prix negocies REELS non nuls (95,99 / 99,99 /
58,99 EUR HT). La page RECHERCHE est une MEILLEURE source que la fiche produit
(elle price plusieurs SKU d'un coup ; la fiche rend surtout des corps vides) ->
"recherche d'abord" est le bon design.

CONSTRUIT (3 fichiers, node -c + pm2 reload OK, backup server.js.bak-recherche-*) :
- lib/connector/fournisseurs/henryschein.js :: rechercher(page,{terme,maxScroll})
  Ecoute les prix + scroll + fusion schema.org (nom / mpn=ref fabricant / url fiche).
  Ne rend QUE les produits AVEC un prix client (regle zero-decoration : rien
  d'invente a l'ecran). Retour : {reference, designation, prix_ht,
  prix_catalogue_ht, marque, ref_fabricant, url}.
- lib/connector/fournisseur-session.js :: rechercherPrix({societeId,fournisseur,
  terme}) + export hasSession. RECONNEXION AUTO : si la session est absente/morte,
  se reconnecte SILENCIEUSEMENT avec les identifiants chiffres gardes (coffre
  crypto-vault) puis retry — comportement CONCU ("ca reste enregistre, JADOMI se
  reconnecte seul"), indispensable car la session expire en ~4 j. Prouve : la
  session du 17 etait morte, la reconnexion l'a refaite toute seule.
- server.js :: GET /api/achats/recherche?q= (requireAuth + societe-scope via
  _societeAutorisee). Interroge EN PARALLELE (Promise.all) tous les fournisseurs
  pour lesquels le cabinet a hasSession OU aIdentifiants. Tri par prix croissant.
  comparaisons[] = regroupement inter-fournisseurs par ref_fabricant (mpn, seule
  cle fiable) avec economie_ht. meilleur = le moins cher. Ajoute a longRoutes
  (recherche+scroll+reconnexion peut depasser le timeout court). Smoke test :
  401 sans token (route montee + auth OK), 400 sans q. Orchestration testee
  bout-en-bout en reel : 18 produits exploitables, moins cher 58,99 EUR HT,
  comparaisons=0 (normal : 1 seul fournisseur connecte aujourd'hui).

HT/TTC (recadrage fondateur, TRANCHE) : le prix capte chez Henry Schein EST le TTC.
Le fournisseur affiche DEJA en TTC au compte dentiste -> CustomerPrice (API) =
exactement le prix a l'ecran (95,99 EUR), 0 label HT/TTC dans le HTML. Coherent :
le dentiste est NON SOUMIS a la TVA (soins) -> il ne la RECUPERE PAS sur ses achats
-> la TVA est un cout SEC -> le fournisseur lui montre son cout reel (TTC).
=> NE JAMAIS multiplier le prix capte par 1,20 (erreur intermediaire : ca gonflait
95,99 -> 115,19, faux). Le nombre capte = prix_ttc (reference : affichage, tri,
comparaison, economie_ttc). prix_ht = derive TTC/1,20, info compta seulement, jamais
base de decision. Corrige (commit apres 343c9e2) : rechercher() ne multiplie plus ;
tri endpoint deja par TTC. Voir memoire feedback_dentiste_ttc_non_assujetti.

RESTE : (a) barre de recherche "le moins cher" dans le dashboard classik (page
Economies/Fournisseurs, PAS dentiste-pro = regle 2 dashboards) branchee sur
/api/achats/recherche + panier — AFFICHER prix_ttc ; (b) stock bas -> recherche -> GPO (BOMBE
target_prices VIDE : tout mail annonce 17 EUR, 50 gpo_suppliers = email fondateur
-> NE PAS envoyer a un vrai fournisseur avant fix) ; (c) 2e adaptateur fournisseur
(1 fichier) pour peupler comparaisons ; (d) GACD sur le noeud RTX (Cloudflare) —
Henry Schein marche deja cote serveur.
===============================================================

===============================================================
24 JUILLET 2026 — ACHATS : BARRE "LE MOINS CHER" DANS LE DASHBOARD CLASSIK (UI)
===============================================================
RESTE (a) du 21 juil LIVRE : la recherche prix cote serveur avait un endpoint
mais aucune UI ; le dentiste ne pouvait pas s'en servir. Branche maintenant.

CONSTRUIT (1 fichier : index.html = dashboard classik /dentiste, backup
index.html.bak-recherche-ui-*). Page Fournisseurs (page-fournisseurs), PAS
dentiste-pro (regle 2 dashboards) :
- Barre "Trouver le moins cher" en tete de page (input + bouton, Entree = go).
- Appel GET /api/achats/recherche?q= via eqHeaders() (token + X-Societe-Id).
- Rendu ZERO DECORATION : ligne d'etat = fournisseurs REELLEMENT interroges +
  nb de prix lus (point vert/orange selon status) ; si aucun compte connecte ->
  etat vide honnete + lien "Connecter un compte". Resultats tries par le serveur
  (TTC croissant), 1er = badge MOINS CHER. Par produit : designation, fournisseur,
  marque, ref fabricant, PRIX TTC en gros + remise reelle (catalogue barre, -X%)
  + HT derive en petit (info), lien fiche. Bloc "comparaisons" inter-fournisseurs
  (economie_ttc) quand present.
- PRIX = TTC partout (dentiste non assujetti, cf memoire feedback_dentiste_ttc).
- Panier LOCAL (localStorage achats_panier) : ajout/retrait, total TTC. N'ENVOIE
  RIEN (respecte la BOMBE GPO : target_prices vide + gpo_suppliers=email fondateur)
  -> note explicite "l'envoi se fait depuis Commandes, rien d'automatique".

VERIF : node --check du bloc JS = OK ; /dentiste sert la page (9 refs aux
nouveaux ids/fns) ; endpoint monte (401 sans token). Pas de reload pm2 (index.html
servi par sendFile a chaque requete, no-store).

RESTE (inchange) : (b) stock bas -> recherche -> GPO APRES fix bombe target_prices ;
(c) 2e adaptateur fournisseur (1 fichier) pour peupler comparaisons ; (d) GACD sur
le noeud RTX (Cloudflare). Henry Schein marche deja cote serveur.
===============================================================

===============================================================
24 JUILLET 2026 (suite) — GPO : DESAMORCAGE BOMBE "17 EUR" (garde fail-closed)
===============================================================
VERIFIE EN BASE (pas suppose) : target_prices = 0 ligne ; suppliers = 50 lignes
TOUTES avec email karim_bahmed@yahoo.fr (seed de test). Or POST /api/gpo/requests
ENVOIE l'email au fournisseur automatiquement (fire-and-forget) et, target_prices
etant vide, chaque ligne retombe sur DEFAULT_TARGET_PRICE = 17 EUR (requests.js:33)
avec is_estimated:true. Aujourd'hui ca n'atteint que le fondateur (email de test)
mais des qu'une ligne fournisseur porterait un vrai email -> offre a 17 EUR inventee
envoyee a un vrai fournisseur. C'est la "bombe" flaggee.

FIX (1 fichier, lib/emails/supplier-offer.js, backup .bak-gpo-guard-*, node -c OK,
pm2 reload, home+/dentiste 200) : garde FAIL-CLOSED au point d'envoi UNIQUE
sendSupplierOfferEmail() -> si une ligne de l'offre est is_estimated, l'envoi est
REFUSE (retourne {skipped:true, error:'estimated_pricing_blocked'}, 0 mail). Couvre
les 3 appelants (requests, gpo-scheduler, groupage) sans les casser. Se leve tout
seul quand de vrais prix cibles existent. PROUVE par test mocke : estime -> bloque
(0 envoi) ; prix reel -> passe (1 envoi). Aligne zero-decoration + jamais-envoyer-
sans-valider.

RESTE bombe (donnees, pas code) : nettoyer/remplacer les 50 suppliers de test
(email fondateur) avant tout vrai envoi ; peupler target_prices depuis les prix
REELS captes par /api/achats/recherche (au lieu du fallback 17 EUR) -> c'est le
vrai branchement stock bas -> recherche -> GPO (RESTE b).
===============================================================

===============================================================
# TRADUCTION EN DIRECT — LE MOTEUR INVENTAIT DES PHRASES (24 juil 2026)
===============================================================
SYMPTOME (remonte par le fondateur en test) : le public recevait des phrases
JAMAIS prononcees, repetees en boucle ("On va plonger directement dedans." /
"We're going to dive right into it.").

RACINE (1 decision d'archi, pas 3 bugs) : api/live-translate/index.js utilisait
le Realtime en mode ASSISTANT CONVERSATIONNEL avec auto-reponse.
  1. turn_detection server_vad + create_response par defaut a TRUE
     -> chaque bruit de salle declenchait une generation. Sans rien a traduire,
        le modele inventait une phrase de conference plausible.
  2. AUCUNE transcription d'entree activee -> rien n'ancrait la sortie sur la
     parole reelle. Le code ne savait jamais ce qui avait ete dit.
  3. Chaque invention entrait dans l'historique -> boucle de repetition.
  + regie.html renvoyait le micro dans les haut-parleurs (node.connect(destination),
    echoCancellation:false) -> risque de larsen / retraduction de sa propre voix.

FIX (v1, 2 fichiers) :
  [1] SESSION ECOUTE (1/salle) : create_response:false + interrupt_response:false
      + audio.input.transcription (gpt-4o-mini-transcribe, language=srcLang).
      Elle ne genere JAMAIS rien. Elle rend UNIQUEMENT ce qui a ete dit.
  [2] SESSIONS TRADUCTION (1/langue cible) : ne recoivent AUCUN audio.
      response.create "out-of-band" (conversation:'none') avec le TEXTE exact en
      entree -> zero historique, zero audio, invention structurellement impossible.
      File FIFO serialisee par langue (une reponse active a la fois).
  + Garde-fou anti-hallucination : liste d'artefacts STT connus (Amara.org,
    "Thanks for watching", "Merci"...), mot repete en boucle, phrase identique
    dans les 5 s -> REFUSE avant toute traduction.
  + Auditeur dans la langue de l'orateur : transcription diffusee telle quelle,
    aucun modele n'intervient (donc zero risque).
  + regie.html : puits GainNode(0) (le micro ne ressort plus), echoCancellation
    ACTIF, porte de bruit a seuil reglable (sous le seuil rien n'est envoye, puis
    silence NUMERIQUE pour que le VAD cloture le tour proprement), amorce pre-roll.
  + ZERO DECORATION : le pupitre affiche "Ce que la machine entend" — chaque
    phrase captee (verte = traduite) et chaque rejet avec son MOTIF. Le
    conferencier voit en direct qu'on ne traduit que ce qu'il a dit.

PREUVES (tests reels, pas de la theorie) :
  - Config ECOUTE sur 3 s de SILENCE PUR -> 0 evenement response.* (le cas exact
    qui hallucinait). Session acceptee par l'API GA, 0 erreur.
  - Out-of-band texte -> "Le tiers apical du canal doit etre instrumente avec soin."
  - E2E sur PROD wss://jadomi.fr/ws/live-translate (silence -> vraie voix TTS
    anglaise -> silence) : 0 sous-titre invente sur les silences, 1 traduction
    correcte de la phrase reelle ("...du tiers apical du canal radiculaire").

DEPLOIEMENT : moteur + pages LIVE sur jadomi.fr (pm2 reload OK).
RESTE : reuploader les 2 pages sur dentalevolution.fr/traduction/ (hebergement
WP separe, 147.79.116.39) — copies pretes, WebSocket deja pointe sur
wss://jadomi.fr/ws/live-translate.
===============================================================

===============================================================
# TRADUCTION EN DIRECT — 2e passe : il REPONDAIT au lieu de traduire (24 juil)
===============================================================
Apres le fix anti-invention, le fondateur reteste : plus d'invention, mais le
moteur se comportait en CHATBOT.
  "Comment ca va ?"  -> "Je vais bien, merci. Here is the translation: How are you?"
  "Traduis cette phrase en espagnol." -> "D'accord, merci de me donner la phrase."
  + preambules "D'accord, voici la traduction en anglais :".

RACINE : on passait l'extrait comme un MESSAGE UTILISATEUR
(input:[{role:'user', text:transcript}]). Le modele croit qu'on lui parle -> il
repond / il obeit. Aucune instruction ne le contredit assez fort.

FIX (mesure A/B sur 5 cas reels, dont une injection dans le discours) :
  A. extrait en message utilisateur (l'ancien)      -> 2/5
  B. delimiteurs + interdiction de repondre          -> 4/5 (echoue sur l'injection)
  C. EXTRAIT DANS LES INSTRUCTIONS, input = declencheur neutre -> 5/5  <= RETENU
  D. C + amorce role assistant                       -> 5/5 (inutile, plus complexe)
Retenu C : l'extrait n'est plus une parole adressee au modele, c'est une donnee
a transformer. "Traduis cette phrase en espagnol" ressort traduit
("Translate this sentence into Spanish"), il ne l'execute plus.

===============================================================
# ETRE FORT EN DENTAIRE : armer l'OREILLE, pas seulement la bouche
===============================================================
CONSTAT en test E2E : "instrumentation du tiers APICAL" -> entendu "tiers RADICAL"
-> traduit "the radical third party". Le glossaire (404 termes) ne sert qu'a la
TRADUCTION : si la transcription se trompe, il recoit deja du charabia.

FIX : amorce de vocabulaire injectee dans audio.input.transcription.prompt
(lexique-dentaire.js -> amorceTranscription(lang, perso)).
  PIEGE MESURE : le champ prompt est plafonne a 1024 CARACTERES. Au-dela, OpenAI
  REJETTE la config -> la transcription est PUREMENT DESACTIVEE, en silence
  (0 mot entendu, aucune erreur visible cote UX). Une premiere amorce de 1893
  caracteres a casse toute la chaine. AMORCE_MAX = 1000, garde dure.
  Ordre de priorite dans le budget : 1) termes declares par le conferencier,
  2) marques (ce que les moteurs massacrent le plus), 3) termes de specialite
  (tries : expressions composees d'abord, plus discriminantes).

+ REGIE : champ "Termes et marques de votre presentation" (persiste en
  localStorage, envoye dans le message broadcaster). Chaque conferencier arme
  l'oreille pour SA presentation. C'est ca, l'avantage sur Wordly : pas le
  nombre de langues, la justesse du vocabulaire metier.

PREUVES (chaine complete en prod, FR -> EN) :
  - avant amorce : 0/13 termes dentaires entendus (config cassee) puis
    "tiers abical" / "tiers radical" sans amorce.
  - apres amorce : 13/13 termes entendus. Traductions livrees :
    "the apical third", "chronic apical periodontitis and a vertical root
    fracture", "obturation with bioceramic cement", "MB2 after trepanation...
    sodium hypochlorite", "glide path... under dam and microscope".
  - non-regression anti-invention : 3s + 4s de silence pur -> 0 sous-titre.
  - non-regression chatbot : 5 phrases FR -> 5 traductions propres, 0 preambule.

DEPLOYE : moteur (pm2 reload) + pages sur jadomi.fr ET dentalevolution.fr.
RESTE : latence bouche->sous-titre TOUJOURS PAS MESUREE (chiffre n1 au prochain
test en salle) ; regler le seuil de captation sur le vrai micro.
===============================================================

===============================================================
# TRADUCTION EN DIRECT — coller son ORAL ENTIER (24 juil)
===============================================================
QUESTION FONDATEUR : "je peux y coller tout mon oral ?"
REPONSE : non tel quel (limite dure de 1024 car. sur transcription.prompt), MAIS
c'etait la bonne idee -> on EXTRAIT le vocabulaire du texte automatiquement.

extraireTermes(texte, lang) dans lexique-dentaire.js, par ordre de priorite :
  0. marques du lexique REELLEMENT citees dans le texte
  1. sigles (MB2, CBCT, EDTA...) — sautes s'ils sont deja dans une marque retenue
     (le "BC" de "TotalFill BC Sealer" n'apporte rien)
  2. termes du lexique metier presents dans le texte (composes d'abord)
  3. noms propres composes en milieu de phrase (marques hors lexique)
  4. mots rares et longs (vocabulaire que le lexique ignore encore)
Filtres : elisions retirees (l'hypochlorite -> hypochlorite), formes conjuguees
(commencerons, aborderons), mots courants FR+EN, "aujourd'hui"/"quatre-vingt-dix"
reconnus malgre apostrophe et traits d'union.
Bascule liste/texte : > 40 mots ou ponctuation de phrase -> mode extraction.
Serveur : m.termes accepte 40 000 car. (etait 800). Regie : textarea + compteur
honnete ("140 mots colles — le vocabulaire de specialite en sera extrait").

PREUVE (chaine complete, prod, oral de 140 mots colle puis 4 phrases parlees) :
  140 mots -> 34 termes extraits -> amorce 959 car.
  9/9 termes dentaires ENTENDUS. Traductions livrees :
    "the catheterization and the glide path, prepared with the ProGlider"
    "The location of the MB2 in maxillary molars remains a challenge."
    "obturation ... with TotalFill BC Sealer using the single-cone technique"
    "the apical constriction and the management of the apical third"
DEPLOYE jadomi.fr + dentalevolution.fr.
===============================================================

===============================================================
# TRADUCTION EN DIRECT — LATENCE + 6 LANGUES (24 juil)
===============================================================
DEMANDE FONDATEUR : "trop de latence" + ajouter arabe, chinois, roumain,
neerlandais/flamand + "attention, certains font des monologues de 5 min sans
s'arreter".

MESURE D'ABORD (aucune optimisation a l'aveugle). Chronometrage par maillon :
  une fois l'orateur tu -> 1er sous-titre en 0,44 a 1,63 s. Le traitement N'EST
  PAS le probleme. Le probleme : ON ATTEND QU'IL SE TAISE. Sur une phrase de 6 s,
  l'auditeur est servi 7 s apres les premiers mots.

BANC D'ESSAI DE LA DECOUPE (28,6 s de parole continue, temps reel) :
  A. server_vad silence 550 ms (ancien) : 1er a 6,80 s |  4 morceaux | int. 7,75 s
  B. server_vad silence 250 ms          : 1er a 6,40 s |  7 morceaux | int. 3,82 s
  C. server_vad silence 150 ms          : 1er a 1,52 s | 10 morceaux | int. 3,16 s
  D. semantic_vad eagerness high        : 1er a 18,83 s|  2 morceaux | int. 11,93 s
  => semantic_vad est le PIRE choix pour une conference (a ne pas retenter).

PIEGE MAJEUR — COUPE FORCEE : essai de input_audio_buffer.commit toutes les 2,5 s
pour plafonner la latence des monologues. L'API l'accepte sans erreur, MAIS un
morceau force contient parfois quasi aucune parole -> LE MOTEUR REINVENTE des
phrases parfaitement credibles, jamais prononcees ("Why is it essential to
identify the MB2 ?", "Now let's move on to the clinical advantages of ProTaper
Ultimate..."). Pire : l'amorce dentaire lui fournit le vocabulaire pour halluciner
de facon plausible, donc indetectable a l'oreille. ABANDONNE. NE JAMAIS FORCER
DE COMMIT. La decoupe doit rester declenchee par de la parole reelle.

RETENU : threshold 0.45 / prefix 200 ms / silence_duration 200 ms, sans aucune
coupe forcee. Le portier de bruit de la regie (qui n'envoie QUE de la parole,
sinon du silence numerique) permet d'etre tres sensible sans reagir au brouhaha.
+ GARDE-FOU D'ENERGIE cote serveur : on mesure le RMS de l'audio recu ; si un
  segment contient moins de 300 ms de voix reelle, toute transcription qui en
  sort est REFUSEE ("segment sans parole (X ms de voix mesuree)"). C'est la
  parade structurelle a l'hallucination sur morceau vide.
+ voix de sortie a speed 1.06 : marge pour ne pas prendre du retard sur 5 min.

RESULTAT MESURE (monologue non-stop de 33,9 s, prod) :
  1er sous-titre    6,80 s -> 3,30 s
  intervalle moyen  7,75 s -> 4,56 s
  attente maxi                8,47 s (longue proposition sans respiration)
  inventions : 0 | non-regression silence 7 s : 0 sous-titre

6 LANGUES : fr, en, nl (neerlandais/flamand), ro, ar, zh. Codes ISO-639-1 utilises
tels quels par la transcription. Glossaire PRESCRIPTIF en FR/EN, formule comme
REFERENCE DE SENS pour les autres langues (les marques ne se traduisent dans
aucune langue). Amorce : pour une langue hors lexique, budget donne aux MARQUES
(seul contenu pertinent quelle que soit la langue). Page publique : 6 cartes,
arabe en dir="rtl" (sinon illisible).
Verifie en prod : ar/zh/ro/nl rendent tous une traduction correcte de
"La localisation du MB2 sur les molaires maxillaires reste un defi".

PISTE NON ENGAGEE (demande l'accord du fondateur) : les deltas de transcription
arrivent EN DIRECT (1er mot a 2,5 s alors que l'orateur parle encore) -> on
pourrait traduire la phrase partielle et diviser encore la latence, au prix de
sous-titres provisoires qui se corrigent en public.
===============================================================

===============================================================
# TRADUCTION EN DIRECT — DECOUPE VIVANTE, CALEE SUR L'ORATEUR (24 juil)
===============================================================
INTUITION FONDATEUR (juste) : "entre les phrases les orateurs font des pauses ;
s'il parle lentement la pause est plus longue, s'il parle vite elle est bien plus
courte — a nous de capter le rythme" + "faut que ce soit vivant, pas statique".

Un seuil de decoupe FIXE est faux pour tout le monde : l'orateur pose respire
longuement AU MILIEU de ses phrases (a 200 ms on le tronconne), le rapide enchaine
avec des pauses tres breves (a 200 ms on ne le coupe jamais, la latence s'envole).

MECANIQUE LIVREE :
  - la regie mesure les silences reels entre deux emissions de voix, en continu ;
  - fenetre glissante COURTE (24 dernieres pauses) pour suivre un orateur qui
    accelere ou ralentit EN COURS d'intervention ;
  - centile de cette distribution -> seuil de decoupe, borne 140-550 ms ;
  - recalage envoye au moteur des que l'ecart depasse 30 ms, au plus toutes les
    2,5 s ; le serveur refait un session.update sur la session ECOUTE ;
  - affichage honnete en regie : "debit rapide/moyen/pose — pauses medianes X ms,
    decoupe reglee a Y ms (24 dernieres pauses)".

CORRECTION PREALABLE INDISPENSABLE : le ScriptProcessor etait a 4096 echantillons
(85 ms a 48 kHz) — impossible de MESURER une pause de 90 ms. Passe a 2048 (43 ms).

ARBITRAGE MESURE (2 orateurs synthetiques, 4 phrases chacun) :
  centile bas  (seuil ~200 ms) : 11 phrases tronconnees | intervalle 3,00 s
  centile 90   (seuil ~500 ms) :  6 phrases tronconnees | intervalle 4,25 s
  => couper court va vite mais hache ; couper long respecte l'orateur mais ralentit.
  C'est un ARBITRAGE, pas un bug. Reglage par defaut au 80e centile, et un CURSEUR
  "rapidite / phrases entieres" (60-95) en regie permet de deplacer le compromis en
  salle, en une minute, sur la vraie voix.

RESERVE HONNETE : mesures faites sur des voix de SYNTHESE, dont les pauses sont
anormalement regulieres et longues en fin de phrase (le centile 90 saturait a
550 ms meme pour le debit "rapide"). Le calage fin du centile DOIT se faire une
fois sur un vrai micro avec un vrai orateur — l'affichage en regie est fait pour ca.

PIEGE DE MES PROPRES TESTS (a retenir) : 1er banc d'essai invalide car (a) le
generateur de silences comptait les octets en double (48 o/ms a 24 kHz, pas 96) et
(b) la diffusion se faisait par blocs de 200 ms, incapables de voir une pause de
90 ms. Un banc d'essai qui ne resout pas le phenomene mesure ne prouve rien.
===============================================================

===============================================================
# TRADUCTION EN DIRECT — LE MOTEUR RECRACHAIT SON AMORCE (24 juil)
===============================================================
CONSTAT FONDATEUR, EN DIRECT : "je parle meme pas et ca dit ca tout seul".
Le public recevait la LISTE DE VOCABULAIRE qu'on souffle a l'oreille du moteur :
"Endodontics and dentistry conference. Vocabulary and brands expected: ProTaper,
ProTaper Gold, ... odds ratio / relative risk." — trois fois de suite, dont une
version REFORMULEE sans en-tete ("Access cavity in a keyhole or ninja style,
Clark's rule or horizontal offset, ...").

RACINE : regurgitation d'amorce. Travers connu des moteurs de transcription — sur
un passage pauvre en voix (bruit de salle, micro ouvert), ils restituent leur
propre prompt comme s'il avait ete prononce. Le garde-fou d'energie ne suffisait
PAS : le segment contenait bien de l'energie (le bruit de la salle passe le
portier si son seuil est trop bas).

DEUX PARADES, les deux livrees :
1. SUPPRESSION DE L'EN-TETE DE PHRASE dans l'amorce. Elle commencait par
   "Endodontics and dentistry conference. Expected vocabulary and brand names: " —
   une phrase bien formee est le meilleur point d'accroche pour une regurgitation.
   L'amorce est desormais une simple liste de termes, sans verbe ni ponctuation de
   phrase. Elle biaise l'oreille aussi bien (985 car.).
2. GARDE-FOU renvoieAmorce() cote serveur. Un simple test de suite de 5 mots
   identiques NE SUFFIT PAS (le moteur reformule). On mesure donc la PART du texte
   faite d'entrees de la liste : refus si >= 8 entrees distinctes, ou >= 4 entrees
   couvrant plus de 60 % des mots. Un orateur cite deux ou trois termes dans une
   phrase, il ne recite pas son glossaire.
   Eprouve sur 6 cas : les 3 renvois reels (dont le reformule) REFUSES, et
   3 vraies phrases denses en marques ACCEPTEES ("We shaped the canal with
   ProTaper Gold and obturated with TotalFill BC Sealer under the Zeiss
   microscope, respecting the apical third." -> passe).

PREUVE EN PROD : 20 s de BRUIT DE SALLE (pas du silence numerique : un souffle
assez fort pour passer un portier mal regle) -> 0 sous-titre diffuse au public.
Puis une vraie phrase -> traduite normalement.

LECON D'EXPLOITATION : le SEUIL DE CAPTATION de la regie est la premiere defense.
Regle trop bas, le bruit de fond entre et le moteur a de quoi divaguer. Le pupitre
affiche "Niveau mesure" : monter le seuil au-dessus du bruit de la salle vide.

INCIDENT DE METHODE (a ne pas refaire) : le garde-fou avait ete ECRIT et verifie
en syntaxe, mais PAS DEPLOYE (pm2 reload oublie) — le fondateur testait donc
encore l'ancien moteur pendant que j'annoncais le correctif. Toujours recharger
ET reverifier avant de dire que c'est corrige.
===============================================================

===============================================================
# TRADUCTION EN DIRECT — QUESTIONS DU PUBLIC (25 juil)
===============================================================
DEMANDE FONDATEUR : "le dentiste pose sa question depuis son tel dans sa langue,
c'est traduit pour le conferencier, et le conferencier peut voir la reponse dans
sa langue".

CONSTAT PREALABLE : le chemin RETOUR existait deja. Quand le conferencier repond
au micro, toute la salle recoit sa reponse traduite. Il ne manquait que le trajet
telephone -> conferencier.

ARCHITECTURE (le texte de la question passe par le MEME pipeline securise) :
  telephone du participant --PCM16--> [3] SESSION QUESTION (1 par salle,
    reconfiguree a la langue du demandeur, silence 500 ms car on parle plus
    posement au telephone) -> transcription
  -> MEMES GARDE-FOUS que la parole du pupitre : energie (300 ms de voix mini),
     artefacts STT, renvoi d'amorce, anti-repetition
  -> diffuserTexte(room, texte, langueSource, 'public') :
       . chaque auditeur la recoit DANS SA LANGUE (marquee "Question de la salle")
       . le PUPITRE la recoit dans la langue du conferencier ({type:'question'}),
         avec l'original en dessous
  -> le conferencier repond au micro : chemin normal, deja en place.

REFACTO : traiterTranscription() a ete generalisee en diffuserTexte(room, texte,
langueSource, origine). Les jobs de traduction ne sont plus des chaines mais des
objets {texte, source, origine, versPupitre} — la langue source n'est donc plus
forcement celle du pupitre, et une reponse peut etre routee vers le pupitre.

MODERATION (indispensable en salle) : les questions sont FERMEES par defaut. Le
pupitre a une bascule "Questions du public". Une seule question a la fois (le
serveur refuse la 2e : "quelqu un pose deja une question"). Fermeture automatique
si le conferencier se deconnecte. Duree max d'une question : 45 s.
Le telephone utilise un puits GainNode(0) : le micro du participant ne ressort
jamais dans son propre haut-parleur.

PREUVE EN PROD (conferencier EN, un dentiste FR, un auditeur RO) :
  refus quand les questions sont fermees -> "les questions ne sont pas ouvertes"
  question dite en francais : "Docteur, quel est votre protocole d'irrigation
    pour un MB2 tres calcifie ?"
  -> AU PUPITRE (anglais) : "Doctor, what is your irrigation protocol for a very
     calcified MB2?" (+ original francais affiche dessous)
  -> AUDITEUR ROUMAIN : "Care este protocolul dumneavoastra de irigare pentru un
     MB2 foarte calcifiat?"
  reponse du conferencier au micro -> FR "J'utilise une irrigation ultrasonique
     passive avec de l'hypochlorite de sodium" / RO "Folosesc irigare ultrasonica
     pasiva cu hipoclorit de sodiu."
DEPLOYE jadomi.fr + dentalevolution.fr.
===============================================================

===============================================================
# QUESTIONS DU PUBLIC — FILE NOMINATIVE MODEREE (25 juil)
===============================================================
DEMANDES FONDATEUR : (a) "45 s c'est court, parfois on parle longtemps",
(b) "tout le monde ne doit pas poser sa question comme il veut",
(c) "le dentiste doit d'abord mettre mail nom prenom, on connait le nom de celui
qui veut poser une question, la regie active le bon dentiste et ca debloque son
telephone".

(a) PLUS DE MINUTEUR. Une question s'arrete quand la personne a FINI DE PARLER :
    8 s de silence detectees sur le telephone. Plafond de securite a 5 min (un
    telephone oublie ne doit pas monopoliser la parole). Compteur visible pendant
    qu'on parle. + Les morceaux d'une meme question sont RECOLLES au pupitre via
    un questionId : une question de 39 s arrivait en 8 lignes, elle arrive
    maintenant en UN bloc (verifie en prod).

(b)+(c) FILE DES MAINS LEVEES, NOMINATIVE.
    - Page publique : prenom, nom, e-mail obligatoires avant d'entrer (memorises
      en localStorage). Validation cote client ET nettoyage cote serveur (bornes
      de longueur, retrait des caracteres de controle et < >).
    - Le participant "demande la parole" -> il entre dans la file et voit SA
      position ("vous etes 3e sur 5").
    - Le pupitre voit la file NOMINATIVE et donne la parole a qui il veut, dans
      l'ordre qu'il veut. Seul le telephone autorise ouvre son micro.
    - "Terminer" reprend la parole et permet de passer au suivant.
    - Fermer les questions vide la file et previent tout le monde.
    - Chaque question affichee au pupitre porte le NOM de son auteur.

CHOIX DE CONFIDENTIALITE : l'e-mail n'est JAMAIS envoye au pupitre (cet ecran peut
etre projete en salle). Seul le nom s'affiche. L'e-mail reste cote serveur.

PREUVE EN PROD (3 dentistes identifies, conferencier EN) :
  file au pupitre : 1. Karim Bahmed (fr) / 2. Andrei Popescu (ro) / 3. Sofie
  Janssens (nl) ; chacun voit sa position sur son telephone.
  Le conferencier saute le 1er et donne la parole a Sofie -> son telephone se
  debloque, les deux autres restent bloques. "Terminer" -> il donne la parole a
  Karim -> sa question arrive au pupitre : "[Karim Bahmed] What is your irrigation
  protocol on a calcified MB2?"
CORRECTIF AU PASSAGE : l'amorce d'une question n'est plus polluee par les notes du
conferencier quand elles sont dans une autre langue que celle du demandeur.
===============================================================

===============================================================
# TRADUCTION EN DIRECT — VITESSE, SUPPORTS, COUT, PANNE (25 juil)
===============================================================
1) SUPPORTS DU CONFERENCIER (api/live-translate/lire-support.js)
   Il depose son PowerPoint / PDF / Word / texte : on en extrait le vocabulaire
   qui va armer l'oreille. .pptx/.docx/.odp = archives ZIP de XML -> lecture
   directe (jszip), diapos ET notes, tri numerique (diapo 2 avant la 10).
   PDF via pdf-parse. 15 Mo max. Les termes s'ajoutent dans le champ VISIBLE de
   la regie : le conferencier voit ce qui a ete retenu et peut corriger.
   Mise a jour du vocabulaire SANS couper la voix (message 'vocabulaire' ->
   session.update, au lieu de fermer/rouvrir la session d'ecoute).

2) TRADUCTION PROVISOIRE = LE GAIN DE VITESSE
   Les deltas de transcription arrivent PENDANT que l'orateur parle. On traduit
   la phrase partielle en TEXTE SEUL (mesure : 1er mot en 0,39 s contre ~0,9 s
   en audio) et on l'affiche en provisoire ; la version definitive la remplace.
   MESURE : 1er texte a l'ecran 3,30 s -> 2,43 s. Definitif 2,85 s.
   La VOIX n'est jamais provisoire (on ne peut pas "de-dire" un mot dans des
   ecouteurs) : seuls les sous-titres s'affinent.
   REGLE CENTRALE AJOUTEE : UN SOUS-TITRE NE RECULE JAMAIS. Deux sources
   ecrivent la meme ligne (provisoire + definitive) ; sans cette regle la phrase
   se raccourcit puis repousse ("Then we will address shaping with ProTaper
   Gold." remplace par "Then"). On ignore toute version plus courte que ce qui
   est affiche ; seule la version finale efface tout.

3) COUT — MESURE, PAS ESTIME (compterUsage() lit response.done.usage)
   Tarifs OpenAI /million de jetons :
     gpt-realtime      audio-in 32 $ | texte-out 24 $ | audio-out 64 $
     gpt-realtime-mini audio-in 10 $ | texte-out 2,40 $ | audio-out 20 $
   DEUX OPTIMISATIONS STRUCTURELLES :
   a) La session d'ECOUTE ne fait que transcrire, elle ne genere JAMAIS rien ->
      passee en gpt-realtime-mini (audio-in 3x moins cher). Verifie : meme
      transcription sur une phrase dense en marques. Idem session QUESTION.
      La voie PROVISOIRE (texte seul) passe aussi en mini (texte-out 10x moins
      cher, 346 ms contre 301 ms : ecart negligeable).
   b) LA VOIX N'EST PLUS PRODUITE SI PERSONNE NE L'ECOUTE. On fabriquait la
      synthese vocale meme quand aucun auditeur n'avait active l'audio — le
      poste le PLUS CHER de toute la chaine, gaspille. quelquUnEcoute() decide
      output_modalities par reponse : audio si des ecouteurs, texte sinon.
   MESURE par minute de parole, 2 langues cibles, ecouteurs actifs :
     appels au modele 44 -> 39 ; texte-in 7824 -> 6366 ; audio-in 5413 -> 4603.
     Mode economie (sans provisoire) : 18 appels, texte-in 3420.
   RESERVE HONNETE : l'audio d'entree de la session realtime n'est PAS declare
   par response.done (aucune reponse n'y est generee). Le chiffre exact doit se
   lire sur le tableau de bord OpenAI apres une repetition de 10 min.

4) PANNE DE CREDIT — "jamais a court, sinon on est cuits"
   - detection des codes fatals (insufficient_quota, billing_hard_limit_reached,
     invalid_api_key) ET des refus a la poignee de main (401/403/429, via
     l'evenement unexpected-response) -> banniere ROUGE immediate sur le pupitre.
   - bouton "Verifier le service avant de commencer" : ouvre une vraie session
     OpenAI et la referme. Feu vert AVANT de monter sur scene.
   - MODE ECONOMIE : coupe la traduction provisoire (poste le plus gourmand en
     appels). Bascule sur le pupitre.
   - compteurs pousses toutes les 10 s : minutes d'audio ecoutees, phrases
     captees, traductions, langues actives. Faits mesures, pas d'estimation.
===============================================================

===============================================================
# TRADUCTION EN DIRECT — RESISTER A LA COUPURE DE CREDIT (25 juil)
===============================================================
CONTEXTE : le fondateur a active le RECHARGEMENT AUTOMATIQUE OpenAI. Cela ne
supprime pas le risque, cela le rend TEMPORAIRE (plafond mensuel atteint, carte
refusee, delai entre solde zero et rechargement). Le systeme doit donc SURVIVRE
a la coupure et repartir SEUL, sans redemarrage en pleine conference.

PIEGE MAJEUR MESURE : une cle OpenAI INVALIDE ouvre quand meme le WebSocket.
Le 'open' arrive normalement ; le refus ne tombe qu'ENSUITE, en evenement
applicatif ({"code":"invalid_api_key"}), suivi d'une fermeture code 3000.
=> Le bouton "Verifier le service" se contentait du 'open' : il aurait affiche un
   FEU VERT MENSONGER avec une cle morte ou un compte a zero. Corrige : la
   verification va jusqu'a demander une VRAIE petite reponse au modele et
   n'annonce OK que si elle revient. C'est la seule preuve que le credit marche.
   Verifie en prod : "FEU VERT : Service OpenAI joignable et credit disponible".

REPRISE AUTOMATIQUE : les tentatives de reconnexion etaient a 800 ms FIXES —
en cas de coupure, cela martele l'API (et aggrave un depassement de debit) tout
en noyant le pupitre sous la meme alerte. Desormais : espacement progressif
1,4 s -> 2,6 s -> 4,7 s -> 8,4 s -> 15 s -> plafond 20 s (92 s couvertes en 8
tentatives), alerte envoyee au plus UNE FOIS TOUTES LES 20 s, et annonce
"Service rétabli — la traduction repart." des que ca revient.

===============================================================
# LE COUT SUIT LES LANGUES, PAS LE NOMBRE DE DENTISTES (prouve)
===============================================================
QUESTION FONDATEUR : "le prix est le meme si un ou 100 dentistes ecoutent le
vocal ?" -> OUI. C'est la propriete centrale de l'architecture (1 seul point de
capture -> 1 session par langue cible -> diffusion WebSocket a tous les
telephones ; JAMAIS de traduction par telephone).
MESURE, meme discours, tous en anglais AVEC ecouteurs :
   1 auditeur  : 13 appels | audio-out 316 jetons
  25 auditeurs : 13 appels | audio-out 349 jetons   (ecart de mesure, pas d'echelle)
=> Remplir la salle ne coute rien. Ajouter une LANGUE coute.
CONSEQUENCE PRODUIT : le modele economique tient sur le nombre de langues
ouvertes, pas sur l'affluence. Une salle de 300 dentistes en 2 langues coute le
meme prix qu'une salle de 3.
===============================================================

===============================================================
# QUESTIONS EN DIRECT AU PUPITRE (25 juil)
===============================================================
Les questions traduites arrivaient par BLOCS (a chaque morceau termine). Le
conferencier les voit desormais S'ECRIRE pendant qu'on les lui traduit : les
deltas de la traduction remontent au pupitre ({type:'question-partiel'}) dans un
bloc grise "Nom — en train de demander", remplace par la version definitive.
MESURE en prod : premier mot visible a 7,87 s, definitif a 8,01 s (question de
~7 s posee au telephone en francais, conferencier anglophone).
===============================================================

===============================================================
# 3 POSTES DISTINCTS — LA REGIE N'EST PAS LE PUPITRE (25 juil)
===============================================================
RECADRAGE FONDATEUR : "la regie c'est pas mon pupitre, le conferencier sera en
salle, la regie ailleurs". J'avais confondu les deux : je decrivais la regie
comme l'ecran du conferencier. Faux — en conference, la regie est en CABINE
TECHNIQUE (c'est elle qui capte le micro depuis la table de mixage), et le
conferencier est SUR SCENE.

TROIS POSTES, TROIS PAGES :
  1. REGIE  /traduction/regie.html      (cabine technique)
     capte le micro, seuil de captation, rythme, vocabulaire + depot de
     presentation, verification du service, mode economie, compteurs, file des
     mains levees et ATTRIBUTION DE LA PAROLE, ce que la machine entend.
  2. CONFERENCIER  /traduction/conferencier.html?r=<salle>   (sur scene) — NEUF
     Ne recoit QUE ce qui l'aide a parler : les questions traduites dans sa
     langue, qui s'ecrivent en direct, le nom du demandeur, le nombre de mains
     levees, l'etat de la liaison, et les alertes critiques. AUCUN reglage :
     rien a toucher sur scene. Gros texte (34 px), fort contraste, ecran
     maintenu allume (wakeLock), lisible debout a un metre.
  3. PUBLIC  /traduction/?r=<salle>     (telephone du dentiste)

TECHNIQUE : nouveau role WebSocket {type:'scene'} et Set r.scenes par salle.
versPupitre() diffuse aux deux, mais un FILTRE (POUR_LA_SCENE) ne laisse passer
vers la scene que question / question-partiel / question-encours / file /
alerte. Les reglages techniques (heard, conso, verif, rythme) restent en regie.
La regie affiche le LIEN + un QR de l'ecran de scene, pour l'installer en 10 s.

PREUVE EN PROD (3 postes separes simultanement) :
  ecran de scene -> etat "En direct", langue orateur "en", 4 mises a jour de
  file, 15 etapes d'ecriture en direct, question affichee "[Karim Bahmed]
  What is your irrigation protocol on a very calcified MB2?"
  reglages techniques recus par la scene : 0 (filtre verifie)
  la regie garde bien ses informations techniques.
===============================================================

===============================================================
# CE QUE LA CONFERENCE LAISSE AU CERVEAU JADOMI (25 juil)
===============================================================
DEMANDE FONDATEUR : "le conferencier depose son PowerPoint, l'IA analyse le texte
pour s'enrichir, ET ca s'enregistre pour enrichir l'IA des dentistes de JADOMI"
+ "les dentistes quand ils mettent leur mail, ca enrichit la liste de mailing".

AUCUNE TABLE CREEE — on se branche sur l'existant :
  - cabinet_brain_documents (source='conference', doc_type='formation') : le
    cerveau documentaire, deja 276 documents. Colonne embedding vector(1536)
    presente : l'indexation semantique pourra suivre sans migration.
  - bases_emails_importees + contacts_importes : la liste de diffusion, une base
    PAR CONFERENCE (on sait toujours d'ou vient un contact).
  - societe : lookup par NOM ('DENTALEVOLUTION', surchargeable par
    LIVE_TRANSLATE_SOCIETE_ID / _NOM). Jamais d'UUID code en dur.
  (Note : pas de MCP Supabase dans cette session et pas d'exec_sql en base — d'ou
   le choix d'utiliser les tables existantes plutot que d'ecrire un SQL que
   personne ne pourrait executer.)

CE QUI EST ARCHIVE (api/live-translate/corpus.js) :
  1. le SUPPORT depose (PowerPoint/PDF/Word) -> immediatement, avec les termes
     extraits en metadata ;
  2. a la fin de l'intervention : CE QUI A ETE DIT (transcription) + LES
     QUESTIONS de la salle avec leur auteur, duree, langue, nb de participants.
  Idempotent : checksum SHA-256 du contenu + contrainte UNIQUE (societe_id,
  checksum) -> rejouer une conference ne cree pas de doublon.

RGPD — DECISION IMPORTANTE : un e-mail n'entre dans la liste de diffusion QUE si
la personne a coche la case de consentement sur son telephone ("J'accepte de
recevoir les informations et les prochaines formations de Dental Evolution").
Sans consentement, l'e-mail N'EST PAS CONSERVE. Collecter sans consentement
aurait produit une liste inutilisable en droit.
PREUVE E2E : 2 dentistes, 1 consentant / 1 refusant -> liste "Conference <salle>"
avec 1 seul contact ; support et conference presents dans le cerveau.

===============================================================
# BUG EN SALLE : L'INTERRUPTEUR DE QUESTIONS MENTAIT (25 juil)
===============================================================
SYMPTOME : "j'ai ouvert les questions au public et ca fait rien, ca marque
toujours question fermee".
DIAGNOSTIC PAR LES LOGS : "ecran de scene connecte room=demo" en boucle, mais
AUCUN "pupitre connecte room=demo". La regie n'avait jamais demarre la
diffusion — donc aucune liaison WebSocket — donc le message d'ouverture n'etait
jamais envoye. L'interrupteur basculait visuellement quand meme.
=> Ce n'est pas un bug d'ouverture, c'est un CONTROLE QUI MENT SUR SON ETAT.
FIX : l'interrupteur est DESACTIVE tant que la diffusion n'est pas demarree, avec
la raison affichee ("Démarrez d'abord la diffusion : sans liaison, les questions
ne peuvent pas s'ouvrir"). Et la regie n'affiche plus sa case cochee mais l'etat
CONFIRME PAR LE SERVEUR (questions-etat renvoye aussi au pupitre).

AU PASSAGE : l'ecran de scene se reconnectait toutes les 5 min (socket inactif
coupe par le proxy). Ajout d'un battement de coeur serveur (ping toutes les 25 s)
sur tous les clients : plus de trous de reconnexion pendant une conference.
===============================================================

===============================================================
# LE DEPOT DE PRESENTATION PASSE SUR L'ECRAN DU CONFERENCIER (25 juil)
===============================================================
RECADRAGE FONDATEUR : "deposer le PowerPoint, ca doit etre sur l'ecran du
conferencier" + "garde-le sur la regie quand meme au cas ou".
C'est LUI qui a le fichier : la regie ne l'a pas. Le depot etait au mauvais poste.

  - ECRAN CONFERENCIER : bloc "Votre presentation" en haut, avec "Déposer ma
    presentation" et "Je suis pret". Il VOIT ce qui a ete retenu (liste des
    termes) et peut juger. Le bloc se replie tout seul des la premiere question
    ou sur "Je suis pret" : pendant l'intervention, l'ecran ne sert qu'a lire.
  - REGIE : depot CONSERVE, libelle "Déposer une presentation (secours)" — utile
    si l'operateur a recu le fichier par mail, ou pour ajouter des termes a la
    main. La regie affiche desormais le vocabulaire pose par le conferencier
    (message vocabulaire-etat) : les deux postes voient la meme chose.

TECHNIQUE : les messages 'support' et 'vocabulaire' sont acceptes des roles
'broadcaster' ET 'scene'. Nouveau message 'vocabulaire-etat' renvoye aux deux
postes (et a la connexion d'un ecran de scene, pour retrouver l'etat en cours).

PREUVE EN PROD : le conferencier depose ma-presentation.pptx depuis son ecran
(19 mots, 12 termes) -> la regie affiche "995 car. d amorce, vocabulaire =
ProTaper, ProTaper Gold, Zeiss, MB2, mise en forme canalaire, constriction…".
La regie depose ensuite recu-par-mail.pptx (11 mots, 7 termes) : les deux
chemins fonctionnent.

PIEGE DE TEST (a retenir) : mon premier banc concluait "la regie ne voit rien".
Faux — le client de test ne rejouait pas l'etape que la vraie page fait (renvoyer
le vocabulaire retenu apres extraction). Un test qui ne reproduit pas le
comportement reel du client invente un bug qui n'existe pas.
===============================================================

===============================================================
# L'ECRAN DU DENTISTE ETAIT FIGE — REECRIT EN ETAT VIVANT (25 juil)
===============================================================
REMONTEE FONDATEUR : "c'est pas vivant c'est statique, tout ce dont j'ai horreur.
J'ai desactive la parole et ca reste vert actif cote dentiste."

DEUX PROBLEMES, UN SEUL DEFAUT DE CONCEPTION.
Le serveur etait CORRECT (verifie : le telephone recoit bien
question-etat(retire) puis questions-etat(false)). Le defaut etait cote page :
CHAQUE MESSAGE REPEIGNAIT LE BOUTON DANS SON COIN. A la fermeture, le retrait de
la main repassait le bouton en VERT juste avant que la fermeture n'arrive —
eclair vert, puis etat fige.

FIX : UN SEUL ETAT, UN SEUL RENDU. Tout message met a jour un objet `etat`
{ouvertes, position, total, autorise, enregistre, enAttente, quiParle, message}
et on redessine. Impossible d'avoir deux morceaux d'interface qui se
contredisent.

+ BANDEAU VIVANT, avec pastille qui bat, 4 couleurs :
  FERME (gris)   "Questions fermées"
  OUVERT (vert)  "Questions ouvertes · 2 en attente" / "· Sofie Janssens a la parole"
  ATTENTE (ambre) "Vous êtes 2e sur 2 · Sofie Janssens a la parole"
  A VOUS (rouge) "C'est à vous — on vous écoute · 0:14" (chrono dans le bandeau)

+ NOUVEAU MESSAGE SERVEUR 'salle' diffuse a TOUS les auditeurs (pas seulement a
  ceux qui attendent) : {ouvertes, enAttente, quiParle}. Sans lui, l'ecran du
  dentiste ne pouvait pas savoir ce qui se passait dans la salle.

PREUVE (rejeu de la logique d'affichage sur les messages reels du serveur) :
  a l arrivee      -> FERME, bouton grise
  la regie OUVRE   -> OUVERT "Questions ouvertes"
  Sofie leve       -> OUVERT "· 1 en attente"
  Karim leve       -> ATTENTE "Vous etes 2e sur 2"
  parole a Sofie   -> ATTENTE "Vous etes 2e sur 2 · Sofie Janssens a la parole"
  fin de parole    -> ATTENTE "Vous etes le prochain"
  la regie FERME   -> FERME, bouton grise

PIEGE DE TEST (2e fois aujourd'hui) : mon banc attachait son ecouteur de file
APRES les mains levees -> il ratait les identifiants -> la parole n'etait jamais
donnee, et je concluais a tort a un bug serveur. Attacher les ecouteurs AVANT de
declencher l'action.
===============================================================

===============================================================
# QUESTIONS ECRITES + TRI PAR L'IA (25 juil)
===============================================================
DEMANDES FONDATEUR : "le dentiste peut poser ses questions par ecrit aussi",
"pas besoin d'attendre que les questions soient ouvertes", "si des questions sont
similaires l'IA doit pouvoir les relier, si des questions dans le meme theme
idem", "la regie verra les questions triees par l'IA".

1) QUESTION ECRITE — a TOUT MOMENT
   Le dentiste tape sa question sur son telephone. Contrairement a la parole,
   ECRIRE N'INTERROMPT PERSONNE : possible meme pendant que le conferencier
   parle, sans lever la main, sans attendre l'ouverture. C'est tout l'interet.
   Garde-fous : 3 a 600 caracteres, un envoi toutes les 10 s par personne.
   CHOIX : une question ecrite n'a PAS ete entendue par la salle -> elle ne part
   PAS dans les sous-titres du public (jobs marques `discret`), seulement au
   conferencier et a la regie, marquee d'une plume. Quand il y repond a voix
   haute, toute la salle a la reponse traduite. Fidele a la realite.

   BUG CORRIGE AU PASSAGE (bloquant) : la question ecrite n'arrivait jamais.
   La session de traduction vers la langue de l'ORATEUR s'ouvrait puis etait
   fermee AUSSITOT par cleanupSessions — aucun auditeur n'ecoute dans la langue
   de l'orateur, donc elle etait jugee inutile. Or c'est precisement elle qui
   traduit les questions vers son ecran. Exception ajoutee : tant qu'un
   conferencier est connecte, sa langue reste dans les langues utilisees.
   (Diagnostic : trace temporaire dans cleanupSessions ; verifie au prealable que
   OpenAI accepte bien une session src==cible — c'etait le cas.)

2) TRI PAR L'IA (api/live-translate/regrouper.js)
   Dans une salle de 200 dentistes, quinze posent la meme question autrement
   formulee. On regroupe par SUJET, les plus demandes d'abord.
   - modele texte gpt-4o-mini, sortie JSON stricte (ponctuel et court : 25x moins
     cher qu'une session vocale) ;
   - REPLI sans modele : regroupement par mots-cles rares partages. Mieux vaut un
     tri imparfait qu'un ecran vide en pleine conference ;
   - garde-fou : aucune question ne peut disparaitre du tri (les oubliees du
     modele forment leur propre groupe) ;
   - recolle les morceaux d'une meme question (meme qid) ;
   - retri differé de 5 s, jamais deux tris en parallele.
   AFFICHAGE : regie = liste "Sujets — tries par l'IA" (badge "3 demandent",
   sujet chaud en rouge) + la liste brute dans l'ordre d'arrivee en dessous.
   Scene = bandeau de pastilles "3× Irrigation MB2 calcifie" : le conferencier
   voit d'un coup d'oeil ce qui preoccupe la salle.

   PREUVE EN PROD (5 dentistes, 3 langues, questions NON ouvertes) :
     Karim (fr), Sofie (nl) et Andrei (ro) posent la MEME question autrement
     formulee -> un seul sujet "IRRIGATION PROTOCOL CALCIFIE (3 demandeurs)",
     place en PREMIER. Les deux autres questions forment leurs propres sujets.
     Le regroupement fonctionne malgre les 3 langues d'origine.

RESTE (demande, non fait) : fenetre VIDEO pour les participants a distance, avec
la transcription au meme endroit. C'est un chantier a part (diffusion video) —
voir lib/visio-signaling deja present dans JADOMI.
===============================================================

DECISION (25 juil) : la VIDEO a distance est ECARTEE par le fondateur — "on va
pas faire la visio pour l'instant, la traduction live c'est deja tres bien".
Ne pas relancer sans demande explicite. Chiffres mesures conserves si la question
revient : jadomi-srv 24 coeurs / 62 Go / NIC 1 Gbit/s, ffmpeg present, plafond
~400-500 spectateurs en auto-heberge a 1,5 Mbit/s. Piege a retenir : sous-titres
a 2,4 s contre video HLS a 5-20 s -> il faudrait RETARDER les sous-titres de la
latence video, sinon le spectateur lit la traduction avant de voir l'orateur.

===============================================================
# LE MODULE DEVIENT VENDABLE — MULTI-FORMATEUR + CLE DE SALLE (25 juil)
===============================================================
DEMANDE FONDATEUR : "tout ca est la propriete de JADOMI, mets tout sur JADOMI
pour que je puisse le vendre aux formateurs" — puis, important : "pour cette
formation je peux pas encore parler de JADOMI, sauf si on sort un truc vendable".
=> Septembre reste NEUTRE sur dentalevolution.fr (branding inchange). En
parallele, on rend le module vendable.

1) FIN DU MONO-CABINET
   Le corpus et les contacts etaient cables sur DENTALEVOLUTION. Desormais chaque
   salle porte SON organisateur : {type:'broadcaster', societe, cle, titre}.
   corpus.js prend un identifiant de societe par salle ; l'organisateur par
   defaut du serveur n'est plus qu'un repli.
   La table societes contenait deja tout le modele produit : is_formation_provider,
   modules, plan. Rien a creer.
   PREUVE : deux formateurs (DENTALEVOLUTION et Precision Dentaire), deux
   conferences simultanees -> chacun recoit SON support et SA liste, aucune fuite
   croisee verifiee en base.

2) CLE DE SALLE — CE QUI REND LE PRODUIT VENDABLE
   Sans elle, connaitre l'UUID d'une societe suffisait pour verser du contenu
   dans son cerveau et des contacts dans sa liste. Inacceptable pour un produit
   paye. La cle est une signature HMAC-SHA256 de l'identifiant de societe
   (secret serveur), tronquee a 24 caracteres, comparee en DUREE CONSTANTE.
   Stateless : rien a stocker, rien a revoquer table par table.
   Le formateur recoit un lien de regie qui porte sa cle :
     https://jadomi.fr/live-translate/regie.html?s=<societe>&k=<cle>
   corpus.lienRegie(societeId) le genere.
   PREUVE : sans cle -> refuse ; cle inventee -> refuse ; bonne cle -> accepte.
   Rien n'entre chez la societe visee dans les deux premiers cas (verifie en base).

RESTE pour la commercialisation (non fait) :
   - activation du module et facturation (societes.modules / plan / billing.js) ;
   - page produit sur jadomi.fr a destination des formateurs ;
   - generation du lien de regie depuis le dashboard (aujourd'hui : appel a
     corpus.lienRegie cote serveur).
===============================================================
