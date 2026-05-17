-- =============================================
-- JADOMI — Gestion famille patient (app familiale)
-- Table : patient_famille_membres
-- Permet au patient principal de gérer sa famille
-- =============================================

CREATE TABLE IF NOT EXISTS public.patient_famille_membres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_principal_id UUID NOT NULL REFERENCES public.dentiste_pro_patients(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  date_naissance DATE,
  lien TEXT DEFAULT 'autre' CHECK (lien IN ('conjoint', 'enfant', 'parent', 'autre')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_patient_famille ON public.patient_famille_membres(patient_principal_id);

-- GRANT obligatoires (Supabase post-octobre 2026)
GRANT SELECT ON public.patient_famille_membres TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_famille_membres TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_famille_membres TO service_role;

-- RLS
ALTER TABLE public.patient_famille_membres ENABLE ROW LEVEL SECURITY;
CREATE POLICY patient_famille_service ON public.patient_famille_membres FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY patient_famille_read ON public.patient_famille_membres FOR SELECT TO authenticated USING (true);
