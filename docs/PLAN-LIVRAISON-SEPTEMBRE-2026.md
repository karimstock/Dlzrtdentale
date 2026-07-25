# JADOMI — PLAN DE LIVRAISON SEPTEMBRE 2026
> Rédigé le 25 juillet 2026. **38 jours** avant le 1er septembre.
> Document de cadrage : à relire au début de CHAQUE session d'ici la livraison.

---

## 1. LE CONSTAT, MESURÉ (pas ressenti)

Audit exécuté le 25 juillet (`scripts/_audit_vitalite.js`, comptage réel des 430 tables déclarées) :

| Fait mesuré | Chiffre |
|---|---|
| Tables déclarées dans `sql/` | **430** |
| Tables créées mais **VIDES** | **319 (74 %)** |
| Tables portant de la donnée | **111 (26 %)** |

**Où la donnée est réellement :**

| Actif | Volume réel | Lecture |
|---|---|---|
| `products_database` | **1 487 281** | Le catalogue. Personne d'autre ne l'a. |
| `scraped_prices` | 255 930 | Les prix captés. |
| `product_clusters` | 155 236 | Le rapprochement des références. |
| `patients_jadomi` | 7 738 | Vrais patients du cabinet. |
| `dentiste_pro_agenda` | 2 054 | Vrais rendez-vous. |
| `dke_ccam_*` | ~2 600 | Le savoir dentaire structuré (actes, tarifs, paniers 100 % Santé). |
| Compta (3 tables) | 306 | **Zéro table vide** — le module le plus sain de la plateforme. |

**Le catalogue + les prix représentent 97 % de toute la donnée de JADOMI.**

**Ce qui est du décor :** Labo 44 tables dont 36 vides · Sites/CMS/Studio 39 dont 24 vides · Avocat 30 dont 23 vides · IDE 12 dont 7 vides.

### Le diagnostic en une phrase
JADOMI n'a pas un problème de qualité, il a un problème de **largeur**. Onze métiers ouverts, deux ou trois qui portent de la donnée réelle. Le module Équipe illustre le motif : 1848 lignes de backend, 26 routes, un moteur de journée complet — et **2 fiches de démo** en base, aucun salarié réel.

**Règle pour les 38 jours : on ne construit rien de neuf. On rend VIVANT ce qui existe.**

---

## 2. LA DÉCISION DE PÉRIMÈTRE

### On livre (5 chantiers, pas un de plus)
1. **FaceMatch** — priorité absolue du fondateur. Doit être fonctionnel de bout en bout.
2. **Encaisser** — la société JADOMI existe, le compte Qonto est ouvert. Sans encaissement, « livrable » ne veut rien dire.
3. **Le cabinet dentaire réel** — patients, agenda, équipe, avec du vrai personnel.
4. **La compta** — déjà le module le plus sain ; le finir, pas le refaire.
5. **Les achats en direct** — la seule chose qui transforme 1,9 M de lignes dormantes en euros.

### On gèle (sans rien supprimer — règle absolue « ne jamais casser »)
Avocat, IDE, Labo, Paramédical, Sites/CMS/Studio, BTP, SCI, Créateur, Bien-être.
Ils restent en ligne, ils ne reçoivent **aucun développement** d'ici septembre. Un module gelé qui marche vaut mieux que onze modules à moitié finis.

---

## 3. FACEMATCH — ÉTAT EXACT ET PLAN

### 3.1 Ce qui est vérifié aujourd'hui (25 juillet)

**Ce qui MARCHE (côté JADOMI, serveur 217) :**
- `POST /api/facematch/publish` est monté et **correctement gardé** — répond 401 sans le bon jeton, `FACEMATCH_PUBLISH_SECRET` est bien défini. Pas de lien au porteur.
- `GET /api/facematch/twin/:token` répond.
- La page publique `/j/:token` existe, le viewer Three.js est servi en local (fonctionne sans internet).
- Le fix COLMAP est commité : `999dcdd` « la RTX n'a JAMAIS reconstruit — colmap.exe lancé sans ses DLL (0xC0000135) ».

**Ce qui NE MARCHE PAS :**
- **`uploads/facematch/` contient 0 jumeau.** La chaîne n'a **jamais** tourné de bout en bout.
- Le service `facematch-api` est **arrêté**.
- La prod `141.94.10.182` ne répond ni sur le port 8000 ni sur 3000.
- Le fix COLMAP n'a **jamais été validé sur une vraie session** — on a corrigé la cause identifiée, on n'a pas prouvé le résultat.

**Conclusion honnête : ce qui reçoit fonctionne, ce qui produit n'a jamais livré une seule reconstruction.**

### 3.2 Les lots, dans l'ordre. Chacun a sa PREUVE.

> Règle : un lot n'est pas « fait » parce que le code est écrit. Il est fait quand la preuve existe, mesurée, sur du réel.

**LOT 1 — Remettre la production debout**
- Établir quel serveur est la prod FaceMatch (217 ou 141), et le dire dans le CODEX. Le piège des 2 serveurs a déjà coûté une session entière.
- Remonter le service, vérifier l'espace disque (141 était plein).
- **PREUVE** : l'API répond publiquement, et on peut le montrer avec une URL et un code HTTP.

**LOT 2 — Prouver que la RTX reconstruit**
- Lancer UNE session de scan réelle, du premier cliché au maillage.
- Vérifier que COLMAP démarre vraiment (plus de 0xC0000135) et qu'il n'y a **aucun repli silencieux** vers pycolmap. Un repli silencieux est un mensonge : il doit lever une erreur visible.
- **PREUVE** : un maillage réel, le nombre d'images, le temps de reconstruction, et le log qui nomme le moteur utilisé. Pas « ça a l'air de marcher ».
- ⚠️ La RTX met **25-30 s à froid**. Ne jamais conclure sur un premier appel.

**LOT 3 — La chaîne complète jusqu'au patient**
- Scan → reconstruction → `POST /publish` → lien `/j/:token` → le visage tourne sur un téléphone.
- **PREUVE** : `uploads/facematch/` contient au moins un jumeau réel, et le lien s'ouvre sur un téléphone qui n'est pas celui du développeur.

**LOT 4 — L'installation sans connaissance technique**
- L'exécutable cabinet doit s'installer en 1 clic, sans terminal, sans PATH à régler, sans Python.
- Il doit dire ce qu'il fait et échouer **bruyamment** quand quelque chose manque.
- **PREUVE** : installation sur une machine vierge, par quelqu'un qui n'est pas le fondateur.

**LOT 5 — Le garde-fou patient**
- Le lien patient est permanent (règle « passeport permanent ») mais il porte le visage d'une personne : garde-fou d'identité obligatoire dès le départ, domaine jadomi.fr, jamais un lien de stockage brut.
- **PREUVE** : un lien volé ne suffit pas à voir le visage sans le second facteur.

**LOT 6 — La mesure de fiabilité**
- 10 scans réels consécutifs. On compte : combien réussissent, en combien de temps, avec quelle qualité.
- **PREUVE** : un tableau chiffré. Si le taux est de 6/10, on l'écrit 6/10.

### 3.3 Ce qu'on ne fait PAS sur FaceMatch
- Pas de FaceLift (il **invente** le visage — un visage inventé sur un patient est une faute).
- Pas de nouveau moteur de reconstruction. Il y en a déjà trois en concurrence, c'est une partie du problème.
- Pas d'Android, pas de Modal (déjà écartés).
- L'IA n'améliore **que** depuis le réel. Un trou reste un trou.

### 3.4 Définition de « livrable » pour FaceMatch
> Un dentiste qui n'est pas le fondateur installe le logiciel, scanne un patient, et ce patient ouvre son propre visage en 3D sur son téléphone. Sans qu'aucun développeur n'intervienne.

Tant que cette phrase est fausse, FaceMatch n'est pas livrable.

---

## 4. LES QUATRE AUTRES CHANTIERS

### 4.0 ENCAISSER — la société existe, l'argent ne rentre pas encore

**Nouveau au 25 juillet : la société JADOMI est créée et le compte bancaire Qonto est ouvert.** C'est ce qui manquait. Il reste à relier ce compte à la plateforme.

**État vérifié le 25 juillet (interrogation directe de l'API Stripe, pas un rapport) :**

| Élément | État réel |
|---|---|
| Compte Stripe | « Environnement de test JADOMI » — France, euros |
| Clé secrète | `sk_test_…` → **mode TEST uniquement** |
| Clé publique (`STRIPE_PUBLISHABLE_KEY`) | **ABSENTE** — sans elle, aucun formulaire de paiement ne s'affiche |
| Secret du webhook | **ABSENT** |
| Encaissements (`charges_enabled`) | **NON** |
| Virements vers la banque (`payouts_enabled`) | **NON** |
| Tarifs créés | **0** |

**Traduction : aucun euro ne peut être encaissé aujourd'hui. La plateforme est en bac à sable.**

**Les étapes, dans l'ordre :**
1. **Activer le compte Stripe avec la société JADOMI** : SIREN, adresse, pièce d'identité du dirigeant, **IBAN Qonto**. C'est ce qui fait passer encaissements et virements à OUI. Compter 24 à 48 h de vérification. *(Action fondateur — je ne peux pas la faire à sa place.)*
2. **Décider le modèle de prix, puis créer les tarifs.** Décision qui revient au fondateur : à la conférence (facile à vendre, revenus irréguliers) ou à l'abonnement mensuel avec quota d'heures incluses (revenus prévisibles, plus dur à vendre à qui fait trois formations par an). Le coût réel étant d'une dizaine d'euros par heure de conférence, l'abonnement avec quota est probablement le bon terrain — mais c'est son marché.
3. **Basculer les clés en production** : clé secrète *et* clé publique. Les deux, sinon le paiement ne s'affiche pas.
4. **Configurer le webhook et son secret.** C'est lui qui ouvre le module après paiement. **Sans le secret, un paiement réussi n'activerait rien : le client paierait sans rien recevoir.** C'est le point le plus dangereux de tout le chantier.
5. **Un premier paiement réel de bout en bout**, remboursé ensuite.

**PREUVE** : un euro réellement débité, le module réellement ouvert par le webhook, et le virement visible sur le compte Qonto. Tant que ces trois choses ne sont pas vues, l'encaissement n'est pas livrable.

### 4.1 Le cabinet dentaire réel
- Le fondateur crée son **vrai personnel** via l'écran (jamais en SQL). Les 2 fiches de démo sont retirées ensuite.
- La journée vivante est éprouvée sur une vraie semaine, avec une vraie absence.
- **PREUVE** : une assistante réelle utilise l'écran un jour entier et dit si c'est utile ou non.

### 4.2 La compta
- Reste : garde-fous à l'ingestion du scan mail, déduplication rétroactive en base (destructif → essai à blanc validé avant), exclusion perso via le moteur de règles.
- Le moteur de rapprochement multi-yeux apprend à mesure que le fondateur confirme : il faut **des confirmations réelles** pour que la mémoire des libellés serve.
- **PREUVE** : un mois complet rapproché sans intervention manuelle au-delà de l'ambigu.

### 4.3 Les achats en direct
- Le dentiste tape un produit → JADOMI cherche **en direct** dans la base fournisseur avec sa session. Pas de scraping.
- Déjà prouvé sur Henry Schein (~200-450 ms, remises réelles). GACD passe par le nœud RTX du cabinet (IP résidentielle).
- Reste : module de recherche, endpoint parallèle, barre de recherche, panier.
- **PREUVE** : une commande réelle passée depuis JADOMI, avec l'économie constatée en euros.

---

## 5. LES RÈGLES DE TRAVAIL (non négociables)

1. **Vérifier avant de construire.** Le réflexe coûteux de ce projet est de rebâtir ce qui existe. Chercher le module, la table, la route — *puis* décider.
2. **Zéro décoration.** Tout chiffre affiché vient d'un fait mesuré en base, avec sa date. Un statut inventé est un mensonge.
3. **Mesurer en base, pas dans le code.** Le code dit ce qui est possible ; la base dit ce qui est vrai. L'écart entre les deux est le vrai sujet de ce projet.
4. **Ne jamais casser, ne jamais supprimer** une route, un onglet, un dashboard sans demande explicite.
5. **Un échec doit être bruyant.** Les trois bugs les plus coûteux de ce projet (COLMAP sans DLL, le nœud RTX écarté en silence, le 400 avalé par le front) sont tous des **échecs silencieux**. Un repli discret vaut moins qu'une erreur visible.
6. **Backup avant `server.js` / `index.html`**, `node -c` avant tout `pm2 reload`, `new Function()` pour le JS des pages.
7. **Souveraineté** : relevés bancaires et données patient restent en local (Ollama / serveur France). Jamais dans un contexte cloud US.
8. **Le fondateur crée ses données via le produit.** Si un module ne peut être rempli que par un développeur en SQL, il n'est pas livrable.

---

## 6. CE QUI PEUT FAIRE ÉCHOUER LA LIVRAISON

| Risque | Réalité | Parade |
|---|---|---|
| FaceMatch ne reconstruit toujours pas | Le fix n'est pas validé sur du réel | **LOT 2 en premier.** Si la RTX ne reconstruit pas au 5 août, on le sait et on décide. |
| Le dépôt GitHub est décorrélé | 980 commits locaux, aucun ancêtre commun avec `origin`, 6,38 Go dont des fichiers > 100 Mo refusés | Aujourd'hui seul le CODEX est synchronisé. Décider avant septembre : réaligner proprement, ou assumer que GitHub ne porte que la documentation. |
| Deux sessions travaillent en parallèle | Constaté le 25 juillet : commits concurrents sur `index.html` et `server.js` | Une seule session à la fois sur les gros fichiers. |
| L'envie d'ouvrir un douzième métier | C'est le motif qui a produit 319 tables vides | Le périmètre du §2 est fermé. |
| **Aucun euro encaissable** | Stripe en mode test : clé publique et secret du webhook absents, 0 tarif, virements inactifs | **Activation Stripe dès cette semaine** — 24 à 48 h de vérification, c'est le seul délai qu'on ne peut pas compresser. |
| **Un paiement qui n'ouvre rien** | Sans le secret du webhook, le client paie et ne reçoit rien | Ne jamais mettre la clé de production en ligne avant que le webhook soit configuré ET testé. |
| Le disque | 141 était plein, 217 à 80 % | Vérifier chaque semaine. |

---

## 7. LE JALON

**1er septembre 2026 — ce qui doit être vrai :**

1. Un dentiste tiers installe FaceMatch, scanne un patient, le patient voit son visage en 3D sur son téléphone. Sans développeur.
2. **Un client paie, l'argent arrive sur le compte Qonto, et le module s'ouvre tout seul.**
3. Le vrai personnel du cabinet utilise la journée vivante, sur de vraies données.
4. Un mois de compta se rapproche tout seul, sauf l'ambigu.
5. Une commande fournisseur réelle est passée depuis JADOMI, avec l'économie chiffrée.

Tout le reste est gelé, en ligne, intact.

**Si un seul de ces quatre points n'est pas vrai, on le dit — on ne le maquille pas.**
