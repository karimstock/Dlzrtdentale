-- =============================================
-- JADOMI LABO — 08 : Table teintiers (partagee, lecture seule)
-- =============================================

CREATE TABLE IF NOT EXISTS teintiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_systeme text NOT NULL,
  nom_systeme text NOT NULL,
  fabricant text,
  type text NOT NULL CHECK (type IN ('dent', 'gencive')),
  code_teinte text NOT NULL,
  description text,
  groupe text,
  ordre_affichage int,
  couleur_hex text
);

CREATE INDEX IF NOT EXISTS idx_teintiers_systeme ON teintiers(code_systeme);
CREATE INDEX IF NOT EXISTS idx_teintiers_type ON teintiers(type);
