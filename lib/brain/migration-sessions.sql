-- =============================================
-- JADOMI Session Memory — Migration SQL
-- Table jadomi_sessions : mémoire persistante entre sessions IA
-- =============================================

CREATE TABLE IF NOT EXISTS public.jadomi_sessions (
  id              uuid            DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         text            NOT NULL DEFAULT 'karim_bahmed@yahoo.fr',
  session_name    text,
  summary         text,
  tasks_completed jsonb           DEFAULT '[]'::jsonb,
  files_modified  text[]          DEFAULT '{}',
  context_snapshot text,
  tokens_used     integer         DEFAULT 0,
  created_at      timestamptz     DEFAULT now(),
  updated_at      timestamptz     DEFAULT now()
);

-- Index pour requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_jadomi_sessions_user_id ON public.jadomi_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_jadomi_sessions_created_at ON public.jadomi_sessions(created_at DESC);

-- GRANT obligatoires (CLAUDE.md Supabase GRANT rules)
GRANT SELECT ON public.jadomi_sessions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jadomi_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jadomi_sessions TO service_role;

-- RLS obligatoire
ALTER TABLE public.jadomi_sessions ENABLE ROW LEVEL SECURITY;

-- Policy permissive pour service_role (accès complet)
CREATE POLICY "service_role_full_access" ON public.jadomi_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy pour authenticated : accès limité à son propre user_id
CREATE POLICY "authenticated_own_sessions" ON public.jadomi_sessions
  FOR ALL
  TO authenticated
  USING (user_id = current_setting('request.jwt.claims', true)::json->>'email')
  WITH CHECK (user_id = current_setting('request.jwt.claims', true)::json->>'email');
