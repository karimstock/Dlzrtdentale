-- =============================================
-- JADOMI AVOCAT — TABLES DOCUMENTS & ENTÊTES
-- À exécuter dans Supabase Dashboard > SQL Editor
-- URL : https://supabase.com/dashboard/project/vsbomwjzehnfinfjvhqp/sql/new
-- =============================================

-- -----------------------------------------------
-- 1. Table avocat_entetes
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.avocat_entetes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL,
  nom_cabinet TEXT,
  nom_avocat TEXT,
  titre TEXT DEFAULT 'Maître',
  toque TEXT,
  barreau TEXT,
  adresse TEXT,
  cp TEXT,
  ville TEXT,
  telephone TEXT,
  fax TEXT,
  email TEXT,
  siret TEXT,
  rcs TEXT,
  carpa TEXT,
  tva_intracom TEXT,
  logo_url TEXT,
  mentions_specifiques TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(societe_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_entetes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_entetes TO service_role;
GRANT SELECT ON public.avocat_entetes TO anon;
ALTER TABLE public.avocat_entetes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "avocat_entetes_service" ON public.avocat_entetes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -----------------------------------------------
-- 2. Table avocat_documents_generes (si pas existante)
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.avocat_documents_generes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL,
  dossier_id UUID,
  type_document TEXT NOT NULL,
  titre TEXT,
  contenu_html TEXT,
  variables JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  version INT DEFAULT 1,
  statut TEXT DEFAULT 'brouillon',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_documents_generes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_documents_generes TO service_role;
GRANT SELECT ON public.avocat_documents_generes TO anon;
ALTER TABLE public.avocat_documents_generes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "avocat_documents_generes_service" ON public.avocat_documents_generes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -----------------------------------------------
-- 3. Colonnes supplémentaires sur avocat_dossiers
-- -----------------------------------------------
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS employeur_nom TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS employeur_siret TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS employeur_adresse TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS convention_collective TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS juridiction TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS section_cph TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS numero_rg TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS stade_procedural TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS salaire_brut NUMERIC;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS anciennete_mois INT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS avocat_adverse TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS date_audience TIMESTAMPTZ;
