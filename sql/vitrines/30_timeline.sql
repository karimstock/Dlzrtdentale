-- =============================================
-- JADOMI — Migration 30 — JADOMI Timeline
-- Suivi visuel chronologique patient
-- Passe 30 (23 avril 2026)
-- =============================================

-- Timelines de traitement par patient
CREATE TABLE IF NOT EXISTS treatment_timelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES vitrines_sites(id) ON DELETE CASCADE,
  societe_id uuid,
  patient_account_id uuid REFERENCES client_accounts(id) ON DELETE SET NULL,
  patient_info jsonb DEFAULT '{}'::jsonb,
  practitioner_name text,
  practitioner_email text,
  treatment_type text NOT NULL CHECK (treatment_type IN (
    'orthodontie','greffe_gingivale','facettes','couronne','implant',
    'blanchiment','bruxisme','prothese_fabrication','kine_postop',
    'podologie_semelles','osteopathie_suivi','autre'
  )),
  treatment_label text NOT NULL,
  treatment_description text,
  status text DEFAULT 'en_cours' CHECK (status IN (
    'en_cours','termine','abandonne','suspendu'
  )),
  start_date date NOT NULL,
  estimated_end_date date,
  actual_end_date date,
  visibility text DEFAULT 'private' CHECK (visibility IN (
    'private','shared_with_patient','portfolio_anonymized'
  )),
  consent_patient_signed boolean DEFAULT false,
  consent_signed_at timestamptz,
  consent_signature_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Etapes chronologiques
CREATE TABLE IF NOT EXISTS timeline_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id uuid REFERENCES treatment_timelines(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  step_date date NOT NULL,
  step_label text NOT NULL,
  clinical_notes text,
  measurements jsonb DEFAULT '{}'::jsonb,
  next_appointment_date date,
  visible_to_patient boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Photos attachees aux etapes
CREATE TABLE IF NOT EXISTS timeline_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id uuid REFERENCES timeline_steps(id) ON DELETE CASCADE,
  photo_type text DEFAULT 'autre' CHECK (photo_type IN (
    'avant','apres','cote_droit','cote_gauche','dessus','dessous',
    'face','profil','panoramique','radiographie','scan_3d','autre'
  )),
  caption text,
  r2_key text NOT NULL,
  r2_key_thumbnail text,
  r2_key_anonymized text,
  width int,
  height int,
  file_size int,
  patient_face_detected boolean DEFAULT false,
  crop_region_suggested jsonb,
  claude_vision_labels jsonb,
  uploaded_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_site ON treatment_timelines(site_id);
CREATE INDEX IF NOT EXISTS idx_timeline_societe ON treatment_timelines(societe_id);
CREATE INDEX IF NOT EXISTS idx_timeline_patient ON treatment_timelines(patient_account_id);
CREATE INDEX IF NOT EXISTS idx_timeline_status ON treatment_timelines(status);
CREATE INDEX IF NOT EXISTS idx_timeline_type ON treatment_timelines(treatment_type);
CREATE INDEX IF NOT EXISTS idx_steps_timeline ON timeline_steps(timeline_id, step_order);
CREATE INDEX IF NOT EXISTS idx_photos_step ON timeline_photos(step_id);
