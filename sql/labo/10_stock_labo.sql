-- =============================================
-- JADOMI LABO — 10 : Stock & Materiaux laboratoire
-- =============================================

CREATE TABLE IF NOT EXISTS labo_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id uuid REFERENCES labo_prothesistes(id) ON DELETE CASCADE,
  nom text NOT NULL,
  categorie text,
  sous_categorie text,
  marque text,
  fournisseur text,
  reference_fournisseur text,
  code_barre text,
  type_code text,
  quantite decimal DEFAULT 0,
  unite text DEFAULT 'unite',
  seuil_alerte decimal DEFAULT 1,
  prix_unitaire decimal,
  prix_fournisseur_2 decimal,
  fournisseur_2 text,
  prix_fournisseur_3 decimal,
  fournisseur_3 text,
  date_peremption date,
  numero_lot text,
  image_url text,
  notes text,
  est_actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_labo_stock_prothesiste ON labo_stock(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_labo_stock_code ON labo_stock(code_barre);
CREATE INDEX IF NOT EXISTS idx_labo_stock_categorie ON labo_stock(prothesiste_id, categorie);
CREATE INDEX IF NOT EXISTS idx_labo_stock_peremption ON labo_stock(date_peremption) WHERE date_peremption IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_labo_stock_recherche ON labo_stock USING gin(to_tsvector('french', nom || ' ' || coalesce(marque, '') || ' ' || coalesce(fournisseur, '')));

-- Mouvements de stock (entrees/sorties)
CREATE TABLE IF NOT EXISTS labo_stock_mouvements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id uuid REFERENCES labo_stock(id) ON DELETE CASCADE,
  type_mouvement text NOT NULL CHECK (type_mouvement IN ('entree', 'sortie', 'ajustement')),
  quantite decimal NOT NULL,
  motif text,
  bl_id uuid REFERENCES bons_livraison(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_labo_mvt_stock ON labo_stock_mouvements(stock_id);

-- RLS
ALTER TABLE labo_stock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS labo_stock_select ON labo_stock;
CREATE POLICY labo_stock_select ON labo_stock FOR SELECT USING (labo_user_has_access(prothesiste_id));
DROP POLICY IF EXISTS labo_stock_insert ON labo_stock;
CREATE POLICY labo_stock_insert ON labo_stock FOR INSERT WITH CHECK (labo_user_has_access(prothesiste_id));
DROP POLICY IF EXISTS labo_stock_update ON labo_stock;
CREATE POLICY labo_stock_update ON labo_stock FOR UPDATE USING (labo_user_has_access(prothesiste_id));
DROP POLICY IF EXISTS labo_stock_delete ON labo_stock;
CREATE POLICY labo_stock_delete ON labo_stock FOR DELETE USING (labo_user_has_access(prothesiste_id));

ALTER TABLE labo_stock_mouvements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS labo_mvt_all ON labo_stock_mouvements;
CREATE POLICY labo_mvt_all ON labo_stock_mouvements FOR ALL USING (
  EXISTS (SELECT 1 FROM labo_stock s WHERE s.id = labo_stock_mouvements.stock_id AND labo_user_has_access(s.prothesiste_id))
);
