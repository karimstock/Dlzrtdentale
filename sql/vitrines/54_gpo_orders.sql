-- =============================================
-- JADOMI — Passe 53 : Commandes GPO confirmees
-- 26 avril 2026
--
-- Apres acceptation fournisseur, la commande passe en phase
-- "revelee" : le cabinet est identifie, le prix est verrouille,
-- un bon de commande est genere.
-- =============================================

-- ════════════════════════════════════════════
-- TABLE : gpo_orders (commandes confirmees)
-- ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gpo_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Lien vers la request GPO d'origine
  gpo_request_id UUID NOT NULL,
  gpo_attempt_id UUID,

  -- Identite cabinet (revelee apres acceptation)
  societe_id UUID NOT NULL,
  cabinet_name VARCHAR(200) NOT NULL,
  cabinet_adresse TEXT,
  cabinet_code_postal VARCHAR(10),
  cabinet_ville VARCHAR(100),
  cabinet_siret VARCHAR(20),
  cabinet_email VARCHAR(200),
  cabinet_telephone VARCHAR(30),
  cabinet_tva_intracom VARCHAR(20),

  -- Identite fournisseur
  supplier_id UUID NOT NULL,
  supplier_name VARCHAR(200) NOT NULL,
  supplier_email VARCHAR(200),
  supplier_telephone VARCHAR(30),

  -- Commande
  items JSONB NOT NULL,                   -- copie des items commandes
  total_ht NUMERIC(12,2) NOT NULL,        -- prix verrouille HT
  tva_percent NUMERIC(5,2) DEFAULT 20.0,
  total_ttc NUMERIC(12,2),
  currency VARCHAR(3) DEFAULT 'EUR',

  -- Prix de reference (pour prouver le verrouillage)
  original_target_price NUMERIC(12,2),    -- tarif cible JADOMI initial
  supplier_accepted_price NUMERIC(12,2),  -- prix accepte par fournisseur
  price_locked_at TIMESTAMPTZ NOT NULL,   -- timestamp du verrouillage

  -- Bon de commande
  order_number VARCHAR(30) NOT NULL,      -- ex: JD-2026-0001
  order_pdf_url TEXT,                     -- URL du PDF genere
  order_pdf_hash TEXT,                    -- hash SHA256 du PDF (preuve)

  -- Statut de la commande
  status VARCHAR(30) DEFAULT 'confirmed' CHECK (status IN (
    'confirmed',        -- commande confirmee, identite revelee
    'order_sent',       -- bon de commande envoye au fournisseur
    'acknowledged',     -- fournisseur a accuse reception
    'shipped',          -- fournisseur a expedie
    'delivered',        -- cabinet a confirme reception
    'invoiced',         -- facture recue/emise
    'completed',        -- tout est clos
    'disputed'          -- litige en cours
  )),

  -- Livraison
  shipping_address TEXT,                  -- adresse livraison (peut differer)
  tracking_number VARCHAR(100),
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  delivery_confirmed_by UUID,

  -- Facturation
  invoice_number VARCHAR(100),
  invoice_date DATE,
  invoice_pdf_url TEXT,
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN (
    'pending', 'invoiced', 'paid', 'overdue', 'disputed'
  )),
  payment_due_date DATE,

  -- Metadata
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gpo_orders_request ON gpo_orders(gpo_request_id);
CREATE INDEX IF NOT EXISTS idx_gpo_orders_societe ON gpo_orders(societe_id);
CREATE INDEX IF NOT EXISTS idx_gpo_orders_supplier ON gpo_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_gpo_orders_status ON gpo_orders(status);
CREATE INDEX IF NOT EXISTS idx_gpo_orders_number ON gpo_orders(order_number);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trg_gpo_orders_updated()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gpo_orders_updated ON gpo_orders;
CREATE TRIGGER trg_gpo_orders_updated
  BEFORE UPDATE ON gpo_orders
  FOR EACH ROW EXECUTE FUNCTION trg_gpo_orders_updated();

-- RLS
ALTER TABLE gpo_orders ENABLE ROW LEVEL SECURITY;

-- Le cabinet voit ses commandes
CREATE POLICY gpo_orders_cabinet ON gpo_orders
  FOR SELECT USING (
    societe_id IN (
      SELECT societe_id FROM user_societe_roles
      WHERE user_id = auth.uid()
    )
  );

-- Insert par le systeme uniquement
CREATE POLICY gpo_orders_insert ON gpo_orders
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Update par le systeme ou le proprietaire
CREATE POLICY gpo_orders_update ON gpo_orders
  FOR UPDATE USING (auth.role() = 'service_role' OR societe_id IN (
    SELECT societe_id FROM user_societe_roles
    WHERE user_id = auth.uid() AND role IN ('proprietaire', 'associe')
  ));

-- ════════════════════════════════════════════
-- SEQUENCE : numeros de commande JADOMI
-- Format : JD-YYYY-NNNN (ex: JD-2026-0001)
-- ════════════════════════════════════════════
CREATE SEQUENCE IF NOT EXISTS gpo_order_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS VARCHAR(30) AS $$
BEGIN
  RETURN 'JD-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' ||
         LPAD(nextval('gpo_order_number_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;
