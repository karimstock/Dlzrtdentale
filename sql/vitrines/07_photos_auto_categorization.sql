-- =============================================
-- JADOMI — Module Mon site internet
-- 07_photos_auto_categorization.sql
-- =============================================

ALTER TABLE vitrines_medias ADD COLUMN IF NOT EXISTS auto_categorized boolean DEFAULT false;
ALTER TABLE vitrines_medias ADD COLUMN IF NOT EXISTS ai_confidence numeric;
ALTER TABLE vitrines_medias ADD COLUMN IF NOT EXISTS original_dragged_category text;
ALTER TABLE vitrines_medias ADD COLUMN IF NOT EXISTS requires_consent boolean DEFAULT false;
