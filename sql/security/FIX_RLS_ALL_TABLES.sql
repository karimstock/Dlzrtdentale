-- ============================================================
-- JADOMI — FIX SECURITE URGENTE : RLS + GRANT sur 93 tables
-- Date : 20 mai 2026
-- Contexte : alerte Supabase "rls_disabled_in_public"
-- À exécuter sur Supabase SQL Editor (Dashboard)
-- ============================================================

-- ============================================================
-- PARTIE 1 : ENABLE RLS sur les 93 tables manquantes
-- ============================================================

-- === sql/vitrines/34_jadomi_ads.sql (10 tables) ===
ALTER TABLE IF EXISTS public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ad_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ad_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ad_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ad_impressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ad_media_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ad_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.advertiser_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.advertiser_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audience_segments_saved ENABLE ROW LEVEL SECURITY;

-- === sql/vitrines/22_gpo_smart_queue.sql (6 tables) ===
ALTER TABLE IF EXISTS public.gpo_request_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.market_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.supplier_client_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.supplier_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.target_prices ENABLE ROW LEVEL SECURITY;

-- === sql/vitrines/28_appointments.sql (4 tables) ===
ALTER TABLE IF EXISTS public.appointment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.appointment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.availability_slots ENABLE ROW LEVEL SECURITY;

-- === sql/vitrines/27_client_portal.sql (4 tables) ===
ALTER TABLE IF EXISTS public.client_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.client_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.client_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.client_messages ENABLE ROW LEVEL SECURITY;

-- === sql/multi_societes/04_mailing.sql (4 tables) ===
ALTER TABLE IF EXISTS public.bases_emails_importees ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.campagne_envois ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.campagnes_mailing ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.contacts_importes ENABLE ROW LEVEL SECURITY;

-- === sql/multi_societes/03_commerce.sql (9 tables) ===
ALTER TABLE IF EXISTS public.clients_societe ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.devis ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.documents_produit ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.factures_echeances ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.factures_fournisseurs_societe ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.factures_societe ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.integrations_wordpress ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.produits_societe ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.relances_factures ENABLE ROW LEVEL SECURITY;

-- === sql/vitrines/38_coins_wallet_structure.sql (6 tables) ===
ALTER TABLE IF EXISTS public.coins_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.coins_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.coins_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.features_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_coins_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_quest_progress ENABLE ROW LEVEL SECURITY;

-- === sql/vitrines/70_rappels_automatiques.sql (5 tables) ===
ALTER TABLE IF EXISTS public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rappels_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rappels_envois ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sms_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sms_wallet ENABLE ROW LEVEL SECURITY;

-- === sql/vitrines/16_dashboard_modulable.sql (3 tables) ===
ALTER TABLE IF EXISTS public.dashboard_ia_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.dashboard_tabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.dashboard_widgets ENABLE ROW LEVEL SECURITY;

-- === sql/vitrines/30_timeline.sql (3 tables) ===
ALTER TABLE IF EXISTS public.timeline_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.timeline_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.treatment_timelines ENABLE ROW LEVEL SECURITY;

-- === sql/admin_schema.sql (5 tables) ===
ALTER TABLE IF EXISTS public.admin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.compta_depenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.compta_factures ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.mailing_campagnes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stripe_abonnements ENABLE ROW LEVEL SECURITY;

-- === sql/schema_complet.sql (5 tables) ===
ALTER TABLE IF EXISTS public.catalogue_tarifs_prothesiste ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.dentistes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications_upgrade ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_materiaux ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.travaux_catalogue ENABLE ROW LEVEL SECURITY;

-- === sql/vitrines/35_jadomi_studio.sql (3 tables) ===
ALTER TABLE IF EXISTS public.ai_generations_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.studio_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.studio_rate_limits ENABLE ROW LEVEL SECURITY;

-- === sql/vitrines/69_mailing_lists.sql (3 tables) ===
ALTER TABLE IF EXISTS public.mailing_list_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.mailing_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.mailing_packs ENABLE ROW LEVEL SECURITY;

-- === sql/vitrines/59_disputes_scoring.sql (2 tables) ===
ALTER TABLE IF EXISTS public.jadomi_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.supplier_scores ENABLE ROW LEVEL SECURITY;

-- === sql/vitrines/58_commerce_orders.sql (2 tables) ===
ALTER TABLE IF EXISTS public.jadomi_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.jadomi_orders ENABLE ROW LEVEL SECURITY;

-- === sql/vitrines/24_logistics_and_groupage.sql (2 tables) ===
ALTER TABLE IF EXISTS public.supplier_warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transport_rates ENABLE ROW LEVEL SECURITY;

-- === sql/vitrines/68_ide_demandes_soins.sql (2 tables) ===
ALTER TABLE IF EXISTS public.ide_abonnements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ide_demandes_soins ENABLE ROW LEVEL SECURITY;

-- === sql/vitrines/17_upsell.sql (2 tables) ===
ALTER TABLE IF EXISTS public.upsell_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.upsell_suggestions ENABLE ROW LEVEL SECURITY;

-- === sql/vitrines/26_chatbot_config.sql (2 tables) ===
ALTER TABLE IF EXISTS public.vitrine_chatbot_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vitrine_chatbot_conversations ENABLE ROW LEVEL SECURITY;

-- === Tables isolées ===
ALTER TABLE IF EXISTS public.analyzed_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.imported_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.societe_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.onboarding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.parametres_plateforme ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.signed_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_onboarding_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vitrines_contact_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vitrines_custom_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vitrines_reanalyze_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vitrines_themes ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- PARTIE 2 : GRANT service_role sur TOUTES les 93 tables
-- (le backend JADOMI utilise service_role_key)
-- ============================================================

DO $$
DECLARE
  tbl TEXT;
  tables_to_fix TEXT[] := ARRAY[
    'ad_campaigns','ad_clicks','ad_conversions','ad_creatives','ad_impressions',
    'ad_media_library','ad_templates','advertiser_subscriptions','advertiser_wallets',
    'audience_segments_saved','gpo_request_attempts','market_prices','supplier_client_history',
    'supplier_subscriptions','suppliers','target_prices','appointment_settings',
    'appointment_types','appointments','availability_slots','client_accounts',
    'client_documents','client_dossiers','client_messages','bases_emails_importees',
    'campagne_envois','campagnes_mailing','contacts_importes','clients_societe',
    'devis','documents_produit','factures_echeances','factures_fournisseurs_societe',
    'factures_societe','integrations_wordpress','produits_societe','relances_factures',
    'coins_packs','coins_quests','coins_transactions','features_pricing',
    'user_coins_wallet','user_quest_progress','push_subscriptions','rappels_config',
    'rappels_envois','sms_packs','sms_wallet','dashboard_ia_conversations',
    'dashboard_tabs','dashboard_widgets','timeline_photos','timeline_steps',
    'treatment_timelines','admin_logs','compta_depenses','compta_factures',
    'mailing_campagnes','stripe_abonnements','catalogue_tarifs_prothesiste',
    'dentistes','notifications_upgrade','stock_materiaux','travaux_catalogue',
    'ai_generations_log','studio_library','studio_rate_limits','mailing_list_campaigns',
    'mailing_lists','mailing_packs','jadomi_disputes','supplier_scores',
    'jadomi_carts','jadomi_orders','supplier_warehouses','transport_rates',
    'ide_abonnements','ide_demandes_soins','upsell_interactions','upsell_suggestions',
    'vitrine_chatbot_configs','vitrine_chatbot_conversations','analyzed_pages',
    'imported_assets','societe_modules','onboarding_sessions','parametres_plateforme',
    'signed_documents','user_onboarding_state','vitrines_contact_requests',
    'vitrines_custom_sections','vitrines_reanalyze_jobs','vitrines_themes'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_to_fix LOOP
    -- Vérifier que la table existe avant de GRANT
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
      EXECUTE format('GRANT SELECT ON public.%I TO anon', tbl);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl);
    END IF;
  END LOOP;
END $$;


-- ============================================================
-- PARTIE 3 : RLS POLICIES par défaut (service_role bypass)
-- Pour chaque table, on crée une policy permissive pour
-- service_role (qui bypass RLS de toute façon) et une policy
-- restrictive pour authenticated (lecture propre société)
-- ============================================================

-- Policy service_role = bypass natif Supabase (pas besoin de policy explicite)
-- Policy authenticated = SELECT/INSERT/UPDATE/DELETE par societe_id

-- Tables avec colonne societe_id → policy par societe_id
DO $$
DECLARE
  tbl TEXT;
  tables_with_societe TEXT[] := ARRAY[
    'ad_campaigns','ad_creatives','ad_media_library','advertiser_subscriptions',
    'advertiser_wallets','audience_segments_saved','appointment_settings',
    'appointment_types','appointments','availability_slots','client_accounts',
    'client_documents','client_dossiers','client_messages','bases_emails_importees',
    'campagne_envois','campagnes_mailing','contacts_importes','clients_societe',
    'devis','documents_produit','factures_echeances','factures_fournisseurs_societe',
    'factures_societe','integrations_wordpress','produits_societe','relances_factures',
    'coins_transactions','user_coins_wallet','push_subscriptions','rappels_config',
    'rappels_envois','sms_wallet','dashboard_ia_conversations','dashboard_tabs',
    'dashboard_widgets','timeline_photos','timeline_steps','treatment_timelines',
    'compta_depenses','compta_factures','stripe_abonnements','ai_generations_log',
    'studio_library','studio_rate_limits','mailing_list_campaigns','mailing_lists',
    'jadomi_disputes','jadomi_carts','jadomi_orders','ide_abonnements',
    'ide_demandes_soins','upsell_interactions','upsell_suggestions',
    'vitrine_chatbot_configs','vitrine_chatbot_conversations','signed_documents',
    'mailing_campagnes'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_with_societe LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'societe_id'
    ) THEN
      -- Drop existing policy if any
      EXECUTE format('DROP POLICY IF EXISTS rls_authenticated_societe ON public.%I', tbl);
      -- Create policy: authenticated users see only their societe
      EXECUTE format(
        'CREATE POLICY rls_authenticated_societe ON public.%I FOR ALL TO authenticated USING (societe_id = auth.uid()) WITH CHECK (societe_id = auth.uid())',
        tbl
      );
    END IF;
  END LOOP;
END $$;

-- Tables avec colonne user_id → policy par user_id
DO $$
DECLARE
  tbl TEXT;
  tables_with_user TEXT[] := ARRAY[
    'user_coins_wallet','user_quest_progress','user_onboarding_state',
    'onboarding_sessions','push_subscriptions','dashboard_tabs','dashboard_widgets'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_with_user LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'user_id'
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS rls_authenticated_user ON public.%I', tbl);
      EXECUTE format(
        'CREATE POLICY rls_authenticated_user ON public.%I FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())',
        tbl
      );
    END IF;
  END LOOP;
END $$;

-- Tables de référence (lecture seule pour tous les authentifiés)
DO $$
DECLARE
  tbl TEXT;
  ref_tables TEXT[] := ARRAY[
    'coins_packs','coins_quests','features_pricing','sms_packs',
    'catalogue_tarifs_prothesiste','stock_materiaux','travaux_catalogue',
    'vitrines_themes','ad_templates','suppliers','market_prices',
    'target_prices','supplier_warehouses','transport_rates','dentistes',
    'notifications_upgrade','mailing_packs','parametres_plateforme',
    'vitrines_custom_sections'
  ];
BEGIN
  FOREACH tbl IN ARRAY ref_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
      EXECUTE format('DROP POLICY IF EXISTS rls_read_authenticated ON public.%I', tbl);
      EXECUTE format(
        'CREATE POLICY rls_read_authenticated ON public.%I FOR SELECT TO authenticated USING (true)',
        tbl
      );
    END IF;
  END LOOP;
END $$;

-- Tables sensibles (admin only via service_role, pas d'accès direct)
DO $$
DECLARE
  tbl TEXT;
  admin_tables TEXT[] := ARRAY[
    'admin_logs','supplier_client_history','gpo_request_attempts',
    'supplier_subscriptions','supplier_scores','ad_clicks','ad_conversions',
    'ad_impressions','vitrines_reanalyze_jobs','analyzed_pages',
    'imported_assets','societe_modules','vitrines_contact_requests'
  ];
BEGIN
  FOREACH tbl IN ARRAY admin_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
      EXECUTE format('DROP POLICY IF EXISTS rls_deny_all ON public.%I', tbl);
      -- Aucune policy = deny all sauf service_role (qui bypass RLS)
      -- On ajoute une policy vide pour documenter l'intention
      EXECUTE format(
        'CREATE POLICY rls_service_role_only ON public.%I FOR ALL TO authenticated USING (false)',
        tbl
      );
    END IF;
  END LOOP;
END $$;


-- ============================================================
-- PARTIE 4 : VÉRIFICATION FINALE
-- Exécuter cette requête APRÈS le fix pour confirmer 0 table sans RLS
-- ============================================================

-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public' AND rowsecurity = false
-- ORDER BY tablename;
-- → Doit retourner 0 lignes
