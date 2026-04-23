-- ============================================================
-- MIGRATION 22 — GPO SMART QUEUE AUCTION
-- ============================================================

-- TABLE 1 : FOURNISSEURS (inscrits OU identifiés via factures scannées)
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  siret text,
  address text,
  city text,
  postal_code text,
  region text,
  lat numeric,
  lng numeric,
  status text DEFAULT 'extracted' CHECK (status IN
    ('extracted', 'invited', 'active', 'suspended', 'deleted')),
  source text DEFAULT 'scanner_invoice' CHECK (source IN
    ('scanner_invoice', 'public_base', 'manual_invite', 'self_signup',
     'web_search')),
  specialties text[] DEFAULT '{}',
  subscription_tier text DEFAULT 'bronze' CHECK (subscription_tier IN
    ('bronze', 'silver', 'gold', 'platinum')),
  slots_count int DEFAULT 1,
  orders_received int DEFAULT 0,
  orders_accepted int DEFAULT 0,
  orders_refused int DEFAULT 0,
  orders_timeout int DEFAULT 0,
  avg_rating numeric DEFAULT 0,
  total_ratings int DEFAULT 0,
  queue_token text UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);
CREATE INDEX IF NOT EXISTS idx_suppliers_tier ON suppliers(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_suppliers_specialties ON suppliers USING GIN(specialties);
CREATE INDEX IF NOT EXISTS idx_suppliers_email ON suppliers(email);

-- TABLE 2 : ABONNEMENTS FOURNISSEURS (historique billing)
CREATE TABLE IF NOT EXISTS supplier_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum')),
  slots_count int NOT NULL,
  monthly_price_eur int NOT NULL,
  status text DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
  started_at timestamptz DEFAULT now(),
  ends_at timestamptz,
  stripe_subscription_id text,
  created_at timestamptz DEFAULT now()
);

-- TABLE 3 : DEMANDES D'ACHAT (RFP = Request For Purchase)
CREATE TABLE IF NOT EXISTS gpo_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL,
  items jsonb NOT NULL,
  total_target_eur numeric,
  total_market_eur numeric,
  savings_eur numeric,
  status text DEFAULT 'pending' CHECK (status IN
    ('pending', 'searching', 'matched', 'accepted', 'fulfilled',
     'cancelled', 'failed')),
  winner_supplier_id uuid REFERENCES suppliers(id),
  final_price_eur numeric,
  prefer_local boolean DEFAULT true,
  created_during_business_hours boolean,
  created_at timestamptz DEFAULT now(),
  matched_at timestamptz,
  fulfilled_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_gpo_requests_societe ON gpo_requests(societe_id);
CREATE INDEX IF NOT EXISTS idx_gpo_requests_status ON gpo_requests(status);

-- TABLE 4 : TENTATIVES D'ATTRIBUTION
CREATE TABLE IF NOT EXISTS gpo_request_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES gpo_requests(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  response_token text UNIQUE NOT NULL DEFAULT
    replace(gen_random_uuid()::text, '-', ''),
  attempt_position int NOT NULL,
  response_status text DEFAULT 'pending' CHECK (response_status IN
    ('pending', 'accepted', 'refused', 'counter_proposed', 'timeout')),
  counter_price_eur numeric,
  counter_comment text,
  email_sent_at timestamptz DEFAULT now(),
  email_opened_at timestamptz,
  responded_at timestamptz,
  deadline_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gpo_attempts_request ON gpo_request_attempts(request_id);
CREATE INDEX IF NOT EXISTS idx_gpo_attempts_supplier ON gpo_request_attempts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_gpo_attempts_token ON gpo_request_attempts(response_token);
CREATE INDEX IF NOT EXISTS idx_gpo_attempts_deadline ON gpo_request_attempts(deadline_at)
  WHERE response_status = 'pending';

-- TABLE 5 : BASE DE PRIX MARCHÉ
CREATE TABLE IF NOT EXISTS market_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name text NOT NULL,
  product_name_normalized text NOT NULL,
  brand text,
  category text,
  unit text,
  supplier_id uuid REFERENCES suppliers(id),
  supplier_name_raw text,
  price_eur numeric NOT NULL,
  quantity int DEFAULT 1,
  unit_price_eur numeric,
  source_invoice_id uuid,
  observed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_prices_product ON market_prices(product_name_normalized);
CREATE INDEX IF NOT EXISTS idx_market_prices_supplier ON market_prices(supplier_id);

-- TABLE 6 : TARIFS CIBLES JADOMI
CREATE TABLE IF NOT EXISTS target_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name_normalized text UNIQUE NOT NULL,
  product_name_display text NOT NULL,
  category text,
  avg_market_price_eur numeric,
  min_observed_price_eur numeric,
  discount_pct numeric DEFAULT 0.15,
  target_price_eur numeric NOT NULL,
  manual_override boolean DEFAULT false,
  sample_size int DEFAULT 0,
  last_computed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_target_prices_product ON target_prices(product_name_normalized);

-- TABLE 7 : NOTATIONS FOURNISSEURS POST-COMMANDE
CREATE TABLE IF NOT EXISTS supplier_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES gpo_requests(id),
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  societe_id uuid NOT NULL,
  quality_score int CHECK (quality_score BETWEEN 1 AND 5),
  delivery_score int CHECK (delivery_score BETWEEN 1 AND 5),
  service_score int CHECK (service_score BETWEEN 1 AND 5),
  overall_score int CHECK (overall_score BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ratings_supplier ON supplier_ratings(supplier_id);

-- TABLE 8 : RELATIONS DENTISTE-FOURNISSEUR (pour Green-Test)
CREATE TABLE IF NOT EXISTS supplier_client_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  societe_id uuid NOT NULL,
  first_order_at timestamptz,
  last_order_at timestamptz,
  total_orders int DEFAULT 0,
  total_spent_eur numeric DEFAULT 0,
  is_first_order_done boolean DEFAULT false,
  UNIQUE(supplier_id, societe_id)
);

-- RLS
ALTER TABLE gpo_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_ratings ENABLE ROW LEVEL SECURITY;
