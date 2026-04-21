-- =============================================
-- JADOMI LABO — 09 : RLS (Row Level Security)
-- Acces via user_societe_roles sur toutes les tables
-- =============================================

-- Helper function : verifie que l'utilisateur courant a un role sur la societe du prothesiste
CREATE OR REPLACE FUNCTION labo_user_has_access(p_prothesiste_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_societe_roles usr
    JOIN labo_prothesistes p ON p.societe_id = usr.societe_id
    WHERE usr.user_id = auth.uid()
      AND p.id = p_prothesiste_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- === PROTHESISTES ===
ALTER TABLE labo_prothesistes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS labo_prothesistes_select ON labo_prothesistes;
CREATE POLICY labo_prothesistes_select ON labo_prothesistes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_societe_roles
    WHERE user_id = auth.uid() AND societe_id = labo_prothesistes.societe_id
  )
);
DROP POLICY IF EXISTS labo_prothesistes_insert ON labo_prothesistes;
CREATE POLICY labo_prothesistes_insert ON labo_prothesistes FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_societe_roles
    WHERE user_id = auth.uid() AND societe_id = labo_prothesistes.societe_id
      AND role IN ('owner', 'admin')
  )
);
DROP POLICY IF EXISTS labo_prothesistes_update ON labo_prothesistes;
CREATE POLICY labo_prothesistes_update ON labo_prothesistes FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM user_societe_roles
    WHERE user_id = auth.uid() AND societe_id = labo_prothesistes.societe_id
      AND role IN ('owner', 'admin')
  )
);

-- === CATALOGUE_PRODUITS ===
ALTER TABLE catalogue_produits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS catalogue_select ON catalogue_produits;
CREATE POLICY catalogue_select ON catalogue_produits FOR SELECT USING (
  labo_user_has_access(prothesiste_id)
);
DROP POLICY IF EXISTS catalogue_insert ON catalogue_produits;
CREATE POLICY catalogue_insert ON catalogue_produits FOR INSERT WITH CHECK (
  labo_user_has_access(prothesiste_id)
);
DROP POLICY IF EXISTS catalogue_update ON catalogue_produits;
CREATE POLICY catalogue_update ON catalogue_produits FOR UPDATE USING (
  labo_user_has_access(prothesiste_id)
);
DROP POLICY IF EXISTS catalogue_delete ON catalogue_produits;
CREATE POLICY catalogue_delete ON catalogue_produits FOR DELETE USING (
  labo_user_has_access(prothesiste_id)
);

-- === IMPORTS_GRILLES ===
ALTER TABLE imports_grilles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS imports_select ON imports_grilles;
CREATE POLICY imports_select ON imports_grilles FOR SELECT USING (
  labo_user_has_access(prothesiste_id)
);
DROP POLICY IF EXISTS imports_insert ON imports_grilles;
CREATE POLICY imports_insert ON imports_grilles FOR INSERT WITH CHECK (
  labo_user_has_access(prothesiste_id)
);
DROP POLICY IF EXISTS imports_update ON imports_grilles;
CREATE POLICY imports_update ON imports_grilles FOR UPDATE USING (
  labo_user_has_access(prothesiste_id)
);

-- === LIGNES_IMPORT ===
ALTER TABLE lignes_import ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lignes_import_select ON lignes_import;
CREATE POLICY lignes_import_select ON lignes_import FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM imports_grilles ig
    WHERE ig.id = lignes_import.import_id
      AND labo_user_has_access(ig.prothesiste_id)
  )
);
DROP POLICY IF EXISTS lignes_import_all ON lignes_import;
CREATE POLICY lignes_import_all ON lignes_import FOR ALL USING (
  EXISTS (
    SELECT 1 FROM imports_grilles ig
    WHERE ig.id = lignes_import.import_id
      AND labo_user_has_access(ig.prothesiste_id)
  )
);

-- === DENTISTES_CLIENTS ===
ALTER TABLE dentistes_clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dentistes_select ON dentistes_clients;
CREATE POLICY dentistes_select ON dentistes_clients FOR SELECT USING (
  labo_user_has_access(prothesiste_id)
);
DROP POLICY IF EXISTS dentistes_insert ON dentistes_clients;
CREATE POLICY dentistes_insert ON dentistes_clients FOR INSERT WITH CHECK (
  labo_user_has_access(prothesiste_id)
);
DROP POLICY IF EXISTS dentistes_update ON dentistes_clients;
CREATE POLICY dentistes_update ON dentistes_clients FOR UPDATE USING (
  labo_user_has_access(prothesiste_id)
);

-- === BONS_LIVRAISON ===
ALTER TABLE bons_livraison ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bl_select ON bons_livraison;
CREATE POLICY bl_select ON bons_livraison FOR SELECT USING (
  labo_user_has_access(prothesiste_id)
);
DROP POLICY IF EXISTS bl_insert ON bons_livraison;
CREATE POLICY bl_insert ON bons_livraison FOR INSERT WITH CHECK (
  labo_user_has_access(prothesiste_id)
);
DROP POLICY IF EXISTS bl_update ON bons_livraison;
CREATE POLICY bl_update ON bons_livraison FOR UPDATE USING (
  labo_user_has_access(prothesiste_id)
);

-- === LIGNES_BL ===
ALTER TABLE lignes_bl ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lignes_bl_all ON lignes_bl;
CREATE POLICY lignes_bl_all ON lignes_bl FOR ALL USING (
  EXISTS (
    SELECT 1 FROM bons_livraison bl
    WHERE bl.id = lignes_bl.bl_id
      AND labo_user_has_access(bl.prothesiste_id)
  )
);

-- === FACTURES_LABO ===
ALTER TABLE factures_labo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS factures_select ON factures_labo;
CREATE POLICY factures_select ON factures_labo FOR SELECT USING (
  labo_user_has_access(prothesiste_id)
);
DROP POLICY IF EXISTS factures_insert ON factures_labo;
CREATE POLICY factures_insert ON factures_labo FOR INSERT WITH CHECK (
  labo_user_has_access(prothesiste_id)
);
DROP POLICY IF EXISTS factures_update ON factures_labo;
CREATE POLICY factures_update ON factures_labo FOR UPDATE USING (
  labo_user_has_access(prothesiste_id)
);

-- === AVOIRS_LABO ===
ALTER TABLE avoirs_labo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS avoirs_select ON avoirs_labo;
CREATE POLICY avoirs_select ON avoirs_labo FOR SELECT USING (
  labo_user_has_access(prothesiste_id)
);
DROP POLICY IF EXISTS avoirs_insert ON avoirs_labo;
CREATE POLICY avoirs_insert ON avoirs_labo FOR INSERT WITH CHECK (
  labo_user_has_access(prothesiste_id)
);

-- === DECLARATIONS_CONFORMITE ===
ALTER TABLE declarations_conformite ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS declarations_select ON declarations_conformite;
CREATE POLICY declarations_select ON declarations_conformite FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM bons_livraison bl
    WHERE bl.id = declarations_conformite.bl_id
      AND labo_user_has_access(bl.prothesiste_id)
  )
);
DROP POLICY IF EXISTS declarations_insert ON declarations_conformite;
CREATE POLICY declarations_insert ON declarations_conformite FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM bons_livraison bl
    WHERE bl.id = declarations_conformite.bl_id
      AND labo_user_has_access(bl.prothesiste_id)
  )
);

-- === TEINTIERS (lecture seule pour tous les utilisateurs authentifies) ===
ALTER TABLE teintiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS teintiers_select ON teintiers;
CREATE POLICY teintiers_select ON teintiers FOR SELECT USING (
  auth.uid() IS NOT NULL
);
