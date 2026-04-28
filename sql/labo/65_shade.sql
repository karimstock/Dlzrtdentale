-- =============================================
-- JADOMI LABO — Shade / Colorimetrie dentaire
-- Tables pour gestion photos teinte + analyse IA
-- =============================================

CREATE TABLE IF NOT EXISTS labo_shade_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  dentiste_id UUID REFERENCES dentistes_clients(id),
  cas_production_id UUID REFERENCES labo_production_cases(id),
  patient_ref TEXT,
  dents INTEGER[],
  teintier_reference TEXT,
  analyse_ia JSONB,
  teinte_finale TEXT,
  notes TEXT,
  statut TEXT DEFAULT 'en_cours' CHECK (statut IN ('en_cours','analyse','valide')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labo_shade_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shade_case_id UUID NOT NULL REFERENCES labo_shade_cases(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  type TEXT DEFAULT 'labial' CHECK (type IN ('labial','lingual','occlusale','gros_plan','comparaison','avant','apres')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shade_prothesiste ON labo_shade_cases(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_shade_photos_case ON labo_shade_photos(shade_case_id);
