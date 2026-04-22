-- =============================================
-- JADOMI — Migration 26 — Chatbot IA client
-- Passe 24 (22-23 avril 2026)
-- =============================================

-- Configuration chatbot par site
CREATE TABLE IF NOT EXISTS vitrine_chatbot_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES vitrines_sites(id) ON DELETE CASCADE,
  enabled boolean DEFAULT true,
  greeting text DEFAULT 'Bonjour ! Comment puis-je vous aider ?',
  tone text DEFAULT 'professionnel' CHECK (tone IN ('professionnel','chaleureux','formel')),
  topics jsonb DEFAULT '[]'::jsonb,
  faq jsonb DEFAULT '[]'::jsonb,
  max_daily_messages int DEFAULT 50,
  redirect_to_contact_after int DEFAULT 5,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(site_id)
);

-- Conversations chatbot
CREATE TABLE IF NOT EXISTS vitrine_chatbot_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES vitrines_sites(id) ON DELETE CASCADE,
  visitor_session_id text NOT NULL,
  messages jsonb DEFAULT '[]'::jsonb,
  resolved boolean DEFAULT false,
  escalated_to_contact boolean DEFAULT false,
  visitor_email text,
  visitor_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_convos_site ON vitrine_chatbot_conversations(site_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_convos_session ON vitrine_chatbot_conversations(visitor_session_id);
