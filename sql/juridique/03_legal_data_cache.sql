-- =============================================
-- JADOMI — Cache données juridiques externes
-- Légifrance + Judilibre → stockage local
-- Pour enrichir le RAG de l'assistant IA avocat
-- =============================================

-- Table de cache des résultats de recherche
CREATE TABLE IF NOT EXISTS public.legal_data_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('code', 'jurisprudence_judiciaire', 'jurisprudence_admin', 'judilibre', 'loda', 'jorf')),
  query TEXT,
  external_id TEXT,
  titre TEXT,
  contenu_extrait TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source, external_id)
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_legal_cache_source ON public.legal_data_cache(source);
CREATE INDEX IF NOT EXISTS idx_legal_cache_query ON public.legal_data_cache USING gin(to_tsvector('french', coalesce(query, '') || ' ' || coalesce(titre, '')));
CREATE INDEX IF NOT EXISTS idx_legal_cache_external_id ON public.legal_data_cache(external_id);
CREATE INDEX IF NOT EXISTS idx_legal_cache_created ON public.legal_data_cache(created_at DESC);

-- Table de log des appels API PISTE (monitoring quotas)
CREATE TABLE IF NOT EXISTS public.legal_api_calls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('legifrance', 'judilibre')),
  endpoint TEXT NOT NULL,
  user_id UUID,
  societe_id UUID,
  status_code INTEGER,
  response_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_api_calls_date ON public.legal_api_calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_api_calls_provider ON public.legal_api_calls(provider, created_at DESC);

-- GRANT obligatoires (règle Supabase JADOMI)
GRANT SELECT ON public.legal_data_cache TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_data_cache TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_data_cache TO service_role;

GRANT SELECT ON public.legal_api_calls TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_api_calls TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_api_calls TO service_role;

-- RLS
ALTER TABLE public.legal_data_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_api_calls ENABLE ROW LEVEL SECURITY;

-- Policies permissives (cache = données publiques, pas de données patients)
CREATE POLICY "legal_cache_read_all" ON public.legal_data_cache FOR SELECT USING (true);
CREATE POLICY "legal_cache_write_service" ON public.legal_data_cache FOR ALL USING (true);

CREATE POLICY "legal_api_calls_read_all" ON public.legal_api_calls FOR SELECT USING (true);
CREATE POLICY "legal_api_calls_write_service" ON public.legal_api_calls FOR ALL USING (true);
