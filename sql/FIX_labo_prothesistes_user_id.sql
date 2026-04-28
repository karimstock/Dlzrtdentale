-- =============================================
-- FIX : Ajouter user_id a labo_prothesistes
-- A executer AVANT MIGRATION_COMPLETE_65.sql
-- Date : 28 avril 2026
-- =============================================

-- 1. Ajouter la colonne user_id
ALTER TABLE labo_prothesistes
  ADD COLUMN IF NOT EXISTS user_id UUID;

-- 2. Remplir user_id depuis societes.owner_id
UPDATE labo_prothesistes lp
SET user_id = s.owner_id
FROM societes s
WHERE lp.societe_id = s.id
  AND lp.user_id IS NULL;

-- 3. Index pour les RLS policies
CREATE INDEX IF NOT EXISTS idx_labo_prothesistes_user_id
  ON labo_prothesistes(user_id);

-- Verification
SELECT id, raison_sociale, societe_id, user_id FROM labo_prothesistes;
