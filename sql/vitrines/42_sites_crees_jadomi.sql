-- =============================================
-- Passe 38 - Sites crees chez JADOMI + themes premium
-- Date : 24 avril 2026
-- =============================================

-- 1. Sites crees par JADOMI
CREATE TABLE IF NOT EXISTS public.sites_jadomi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  forfait_id INT REFERENCES public.studio_forfaits(id),
  theme_code VARCHAR(50),
  metier VARCHAR(50),
  nom_affiche VARCHAR(200),
  url_jadomi TEXT,
  domaine_personnel TEXT,
  statut VARCHAR(30) DEFAULT 'en_creation'
    CHECK (statut IN ('en_creation', 'preview', 'en_ligne', 'depublie', 'archive')),
  heberge_sur VARCHAR(20) DEFAULT 'jadomi',
  migrable_ovh BOOLEAN DEFAULT false,
  derniere_modif TIMESTAMP DEFAULT NOW(),
  mis_en_ligne_le TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sites_jadomi_societe ON public.sites_jadomi(societe_id);
CREATE INDEX IF NOT EXISTS idx_sites_jadomi_slug ON public.sites_jadomi(slug);

-- 2. Themes disponibles
CREATE TABLE IF NOT EXISTS public.themes_sites (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  nom VARCHAR(100) NOT NULL,
  metier VARCHAR(50) NOT NULL,
  description TEXT,
  preview_url TEXT,
  screenshot_url TEXT,
  forfaits_compatibles JSONB,
  couleur_primaire VARCHAR(10),
  couleur_accent VARCHAR(10),
  typo_display VARCHAR(50),
  typo_body VARCHAR(50),
  pattern_design VARCHAR(100),
  inspirations JSONB,
  ordre INT DEFAULT 0,
  actif BOOLEAN DEFAULT true
);

-- Seeds 10 themes
INSERT INTO public.themes_sites
  (code, nom, metier, description, couleur_primaire, couleur_accent,
   typo_display, typo_body, pattern_design, inspirations, forfaits_compatibles, ordre)
VALUES
('dent_clinical_white', 'Clinical White', 'dentiste',
  'Swiss minimalism medical. Blanc dominant, bleu pastel, accents tech.',
  '#4A90E2', '#E8F1FB', 'Inter', 'Inter', 'Swiss Minimalism',
  '["Mark Murphy DDS", "Seattle Dental Co", "Tend NYC"]'::jsonb,
  '["classic","pro","expert"]'::jsonb, 1),
('dent_ocean_deep', 'Ocean Deep', 'dentiste',
  'Editorial premium dark. Bleu nuit profond, or brosse, typo serif magazine.',
  '#0D2847', '#C9A961', 'Fraunces', 'Inter', 'Editorial Dark Premium',
  '["Dr. Joyce Bassett", "Paddington Dental Sydney"]'::jsonb,
  '["pro","expert"]'::jsonb, 2),
('dent_sage_forest', 'Sage Forest', 'dentiste',
  'Bien-etre naturel. Vert sage doux, terracotta, creme chaud, ambiance spa.',
  '#6B8E7A', '#D4A373', 'Cormorant Garamond', 'Poppins', 'Wellness Natural',
  '["Jackson Family Dental", "Beehive Dental"]'::jsonb,
  '["pro","expert"]'::jsonb, 3),
('law_classical', 'Classical', 'avocat',
  'Elegance parisienne. Noir profond, or discret, serif classique, autorite.',
  '#1A1A1A', '#B8860B', 'Playfair Display', 'Lato', 'Parisian Elegance',
  '["Squarespace law templates", "Latham & Watkins"]'::jsonb,
  '["classic","pro","expert"]'::jsonb, 1),
('law_modern', 'Modern Law', 'avocat',
  'Corporate international. Bleu roi profond, blanc, gris anthracite.',
  '#0F3460', '#E5E7EB', 'Syne', 'Inter', 'Modern Corporate',
  '["McKinsey digital", "Kirkland & Ellis"]'::jsonb,
  '["pro","expert"]'::jsonb, 2),
('law_contemporary', 'Contemporary', 'avocat',
  'Avant-garde art contemporain. Dark premium, rouge oxblood, or brosse.',
  '#0A0A0F', '#8B2635', 'Syne', 'DM Sans', 'Contemporary Art',
  '["Galeries contemporaines", "Art Basel digital"]'::jsonb,
  '["pro","expert"]'::jsonb, 3),
('ortho_smile_bright', 'Smile Bright', 'orthodontiste',
  'Lumineux dynamique. Blanc pur, accent turquoise, energie positive.',
  '#00B8A9', '#FFFFFF', 'Poppins', 'Poppins', 'Modern Friendly',
  '["Smile Direct premium", "Invisalign websites"]'::jsonb,
  '["classic","pro","expert"]'::jsonb, 1),
('ortho_premium_align', 'Premium Align', 'orthodontiste',
  'Tech haut de gamme. Argent, bleu nuit, innovation transformation.',
  '#1F2937', '#9CA3AF', 'Playfair Display', 'Inter', 'Premium Tech',
  '["Apple healthcare aesthetic"]'::jsonb,
  '["pro","expert"]'::jsonb, 2),
('proth_lab_pro', 'Lab Pro', 'prothesiste',
  'Precision industrielle. Gris acier, blanc, details techniques.',
  '#374151', '#D1D5DB', 'Inter', 'Inter', 'Industrial Precision',
  '["Kaizen Dental Lab"]'::jsonb,
  '["classic","pro","expert"]'::jsonb, 1),
('proth_artisan_premium', 'Artisan Premium', 'prothesiste',
  'Artisanat de luxe. Brun chaud, or, typo serif elegante, horlogerie.',
  '#8B6F47', '#D4AF37', 'Cormorant Garamond', 'Lora', 'Luxury Craftsmanship',
  '["Patek Philippe aesthetic"]'::jsonb,
  '["pro","expert"]'::jsonb, 2)
ON CONFLICT (code) DO NOTHING;

-- 3. Sections configurables
CREATE TABLE IF NOT EXISTS public.sites_jadomi_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites_jadomi(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL,
  type_section VARCHAR(50),
  cle VARCHAR(100),
  valeur JSONB,
  ordre INT DEFAULT 0,
  actif BOOLEAN DEFAULT true,
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sections_site ON public.sites_jadomi_sections(site_id);

-- 4. Versions (rollback)
CREATE TABLE IF NOT EXISTS public.sites_jadomi_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites_jadomi(id),
  societe_id UUID NOT NULL,
  snapshot JSONB,
  commentaire TEXT,
  auteur_user_id UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 5. Suggestions IA
CREATE TABLE IF NOT EXISTS public.sites_jadomi_suggestions_ia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL,
  societe_id UUID NOT NULL,
  section_id UUID,
  contexte TEXT,
  propositions JSONB,
  choix_pro TEXT,
  cout_ia_centimes INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 6. RLS
ALTER TABLE public.sites_jadomi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites_jadomi_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites_jadomi_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites_jadomi_suggestions_ia ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
CREATE POLICY sites_jadomi_select ON public.sites_jadomi
  FOR SELECT USING (societe_id IN (SELECT societe_id FROM public.user_societe_roles WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY sites_jadomi_all ON public.sites_jadomi
  FOR ALL USING (societe_id IN (SELECT societe_id FROM public.user_societe_roles WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY sections_all ON public.sites_jadomi_sections
  FOR ALL USING (societe_id IN (SELECT societe_id FROM public.user_societe_roles WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY versions_select ON public.sites_jadomi_versions
  FOR SELECT USING (societe_id IN (SELECT societe_id FROM public.user_societe_roles WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY suggestions_all ON public.sites_jadomi_suggestions_ia
  FOR ALL USING (societe_id IN (SELECT societe_id FROM public.user_societe_roles WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- themes_sites : lecture publique
DO $$ BEGIN
ALTER TABLE public.themes_sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY themes_public ON public.themes_sites FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Verification
SELECT code, nom, metier, pattern_design FROM public.themes_sites ORDER BY metier, ordre;
