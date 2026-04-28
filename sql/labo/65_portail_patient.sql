-- =============================================
-- JADOMI LABO — Portail patient (liens publics)
-- Permet au patient de suivre son cas via token
-- =============================================

CREATE TABLE IF NOT EXISTS labo_patient_liens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  cas_production_id UUID NOT NULL REFERENCES labo_production_cases(id),
  patient_nom TEXT,
  patient_prenom TEXT,
  patient_email TEXT,
  token TEXT UNIQUE NOT NULL,
  expire_at TIMESTAMPTZ NOT NULL,
  consulte_count INTEGER DEFAULT 0,
  derniere_consultation TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_patient_liens_token ON labo_patient_liens(token);
CREATE INDEX idx_patient_liens_case ON labo_patient_liens(cas_production_id);
