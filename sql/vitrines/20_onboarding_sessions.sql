-- =============================================
-- JADOMI — Migration 20 : Onboarding Sessions
-- Tracking des sessions onboarding v2
-- =============================================

CREATE TABLE IF NOT EXISTS onboarding_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  current_step int DEFAULT 1,
  context jsonb DEFAULT '{}',
  completed boolean DEFAULT false,
  started_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_onboarding_user ON onboarding_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_completed ON onboarding_sessions(completed);
