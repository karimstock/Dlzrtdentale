-- =============================================
-- JADOMI — Agent Learnings (mémoire d'apprentissage)
-- Chaque agent de la fourmilière accumule ses apprentissages
-- Boucle : correction → stockage → réinjection → amélioration
-- =============================================

-- À exécuter dans Supabase Dashboard > SQL Editor
-- URL : https://supabase.com/dashboard/project/vsbomwjzehnfinfjvhqp/sql/new

-- Apprentissages par agent
CREATE TABLE IF NOT EXISTS public.agent_learnings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL,
  agent_type TEXT NOT NULL,
  learning_type TEXT NOT NULL CHECK (learning_type IN ('preference', 'correction', 'pattern', 'rule', 'shortcut', 'error_to_avoid')),
  context TEXT,
  learning TEXT NOT NULL,
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  times_applied INTEGER DEFAULT 0,
  times_validated INTEGER DEFAULT 0,
  times_rejected INTEGER DEFAULT 0,
  source TEXT CHECK (source IN ('user_correction', 'implicit_validation', 'auto_detected', 'manual')),
  promoted_to_rule BOOLEAN DEFAULT false,
  promoted_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_learnings_societe ON public.agent_learnings(societe_id);
CREATE INDEX IF NOT EXISTS idx_agent_learnings_agent ON public.agent_learnings(societe_id, agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_learnings_confidence ON public.agent_learnings(societe_id, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_agent_learnings_active ON public.agent_learnings(societe_id, agent_type) WHERE disabled_at IS NULL AND confidence > 0.3;

-- Sessions agent (mémoire moyen terme)
CREATE TABLE IF NOT EXISTS public.agent_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL,
  agent_type TEXT NOT NULL,
  user_id UUID,
  summary TEXT,
  decisions_made JSONB DEFAULT '[]',
  tools_used TEXT[] DEFAULT '{}',
  tokens_used INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  success BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_societe ON public.agent_sessions(societe_id, agent_type, created_at DESC);

-- GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_learnings TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_sessions TO anon, authenticated, service_role;

-- RLS
ALTER TABLE public.agent_learnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_learnings_by_societe" ON public.agent_learnings FOR ALL
  USING (true);
CREATE POLICY "agent_sessions_by_societe" ON public.agent_sessions FOR ALL
  USING (true);
