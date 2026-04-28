-- =============================================
-- JADOMI LABO — Production tracking tables
-- Passe 65 — Suivi de production par etapes
-- =============================================

CREATE TABLE IF NOT EXISTS labo_production_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  bon_livraison_id UUID REFERENCES bons_livraison(id),
  dentiste_id UUID REFERENCES dentistes_clients(id),
  patient_ref TEXT,
  type_travail TEXT NOT NULL CHECK (type_travail IN ('couronne','bridge','prothese_amovible','prothese_fixe','gouttiere','implant','facette','inlay_onlay','reparation','autre')),
  materiaux TEXT,
  dents INTEGER[],
  teinte TEXT,
  teintier TEXT,
  urgence BOOLEAN DEFAULT false,
  etape_actuelle TEXT DEFAULT 'reception',
  statut TEXT DEFAULT 'en_cours' CHECK (statut IN ('en_cours','termine','annule','en_attente')),
  technicien_id UUID,
  technicien_nom TEXT,
  date_reception TIMESTAMPTZ DEFAULT now(),
  date_livraison_prevue DATE,
  date_livraison_reelle DATE,
  qr_code TEXT UNIQUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labo_production_etapes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES labo_production_cases(id) ON DELETE CASCADE,
  etape TEXT NOT NULL,
  technicien_id UUID,
  technicien_nom TEXT,
  debut TIMESTAMPTZ DEFAULT now(),
  fin TIMESTAMPTZ,
  duree_minutes INTEGER,
  notes TEXT,
  photos TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prod_cases_prothesiste ON labo_production_cases(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_prod_cases_etape ON labo_production_cases(etape_actuelle);
CREATE INDEX IF NOT EXISTS idx_prod_cases_statut ON labo_production_cases(statut);
CREATE INDEX IF NOT EXISTS idx_prod_cases_qr ON labo_production_cases(qr_code);
CREATE INDEX IF NOT EXISTS idx_prod_etapes_case ON labo_production_etapes(case_id);
