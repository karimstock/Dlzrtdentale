-- =============================================
-- JADOMI — Module Mon site internet
-- 04_rls.sql — Row Level Security
-- =============================================

-- -------------------------------------------
-- Helper : vitrines_user_has_site_access
-- Verifie que l'utilisateur a acces au site via sa societe
-- -------------------------------------------
CREATE OR REPLACE FUNCTION vitrines_user_has_site_access(p_site_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_societe_roles usr
    JOIN vitrines_sites vs ON vs.societe_id = usr.societe_id
    WHERE usr.user_id = auth.uid()
      AND vs.id = p_site_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- -------------------------------------------
-- Helper : vitrines_user_has_societe_access
-- -------------------------------------------
CREATE OR REPLACE FUNCTION vitrines_user_has_societe_access(p_societe_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_societe_roles
    WHERE user_id = auth.uid()
      AND societe_id = p_societe_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- -------------------------------------------
-- Helper : vitrines_user_is_admin
-- -------------------------------------------
CREATE OR REPLACE FUNCTION vitrines_user_is_admin(p_societe_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_societe_roles
    WHERE user_id = auth.uid()
      AND societe_id = p_societe_id
      AND role IN ('owner', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================
-- vitrines_sites
-- =============================================
ALTER TABLE vitrines_sites ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_sites_select ON vitrines_sites;
  CREATE POLICY vitrines_sites_select ON vitrines_sites FOR SELECT USING (
    vitrines_user_has_societe_access(societe_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_sites_insert ON vitrines_sites;
  CREATE POLICY vitrines_sites_insert ON vitrines_sites FOR INSERT WITH CHECK (
    vitrines_user_is_admin(societe_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_sites_update ON vitrines_sites;
  CREATE POLICY vitrines_sites_update ON vitrines_sites FOR UPDATE USING (
    vitrines_user_is_admin(societe_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_sites_delete ON vitrines_sites;
  CREATE POLICY vitrines_sites_delete ON vitrines_sites FOR DELETE USING (
    vitrines_user_is_admin(societe_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- =============================================
-- vitrines_sections
-- =============================================
ALTER TABLE vitrines_sections ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_sections_select ON vitrines_sections;
  CREATE POLICY vitrines_sections_select ON vitrines_sections FOR SELECT USING (
    vitrines_user_has_site_access(site_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_sections_insert ON vitrines_sections;
  CREATE POLICY vitrines_sections_insert ON vitrines_sections FOR INSERT WITH CHECK (
    vitrines_user_has_site_access(site_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_sections_update ON vitrines_sections;
  CREATE POLICY vitrines_sections_update ON vitrines_sections FOR UPDATE USING (
    vitrines_user_has_site_access(site_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_sections_delete ON vitrines_sections;
  CREATE POLICY vitrines_sections_delete ON vitrines_sections FOR DELETE USING (
    vitrines_user_has_site_access(site_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- =============================================
-- vitrines_medias
-- =============================================
ALTER TABLE vitrines_medias ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_medias_select ON vitrines_medias;
  CREATE POLICY vitrines_medias_select ON vitrines_medias FOR SELECT USING (
    vitrines_user_has_site_access(site_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_medias_insert ON vitrines_medias;
  CREATE POLICY vitrines_medias_insert ON vitrines_medias FOR INSERT WITH CHECK (
    vitrines_user_has_site_access(site_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_medias_update ON vitrines_medias;
  CREATE POLICY vitrines_medias_update ON vitrines_medias FOR UPDATE USING (
    vitrines_user_has_site_access(site_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_medias_delete ON vitrines_medias;
  CREATE POLICY vitrines_medias_delete ON vitrines_medias FOR DELETE USING (
    vitrines_user_has_site_access(site_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- =============================================
-- vitrines_conversations
-- =============================================
ALTER TABLE vitrines_conversations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_conversations_select ON vitrines_conversations;
  CREATE POLICY vitrines_conversations_select ON vitrines_conversations FOR SELECT USING (
    vitrines_user_has_site_access(site_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_conversations_insert ON vitrines_conversations;
  CREATE POLICY vitrines_conversations_insert ON vitrines_conversations FOR INSERT WITH CHECK (
    vitrines_user_has_site_access(site_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_conversations_update ON vitrines_conversations;
  CREATE POLICY vitrines_conversations_update ON vitrines_conversations FOR UPDATE USING (
    vitrines_user_has_site_access(site_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- =============================================
-- vitrines_versions
-- =============================================
ALTER TABLE vitrines_versions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_versions_select ON vitrines_versions;
  CREATE POLICY vitrines_versions_select ON vitrines_versions FOR SELECT USING (
    vitrines_user_has_site_access(site_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_versions_insert ON vitrines_versions;
  CREATE POLICY vitrines_versions_insert ON vitrines_versions FOR INSERT WITH CHECK (
    vitrines_user_has_site_access(site_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- =============================================
-- vitrines_competitors
-- =============================================
ALTER TABLE vitrines_competitors ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_competitors_select ON vitrines_competitors;
  CREATE POLICY vitrines_competitors_select ON vitrines_competitors FOR SELECT USING (
    vitrines_user_has_site_access(site_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_competitors_insert ON vitrines_competitors;
  CREATE POLICY vitrines_competitors_insert ON vitrines_competitors FOR INSERT WITH CHECK (
    vitrines_user_has_site_access(site_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_competitors_update ON vitrines_competitors;
  CREATE POLICY vitrines_competitors_update ON vitrines_competitors FOR UPDATE USING (
    vitrines_user_has_site_access(site_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- =============================================
-- vitrines_analytics
-- =============================================
ALTER TABLE vitrines_analytics ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_analytics_select ON vitrines_analytics;
  CREATE POLICY vitrines_analytics_select ON vitrines_analytics FOR SELECT USING (
    vitrines_user_has_site_access(site_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_analytics_insert ON vitrines_analytics;
  CREATE POLICY vitrines_analytics_insert ON vitrines_analytics FOR INSERT WITH CHECK (
    vitrines_user_has_site_access(site_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- =============================================
-- vitrines_edits
-- =============================================
ALTER TABLE vitrines_edits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_edits_select ON vitrines_edits;
  CREATE POLICY vitrines_edits_select ON vitrines_edits FOR SELECT USING (
    vitrines_user_has_site_access(site_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_edits_insert ON vitrines_edits;
  CREATE POLICY vitrines_edits_insert ON vitrines_edits FOR INSERT WITH CHECK (
    vitrines_user_has_site_access(site_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- =============================================
-- vitrines_usage_quotas
-- =============================================
ALTER TABLE vitrines_usage_quotas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_usage_quotas_select ON vitrines_usage_quotas;
  CREATE POLICY vitrines_usage_quotas_select ON vitrines_usage_quotas FOR SELECT USING (
    vitrines_user_has_site_access(site_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_usage_quotas_insert ON vitrines_usage_quotas;
  CREATE POLICY vitrines_usage_quotas_insert ON vitrines_usage_quotas FOR INSERT WITH CHECK (
    vitrines_user_has_site_access(site_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS vitrines_usage_quotas_update ON vitrines_usage_quotas;
  CREATE POLICY vitrines_usage_quotas_update ON vitrines_usage_quotas FOR UPDATE USING (
    vitrines_user_has_site_access(site_id)
  );
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
