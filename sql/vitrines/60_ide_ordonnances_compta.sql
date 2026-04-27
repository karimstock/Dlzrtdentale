-- =============================================
-- Passe 60 - JADOMI Ordonnances & Comptabilite IDE
-- Module ordonnances patients et factures /
-- comptabilite pour infirmieres liberales.
-- =============================================

-- =============================================
-- 1. ide_ordonnances
-- Ordonnances des patients
-- =============================================
CREATE TABLE IF NOT EXISTS public.ide_ordonnances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.ide_cabinets(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.ide_patients(id) ON DELETE CASCADE,
  medecin_nom TEXT NOT NULL,
  medecin_rpps TEXT,
  date_prescription DATE NOT NULL,
  date_expiration DATE,
  nb_seances_prescrites INTEGER,
  nb_seances_realisees INTEGER DEFAULT 0,
  soins_type TEXT,
  description TEXT,
  file_path TEXT,
  file_name TEXT,
  file_size_kb INTEGER,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'terminee', 'expiree', 'renouvelee')),
  mois TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.ide_ordonnances IS 'Ordonnances patients : prescriptions medicales suivies par le cabinet IDE.';
COMMENT ON COLUMN public.ide_ordonnances.medecin_rpps IS 'Numero RPPS du medecin prescripteur.';
COMMENT ON COLUMN public.ide_ordonnances.mois IS 'Format YYYY-MM pour classement mensuel.';
COMMENT ON COLUMN public.ide_ordonnances.file_path IS 'Chemin du scan de l''ordonnance uploade.';

-- =============================================
-- 2. ide_factures
-- Factures / comptabilite IDE
-- =============================================
CREATE TABLE IF NOT EXISTS public.ide_factures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.ide_cabinets(id) ON DELETE CASCADE,
  nurse_id UUID REFERENCES public.ide_nurses(id),
  type TEXT NOT NULL CHECK (type IN ('recette', 'depense', 'retrocession')),
  categorie TEXT,
  description TEXT NOT NULL,
  montant DECIMAL(10,2) NOT NULL,
  date_facture DATE NOT NULL,
  mois TEXT,
  patient_id UUID REFERENCES public.ide_patients(id),
  ordonnance_id UUID REFERENCES public.ide_ordonnances(id),
  file_path TEXT,
  file_name TEXT,
  file_size_kb INTEGER,
  status TEXT DEFAULT 'a_traiter' CHECK (status IN ('a_traiter', 'envoyee_cpam', 'payee', 'rejetee')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.ide_factures IS 'Factures et comptabilite IDE : recettes, depenses, retrocessions.';
COMMENT ON COLUMN public.ide_factures.categorie IS 'cotisation_ami, cotisation_ais, indemnite_deplacement, frais_vehicule, materiel, charges, retrocession_remplacement, autre.';
COMMENT ON COLUMN public.ide_factures.mois IS 'Format YYYY-MM pour classement mensuel.';
COMMENT ON COLUMN public.ide_factures.file_path IS 'Chemin du scan de facture uploade.';

-- =============================================
-- 3. INDEX
-- =============================================

-- ide_ordonnances
CREATE INDEX IF NOT EXISTS idx_ide_ordonnances_cabinet_id
  ON public.ide_ordonnances(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_ide_ordonnances_patient_id
  ON public.ide_ordonnances(patient_id);
CREATE INDEX IF NOT EXISTS idx_ide_ordonnances_mois
  ON public.ide_ordonnances(mois);
CREATE INDEX IF NOT EXISTS idx_ide_ordonnances_status
  ON public.ide_ordonnances(status);
CREATE INDEX IF NOT EXISTS idx_ide_ordonnances_date_prescription
  ON public.ide_ordonnances(date_prescription);
CREATE INDEX IF NOT EXISTS idx_ide_ordonnances_cabinet_patient_mois
  ON public.ide_ordonnances(cabinet_id, patient_id, mois);
CREATE INDEX IF NOT EXISTS idx_ide_ordonnances_active
  ON public.ide_ordonnances(cabinet_id, patient_id) WHERE status = 'active';

-- ide_factures
CREATE INDEX IF NOT EXISTS idx_ide_factures_cabinet_id
  ON public.ide_factures(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_ide_factures_patient_id
  ON public.ide_factures(patient_id);
CREATE INDEX IF NOT EXISTS idx_ide_factures_nurse_id
  ON public.ide_factures(nurse_id);
CREATE INDEX IF NOT EXISTS idx_ide_factures_mois
  ON public.ide_factures(mois);
CREATE INDEX IF NOT EXISTS idx_ide_factures_status
  ON public.ide_factures(status);
CREATE INDEX IF NOT EXISTS idx_ide_factures_date_facture
  ON public.ide_factures(date_facture);
CREATE INDEX IF NOT EXISTS idx_ide_factures_cabinet_patient_mois
  ON public.ide_factures(cabinet_id, patient_id, mois);

-- =============================================
-- 4. TRIGGER updated_at
-- =============================================

-- ide_ordonnances
CREATE OR REPLACE FUNCTION public.ide_ordonnances_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ide_ordonnances_updated_at ON public.ide_ordonnances;
CREATE TRIGGER trg_ide_ordonnances_updated_at
  BEFORE UPDATE ON public.ide_ordonnances
  FOR EACH ROW
  EXECUTE FUNCTION public.ide_ordonnances_updated_at();

-- ide_factures
CREATE OR REPLACE FUNCTION public.ide_factures_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ide_factures_updated_at ON public.ide_factures;
CREATE TRIGGER trg_ide_factures_updated_at
  BEFORE UPDATE ON public.ide_factures
  FOR EACH ROW
  EXECUTE FUNCTION public.ide_factures_updated_at();

-- =============================================
-- 5. RLS - Row Level Security
-- Filtrage par cabinet_id via ide_user_owns_cabinet()
-- =============================================

-- ---------- ide_ordonnances ----------
ALTER TABLE public.ide_ordonnances ENABLE ROW LEVEL SECURITY;

CREATE POLICY ide_ordonnances_select ON public.ide_ordonnances
  FOR SELECT TO authenticated
  USING (public.ide_user_owns_cabinet(cabinet_id));

CREATE POLICY ide_ordonnances_insert ON public.ide_ordonnances
  FOR INSERT TO authenticated
  WITH CHECK (public.ide_user_owns_cabinet(cabinet_id));

CREATE POLICY ide_ordonnances_update ON public.ide_ordonnances
  FOR UPDATE TO authenticated
  USING (public.ide_user_owns_cabinet(cabinet_id));

-- ---------- ide_factures ----------
ALTER TABLE public.ide_factures ENABLE ROW LEVEL SECURITY;

CREATE POLICY ide_factures_select ON public.ide_factures
  FOR SELECT TO authenticated
  USING (public.ide_user_owns_cabinet(cabinet_id));

CREATE POLICY ide_factures_insert ON public.ide_factures
  FOR INSERT TO authenticated
  WITH CHECK (public.ide_user_owns_cabinet(cabinet_id));

CREATE POLICY ide_factures_update ON public.ide_factures
  FOR UPDATE TO authenticated
  USING (public.ide_user_owns_cabinet(cabinet_id));

-- =============================================
-- FIN Passe 60 - JADOMI Ordonnances & Compta IDE
-- 2 tables, 14 index (dont 1 partiel, 2 composites),
-- RLS complet, triggers updated_at sur les 2 tables
-- =============================================
