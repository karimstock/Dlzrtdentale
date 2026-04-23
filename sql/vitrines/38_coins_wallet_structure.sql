-- ============================================================
-- JADOMI Coins Wallet — Structure SQL preparatoire (Passe 38)
-- Systeme de tokens type PlayStation/Steam Wallet
-- Cree en Passe 34 comme squelette, implementation complete Passe 38
-- ============================================================

-- Wallet de coins par utilisateur
CREATE TABLE IF NOT EXISTS user_coins_wallet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  balance int DEFAULT 0,                      -- solde courant en coins
  total_earned int DEFAULT 0,                 -- total coins gagnes (achats + bonus + quetes)
  total_spent int DEFAULT 0,                  -- total coins depenses
  level text DEFAULT 'bronze',                -- bronze, argent, or, platine, diamant
  level_xp int DEFAULT 0,                     -- XP pour progression niveau
  daily_bonus_last_claimed timestamptz,       -- dernier bonus quotidien
  streak_days int DEFAULT 0,                  -- jours consecutifs de connexion
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Historique transactions coins
CREATE TABLE IF NOT EXISTS coins_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount int NOT NULL,                        -- positif = credit, negatif = debit
  balance_after int NOT NULL,                 -- solde apres transaction
  type text NOT NULL,                         -- 'purchase', 'subscription_bonus', 'daily_bonus',
                                              -- 'quest_reward', 'spend', 'cashback', 'refund', 'admin'
  description text,                           -- description lisible
  feature_id text,                            -- ref vers features_pricing.id si depense
  stripe_payment_id text,                     -- ref Stripe si achat
  metadata jsonb DEFAULT '{}',                -- donnees supplementaires
  created_at timestamptz DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coins_tx_user ON coins_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_coins_tx_created ON coins_transactions(created_at);

-- Grille tarifaire features en coins
CREATE TABLE IF NOT EXISTS features_pricing (
  id text PRIMARY KEY,                        -- slug unique (ex: 'ads_ai_text', 'dalle_logo')
  category text NOT NULL,                     -- 'ads', 'site', 'ia', 'timeline', 'stock', etc.
  name text NOT NULL,                         -- nom affiche
  description text,
  coins_cost int NOT NULL DEFAULT 0,          -- 0 = gratuit
  tier_free_for text[],                       -- tiers abonnement ou c'est inclus (ex: ARRAY['elite'])
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT NOW()
);

-- Packs d'achat coins (produits Stripe)
CREATE TABLE IF NOT EXISTS coins_packs (
  id text PRIMARY KEY,                        -- 'pack_100', 'pack_500', etc.
  coins_amount int NOT NULL,
  price_eur numeric(10,2) NOT NULL,
  bonus_coins int DEFAULT 0,                  -- coins bonus (ex: pack 1000 = 1000 + 50 bonus)
  stripe_price_id text,
  is_active boolean DEFAULT true
);

-- Quetes hebdomadaires (gamification)
CREATE TABLE IF NOT EXISTS coins_quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  quest_type text NOT NULL,                   -- 'weekly', 'achievement', 'milestone'
  condition_type text,                        -- 'feature_used', 'login_streak', 'spend_total', etc.
  condition_value int,                        -- seuil a atteindre
  reward_coins int NOT NULL,
  reward_xp int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT NOW()
);

-- Progression quetes par utilisateur
CREATE TABLE IF NOT EXISTS user_quest_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quest_id uuid REFERENCES coins_quests(id) ON DELETE CASCADE,
  progress int DEFAULT 0,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz DEFAULT NOW(),
  UNIQUE(user_id, quest_id)
);

-- ============================================================
-- Seed features pricing pour JADOMI Ads (Passe 34)
-- ============================================================
INSERT INTO features_pricing (id, category, name, description, coins_cost, tier_free_for) VALUES
  ('ads_ai_text', 'ads', 'Generation IA texte pub', 'Claude genere 3 variantes titre + description', 2, ARRAY['elite']),
  ('ads_template', 'ads', 'Template pub pre-fait', 'Utiliser un template de la bibliotheque', 5, ARRAY['premium', 'elite']),
  ('ads_ai_visual', 'ads', 'Generation visuel DALL-E', 'Image pub generee par IA', 20, ARRAY['elite']),
  ('ads_video_auto', 'ads', 'Video publicitaire auto', 'Montage video automatique 15-30s', 50, ARRAY['elite']),
  ('ads_avatar_ia', 'ads', 'Avatar IA presentateur', 'Avatar Synthesia pour pub video', 200, NULL),
  ('ads_ai_analyze', 'ads', 'Analyse IA creatif', 'Claude Vision analyse et note la pub', 1, ARRAY['premium', 'elite'])
ON CONFLICT (id) DO NOTHING;

-- Seed packs d'achat
INSERT INTO coins_packs (id, coins_amount, price_eur, bonus_coins) VALUES
  ('pack_100', 100, 9.99, 0),
  ('pack_500', 500, 39.99, 25),
  ('pack_1000', 1000, 69.99, 100),
  ('pack_2500', 2500, 149.99, 375),
  ('pack_10000', 10000, 499.99, 2000)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
