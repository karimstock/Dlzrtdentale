-- =============================================
-- JADOMI — Migration 29 — Coach JADOMI (onboarding state)
-- Passe 25 (22-23 avril 2026)
-- =============================================

CREATE TABLE IF NOT EXISTS user_onboarding_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  societe_id uuid,
  -- Welcome tour
  welcome_shown boolean DEFAULT false,
  welcome_completed boolean DEFAULT false,
  welcome_skipped boolean DEFAULT false,
  -- Tooltips
  tooltips_enabled boolean DEFAULT true,
  tooltips_seen jsonb DEFAULT '[]'::jsonb,
  -- Preferences
  coach_reminders boolean DEFAULT true,
  last_activity_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, societe_id)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_state_user ON user_onboarding_state(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_state_societe ON user_onboarding_state(societe_id);
