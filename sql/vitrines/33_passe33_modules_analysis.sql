-- ===================================================
-- Migration 33 — Passe 33 : Modules activés + Analyse sites
-- ===================================================

-- Modules premium activés par société
CREATE TABLE IF NOT EXISTS societe_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid REFERENCES societes(id) ON DELETE CASCADE,
  module_name text NOT NULL,
  activated_at timestamptz DEFAULT now(),
  trial_ends_at timestamptz,
  subscription_active boolean DEFAULT false,
  stripe_subscription_id text,
  UNIQUE(societe_id, module_name)
);
CREATE INDEX IF NOT EXISTS idx_societe_modules_societe ON societe_modules(societe_id);

-- Analyses de sites existants
CREATE TABLE IF NOT EXISTS site_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid REFERENCES societes(id) ON DELETE CASCADE,
  source_url text,
  status text DEFAULT 'pending', -- pending|crawling|downloading|analyzing|auditing|done|error
  status_message text,
  scraped_data jsonb DEFAULT '{}',
  design_audit jsonb DEFAULT '{}',
  security_audit jsonb DEFAULT '{}',
  seo_audit jsonb DEFAULT '{}',
  performance_audit jsonb DEFAULT '{}',
  pages_explored int DEFAULT 0,
  team_members_detected jsonb DEFAULT '[]',
  privacy_alerts int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  error_message text
);
CREATE INDEX IF NOT EXISTS idx_site_analyses_societe ON site_analyses(societe_id);

-- Pages analysées lors du crawl
CREATE TABLE IF NOT EXISTS analyzed_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES site_analyses(id) ON DELETE CASCADE,
  url text NOT NULL,
  slug text,
  page_type text, -- home|team|about|services|contact|blog|legal|gallery|testimonials|other
  title text,
  h1 text,
  meta_description text,
  text_content jsonb DEFAULT '{}',
  internal_links text[],
  images_count int DEFAULT 0,
  videos_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analyzed_pages_analysis ON analyzed_pages(analysis_id);

-- Assets importés depuis sites existants ou upload manuel
CREATE TABLE IF NOT EXISTS imported_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES site_analyses(id) ON DELETE CASCADE,
  societe_id uuid REFERENCES societes(id) ON DELETE CASCADE,
  asset_type text, -- image|video|logo|video_embed|document
  source text DEFAULT 'crawl', -- crawl|manual_upload
  original_url text,
  original_r2_url text,
  original_size_bytes bigint,
  r2_url text,
  optimized_versions jsonb DEFAULT '{}',
  poster_url text,
  embed_provider text, -- youtube|vimeo
  embed_video_id text,
  source_page_url text,
  source_page_type text,
  identified_person jsonb, -- { name, confidence, source }
  metadata jsonb DEFAULT '{}',
  -- { width, height, format, has_alpha, color_space, density, exif,
  --   ai_analysis, context, alt, dominant_colors, duration_seconds }
  is_used boolean DEFAULT false,
  pending_ai_enhancement boolean DEFAULT false,
  category text, -- hero|about|gallery|team|service|logo|footer|content
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_imported_assets_analysis ON imported_assets(analysis_id);
CREATE INDEX IF NOT EXISTS idx_imported_assets_societe ON imported_assets(societe_id);
CREATE INDEX IF NOT EXISTS idx_imported_assets_type ON imported_assets(asset_type);

NOTIFY pgrst, 'reload schema';
