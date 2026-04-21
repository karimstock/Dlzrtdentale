-- =============================================
-- JADOMI LABO — 04 : Table dentistes_clients
-- =============================================

CREATE TABLE IF NOT EXISTS dentistes_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id uuid REFERENCES labo_prothesistes(id) ON DELETE CASCADE,
  reference_client text,
  titre text,
  nom text NOT NULL,
  prenom text,
  raison_sociale_cabinet text,
  siren text,
  siret text,
  adresse_ligne1 text,
  adresse_ligne2 text,
  code_postal text,
  ville text,
  telephone text,
  email text NOT NULL,
  rpps text,
  source_creation text DEFAULT 'manuel'
    CHECK (source_creation IN ('manuel', 'api_gouv', 'jadomi')),
  notes text,
  est_actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dentiste_email
  ON dentistes_clients(prothesiste_id, email);

CREATE INDEX IF NOT EXISTS idx_dentistes_prothesiste
  ON dentistes_clients(prothesiste_id);
