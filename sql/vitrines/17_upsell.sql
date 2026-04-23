-- =============================================
-- JADOMI — Module Mon site internet
-- 17_upsell.sql — Suggestions upsell + tracking
-- =============================================

CREATE TABLE IF NOT EXISTS upsell_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon text,
  title text NOT NULL,
  description text,
  cta_label text,
  cta_url text,
  module_id text,
  price_display text,
  min_plan text,
  trigger_tab_type text,
  display_position text DEFAULT 'top',
  priority int DEFAULT 0,
  active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS upsell_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  site_id uuid,
  suggestion_id uuid REFERENCES upsell_suggestions(id),
  event text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_upsell_inter_user ON upsell_interactions(user_id, suggestion_id);

-- Seed 10 suggestions
INSERT INTO upsell_suggestions (name, icon, title, description, cta_label, module_id, price_display, min_plan, trigger_tab_type, priority) VALUES
('video_hero', '🎬', 'Passez a la video cinema', 'Une video hero = +80% de temps sur votre site. Creee par IA en 3 min.', 'Creer une video IA', 'video_ia', '29EUR/mois', 'prestige', 'medias', 10),
('photo_enhance', '✨', 'Ameliorez vos photos', 'Filtres cinema qui transforment vos photos en chefs-d''oeuvre.', 'Activer les filtres', 'photo_enhance', '12EUR/mois', 'standard', 'medias', 5),
('cinemagraph', '🎞️', 'Cinemagraph : l''effet OUFFFF', 'Vos meilleures photos en micro-videos animees.', 'Voir la demo', 'cinemagraph', '19EUR/mois', 'prestige', 'medias', 7),
('heygen_video', '🎙️', 'Votre voix clonee en video', 'Video 60 sec de vous. IA HeyGen, lip-sync parfait.', 'Essayer', 'heygen_video', '79EUR/mois', 'signature', 'contenu', 8),
('simulator_smile', '🔮', 'Simulateur de sourire IA', 'Patients voient leur resultat avant le devis. +25% acceptation.', 'Activer', 'smile_simulator', '99EUR/mois', 'signature', 'apercu', 9),
('chatbot_24_7', '🤖', 'Chatbot IA 24/7', 'Repond aux patients jour et nuit. +88 RDV/mois en moyenne.', 'Activer', 'chatbot', '49EUR/mois', 'standard', 'stats', 10),
('vocal_assistant', '📞', 'Standard vocal IA', 'Repond en votre absence. Convertit les appels manques.', 'Activer', 'vocal_assistant', '99EUR/mois', 'prestige', 'stats', 8),
('legal_avocat', '⚖️', 'CGV par avocat partenaire', 'CGV redigees et validees par un avocat. Conformite garantie.', 'Commander', 'legal_avocat', '299EUR pack', 'illimite', 'legal', 10),
('seo_boost', '🔍', 'Boost SEO local', 'Apparaitre avant vos concurrents. Audit + optimisation.', 'Lancer l''audit', 'seo_boost', '39EUR/mois', 'standard', 'stats', 6),
('social_auto', '📱', 'Posts Instagram auto', 'L''IA cree vos posts a partir de vos photos. Publication programmee.', 'Activer', 'social_auto', '29EUR/mois', 'standard', 'medias', 4)
ON CONFLICT DO NOTHING;
