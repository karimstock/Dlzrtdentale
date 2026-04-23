-- =============================================
-- JADOMI — Module Mon site internet
-- 05_add_media_type.sql — Support photo + video
-- =============================================

ALTER TABLE vitrines_medias ADD COLUMN IF NOT EXISTS media_type text DEFAULT 'photo';
-- values: 'photo' | 'video'
