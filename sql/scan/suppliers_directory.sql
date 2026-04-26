-- =============================================
-- JADOMI SCAN — Annuaire fournisseurs intelligent
-- Passe 51 — Enrichi automatiquement par IA
-- =============================================

CREATE TABLE IF NOT EXISTS suppliers_directory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identite
  name VARCHAR(100) UNIQUE NOT NULL,
  name_normalized VARCHAR(100) NOT NULL, -- lowercase sans accents pour dedup
  legal_name VARCHAR(200),
  siret VARCHAR(14),

  -- Type
  supplier_type VARCHAR(30) NOT NULL DEFAULT 'distributor',
    -- 'distributor', 'manufacturer', 'groupement', 'depot', 'marketplace'

  -- Contact
  website TEXT,
  phone VARCHAR(20),
  email VARCHAR(100),
  address TEXT,
  city VARCHAR(50),
  postal_code VARCHAR(10),
  country VARCHAR(2) DEFAULT 'FR',

  -- Specialites
  specialties TEXT[], -- ['orthodontie','prothese','implants','omnipratique']
  brands_distributed TEXT[], -- ['3M','Dentsply','GC','Ivoclar']
  sectors TEXT[], -- ['dentaire','medical','labo']

  -- Couverture
  coverage_national BOOLEAN DEFAULT false,
  coverage_regions TEXT[], -- ['Ile-de-France','Hauts-de-France','PACA']
  delivery_days INTEGER, -- delai moyen livraison

  -- Conditions commerciales (anonymise, agrege)
  avg_discount_percent NUMERIC(5,2), -- remise moyenne observee
  min_order_amount NUMERIC(10,2),
  free_shipping_threshold NUMERIC(10,2),

  -- Reputation (calcule a partir des factures)
  cabinets_count INTEGER DEFAULT 0, -- nombre de cabinets clients JADOMI
  invoices_count INTEGER DEFAULT 0, -- nombre de factures scannees
  products_count INTEGER DEFAULT 0, -- nombre de produits references
  avg_price_position NUMERIC(3,2), -- 0.0=moins cher, 1.0=plus cher

  -- Source
  source VARCHAR(30) DEFAULT 'manual', -- 'manual', 'ia_enriched', 'invoice_auto'
  enriched_at TIMESTAMPTZ,
  enriched_by VARCHAR(30), -- 'claude_haiku', 'user', etc.

  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_name_norm ON suppliers_directory(name_normalized);
CREATE INDEX IF NOT EXISTS idx_suppliers_type ON suppliers_directory(supplier_type);
CREATE INDEX IF NOT EXISTS idx_suppliers_country ON suppliers_directory(country);

ALTER TABLE suppliers_directory ENABLE ROW LEVEL SECURITY;
CREATE POLICY suppliers_read_all ON suppliers_directory FOR SELECT USING (true);
CREATE POLICY suppliers_insert_auth ON suppliers_directory FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY suppliers_update_auth ON suppliers_directory FOR UPDATE USING (auth.role() = 'authenticated');

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trg_suppliers_directory_updated()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_suppliers_directory_updated ON suppliers_directory;
CREATE TRIGGER trg_suppliers_directory_updated BEFORE UPDATE ON suppliers_directory
  FOR EACH ROW EXECUTE FUNCTION trg_suppliers_directory_updated();
