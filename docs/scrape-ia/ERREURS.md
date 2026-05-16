# Scrape IA — Erreurs et solutions

> Chaque bug documente pour ne JAMAIS le refaire.

## ERR-001 : 94% doublons DGD (best-sellers repetes)
- **Symptome** : toutes les categories retournent les memes 10 produits
- **Cause** : DGD affiche un bloc "meilleures ventes" identique en haut de CHAQUE page categorie. Le `findPriceZone` trouvait le premier `E` dans CE bloc.
- **Fix** : chercher le selecteur "Trier" dans le HTML brut, couper tout ce qui est avant, ne parser que la zone categorie reelle
- **Regle** : TOUJOURS verifier les doublons cross-categories avant de valider un scraper

## ERR-002 : Gemini quota 0 sur nouveau projet
- **Symptome** : `limit: 0` sur toutes les metriques Gemini
- **Cause** : projet Google Cloud trop recent, le free tier n'est pas active immediatement
- **Fix** : cascade automatique vers DeepSeek/Mistral. Gemini s'active sous 24h.
- **Regle** : ne JAMAIS dependre d'un seul provider IA

## ERR-003 : Mistral "capacity exceeded" sur tier Experiment
- **Symptome** : `Service tier capacity exceeded` apres ~10 appels
- **Cause** : quota gratuit Mistral tres limite (reset par minute)
- **Fix** : retry avec pause 65s. Mais mieux : utiliser DeepSeek qui n'a pas de rate limit
- **Regle** : pour du batch, DeepSeek >> Mistral gratuit

## ERR-004 : Ollama timeout sur CPU
- **Symptome** : socket hang up apres 120s
- **Cause** : Mistral 7B sur CPU sans GPU = ~10s pour 20 tokens. 6000 chars en entree + 4000 tokens output = 3-5 min
- **Fix** : augmente timeout a 300s + reduit le contenu envoye. Mais Ollama reste le dernier recours.
- **Regle** : Ollama = fallback offline seulement, pas pour du batch

## ERR-005 : HTML envoye trop gros (30KB = 7500 tokens gaspilles)
- **Symptome** : cout eleve, reponses lentes
- **Cause** : envoyait le HTML nettoye brut (30KB) avec plein de balisage inutile
- **Fix** : Cheerio pre-traite et extrait les blocs pertinents, envoie ~2500 chars (~700 tokens)
- **Regle** : Cheerio fait le mecanique, l'IA fait l'intelligent. JAMAIS envoyer du HTML brut.

## ERR-006 : JSON API (DoctorStrong) retourne 0 produit
- **Symptome** : `analyzeProducts` retourne [] sur du JSON
- **Cause** : le prompt disait "extrais de ce HTML" mais le contenu etait du JSON
- **Fix** : detection auto JSON (startsWith '{' ou '[') → `analyzeJSON()` avec prompt dedie
- **Regle** : TOUJOURS detecter le format avant d'envoyer a l'IA

## ERR-008 : Praxisdienst 90% doublons (product-box non detecte)
- **Symptome** : toutes les pages retournent les memes 7 produits
- **Cause** : Praxisdienst utilise Shopware avec des classes BEM `prx-product-box__name` etc. Le Cheerio cherchait des `<a>` avec prix dans le texte, mais les prix sont dans des `<span>` separees.
- **Fix** : Strategie A dans analyzer.js — detecter les product-box par patterns CSS multi-CMS (`[class*="product-box"]`, `[class*="product-item"]`, etc.), extraire nom/prix/marque/image avec les bons selecteurs BEM.
- **Regle** : TOUJOURS tester le taux de doublons cross-pages avant de valider un fournisseur. Si >50% doublons → le Cheerio rate la zone produits.

## ERR-007 : DPI sitemap — 0 produits trouves
- **Symptome** : sitemap parse mais 0 URLs produit
- **Cause** : DPI met les produits a la racine (`/charisma-capsule`) pas dans `/produit/`
- **Fix** : `productUrlFilter` custom par fournisseur au lieu d'un pattern global
- **Regle** : chaque fournisseur a sa propre structure d'URLs

## ERR-009 : DGD prix de variantes mélangés
- **Symptome** : un produit en base a 37.70€ mais la page web montre 70.20€, 16.70€, 30.40€
- **Cause** : les pages catégories DGD affichent des gammes avec "à partir de" et les fiches article ont plusieurs variantes à des prix différents. Le scraper capte un prix mais on sait pas quelle variante c'est.
- **Fix** : scraper les fiches article individuelles (article_xxx.html) qui ont 1 prix par référence exacte
- **Regle** : pour le comparateur, un prix DOIT correspondre à UNE référence précise, jamais à une gamme

## ERR-010 : MegaDental prix remisés expirés
- **Symptome** : prix en base (64.77€) inférieur au prix actuel du site (84.40€)
- **Cause** : les prix remisés Venta changent régulièrement (promotions temporaires). Le scraper a capté un ancien prix promo.
- **Fix** : rescraper régulièrement (cron hebdomadaire). Le prix en base doit avoir un `scraped_at` récent.
- **Regle** : afficher la date du dernier scrape dans le comparateur. Un prix > 30 jours = badge "prix à vérifier"

## ERR-011 : Prix Venta identiques entre DoctorStrong/DoctorAI/MegaDental
- **Symptome** : en base, DoctorStrong et DoctorAI ont le meme prix pour le meme produit
- **Cause** : le scraper Venta API utilise UNE seule source (DoctorStrong) et duplique le prix pour les 3 sites. Mais chaque site a ses propres remises (ex: Remin Pro = 57.87€ DS vs 57.82€ DAI).
- **Fix** : interroger l API suggest de CHAQUE site separement (doctorstrong.fr, doctor-ai.fr, megadental.fr) pour capter le special_price propre a chaque fournisseur.
- **Regle** : TOUJOURS stocker le prix PAR fournisseur. Jamais copier un prix d un site a l autre.
