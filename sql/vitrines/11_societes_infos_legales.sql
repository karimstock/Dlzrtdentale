-- =============================================
-- JADOMI — Module Mon site internet
-- 11_societes_infos_legales.sql — Colonnes supplementaires societes
-- =============================================

-- Infos contact manquantes
ALTER TABLE societes ADD COLUMN IF NOT EXISTS horaires text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS adresse_complement text;

-- Sante
ALTER TABLE societes ADD COLUMN IF NOT EXISTS rpps text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS ordre_numero text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS departement_exercice text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS secteur_conventionnel text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS diplome_universite text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS diplome_annee int;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS qualifications jsonb DEFAULT '[]';

-- Avocat
ALTER TABLE societes ADD COLUMN IF NOT EXISTS barreau text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS numero_toque text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS assurance_rc text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS assurance_rc_numero text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS carpa text;

-- Reseaux sociaux
ALTER TABLE societes ADD COLUMN IF NOT EXISTS social_instagram text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS social_facebook text;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS social_linkedin text;

-- Metier (pour mapping profession vitrine)
ALTER TABLE societes ADD COLUMN IF NOT EXISTS metier text;

-- Footer pitch (pour le site)
ALTER TABLE societes ADD COLUMN IF NOT EXISTS footer_pitch text;

-- Completion tracking
ALTER TABLE societes ADD COLUMN IF NOT EXISTS infos_completion_pct int DEFAULT 0;
ALTER TABLE societes ADD COLUMN IF NOT EXISTS infos_updated_at timestamptz;
