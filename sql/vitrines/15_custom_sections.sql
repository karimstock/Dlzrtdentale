-- =============================================
-- JADOMI — Module Mon site internet
-- 15_custom_sections.sql
-- =============================================

CREATE TABLE IF NOT EXISTS vitrines_custom_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES vitrines_sites(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  icon text DEFAULT '📁',
  position int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_custom_sections_site ON vitrines_custom_sections(site_id);
