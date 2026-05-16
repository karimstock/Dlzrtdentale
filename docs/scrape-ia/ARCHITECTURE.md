# Scrape IA Pipeline — Architecture

> Document vivant. Mis a jour a chaque iteration.
> Derniere MAJ : 13 mai 2026 (Passe 80)

## Principe

```
HTML brut (Cheerio) → pre-traitement local (0 token) → IA normalise (tokens reduits) → BDD
```

**Regle d'or : Cheerio fait le boulot mecanique, l'IA fait le boulot intelligent.**

## Cascade IA (ordre de priorite)

| Niveau | Provider | Cout | Vitesse | Usage |
|--------|----------|------|---------|-------|
| 1 | Gemini Flash 2.0 | GRATUIT | 15 RPM | Batch de nuit |
| 2 | DeepSeek V3 | 0.27$/M in | Rapide, pas de rate limit | Production |
| 3 | Mistral Small | 0.13E/M | Rate limit tier gratuit | Fallback |
| 4 | Ollama local | 0E | Lent (CPU) | Dernier recours |

## Fichiers

```
lib/scrape-ia/
  analyzer.js       — Cerveau IA (Cheerio pre-traite + IA normalise)
  raw-fetcher.js    — Scraper brut HTTP (fetch + save, zero parsing)
  cross-matcher.js  — Matching produits entre fournisseurs

scripts/
  scrape-ia-pipeline.js  — CLI orchestrateur (--test/--fetch/--analyze/--full/--crossmatch/--status)
```

## Fournisseurs configures

| ID | Nom | Type | Methode | Estimation |
|----|-----|------|---------|------------|
| gacd | GACD | algolia | API Algolia directe | ~38K |
| dgd | DentalGoodDeal | categories | Cheerio pages categorie | ~8K |
| doctorstrong | DoctorStrong | search_api | API Elasticsearch | ~15K |
| doctorai | DoctorAI | search_api | API Elasticsearch | ~15K |
| megadental | MegaDental | search_api | API Elasticsearch | ~15K |
| henryschein | HenrySchein | categories | Cheerio | ~10K |
| dentalclick | DentalClick | categories | Cheerio | ~5K |
| dpi | DentalPromotion | sitemap | Sitemap XML + Cheerio fiches | ~8.7K |
| praxisdienst | Praxisdienst | categories | Cheerio 15 sous-categories | ~10K |

## Optimisation tokens (CRITIQUE)

### Avant (v1-v2) : 7500 tokens/page, 94% doublons
- Envoyait 30KB de HTML brut a l'IA
- Pas de detection zone categorie → best-sellers repetes
- Nettoyage regex insuffisant

### Apres (v3) : 700 tokens/page, 0% doublons, 4x plus de produits
- Cheerio charge le HTML, retire script/style/nav
- Trouve le selecteur "Trier" dans le HTML brut
- Recharge UNIQUEMENT la zone apres Trier (exclut best-sellers)
- Extrait les blocs `<a href>` contenant un prix (€)
- Envoie ~2500 chars condenses a l'IA (au lieu de 30000)
- L'IA normalise : nom, ref, marque, prix remise, conditionnement, image

### Economie
- 186 pages DGD : 0.07$ au lieu de 0.70$ (10x moins)
- 170K produits projetes : ~3$ au lieu de ~30$
