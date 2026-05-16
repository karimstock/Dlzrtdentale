-- ═══════════════════════════════════════════════════════════════
-- 78_connector.sql — Connecteur logiciel dentaire
-- Passe 78 — Migration idempotente
-- ═══════════════════════════════════════════════════════════════

-- ── Table 1 : connector_config ──────────────────────────────
CREATE TABLE IF NOT EXISTS connector_config (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id              UUID NOT NULL REFERENCES societes(id) ON DELETE CASCADE UNIQUE,
  adapter_type            TEXT NOT NULL DEFAULT 'logos_w'
                          CHECK (adapter_type IN ('logos_w','julie','weclever','maevi','desmos','visiodent','csv_import')),
  config                  JSONB DEFAULT '{}'::jsonb,
  mapping                 JSONB DEFAULT '{}'::jsonb,
  status                  TEXT DEFAULT 'disconnected'
                          CHECK (status IN ('disconnected','connected','syncing','error')),
  last_sync_at            TIMESTAMPTZ,
  last_sync_patients      INTEGER DEFAULT 0,
  last_sync_appointments  INTEGER DEFAULT 0,
  last_error              TEXT,
  auto_sync               BOOLEAN DEFAULT false,
  sync_interval_seconds   INTEGER DEFAULT 30,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE connector_config IS 'Configuration du connecteur logiciel dentaire par cabinet';
COMMENT ON COLUMN connector_config.config IS 'host, port, database path, user, password chiffre';
COMMENT ON COLUMN connector_config.mapping IS 'Mapping tables/colonnes du logiciel source';

-- ── Table 2 : connector_sync_log ────────────────────────────
CREATE TABLE IF NOT EXISTS connector_sync_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id            UUID NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  adapter_type          TEXT NOT NULL,
  sync_type             TEXT DEFAULT 'auto'
                        CHECK (sync_type IN ('auto','manual','initial')),
  patients_synced       INTEGER DEFAULT 0,
  appointments_synced   INTEGER DEFAULT 0,
  errors_count          INTEGER DEFAULT 0,
  duration_ms           INTEGER,
  details               JSONB DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE connector_sync_log IS 'Historique des synchronisations du connecteur';

-- ── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_connector_config_societe
  ON connector_config(societe_id);

CREATE INDEX IF NOT EXISTS idx_connector_config_status
  ON connector_config(status);

CREATE INDEX IF NOT EXISTS idx_connector_sync_log_societe
  ON connector_sync_log(societe_id);

CREATE INDEX IF NOT EXISTS idx_connector_sync_log_created
  ON connector_sync_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_connector_sync_log_societe_created
  ON connector_sync_log(societe_id, created_at DESC);

-- ── Trigger updated_at ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_connector_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_connector_config_updated_at ON connector_config;
CREATE TRIGGER trg_connector_config_updated_at
  BEFORE UPDATE ON connector_config
  FOR EACH ROW EXECUTE FUNCTION update_connector_config_updated_at();

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE connector_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_sync_log ENABLE ROW LEVEL SECURITY;

-- connector_config : lecture/ecriture par membres de la societe
DROP POLICY IF EXISTS connector_config_select ON connector_config;
CREATE POLICY connector_config_select ON connector_config
  FOR SELECT USING (
    societe_id IN (
      SELECT id FROM societes WHERE owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS connector_config_insert ON connector_config;
CREATE POLICY connector_config_insert ON connector_config
  FOR INSERT WITH CHECK (
    societe_id IN (
      SELECT id FROM societes WHERE owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS connector_config_update ON connector_config;
CREATE POLICY connector_config_update ON connector_config
  FOR UPDATE USING (
    societe_id IN (
      SELECT id FROM societes WHERE owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS connector_config_delete ON connector_config;
CREATE POLICY connector_config_delete ON connector_config
  FOR DELETE USING (
    societe_id IN (
      SELECT id FROM societes WHERE owner_id = auth.uid()
    )
  );

-- connector_sync_log : lecture par membres, insertion par admin+
DROP POLICY IF EXISTS connector_sync_log_select ON connector_sync_log;
CREATE POLICY connector_sync_log_select ON connector_sync_log
  FOR SELECT USING (
    societe_id IN (
      SELECT id FROM societes WHERE owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS connector_sync_log_insert ON connector_sync_log;
CREATE POLICY connector_sync_log_insert ON connector_sync_log
  FOR INSERT WITH CHECK (
    societe_id IN (
      SELECT id FROM societes WHERE owner_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- Fin 78_connector.sql
-- ═══════════════════════════════════════════════════════════════
