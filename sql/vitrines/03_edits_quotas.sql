-- =============================================
-- JADOMI — Module Mon site internet
-- 03_edits_quotas.sql
-- =============================================

-- -------------------------------------------
-- Table : vitrines_edits
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS vitrines_edits (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id             uuid NOT NULL REFERENCES vitrines_sites(id) ON DELETE CASCADE,
  edit_type           text NOT NULL,
  edited_by           uuid REFERENCES auth.users(id),
  target_section_id   uuid,
  target_media_id     uuid,
  ai_tokens_consumed  int DEFAULT 0,
  meta                jsonb DEFAULT '{}'::jsonb,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vitrines_edits_site_date ON vitrines_edits(site_id, created_at);
CREATE INDEX IF NOT EXISTS idx_vitrines_edits_site_type ON vitrines_edits(site_id, edit_type, created_at);

-- -------------------------------------------
-- Table : vitrines_usage_quotas
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS vitrines_usage_quotas (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id                     uuid NOT NULL REFERENCES vitrines_sites(id) ON DELETE CASCADE,
  period_year                 int NOT NULL,
  period_month                int NOT NULL,
  ai_regenerations_used       int DEFAULT 0,
  ai_regenerations_limit      int DEFAULT 50,
  complete_refreshes_used     int DEFAULT 0,
  complete_refreshes_limit    int DEFAULT 1,
  palette_changes_used        int DEFAULT 0,
  palette_changes_limit       int DEFAULT 4,
  additional_seo_pages_used   int DEFAULT 0,
  additional_seo_pages_limit  int DEFAULT 10,
  UNIQUE(site_id, period_year, period_month)
);
