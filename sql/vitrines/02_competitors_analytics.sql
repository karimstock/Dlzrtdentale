-- =============================================
-- JADOMI — Module Mon site internet
-- 02_competitors_analytics.sql
-- =============================================

-- -------------------------------------------
-- Table : vitrines_competitors
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS vitrines_competitors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         uuid NOT NULL REFERENCES vitrines_sites(id) ON DELETE CASCADE,
  competitor_name text,
  competitor_url  text,
  competitor_gmb_id text,
  analysis        jsonb,
  created_at      timestamptz DEFAULT now()
);

-- -------------------------------------------
-- Table : vitrines_analytics
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS vitrines_analytics (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id             uuid NOT NULL REFERENCES vitrines_sites(id) ON DELETE CASCADE,
  date                date NOT NULL,
  page_views          int DEFAULT 0,
  unique_visitors     int DEFAULT 0,
  contact_clicks      int DEFAULT 0,
  phone_clicks        int DEFAULT 0,
  rdv_clicks          int DEFAULT 0,
  source_breakdown    jsonb DEFAULT '{}'::jsonb,
  ab_variant_shown    text,
  UNIQUE(site_id, date, ab_variant_shown)
);

CREATE INDEX IF NOT EXISTS idx_vitrines_analytics_site_date ON vitrines_analytics(site_id, date);
