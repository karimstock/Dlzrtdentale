-- =============================================
-- JADOMI LABO — 07 : Table declarations_conformite
-- =============================================

CREATE TABLE IF NOT EXISTS declarations_conformite (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bl_id uuid REFERENCES bons_livraison(id) ON DELETE CASCADE,
  numero_doc text NOT NULL,
  date_doc date NOT NULL,
  pdf_url text,
  materiaux_json jsonb,
  praticien_prescripteur text,
  patient_identification text,
  pdf_hash text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_declarations_bl ON declarations_conformite(bl_id);
