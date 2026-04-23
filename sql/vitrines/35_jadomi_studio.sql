-- ============================================================
-- JADOMI Studio — Migration SQL 35 (Passe 34.2)
-- Hub IA creation publicitaire dentaire
-- Tables : ai_generations_log, studio_library, studio_rate_limits
-- ============================================================

-- Log de toutes les generations IA
CREATE TABLE IF NOT EXISTS ai_generations_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  societe_id uuid REFERENCES societes(id),
  provider text NOT NULL,
  generation_type text,
  quality_tier text,
  cost_usd numeric(10,4),
  cost_coins int,
  prompt_input text,
  prompt_optimized text,
  generation_time_ms int,
  status text,
  error_message text,
  r2_url text,
  thumbnail_url text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_log_user ON ai_generations_log(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_log_provider ON ai_generations_log(provider);
CREATE INDEX IF NOT EXISTS idx_ai_log_date ON ai_generations_log(created_at);

-- Bibliotheque personnelle de creations sauvegardees
CREATE TABLE IF NOT EXISTS studio_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  societe_id uuid,
  source_generation_id uuid REFERENCES ai_generations_log(id) ON DELETE SET NULL,
  name text,
  media_type text,
  r2_url text,
  thumbnail_url text,
  tags text[],
  is_favorite boolean DEFAULT false,
  times_used int DEFAULT 0,
  created_at timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_library_user ON studio_library(user_id);
CREATE INDEX IF NOT EXISTS idx_library_type ON studio_library(media_type);

-- Rate limits par user et type d'action
CREATE TABLE IF NOT EXISTS studio_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action_type text,
  count int DEFAULT 0,
  reset_at timestamptz,
  UNIQUE(user_id, action_type)
);

-- Seed features pricing pour Studio (Passe 34.2)
INSERT INTO features_pricing (id, category, name, description, coins_cost, tier_free_for) VALUES
  ('studio_image_standard', 'studio', 'Image IA Standard', 'DALL-E 3 1024x1024', 30, NULL),
  ('studio_image_banner', 'studio', 'Image Banner Pro', 'DALL-E 3 HD 1792x1024', 50, NULL),
  ('studio_image_luxury', 'studio', 'Image Ultra Realiste', 'DALL-E 3 HD premium', 100, NULL),
  ('studio_video_4s', 'studio', 'Video IA 4 sec', 'Sora 2 720p', 40, NULL),
  ('studio_video_8s', 'studio', 'Video IA 8 sec', 'Sora 2 720p', 80, NULL),
  ('studio_video_12s', 'studio', 'Video IA 12 sec', 'Sora 2 720p', 120, NULL),
  ('studio_video_pro', 'studio', 'Video Pro HD', 'Sora 2 Pro 1080p', 300, NULL),
  ('studio_voice_basic', 'studio', 'Voix Standard', 'OpenAI TTS', 10, NULL),
  ('studio_voice_premium', 'studio', 'Voix Premium', 'ElevenLabs humaine', 30, NULL),
  ('studio_avatar', 'studio', 'Avatar IA Parlant', 'HeyGen avatar dentiste', 200, NULL),
  ('studio_enhance_prompt', 'studio', 'Optimisation prompt', 'Claude optimise le prompt', 2, ARRAY['premium', 'elite'])
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
