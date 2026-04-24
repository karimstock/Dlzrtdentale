-- =============================================
-- Passe 41B - Pages dediees + sections enrichies
-- Date : 24 avril 2026
-- =============================================

-- Pages dediees (pour avocats : 1 page par specialite)
CREATE TABLE IF NOT EXISTS public.vitrines_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL,
  slug VARCHAR(100) NOT NULL,
  titre VARCHAR(200),
  specialite_id VARCHAR(50),
  type VARCHAR(30) DEFAULT 'custom',
  ordre INT DEFAULT 0,
  is_generated_ia BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(site_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_pages_site ON public.vitrines_pages(site_id);

-- Colonnes enrichies sur vitrines_sections
ALTER TABLE public.vitrines_sections
  ADD COLUMN IF NOT EXISTS section_source VARCHAR(50) DEFAULT 'user_input';
ALTER TABLE public.vitrines_sections
  ADD COLUMN IF NOT EXISTS equipment_id VARCHAR(50);
ALTER TABLE public.vitrines_sections
  ADD COLUMN IF NOT EXISTS specialite_id VARCHAR(50);
ALTER TABLE public.vitrines_sections
  ADD COLUMN IF NOT EXISTS page_id UUID;

-- RLS
ALTER TABLE public.vitrines_pages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
CREATE POLICY pages_all ON public.vitrines_pages FOR ALL USING (
  site_id IN (SELECT id FROM public.vitrines_sites WHERE societe_id IN (
    SELECT societe_id FROM public.user_societe_roles WHERE user_id = auth.uid()
  ))
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Verification
SELECT 'vitrines_pages' as tbl, COUNT(*) FROM public.vitrines_pages;
