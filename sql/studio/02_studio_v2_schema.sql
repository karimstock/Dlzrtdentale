-- =============================================
-- JADOMI Studio V2 — Schéma complet
-- Mémoire marque + Produits + Assets + Templates
-- + Campagnes + Générations + Embeddings
-- GRANT obligatoire (règle Supabase mai 2026)
-- =============================================

-- ═══════════════════════════════════════
-- 1. MÉMOIRE ENTREPRISE
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS studio_entreprises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID,
  user_id UUID,
  nom TEXT NOT NULL,
  site_internet TEXT,
  domaine_medical TEXT,
  specialite TEXT,
  logo_url TEXT,
  couleurs JSONB DEFAULT '{}',
  typographies JSONB DEFAULT '{}',
  ton TEXT DEFAULT 'professionnel',
  style_visuel TEXT DEFAULT 'moderne',
  slogan TEXT,
  description TEXT,
  pays TEXT DEFAULT 'FR',
  langues TEXT[] DEFAULT ARRAY['fr'],
  reseaux_sociaux JSONB DEFAULT '{}',
  preferences JSONB DEFAULT '{}',
  site_analyse JSONB,
  rgpd_consent BOOLEAN DEFAULT false,
  rgpd_consent_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT ON studio_entreprises TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON studio_entreprises TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON studio_entreprises TO service_role;
ALTER TABLE studio_entreprises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_entreprises" ON studio_entreprises
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "service_role_all_entreprises" ON studio_entreprises
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_studio_entreprises_user ON studio_entreprises(user_id);
CREATE INDEX IF NOT EXISTS idx_studio_entreprises_societe ON studio_entreprises(societe_id);

-- ═══════════════════════════════════════
-- 2. PRODUITS
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS studio_produits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES studio_entreprises(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  categorie TEXT,
  description TEXT,
  arguments_commerciaux TEXT[] DEFAULT '{}',
  benefices_cliniques TEXT[] DEFAULT '{}',
  cible TEXT,
  prix_indicatif NUMERIC(10,2),
  fiche_technique_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT ON studio_produits TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON studio_produits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON studio_produits TO service_role;
ALTER TABLE studio_produits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_produits" ON studio_produits
  FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT id FROM studio_entreprises WHERE user_id = auth.uid()))
  WITH CHECK (entreprise_id IN (SELECT id FROM studio_entreprises WHERE user_id = auth.uid()));

CREATE POLICY "service_role_all_produits" ON studio_produits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_studio_produits_entreprise ON studio_produits(entreprise_id);

-- ═══════════════════════════════════════
-- 3. ASSETS VERROUILLÉS
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS studio_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES studio_entreprises(id) ON DELETE CASCADE,
  produit_id UUID REFERENCES studio_produits(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  nom TEXT,
  fichier_url TEXT NOT NULL,
  fichier_original_url TEXT,
  format TEXT,
  largeur INT,
  hauteur INT,
  taille_octets BIGINT,
  transparent BOOLEAN DEFAULT false,
  version INT DEFAULT 1,
  statut TEXT DEFAULT 'brouillon',
  tags TEXT[] DEFAULT '{}',
  contexte TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  valide_at TIMESTAMPTZ,
  valide_par UUID
);

GRANT SELECT ON studio_assets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON studio_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON studio_assets TO service_role;
ALTER TABLE studio_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_assets" ON studio_assets
  FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT id FROM studio_entreprises WHERE user_id = auth.uid()))
  WITH CHECK (entreprise_id IN (SELECT id FROM studio_entreprises WHERE user_id = auth.uid()));

CREATE POLICY "anon_read_validated_assets" ON studio_assets
  FOR SELECT TO anon
  USING (statut = 'valide');

CREATE POLICY "service_role_all_assets" ON studio_assets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_studio_assets_entreprise ON studio_assets(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_studio_assets_produit ON studio_assets(produit_id);
CREATE INDEX IF NOT EXISTS idx_studio_assets_statut ON studio_assets(statut);

-- ═══════════════════════════════════════
-- 4. TEMPLATES PREMIUM
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS studio_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categorie TEXT NOT NULL,
  sous_categorie TEXT,
  nom TEXT NOT NULL,
  type TEXT NOT NULL,
  format TEXT,
  usage TEXT,
  preview_url TEXT,
  source_type TEXT NOT NULL,
  source_data JSONB DEFAULT '{}',
  variables JSONB DEFAULT '[]',
  specialite_medicale TEXT[] DEFAULT '{}',
  style TEXT DEFAULT 'moderne',
  niveau TEXT DEFAULT 'standard',
  langue TEXT DEFAULT 'fr',
  actif BOOLEAN DEFAULT true,
  ordre INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT ON studio_templates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON studio_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON studio_templates TO service_role;
ALTER TABLE studio_templates ENABLE ROW LEVEL SECURITY;

-- Templates lisibles par tous (bibliothèque publique)
CREATE POLICY "anyone_read_templates" ON studio_templates
  FOR SELECT TO anon, authenticated
  USING (actif = true);

-- Seul service_role peut modifier les templates
CREATE POLICY "service_role_manage_templates" ON studio_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_studio_templates_categorie ON studio_templates(categorie);
CREATE INDEX IF NOT EXISTS idx_studio_templates_type ON studio_templates(type);
CREATE INDEX IF NOT EXISTS idx_studio_templates_style ON studio_templates(style);
CREATE INDEX IF NOT EXISTS idx_studio_templates_actif ON studio_templates(actif);

-- ═══════════════════════════════════════
-- 5. CAMPAGNES
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS studio_campagnes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES studio_entreprises(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  objectif TEXT,
  nom TEXT,
  date_evenement DATE,
  produits_ids UUID[] DEFAULT '{}',
  templates_ids UUID[] DEFAULT '{}',
  statut TEXT DEFAULT 'brouillon',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT ON studio_campagnes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON studio_campagnes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON studio_campagnes TO service_role;
ALTER TABLE studio_campagnes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_campagnes" ON studio_campagnes
  FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT id FROM studio_entreprises WHERE user_id = auth.uid()))
  WITH CHECK (entreprise_id IN (SELECT id FROM studio_entreprises WHERE user_id = auth.uid()));

CREATE POLICY "service_role_all_campagnes" ON studio_campagnes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_studio_campagnes_entreprise ON studio_campagnes(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_studio_campagnes_type ON studio_campagnes(type);

-- ═══════════════════════════════════════
-- 6. GÉNÉRATIONS (historique)
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS studio_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campagne_id UUID REFERENCES studio_campagnes(id) ON DELETE SET NULL,
  entreprise_id UUID NOT NULL REFERENCES studio_entreprises(id) ON DELETE CASCADE,
  template_id UUID REFERENCES studio_templates(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  provider TEXT,
  prompt TEXT,
  variables JSONB DEFAULT '{}',
  resultat_url TEXT,
  cout_usd NUMERIC(10,4) DEFAULT 0,
  cout_coins INT DEFAULT 0,
  duree_ms INT,
  statut TEXT DEFAULT 'pending',
  feedback TEXT,
  feedback_note TEXT,
  score_provider NUMERIC(4,2),
  score_alternatives JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT ON studio_generations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON studio_generations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON studio_generations TO service_role;
ALTER TABLE studio_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_generations" ON studio_generations
  FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT id FROM studio_entreprises WHERE user_id = auth.uid()))
  WITH CHECK (entreprise_id IN (SELECT id FROM studio_entreprises WHERE user_id = auth.uid()));

CREATE POLICY "service_role_all_generations" ON studio_generations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_studio_generations_entreprise ON studio_generations(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_studio_generations_campagne ON studio_generations(campagne_id);
CREATE INDEX IF NOT EXISTS idx_studio_generations_statut ON studio_generations(statut);
CREATE INDEX IF NOT EXISTS idx_studio_generations_provider ON studio_generations(provider);

-- ═══════════════════════════════════════
-- 7. MÉMOIRE VECTORIELLE (pgvector)
-- ═══════════════════════════════════════

-- Activer l'extension pgvector (nécessite activation dans Supabase Dashboard)
-- CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS studio_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES studio_entreprises(id) ON DELETE CASCADE,
  source_type TEXT,
  source_id UUID,
  contenu TEXT NOT NULL,
  -- embedding VECTOR(1536),  -- Décommenter quand pgvector activé
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT ON studio_embeddings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON studio_embeddings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON studio_embeddings TO service_role;
ALTER TABLE studio_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_embeddings" ON studio_embeddings
  FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT id FROM studio_entreprises WHERE user_id = auth.uid()))
  WITH CHECK (entreprise_id IN (SELECT id FROM studio_entreprises WHERE user_id = auth.uid()));

CREATE POLICY "service_role_all_embeddings" ON studio_embeddings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_studio_embeddings_entreprise ON studio_embeddings(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_studio_embeddings_source ON studio_embeddings(source_type, source_id);
-- CREATE INDEX idx_embeddings_vector ON studio_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ═══════════════════════════════════════
-- SEED — Templates de base (20 templates MVP)
-- ═══════════════════════════════════════

INSERT INTO studio_templates (categorie, sous_categorie, nom, type, format, usage, source_type, variables, specialite_medicale, style, niveau) VALUES
-- Formation (5)
('formation', 'formation_generale', 'Flyer formation dentaire', 'flyer', 'A4', 'impression', 'html', '[{"key":"titre","label":"Titre formation","type":"text"},{"key":"date","label":"Date","type":"date"},{"key":"lieu","label":"Lieu","type":"text"},{"key":"formateur","label":"Formateur","type":"text"},{"key":"prix","label":"Prix","type":"text"},{"key":"programme","label":"Programme","type":"textarea"}]', '{dentaire,formation}', 'clinique', 'standard'),
('formation', 'formation_generale', 'Post LinkedIn formation', 'post', '1200x1200', 'linkedin', 'html', '[{"key":"titre","label":"Titre","type":"text"},{"key":"date","label":"Date","type":"text"},{"key":"accroche","label":"Accroche","type":"text"}]', '{dentaire,formation}', 'moderne', 'standard'),
('formation', 'formation_generale', 'Post Instagram formation', 'post', '1080x1080', 'instagram', 'html', '[{"key":"titre","label":"Titre","type":"text"},{"key":"date","label":"Date","type":"text"}]', '{dentaire,formation}', 'moderne', 'standard'),
('formation', 'formation_generale', 'Vidéo teaser formation', 'video', '1920x1080', 'youtube', 'remotion', '[{"key":"titre","label":"Titre","type":"text"},{"key":"formateur","label":"Formateur","type":"text"},{"key":"date","label":"Date","type":"text"}]', '{dentaire,formation}', 'premium', 'premium'),
('formation', 'formation_generale', 'Landing page formation', 'landing', '1920x1080', 'web', 'html', '[{"key":"titre","label":"Titre","type":"text"},{"key":"description","label":"Description","type":"textarea"},{"key":"date","label":"Date","type":"date"},{"key":"prix","label":"Prix","type":"text"},{"key":"programme","label":"Programme","type":"textarea"}]', '{dentaire,formation}', 'moderne', 'premium'),

-- Produit (5)
('produit', 'lancement', 'Fiche produit premium', 'fiche', 'A4', 'impression', 'html', '[{"key":"nom_produit","label":"Nom du produit","type":"text"},{"key":"description","label":"Description","type":"textarea"},{"key":"prix","label":"Prix","type":"text"},{"key":"avantages","label":"Avantages","type":"textarea"},{"key":"specs","label":"Spécifications","type":"textarea"}]', '{dentaire,revendeur}', 'clinique', 'standard'),
('produit', 'lancement', 'Bannière web produit', 'banniere', '1920x600', 'web', 'html', '[{"key":"nom_produit","label":"Nom","type":"text"},{"key":"accroche","label":"Accroche","type":"text"},{"key":"prix","label":"Prix","type":"text"}]', '{dentaire,revendeur}', 'moderne', 'standard'),
('produit', 'lancement', 'Post réseaux sociaux produit', 'post', '1080x1080', 'instagram', 'html', '[{"key":"nom_produit","label":"Nom","type":"text"},{"key":"prix","label":"Prix","type":"text"},{"key":"accroche","label":"Accroche","type":"text"}]', '{dentaire,revendeur}', 'moderne', 'standard'),
('produit', 'catalogue', 'Page catalogue produit', 'catalogue', 'A4', 'impression', 'html', '[{"key":"nom_produit","label":"Nom","type":"text"},{"key":"ref","label":"Référence","type":"text"},{"key":"description","label":"Description","type":"textarea"},{"key":"prix","label":"Prix","type":"text"},{"key":"specs","label":"Spécifications","type":"textarea"}]', '{dentaire,revendeur}', 'clinique', 'premium'),
('produit', 'lancement', 'Vidéo produit courte', 'video', '1080x1920', 'instagram', 'remotion', '[{"key":"nom_produit","label":"Nom","type":"text"},{"key":"accroche","label":"Accroche","type":"text"},{"key":"prix","label":"Prix","type":"text"}]', '{dentaire,revendeur}', 'premium', 'premium'),

-- Congrès (4)
('congres', 'ADF', 'Bannière stand congrès', 'banniere', '2400x1200', 'impression', 'html', '[{"key":"nom_evenement","label":"Événement","type":"text"},{"key":"stand","label":"N° stand","type":"text"},{"key":"dates","label":"Dates","type":"text"}]', '{dentaire}', 'premium', 'premium'),
('congres', 'general', 'Post countdown congrès', 'post', '1080x1080', 'instagram', 'html', '[{"key":"nom_evenement","label":"Événement","type":"text"},{"key":"jours_restants","label":"Jours restants","type":"text"},{"key":"stand","label":"N° stand","type":"text"}]', '{dentaire}', 'moderne', 'standard'),
('congres', 'general', 'Invitation VIP congrès', 'email', '600x800', 'email', 'html', '[{"key":"nom_evenement","label":"Événement","type":"text"},{"key":"dates","label":"Dates","type":"text"},{"key":"lieu","label":"Lieu","type":"text"},{"key":"message","label":"Message","type":"textarea"}]', '{dentaire}', 'luxe', 'premium'),
('congres', 'general', 'Badge équipe congrès', 'badge', '86x54mm', 'impression', 'html', '[{"key":"prenom","label":"Prénom","type":"text"},{"key":"nom","label":"Nom","type":"text"},{"key":"titre","label":"Titre","type":"text"}]', '{dentaire}', 'clinique', 'standard'),

-- Patient (3)
('patient', 'sensibilisation', 'Affiche salle d''attente brossage', 'affiche', 'A3', 'impression', 'html', '[{"key":"cabinet","label":"Nom du cabinet","type":"text"}]', '{dentaire}', 'pediatrique', 'standard'),
('patient', 'sensibilisation', 'Post carie prévention', 'post', '1080x1080', 'instagram', 'html', '[{"key":"cabinet","label":"Cabinet","type":"text"},{"key":"telephone","label":"Téléphone","type":"text"}]', '{dentaire}', 'moderne', 'standard'),
('patient', 'urgence', 'Affiche urgences dentaires', 'affiche', 'A4', 'impression', 'html', '[{"key":"cabinet","label":"Cabinet","type":"text"},{"key":"telephone","label":"Téléphone d''urgence","type":"text"}]', '{dentaire}', 'clinique', 'standard'),

-- Réseaux sociaux (3)
('reseaux', 'general', 'Carrousel Instagram 5 slides', 'carrousel', '1080x1080', 'instagram', 'html', '[{"key":"titre","label":"Titre","type":"text"},{"key":"slides","label":"Contenu slides (1 par ligne)","type":"textarea"}]', '{dentaire}', 'moderne', 'standard'),
('reseaux', 'general', 'Story Instagram promotionnelle', 'story', '1080x1920', 'instagram', 'html', '[{"key":"accroche","label":"Accroche","type":"text"},{"key":"offre","label":"Offre","type":"text"},{"key":"cta","label":"CTA","type":"text"}]', '{dentaire,revendeur}', 'moderne', 'standard'),
('reseaux', 'general', 'Post LinkedIn professionnel', 'post', '1200x628', 'linkedin', 'html', '[{"key":"titre","label":"Titre","type":"text"},{"key":"texte","label":"Texte","type":"textarea"}]', '{dentaire,revendeur}', 'clinique', 'standard')

ON CONFLICT DO NOTHING;
