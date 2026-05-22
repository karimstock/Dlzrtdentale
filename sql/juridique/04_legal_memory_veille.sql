-- =============================================
-- JADOMI — Mémoire juridique par dossier + Veille automatique
-- Stocke les sources pertinentes trouvées par l'IA et la veille
-- =============================================

-- Mémoire juridique par dossier
CREATE TABLE IF NOT EXISTS public.legal_dossier_memory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dossier_id UUID NOT NULL,
  societe_id UUID,
  type TEXT NOT NULL CHECK (type IN ('code', 'judilibre', 'jurisprudence', 'doctrine', 'loda', 'note_avocat')),
  titre TEXT NOT NULL,
  contenu TEXT,
  source_ref TEXT,
  source_provider TEXT CHECK (source_provider IN ('legifrance', 'judilibre', 'manuel', 'veille')),
  score_pertinence INTEGER DEFAULT 50 CHECK (score_pertinence >= 0 AND score_pertinence <= 100),
  metadata JSONB DEFAULT '{}',
  validated_by UUID,
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(dossier_id, source_ref)
);

CREATE INDEX IF NOT EXISTS idx_legal_memory_dossier ON public.legal_dossier_memory(dossier_id);
CREATE INDEX IF NOT EXISTS idx_legal_memory_type ON public.legal_dossier_memory(type);
CREATE INDEX IF NOT EXISTS idx_legal_memory_pertinence ON public.legal_dossier_memory(dossier_id, score_pertinence DESC);
CREATE INDEX IF NOT EXISTS idx_legal_memory_search ON public.legal_dossier_memory USING gin(to_tsvector('french', coalesce(titre, '') || ' ' || coalesce(contenu, '')));

-- Log de veille juridique
CREATE TABLE IF NOT EXISTS public.legal_veille_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dossier_id UUID NOT NULL,
  societe_id UUID,
  keywords_used TEXT[] DEFAULT '{}',
  results_count INTEGER DEFAULT 0,
  checked_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_veille_dossier ON public.legal_veille_log(dossier_id, checked_at DESC);

-- Colonne veille_keywords sur avocat_dossiers (si pas déjà existante)
DO $$ BEGIN
  ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS veille_keywords TEXT[] DEFAULT '{}';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- GRANT obligatoires
GRANT SELECT ON public.legal_dossier_memory TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_dossier_memory TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_dossier_memory TO service_role;

GRANT SELECT ON public.legal_veille_log TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_veille_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_veille_log TO service_role;

-- RLS
ALTER TABLE public.legal_dossier_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_veille_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_memory_all" ON public.legal_dossier_memory FOR ALL USING (true);
CREATE POLICY "legal_veille_all" ON public.legal_veille_log FOR ALL USING (true);
