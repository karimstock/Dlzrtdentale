-- =============================================
-- JADOMI LABO — 02 : Table catalogue_produits
-- =============================================

CREATE TABLE IF NOT EXISTS catalogue_produits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id uuid REFERENCES labo_prothesistes(id) ON DELETE CASCADE,
  categorie text NOT NULL,
  sous_categorie text,
  nom text NOT NULL,
  description text,
  code_ccam text,
  prix_unitaire decimal NOT NULL,
  tva_applicable boolean DEFAULT false,
  taux_tva decimal DEFAULT 0,
  type_produit text NOT NULL
    CHECK (type_produit IN ('prothese', 'orthese', 'accessoire', 'reparation')),
  necessite_teinte boolean DEFAULT false,
  necessite_teinte_gingivale boolean DEFAULT false,
  necessite_materiau boolean DEFAULT false,
  source_ajout text DEFAULT 'manuel'
    CHECK (source_ajout IN ('manuel', 'import_ia', 'template_jadomi')),
  import_batch_id uuid,
  est_actif boolean DEFAULT true,
  ordre_affichage int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalogue_prothesiste ON catalogue_produits(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_catalogue_categorie ON catalogue_produits(prothesiste_id, categorie);
CREATE INDEX IF NOT EXISTS idx_catalogue_recherche ON catalogue_produits USING gin(to_tsvector('french', nom || ' ' || coalesce(description, '')));
