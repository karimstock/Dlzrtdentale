-- ============================================================
-- MIGRATION 24 — MODULE LOGISTIQUE + GROUPAGE REGIONAL
-- ============================================================

-- TABLE 1 : ENTREPOTS FOURNISSEURS
CREATE TABLE IF NOT EXISTS supplier_warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text NOT NULL,
  city text,
  postal_code text,
  region text,
  country text DEFAULT 'FR',
  lat numeric,
  lng numeric,
  is_primary boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warehouses_supplier ON supplier_warehouses(supplier_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_primary ON supplier_warehouses(supplier_id, is_primary);

-- TABLE 2 : TARIFS TRANSPORT NEGOCIES
CREATE TABLE IF NOT EXISTS transport_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier text NOT NULL CHECK (carrier IN ('tnt', 'chronopost', 'gls', 'dpd', 'colissimo', 'dhl')),
  from_region text,
  to_region text,
  distance_km_min int DEFAULT 0,
  distance_km_max int,
  weight_kg_max numeric DEFAULT 10,
  price_negotiated_eur numeric NOT NULL,
  jadomi_margin_pct numeric DEFAULT 15,
  delivery_hours int DEFAULT 48,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transport_carrier ON transport_rates(carrier, is_active);

-- TABLE 3 : CAMPAGNES DE GROUPAGE REGIONAL
CREATE TABLE IF NOT EXISTS group_purchase_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  region text NOT NULL,
  departments text[] DEFAULT '{}',
  status text DEFAULT 'collecting' CHECK (status IN
    ('collecting', 'triggered', 'ordered', 'shipped', 'delivered', 'cancelled')),
  min_cabinets_required int DEFAULT 5,
  current_cabinets_count int DEFAULT 0,
  collection_deadline timestamptz NOT NULL,
  suggested_items jsonb DEFAULT '[]',
  total_volume_eur numeric DEFAULT 0,
  estimated_savings_pct numeric DEFAULT 15,
  selected_supplier_id uuid REFERENCES suppliers(id),
  final_price_eur numeric,
  created_by_societe_id uuid,
  created_at timestamptz DEFAULT now(),
  triggered_at timestamptz,
  ordered_at timestamptz,
  delivered_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON group_purchase_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_region ON group_purchase_campaigns(region, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_deadline ON group_purchase_campaigns(collection_deadline)
  WHERE status = 'collecting';

-- TABLE 4 : PARTICIPATIONS DES CABINETS
CREATE TABLE IF NOT EXISTS group_purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES group_purchase_campaigns(id) ON DELETE CASCADE,
  societe_id uuid NOT NULL,
  items jsonb NOT NULL DEFAULT '[]',
  subtotal_eur numeric DEFAULT 0,
  cabinet_address text,
  cabinet_city text,
  cabinet_postal_code text,
  cabinet_lat numeric,
  cabinet_lng numeric,
  shipping_cost_eur numeric DEFAULT 0,
  shipping_free boolean DEFAULT false,
  status text DEFAULT 'active' CHECK (status IN ('active', 'withdrawn', 'completed')),
  joined_at timestamptz DEFAULT now(),
  withdrawn_at timestamptz,
  UNIQUE(campaign_id, societe_id)
);

CREATE INDEX IF NOT EXISTS idx_group_items_campaign ON group_purchase_items(campaign_id);
CREATE INDEX IF NOT EXISTS idx_group_items_societe ON group_purchase_items(societe_id);

-- TABLE 5 : ETIQUETTES D'EXPEDITION
CREATE TABLE IF NOT EXISTS shipping_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES gpo_requests(id),
  campaign_id uuid REFERENCES group_purchase_campaigns(id),
  campaign_item_id uuid REFERENCES group_purchase_items(id),
  societe_id uuid NOT NULL,
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  warehouse_id uuid REFERENCES supplier_warehouses(id),
  carrier text NOT NULL,
  tracking_number text,
  tracking_url text,
  label_pdf_url text,
  label_pdf_r2_key text,
  from_address jsonb,
  to_address jsonb,
  weight_kg numeric,
  cost_eur numeric,
  jadomi_margin_eur numeric,
  paid_by text CHECK (paid_by IN ('supplier', 'dentist')),
  status text DEFAULT 'generated' CHECK (status IN
    ('generated', 'handed_to_carrier', 'shipped', 'in_transit', 'delivered', 'issue')),
  generated_at timestamptz DEFAULT now(),
  shipped_at timestamptz,
  delivered_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_labels_societe ON shipping_labels(societe_id);
CREATE INDEX IF NOT EXISTS idx_labels_supplier ON shipping_labels(supplier_id);
CREATE INDEX IF NOT EXISTS idx_labels_status ON shipping_labels(status);

-- AJOUTER COLONNES ADRESSE A SOCIETES SI ABSENTES
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='societes' AND column_name='address') THEN
    ALTER TABLE societes ADD COLUMN address text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='societes' AND column_name='city') THEN
    ALTER TABLE societes ADD COLUMN city text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='societes' AND column_name='postal_code') THEN
    ALTER TABLE societes ADD COLUMN postal_code text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='societes' AND column_name='region') THEN
    ALTER TABLE societes ADD COLUMN region text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='societes' AND column_name='lat') THEN
    ALTER TABLE societes ADD COLUMN lat numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='societes' AND column_name='lng') THEN
    ALTER TABLE societes ADD COLUMN lng numeric;
  END IF;
END $$;

-- AJOUTER shipping columns a gpo_requests SI ABSENTES
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='gpo_requests' AND column_name='shipping_cost_eur') THEN
    ALTER TABLE gpo_requests ADD COLUMN shipping_cost_eur numeric;
    ALTER TABLE gpo_requests ADD COLUMN shipping_paid_by text;
    ALTER TABLE gpo_requests ADD COLUMN free_shipping_triggered boolean DEFAULT false;
  END IF;
END $$;

-- RLS
ALTER TABLE group_purchase_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_labels ENABLE ROW LEVEL SECURITY;
