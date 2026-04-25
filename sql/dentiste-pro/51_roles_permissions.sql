-- =============================================
-- Passe 51 - JADOMI DENTISTE PRO - Roles & Permissions
-- Date : 25 avril 2026
-- Systeme d'equipe : praticien invite secretaire,
-- assistante, associe, comptable, stagiaire avec
-- permissions granulaires par module.
-- =============================================

-- =============================================
-- 1. dentiste_pro_team
-- Membres d'equipe d'un cabinet avec permissions
-- granulaires par module. Invitation par email
-- avec token et expiration.
-- =============================================
CREATE TABLE IF NOT EXISTS public.dentiste_pro_team (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.dentiste_pro_cabinets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  email VARCHAR(200) NOT NULL,
  nom VARCHAR(100),
  prenom VARCHAR(100),
  role VARCHAR(30) NOT NULL DEFAULT 'assistante'
    CHECK (role IN ('praticien','associe','secretaire','assistante','comptable','stagiaire')),
  permissions JSONB NOT NULL DEFAULT '{
    "agenda": true,
    "patients": true,
    "chat": true,
    "stock": false,
    "comptabilite": false,
    "facturation": false,
    "statistiques": false,
    "configuration": false,
    "waitlist": true,
    "rappels": true,
    "chat_ia_config": false,
    "series": true,
    "documents": true,
    "timeline": false
  }'::jsonb,
  invitation_token VARCHAR(100),
  invitation_expires_at TIMESTAMP,
  invitation_accepted BOOLEAN DEFAULT false,
  actif BOOLEAN DEFAULT true,
  derniere_connexion TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index : recherche par cabinet
CREATE INDEX IF NOT EXISTS idx_dp_team_cabinet
  ON public.dentiste_pro_team(cabinet_id);

-- Index : recherche par user_id (login rapide)
CREATE INDEX IF NOT EXISTS idx_dp_team_user
  ON public.dentiste_pro_team(user_id) WHERE user_id IS NOT NULL;

-- Index : recherche par email (invitation)
CREATE INDEX IF NOT EXISTS idx_dp_team_email
  ON public.dentiste_pro_team(cabinet_id, email);

-- Index : recherche par token d'invitation
CREATE UNIQUE INDEX IF NOT EXISTS idx_dp_team_invitation_token
  ON public.dentiste_pro_team(invitation_token) WHERE invitation_token IS NOT NULL;

-- Unicite : un seul membre par email par cabinet
CREATE UNIQUE INDEX IF NOT EXISTS idx_dp_team_cabinet_email_unique
  ON public.dentiste_pro_team(cabinet_id, email);

-- RLS
ALTER TABLE public.dentiste_pro_team ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.dentiste_pro_team IS 'Membres d equipe d un cabinet. Roles (praticien/associe/secretaire/assistante/comptable/stagiaire) avec permissions granulaires par module en JSONB. Invitation par token email.';

-- =============================================
-- Verification
-- =============================================
SELECT 'dentiste_pro_team' AS tbl;
