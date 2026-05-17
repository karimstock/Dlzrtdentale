-- =============================================
-- Passe 83 — Liaison bidirectionnelle Cabinet ↔ Labo
-- Table de demandes de liaison entre cabinets dentaires
-- et laboratoires de prothèse.
-- =============================================

-- 1. Table de liaison
CREATE TABLE IF NOT EXISTS public.liaisons_cabinet_labo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.dentiste_pro_cabinets(id) ON DELETE CASCADE,
  labo_id UUID NOT NULL REFERENCES public.labo_prothesistes(id) ON DELETE CASCADE,
  statut TEXT NOT NULL DEFAULT 'en_attente'
    CHECK (statut IN ('en_attente', 'acceptee', 'refusee', 'resiliee')),
  demande_par TEXT NOT NULL
    CHECK (demande_par IN ('dentiste', 'labo')),
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cabinet_id, labo_id)
);

CREATE INDEX IF NOT EXISTS idx_liaisons_cabinet ON public.liaisons_cabinet_labo(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_liaisons_labo ON public.liaisons_cabinet_labo(labo_id);
CREATE INDEX IF NOT EXISTS idx_liaisons_statut ON public.liaisons_cabinet_labo(statut);

COMMENT ON TABLE public.liaisons_cabinet_labo IS 'Liaisons bidirectionnelles entre cabinets dentaires et laboratoires de prothèse.';

-- 2. GRANT obligatoires (Supabase post-octobre 2026)
-- PAS de GRANT pour anon : table confidentielle, jamais exposée aux non-authentifiés
GRANT SELECT, INSERT, UPDATE, DELETE ON public.liaisons_cabinet_labo TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.liaisons_cabinet_labo TO service_role;

-- 3. RLS
ALTER TABLE public.liaisons_cabinet_labo ENABLE ROW LEVEL SECURITY;

-- Policy permissive pour service_role (backend Node.js)
CREATE POLICY liaisons_cabinet_labo_service ON public.liaisons_cabinet_labo
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy lecture pour authenticated : un utilisateur ne voit que SES propres liaisons
-- (via cabinet_id ou labo_id lié à son user_id)
CREATE POLICY liaisons_cabinet_labo_select ON public.liaisons_cabinet_labo
  FOR SELECT
  TO authenticated
  USING (
    cabinet_id IN (
      SELECT id FROM public.dentiste_pro_cabinets
      WHERE societe_id IN (
        SELECT societe_id FROM public.user_societe_roles WHERE user_id = auth.uid()
      )
    )
    OR
    labo_id IN (
      SELECT id FROM public.labo_prothesistes
      WHERE societe_id IN (
        SELECT societe_id FROM public.user_societe_roles WHERE user_id = auth.uid()
      )
    )
  );
