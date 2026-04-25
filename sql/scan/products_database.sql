-- =============================================
-- JADOMI SCAN — Base produits world-class
-- Passe 51 — products_database + corrections + prothesiste_products
-- =============================================

-- Extension vectorielle (doit etre activee dans Supabase Dashboard)
-- CREATE EXTENSION IF NOT EXISTS vector;

-- ════════════════════════════════════════════
-- TABLE PRINCIPALE : products_database
-- ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS products_database (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifiants
  gtin VARCHAR(14) UNIQUE NOT NULL,
  udi VARCHAR(50),
  hibcc_lic VARCHAR(20),
  reference VARCHAR(100),
  manufacturer_ref VARCHAR(100),

  -- Informations
  name VARCHAR(255) NOT NULL,
  name_fr VARCHAR(255),
  name_en VARCHAR(255),
  brand VARCHAR(100),
  manufacturer VARCHAR(100),

  -- Categorisation
  category VARCHAR(50),
  subcategory VARCHAR(100),
  gmdn_code VARCHAR(20),
  ada_code VARCHAR(20),

  -- Packaging
  package_type VARCHAR(50),
  package_quantity INTEGER,
  unit VARCHAR(20),

  -- Caracteristiques
  size VARCHAR(50),
  color VARCHAR(50),
  material VARCHAR(100),
  sterile BOOLEAN,
  single_use BOOLEAN,

  -- Marche
  market_region VARCHAR(20),
  approved_in TEXT[],

  -- Source
  source VARCHAR(50),
  source_url TEXT,
  source_metadata JSONB,

  -- Embeddings IA (colonne ajoutee apres activation pgvector)
  -- embedding vector(1536),

  -- Images
  image_url TEXT,
  image_thumbnail TEXT,
  reference_images TEXT[],

  -- Apprentissage
  scan_count INTEGER DEFAULT 0,
  user_validations INTEGER DEFAULT 0,
  user_corrections INTEGER DEFAULT 0,
  confidence_score NUMERIC(3,2) DEFAULT 0.50,

  -- Prix multi-fournisseurs (JSONB snapshot)
  prices JSONB,

  -- Metadonnees
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_gtin ON products_database(gtin);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products_database(brand);
CREATE INDEX IF NOT EXISTS idx_products_category ON products_database(category);
CREATE INDEX IF NOT EXISTS idx_products_manufacturer ON products_database(manufacturer);
CREATE INDEX IF NOT EXISTS idx_products_name_fr_fulltext
  ON products_database
  USING gin(to_tsvector('french', COALESCE(name_fr,'') || ' ' || COALESCE(brand,'') || ' ' || COALESCE(manufacturer,'')));
CREATE INDEX IF NOT EXISTS idx_products_source ON products_database(source);
CREATE INDEX IF NOT EXISTS idx_products_scan_count ON products_database(scan_count DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trg_products_database_updated()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_database_updated ON products_database;
CREATE TRIGGER trg_products_database_updated
  BEFORE UPDATE ON products_database
  FOR EACH ROW EXECUTE FUNCTION trg_products_database_updated();

-- RLS
ALTER TABLE products_database ENABLE ROW LEVEL SECURITY;
CREATE POLICY products_database_read_all ON products_database
  FOR SELECT USING (true);
CREATE POLICY products_database_insert_auth ON products_database
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ════════════════════════════════════════════
-- TABLE : product_corrections (apprentissage)
-- ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS product_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products_database(id) ON DELETE CASCADE,
  user_id UUID,
  societe_id UUID,
  field_corrected VARCHAR(50) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  scan_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corrections_product ON product_corrections(product_id);
CREATE INDEX IF NOT EXISTS idx_corrections_user ON product_corrections(user_id);

ALTER TABLE product_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY corrections_read_own ON product_corrections
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY corrections_insert_auth ON product_corrections
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ════════════════════════════════════════════
-- TABLE : prothesiste_products (lien labo)
-- ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS prothesiste_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products_database(id) ON DELETE CASCADE,
  prothesis_type VARCHAR(50),
  technique VARCHAR(100),
  material_type VARCHAR(100),
  application TEXT,
  laboratory_ref VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prothesiste_products_product ON prothesiste_products(product_id);
CREATE INDEX IF NOT EXISTS idx_prothesiste_products_type ON prothesiste_products(prothesis_type);

ALTER TABLE prothesiste_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY prothesiste_products_read_all ON prothesiste_products
  FOR SELECT USING (true);
