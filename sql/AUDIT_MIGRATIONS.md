# Migrations SQL - Audit au 24 avril 2026

> Audit automatise par Claude Code
> Methode : verification table par table via API Supabase (PostgREST)

## Resume executif

| Statut | Nombre | Details |
|--------|--------|---------|
| Deja appliquees | **33 sur 35** | Toutes les migrations structurelles sont en prod |
| A appliquer | **0** | Aucune migration structurelle en attente |
| Inapplicable | **1** | Migration 25 (cleanup) cible une table inexistante |
| A verifier manuellement | **1** | Migration 25 (noms de colonnes incorrects) |

---

## Deja appliquees (tables presentes en prod)

### Migrations 01-21 (fondations)
- `01_vitrines_module.sql` -- vitrines_sites, vitrines_edits, etc.
- `02_competitors_analytics.sql` -- vitrines_competitors
- `03_edits_quotas.sql` -- vitrines_edits (quotas)
- `04_rls.sql` -- RLS policies
- `05_add_media_type.sql` -- ALTER vitrines
- `06_site_meta.sql` -- ALTER vitrines
- `07_photos_auto_categorization.sql` -- photos
- `08_contact_requests.sql` -- contacts
- `09_ai_propositions.sql` -- ai_propositions
- `10_reanalyze_jobs.sql` -- vitrines_reanalyze_jobs
- `11_societes_infos_legales.sql` -- ALTER societes
- `12_file_hash.sql` -- ALTER
- `14_video_poster.sql` -- ALTER
- `15_custom_sections.sql` -- vitrines_custom_sections
- `16_dashboard_modulable.sql` -- ALTER
- `17_upsell.sql` -- ALTER
- `18_themes.sql` -- vitrines_themes
- `19_schema_fix.sql` -- fixes
- `20_onboarding_sessions.sql` -- onboarding_sessions
- `21_sites_primary.sql` -- ALTER is_primary

### Migration 22 -- GPO Smart Queue
- `22_gpo_smart_queue.sql` -- 8 tables presentes :
  suppliers, supplier_subscriptions, gpo_requests, gpo_request_attempts,
  market_prices, target_prices, supplier_ratings, supplier_client_history

### Migration 23 -- Notifications GPO
- `23_notifications_gpo_types.sql` -- ALTER notifications (CHECK constraint)
  Table notifications presente.

### Migration 24 -- Logistique + Groupage
- `24_logistics_and_groupage.sql` -- 5 tables presentes :
  supplier_warehouses, transport_rates, group_purchase_campaigns,
  group_purchase_items, shipping_labels

### Migration 26 -- Chatbot IA
- `26_chatbot_config.sql` -- 2 tables presentes :
  vitrine_chatbot_configs, vitrine_chatbot_conversations
  Note : les noms reels sont `vitrine_*` (pas `chatbot_*`)

### Migration 27 -- Portail Client
- `27_client_portal.sql` -- 4 tables presentes :
  client_accounts, client_dossiers, client_documents, client_messages

### Migration 28 -- RDV en Ligne
- `28_appointments.sql` -- 4 tables presentes :
  appointment_types, availability_slots, appointments, appointment_settings

### Migration 29 -- Onboarding State
- `29_user_onboarding_state.sql` -- Table presente : user_onboarding_state

### Migration 30 -- Timeline
- `30_timeline.sql` -- 3 tables presentes :
  treatment_timelines, timeline_steps, timeline_photos

### Migration 31 -- Timeline Fix
- `31_timeline_fix_site_id.sql` -- ALTER applique :
  societe_id existe sur treatment_timelines, site_id est nullable

### Migration 32 -- Tour Guide
- `32_tour_guide.sql` -- ALTER applique :
  tour_completed existe sur user_onboarding_state (valeur = true)

### Migration 33 -- Modules Site Analysis
- `33_passe33_modules_analysis.sql` -- 4 tables presentes :
  site_analyses, analyzed_pages, imported_assets, societe_modules

### Migration 34 -- JADOMI Ads
- `34_jadomi_ads.sql` -- 10 tables presentes :
  ad_campaigns, ad_creatives, ad_impressions, ad_clicks,
  ad_conversions, advertiser_wallets, advertiser_subscriptions,
  audience_segments_saved, ad_templates, ad_media_library

### Migration 35 -- JADOMI Studio
- `35_jadomi_studio.sql` -- 3 tables presentes :
  ai_generations_log, studio_library, studio_rate_limits

### Migration 38 -- Coins Wallet (preparatoire)
- `38_coins_wallet_structure.sql` -- 5 tables + seeds presentes :
  user_coins_wallet, coins_transactions, features_pricing,
  coins_packs, coins_quests, user_quest_progress
  Note : les noms dans le CODEX (coin_wallets, coin_transactions...)
  different des noms reels en BDD. Corriger le CODEX.

---

## A appliquer (en attente)

**AUCUNE** -- Toutes les migrations structurelles ont ete appliquees.

---

## Inapplicable / A verifier manuellement

### Migration 25 -- Cleanup donnees test
- `25_cleanup_test_data.sql`
- **Statut** : INAPPLICABLE tel quel
- **Probleme** : cible `stock_products` qui N'EXISTE PAS.
  La vraie table s'appelle `produits` avec colonnes `nom` (pas `name`)
  et `categorie` (pas `category`).
- **Impact** : faible (simple nettoyage de donnees test)
- **Risque** : aucun si non executee (erreur silencieuse car DELETE sur table inexistante)
- **Action** : reecrire la migration avec les bons noms :
  ```sql
  DELETE FROM produits
  WHERE LOWER(categorie) LIKE '%beverage%'
     OR LOWER(categorie) LIKE '%food%'
     OR LOWER(categorie) LIKE '%plant-based%'
     OR LOWER(nom) IN ('isabelle', 'protein granarola');
  ```
  Puis verifier si ces donnees test existent encore avant d'executer.

---

## Anomalies detectees

1. **Noms de tables CODEX vs BDD** :
   Le CODEX mentionne `coin_wallets`, `coin_transactions`, etc.
   Les vrais noms en BDD sont `user_coins_wallet`, `coins_transactions`,
   `coins_packs`, `coins_quests`, `user_quest_progress`.
   -> Corriger le CODEX pour coherence.

2. **Migration 13 manquante** :
   Les fichiers vont de 12 a 14 (pas de `13_*.sql`).
   Probablement un numero saute volontairement.

3. **Migration 25 cible mauvaise table** :
   `stock_products` n'existe pas, la table est `produits`.

4. **Chatbot table names** :
   Le code API reference `chatbot_configs` et `chatbot_conversations`
   mais les tables reelles sont `vitrine_chatbot_configs` et
   `vitrine_chatbot_conversations`. Verifier que le code API utilise
   les bons noms.

---

## Conclusion

Les migrations SQL 22-35 et 38 sont **TOUTES deja en production**.
Le CODEX etait desynchronise sur ce point. Aucune migration n'est
reellement en attente d'execution.

Seule la migration 25 (nettoyage donnees test) n'a probablement
jamais ete executee car elle cible une table inexistante.
