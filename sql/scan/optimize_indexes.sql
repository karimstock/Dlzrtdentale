-- =============================================
-- JADOMI SCAN — Indexes performance pour 1.3M produits
-- A EXECUTER DANS SUPABASE DASHBOARD
-- Passe 51 — Scan ultra-rapide
-- =============================================

-- Extension trigram pour recherche floue rapide (ilike)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Index full-text sur name (anglais) — pour recherche depuis GUDID
CREATE INDEX IF NOT EXISTS idx_products_name_fulltext
  ON products_database
  USING gin(to_tsvector('english', COALESCE(name,'') || ' ' || COALESCE(brand,'')));

-- Index trigram sur name — pour ilike ultra-rapide
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON products_database
  USING gin(name gin_trgm_ops);

-- Index trigram sur brand — pour recherche par marque
CREATE INDEX IF NOT EXISTS idx_products_brand_trgm
  ON products_database
  USING gin(brand gin_trgm_ops);

-- Index trigram sur name_fr — pour recherche francaise
CREATE INDEX IF NOT EXISTS idx_products_name_fr_trgm
  ON products_database
  USING gin(name_fr gin_trgm_ops);

-- Index compose category + gtin pour recherche par prefixe prioritaire
CREATE INDEX IF NOT EXISTS idx_products_category_gtin
  ON products_database(category, gtin);

-- Index sur reference (pour match facture)
CREATE INDEX IF NOT EXISTS idx_products_reference
  ON products_database(reference);

-- Index sur manufacturer_ref (pour match facture)
CREATE INDEX IF NOT EXISTS idx_products_manufacturer_ref
  ON products_database(manufacturer_ref);

-- Resultats attendus apres execution :
-- ilike '%equia%' : 8000ms → <50ms
-- GTIN exact : 180ms → <20ms (deja indexe mais warm up)
-- Recherche par marque : 8000ms → <30ms
