-- =============================================
-- JADOMI — Module Mon site internet
-- 12_file_hash.sql — Protection doublons upload
-- =============================================

ALTER TABLE vitrines_medias ADD COLUMN IF NOT EXISTS file_hash text;
CREATE INDEX IF NOT EXISTS idx_medias_site_hash ON vitrines_medias(site_id, file_hash);
