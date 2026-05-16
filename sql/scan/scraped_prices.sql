-- =============================================
-- JADOMI — Table scraped_prices
-- Stockage brut des prix scrapés depuis les sites fournisseurs
-- (GACD, Henry Schein, Mega Dental, etc.)
-- =============================================

CREATE TABLE IF NOT EXISTS scraped_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Fournisseur
  supplier_name VARCHAR(100) NOT NULL,  -- 'gacd', 'schein', 'mega_dental'

  -- Produit (données brutes du site)
  product_name VARCHAR(500) NOT NULL,
  brand VARCHAR(200),
  reference VARCHAR(200),          -- ref fournisseur si dispo
  category VARCHAR(200),           -- catégorie sur le site

  -- Prix
  price NUMERIC(10,2) NOT NULL,
  price_original NUMERIC(10,2),    -- prix barré (avant promo)
  discount_percent NUMERIC(5,2),   -- remise affichée
  unit VARCHAR(50),                -- 'boîte', 'lot de 5', etc.

  -- Source
  url TEXT,                        -- URL du produit
  page_source TEXT,                -- URL de la page listée
  page_number INTEGER,

  -- Matching (rempli ultérieurement par batch)
  matched_product_id UUID REFERENCES products_database(id) ON DELETE SET NULL,
  matched_gtin VARCHAR(14),
  match_confidence NUMERIC(3,2),   -- 0.00 à 1.00

  -- Timestamps
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Contrainte unicité : 1 prix par produit/fournisseur
  CONSTRAINT uq_scraped_supplier_product UNIQUE (supplier_name, product_name)
);

CREATE INDEX IF NOT EXISTS idx_scraped_prices_supplier ON scraped_prices(supplier_name);
CREATE INDEX IF NOT EXISTS idx_scraped_prices_name ON scraped_prices(product_name);
CREATE INDEX IF NOT EXISTS idx_scraped_prices_scraped ON scraped_prices(scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraped_prices_matched ON scraped_prices(matched_product_id) WHERE matched_product_id IS NOT NULL;

-- Pas de RLS — accès uniquement via service role (supaAdminOrThrow)
-- Le bookmarklet cross-origin n'a pas de token auth
