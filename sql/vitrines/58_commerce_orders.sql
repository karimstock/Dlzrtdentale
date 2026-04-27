-- Passe 56 — Commerce Orders (Amazon-like checkout)

-- Cart persistence
CREATE TABLE IF NOT EXISTS jadomi_carts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  societe_id UUID,
  items JSONB DEFAULT '[]',
  items_count INTEGER DEFAULT 0,
  subtotal_ht NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_user ON jadomi_carts(user_id);

-- Orders table (like Amazon orders)
CREATE TABLE IF NOT EXISTS jadomi_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number VARCHAR(20), -- JC-2026-0001
  user_id UUID NOT NULL,
  societe_id UUID,

  -- Payment
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  payment_method VARCHAR(30), -- card, paypal, sepa
  paid_at TIMESTAMPTZ,

  -- Items
  items JSONB DEFAULT '[]',

  -- Totals
  subtotal_products_ht NUMERIC(12,2) DEFAULT 0,
  shipping_ht NUMERIC(12,2) DEFAULT 0,
  total_ht NUMERIC(12,2) DEFAULT 0,
  tva_amount NUMERIC(12,2) DEFAULT 0,
  total_ttc NUMERIC(12,2) DEFAULT 0,

  -- JADOMI revenue
  jadomi_commission_ht NUMERIC(12,2) DEFAULT 0,
  jadomi_shipping_margin_ht NUMERIC(12,2) DEFAULT 0,

  -- Status
  status VARCHAR(30) DEFAULT 'pending_payment' CHECK (status IN (
    'pending_payment', 'paid', 'processing', 'shipped', 'delivered',
    'completed', 'cancelled', 'refunded', 'expired', 'payout_scheduled', 'payout_done'
  )),

  -- Shipping
  shipping_address JSONB,
  tracking_number VARCHAR(100),
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  -- Invoice
  invoice_number VARCHAR(30),
  invoice_pdf_url TEXT,

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON jadomi_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_societe ON jadomi_orders(societe_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON jadomi_orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_stripe ON jadomi_orders(stripe_checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON jadomi_orders(created_at DESC);

-- Order number sequence
CREATE SEQUENCE IF NOT EXISTS jadomi_order_number_seq START 1;
