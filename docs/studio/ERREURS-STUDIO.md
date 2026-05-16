# JADOMI Studio — Erreurs et bonnes pratiques

> Ne JAMAIS refaire ces erreurs. Toujours suivre ces regles.

## IMAGES PRODUIT

### ERR-01 : Générer des images IA sans référence
- **Symptome** : loupes trop grosses, design inventé, pas fidèle
- **Fix** : TOUJOURS envoyer la VRAIE photo produit en référence à l'IA
- **Regle** : référence photo réelle → prompt de modification = bon résultat

### ERR-02 : Essayer de remplacer un logo avec Vidu
- Vidu est fait pour la vidéo, pas l'inpainting photo
- **Fix** : utiliser NanoBanana (Gemini 3 Pro) ou Gemini direct pour l'édition d'images

### ERR-03 : Ne pas extraire les images du PDF original
- Le PDF Dental Evolution avait DÉJÀ les images brandées ZENDO
- **Fix** : TOUJOURS commencer par `pdfimages -j -all fichier.pdf` pour extraire les images existantes
- **Commande** : `pdfimages -j -all input.pdf output-prefix`

### ERR-04 : Patcher un fichier HTML 15 fois avec sed
- Le HTML devient cassé (div non fermées, images dupliquées)
- **Fix** : repartir de zéro avec un agent propre plutôt que patcher

### ERR-05 : Utiliser photo-4.jpg partout
- Une seule image répétée 7 fois = pas un catalogue
- **Fix** : chaque modèle a SA photo spécifique

## GÉNÉRATION D'IMAGES — QUEL OUTIL POUR QUOI

| Besoin | Outil | Pourquoi |
|--------|-------|----------|
| Photo lifestyle (blonde avec loupes) | NanoBanana | Meilleure qualité, loupes réalistes |
| Inpainting (retirer/remplacer logo) | NanoBanana ou Gemini | Comprend le contexte |
| Photo produit fidèle | Extraire du PDF original | C'est le vrai produit |
| Vidéo produit | Vidu | Moins cher, bonne qualité |
| Vidéo avatar parlant | Vidu (lip-sync) | Audio natif |
| Prompt/analyse | DeepSeek | Le moins cher |

## CLOUD FUNCTION GEMINI US

- URL : https://gemini-image-proxy-19878563910.us-central1.run.app
- Projet : gen-lang-client-0700354042
- Modèles image : gemini-2.5-flash-image, gemini-3-pro-preview
- 50 images/jour GRATUITES
- Nécessaire car Gemini bloque la génération d'images depuis la France

## APIS ET CLÉS

| Service | Clé .env | Crédits |
|---------|----------|---------|
| Gemini | GEMINI_API_KEY | 50 img/jour gratuit (tier payant activé) |
| Vidu | VIDU_API_KEY | 19 828 / 20 000 crédits |
| DeepSeek | DEEPSEEK_API_KEY | ~48$ restants |
| NanoBanana | NANOBANANA_API_KEY | 50 crédits gratuits (revendeur) |

## RÈGLES D'OR

1. Extraire les images du PDF AVANT de générer avec l'IA
2. TOUJOURS envoyer la vraie photo en référence
3. NanoBanana > Vidu pour les photos
4. Vidu > tout le monde pour la vidéo
5. Gemini gratuit via Cloud Function US
6. Ne JAMAIS patcher un HTML plus de 3 fois → repartir de zéro
7. Vérifier chaque image AVANT de l'intégrer
