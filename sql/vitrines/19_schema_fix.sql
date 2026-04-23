-- =============================================
-- Migration 19 : Fix schema — colonnes manquantes societes
-- =============================================

-- Colonnes référencées par public.js mais potentiellement absentes
ALTER TABLE societes ADD COLUMN IF NOT EXISTS adresse_complement text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS horaires text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS siret text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS tva_intracom text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS rpps text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS ordre_numero text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS barreau text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS numero_toque text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS carpa text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS assurance_rc text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS social_instagram text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS social_facebook text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS social_linkedin text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS secteur_conventionnel text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS footer_pitch text;

-- Index unique pour empêcher doublons de médias (même fichier uploadé 2x)
ALTER TABLE vitrines_medias ADD COLUMN IF NOT EXISTS file_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_medias_site_hash
  ON vitrines_medias(site_id, file_hash) WHERE file_hash IS NOT NULL;
