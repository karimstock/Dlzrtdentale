-- =============================================
-- JADOMI LABO — 05 : Tables bons_livraison + lignes_bl
-- =============================================

CREATE TABLE IF NOT EXISTS bons_livraison (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id uuid REFERENCES labo_prothesistes(id) ON DELETE CASCADE,
  dentiste_id uuid REFERENCES dentistes_clients(id),
  numero_bl text NOT NULL,
  date_bl date NOT NULL,
  patient_initiales text,
  patient_reference_interne text,
  -- Teintes
  teintier_utilise text,
  teinte_principale text,
  teinte_collet text,
  teinte_incisive text,
  teinte_gingivale text,
  teinte_notes text,
  stratification text CHECK (stratification IN ('monochromatique', 'multi-couches', 'stratifiee')),
  statut text DEFAULT 'brouillon'
    CHECK (statut IN ('brouillon', 'livre', 'facture')),
  total_ht_exonere decimal DEFAULT 0,
  total_ht_taxable decimal DEFAULT 0,
  total_tva decimal DEFAULT 0,
  total_ttc decimal DEFAULT 0,
  facture_id uuid,
  pdf_bl_url text,
  pdf_doc_url text,
  notes_techniques text,
  date_livraison_prevue date,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bl_numero
  ON bons_livraison(prothesiste_id, numero_bl);

CREATE INDEX IF NOT EXISTS idx_bl_prothesiste ON bons_livraison(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_bl_dentiste ON bons_livraison(dentiste_id);
CREATE INDEX IF NOT EXISTS idx_bl_statut ON bons_livraison(prothesiste_id, statut);

CREATE TABLE IF NOT EXISTS lignes_bl (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bl_id uuid REFERENCES bons_livraison(id) ON DELETE CASCADE,
  produit_id uuid REFERENCES catalogue_produits(id),
  designation text NOT NULL,
  quantite decimal NOT NULL DEFAULT 1,
  prix_unitaire decimal NOT NULL,
  remise_pct decimal DEFAULT 0,
  prix_unitaire_apres_remise decimal,
  tva_applicable boolean DEFAULT false,
  taux_tva decimal DEFAULT 0,
  montant_ht decimal NOT NULL,
  montant_tva decimal DEFAULT 0,
  montant_ttc decimal NOT NULL,
  materiau text,
  numero_lot_materiau text,
  teinte_specifique text,
  ordre int DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_lignes_bl ON lignes_bl(bl_id);
