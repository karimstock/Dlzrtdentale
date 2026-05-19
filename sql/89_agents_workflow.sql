-- =============================================
-- JADOMI — Migration 89 : Agents Workflow
-- Mémoire de travail partagée entre agents
-- + colonnes apprentissage sur cabinet_brain_rules
-- =============================================

-- =============================================
-- TABLE 1 : agents_workflow — chaîne d'exécution agents
-- Chaque step d'un workflow multi-agents est tracé ici
-- =============================================
CREATE TABLE IF NOT EXISTS public.agents_workflow (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL,          -- regroupe tous les steps d'une même chaîne
  agent_name TEXT NOT NULL,           -- 'classifieur', 'agenda', 'stock', 'patient', 'redacteur'
  step_order INT NOT NULL DEFAULT 0,  -- ordre d'exécution dans le workflow
  input JSONB DEFAULT '{}'::jsonb,
  output JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'pending',      -- pending, running, completed, failed, skipped
  error TEXT,
  duration_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Index
CREATE INDEX IF NOT EXISTS idx_agents_workflow_societe ON public.agents_workflow(societe_id);
CREATE INDEX IF NOT EXISTS idx_agents_workflow_wfid ON public.agents_workflow(workflow_id);
CREATE INDEX IF NOT EXISTS idx_agents_workflow_status ON public.agents_workflow(status);
CREATE INDEX IF NOT EXISTS idx_agents_workflow_created ON public.agents_workflow(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agents_workflow_agent ON public.agents_workflow(agent_name);

-- =============================================
-- GRANTS (OBLIGATOIRE — Supabase API access)
-- =============================================
GRANT SELECT ON public.agents_workflow TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agents_workflow TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agents_workflow TO service_role;

-- =============================================
-- RLS (Row Level Security)
-- =============================================
ALTER TABLE public.agents_workflow ENABLE ROW LEVEL SECURITY;

-- Policy : chaque cabinet ne voit que ses workflows
CREATE POLICY "agents_workflow_own_societe" ON public.agents_workflow
  FOR ALL USING (societe_id IN (
    SELECT societe_id FROM public.user_societe_roles WHERE user_id = auth.uid()
  ));

-- Service role bypass (opérations serveur)
CREATE POLICY "agents_workflow_service_role" ON public.agents_workflow
  FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- TABLE 2 : Colonnes supplémentaires sur cabinet_brain_rules
-- Pour le moteur d'apprentissage multi-agents
-- =============================================
ALTER TABLE public.cabinet_brain_rules ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'local';
-- 'local' = règle spécifique au cabinet, 'global' = règle universelle validée

ALTER TABLE public.cabinet_brain_rules ADD COLUMN IF NOT EXISTS agent_source TEXT;
-- Quel agent a créé/proposé la règle ('classifieur', 'redacteur', 'extracteur', etc.)

ALTER TABLE public.cabinet_brain_rules ADD COLUMN IF NOT EXISTS times_applied INT DEFAULT 0;
-- Nombre de fois que la règle a été appliquée avec succès

ALTER TABLE public.cabinet_brain_rules ADD COLUMN IF NOT EXISTS times_corrected_learning INT DEFAULT 0;
-- Nombre de fois que la règle a été corrigée par un utilisateur (distinct de times_corrected existant)

ALTER TABLE public.cabinet_brain_rules ADD COLUMN IF NOT EXISTS last_applied_at TIMESTAMPTZ;
-- Dernière application réussie

ALTER TABLE public.cabinet_brain_rules ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;
-- Si non null, la règle est désactivée (confidence tombée à 0 ou pruning)

-- Index supplémentaires pour les requêtes du moteur d'apprentissage
CREATE INDEX IF NOT EXISTS idx_brain_rules_scope ON public.cabinet_brain_rules(scope);
CREATE INDEX IF NOT EXISTS idx_brain_rules_agent_source ON public.cabinet_brain_rules(agent_source);
CREATE INDEX IF NOT EXISTS idx_brain_rules_disabled ON public.cabinet_brain_rules(disabled_at) WHERE disabled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_brain_rules_confidence ON public.cabinet_brain_rules(confidence DESC);
