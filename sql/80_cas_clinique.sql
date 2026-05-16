-- =============================================
-- JADOMI — Cas Clinique : dossier visuel par patient
-- Idempotent (IF NOT EXISTS / DO $$ ... $$)
-- =============================================

-- ===== Table cas_cliniques =====
CREATE TABLE IF NOT EXISTS cas_cliniques (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES societes(id),
  patient_id UUID NOT NULL REFERENCES patients_jadomi(id),
  created_by UUID NOT NULL,
  titre TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('couronne','bridge','implant','facettes','blanchiment','orthodontie','extraction','endodontie','parodontie','autre')),
  dents INTEGER[] DEFAULT '{}',
  statut TEXT DEFAULT 'en_cours' CHECK (statut IN ('en_cours','en_attente_labo','essayage','termine','annule')),
  notes TEXT,
  labo_id UUID,
  share_token_prothesiste TEXT UNIQUE,
  share_token_patient TEXT UNIQUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ===== Table cas_clinique_medias =====
CREATE TABLE IF NOT EXISTS cas_clinique_medias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cas_id UUID NOT NULL REFERENCES cas_cliniques(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('photo_initiale','photo_preparation','photo_essayage','photo_finale','radio_avant','radio_apres','video','shade','empreinte','produit_fini','autre')),
  file_path TEXT NOT NULL,
  file_url TEXT,
  mimetype TEXT,
  file_size INTEGER,
  note TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===== Table cas_clinique_notes =====
CREATE TABLE IF NOT EXISTS cas_clinique_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cas_id UUID NOT NULL REFERENCES cas_cliniques(id) ON DELETE CASCADE,
  auteur UUID NOT NULL,
  auteur_role TEXT DEFAULT 'dentiste' CHECK (auteur_role IN ('dentiste','prothesiste','assistant')),
  texte TEXT NOT NULL,
  etape TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===== Indexes =====
CREATE INDEX IF NOT EXISTS idx_cas_cliniques_societe ON cas_cliniques(societe_id);
CREATE INDEX IF NOT EXISTS idx_cas_cliniques_patient ON cas_cliniques(patient_id);
CREATE INDEX IF NOT EXISTS idx_cas_cliniques_statut ON cas_cliniques(statut);
CREATE INDEX IF NOT EXISTS idx_cas_cliniques_type ON cas_cliniques(type);
CREATE INDEX IF NOT EXISTS idx_cas_cliniques_created_by ON cas_cliniques(created_by);
CREATE INDEX IF NOT EXISTS idx_cas_cliniques_share_prothesiste ON cas_cliniques(share_token_prothesiste);
CREATE INDEX IF NOT EXISTS idx_cas_cliniques_share_patient ON cas_cliniques(share_token_patient);
CREATE INDEX IF NOT EXISTS idx_cas_clinique_medias_cas ON cas_clinique_medias(cas_id);
CREATE INDEX IF NOT EXISTS idx_cas_clinique_medias_type ON cas_clinique_medias(type);
CREATE INDEX IF NOT EXISTS idx_cas_clinique_notes_cas ON cas_clinique_notes(cas_id);

-- ===== Trigger updated_at =====
DO $$ BEGIN
  CREATE OR REPLACE FUNCTION update_cas_cliniques_updated_at()
  RETURNS TRIGGER AS $fn$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $fn$ LANGUAGE plpgsql;
EXCEPTION WHEN duplicate_function THEN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_cas_cliniques_updated_at ON cas_cliniques;
CREATE TRIGGER trg_cas_cliniques_updated_at
  BEFORE UPDATE ON cas_cliniques
  FOR EACH ROW
  EXECUTE FUNCTION update_cas_cliniques_updated_at();

-- ===== RLS =====
ALTER TABLE cas_cliniques ENABLE ROW LEVEL SECURITY;
ALTER TABLE cas_clinique_medias ENABLE ROW LEVEL SECURITY;
ALTER TABLE cas_clinique_notes ENABLE ROW LEVEL SECURITY;

-- Policy cas_cliniques : acces filtre par societe_id via societes.owner_id
DO $$ BEGIN
  DROP POLICY IF EXISTS cas_cliniques_societe_policy ON cas_cliniques;
  CREATE POLICY cas_cliniques_societe_policy ON cas_cliniques
    FOR ALL
    USING (
      societe_id IN (
        SELECT id FROM societes WHERE owner_id = auth.uid()
      )
    )
    WITH CHECK (
      societe_id IN (
        SELECT id FROM societes WHERE owner_id = auth.uid()
      )
    );
EXCEPTION WHEN undefined_function THEN
  -- auth.uid() non disponible hors Supabase
  NULL;
END $$;

-- Policy cas_clinique_medias : acces via cas_cliniques
DO $$ BEGIN
  DROP POLICY IF EXISTS cas_clinique_medias_policy ON cas_clinique_medias;
  CREATE POLICY cas_clinique_medias_policy ON cas_clinique_medias
    FOR ALL
    USING (
      cas_id IN (
        SELECT id FROM cas_cliniques WHERE societe_id IN (
          SELECT id FROM societes WHERE owner_id = auth.uid()
        )
      )
    )
    WITH CHECK (
      cas_id IN (
        SELECT id FROM cas_cliniques WHERE societe_id IN (
          SELECT id FROM societes WHERE owner_id = auth.uid()
        )
      )
    );
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- Policy cas_clinique_notes : acces via cas_cliniques
DO $$ BEGIN
  DROP POLICY IF EXISTS cas_clinique_notes_policy ON cas_clinique_notes;
  CREATE POLICY cas_clinique_notes_policy ON cas_clinique_notes
    FOR ALL
    USING (
      cas_id IN (
        SELECT id FROM cas_cliniques WHERE societe_id IN (
          SELECT id FROM societes WHERE owner_id = auth.uid()
        )
      )
    )
    WITH CHECK (
      cas_id IN (
        SELECT id FROM cas_cliniques WHERE societe_id IN (
          SELECT id FROM societes WHERE owner_id = auth.uid()
        )
      )
    );
EXCEPTION WHEN undefined_function THEN NULL;
END $$;
