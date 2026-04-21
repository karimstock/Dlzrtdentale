-- =============================================
-- JADOMI — Labo integre pour cabinets dentaires
-- Permet a un cabinet d'activer son propre labo
-- =============================================

ALTER TABLE societes
ADD COLUMN IF NOT EXISTS has_labo_integre boolean DEFAULT false;

COMMENT ON COLUMN societes.has_labo_integre IS 'Si true, le cabinet dentaire possede son propre labo integre';
