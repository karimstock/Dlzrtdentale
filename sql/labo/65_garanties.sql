-- =============================================
-- JADOMI LABO — Garanties / Warranties
-- Passe 59 — Gestion des garanties protheses
-- =============================================

-- Table principale des garanties
CREATE TABLE IF NOT EXISTS labo_garanties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  bon_livraison_id UUID REFERENCES bons_livraison(id),
  case_production_id UUID REFERENCES labo_production_cases(id),
  dentiste_id UUID REFERENCES dentistes_clients(id),
  patient_ref TEXT,
  type_travail TEXT NOT NULL,
  dents INTEGER[],
  materiaux TEXT,
  duree_mois INTEGER NOT NULL DEFAULT 24,
  date_debut DATE NOT NULL DEFAULT CURRENT_DATE,
  date_fin DATE,
  statut TEXT DEFAULT 'active' CHECK (statut IN ('active','expiree','reclamation','annulee')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Reclamations liees aux garanties
CREATE TABLE IF NOT EXISTS labo_garantie_reclamations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garantie_id UUID NOT NULL REFERENCES labo_garanties(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  cause TEXT,
  photos TEXT[],
  date_reclamation DATE DEFAULT CURRENT_DATE,
  remake_id UUID REFERENCES labo_remakes(id),
  resolution TEXT,
  statut TEXT DEFAULT 'ouverte' CHECK (statut IN ('ouverte','en_cours','resolue','rejetee')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Configuration des durees de garantie par labo
CREATE TABLE IF NOT EXISTS labo_garanties_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id) UNIQUE,
  durees JSONB DEFAULT '{"couronne":60,"ccm":36,"bridge":60,"prothese_amovible":24,"gouttiere":12,"facette":36,"inlay_onlay":60,"implant":60,"reparation":6}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_garanties_prothesiste ON labo_garanties(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_garanties_statut ON labo_garanties(statut);
CREATE INDEX IF NOT EXISTS idx_garanties_date_fin ON labo_garanties(date_fin);
CREATE INDEX IF NOT EXISTS idx_garanties_dentiste ON labo_garanties(dentiste_id);
CREATE INDEX IF NOT EXISTS idx_garantie_reclamations_garantie ON labo_garantie_reclamations(garantie_id);
