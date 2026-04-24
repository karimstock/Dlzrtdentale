-- =============================================
-- Passe 38 - Execution IA automatique sur sites existants
-- Date : 24 avril 2026
-- =============================================
-- IDEMPOTENT : ALTER ADD IF NOT EXISTS, CREATE IF NOT EXISTS
-- ZERO DROP TABLE, ZERO DELETE sans WHERE
-- =============================================

-- 1. Enrichir la table interventions existante
ALTER TABLE public.sites_existants_interventions
  ADD COLUMN IF NOT EXISTS demande_libre TEXT,
  ADD COLUMN IF NOT EXISTS type_technique VARCHAR(50),
  ADD COLUMN IF NOT EXISTS niveau_complexite VARCHAR(20),
  ADD COLUMN IF NOT EXISTS exec_automatique BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS analyse_ia JSONB,
  ADD COLUMN IF NOT EXISTS fichiers_avant JSONB,
  ADD COLUMN IF NOT EXISTS fichiers_apres JSONB,
  ADD COLUMN IF NOT EXISTS duree_ms INT,
  ADD COLUMN IF NOT EXISTS cout_ia_centimes INT,
  ADD COLUMN IF NOT EXISTS preview_url TEXT,
  ADD COLUMN IF NOT EXISTS rollback_effectue BOOLEAN DEFAULT false;

-- 2. Backups par intervention (pour rollback)
CREATE TABLE IF NOT EXISTS public.sites_existants_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL REFERENCES public.sites_existants_interventions(id) ON DELETE CASCADE,
  site_id UUID NOT NULL,
  societe_id UUID NOT NULL,
  chemin_fichier TEXT NOT NULL,
  contenu_original TEXT,
  taille_octets INT,
  hash_sha256 VARCHAR(64),
  stocke_le TIMESTAMP DEFAULT NOW(),
  purge_apres TIMESTAMP DEFAULT (NOW() + INTERVAL '90 days')
);

CREATE INDEX IF NOT EXISTS idx_backups_intervention
  ON public.sites_existants_backups(intervention_id);
CREATE INDEX IF NOT EXISTS idx_backups_site
  ON public.sites_existants_backups(site_id);

-- 3. Actions rapides predefinies (boutons UI)
CREATE TABLE IF NOT EXISTS public.interventions_actions_predefinies (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  nom VARCHAR(100) NOT NULL,
  description TEXT,
  icone VARCHAR(10),
  complexite VARCHAR(20),
  prompt_ia TEXT,
  ordre INT
);

INSERT INTO public.interventions_actions_predefinies
  (code, nom, description, icone, complexite, prompt_ia, ordre)
VALUES
('changer_telephone', 'Changer le telephone',
  'Modifier le numero de telephone affiche sur le site',
  '1', 'simple',
  'Trouve tous les endroits ou le numero de telephone apparait dans les fichiers HTML/PHP/templates et remplace-le par le nouveau numero fourni.',
  1),
('changer_horaires', 'Changer les horaires',
  'Modifier les horaires d''ouverture',
  '2', 'simple',
  'Identifie la section horaires d''ouverture dans le site et remplace-la par les nouveaux horaires fournis.',
  2),
('changer_adresse', 'Changer l''adresse',
  'Modifier l''adresse du cabinet',
  '3', 'simple',
  'Remplace l''adresse postale actuelle par la nouvelle dans tous les fichiers concernes.',
  3),
('changer_email', 'Changer l''email',
  'Modifier l''adresse email de contact',
  '4', 'simple',
  'Remplace toutes les occurrences de l''email de contact par le nouveau.',
  4),
('changer_couleur', 'Changer la couleur principale',
  'Modifier la couleur dominante du site',
  '5', 'moyen',
  'Identifie la couleur principale dans le CSS (variables CSS ou valeurs repetees) et remplace-la par la nouvelle couleur. Verifie que le contraste reste accessible.',
  5),
('remplacer_photo', 'Remplacer une photo',
  'Remplacer une photo existante par une nouvelle',
  '6', 'moyen',
  'Remplace la photo a l''URL/chemin fourni par la nouvelle image uploadee.',
  6),
('modifier_texte_section', 'Modifier un texte',
  'Changer un texte specifique dans une section',
  '7', 'simple',
  'Localise le texte ancien dans les fichiers et remplace-le par le nouveau texte fourni.',
  7),
('optimiser_images', 'Optimiser les images',
  'Compresser et convertir en WebP',
  '8', 'moyen',
  'Liste toutes les images JPG/PNG du site, les convertis en WebP et met a jour les references dans le HTML.',
  8),
('ajouter_avis_google', 'Ajouter avis Google',
  'Integrer un widget d''avis Google',
  '9', 'moyen',
  'Ajoute un widget d''affichage des avis Google (Place ID fourni) dans la section demandee.',
  9),
('corriger_meta_seo', 'Corriger meta SEO',
  'Ameliorer les titres et descriptions SEO',
  '10', 'moyen',
  'Analyse les balises title, meta description, H1 et propose des versions optimisees SEO. Applique apres validation.',
  10)
ON CONFLICT (code) DO NOTHING;

-- 4. RLS
ALTER TABLE public.sites_existants_backups ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
CREATE POLICY backups_select ON public.sites_existants_backups
  FOR SELECT USING (
    societe_id IN (SELECT societe_id FROM public.user_societe_roles WHERE user_id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- interventions_actions_predefinies : lecture publique
DO $$ BEGIN
ALTER TABLE public.interventions_actions_predefinies ENABLE ROW LEVEL SECURITY;
CREATE POLICY actions_public ON public.interventions_actions_predefinies
  FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Verification
SELECT code, nom, complexite FROM public.interventions_actions_predefinies ORDER BY ordre;

-- =============================================
-- FIN migration 41 — Passe 38 interventions IA
-- =============================================
