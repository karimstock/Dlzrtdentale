-- =============================================
-- PASSE 62 — SQL Audit & Corrections
-- Date : 28 avril 2026
-- A executer dans Supabase Dashboard (SQL Editor)
-- =============================================

-- ============================================================
-- 1. RPC : Stats produits par source (evite chargement 100K lignes)
-- ============================================================
CREATE OR REPLACE FUNCTION get_product_stats_by_source()
RETURNS TABLE(source TEXT, count BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT
    COALESCE(source, 'unknown') AS source,
    COUNT(*) AS count
  FROM products_database
  GROUP BY source
  ORDER BY count DESC;
$$;

-- ============================================================
-- 2. RPC : Stats produits par categorie (evite chargement 100K lignes)
-- ============================================================
CREATE OR REPLACE FUNCTION get_product_stats_by_category()
RETURNS TABLE(category TEXT, count BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT
    category,
    COUNT(*) AS count
  FROM products_database
  WHERE category IS NOT NULL
  GROUP BY category
  ORDER BY count DESC
  LIMIT 100;
$$;

-- ============================================================
-- 3. Colonne notes sur ide_visites (si absente)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ide_visites' AND column_name = 'notes'
  ) THEN
    ALTER TABLE ide_visites ADD COLUMN notes TEXT DEFAULT '';
  END IF;
END $$;

-- ============================================================
-- 4. Index pour accelerer les lookups GPO (performance)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_gpo_requests_societe_id
  ON gpo_requests(societe_id);

CREATE INDEX IF NOT EXISTS idx_gpo_request_attempts_request_id
  ON gpo_request_attempts(request_id);

-- ============================================================
-- 5. Index pour accelerer le scan products_database
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_database_gtin
  ON products_database(gtin);

CREATE INDEX IF NOT EXISTS idx_products_database_reference
  ON products_database(reference);

CREATE INDEX IF NOT EXISTS idx_products_database_manufacturer_ref
  ON products_database(manufacturer_ref);

-- ============================================================
-- 6. RLS : Securiser ide_visites par cabinet_id
-- ============================================================
-- Verifie que la RLS est active
ALTER TABLE ide_visites ENABLE ROW LEVEL SECURITY;

-- Policy lecture : only own cabinet
DROP POLICY IF EXISTS ide_visites_select_own ON ide_visites;
CREATE POLICY ide_visites_select_own ON ide_visites
  FOR SELECT USING (
    cabinet_id IN (
      SELECT id FROM ide_cabinets WHERE societe_id IN (
        SELECT societe_id FROM user_societe_roles WHERE user_id = auth.uid()
      )
    )
  );

-- Policy update : only own cabinet
DROP POLICY IF EXISTS ide_visites_update_own ON ide_visites;
CREATE POLICY ide_visites_update_own ON ide_visites
  FOR UPDATE USING (
    cabinet_id IN (
      SELECT id FROM ide_cabinets WHERE societe_id IN (
        SELECT societe_id FROM user_societe_roles WHERE user_id = auth.uid()
      )
    )
  );

-- Policy insert : only own cabinet
DROP POLICY IF EXISTS ide_visites_insert_own ON ide_visites;
CREATE POLICY ide_visites_insert_own ON ide_visites
  FOR INSERT WITH CHECK (
    cabinet_id IN (
      SELECT id FROM ide_cabinets WHERE societe_id IN (
        SELECT societe_id FROM user_societe_roles WHERE user_id = auth.uid()
      )
    )
  );

-- Policy delete : only own cabinet
DROP POLICY IF EXISTS ide_visites_delete_own ON ide_visites;
CREATE POLICY ide_visites_delete_own ON ide_visites
  FOR DELETE USING (
    cabinet_id IN (
      SELECT id FROM ide_cabinets WHERE societe_id IN (
        SELECT societe_id FROM user_societe_roles WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- 7. Securiser contacts_cabinet par societe_id (IDOR fix)
-- ============================================================
ALTER TABLE contacts_cabinet ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contacts_cabinet_all_own ON contacts_cabinet;
CREATE POLICY contacts_cabinet_all_own ON contacts_cabinet
  FOR ALL USING (
    societe_id IN (
      SELECT societe_id FROM user_societe_roles WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 8. Securiser alertes_peremption par societe_id (IDOR fix)
-- ============================================================
ALTER TABLE alertes_peremption ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS alertes_peremption_all_own ON alertes_peremption;
CREATE POLICY alertes_peremption_all_own ON alertes_peremption
  FOR ALL USING (
    societe_id IN (
      SELECT societe_id FROM user_societe_roles WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 9. Grant execute sur les fonctions RPC
-- ============================================================
GRANT EXECUTE ON FUNCTION get_product_stats_by_source() TO authenticated;
GRANT EXECUTE ON FUNCTION get_product_stats_by_category() TO authenticated;

-- ============================================================
-- DONE
-- ============================================================
-- Verification : SELECT get_product_stats_by_source();
-- Verification : SELECT get_product_stats_by_category();
