-- =============================================
-- Passe 41B fix - Categories photos equipements/zones
-- Date : 24 avril 2026
-- =============================================

-- Colonnes category + tag sur vitrines_medias
ALTER TABLE public.vitrines_medias
  ADD COLUMN IF NOT EXISTS category VARCHAR(50);

ALTER TABLE public.vitrines_medias
  ADD COLUMN IF NOT EXISTS tag VARCHAR(100);

-- Formule choisie sur vitrines_sites (si pas deja fait par SQL 44)
ALTER TABLE public.vitrines_sites
  ADD COLUMN IF NOT EXISTS formule_choisie VARCHAR(20);

-- Tags sur themes_sites (si pas deja fait par SQL 44)
ALTER TABLE public.themes_sites
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

-- Verification
SELECT column_name FROM information_schema.columns
WHERE table_name = 'vitrines_medias' AND column_name IN ('category', 'tag');
