-- =============================================
-- Passe 43A - Staging sites + scanner enrichi
-- Date : 24 avril 2026
-- =============================================

-- Table staging (copies de sites pour modification sans risque)
CREATE TABLE IF NOT EXISTS public.staging_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL,
  analysis_id UUID,
  slug VARCHAR(150) UNIQUE NOT NULL,
  url_originale TEXT NOT NULL,
  url_staging TEXT,
  statut VARCHAR(30) DEFAULT 'en_creation'
    CHECK (statut IN ('en_creation', 'pret', 'en_modification', 'valide', 'deploye', 'archive')),
  nombre_pages INT DEFAULT 0,
  nombre_medias INT DEFAULT 0,
  taille_totale_mb NUMERIC(10,2),
  modifications_ia JSONB DEFAULT '[]',
  exports_client JSONB DEFAULT '{}',
  historique_changements JSONB DEFAULT '[]',
  valide_par_client BOOLEAN DEFAULT false,
  valide_le TIMESTAMP,
  deploye_le TIMESTAMP,
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days'),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_staging_societe ON public.staging_sites(societe_id);
CREATE INDEX IF NOT EXISTS idx_staging_statut ON public.staging_sites(statut);

-- Colonnes scanner enrichi
ALTER TABLE public.site_analyses
  ADD COLUMN IF NOT EXISTS hebergeur VARCHAR(50),
  ADD COLUMN IF NOT EXISTS hebergeur_confiance INT;

-- RLS
ALTER TABLE public.staging_sites ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
CREATE POLICY staging_all ON public.staging_sites FOR ALL USING (
  societe_id IN (SELECT societe_id FROM public.user_societe_roles WHERE user_id = auth.uid())
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Verification
SELECT 'staging_sites' as tbl;
