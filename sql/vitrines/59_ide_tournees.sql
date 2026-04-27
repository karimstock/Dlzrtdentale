-- =============================================
-- Passe 59 - JADOMI Tournees
-- Module agenda infirmieres liberales :
-- cabinets, nurses, patients, soins recurrents,
-- visites, tournees optimisees, absences.
-- =============================================

-- =============================================
-- 1. ide_cabinets
-- Cabinets d'infirmieres liberales
-- =============================================
CREATE TABLE IF NOT EXISTS public.ide_cabinets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL,
  nom TEXT NOT NULL,
  adresse TEXT,
  ville TEXT,
  code_postal TEXT,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  telephone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.ide_cabinets IS 'Cabinets d''infirmieres liberales lies a une societe JADOMI.';

-- =============================================
-- 2. ide_nurses
-- Infirmieres rattachees a un cabinet
-- =============================================
CREATE TABLE IF NOT EXISTS public.ide_nurses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.ide_cabinets(id) ON DELETE CASCADE,
  user_id UUID,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  telephone TEXT,
  email TEXT,
  rpps TEXT,
  couleur TEXT DEFAULT '#6366f1',
  is_titulaire BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.ide_nurses IS 'Infirmieres du cabinet. user_id optionnel si inscrite sur JADOMI.';

-- =============================================
-- 3. ide_patients
-- Patients suivis par le cabinet
-- =============================================
CREATE TABLE IF NOT EXISTS public.ide_patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.ide_cabinets(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  prenom TEXT,
  adresse TEXT NOT NULL,
  ville TEXT,
  code_postal TEXT,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  telephone TEXT,
  telephone_famille TEXT,
  notes TEXT,
  medecin_traitant TEXT,
  is_banned BOOLEAN DEFAULT false,
  ban_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.ide_patients IS 'Patients suivis a domicile par le cabinet IDE.';

-- =============================================
-- 4. ide_soins_recurrents
-- Soins recurrents programmes pour un patient
-- =============================================
CREATE TABLE IF NOT EXISTS public.ide_soins_recurrents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.ide_patients(id) ON DELETE CASCADE,
  soins_type TEXT NOT NULL,
  duree_minutes INTEGER DEFAULT 15,
  tournee TEXT NOT NULL CHECK (tournee IN ('matin', 'soir', 'les_deux')),
  jours_semaine INTEGER[],
  nurse_preferee_id UUID REFERENCES public.ide_nurses(id),
  heure_preferee TIME,
  ordonnance_expire_at DATE,
  notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.ide_soins_recurrents IS 'Soins recurrents d''un patient : type, frequence, nurse preferee, ordonnance.';
COMMENT ON COLUMN public.ide_soins_recurrents.soins_type IS 'Ex: insuline, pansement, perfusion, toilette, prise_sang';
COMMENT ON COLUMN public.ide_soins_recurrents.jours_semaine IS '0=dimanche, 1=lundi ... 6=samedi';

-- =============================================
-- 5. ide_visites
-- Visites planifiees (une ligne par visite concrete)
-- =============================================
CREATE TABLE IF NOT EXISTS public.ide_visites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID REFERENCES public.ide_cabinets(id),
  patient_id UUID REFERENCES public.ide_patients(id),
  nurse_id UUID REFERENCES public.ide_nurses(id),
  soin_recurrent_id UUID REFERENCES public.ide_soins_recurrents(id),
  date DATE NOT NULL,
  tournee TEXT NOT NULL CHECK (tournee IN ('matin', 'soir')),
  ordre_dans_tournee INTEGER,
  heure_estimee TIME,
  heure_arrivee TIME,
  heure_depart TIME,
  duree_minutes INTEGER,
  soins_type TEXT,
  soins_realises TEXT,
  notes_visite TEXT,
  status TEXT DEFAULT 'planifie' CHECK (status IN (
    'planifie', 'en_route', 'en_cours', 'termine', 'annule', 'reporte'
  )),
  annulation_motif TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.ide_visites IS 'Visites planifiees ou realisees. Une ligne par passage concret chez un patient.';

-- =============================================
-- 6. ide_tournees
-- Tournees optimisees (une par nurse/date/type)
-- =============================================
CREATE TABLE IF NOT EXISTS public.ide_tournees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID REFERENCES public.ide_cabinets(id),
  nurse_id UUID REFERENCES public.ide_nurses(id),
  date DATE NOT NULL,
  tournee TEXT NOT NULL CHECK (tournee IN ('matin', 'soir')),
  ordre_patients JSONB,
  distance_totale_km DECIMAL(8,2),
  duree_totale_min INTEGER,
  nb_patients INTEGER,
  optimized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(nurse_id, date, tournee)
);

COMMENT ON TABLE public.ide_tournees IS 'Tournees optimisees : ordre de passage, distance, duree. Une par nurse/date/tournee.';

-- =============================================
-- 7. ide_absences
-- Absences et remplacements d'infirmieres
-- =============================================
CREATE TABLE IF NOT EXISTS public.ide_absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID REFERENCES public.ide_cabinets(id),
  nurse_id UUID REFERENCES public.ide_nurses(id),
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  motif TEXT,
  remplacant_id UUID REFERENCES public.ide_nurses(id),
  contrat_signe BOOLEAN DEFAULT false,
  contrat_document_id UUID,
  contrat_envoye_ordre BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active' CHECK (status IN (
    'active', 'pourvu', 'terminee', 'annulee'
  )),
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.ide_absences IS 'Absences infirmieres avec gestion des remplacements et contrats.';

-- =============================================
-- 8. INDEX
-- =============================================

-- ide_cabinets
CREATE INDEX IF NOT EXISTS idx_ide_cabinets_societe_id
  ON public.ide_cabinets(societe_id);

-- ide_nurses
CREATE INDEX IF NOT EXISTS idx_ide_nurses_cabinet_id
  ON public.ide_nurses(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_ide_nurses_user_id
  ON public.ide_nurses(user_id);

-- ide_patients
CREATE INDEX IF NOT EXISTS idx_ide_patients_cabinet_id
  ON public.ide_patients(cabinet_id);

-- ide_soins_recurrents
CREATE INDEX IF NOT EXISTS idx_ide_soins_recurrents_patient_id
  ON public.ide_soins_recurrents(patient_id);
CREATE INDEX IF NOT EXISTS idx_ide_soins_recurrents_nurse_preferee
  ON public.ide_soins_recurrents(nurse_preferee_id);

-- ide_visites
CREATE INDEX IF NOT EXISTS idx_ide_visites_cabinet_id
  ON public.ide_visites(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_ide_visites_patient_id
  ON public.ide_visites(patient_id);
CREATE INDEX IF NOT EXISTS idx_ide_visites_nurse_id
  ON public.ide_visites(nurse_id);
CREATE INDEX IF NOT EXISTS idx_ide_visites_date
  ON public.ide_visites(date);
CREATE INDEX IF NOT EXISTS idx_ide_visites_status
  ON public.ide_visites(status);
CREATE INDEX IF NOT EXISTS idx_ide_visites_nurse_date_tournee
  ON public.ide_visites(nurse_id, date, tournee);
CREATE INDEX IF NOT EXISTS idx_ide_visites_planifie
  ON public.ide_visites(date, nurse_id) WHERE status = 'planifie';

-- ide_tournees
CREATE INDEX IF NOT EXISTS idx_ide_tournees_cabinet_id
  ON public.ide_tournees(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_ide_tournees_nurse_id
  ON public.ide_tournees(nurse_id);
CREATE INDEX IF NOT EXISTS idx_ide_tournees_date
  ON public.ide_tournees(date);

-- ide_absences
CREATE INDEX IF NOT EXISTS idx_ide_absences_cabinet_id
  ON public.ide_absences(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_ide_absences_nurse_id
  ON public.ide_absences(nurse_id);
CREATE INDEX IF NOT EXISTS idx_ide_absences_status
  ON public.ide_absences(status);
CREATE INDEX IF NOT EXISTS idx_ide_absences_dates
  ON public.ide_absences(date_debut, date_fin);

-- =============================================
-- 9. TRIGGER updated_at sur ide_visites
-- =============================================
CREATE OR REPLACE FUNCTION public.ide_visites_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ide_visites_updated_at ON public.ide_visites;
CREATE TRIGGER trg_ide_visites_updated_at
  BEFORE UPDATE ON public.ide_visites
  FOR EACH ROW
  EXECUTE FUNCTION public.ide_visites_updated_at();

-- =============================================
-- 10. RLS - Row Level Security
-- Toutes les tables : filtrage par cabinet_id
-- via societe_id (l'utilisateur doit appartenir
-- a la societe proprietaire du cabinet).
-- =============================================

-- Helper: check if current user belongs to the societe owning a cabinet
CREATE OR REPLACE FUNCTION public.ide_user_owns_cabinet(p_cabinet_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.ide_cabinets c
    JOIN public.societes s ON s.id = c.societe_id
    WHERE c.id = p_cabinet_id
      AND s.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ---------- ide_cabinets ----------
ALTER TABLE public.ide_cabinets ENABLE ROW LEVEL SECURITY;

CREATE POLICY ide_cabinets_select ON public.ide_cabinets
  FOR SELECT TO authenticated
  USING (
    societe_id IN (
      SELECT id FROM public.societes WHERE user_id = auth.uid()
    )
  );

CREATE POLICY ide_cabinets_insert ON public.ide_cabinets
  FOR INSERT TO authenticated
  WITH CHECK (
    societe_id IN (
      SELECT id FROM public.societes WHERE user_id = auth.uid()
    )
  );

CREATE POLICY ide_cabinets_update ON public.ide_cabinets
  FOR UPDATE TO authenticated
  USING (
    societe_id IN (
      SELECT id FROM public.societes WHERE user_id = auth.uid()
    )
  );

-- ---------- ide_nurses ----------
ALTER TABLE public.ide_nurses ENABLE ROW LEVEL SECURITY;

CREATE POLICY ide_nurses_select ON public.ide_nurses
  FOR SELECT TO authenticated
  USING (public.ide_user_owns_cabinet(cabinet_id));

CREATE POLICY ide_nurses_insert ON public.ide_nurses
  FOR INSERT TO authenticated
  WITH CHECK (public.ide_user_owns_cabinet(cabinet_id));

CREATE POLICY ide_nurses_update ON public.ide_nurses
  FOR UPDATE TO authenticated
  USING (public.ide_user_owns_cabinet(cabinet_id));

-- ---------- ide_patients ----------
ALTER TABLE public.ide_patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY ide_patients_select ON public.ide_patients
  FOR SELECT TO authenticated
  USING (public.ide_user_owns_cabinet(cabinet_id));

CREATE POLICY ide_patients_insert ON public.ide_patients
  FOR INSERT TO authenticated
  WITH CHECK (public.ide_user_owns_cabinet(cabinet_id));

CREATE POLICY ide_patients_update ON public.ide_patients
  FOR UPDATE TO authenticated
  USING (public.ide_user_owns_cabinet(cabinet_id));

-- ---------- ide_soins_recurrents ----------
ALTER TABLE public.ide_soins_recurrents ENABLE ROW LEVEL SECURITY;

CREATE POLICY ide_soins_recurrents_select ON public.ide_soins_recurrents
  FOR SELECT TO authenticated
  USING (
    patient_id IN (
      SELECT id FROM public.ide_patients
      WHERE public.ide_user_owns_cabinet(cabinet_id)
    )
  );

CREATE POLICY ide_soins_recurrents_insert ON public.ide_soins_recurrents
  FOR INSERT TO authenticated
  WITH CHECK (
    patient_id IN (
      SELECT id FROM public.ide_patients
      WHERE public.ide_user_owns_cabinet(cabinet_id)
    )
  );

CREATE POLICY ide_soins_recurrents_update ON public.ide_soins_recurrents
  FOR UPDATE TO authenticated
  USING (
    patient_id IN (
      SELECT id FROM public.ide_patients
      WHERE public.ide_user_owns_cabinet(cabinet_id)
    )
  );

-- ---------- ide_visites ----------
ALTER TABLE public.ide_visites ENABLE ROW LEVEL SECURITY;

CREATE POLICY ide_visites_select ON public.ide_visites
  FOR SELECT TO authenticated
  USING (public.ide_user_owns_cabinet(cabinet_id));

CREATE POLICY ide_visites_insert ON public.ide_visites
  FOR INSERT TO authenticated
  WITH CHECK (public.ide_user_owns_cabinet(cabinet_id));

CREATE POLICY ide_visites_update ON public.ide_visites
  FOR UPDATE TO authenticated
  USING (public.ide_user_owns_cabinet(cabinet_id));

-- ---------- ide_tournees ----------
ALTER TABLE public.ide_tournees ENABLE ROW LEVEL SECURITY;

CREATE POLICY ide_tournees_select ON public.ide_tournees
  FOR SELECT TO authenticated
  USING (public.ide_user_owns_cabinet(cabinet_id));

CREATE POLICY ide_tournees_insert ON public.ide_tournees
  FOR INSERT TO authenticated
  WITH CHECK (public.ide_user_owns_cabinet(cabinet_id));

CREATE POLICY ide_tournees_update ON public.ide_tournees
  FOR UPDATE TO authenticated
  USING (public.ide_user_owns_cabinet(cabinet_id));

-- ---------- ide_absences ----------
ALTER TABLE public.ide_absences ENABLE ROW LEVEL SECURITY;

CREATE POLICY ide_absences_select ON public.ide_absences
  FOR SELECT TO authenticated
  USING (public.ide_user_owns_cabinet(cabinet_id));

CREATE POLICY ide_absences_insert ON public.ide_absences
  FOR INSERT TO authenticated
  WITH CHECK (public.ide_user_owns_cabinet(cabinet_id));

CREATE POLICY ide_absences_update ON public.ide_absences
  FOR UPDATE TO authenticated
  USING (public.ide_user_owns_cabinet(cabinet_id));

-- =============================================
-- FIN Passe 59 - JADOMI Tournees IDE
-- 7 tables, 20+ index, RLS complet,
-- trigger updated_at sur ide_visites
-- =============================================
