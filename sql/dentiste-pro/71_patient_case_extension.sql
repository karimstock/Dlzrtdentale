-- =============================================
-- Passe 71 - Extension Patients + Cases + Case Events
-- Date : 3 mai 2026
-- Ajout : pat_id sur patients, log forensique case_events,
--         colonnes STL sur cases
-- Idempotent : executable plusieurs fois sans erreur
-- =============================================

-- =============================================
-- 1. ALTER dentiste_pro_patients
-- Ajout identifiant patient unique par cabinet : PAT-NNNNNN
-- =============================================
ALTER TABLE public.dentiste_pro_patients
  ADD COLUMN IF NOT EXISTS pat_id VARCHAR(50);

ALTER TABLE public.dentiste_pro_patients
  ADD COLUMN IF NOT EXISTS pat_number INT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dp_patients_pat_id
  ON public.dentiste_pro_patients(cabinet_id, pat_id)
  WHERE pat_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dp_patients_pat_number
  ON public.dentiste_pro_patients(cabinet_id, pat_number)
  WHERE pat_number IS NOT NULL;

-- =============================================
-- 2. Trigger generate_pat_id()
-- Format "PAT-NNNNNN" incremente par cabinet_id
-- Meme pattern que generate_case_reference()
-- =============================================
CREATE OR REPLACE FUNCTION generate_pat_id()
RETURNS TRIGGER AS $$
DECLARE
  seq INT;
BEGIN
  IF NEW.pat_id IS NULL OR NEW.pat_id = '' THEN
    SELECT COALESCE(MAX(pat_number), 0) + 1
    INTO seq
    FROM public.dentiste_pro_patients
    WHERE cabinet_id = NEW.cabinet_id;

    NEW.pat_number := seq;
    NEW.pat_id := 'PAT-' || LPAD(seq::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pat_id ON public.dentiste_pro_patients;
CREATE TRIGGER trg_pat_id
  BEFORE INSERT ON public.dentiste_pro_patients
  FOR EACH ROW
  EXECUTE FUNCTION generate_pat_id();

-- =============================================
-- 3. CREATE TABLE case_events
-- Log forensique append-only pour suivi des cas
-- Chaque evenement est immutable une fois cree
-- =============================================
CREATE TABLE IF NOT EXISTS public.case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.dentiste_pro_cases(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL
    CHECK (event_type IN (
      'created',
      'photo_uploaded',
      'sent_to_lab',
      'production_started',
      'delivered',
      'validated',
      'closed',
      'note_added',
      'status_changed'
    )),
  actor_user_id UUID,
  actor_type VARCHAR(20)
    CHECK (actor_type IN ('dentist', 'patient', 'lab', 'system')),
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_events_case_id
  ON public.case_events(case_id);

CREATE INDEX IF NOT EXISTS idx_case_events_event_type
  ON public.case_events(event_type);

CREATE INDEX IF NOT EXISTS idx_case_events_created_at
  ON public.case_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_case_events_case_created
  ON public.case_events(case_id, created_at DESC);

COMMENT ON TABLE public.case_events IS 'Log forensique append-only des evenements sur les cas prothetiques. Immutable, tracabilite complete.';

-- =============================================
-- 3b. RLS sur case_events
-- Policy SELECT : utilisateur authentifie voit les events
-- des cases de son cabinet uniquement
-- =============================================
ALTER TABLE public.case_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS case_events_select_policy ON public.case_events;
CREATE POLICY case_events_select_policy ON public.case_events
  FOR SELECT
  TO authenticated
  USING (
    case_id IN (
      SELECT c.id
      FROM public.dentiste_pro_cases c
      JOIN public.dentiste_pro_cabinets cab ON cab.id = c.cabinet_id
      JOIN public.societes s ON s.id = cab.societe_id
      JOIN public.user_societes us ON us.societe_id = s.id
      WHERE us.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS case_events_insert_policy ON public.case_events;
CREATE POLICY case_events_insert_policy ON public.case_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    case_id IN (
      SELECT c.id
      FROM public.dentiste_pro_cases c
      JOIN public.dentiste_pro_cabinets cab ON cab.id = c.cabinet_id
      JOIN public.societes s ON s.id = cab.societe_id
      JOIN public.user_societes us ON us.societe_id = s.id
      WHERE us.user_id = auth.uid()
    )
  );

-- =============================================
-- 4. ALTER dentiste_pro_cases
-- Colonnes pour transmission STL/empreinte numerique
-- et cloture du cas
-- =============================================
ALTER TABLE public.dentiste_pro_cases
  ADD COLUMN IF NOT EXISTS stl_transmission_method VARCHAR(50)
    CHECK (stl_transmission_method IN (
      'medit_link', '3shape_communicate', 'myitero',
      'primescan', 'silicone', 'autre'
    ));

ALTER TABLE public.dentiste_pro_cases
  ADD COLUMN IF NOT EXISTS stl_transmission_reference TEXT;

ALTER TABLE public.dentiste_pro_cases
  ADD COLUMN IF NOT EXISTS stl_transmitted_at TIMESTAMPTZ;

ALTER TABLE public.dentiste_pro_cases
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- =============================================
-- 5. GRANTS pour authenticated sur case_events
-- =============================================
GRANT SELECT, INSERT ON public.case_events TO authenticated;

-- =============================================
-- 6. Verification
-- =============================================
SELECT 'case_events' AS table_name, 'Log forensique append-only' AS description
UNION ALL
SELECT 'dentiste_pro_patients.pat_id', 'Identifiant patient PAT-NNNNNN'
UNION ALL
SELECT 'dentiste_pro_patients.pat_number', 'Numero sequentiel patient par cabinet'
UNION ALL
SELECT 'dentiste_pro_cases.stl_transmission_method', 'Methode transmission STL'
UNION ALL
SELECT 'dentiste_pro_cases.stl_transmission_reference', 'Reference transmission STL'
UNION ALL
SELECT 'dentiste_pro_cases.stl_transmitted_at', 'Date transmission STL'
UNION ALL
SELECT 'dentiste_pro_cases.closed_at', 'Date cloture du cas';

SELECT 'Migration 71_patient_case_extension.sql prete a executer' AS status;
