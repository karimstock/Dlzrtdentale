-- =============================================
-- JADOMI — Module Mon site internet
-- 10_reanalyze_jobs.sql
-- =============================================

CREATE TABLE IF NOT EXISTS vitrines_reanalyze_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  total int NOT NULL DEFAULT 0,
  completed int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reanalyze_jobs_site ON vitrines_reanalyze_jobs(site_id);
