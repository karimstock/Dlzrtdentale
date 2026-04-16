-- =====================================================================
-- JADOMI — Jobs d'import persistants (Phase 17)
-- Remplace la Map() en mémoire qui perdait les jobs au reload PM2.
-- Idempotent.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Source de l'import
  source text NOT NULL CHECK (source IN ('csv','wp-rest','wp-woo','api','manuel')),
  cible text NOT NULL DEFAULT 'produits' CHECK (cible IN ('produits','clients','fournisseurs','factures_fournisseurs')),

  -- Progression
  statut text NOT NULL DEFAULT 'running' CHECK (statut IN ('running','done','error','cancelled')),
  total integer NOT NULL DEFAULT 0,
  done integer NOT NULL DEFAULT 0,
  inserted integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,

  -- Détails
  erreurs jsonb DEFAULT '[]'::jsonb,
  meta jsonb DEFAULT '{}'::jsonb,
  message text,
  error text,

  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_import_jobs_societe ON public.import_jobs(societe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_jobs_statut ON public.import_jobs(societe_id, statut);

DROP TRIGGER IF EXISTS trg_import_jobs_updated ON public.import_jobs;
CREATE TRIGGER trg_import_jobs_updated
  BEFORE UPDATE ON public.import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS import_jobs_all ON public.import_jobs;
CREATE POLICY import_jobs_all ON public.import_jobs
  FOR ALL
  USING (public.is_member_of_societe(societe_id))
  WITH CHECK (public.is_member_of_societe(societe_id));

-- Cleanup automatique : supprimer les jobs terminés > 30 jours
-- (à planifier via cron Supabase ou côté serveur)
-- DELETE FROM import_jobs WHERE statut IN ('done','error','cancelled') AND finished_at < now() - interval '30 days';

-- =====================================================================
-- FIN Phase 17
-- =====================================================================
