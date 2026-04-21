-- =============================================
-- JADOMI LABO — 03 : Tables imports_grilles + lignes_import
-- =============================================

CREATE TABLE IF NOT EXISTS imports_grilles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id uuid REFERENCES labo_prothesistes(id) ON DELETE CASCADE,
  fichier_original_url text,
  type_fichier text CHECK (type_fichier IN ('pdf', 'xlsx', 'image', 'csv')),
  statut text DEFAULT 'en_cours'
    CHECK (statut IN ('en_cours', 'extrait', 'valide', 'rejete')),
  produits_extraits int DEFAULT 0,
  produits_matches int DEFAULT 0,
  produits_nouveaux int DEFAULT 0,
  extraction_brute jsonb,
  created_at timestamptz DEFAULT now(),
  validated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_imports_prothesiste ON imports_grilles(prothesiste_id);

CREATE TABLE IF NOT EXISTS lignes_import (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid REFERENCES imports_grilles(id) ON DELETE CASCADE,
  nom_extrait text NOT NULL,
  prix_extrait decimal,
  categorie_suggeree text,
  type_produit_suggere text,
  tva_applicable_suggeree boolean,
  code_ccam_extrait text,
  produit_existant_id uuid REFERENCES catalogue_produits(id),
  score_match decimal,
  action text DEFAULT 'a_valider'
    CHECK (action IN ('a_valider', 'match_valide', 'nouveau_produit', 'ignore')),
  validated boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lignes_import ON lignes_import(import_id);
