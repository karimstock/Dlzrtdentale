-- =============================================
-- JADOMI — Migration 31 — Fix Timeline site_id nullable
-- Passe 30 hotfix (23 avril 2026)
-- =============================================

-- Rendre site_id nullable (timeline peut exister sans site vitrine)
ALTER TABLE treatment_timelines
  ALTER COLUMN site_id DROP NOT NULL;

-- Ajouter societe_id si pas deja present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'treatment_timelines' AND column_name = 'societe_id'
  ) THEN
    ALTER TABLE treatment_timelines ADD COLUMN societe_id uuid;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_timeline_societe
  ON treatment_timelines(societe_id);

NOTIFY pgrst, 'reload schema';
