-- =============================================
-- JADOMI — Passe 67 : Community Forum
-- Tables: forum_categories, forum_topics, forum_replies, forum_upvotes
-- =============================================

-- 1) Categories
CREATE TABLE IF NOT EXISTS forum_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  icon TEXT DEFAULT '',
  color TEXT DEFAULT '#c9a961',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed 8 categories
INSERT INTO forum_categories (name, slug, description, icon, color, sort_order) VALUES
  ('Général',                'general',              'Discussions générales entre professionnels JADOMI',                              'chat',       '#6366f1', 1),
  ('Stock & Commandes',      'stock-commandes',      'Questions sur la gestion de stock, commandes fournisseurs et inventaires',       'package',    '#f59e0b', 2),
  ('Sites Vitrines',         'sites-vitrines',       'Aide et astuces pour vos sites vitrines JADOMI',                                'globe',      '#10b981', 3),
  ('Facturation',            'facturation',          'Facturation, devis, Factur-X et comptabilité',                                  'file-text',  '#3b82f6', 4),
  ('Signature Électronique', 'signature-electronique','Usage de la signature électronique et conformité juridique',                    'pen-tool',   '#8b5cf6', 5),
  ('Timeline Patient',       'timeline-patient',     'Suivi patient, timeline, dossiers et parcours de soins',                        'activity',   '#ec4899', 6),
  ('Astuces Métier',         'astuces-metier',       'Partagez vos astuces et bonnes pratiques professionnelles',                     'lightbulb',  '#f97316', 7),
  ('Suggestions & Idées',    'suggestions-idees',    'Proposez des améliorations et votez pour les idées de la communauté',            'bulb',       '#c9a961', 8)
ON CONFLICT (slug) DO NOTHING;

-- 2) Topics
CREATE TABLE IF NOT EXISTS forum_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id INTEGER NOT NULL REFERENCES forum_categories(id) ON DELETE CASCADE,
  author_societe_id UUID,
  author_email TEXT NOT NULL,
  author_display_name TEXT NOT NULL DEFAULT 'Professionnel',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT FALSE,
  is_locked BOOLEAN DEFAULT FALSE,
  is_solved BOOLEAN DEFAULT FALSE,
  views_count INTEGER DEFAULT 0,
  replies_count INTEGER DEFAULT 0,
  last_reply_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forum_topics_category ON forum_topics(category_id);
CREATE INDEX IF NOT EXISTS idx_forum_topics_author ON forum_topics(author_societe_id);
CREATE INDEX IF NOT EXISTS idx_forum_topics_created ON forum_topics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_topics_solved ON forum_topics(is_solved);
CREATE INDEX IF NOT EXISTS idx_forum_topics_last_reply ON forum_topics(last_reply_at DESC);

-- 3) Replies
CREATE TABLE IF NOT EXISTS forum_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES forum_topics(id) ON DELETE CASCADE,
  author_societe_id UUID,
  author_email TEXT NOT NULL,
  author_display_name TEXT NOT NULL DEFAULT 'Professionnel',
  content TEXT NOT NULL,
  is_solution BOOLEAN DEFAULT FALSE,
  upvotes_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forum_replies_topic ON forum_replies(topic_id);
CREATE INDEX IF NOT EXISTS idx_forum_replies_created ON forum_replies(created_at);

-- 4) Upvotes
CREATE TABLE IF NOT EXISTS forum_upvotes (
  id SERIAL PRIMARY KEY,
  reply_id UUID NOT NULL REFERENCES forum_replies(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(reply_id, user_email)
);

CREATE INDEX IF NOT EXISTS idx_forum_upvotes_reply ON forum_upvotes(reply_id);

-- 5) RLS Policies
ALTER TABLE forum_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_upvotes ENABLE ROW LEVEL SECURITY;

-- Categories: read all for authenticated
CREATE POLICY forum_categories_read ON forum_categories FOR SELECT TO authenticated USING (true);

-- Topics: read all, insert/update/delete own
CREATE POLICY forum_topics_read ON forum_topics FOR SELECT TO authenticated USING (true);
CREATE POLICY forum_topics_insert ON forum_topics FOR INSERT TO authenticated WITH CHECK (author_email = auth.email());
CREATE POLICY forum_topics_update ON forum_topics FOR UPDATE TO authenticated USING (author_email = auth.email());
CREATE POLICY forum_topics_delete ON forum_topics FOR DELETE TO authenticated USING (author_email = auth.email());

-- Replies: read all, insert/update/delete own
CREATE POLICY forum_replies_read ON forum_replies FOR SELECT TO authenticated USING (true);
CREATE POLICY forum_replies_insert ON forum_replies FOR INSERT TO authenticated WITH CHECK (author_email = auth.email());
CREATE POLICY forum_replies_update ON forum_replies FOR UPDATE TO authenticated USING (author_email = auth.email());
CREATE POLICY forum_replies_delete ON forum_replies FOR DELETE TO authenticated USING (author_email = auth.email());

-- Upvotes: read all, insert/delete own
CREATE POLICY forum_upvotes_read ON forum_upvotes FOR SELECT TO authenticated USING (true);
CREATE POLICY forum_upvotes_insert ON forum_upvotes FOR INSERT TO authenticated WITH CHECK (user_email = auth.email());
CREATE POLICY forum_upvotes_delete ON forum_upvotes FOR DELETE TO authenticated USING (user_email = auth.email());

-- =============================================
-- Passe 67b : Competitive improvements
-- Tags, reputation, related topics, notifications
-- =============================================

-- 6) Add tags column to forum_topics (jsonb array, max 3 tags)
ALTER TABLE forum_topics ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS idx_forum_topics_tags ON forum_topics USING gin(tags);

-- 7) Add author_user_id to forum_topics and forum_replies for notifications
ALTER TABLE forum_topics ADD COLUMN IF NOT EXISTS author_user_id UUID;
ALTER TABLE forum_replies ADD COLUMN IF NOT EXISTS author_user_id UUID;

-- 8) Add 'forum_reply' and 'forum_solution' to notifications type constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'retour_accepte','retour_refuse','retour_demande',
    'produit_vendu','produit_achete',
    'stock_critique','stock_faible',
    'facture_payee','facture_envoyee','relance_loyer',
    'reclamation_repondue','nouveau_message','autre',
    'gpo_accepted','gpo_counter','gpo_failed',
    'forum_reply','forum_solution'
  ));
