-- =============================================
-- JADOMI Studio — Table site_hebergements
-- Hébergements OVH (domaines + plans)
-- Passe : module OVH Hosting
-- =============================================

CREATE TABLE IF NOT EXISTS public.site_hebergements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       UUID NOT NULL,
  societe_id    UUID NOT NULL,
  domain        TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'pro')),
  statut        TEXT NOT NULL DEFAULT 'provisioning'
                  CHECK (statut IN ('provisioning', 'configuring', 'deploying', 'active', 'cancelled')),
  provider      TEXT NOT NULL DEFAULT 'ovh',
  mode          TEXT NOT NULL DEFAULT 'simulation' CHECK (mode IN ('simulation', 'production')),
  url           TEXT,
  deployed_at   TIMESTAMPTZ,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour accélerer les recherches
CREATE INDEX IF NOT EXISTS idx_site_hebergements_site_id     ON public.site_hebergements (site_id);
CREATE INDEX IF NOT EXISTS idx_site_hebergements_societe_id  ON public.site_hebergements (societe_id);
CREATE INDEX IF NOT EXISTS idx_site_hebergements_domain      ON public.site_hebergements (domain);
CREATE INDEX IF NOT EXISTS idx_site_hebergements_statut      ON public.site_hebergements (statut);

-- Trigger updated_at automatique
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_site_hebergements_updated_at ON public.site_hebergements;
CREATE TRIGGER trg_site_hebergements_updated_at
  BEFORE UPDATE ON public.site_hebergements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================
-- GRANTS Supabase obligatoires (règle mai 2026)
-- =============================================
GRANT SELECT ON public.site_hebergements TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_hebergements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_hebergements TO service_role;

-- =============================================
-- RLS — Row Level Security
-- =============================================
ALTER TABLE public.site_hebergements ENABLE ROW LEVEL SECURITY;

-- Un utilisateur ne voit que les hébergements de sa société
CREATE POLICY "site_hebergements_select_own" ON public.site_hebergements
  FOR SELECT
  USING (
    societe_id IN (
      SELECT societe_id FROM public.user_societe_roles
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "site_hebergements_insert_own" ON public.site_hebergements
  FOR INSERT
  WITH CHECK (
    societe_id IN (
      SELECT societe_id FROM public.user_societe_roles
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "site_hebergements_update_own" ON public.site_hebergements
  FOR UPDATE
  USING (
    societe_id IN (
      SELECT societe_id FROM public.user_societe_roles
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "site_hebergements_delete_own" ON public.site_hebergements
  FOR DELETE
  USING (
    societe_id IN (
      SELECT societe_id FROM public.user_societe_roles
      WHERE user_id = auth.uid()
    )
  );

-- Service role bypass (pour les opérations internes JADOMI)
CREATE POLICY "site_hebergements_service_role" ON public.site_hebergements
  FOR ALL
  USING (auth.role() = 'service_role');
