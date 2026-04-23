-- =============================================
-- JADOMI — Migration 32 — Tour Guide state
-- Passe 31 (23 avril 2026)
-- =============================================

ALTER TABLE user_onboarding_state
  ADD COLUMN IF NOT EXISTS tour_completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tour_skipped boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tour_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS tour_skipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS tour_restart_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tour_current_step int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profession_type text;

NOTIFY pgrst, 'reload schema';
