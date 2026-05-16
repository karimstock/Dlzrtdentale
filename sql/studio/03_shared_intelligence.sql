-- =============================================
-- JADOMI — Shared Intelligence Layer
-- Mémoire commune entre routeur métier et Studio
-- GRANT obligatoire (règle Supabase mai 2026)
-- =============================================

CREATE TABLE IF NOT EXISTS user_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  source TEXT DEFAULT 'auto',
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT ON user_intelligence TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_intelligence TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_intelligence TO service_role;
ALTER TABLE user_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_intelligence" ON user_intelligence
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "service_role_all_intelligence" ON user_intelligence
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_user_intelligence_user ON user_intelligence(user_id);
CREATE INDEX IF NOT EXISTS idx_user_intelligence_type ON user_intelligence(type);
CREATE INDEX IF NOT EXISTS idx_user_intelligence_created ON user_intelligence(created_at DESC);
