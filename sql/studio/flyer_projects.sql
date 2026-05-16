-- =============================================
-- JADOMI Studio — Table studio_flyer_projects
-- Projets du Flyer Builder
-- A copier-coller dans Supabase Dashboard > SQL Editor
-- =============================================

CREATE TABLE IF NOT EXISTS public.studio_flyer_projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  template_id UUID REFERENCES public.studio_templates(id),
  nom TEXT DEFAULT 'Sans titre',
  theme TEXT DEFAULT 'creme',
  fiche_data JSONB DEFAULT '{}',
  slots JSONB DEFAULT '{}',
  status TEXT DEFAULT 'draft',
  preview_url TEXT,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_flyer_projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_flyer_projects TO service_role;

ALTER TABLE public.studio_flyer_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own projects" ON public.studio_flyer_projects
  FOR ALL USING (true);
