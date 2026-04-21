-- =============================================
-- JADOMI — Commerce : Support variantes produits
-- Exécuter dans Supabase SQL Editor
-- =============================================

-- Colonnes pour le système de variantes
ALTER TABLE produits_societe
ADD COLUMN IF NOT EXISTS produit_parent_id uuid
  REFERENCES produits_societe(id) ON DELETE CASCADE;

ALTER TABLE produits_societe
ADD COLUMN IF NOT EXISTS variante_nom text;

ALTER TABLE produits_societe
ADD COLUMN IF NOT EXISTS variante_valeur text;

ALTER TABLE produits_societe
ADD COLUMN IF NOT EXISTS has_variantes boolean DEFAULT false;

ALTER TABLE produits_societe
ADD COLUMN IF NOT EXISTS is_variante boolean DEFAULT false;

-- Index pour requêtes sur les variantes d'un produit parent
CREATE INDEX IF NOT EXISTS idx_produit_parent
  ON produits_societe(produit_parent_id)
  WHERE produit_parent_id IS NOT NULL;

-- Index composite pour accélérer les lookups parent + société
CREATE INDEX IF NOT EXISTS idx_produit_societe_parent
  ON produits_societe(societe_id, produit_parent_id)
  WHERE produit_parent_id IS NOT NULL;
