# JADOMI Studio — Architecture Vidu AI

## RÈGLES ANTI-GASPILLAGE (après incident Kling 150$)

1. JAMAIS de génération sans calcul de coût affiché au client
2. JAMAIS de batch sans validation d'UN test d'abord  
3. Bloquer automatiquement si coût > 5$ sans confirmation
4. Logger chaque appel dans /tmp/vidu-spending.log
5. Utiliser Q3-turbo 720p par défaut (le meilleur rapport qualité/prix)
6. Lancer les jobs en off-peak (nuit) quand possible → -50%
7. DeepSeek prépare le prompt AVANT d'envoyer à Vidu → 1er essai réussi

## Pipeline optimisé (zéro gaspillage)

```
1. Client écrit son idée (texte ou voix)
2. DeepSeek améliore le prompt (0.001$)
3. Client preview le prompt + voit le coût exact en tokens
4. Client confirme → génération Vidu
5. Polling résultat → vidéo livrée
6. Coût logué dans vidu-spending.log
```

## Modèles à utiliser par cas

| Cas d'usage | Modèle | Résolution | Coût/s | Off-peak |
|---|---|---|---|---|
| Vidéo produit rapide | Q3-turbo | 720p | 0.06$ | 0.03$ |
| Vidéo produit premium | Q3-pro | 1080p | 0.15$ | 0.075$ |
| Avatar cohérent | Q3-mix | 720p | 0.125$ | - |
| Digital Human | Q2-turbo | - | 0.60$ base | - |
| Lip-sync | - | - | 0.02$/s | - |
| Voice Clone | - | - | 0.15$ unique | - |
| Pub complète | AD-Film | 1080p | 0.20$/s | - |

## Fichiers

- lib/ai-studio/providers/vidu.js — Provider avec sécurité coût
- public/studio/video-creator.html — Dashboard création
- public/studio/index.html — Landing page Studio

## Budget

- 20 000 crédits = 100$ (acheté 13/05/2026)
- Log dépenses : /tmp/vidu-spending.log
