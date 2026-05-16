# Scrape IA — A faire / A revoir

## PRIORITE 1 — En cours
- [ ] Full scrape DGD 19 categories (pipeline optimise v3)
- [ ] Full scrape Praxisdienst 15 categories
- [ ] Full scrape DoctorStrong/DoctorAI/MegaDental (API JSON)
- [ ] Telecharger les photos produit en local

## PRIORITE 2 — A faire
- [ ] Full scrape DPI via sitemap (8700 fiches)
- [ ] Full scrape HenrySchein
- [ ] Full scrape DentalClick
- [ ] Cross-matching IA entre tous les fournisseurs
- [ ] Import Supabase (scraped_prices)
- [ ] Cron automatique 1x/semaine la nuit
- [ ] GACD via Algolia (cle dynamique a recuperer)

## PRIORITE 3 — Ameliorations
- [ ] Deduplication par ref fabricant avant import BDD
- [ ] Scraper les fiches produit individuelles DGD (vrais prix par variante)
- [ ] Ajouter colonne image_url dans scraped_prices si absent
- [ ] Dashboard admin pour suivre le scraping (nb produits, derniere MAJ, erreurs)
- [ ] Alerte email si un scraper echoue

## A REVOIR
- DGD : les pages categorie donnent des prix "a partir de" (gamme). Pour les vrais prix unitaires il faut scraper les fiches article individuelles
- Praxisdienst : seulement 2-3 produits/page — verifier que Cheerio capte bien la zone produits
- GACD : l'API Algolia necessite une cle session dynamique (scrape-gacd-algolia.js existant)
- Photos : certaines URLs sont relatives, d'autres en CDN — normaliser
