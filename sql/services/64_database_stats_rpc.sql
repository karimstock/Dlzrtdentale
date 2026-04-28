-- =============================================
-- PASSE 64 — RPC get_database_stats()
-- Single RPC call replaces 3+ round-trips
-- Returns all product stats in one JSON object
-- Date : 28 avril 2026
-- A executer dans Supabase Dashboard (SQL Editor)
-- =============================================

-- ============================================================
-- 1. Combined stats RPC — one call, one result
-- ============================================================
CREATE OR REPLACE FUNCTION get_database_stats()
RETURNS json
LANGUAGE sql STABLE
AS $$
  SELECT json_build_object(
    'total_products', (SELECT count(*) FROM products_database),
    'by_source', COALESCE((
      SELECT json_object_agg(src, cnt)
      FROM (
        SELECT COALESCE(source, 'unknown') AS src, count(*) AS cnt
        FROM products_database
        GROUP BY source
        ORDER BY cnt DESC
      ) s
    ), '{}'::json),
    'by_category', COALESCE((
      SELECT json_object_agg(cat, cnt)
      FROM (
        SELECT category AS cat, count(*) AS cnt
        FROM products_database
        WHERE category IS NOT NULL
        GROUP BY category
        ORDER BY cnt DESC
        LIMIT 100
      ) c
    ), '{}'::json),
    'distinct_categories', COALESCE((
      SELECT json_agg(category ORDER BY category)
      FROM (
        SELECT DISTINCT category
        FROM products_database
        WHERE category IS NOT NULL
      ) d
    ), '[]'::json)
  );
$$;

-- ============================================================
-- 2. Grant execute
-- ============================================================
GRANT EXECUTE ON FUNCTION get_database_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_database_stats() TO anon;

-- ============================================================
-- Verification : SELECT get_database_stats();
-- ============================================================
