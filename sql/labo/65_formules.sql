-- =============================================
-- JADOMI LABO — Abonnements et formules
-- 3 tiers: essentiel (49€), pro (99€), premium (179€)
-- =============================================

CREATE TABLE IF NOT EXISTS labo_abonnements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id) UNIQUE,
  formule TEXT DEFAULT 'essentiel' CHECK (formule IN ('essentiel','pro','premium')),
  prix_mensuel NUMERIC(8,2),
  date_debut DATE DEFAULT CURRENT_DATE,
  date_fin DATE,
  stripe_subscription_id TEXT,
  statut TEXT DEFAULT 'actif' CHECK (statut IN ('actif','essai','suspendu','annule')),
  max_techniciens INTEGER DEFAULT 5,
  max_bl_mois INTEGER DEFAULT 200,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_labo_abo_prothesiste ON labo_abonnements(prothesiste_id);

-- Historique des changements de formule
CREATE TABLE IF NOT EXISTS labo_abonnements_historique (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  ancienne_formule TEXT,
  nouvelle_formule TEXT NOT NULL,
  ancien_prix NUMERIC(8,2),
  nouveau_prix NUMERIC(8,2),
  raison TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_labo_abo_hist_prothesiste ON labo_abonnements_historique(prothesiste_id);

-- RLS
ALTER TABLE labo_abonnements ENABLE ROW LEVEL SECURITY;
ALTER TABLE labo_abonnements_historique ENABLE ROW LEVEL SECURITY;
