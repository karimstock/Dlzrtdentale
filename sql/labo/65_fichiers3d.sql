-- =============================================
-- JADOMI LABO — Fichiers 3D + validations design
-- Tables pour gestion STL/3D et approbation dentiste
-- =============================================

CREATE TABLE IF NOT EXISTS labo_fichiers3d (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  cas_production_id UUID REFERENCES labo_production_cases(id),
  dentiste_id UUID REFERENCES dentistes_clients(id),
  nom_fichier TEXT NOT NULL,
  type_fichier TEXT CHECK (type_fichier IN ('stl','ply','obj','dcm','3mf','step','iges')),
  taille_octets BIGINT,
  url TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  parent_id UUID REFERENCES labo_fichiers3d(id),
  description TEXT,
  version_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labo_validations_3d (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fichier_id UUID NOT NULL REFERENCES labo_fichiers3d(id) ON DELETE CASCADE,
  prothesiste_id UUID NOT NULL,
  dentiste_id UUID NOT NULL REFERENCES dentistes_clients(id),
  statut TEXT DEFAULT 'en_attente' CHECK (statut IN ('en_attente','approuve','rejete','modification')),
  commentaire TEXT,
  annotations TEXT,
  date_soumission TIMESTAMPTZ DEFAULT now(),
  date_reponse TIMESTAMPTZ,
  token TEXT UNIQUE,
  token_expire_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_f3d_prothesiste ON labo_fichiers3d(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_f3d_case ON labo_fichiers3d(cas_production_id);
CREATE INDEX IF NOT EXISTS idx_val_statut ON labo_validations_3d(statut);
CREATE INDEX IF NOT EXISTS idx_val_token ON labo_validations_3d(token);
