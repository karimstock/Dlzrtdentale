-- =============================================
-- Migration 18 : Système de thèmes couleurs
-- =============================================

-- Table des thèmes
CREATE TABLE IF NOT EXISTS vitrines_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  metier_category text,  -- 'sante', 'droit', 'beaute', 'restauration', 'commerce', 'all'
  professions text[],    -- ['dentiste','medecin'] ou ['*'] pour tous

  -- Couleurs principales
  color_primary text NOT NULL,
  color_primary_dark text,
  color_secondary text,
  color_text text NOT NULL,
  color_text_muted text,
  color_background text NOT NULL,
  color_surface text,
  color_border text,
  color_footer_bg text,
  color_footer_text text,

  -- Typographie associée
  font_heading text,
  font_body text,

  -- Metadata
  premium boolean DEFAULT false,
  min_plan text,
  preview_image_url text,
  sort_order int DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Ajouter theme_slug à vitrines_sites
ALTER TABLE vitrines_sites
  ADD COLUMN IF NOT EXISTS theme_slug text DEFAULT 'ivory_gold';

CREATE INDEX IF NOT EXISTS idx_themes_metier ON vitrines_themes(metier_category);
CREATE INDEX IF NOT EXISTS idx_themes_active ON vitrines_themes(active, sort_order);

-- =============================================
-- Seed 12 thèmes premium
-- =============================================
INSERT INTO vitrines_themes (slug, name, description, metier_category, professions,
  color_primary, color_primary_dark, color_secondary, color_text, color_text_muted,
  color_background, color_surface, color_border, color_footer_bg, color_footer_text,
  font_heading, font_body, premium, min_plan, sort_order) VALUES

-- 1. IVORY GOLD (luxe dentiste/médical — défaut)
('ivory_gold', 'Ivoire & Or', 'Luxe minéral — marbre et doré chaud', 'sante',
  ARRAY['dentiste','medecin','chirurgien','orthodontiste','kine','osteopathe'],
  '#c9a961', '#a8893f', '#16213e', '#1a1a1a', '#6b6b6b',
  '#faf8f5', '#ffffff', '#e8e2d9', '#1a1a2e', '#d4c5a8',
  'Playfair Display', 'DM Sans', false, 'essentiel', 10),

-- 2. MIDNIGHT EMERALD (luxe sombre, avocat/notaire)
('midnight_emerald', 'Nuit Émeraude', 'Prestige feutré — vert profond et nuit', 'droit',
  ARRAY['avocat','notaire','expert_comptable','conseiller_financier'],
  '#047857', '#065f46', '#1e293b', '#f9fafb', '#d1d5db',
  '#0a0e1a', '#111827', '#1f2937', '#020617', '#9ca3af',
  'Cormorant Garamond', 'Inter', false, 'essentiel', 20),

-- 3. BORDEAUX VELVET (rouge profond, avocats)
('bordeaux_velvet', 'Bordeaux Velours', 'Gravité classique — rouge bordeaux et bronze', 'droit',
  ARRAY['avocat','notaire','huissier'],
  '#7f1d1d', '#5c1414', '#3d2418', '#1c1917', '#78716c',
  '#fef7ed', '#ffffff', '#e7e5e4', '#1c1917', '#d6d3d1',
  'Cormorant Garamond', 'Inter', false, 'essentiel', 30),

-- 4. CLINICAL WHITE (blanc clinique, médical moderne)
('clinical_white', 'Blanc Clinique', 'Pureté médicale — blanc et bleu acier', 'sante',
  ARRAY['medecin','dentiste','kine','podologue','orthoptiste','sage_femme'],
  '#0369a1', '#075985', '#1e293b', '#0f172a', '#475569',
  '#ffffff', '#f8fafc', '#e2e8f0', '#0f172a', '#cbd5e1',
  'Inter', 'Inter', false, 'essentiel', 40),

-- 5. TERRACOTTA EARTH (chaleur méditerranéenne)
('terracotta_earth', 'Terracotta', 'Chaleur méditerranéenne — terre cuite et sable', 'beaute',
  ARRAY['coiffeur','estheticienne','barbier','masseur','naturopathe','yoga'],
  '#b45309', '#92400e', '#451a03', '#1c1917', '#57534e',
  '#fef3c7', '#fffbeb', '#fde68a', '#451a03', '#fde68a',
  'Syne', 'DM Sans', false, 'essentiel', 50),

-- 6. SAGE FOREST (vert sauge, nature/bien-être)
('sage_forest', 'Sauge & Forêt', 'Nature apaisante — vert sauge et crème', 'beaute',
  ARRAY['naturopathe','yoga','sophrologue','kine','osteopathe','fleuriste'],
  '#4d7c0f', '#365314', '#1a2e05', '#1c1917', '#57534e',
  '#f7fee7', '#ffffff', '#d9f99d', '#1a2e05', '#d9f99d',
  'Playfair Display', 'Inter', false, 'essentiel', 60),

-- 7. OCEAN DEEP (bleu océan, universel)
('ocean_deep', 'Océan Profond', 'Voyage océanique — bleu profond et écume', 'all',
  ARRAY['*'],
  '#0c4a6e', '#082f49', '#1e293b', '#0f172a', '#475569',
  '#f0f9ff', '#ffffff', '#bae6fd', '#082f49', '#7dd3fc',
  'Playfair Display', 'Inter', false, 'standard', 70),

-- 8. ROSE PORCELAIN (rose porcelaine, esthétique/beauté)
('rose_porcelain', 'Rose Porcelaine', 'Délicatesse raffinée — rose pâle et or rose', 'beaute',
  ARRAY['estheticienne','coiffeur','fleuriste','dentiste'],
  '#be185d', '#9f1239', '#831843', '#1c1917', '#78716c',
  '#fdf2f8', '#ffffff', '#fce7f3', '#831843', '#fbcfe8',
  'Cormorant Garamond', 'Inter', false, 'standard', 80),

-- 9. CHARCOAL BRONZE (anthracite bronze, architecture/design)
('charcoal_bronze', 'Anthracite Bronze', 'Modernité brute — anthracite et bronze', 'commerce',
  ARRAY['architecte','designer','photographe','artisan_bois','ferronnier'],
  '#a16207', '#854d0e', '#0c0a09', '#0c0a09', '#78716c',
  '#fafaf9', '#ffffff', '#e7e5e4', '#0c0a09', '#d6d3d1',
  'Syne', 'Inter', false, 'standard', 90),

-- 10. NAVY SAFFRON (marine safran, restaurants gastronomiques)
('navy_saffron', 'Marine Safran', 'Gastronomie d''auteur — marine et safran', 'restauration',
  ARRAY['restaurant','traiteur','chef','sommelier','patisserie'],
  '#f59e0b', '#d97706', '#1e3a8a', '#f8fafc', '#cbd5e1',
  '#1e293b', '#0f172a', '#334155', '#0f172a', '#fde68a',
  'Playfair Display', 'Inter', false, 'standard', 100),

-- 11. PURE MINIMAL (minimalisme pur, universel)
('pure_minimal', 'Minimalisme Pur', 'Épure absolue — noir et blanc', 'all',
  ARRAY['*'],
  '#000000', '#1a1a1a', '#525252', '#000000', '#737373',
  '#ffffff', '#fafafa', '#e5e5e5', '#000000', '#d4d4d4',
  'Syne', 'Inter', false, 'essentiel', 110),

-- 12. ROYAL PURPLE (violet royal, créatifs/luxe)
('royal_purple', 'Violet Royal', 'Créativité noble — violet profond et argent', 'all',
  ARRAY['*'],
  '#6d28d9', '#5b21b6', '#2e1065', '#0f0a1e', '#6b7280',
  '#faf5ff', '#ffffff', '#e9d5ff', '#2e1065', '#ddd6fe',
  'Syne', 'Inter', true, 'prestige', 120)

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  metier_category = EXCLUDED.metier_category,
  professions = EXCLUDED.professions,
  color_primary = EXCLUDED.color_primary,
  color_primary_dark = EXCLUDED.color_primary_dark,
  color_secondary = EXCLUDED.color_secondary,
  color_text = EXCLUDED.color_text,
  color_text_muted = EXCLUDED.color_text_muted,
  color_background = EXCLUDED.color_background,
  color_surface = EXCLUDED.color_surface,
  color_border = EXCLUDED.color_border,
  color_footer_bg = EXCLUDED.color_footer_bg,
  color_footer_text = EXCLUDED.color_footer_text,
  font_heading = EXCLUDED.font_heading,
  font_body = EXCLUDED.font_body,
  premium = EXCLUDED.premium,
  min_plan = EXCLUDED.min_plan,
  sort_order = EXCLUDED.sort_order;
