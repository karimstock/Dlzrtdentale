-- =============================================
-- JADOMI LABO — 06 : Tables factures_labo + avoirs_labo
-- =============================================

CREATE TABLE IF NOT EXISTS factures_labo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id uuid REFERENCES labo_prothesistes(id) ON DELETE CASCADE,
  dentiste_id uuid REFERENCES dentistes_clients(id),
  numero_facture text NOT NULL,
  date_facture date NOT NULL,
  periode_debut date NOT NULL,
  periode_fin date NOT NULL,
  total_ht_exonere decimal DEFAULT 0,
  total_ht_taxable decimal DEFAULT 0,
  total_tva decimal DEFAULT 0,
  total_ttc decimal NOT NULL,
  remise_globale_pct decimal DEFAULT 0,
  statut text DEFAULT 'brouillon'
    CHECK (statut IN ('brouillon', 'emise', 'payee', 'annulee')),
  pdf_url text,
  date_envoi timestamptz,
  date_paiement date,
  mode_paiement text,
  avoir_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_facture_labo_numero
  ON factures_labo(prothesiste_id, numero_facture);

CREATE INDEX IF NOT EXISTS idx_factures_prothesiste ON factures_labo(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_factures_dentiste ON factures_labo(dentiste_id);

CREATE TABLE IF NOT EXISTS avoirs_labo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id uuid REFERENCES labo_prothesistes(id) ON DELETE CASCADE,
  facture_id uuid REFERENCES factures_labo(id),
  dentiste_id uuid REFERENCES dentistes_clients(id),
  numero_avoir text NOT NULL,
  date_avoir date NOT NULL DEFAULT current_date,
  motif text,
  total_ttc decimal NOT NULL,
  pdf_url text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_avoirs_prothesiste ON avoirs_labo(prothesiste_id);
