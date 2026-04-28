-- =============================================
-- JADOMI LABO — Expeditions / Shipments
-- Passe 65
-- =============================================

CREATE TABLE IF NOT EXISTS labo_expeditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  dentiste_id UUID REFERENCES dentistes_clients(id),
  bons_livraison_ids UUID[] DEFAULT '{}',
  cases_production_ids UUID[] DEFAULT '{}',
  transporteur TEXT DEFAULT 'colissimo' CHECK (transporteur IN ('colissimo','chronopost','coursier','main_propre','autre')),
  numero_suivi TEXT,
  poids_grammes INTEGER,
  valeur_declaree NUMERIC(10,2),
  assurance BOOLEAN DEFAULT false,
  statut TEXT DEFAULT 'prepare' CHECK (statut IN ('prepare','enleve','en_transit','livre','retour','annule')),
  adresse_expediteur JSONB,
  adresse_destination JSONB,
  notes_expedition TEXT,
  date_expedition TIMESTAMPTZ,
  date_livraison_estimee DATE,
  date_livraison_reelle TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labo_expedition_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expedition_id UUID NOT NULL REFERENCES labo_expeditions(id) ON DELETE CASCADE,
  statut TEXT NOT NULL,
  localisation TEXT,
  commentaire TEXT,
  date_evenement TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exp_prothesiste ON labo_expeditions(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_exp_statut ON labo_expeditions(statut);
CREATE INDEX IF NOT EXISTS idx_exp_dentiste ON labo_expeditions(dentiste_id);
CREATE INDEX IF NOT EXISTS idx_exp_events ON labo_expedition_events(expedition_id);
