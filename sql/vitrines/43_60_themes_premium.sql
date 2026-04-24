-- =============================================
-- Passe 38b - 60 themes premium (20 par metier)
-- Dentiste+Ortho partagent les memes themes
-- 4 Classic / 10 Pro / 20 Expert par metier
-- Date : 24 avril 2026
-- =============================================

-- Ajouter colonne tier sur themes_sites
ALTER TABLE public.themes_sites
  ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'classic';

-- Supprimer les 10 anciens themes (remplaces par 60 nouveaux)
DELETE FROM public.themes_sites WHERE code IN (
  'dent_clinical_white','dent_ocean_deep','dent_sage_forest',
  'law_classical','law_modern','law_contemporary',
  'ortho_smile_bright','ortho_premium_align',
  'proth_lab_pro','proth_artisan_premium'
);

-- =============================================
-- DENTISTE + ORTHODONTISTE (20 themes partages)
-- =============================================

-- CLASSIC (4) — Clean, fonctionnel, le job est fait
INSERT INTO public.themes_sites (code, nom, metier, tier, description, couleur_primaire, couleur_accent, typo_display, typo_body, pattern_design, forfaits_compatibles, ordre) VALUES
('dental_clean', 'Clean', 'dentiste,orthodontiste', 'classic',
  'Blanc epure, bleu confiance, typographie nette. Professionnel sans artifice.',
  '#2563EB', '#EFF6FF', 'Inter', 'Inter', 'Flat Clean',
  '["classic","pro","expert"]'::jsonb, 1),
('dental_standard', 'Standard', 'dentiste,orthodontiste', 'classic',
  'Gris clair elegant, accents bleu-vert. Sobre et rassurant.',
  '#0F766E', '#F0FDFA', 'Inter', 'Inter', 'Standard Professional',
  '["classic","pro","expert"]'::jsonb, 2),
('dental_modern', 'Modern', 'dentiste,orthodontiste', 'classic',
  'Lignes epurees, fond blanc casse, accent indigo. Modernite discrete.',
  '#4F46E5', '#F5F3FF', 'Outfit', 'Inter', 'Modern Minimal',
  '["classic","pro","expert"]'::jsonb, 3),
('dental_fresh', 'Fresh', 'dentiste,orthodontiste', 'classic',
  'Palette fraiche turquoise et blanc. Energie positive, accueillant.',
  '#06B6D4', '#ECFEFF', 'Poppins', 'Poppins', 'Fresh Friendly',
  '["classic","pro","expert"]'::jsonb, 4)
ON CONFLICT (code) DO NOTHING;

-- PRO (6 supplementaires = 10 total) — Premium, differenciants
INSERT INTO public.themes_sites (code, nom, metier, tier, description, couleur_primaire, couleur_accent, typo_display, typo_body, pattern_design, forfaits_compatibles, ordre) VALUES
('dental_clinical_white', 'Clinical White', 'dentiste,orthodontiste', 'pro',
  'Swiss minimalism medical. Blanc dominant, bleu pastel, precision chirurgicale.',
  '#4A90E2', '#E8F1FB', 'Inter', 'Inter', 'Swiss Minimalism',
  '["pro","expert"]'::jsonb, 5),
('dental_sage', 'Sage Forest', 'dentiste,orthodontiste', 'pro',
  'Bien-etre naturel. Vert sage, terracotta, creme chaud, ambiance spa-cabinet.',
  '#6B8E7A', '#D4A373', 'Cormorant Garamond', 'Poppins', 'Wellness Natural',
  '["pro","expert"]'::jsonb, 6),
('dental_nordic', 'Nordic', 'dentiste,orthodontiste', 'pro',
  'Scandinave epure. Blanc neige, bois clair, gris doux. Hygge medical.',
  '#78716C', '#FAFAF9', 'DM Sans', 'DM Sans', 'Nordic Scandinavian',
  '["pro","expert"]'::jsonb, 7),
('dental_trust', 'Trust', 'dentiste,orthodontiste', 'pro',
  'Bleu marine autoritaire, filets dores discrets. Inspire la confiance absolue.',
  '#1E3A5F', '#C8A96E', 'Libre Baskerville', 'Source Sans 3', 'Authority Trust',
  '["pro","expert"]'::jsonb, 8),
('dental_smile', 'Smile', 'dentiste,orthodontiste', 'pro',
  'Palette chaude corail et peche. Souriant, humain, chaleureux.',
  '#F97316', '#FFF7ED', 'Nunito', 'Nunito', 'Warm Smile',
  '["pro","expert"]'::jsonb, 9),
('dental_zen', 'Zen', 'dentiste,orthodontiste', 'pro',
  'Japonais minimal. Beige washi, noir encre, espace negatif genere calme.',
  '#1C1917', '#FAF7F2', 'Noto Serif', 'Noto Sans', 'Japanese Minimal',
  '["pro","expert"]'::jsonb, 10)
ON CONFLICT (code) DO NOTHING;

-- EXPERT (10 supplementaires = 20 total) — Awwwards, Hollywood, WOW
INSERT INTO public.themes_sites (code, nom, metier, tier, description, couleur_primaire, couleur_accent, typo_display, typo_body, pattern_design, forfaits_compatibles, ordre) VALUES
('dental_ocean', 'Ocean Deep', 'dentiste,orthodontiste', 'expert',
  'Editorial dark premium. Bleu nuit profond, or brosse. Magazine de luxe.',
  '#0D2847', '#C9A961', 'Fraunces', 'Inter', 'Editorial Dark Premium',
  '["expert"]'::jsonb, 11),
('dental_obsidian', 'Obsidian', 'dentiste,orthodontiste', 'expert',
  'Noir total, typographie blanche massive, accent neon cyan. Ultra contemporain.',
  '#0A0A0A', '#22D3EE', 'Syne', 'Inter', 'Dark Neon Contrast',
  '["expert"]'::jsonb, 12),
('dental_aurora', 'Aurora', 'dentiste,orthodontiste', 'expert',
  'Gradient aurore boreale subtil. Violet profond vers turquoise. Futuriste medical.',
  '#5B21B6', '#06B6D4', 'Space Grotesk', 'Inter', 'Aurora Gradient',
  '["expert"]'::jsonb, 13),
('dental_riviera', 'Riviera', 'dentiste,orthodontiste', 'expert',
  'Cote d''Azur luxury. Bleu mediterranee, sable chaud, serif elegant.',
  '#1E40AF', '#D4A853', 'Playfair Display', 'Lato', 'Mediterranean Luxury',
  '["expert"]'::jsonb, 14),
('dental_marble', 'Marble', 'dentiste,orthodontiste', 'expert',
  'Blanc marbre, veines grises subtiles, or rose. Hotel 5 etoiles medical.',
  '#1F2937', '#B76E79', 'Cormorant Garamond', 'Montserrat', 'Luxury Marble',
  '["expert"]'::jsonb, 15),
('dental_bauhaus', 'Bauhaus', 'dentiste,orthodontiste', 'expert',
  'Geometrique art deco. Formes primaires, couleurs bold, grille stricte.',
  '#DC2626', '#FBBF24', 'Space Grotesk', 'DM Sans', 'Bauhaus Geometric',
  '["expert"]'::jsonb, 16),
('dental_mono', 'Monochrome', 'dentiste,orthodontiste', 'expert',
  'Noir et blanc pur. Photographie N&B, typographie massive. Editorial magazine.',
  '#000000', '#FFFFFF', 'Instrument Serif', 'Inter', 'Monochrome Editorial',
  '["expert"]'::jsonb, 17),
('dental_terra', 'Terra', 'dentiste,orthodontiste', 'expert',
  'Terre cuite, argile, textures naturelles. Chaleur artisanale, fait-main.',
  '#92400E', '#FEF3C7', 'Fraunces', 'Poppins', 'Earthy Organic',
  '["expert"]'::jsonb, 18),
('dental_glass', 'Glass', 'dentiste,orthodontiste', 'expert',
  'Glassmorphism integral. Fond gradient, cartes transparentes, blur partout.',
  '#6366F1', '#A78BFA', 'Inter', 'Inter', 'Glassmorphism Full',
  '["expert"]'::jsonb, 19),
('dental_cinema', 'Cinema', 'dentiste,orthodontiste', 'expert',
  'Cinematographique. Ratio 21:9, overlay video hero, typo serif massive, grain film.',
  '#18181B', '#D4AF37', 'Playfair Display', 'Inter', 'Cinematic Film',
  '["expert"]'::jsonb, 20)
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- AVOCAT (20 themes dedies juridique)
-- =============================================

-- CLASSIC (4)
INSERT INTO public.themes_sites (code, nom, metier, tier, description, couleur_primaire, couleur_accent, typo_display, typo_body, pattern_design, forfaits_compatibles, ordre) VALUES
('law_clean', 'Clean', 'avocat', 'classic',
  'Blanc sobre, bleu marine, typographie claire. Professionnel et direct.',
  '#1E3A5F', '#F8FAFC', 'Inter', 'Inter', 'Professional Clean',
  '["classic","pro","expert"]'::jsonb, 1),
('law_standard', 'Standard', 'avocat', 'classic',
  'Gris anthracite, accents bordeaux discrets. Serieux sans etre froid.',
  '#374151', '#7F1D1D', 'Source Serif 4', 'Source Sans 3', 'Standard Legal',
  '["classic","pro","expert"]'::jsonb, 2),
('law_cabinet', 'Cabinet', 'avocat', 'classic',
  'Beige parchemin, brun chaud, serif classique. Tradition juridique francaise.',
  '#78350F', '#FEF3C7', 'Libre Baskerville', 'Inter', 'Traditional Cabinet',
  '["classic","pro","expert"]'::jsonb, 3),
('law_civic', 'Civic', 'avocat', 'classic',
  'Bleu republique, blanc, rouge discret. Valeurs citoyennes, droit public.',
  '#1D4ED8', '#EFF6FF', 'DM Sans', 'DM Sans', 'Civic Modern',
  '["classic","pro","expert"]'::jsonb, 4)
ON CONFLICT (code) DO NOTHING;

-- PRO (6)
INSERT INTO public.themes_sites (code, nom, metier, tier, description, couleur_primaire, couleur_accent, typo_display, typo_body, pattern_design, forfaits_compatibles, ordre) VALUES
('law_classical', 'Classical', 'avocat', 'pro',
  'Elegance parisienne. Noir profond, or discret, Playfair serif, autorite.',
  '#1A1A1A', '#B8860B', 'Playfair Display', 'Lato', 'Parisian Elegance',
  '["pro","expert"]'::jsonb, 5),
('law_modern', 'Modern Law', 'avocat', 'pro',
  'Corporate international. Bleu roi, blanc epure, Syne geom. McKinsey-style.',
  '#0F3460', '#E5E7EB', 'Syne', 'Inter', 'Modern Corporate',
  '["pro","expert"]'::jsonb, 6),
('law_oxford', 'Oxford', 'avocat', 'pro',
  'Academique british. Vert Oxford profond, creme ivoire, serif studieux.',
  '#064E3B', '#ECFDF5', 'Cormorant Garamond', 'EB Garamond', 'British Academic',
  '["pro","expert"]'::jsonb, 7),
('law_slate', 'Slate', 'avocat', 'pro',
  'Ardoise contemporain. Gris-bleu fonce, accents acier. Technologie + droit.',
  '#334155', '#94A3B8', 'Space Grotesk', 'Inter', 'Slate Contemporary',
  '["pro","expert"]'::jsonb, 8),
('law_justice', 'Justice', 'avocat', 'pro',
  'Balance et equilibre. Or sur fond creme, colonnes, symetrie architecturale.',
  '#78350F', '#D4AF37', 'Playfair Display', 'Source Sans 3', 'Justice Classical',
  '["pro","expert"]'::jsonb, 9),
('law_nordic', 'Nordic Law', 'avocat', 'pro',
  'Scandinave juridique. Blanc pur, gris clair, minimalisme fonctionnel.',
  '#6B7280', '#F9FAFB', 'DM Sans', 'DM Sans', 'Nordic Functional',
  '["pro","expert"]'::jsonb, 10)
ON CONFLICT (code) DO NOTHING;

-- EXPERT (10)
INSERT INTO public.themes_sites (code, nom, metier, tier, description, couleur_primaire, couleur_accent, typo_display, typo_body, pattern_design, forfaits_compatibles, ordre) VALUES
('law_contemporary', 'Contemporary', 'avocat', 'expert',
  'Avant-garde art contemporain. Noir quasi-total, rouge oxblood, asymetrie.',
  '#0A0A0F', '#8B2635', 'Syne', 'DM Sans', 'Contemporary Art',
  '["expert"]'::jsonb, 11),
('law_versailles', 'Versailles', 'avocat', 'expert',
  'Baroque revisite. Or mat, bleu royal, ornements subtils, grandeur francaise.',
  '#1E3A5F', '#D4AF37', 'Cormorant Garamond', 'Lato', 'French Baroque Revival',
  '["expert"]'::jsonb, 12),
('law_noir', 'Film Noir', 'avocat', 'expert',
  'Cinema noir. Noir profond, blanc cru, ombres dramatiques, mystere.',
  '#0C0C0C', '#F5F5F5', 'Instrument Serif', 'Inter', 'Film Noir Dramatic',
  '["expert"]'::jsonb, 13),
('law_manhattan', 'Manhattan', 'avocat', 'expert',
  'Wall Street premium. Bleu nuit, argent, skyline. Power law firm.',
  '#0F172A', '#C0C0C0', 'Syne', 'Inter', 'Manhattan Power',
  '["expert"]'::jsonb, 14),
('law_marble', 'Palazzo', 'avocat', 'expert',
  'Palais de justice. Marbre blanc, colonnes, or antique. Majestueux.',
  '#1C1917', '#C9A96E', 'Playfair Display', 'Montserrat', 'Marble Palace',
  '["expert"]'::jsonb, 15),
('law_ink', 'Ink', 'avocat', 'expert',
  'Encre et papier. Textures papier velin, typo plume, sepia. Artisanat du droit.',
  '#292524', '#D6C9A8', 'Cormorant Garamond', 'EB Garamond', 'Ink & Paper',
  '["expert"]'::jsonb, 16),
('law_brutal', 'Brutalist', 'avocat', 'expert',
  'Brutalisme architectural. Beton, grille rigide, typo massive. Impact brut.',
  '#18181B', '#F5F5F4', 'Space Grotesk', 'Space Mono', 'Architectural Brutalism',
  '["expert"]'::jsonb, 17),
('law_emerald', 'Emerald', 'avocat', 'expert',
  'Emeraude profond, or, velours. Club prive londonien. Luxe discret.',
  '#064E3B', '#D4AF37', 'Fraunces', 'Lato', 'Emerald Club',
  '["expert"]'::jsonb, 18),
('law_deco', 'Art Deco', 'avocat', 'expert',
  'Art deco 1920s. Lignes geometriques dorees, noir profond, gatsby.',
  '#111827', '#FBBF24', 'Syne', 'DM Sans', 'Art Deco Gatsby',
  '["expert"]'::jsonb, 19),
('law_glass', 'Glass Tower', 'avocat', 'expert',
  'Tour de verre. Glassmorphism, fond gradient bleu, transparence corporate.',
  '#1E40AF', '#93C5FD', 'Inter', 'Inter', 'Glass Corporate',
  '["expert"]'::jsonb, 20)
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- PROTHESISTE DENTAIRE (20 themes dedies)
-- =============================================

-- CLASSIC (4)
INSERT INTO public.themes_sites (code, nom, metier, tier, description, couleur_primaire, couleur_accent, typo_display, typo_body, pattern_design, forfaits_compatibles, ordre) VALUES
('proth_clean', 'Clean', 'prothesiste', 'classic',
  'Blanc technique, gris acier, precis. Laboratoire professionnel.',
  '#374151', '#F3F4F6', 'Inter', 'Inter', 'Technical Clean',
  '["classic","pro","expert"]'::jsonb, 1),
('proth_standard', 'Standard', 'prothesiste', 'classic',
  'Bleu medical, fond clair, sobre. Confiance et rigueur.',
  '#1D4ED8', '#EFF6FF', 'DM Sans', 'DM Sans', 'Medical Standard',
  '["classic","pro","expert"]'::jsonb, 2),
('proth_modern', 'Modern', 'prothesiste', 'classic',
  'Gris contemporain, accents cyan. Technologies CAD/CAM.',
  '#1F2937', '#06B6D4', 'Outfit', 'Inter', 'Modern Tech',
  '["classic","pro","expert"]'::jsonb, 3),
('proth_light', 'Light', 'prothesiste', 'classic',
  'Ultra-clair, fond blanc neige, details gris. Purete ceramique.',
  '#6B7280', '#FFFFFF', 'Inter', 'Inter', 'Pure Light',
  '["classic","pro","expert"]'::jsonb, 4)
ON CONFLICT (code) DO NOTHING;

-- PRO (6)
INSERT INTO public.themes_sites (code, nom, metier, tier, description, couleur_primaire, couleur_accent, typo_display, typo_body, pattern_design, forfaits_compatibles, ordre) VALUES
('proth_lab', 'Lab Pro', 'prothesiste', 'pro',
  'Precision industrielle. Gris acier, grille technique, details nets.',
  '#374151', '#D1D5DB', 'Inter', 'Inter', 'Industrial Precision',
  '["pro","expert"]'::jsonb, 5),
('proth_artisan', 'Artisan', 'prothesiste', 'pro',
  'Artisanat chaud. Brun dore, serif elegante, mains au travail.',
  '#8B6F47', '#D4AF37', 'Cormorant Garamond', 'Lora', 'Warm Craftsmanship',
  '["pro","expert"]'::jsonb, 6),
('proth_ceramic', 'Ceramic', 'prothesiste', 'pro',
  'Blanc ceramique, accents turquoise, purete. Art de la porcelaine.',
  '#0D9488', '#F0FDFA', 'Montserrat', 'Inter', 'Ceramic Purity',
  '["pro","expert"]'::jsonb, 7),
('proth_precision', 'Precision', 'prothesiste', 'pro',
  'Noir technique, quadrillage, mesures. Microns et exactitude.',
  '#0F172A', '#94A3B8', 'Space Grotesk', 'Space Mono', 'Technical Precision',
  '["pro","expert"]'::jsonb, 8),
('proth_zircone', 'Zircone', 'prothesiste', 'pro',
  'Blanc eclatant avec reflets argentes. Materiau noble, haute technologie.',
  '#E5E7EB', '#1F2937', 'DM Sans', 'Inter', 'Zirconia Premium',
  '["pro","expert"]'::jsonb, 9),
('proth_nordic', 'Nordic Lab', 'prothesiste', 'pro',
  'Scandinave labo. Bois clair, blanc, gris doux. Calme et methodique.',
  '#78716C', '#FAFAF9', 'DM Sans', 'DM Sans', 'Nordic Laboratory',
  '["pro","expert"]'::jsonb, 10)
ON CONFLICT (code) DO NOTHING;

-- EXPERT (10)
INSERT INTO public.themes_sites (code, nom, metier, tier, description, couleur_primaire, couleur_accent, typo_display, typo_body, pattern_design, forfaits_compatibles, ordre) VALUES
('proth_horloger', 'Horloger', 'prothesiste', 'expert',
  'Horlogerie suisse. Or sur noir, engrenages subtils, Patek Philippe spirit.',
  '#18181B', '#D4AF37', 'Cormorant Garamond', 'Inter', 'Swiss Watchmaking',
  '["expert"]'::jsonb, 11),
('proth_atelier', 'Atelier', 'prothesiste', 'expert',
  'Atelier d''artiste. Fond ardoise, touches de couleur vive, creativite.',
  '#334155', '#F59E0B', 'Fraunces', 'Inter', 'Artist Atelier',
  '["expert"]'::jsonb, 12),
('proth_forge', 'Forge', 'prothesiste', 'expert',
  'Metal en fusion. Fond sombre, accents orange brulant, puissance.',
  '#1C1917', '#EA580C', 'Syne', 'Inter', 'Metal Forge',
  '["expert"]'::jsonb, 13),
('proth_diamant', 'Diamant', 'prothesiste', 'expert',
  'Joaillerie. Fond noir, eclats diamant, reflets prismatiques.',
  '#0C0A09', '#E2E8F0', 'Playfair Display', 'Montserrat', 'Diamond Jewel',
  '["expert"]'::jsonb, 14),
('proth_micro', 'Microscope', 'prothesiste', 'expert',
  'Vue microscopique. Fond sombre, halos de lumiere, details extremes.',
  '#0F172A', '#38BDF8', 'Space Grotesk', 'Inter', 'Microscopic Detail',
  '["expert"]'::jsonb, 15),
('proth_marble', 'Carrara', 'prothesiste', 'expert',
  'Marbre de Carrare. Blanc veine de gris, or discret. Sculpture.',
  '#1F2937', '#B76E79', 'Cormorant Garamond', 'Lato', 'Carrara Marble',
  '["expert"]'::jsonb, 16),
('proth_bauhaus', 'Bauhaus Lab', 'prothesiste', 'expert',
  'Bauhaus applique au labo. Formes geometriques, couleurs franches, modernisme.',
  '#DC2626', '#1D4ED8', 'Space Grotesk', 'DM Sans', 'Bauhaus Modernism',
  '["expert"]'::jsonb, 17),
('proth_japan', 'Wabi-Sabi', 'prothesiste', 'expert',
  'Wabi-sabi japonais. Imperfection beaute, textures naturelles, zen profond.',
  '#292524', '#A8A29E', 'Noto Serif', 'Noto Sans', 'Wabi-Sabi Japanese',
  '["expert"]'::jsonb, 18),
('proth_3d', 'Digital Twin', 'prothesiste', 'expert',
  'Jumeau numerique. Fond gradient tech, wireframes 3D, neon accents.',
  '#0F172A', '#8B5CF6', 'Syne', 'Inter', 'Digital 3D',
  '["expert"]'::jsonb, 19),
('proth_heritage', 'Heritage', 'prothesiste', 'expert',
  'Heritage familial. Sepia, bordeaux, serif noble. Generations de savoir-faire.',
  '#7F1D1D', '#FEF3C7', 'Fraunces', 'Lora', 'Heritage Legacy',
  '["expert"]'::jsonb, 20)
ON CONFLICT (code) DO NOTHING;

-- Verification : compter par metier et tier
SELECT metier, tier, COUNT(*) as nb_themes
FROM public.themes_sites
GROUP BY metier, tier
ORDER BY metier, tier;

SELECT code, nom, metier, tier FROM public.themes_sites ORDER BY metier, ordre;
