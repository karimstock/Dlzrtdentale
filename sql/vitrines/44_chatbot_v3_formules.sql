-- =============================================
-- Passe 41B - Chatbot v3 formules + tags themes
-- Date : 24 avril 2026
-- =============================================

-- Formule choisie sur vitrines_sites
ALTER TABLE public.vitrines_sites
  ADD COLUMN IF NOT EXISTS formule_choisie VARCHAR(20);

-- Tags sur themes_sites (pour filtres galerie)
ALTER TABLE public.themes_sites
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

-- Verification
SELECT code, nom, tier, tags FROM public.themes_sites LIMIT 5;
