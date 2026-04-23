-- =============================================
-- JADOMI — Module Mon site internet
-- 06_site_meta.sql — Colonnes meta pour site multi-pages
-- =============================================

ALTER TABLE vitrines_sites ADD COLUMN IF NOT EXISTS adresse text;
ALTER TABLE vitrines_sites ADD COLUMN IF NOT EXISTS telephone text;
ALTER TABLE vitrines_sites ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE vitrines_sites ADD COLUMN IF NOT EXISTS horaires text;
ALTER TABLE vitrines_sites ADD COLUMN IF NOT EXISTS siret text;
ALTER TABLE vitrines_sites ADD COLUMN IF NOT EXISTS rpps text;
ALTER TABLE vitrines_sites ADD COLUMN IF NOT EXISTS ordre_numero text;
ALTER TABLE vitrines_sites ADD COLUMN IF NOT EXISTS barreau text;
ALTER TABLE vitrines_sites ADD COLUMN IF NOT EXISTS assurance_rc text;
ALTER TABLE vitrines_sites ADD COLUMN IF NOT EXISTS social_instagram text;
ALTER TABLE vitrines_sites ADD COLUMN IF NOT EXISTS social_facebook text;
ALTER TABLE vitrines_sites ADD COLUMN IF NOT EXISTS social_linkedin text;
ALTER TABLE vitrines_sites ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE vitrines_sites ADD COLUMN IF NOT EXISTS footer_pitch text;
ALTER TABLE vitrines_sites ADD COLUMN IF NOT EXISTS metier_category text DEFAULT 'sante';
ALTER TABLE vitrines_sites ADD COLUMN IF NOT EXISTS traitements jsonb DEFAULT '[]';
