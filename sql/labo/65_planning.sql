-- =============================================
-- JADOMI LABO — Planning / Conges techniciens
-- Passe 65 — Table absences techniciens
-- =============================================

CREATE TABLE IF NOT EXISTS labo_planning_conges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  technicien_id UUID NOT NULL REFERENCES labo_techniciens(id),
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  motif TEXT DEFAULT 'conge' CHECK (motif IN ('conge','maladie','formation','autre')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_conges_prothesiste ON labo_planning_conges(prothesiste_id);
CREATE INDEX idx_conges_technicien ON labo_planning_conges(technicien_id);
CREATE INDEX idx_conges_dates ON labo_planning_conges(date_debut, date_fin);
