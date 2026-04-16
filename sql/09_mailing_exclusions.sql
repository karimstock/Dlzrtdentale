-- =====================================================================
-- JADOMI — Mailing : tracking des exclusions "hors_secteur"
-- À exécuter APRÈS sql/06_secteurs.sql et sql/multi_societes/04_mailing.sql
-- Idempotent.
-- =====================================================================
-- Objectif :
--   Quand une campagne mailing exclut un destinataire car son secteur_metier
--   n'appartient pas aux secteurs_cibles de la société, on trace l'exclusion
--   dans campagne_envois (envoye_at NULL, raison='hors_secteur').
--   Permet l'audit RGPD et le reporting "x contacts exclus car hors cible".
-- =====================================================================

ALTER TABLE public.campagne_envois
  ADD COLUMN IF NOT EXISTS raison text;

ALTER TABLE public.campagne_envois
  ALTER COLUMN envoye_at DROP DEFAULT;

-- Nouveau : raison facultative, parmi un set connu
ALTER TABLE public.campagne_envois DROP CONSTRAINT IF EXISTS campagne_envois_raison_check;
ALTER TABLE public.campagne_envois
  ADD CONSTRAINT campagne_envois_raison_check
  CHECK (raison IS NULL OR raison IN ('hors_secteur','desabonne','bounce','doublon'));

CREATE INDEX IF NOT EXISTS idx_envois_raison
  ON public.campagne_envois(campagne_id, raison) WHERE raison IS NOT NULL;

ALTER TABLE public.campagnes_mailing
  ADD COLUMN IF NOT EXISTS nb_exclus integer NOT NULL DEFAULT 0;

-- =====================================================================
-- FIN 09_mailing_exclusions
-- =====================================================================
