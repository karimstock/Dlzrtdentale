-- =====================================================================
-- JADOMI — Multi-sociétés : extension types + profil utilisateur
-- À exécuter après 01_foundations / 02_sci / 03_commerce / 04_mailing
-- Idempotent.
-- =====================================================================
-- Objectif :
--  · Élargir les types de société (SAS, SARL, EURL, EI, auto-E, libéral…)
--  · Ajouter colonnes : sous_type, regime_tva, capital_social, rcs_ville,
--    stripe_subscription_id, logo (placeholder), couleur_accent
--  · Ajouter rôle 'employe'
--  · Ajouter table user_profils (profil métier unique par user)
-- =====================================================================

-- ---------- Étendre CHECK type société ----------
ALTER TABLE public.societes DROP CONSTRAINT IF EXISTS societes_type_check;
ALTER TABLE public.societes
  ADD CONSTRAINT societes_type_check CHECK (type IN (
    'cabinet_dentaire',
    'sci',
    'societe_commerciale',
    'sas',
    'sarl',
    'eurl',
    'sa',
    'snc',
    'ei',
    'auto_entrepreneur',
    'profession_liberale',
    'association',
    'autre'
  ));

-- ---------- Ajouter colonnes manquantes ----------
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS sous_type text;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS regime_tva text;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS capital_social numeric;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS rcs_ville text;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS siret text;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS modules jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS couleur_accent text;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS icone text;

-- Étendre CHECK plan
ALTER TABLE public.societes DROP CONSTRAINT IF EXISTS societes_plan_check;
ALTER TABLE public.societes
  ADD CONSTRAINT societes_plan_check CHECK (plan IN ('solo','illimite','standard','premium_dentaire','essai'));

-- ---------- Étendre rôles (ajout 'employe') ----------
ALTER TABLE public.user_societe_roles DROP CONSTRAINT IF EXISTS user_societe_roles_role_check;
ALTER TABLE public.user_societe_roles
  ADD CONSTRAINT user_societe_roles_role_check CHECK (role IN (
    'proprietaire','associe','lecteur','comptable','employe'
  ));

-- ---------- Statut invitation ----------
ALTER TABLE public.user_societe_roles ADD COLUMN IF NOT EXISTS invite_email text;
ALTER TABLE public.user_societe_roles ADD COLUMN IF NOT EXISTS statut_invitation text DEFAULT 'acceptee';
ALTER TABLE public.user_societe_roles DROP CONSTRAINT IF EXISTS user_societe_roles_statut_check;
ALTER TABLE public.user_societe_roles
  ADD CONSTRAINT user_societe_roles_statut_check CHECK (statut_invitation IN (
    'en_attente','acceptee','refusee'
  ));

-- ---------- Profil métier user (1-to-1) ----------
CREATE TABLE IF NOT EXISTS public.user_profils (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  prenom text,
  nom text,
  metier text,
  -- 'chirurgien_dentiste'|'orthodontiste'|'veterinaire'|'prothesiste'|
  -- 'profession_liberale'|'dirigeant_entreprise'|'auto_entrepreneur'|
  -- 'investisseur_immobilier'|'autre'
  sous_metier text,
  -- ex: profession_liberale → 'avocat'|'medecin'|'architecte'|...
  telephone text,
  avatar_url text,
  onboarding_termine boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_user_profils_updated ON public.user_profils;
CREATE TRIGGER trg_user_profils_updated
  BEFORE UPDATE ON public.user_profils
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_profils ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_profils_select ON public.user_profils;
CREATE POLICY user_profils_select ON public.user_profils
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_profils_insert ON public.user_profils;
CREATE POLICY user_profils_insert ON public.user_profils
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_profils_update ON public.user_profils;
CREATE POLICY user_profils_update ON public.user_profils
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ---------- Index utiles ----------
CREATE INDEX IF NOT EXISTS idx_societes_sous_type ON public.societes(sous_type);
CREATE INDEX IF NOT EXISTS idx_profils_metier ON public.user_profils(metier);

-- =====================================================================
-- FIN 05_extend_types
-- =====================================================================
