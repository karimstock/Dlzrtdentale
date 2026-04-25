-- =============================================
-- JADOMI SCAN — Intelligence prix & fournisseurs
-- Passe 51
-- =============================================

-- ════════════════════════════════════════════
-- TABLE : supplier_prices
-- ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS supplier_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference produit
  product_id UUID REFERENCES products_database(id) ON DELETE SET NULL,
  gtin VARCHAR(14) NOT NULL,

  -- Fournisseur
  supplier_name VARCHAR(100) NOT NULL,
  supplier_category VARCHAR(50), -- 'distributor', 'manufacturer', 'groupement'
  supplier_country VARCHAR(2) DEFAULT 'FR',
  supplier_reference VARCHAR(100),

  -- Prix
  price_catalog NUMERIC(10,2),
  price_negotiated NUMERIC(10,2),
  discount_percent NUMERIC(5,2),

  -- Conditions
  minimum_quantity INTEGER,
  unit VARCHAR(20),
  shipping_cost NUMERIC(10,2),
  total_with_shipping NUMERIC(10,2),

  -- Source de l'info
  source VARCHAR(50) NOT NULL, -- 'invoice_scan', 'manual', 'scrape', 'api'
  source_invoice_id UUID,
  observed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Cabinet (anonymise pour analytics)
  societe_id UUID,
  cabinet_size VARCHAR(20),
  cabinet_region VARCHAR(50),
  cabinet_specialty VARCHAR(50),

  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_prices_gtin ON supplier_prices(gtin);
CREATE INDEX IF NOT EXISTS idx_supplier_prices_supplier ON supplier_prices(supplier_name);
CREATE INDEX IF NOT EXISTS idx_supplier_prices_observed ON supplier_prices(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_prices_product ON supplier_prices(product_id);
CREATE INDEX IF NOT EXISTS idx_supplier_prices_societe ON supplier_prices(societe_id);

ALTER TABLE supplier_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_prices_insert_auth ON supplier_prices
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY supplier_prices_read_own ON supplier_prices
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ════════════════════════════════════════════
-- TABLE : invoice_imports
-- ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS invoice_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL,
  user_id UUID,

  -- Metadonnees facture
  supplier_name VARCHAR(100),
  invoice_number VARCHAR(100),
  invoice_date DATE,
  total_ht NUMERIC(10,2),
  total_ttc NUMERIC(10,2),

  -- Image/PDF
  file_url TEXT,
  file_hash TEXT,

  -- Extraction IA
  extraction_status VARCHAR(20) DEFAULT 'pending', -- 'pending','processing','done','error'
  extraction_data JSONB,
  extraction_confidence NUMERIC(3,2),
  products_count INTEGER DEFAULT 0,
  products_matched INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,

  UNIQUE(societe_id, file_hash)
);

CREATE INDEX IF NOT EXISTS idx_invoice_imports_societe ON invoice_imports(societe_id);
CREATE INDEX IF NOT EXISTS idx_invoice_imports_status ON invoice_imports(extraction_status);

ALTER TABLE invoice_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_imports_own ON invoice_imports
  FOR ALL USING (auth.uid() = user_id);

-- ════════════════════════════════════════════
-- TABLE : price_insights
-- ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS price_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID,
  product_id UUID REFERENCES products_database(id) ON DELETE CASCADE,

  insight_type VARCHAR(50) NOT NULL, -- 'price_alert', 'better_supplier', 'renegotiate', 'price_drop'
  current_price NUMERIC(10,2),
  market_average NUMERIC(10,2),
  best_price_found NUMERIC(10,2),
  best_supplier VARCHAR(100),

  potential_savings NUMERIC(10,2),
  savings_percent NUMERIC(5,2),

  message TEXT,
  action_recommended VARCHAR(100),

  shown_to_user BOOLEAN DEFAULT FALSE,
  user_action VARCHAR(50), -- 'dismissed', 'investigated', 'switched'

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insights_societe ON price_insights(societe_id);
CREATE INDEX IF NOT EXISTS idx_insights_product ON price_insights(product_id);
CREATE INDEX IF NOT EXISTS idx_insights_type ON price_insights(insight_type);

ALTER TABLE price_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY insights_read_own ON price_insights
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ════════════════════════════════════════════
-- VUE : v_market_prices (stats marche par produit)
-- ════════════════════════════════════════════
CREATE OR REPLACE VIEW v_market_prices AS
SELECT
  gtin,
  product_id,
  COUNT(DISTINCT supplier_name) AS nb_suppliers,
  AVG(COALESCE(price_negotiated, price_catalog)) AS avg_price,
  MIN(COALESCE(price_negotiated, price_catalog)) AS min_price,
  MAX(COALESCE(price_negotiated, price_catalog)) AS max_price,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(price_negotiated, price_catalog)) AS median_price,
  MAX(observed_at) AS last_observed
FROM supplier_prices
WHERE COALESCE(price_negotiated, price_catalog) IS NOT NULL
GROUP BY gtin, product_id;
