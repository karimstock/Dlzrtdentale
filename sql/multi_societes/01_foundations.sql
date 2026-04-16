-- =====================================================================
-- JADOMI — Multi-sociétés : fondations (Phase 1)
-- À exécuter dans Supabase SQL Editor
-- Idempotent : safe à réexécuter.
-- =====================================================================
-- Tables : societes, user_societe_roles, audit_log
-- Helpers : is_member_of_societe(uuid), set_updated_at()
-- RLS : strict, un user ne voit que les sociétés où il a un rôle
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------- Table societes ----------
CREATE TABLE IF NOT EXISTS public.societes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('cabinet_dentaire','sci','societe_commerciale')),
  nom text NOT NULL,
  siren text,
  tva_intracom text,
  adresse text,
  code_postal text,
  ville text,
  pays text DEFAULT 'France',
  email text,
  telephone text,
  site_web text,
  logo_url text,
  cgv text,
  iban text,
  bic text,
  regime_fiscal text,
  conditions_paiement text DEFAULT '30j',
  penalites_retard text DEFAULT '3x taux BCE en vigueur',
  indemnite_recouvrement integer DEFAULT 40,
  stripe_customer_id text,
  plan text DEFAULT 'solo' CHECK (plan IN ('solo','illimite')),
  actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_societes_owner ON public.societes(owner_id);
CREATE INDEX IF NOT EXISTS idx_societes_type ON public.societes(type);

-- ---------- Table user_societe_roles ----------
CREATE TABLE IF NOT EXISTS public.user_societe_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('proprietaire','associe','lecteur','comptable')),
  invite_par uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, societe_id)
);
CREATE INDEX IF NOT EXISTS idx_roles_user ON public.user_societe_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_roles_societe ON public.user_societe_roles(societe_id);

-- ---------- Table audit_log ----------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  societe_id uuid REFERENCES public.societes(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text,
  entity_id text,
  meta jsonb,
  ip text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_societe ON public.audit_log(societe_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_log(created_at DESC);

-- ---------- Helper : is_member_of_societe ----------
CREATE OR REPLACE FUNCTION public.is_member_of_societe(p_societe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_societe_roles
    WHERE societe_id = p_societe_id
      AND user_id = auth.uid()
  );
$$;

-- ---------- Trigger updated_at ----------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_societes_updated ON public.societes;
CREATE TRIGGER trg_societes_updated
  BEFORE UPDATE ON public.societes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Trigger auto-propriétaire ----------
CREATE OR REPLACE FUNCTION public.societe_create_owner_role()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.user_societe_roles (user_id, societe_id, role)
  VALUES (NEW.owner_id, NEW.id, 'proprietaire')
  ON CONFLICT (user_id, societe_id) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_societes_owner_role ON public.societes;
CREATE TRIGGER trg_societes_owner_role
  AFTER INSERT ON public.societes
  FOR EACH ROW EXECUTE FUNCTION public.societe_create_owner_role();

-- =====================================================================
-- RLS : strict silo par société
-- =====================================================================
ALTER TABLE public.societes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_societe_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- societes
DROP POLICY IF EXISTS societes_select ON public.societes;
CREATE POLICY societes_select ON public.societes
  FOR SELECT USING (public.is_member_of_societe(id));

DROP POLICY IF EXISTS societes_insert ON public.societes;
CREATE POLICY societes_insert ON public.societes
  FOR INSERT WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS societes_update ON public.societes;
CREATE POLICY societes_update ON public.societes
  FOR UPDATE
  USING (public.is_member_of_societe(id))
  WITH CHECK (public.is_member_of_societe(id));

DROP POLICY IF EXISTS societes_delete ON public.societes;
CREATE POLICY societes_delete ON public.societes
  FOR DELETE USING (owner_id = auth.uid());

-- user_societe_roles
DROP POLICY IF EXISTS roles_select ON public.user_societe_roles;
CREATE POLICY roles_select ON public.user_societe_roles
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.societes s
               WHERE s.id = societe_id AND s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS roles_insert ON public.user_societe_roles;
CREATE POLICY roles_insert ON public.user_societe_roles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.societes s
            WHERE s.id = societe_id AND s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS roles_delete ON public.user_societe_roles;
CREATE POLICY roles_delete ON public.user_societe_roles
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.societes s
            WHERE s.id = societe_id AND s.owner_id = auth.uid())
  );

-- audit_log : read-only pour l'user, écriture réservée au service_role
DROP POLICY IF EXISTS audit_select ON public.audit_log;
CREATE POLICY audit_select ON public.audit_log
  FOR SELECT USING (
    (societe_id IS NULL AND user_id = auth.uid())
    OR public.is_member_of_societe(societe_id)
  );

-- =====================================================================
-- FIN Phase 1 — fondations
-- =====================================================================
