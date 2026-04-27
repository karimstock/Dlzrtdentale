-- Passe 56 — Disputes (litiges) + Supplier Scoring

-- Disputes / litiges
CREATE TABLE IF NOT EXISTS jadomi_disputes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID, -- can reference jadomi_orders or gpo_orders
  societe_id UUID, -- client
  supplier_id UUID, -- fournisseur

  -- Type
  type VARCHAR(30) NOT NULL CHECK (type IN (
    'not_received', 'damaged', 'wrong_product', 'expired', 'quality', 'other'
  )),

  -- Details
  description TEXT,
  photo_urls JSONB DEFAULT '[]', -- evidence photos

  -- Automation
  auto_resolved BOOLEAN DEFAULT FALSE,
  auto_resolution_reason TEXT, -- 'tracking_not_delivered', 'photo_damage_confirmed', 'expiry_confirmed', 'no_tracking'
  ai_analysis JSONB, -- Claude Vision result if used

  -- Status
  status VARCHAR(30) DEFAULT 'opened' CHECK (status IN (
    'opened', 'investigating', 'waiting_supplier', 'waiting_client',
    'auto_resolved', 'manually_resolved', 'refunded', 'rejected', 'closed'
  )),

  -- Resolution
  resolution VARCHAR(30) CHECK (resolution IN (
    'full_refund', 'partial_refund', 'replacement', 'supplier_credit',
    'no_action', 'rejected'
  )),
  refund_amount NUMERIC(12,2),
  refund_deducted_from_supplier BOOLEAN DEFAULT FALSE,

  -- Tracking
  escalation_level INTEGER DEFAULT 1, -- 1=auto, 2=mediation, 3=arbitrage
  supplier_response TEXT,
  supplier_responded_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(50), -- 'auto', 'admin', 'mediation'

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disputes_order ON jadomi_disputes(order_id);
CREATE INDEX IF NOT EXISTS idx_disputes_supplier ON jadomi_disputes(supplier_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON jadomi_disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_created ON jadomi_disputes(created_at DESC);

-- Supplier scoring
CREATE TABLE IF NOT EXISTS supplier_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID NOT NULL,
  mandate_id UUID,

  -- Scores (0-100 each component, weighted total)
  score_total INTEGER DEFAULT 100,
  score_expedition INTEGER DEFAULT 100, -- 30 points max
  score_conformity INTEGER DEFAULT 100, -- 30 points max
  score_price INTEGER DEFAULT 100, -- 20 points max
  score_reactivity INTEGER DEFAULT 100, -- 10 points max
  score_seniority INTEGER DEFAULT 0, -- 10 points max

  -- Stats
  total_orders INTEGER DEFAULT 0,
  orders_on_time INTEGER DEFAULT 0,
  orders_with_issues INTEGER DEFAULT 0,
  total_disputes INTEGER DEFAULT 0,
  disputes_resolved_favorably INTEGER DEFAULT 0,
  avg_expedition_hours NUMERIC(6,1),
  avg_response_hours NUMERIC(6,1),

  -- Badge
  badge VARCHAR(20) DEFAULT 'new' CHECK (badge IN ('new', 'standard', 'premium', 'warning', 'suspended')),

  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_supplier ON supplier_scores(supplier_id);
