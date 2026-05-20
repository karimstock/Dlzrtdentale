-- ============================================================
-- JADOMI ARMURE — RLS GUARDIAN
-- Protection permanente : IMPOSSIBLE de créer une table sans RLS
-- Date : 20 mai 2026
-- ============================================================

-- ============================================================
-- 1. TRIGGER EVENT : Dès qu'une table est créée dans public,
--    RLS est activé AUTOMATIQUEMENT
-- ============================================================

CREATE OR REPLACE FUNCTION public.jadomi_auto_enable_rls()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  obj RECORD;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands()
  WHERE command_tag = 'CREATE TABLE'
  LOOP
    -- Extraire le nom de la table depuis l'identifiant
    IF obj.schema_name = 'public' THEN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', obj.object_identity);

      -- GRANT de base automatique
      EXECUTE format('GRANT SELECT ON %s TO anon', obj.object_identity);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO authenticated', obj.object_identity);
      EXECUTE format('GRANT ALL ON %s TO service_role', obj.object_identity);

      -- Logger l'action
      RAISE NOTICE 'JADOMI ARMURE : RLS activé automatiquement sur %', obj.object_identity;
    END IF;
  END LOOP;
END;
$$;

-- Supprimer l'ancien trigger s'il existe
DROP EVENT TRIGGER IF EXISTS jadomi_rls_guardian;

-- Créer le trigger sur CREATE TABLE
CREATE EVENT TRIGGER jadomi_rls_guardian
ON ddl_command_end
WHEN TAG IN ('CREATE TABLE')
EXECUTE FUNCTION public.jadomi_auto_enable_rls();


-- ============================================================
-- 2. AUDIT PÉRIODIQUE : Fonction qui scanne TOUTES les tables
--    et retourne celles sans RLS (à appeler par le backend)
-- ============================================================

CREATE OR REPLACE FUNCTION public.jadomi_rls_audit()
RETURNS TABLE(table_name TEXT, has_rls BOOLEAN, has_policies BOOLEAN, policy_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.tablename::TEXT AS table_name,
    t.rowsecurity AS has_rls,
    EXISTS(
      SELECT 1 FROM pg_policies p WHERE p.tablename = t.tablename AND p.schemaname = 'public'
    ) AS has_policies,
    (
      SELECT COUNT(*)::INT FROM pg_policies p WHERE p.tablename = t.tablename AND p.schemaname = 'public'
    ) AS policy_count
  FROM pg_tables t
  WHERE t.schemaname = 'public'
  ORDER BY t.rowsecurity ASC, t.tablename;
END;
$$;


-- ============================================================
-- 3. ALERTE : Fonction qui retourne UNIQUEMENT les tables
--    vulnérables (sans RLS ou sans policies)
-- ============================================================

CREATE OR REPLACE FUNCTION public.jadomi_rls_vulnerabilities()
RETURNS TABLE(table_name TEXT, issue TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  -- Tables sans RLS
  SELECT t.tablename::TEXT, 'RLS DISABLED - table publiquement accessible'::TEXT
  FROM pg_tables t
  WHERE t.schemaname = 'public' AND t.rowsecurity = false

  UNION ALL

  -- Tables avec RLS mais sans aucune policy (bloque TOUT sauf service_role)
  SELECT t.tablename::TEXT, 'NO POLICIES - bloque tous les accès sauf service_role'::TEXT
  FROM pg_tables t
  WHERE t.schemaname = 'public'
    AND t.rowsecurity = true
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies p WHERE p.tablename = t.tablename AND p.schemaname = 'public'
    )

  ORDER BY 2, 1;
END;
$$;


-- ============================================================
-- 4. GRANT sur les fonctions d'audit
-- ============================================================

GRANT EXECUTE ON FUNCTION public.jadomi_rls_audit() TO service_role;
GRANT EXECUTE ON FUNCTION public.jadomi_rls_vulnerabilities() TO service_role;
