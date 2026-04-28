-- =============================================
-- FIX: Index en conflit sur avocat_coffre_audit
-- Les noms idx_audit_created et idx_audit_user sont trop generiques
-- et risquent de confliter avec d'autres tables ayant des index similaires.
-- On les renomme avec un prefixe specifique a la table.
-- Date: 2026-04-28
-- =============================================

-- Supprimer les anciens index
DROP INDEX IF EXISTS idx_audit_created;
DROP INDEX IF EXISTS idx_audit_user;

-- Recreer avec des noms specifiques a la table
CREATE INDEX IF NOT EXISTS idx_avocat_coffre_audit_created
  ON avocat_coffre_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_avocat_coffre_audit_user
  ON avocat_coffre_audit (user_id);
