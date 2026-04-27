-- ============================================================
-- 61_equipment_enrollments.sql
-- Tables pour le module Equipment Groupon : inscriptions & notifications
-- Passe 60 — 2026-04-27
-- ============================================================

-- Table des inscriptions dentistes aux offres equipement
CREATE TABLE IF NOT EXISTS equipment_enrollments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES signed_documents(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL,            -- cabinet dentaire
  user_id UUID NOT NULL,               -- utilisateur inscrit
  tier_price NUMERIC(12,2),            -- prix du palier au moment de l'inscription
  acompte_amount NUMERIC(12,2),        -- montant acompte (10% du prix palier)
  acompte_paid BOOLEAN DEFAULT FALSE,  -- acompte regle ou non
  acompte_paid_at TIMESTAMPTZ,         -- date reglement acompte
  status TEXT DEFAULT 'active' CHECK (status IN ('active','cancelled','completed','refunded')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_equip_enroll_active UNIQUE(proposal_id, societe_id)
);

-- Index pour requetes frequentes
CREATE INDEX IF NOT EXISTS idx_equip_enroll_proposal ON equipment_enrollments(proposal_id);
CREATE INDEX IF NOT EXISTS idx_equip_enroll_societe ON equipment_enrollments(societe_id);
CREATE INDEX IF NOT EXISTS idx_equip_enroll_user ON equipment_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_equip_enroll_status ON equipment_enrollments(status);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_equip_enroll_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_equip_enroll_updated_at ON equipment_enrollments;
CREATE TRIGGER trg_equip_enroll_updated_at
  BEFORE UPDATE ON equipment_enrollments
  FOR EACH ROW EXECUTE FUNCTION update_equip_enroll_updated_at();

-- Table des notifications equipement (paliers atteints, etc.)
CREATE TABLE IF NOT EXISTS equipment_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES signed_documents(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('tier_reached','deal_completed','reminder','acompte_confirmed')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equip_notif_proposal ON equipment_notifications(proposal_id);
CREATE INDEX IF NOT EXISTS idx_equip_notif_type ON equipment_notifications(type);

-- RLS policies
ALTER TABLE equipment_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_notifications ENABLE ROW LEVEL SECURITY;

-- Enrollments: users can read their own, service role can do everything
CREATE POLICY "Users read own enrollments"
  ON equipment_enrollments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own enrollments"
  ON equipment_enrollments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own enrollments"
  ON equipment_enrollments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access enrollments"
  ON equipment_enrollments FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Notifications: readable by all authenticated users (filtered in app)
CREATE POLICY "Authenticated read notifications"
  ON equipment_notifications FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service role full access notifications"
  ON equipment_notifications FOR ALL
  TO service_role USING (true) WITH CHECK (true);
