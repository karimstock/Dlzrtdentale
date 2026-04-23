# Regles de mise a jour automatique du CODEX.md

Ce document definit comment Claude Code doit maintenir
/home/ubuntu/jadomi/CODEX.md de maniere systematique.

## Regle n1 -- Obligation d'actualiser a CHAQUE passe

A la FIN de chaque passe de developpement (passe 20, 21, 22...), 
Claude Code DOIT obligatoirement :

1. Lire /home/ubuntu/jadomi/CODEX.md
2. Ajouter dans la section 6 "HISTORIQUE DES PASSES" un nouveau
   paragraphe avec :
   - Numero de passe + date
   - Titre resumant la passe
   - Liste des fichiers crees/modifies (resume)
   - Fonctionnalites livrees (bullet points concis)
   - Migrations SQL executees (si applicable)
3. Mettre a jour le header (Derniere mise a jour + Derniere passe)
4. Mettre a jour section 8 "ROADMAP" (cocher items completes, ajouter)
5. Mettre a jour section 10 "BUGS CONNUS & TODO" (retirer bugs fixes,
   ajouter nouveaux)

## Regle n2 -- Concision

Chaque entree historique des passes <= 10 lignes. Factuel, pas narratif.

## Regle n3 -- Pas d'ecrasement silencieux

Ne JAMAIS supprimer une section complete sans en informer dans le
rapport de passe. Ajouter, corriger, consolider uniquement.

## Regle n4 -- Git commit du CODEX

Apres chaque mise a jour du CODEX, commit git separe :
```
git add CODEX.md
git commit -m "chore(codex): update after Passe X"
```

## Regle n5 -- Alerte en fin de passe

Dans le rapport final de chaque passe (message affiche a Karim),
INCLURE EXPLICITEMENT une ligne du type :
"CODEX.md mis a jour (section 6 + 8 + 10)"

## Regle n6 -- Demande d'information manquante

Si Claude Code manque d'information pour actualiser proprement le
CODEX, il DEMANDE a Karim avant de documenter a la legere.

## Regle n7 -- Lecture obligatoire au demarrage

Au DEBUT de chaque nouvelle session Claude Code, lire CODEX.md pour
se synchroniser avec l'etat actuel du projet AVANT d'executer toute
tache.
