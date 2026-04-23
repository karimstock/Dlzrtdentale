-- =============================================
-- JADOMI — Module Mon site internet
-- 01_vitrines_module.sql — Tables principales
-- =============================================

-- -------------------------------------------
-- Table : vitrines_sites
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS vitrines_sites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id      uuid NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  profession_id   text NOT NULL,
  slug            text UNIQUE NOT NULL,
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','preview','published','archived')),
  palette         text DEFAULT 'ivory_gold',
  typography      text DEFAULT 'editorial',
  custom_domain   text,
  migration_source text DEFAULT 'none',
  previous_site_url text,
  migration_data  jsonb,
  languages       jsonb DEFAULT '["fr"]'::jsonb,
  published_at    timestamptz,
  current_version_id uuid,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vitrines_sites_societe ON vitrines_sites(societe_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vitrines_sites_slug ON vitrines_sites(slug);

-- -------------------------------------------
-- Table : vitrines_sections
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS vitrines_sections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     uuid NOT NULL REFERENCES vitrines_sites(id) ON DELETE CASCADE,
  type        text NOT NULL,
  position    int NOT NULL DEFAULT 0,
  content     jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_visible  boolean DEFAULT true,
  ab_variant  text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vitrines_sections_site ON vitrines_sections(site_id);

-- -------------------------------------------
-- Table : vitrines_medias
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS vitrines_medias (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         uuid NOT NULL REFERENCES vitrines_sites(id) ON DELETE CASCADE,
  category        text NOT NULL,
  storage_path    text NOT NULL,
  alt_text        text,
  position        int DEFAULT 0,
  rgpd_validated  boolean DEFAULT false,
  rgpd_detection  jsonb,
  ai_analysis     jsonb,
  width           int,
  height          int,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vitrines_medias_site ON vitrines_medias(site_id);

-- -------------------------------------------
-- Table : vitrines_conversations
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS vitrines_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         uuid NOT NULL REFERENCES vitrines_sites(id) ON DELETE CASCADE UNIQUE,
  mode            text DEFAULT 'creation' CHECK (mode IN ('creation','edition')),
  messages        jsonb DEFAULT '[]'::jsonb,
  extracted_data  jsonb,
  current_step    text DEFAULT 'introduction',
  is_complete     boolean DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- -------------------------------------------
-- Table : vitrines_versions
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS vitrines_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         uuid NOT NULL REFERENCES vitrines_sites(id) ON DELETE CASCADE,
  version_number  int NOT NULL,
  snapshot        jsonb NOT NULL,
  published_at    timestamptz,
  published_by    uuid REFERENCES auth.users(id),
  created_at      timestamptz DEFAULT now()
);

-- -------------------------------------------
-- Trigger updated_at
-- -------------------------------------------
CREATE OR REPLACE FUNCTION vitrines_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_vitrines_sites_updated') THEN
    CREATE TRIGGER trg_vitrines_sites_updated
      BEFORE UPDATE ON vitrines_sites
      FOR EACH ROW EXECUTE FUNCTION vitrines_set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_vitrines_sections_updated') THEN
    CREATE TRIGGER trg_vitrines_sections_updated
      BEFORE UPDATE ON vitrines_sections
      FOR EACH ROW EXECUTE FUNCTION vitrines_set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_vitrines_conversations_updated') THEN
    CREATE TRIGGER trg_vitrines_conversations_updated
      BEFORE UPDATE ON vitrines_conversations
      FOR EACH ROW EXECUTE FUNCTION vitrines_set_updated_at();
  END IF;
END $$;
