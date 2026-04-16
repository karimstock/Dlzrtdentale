-- =====================================================================
-- JADOMI — Vérification des triggers critiques
-- À exécuter dans Supabase SQL Editor pour diagnostiquer.
-- Idempotent, non destructif.
-- =====================================================================

-- 1) trg_sync_catalogue_global — anti-doublon EAN + vue marché
SELECT
  tgname                         AS trigger,
  CASE WHEN tgenabled='O' THEN 'ON' ELSE 'OFF' END AS statut,
  relname                        AS table_source
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE tgname IN (
  'trg_sync_catalogue_global',           -- sql/08
  'trg_catalogue_global_updated',        -- sql/08
  'trg_avoirs_updated',                  -- sql/11
  'trg_avoirs_immutable',                -- sql/11
  'trg_reclamations_updated',            -- sql/13
  'trg_retours_updated',                 -- sql/14
  'trg_market_updated',                  -- sql/14
  'trg_scores_updated',                  -- sql/14
  'trg_import_jobs_updated',             -- sql/17
  'trg_user_profils_secteur'             -- sql/10
)
ORDER BY trigger;

-- 2) Vues créées
SELECT table_name FROM information_schema.views
WHERE table_schema='public'
  AND table_name IN ('v_stock_analytics','v_pertes_reclamations','v_comparateur_prix');

-- 3) Fonctions RPC critiques
SELECT proname FROM pg_proc
WHERE pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
  AND proname IN (
    'is_member_of_societe','set_updated_at',
    'sync_catalogue_global',
    'next_numero','prochain_numero_avoir',
    'enregistrer_mouvement_stock',
    'infer_secteur_metier','avoirs_protect_immutable'
  )
ORDER BY proname;

-- 4) Policies RLS actives sur tables sensibles
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN (
    'societes','user_societe_roles','audit_log',
    'produits_societe','clients_societe','devis','factures_societe',
    'avoirs','mouvements_stock','alertes_peremption',
    'demandes_retour','reclamations_fournisseurs','annonces_market',
    'notifications','import_jobs','scores_fournisseurs'
  )
ORDER BY tablename, cmd, policyname;

-- 5) Test manuel : insère un produit factice avec EAN, vérifie qu'il apparaît dans le catalogue global
--    (à exécuter manuellement sur une société de test, décommenter au besoin)
-- INSERT INTO produits_societe(societe_id, reference, designation, prix_ht, code_barre)
-- VALUES ('<societe_uuid>', 'TEST-001', 'Produit Test', 9.99, '3760000000001');
-- SELECT * FROM produits_catalogue_global WHERE ean='3760000000001';
-- SELECT * FROM prix_fournisseurs WHERE produit_global_id=(SELECT id FROM produits_catalogue_global WHERE ean='3760000000001');
