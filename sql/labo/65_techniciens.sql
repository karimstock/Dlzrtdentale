-- =============================================
-- JADOMI LABO — 65 : Table techniciens laboratoire
-- Passe 66 — Gestion des techniciens + KPI
-- =============================================

CREATE TABLE IF NOT EXISTS labo_techniciens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  nom TEXT NOT NULL,
  prenom TEXT,
  email TEXT,
  telephone TEXT,
  specialites TEXT[] DEFAULT '{}',
  date_embauche DATE,
  taux_horaire NUMERIC(8,2),
  statut TEXT DEFAULT 'actif' CHECK (statut IN ('actif','inactif')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_techniciens_prothesiste ON labo_techniciens(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_techniciens_statut ON labo_techniciens(statut);
