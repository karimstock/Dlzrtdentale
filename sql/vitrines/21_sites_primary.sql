-- =============================================
-- JADOMI — Migration 21 : Sites primary flag
-- Evite les doublons precision-dentaire-3/4
-- =============================================

ALTER TABLE vitrines_sites
  ADD COLUMN IF NOT EXISTS is_primary boolean DEFAULT false;

-- Marquer le site le plus ancien de chaque societe comme primary
UPDATE vitrines_sites vs SET is_primary = true
WHERE vs.id = (
  SELECT id FROM vitrines_sites
  WHERE societe_id = vs.societe_id
  ORDER BY created_at ASC LIMIT 1
);

CREATE INDEX IF NOT EXISTS idx_sites_societe_primary
  ON vitrines_sites(societe_id, is_primary);
