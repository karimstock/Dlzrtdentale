-- =============================================
-- JADOMI LABO — Remakes / Refabrications
-- Suivi qualite des refabrications
-- =============================================

CREATE TABLE IF NOT EXISTS labo_remakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  case_production_id UUID REFERENCES labo_production_cases(id),
  bon_livraison_id UUID REFERENCES bons_livraison(id),
  dentiste_id UUID REFERENCES dentistes_clients(id),
  type_travail TEXT,
  cause TEXT NOT NULL CHECK (cause IN ('adaptation','fracture','esthetique','teinte','occlusion','matiere_defectueuse','erreur_conception','erreur_fabrication','autre')),
  description_probleme TEXT,
  responsabilite TEXT DEFAULT 'labo' CHECK (responsabilite IN ('labo','dentiste','fournisseur','patient')),
  cout_remake NUMERIC(10,2) DEFAULT 0,
  photos_probleme TEXT[],
  technicien_responsable TEXT,
  action_corrective TEXT,
  resolution TEXT,
  statut TEXT DEFAULT 'ouvert' CHECK (statut IN ('ouvert','en_cours','resolu','ferme')),
  date_probleme TIMESTAMPTZ DEFAULT now(),
  date_resolution TIMESTAMPTZ,
  nouveau_bl_id UUID REFERENCES bons_livraison(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_remakes_prothesiste ON labo_remakes(prothesiste_id);
CREATE INDEX idx_remakes_cause ON labo_remakes(cause);
CREATE INDEX idx_remakes_dentiste ON labo_remakes(dentiste_id);
CREATE INDEX idx_remakes_statut ON labo_remakes(statut);
