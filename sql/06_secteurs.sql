-- =====================================================================
-- JADOMI — Architecture multi-secteurs (Phase 7 post-multi_societes)
-- À exécuter dans Supabase SQL Editor APRÈS :
--   sql/multi_societes/01_foundations.sql
--   sql/multi_societes/03_commerce.sql
--   sql/multi_societes/04_mailing.sql
--   sql/multi_societes/05_extend_types.sql
-- Idempotent — safe à réexécuter.
-- =====================================================================
-- Objectif :
--  · user_profils.secteur_metier   → secteur d'appartenance (1 user = 1 secteur)
--  · societes.secteur              → secteur de la société elle-même
--  · societes.secteurs_cibles jsonb → à qui cette société vend
--  · Base du matching sectoriel : une campagne mailing d'une société
--    n'est envoyée qu'aux users dont secteur_metier ∈ secteurs_cibles.
-- =====================================================================

-- ---------- 1. Secteur sur societes ----------
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS secteur text;
ALTER TABLE public.societes DROP CONSTRAINT IF EXISTS societes_secteur_check;
ALTER TABLE public.societes
  ADD CONSTRAINT societes_secteur_check CHECK (
    secteur IS NULL OR secteur IN (
      'sante','btp','esthetique','restauration','juridique','autre'
    )
  );
CREATE INDEX IF NOT EXISTS idx_societes_secteur ON public.societes(secteur);

-- ---------- 2. Secteurs cibles sur societes ----------
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS secteurs_cibles jsonb DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS idx_societes_secteurs_cibles
  ON public.societes USING gin (secteurs_cibles);

-- Rétrocompat : cabinet_dentaire → secteur 'sante' + cible 'sante' par défaut
UPDATE public.societes
SET secteur = 'sante'
WHERE type = 'cabinet_dentaire' AND secteur IS NULL;

UPDATE public.societes
SET secteurs_cibles = '["sante"]'::jsonb
WHERE type = 'cabinet_dentaire'
  AND (secteurs_cibles IS NULL OR secteurs_cibles = '[]'::jsonb);

-- ---------- 3. Secteur métier sur user_profils ----------
ALTER TABLE public.user_profils ADD COLUMN IF NOT EXISTS secteur_metier text;
ALTER TABLE public.user_profils DROP CONSTRAINT IF EXISTS user_profils_secteur_metier_check;
ALTER TABLE public.user_profils
  ADD CONSTRAINT user_profils_secteur_metier_check CHECK (
    secteur_metier IS NULL OR secteur_metier IN (
      'sante','btp','esthetique','restauration','juridique','autre'
    )
  );
CREATE INDEX IF NOT EXISTS idx_profils_secteur_metier
  ON public.user_profils(secteur_metier);

-- Inférence depuis metier / sous_metier pour les profils existants.
-- NB : secteur 'sante' inclut dentistes + orthos + prothésistes + vétos + médical/paramédical.
UPDATE public.user_profils
SET secteur_metier = CASE
    WHEN metier IN ('chirurgien_dentiste','orthodontiste','prothesiste','veterinaire') THEN 'sante'
    WHEN metier = 'profession_liberale' AND sous_metier IN ('medecin','infirmier','kine','osteo') THEN 'sante'
    WHEN metier = 'profession_liberale' AND sous_metier IN ('avocat','notaire','huissier') THEN 'juridique'
    ELSE 'autre'
  END
WHERE secteur_metier IS NULL;

-- =====================================================================
-- FIN 06_secteurs — matching sectoriel prêt
-- =====================================================================
