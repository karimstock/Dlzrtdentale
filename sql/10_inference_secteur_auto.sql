-- =====================================================================
-- JADOMI — Inférence automatique du secteur_metier à partir de metier
-- À exécuter APRÈS sql/06_secteurs.sql
-- Idempotent.
-- =====================================================================
-- Objectif :
--   Le secteur_metier doit être rempli automatiquement dès qu'on connaît
--   le metier (et éventuellement le sous_metier). Évite qu'un nouvel user
--   reste en secteur NULL et se retrouve exclu de toutes les campagnes.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.infer_secteur_metier(p_metier text, p_sous_metier text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_metier IN ('chirurgien_dentiste','orthodontiste','prothesiste','veterinaire','medecin_paramedical')
      THEN 'sante'
    WHEN p_metier = 'avocat_notaire' THEN 'juridique'
    WHEN p_metier = 'professionnel_btp' THEN 'btp'
    WHEN p_metier = 'esthetique' THEN 'esthetique'
    WHEN p_metier = 'restaurateur' THEN 'restauration'
    WHEN p_metier = 'profession_liberale' AND p_sous_metier IN ('medecin','infirmier','kine','osteo','dentiste','veterinaire') THEN 'sante'
    WHEN p_metier = 'profession_liberale' AND p_sous_metier IN ('avocat','notaire','huissier') THEN 'juridique'
    WHEN p_metier = 'profession_liberale' AND p_sous_metier IN ('coiffeur','estheticienne','masseur') THEN 'esthetique'
    WHEN p_metier = 'profession_liberale' AND p_sous_metier IN ('restaurateur','traiteur') THEN 'restauration'
    WHEN p_metier = 'profession_liberale' AND p_sous_metier IN ('artisan_btp','entrepreneur_btp','plombier','electricien') THEN 'btp'
    WHEN p_metier IN ('dirigeant_entreprise','auto_entrepreneur','investisseur_immobilier','profession_liberale','autre') THEN 'autre'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.trg_set_secteur_metier()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.secteur_metier IS NULL AND NEW.metier IS NOT NULL THEN
    NEW.secteur_metier := public.infer_secteur_metier(NEW.metier, NEW.sous_metier);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_profils_secteur ON public.user_profils;
CREATE TRIGGER trg_user_profils_secteur
  BEFORE INSERT OR UPDATE OF metier, sous_metier, secteur_metier
  ON public.user_profils
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_secteur_metier();

-- Backfill au cas où
UPDATE public.user_profils
SET secteur_metier = public.infer_secteur_metier(metier, sous_metier)
WHERE secteur_metier IS NULL AND metier IS NOT NULL;

-- =====================================================================
-- FIN 10_inference_secteur_auto
-- =====================================================================
