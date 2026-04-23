-- =============================================
-- JADOMI — Module Mon site internet
-- 16_dashboard_modulable.sql — Dashboard modulable
-- =============================================

CREATE TABLE IF NOT EXISTS dashboard_tabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES vitrines_sites(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  icon text DEFAULT '📄',
  tab_type text DEFAULT 'custom',
  position int DEFAULT 0,
  is_default boolean DEFAULT false,
  is_archived boolean DEFAULT false,
  ia_context text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dash_tabs_site ON dashboard_tabs(site_id);

CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_id uuid NOT NULL REFERENCES dashboard_tabs(id) ON DELETE CASCADE,
  widget_type text NOT NULL,
  title text,
  config jsonb DEFAULT '{}',
  position_x int DEFAULT 0,
  position_y int DEFAULT 0,
  width int DEFAULT 12,
  height int DEFAULT 4,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dash_widgets_tab ON dashboard_widgets(tab_id);

CREATE TABLE IF NOT EXISTS dashboard_ia_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_id uuid NOT NULL REFERENCES dashboard_tabs(id) ON DELETE CASCADE,
  messages jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
