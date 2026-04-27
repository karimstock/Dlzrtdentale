-- Passe 59 — SOS Remplacement IDE
-- Table de demandes de remplacement entre cabinets

CREATE TABLE IF NOT EXISTS ide_remplacement_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  absence_id UUID NOT NULL REFERENCES ide_absences(id) ON DELETE CASCADE,
  sender_cabinet_id UUID NOT NULL REFERENCES ide_cabinets(id) ON DELETE CASCADE,
  target_nurse_id UUID NOT NULL REFERENCES ide_nurses(id) ON DELETE CASCADE,
  message TEXT,
  retrocession_pct NUMERIC(5,2) DEFAULT 70.00
    CHECK (retrocession_pct BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined','cancelled','expired')),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_idr_absence ON ide_remplacement_requests(absence_id);
CREATE INDEX IF NOT EXISTS idx_idr_sender ON ide_remplacement_requests(sender_cabinet_id);
CREATE INDEX IF NOT EXISTS idx_idr_target ON ide_remplacement_requests(target_nurse_id);
CREATE INDEX IF NOT EXISTS idx_idr_status ON ide_remplacement_requests(status);
CREATE INDEX IF NOT EXISTS idx_idr_created ON ide_remplacement_requests(created_at DESC);

-- Composite index for duplicate-request check (absence + nurse + pending status)
CREATE INDEX IF NOT EXISTS idx_idr_absence_nurse_pending
  ON ide_remplacement_requests(absence_id, target_nurse_id)
  WHERE status = 'pending';

-- Composite index for sender_cabinet_id + status (IDOR-safe queries in accept/decline)
CREATE INDEX IF NOT EXISTS idx_idr_sender_status
  ON ide_remplacement_requests(sender_cabinet_id, status);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_idr_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_idr_updated_at ON ide_remplacement_requests;
CREATE TRIGGER trg_idr_updated_at
  BEFORE UPDATE ON ide_remplacement_requests
  FOR EACH ROW EXECUTE FUNCTION update_idr_updated_at();

-- RLS (defense-in-depth — queries go through service_role, but RLS protects against accidental anon access)
ALTER TABLE ide_remplacement_requests ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS
CREATE POLICY "service_role_full_access" ON ide_remplacement_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can see requests they sent or that target their nurses
CREATE POLICY "auth_select_own" ON ide_remplacement_requests
  FOR SELECT TO authenticated USING (
    sender_cabinet_id IN (SELECT id FROM ide_cabinets WHERE societe_id IN (SELECT id FROM societes WHERE owner_id = auth.uid()))
    OR target_nurse_id IN (SELECT id FROM ide_nurses WHERE cabinet_id IN (SELECT id FROM ide_cabinets WHERE societe_id IN (SELECT id FROM societes WHERE owner_id = auth.uid())))
  );
