-- =============================================
-- JADOMI — Module Mon site internet
-- 14_video_poster.sql — Champs video enrichis
-- =============================================

ALTER TABLE vitrines_medias ADD COLUMN IF NOT EXISTS poster_url text;
ALTER TABLE vitrines_medias ADD COLUMN IF NOT EXISTS video_duration int;
ALTER TABLE vitrines_medias ADD COLUMN IF NOT EXISTS video_width int;
ALTER TABLE vitrines_medias ADD COLUMN IF NOT EXISTS video_height int;
