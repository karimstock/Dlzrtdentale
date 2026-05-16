-- =====================================================================
-- JADOMI — Questionnaire Medical Patient (Passe 77)
-- Module d'envoi de questionnaire medical par lien (email/SMS),
-- remplissage par le patient, signature electronique, stockage.
-- Idempotent : IF NOT EXISTS, DROP POLICY IF EXISTS.
-- A executer dans Supabase Dashboard (SQL Editor).
-- =====================================================================

-- =====================================================================
-- 1. patients_jadomi — Table centrale des patients
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.patients_jadomi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  nom text NOT NULL,
  prenom text NOT NULL,
  date_naissance date,
  sexe text CHECK (sexe IN ('Homme', 'Femme')),
  telephone text,
  email text,
  medecin_traitant text,
  medecin_telephone text,

  -- Donnees medicales
  questionnaire_medical jsonb DEFAULT '{}',
  allergies text[] DEFAULT '{}',
  medicaments_actuels text[] DEFAULT '{}',
  alertes_medicales text[] DEFAULT '{}',

  -- Dates questionnaire
  questionnaire_signed_at timestamptz,
  questionnaire_expires_at timestamptz,
  questionnaire_version integer DEFAULT 1,

  -- Statut patient
  statut text DEFAULT 'actif' CHECK (statut IN ('actif', 'inactif', 'decede', 'bloque')),
  statut_note text, -- raison du blocage ou date de deces
  statut_updated_at timestamptz,

  -- ID externe (Doctolib, Logos, etc.)
  id_externe text,
  source text DEFAULT 'questionnaire' CHECK (source IN ('questionnaire', 'import_csv', 'manuel', 'api', 'doctolib', 'logos_w')),
  derniere_consultation date,
  nombre_consultations integer DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Contrainte d'unicite (eviter les doublons patient par societe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_patients_jadomi_societe_nom_prenom_dob'
  ) THEN
    ALTER TABLE public.patients_jadomi
      ADD CONSTRAINT uq_patients_jadomi_societe_nom_prenom_dob
      UNIQUE (societe_id, nom, prenom, date_naissance);
  END IF;
END $$;

-- Index patients_jadomi
CREATE INDEX IF NOT EXISTS idx_patients_jadomi_societe_nom_prenom
  ON public.patients_jadomi(societe_id, nom, prenom);
CREATE INDEX IF NOT EXISTS idx_patients_jadomi_societe_telephone
  ON public.patients_jadomi(societe_id, telephone);
CREATE INDEX IF NOT EXISTS idx_patients_jadomi_societe_email
  ON public.patients_jadomi(societe_id, email);
CREATE INDEX IF NOT EXISTS idx_patients_jadomi_alertes_medicales
  ON public.patients_jadomi USING GIN (alertes_medicales);
CREATE INDEX IF NOT EXISTS idx_patients_jadomi_questionnaire_expires
  ON public.patients_jadomi(questionnaire_expires_at);

-- =====================================================================
-- 2. questionnaire_medical_invitations
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.questionnaire_medical_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  nom text NOT NULL,
  prenom text NOT NULL,
  telephone text,
  email text,
  token text NOT NULL UNIQUE,
  profession_type text DEFAULT 'dentiste',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired', 'cancelled')),
  patient_id uuid REFERENCES public.patients_jadomi(id),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  sent_via text,
  created_at timestamptz DEFAULT now()
);

-- Index invitations
CREATE INDEX IF NOT EXISTS idx_qm_invitations_token
  ON public.questionnaire_medical_invitations(token);
CREATE INDEX IF NOT EXISTS idx_qm_invitations_societe_status
  ON public.questionnaire_medical_invitations(societe_id, status);
CREATE INDEX IF NOT EXISTS idx_qm_invitations_expires
  ON public.questionnaire_medical_invitations(expires_at);

-- =====================================================================
-- 3. questionnaire_medical_signatures
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.questionnaire_medical_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients_jadomi(id) ON DELETE CASCADE,
  invitation_id uuid REFERENCES public.questionnaire_medical_invitations(id),
  signature_png text NOT NULL,
  signed_at timestamptz DEFAULT now(),
  ip_address text,
  user_agent text
);

-- Index signatures
CREATE INDEX IF NOT EXISTS idx_qm_signatures_patient
  ON public.questionnaire_medical_signatures(patient_id);

-- =====================================================================
-- 4. Trigger updated_at sur patients_jadomi
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_patients_jadomi_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_patients_jadomi_updated_at ON public.patients_jadomi;
CREATE TRIGGER trg_patients_jadomi_updated_at
  BEFORE UPDATE ON public.patients_jadomi
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_patients_jadomi_updated_at();

-- =====================================================================
-- 5. Row Level Security
-- =====================================================================

-- --- patients_jadomi ---
ALTER TABLE public.patients_jadomi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patients_jadomi_select ON public.patients_jadomi;
CREATE POLICY patients_jadomi_select ON public.patients_jadomi
  FOR SELECT USING (
    societe_id IN (
      SELECT id FROM public.societes WHERE user_id = auth.uid()
      UNION
      SELECT societe_id FROM public.membres WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS patients_jadomi_insert ON public.patients_jadomi;
CREATE POLICY patients_jadomi_insert ON public.patients_jadomi
  FOR INSERT WITH CHECK (
    societe_id IN (
      SELECT id FROM public.societes WHERE user_id = auth.uid()
      UNION
      SELECT societe_id FROM public.membres WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS patients_jadomi_update ON public.patients_jadomi;
CREATE POLICY patients_jadomi_update ON public.patients_jadomi
  FOR UPDATE USING (
    societe_id IN (
      SELECT id FROM public.societes WHERE user_id = auth.uid()
      UNION
      SELECT societe_id FROM public.membres WHERE user_id = auth.uid()
    )
  );

-- --- questionnaire_medical_invitations ---
ALTER TABLE public.questionnaire_medical_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qm_invitations_select ON public.questionnaire_medical_invitations;
CREATE POLICY qm_invitations_select ON public.questionnaire_medical_invitations
  FOR SELECT USING (
    societe_id IN (
      SELECT id FROM public.societes WHERE user_id = auth.uid()
      UNION
      SELECT societe_id FROM public.membres WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS qm_invitations_insert ON public.questionnaire_medical_invitations;
CREATE POLICY qm_invitations_insert ON public.questionnaire_medical_invitations
  FOR INSERT WITH CHECK (
    societe_id IN (
      SELECT id FROM public.societes WHERE user_id = auth.uid()
      UNION
      SELECT societe_id FROM public.membres WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS qm_invitations_update ON public.questionnaire_medical_invitations;
CREATE POLICY qm_invitations_update ON public.questionnaire_medical_invitations
  FOR UPDATE USING (
    societe_id IN (
      SELECT id FROM public.societes WHERE user_id = auth.uid()
      UNION
      SELECT societe_id FROM public.membres WHERE user_id = auth.uid()
    )
  );

-- --- questionnaire_medical_signatures ---
ALTER TABLE public.questionnaire_medical_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qm_signatures_select ON public.questionnaire_medical_signatures;
CREATE POLICY qm_signatures_select ON public.questionnaire_medical_signatures
  FOR SELECT USING (
    patient_id IN (
      SELECT id FROM public.patients_jadomi WHERE societe_id IN (
        SELECT id FROM public.societes WHERE user_id = auth.uid()
        UNION
        SELECT societe_id FROM public.membres WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS qm_signatures_insert ON public.questionnaire_medical_signatures;
CREATE POLICY qm_signatures_insert ON public.questionnaire_medical_signatures
  FOR INSERT WITH CHECK (
    patient_id IN (
      SELECT id FROM public.patients_jadomi WHERE societe_id IN (
        SELECT id FROM public.societes WHERE user_id = auth.uid()
        UNION
        SELECT societe_id FROM public.membres WHERE user_id = auth.uid()
      )
    )
  );

-- =====================================================================
-- FIN — Migration 77 Questionnaire Medical Patient
-- =====================================================================
