-- =============================================
-- JADOMI — Module Mon site internet
-- 09_ai_propositions.sql
-- =============================================

ALTER TABLE vitrines_medias ADD COLUMN IF NOT EXISTS ai_propositions jsonb;
ALTER TABLE vitrines_medias ADD COLUMN IF NOT EXISTS observation text;
ALTER TABLE vitrines_medias ADD COLUMN IF NOT EXISTS user_confirmed boolean DEFAULT false;
