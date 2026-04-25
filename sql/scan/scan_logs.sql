-- =============================================
-- JADOMI SCAN — Logs & analytics scans
-- Passe 51
-- =============================================

CREATE TABLE IF NOT EXISTS scan_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  societe_id UUID,
  prothesiste_id UUID,

  -- Type de scan
  scan_type VARCHAR(20) NOT NULL, -- 'barcode', 'photo', 'peremption', 'invoice'

  -- Identifiant scanne
  gtin VARCHAR(14),
  raw_code TEXT,

  -- Resultat
  product_id UUID,
  source_used VARCHAR(50), -- 'labo_stock', 'products_database', 'openfoodfacts', 'claude_ia', 'unknown'
  confidence NUMERIC(3,2),
  waterfall_levels_tried INTEGER,

  -- Action utilisateur
  validated BOOLEAN,
  corrected BOOLEAN,
  correction_details JSONB,

  -- Performance
  duration_ms INTEGER,

  -- Contexte
  device_type VARCHAR(20), -- 'desktop', 'mobile', 'tablet'
  scan_method VARCHAR(20), -- 'manual', 'camera', 'file_upload'

  -- Metadonnees
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scan_logs_user ON scan_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_societe ON scan_logs(societe_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_type ON scan_logs(scan_type);
CREATE INDEX IF NOT EXISTS idx_scan_logs_source ON scan_logs(source_used);
CREATE INDEX IF NOT EXISTS idx_scan_logs_date ON scan_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_logs_gtin ON scan_logs(gtin);
CREATE INDEX IF NOT EXISTS idx_scan_logs_product ON scan_logs(product_id);

-- RLS
ALTER TABLE scan_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY scan_logs_insert_auth ON scan_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY scan_logs_read_own ON scan_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Vue analytics aggregee (pas de RLS, admin only via service_role)
CREATE OR REPLACE VIEW v_scan_analytics AS
SELECT
  date_trunc('day', created_at) AS jour,
  scan_type,
  source_used,
  COUNT(*) AS total_scans,
  COUNT(*) FILTER (WHERE validated = true) AS validated_scans,
  COUNT(*) FILTER (WHERE corrected = true) AS corrected_scans,
  AVG(confidence) AS avg_confidence,
  AVG(duration_ms) AS avg_duration_ms,
  COUNT(DISTINCT user_id) AS unique_users,
  COUNT(DISTINCT gtin) AS unique_products
FROM scan_logs
GROUP BY 1, 2, 3;
