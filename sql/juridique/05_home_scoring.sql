-- =============================================
-- Migration 05 : Home Page Intelligente + Scoring Dossier + Documents générés
-- Passe 94 — 23 mai 2026
-- =============================================
-- Dépend de : avocat_dossiers(id), societes(id), is_member_of_societe()
-- Pattern RLS : is_member_of_societe(societe_id) via DO $$ ... EXCEPTION
-- GRANT obligatoire : anon (SELECT), authenticated (CRUD), service_role (CRUD)
-- =============================================


-- ===========================================
-- 1. avocat_dossier_scores — Scores de solidité calculés par dossier
-- ===========================================
CREATE TABLE IF NOT EXISTS avocat_dossier_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES avocat_dossiers(id) ON DELETE CASCADE,
  societe_id uuid NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  score_preuves integer DEFAULT 0
    CHECK (score_preuves >= 0 AND score_preuves <= 100),
  score_coherence integer DEFAULT 0
    CHECK (score_coherence >= 0 AND score_coherence <= 100),
  score_risques integer DEFAULT 0
    CHECK (score_risques >= 0 AND score_risques <= 100),
  score_strategie integer DEFAULT 0
    CHECK (score_strategie >= 0 AND score_strategie <= 100),
  score_global integer DEFAULT 0
    CHECK (score_global >= 0 AND score_global <= 100),
  details jsonb DEFAULT '{}',
  recommandations text[],
  calculated_at timestamptz DEFAULT now(),
  calculated_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(dossier_id)
);

ALTER TABLE avocat_dossier_scores ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.avocat_dossier_scores TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_dossier_scores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_dossier_scores TO service_role;

DO $$ BEGIN
  CREATE POLICY avocat_dossier_scores_policy ON avocat_dossier_scores
    FOR ALL USING (public.is_member_of_societe(societe_id))
    WITH CHECK (public.is_member_of_societe(societe_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_avocat_scores_dossier ON avocat_dossier_scores(dossier_id);
CREATE INDEX IF NOT EXISTS idx_avocat_scores_societe ON avocat_dossier_scores(societe_id);
CREATE INDEX IF NOT EXISTS idx_avocat_scores_global ON avocat_dossier_scores(score_global DESC);
CREATE INDEX IF NOT EXISTS idx_avocat_scores_calculated ON avocat_dossier_scores(calculated_at DESC);


-- ===========================================
-- 2. avocat_home_cache — Cache des blocs de la home page juridique
-- ===========================================
-- Note : societe_id peut être NULL pour les caches globaux
-- (ex. jurisprudence_semaine est identique pour tous les cabinets)
CREATE TABLE IF NOT EXISTS avocat_home_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid REFERENCES societes(id) ON DELETE CASCADE,
  bloc_type text NOT NULL
    CHECK (bloc_type IN ('jurisprudence_semaine', 'a_retenir', 'tendances', 'alertes_globales')),
  contenu jsonb NOT NULL DEFAULT '{}',
  generated_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(societe_id, bloc_type)
);

ALTER TABLE avocat_home_cache ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.avocat_home_cache TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_home_cache TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_home_cache TO service_role;

-- Policy pour les caches liés à une société
DO $$ BEGIN
  CREATE POLICY avocat_home_cache_societe_policy ON avocat_home_cache
    FOR ALL USING (
      societe_id IS NULL
      OR public.is_member_of_societe(societe_id)
    )
    WITH CHECK (
      societe_id IS NULL
      OR public.is_member_of_societe(societe_id)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Policy supplémentaire : lecture des caches globaux (societe_id IS NULL) par tous les authentifiés
DO $$ BEGIN
  CREATE POLICY avocat_home_cache_global_read_policy ON avocat_home_cache
    FOR SELECT USING (societe_id IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_avocat_cache_bloc ON avocat_home_cache(bloc_type);
CREATE INDEX IF NOT EXISTS idx_avocat_cache_societe ON avocat_home_cache(societe_id);
CREATE INDEX IF NOT EXISTS idx_avocat_cache_expires ON avocat_home_cache(expires_at);


-- ===========================================
-- 3. avocat_documents_generes — Documents générés par le moteur de templates
-- ===========================================
CREATE TABLE IF NOT EXISTS avocat_documents_generes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES avocat_dossiers(id) ON DELETE CASCADE,
  societe_id uuid NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  template_id text NOT NULL,
  titre text NOT NULL,
  contenu_html text NOT NULL,
  variables_utilisees jsonb DEFAULT '{}',
  score_confiance integer
    CHECK (score_confiance >= 0 AND score_confiance <= 100),
  sources_citees text[],
  genere_par text DEFAULT 'template'
    CHECK (genere_par IN ('template', 'ia', 'mixte')),
  version integer DEFAULT 1,
  statut text DEFAULT 'brouillon'
    CHECK (statut IN ('brouillon', 'valide', 'envoye', 'archive')),
  valide_par uuid,
  valide_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE avocat_documents_generes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.avocat_documents_generes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_documents_generes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_documents_generes TO service_role;

DO $$ BEGIN
  CREATE POLICY avocat_documents_generes_policy ON avocat_documents_generes
    FOR ALL USING (public.is_member_of_societe(societe_id))
    WITH CHECK (public.is_member_of_societe(societe_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_avocat_docs_dossier ON avocat_documents_generes(dossier_id);
CREATE INDEX IF NOT EXISTS idx_avocat_docs_societe ON avocat_documents_generes(societe_id);
CREATE INDEX IF NOT EXISTS idx_avocat_docs_template ON avocat_documents_generes(template_id);
CREATE INDEX IF NOT EXISTS idx_avocat_docs_statut ON avocat_documents_generes(statut);
CREATE INDEX IF NOT EXISTS idx_avocat_docs_created ON avocat_documents_generes(created_at DESC);
