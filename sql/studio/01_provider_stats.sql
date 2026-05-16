-- =============================================
-- JADOMI Studio — Scoring dynamique providers IA
-- Table de statistiques de performance
-- =============================================

CREATE TABLE IF NOT EXISTS studio_provider_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  task_type TEXT NOT NULL,
  total_calls INT DEFAULT 0,
  success_count INT DEFAULT 0,
  fail_count INT DEFAULT 0,
  avg_latency_ms INT DEFAULT 0,
  success_rate NUMERIC(5,4),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(provider, task_type)
);

-- GRANT obligatoire (règle Supabase mai 2026)
GRANT SELECT ON studio_provider_stats TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON studio_provider_stats TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON studio_provider_stats TO service_role;

ALTER TABLE studio_provider_stats ENABLE ROW LEVEL SECURITY;

-- Policy : service_role peut tout faire (stats système, pas user-facing)
CREATE POLICY "service_role_full_access" ON studio_provider_stats
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy : authenticated peut lire (dashboard admin)
CREATE POLICY "authenticated_read" ON studio_provider_stats
  FOR SELECT TO authenticated
  USING (true);

-- Index pour lookups rapides
CREATE INDEX IF NOT EXISTS idx_provider_stats_lookup
  ON studio_provider_stats(provider, task_type);
