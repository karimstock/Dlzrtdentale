-- =============================================
-- JADOMI LABO — 01 : Table labo_prothesistes
-- =============================================

CREATE TABLE IF NOT EXISTS labo_prothesistes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid REFERENCES societes(id) ON DELETE CASCADE,
  raison_sociale text NOT NULL,
  forme_juridique text,
  siren text,
  siret text,
  numero_dmmes text,
  code_ape text DEFAULT '3250A',
  capital_social decimal,
  adresse_ligne1 text,
  adresse_ligne2 text,
  code_postal text,
  ville text,
  pays text DEFAULT 'France',
  telephone text,
  email text,
  site_web text,
  iban text,
  bic text,
  logo_url text,
  signature_url text,
  regime_tva text DEFAULT 'franchise_base'
    CHECK (regime_tva IN ('franchise_base', 'reel_simplifie', 'reel_normal')),
  mention_tva_franchise text DEFAULT 'TVA non applicable - art. 293 B du CGI',
  mention_exoneration text DEFAULT 'Exoneration TVA art. 261, 4, 1 du CGI',
  rcs_ville text,
  numero_rcs text,
  prefix_bl text DEFAULT 'BL',
  prefix_facture text DEFAULT 'F',
  prochain_numero_bl int DEFAULT 1,
  prochain_numero_facture int DEFAULT 1,
  pays_fabrication text DEFAULT 'France',
  responsable_qualite text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_labo_prothesistes_societe ON labo_prothesistes(societe_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_labo_prothesistes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_labo_prothesistes_updated_at ON labo_prothesistes;
CREATE TRIGGER trg_labo_prothesistes_updated_at
  BEFORE UPDATE ON labo_prothesistes
  FOR EACH ROW EXECUTE FUNCTION update_labo_prothesistes_updated_at();
