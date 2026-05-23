-- =============================================
-- JADOMI — Moteur d'Intelligence Stratégique Prud'homale
-- Phase 1 : Socle données
-- À exécuter dans Supabase Dashboard > SQL Editor
-- =============================================

-- 1. Enrichir avocat_dossiers avec les champs stratégiques
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS societe_id UUID;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS employeur_nom TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS employeur_siret TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS employeur_adresse TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS convention_collective TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS section_cph TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS stade_procedural TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS salaire_brut NUMERIC;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS anciennete_mois INT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS avocat_adverse TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS type_contentieux TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS statut_salarie TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS type_employeur TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS taille_entreprise TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS secteur_activite TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS poste_occupe TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS historique_relationnel TEXT;
ALTER TABLE public.avocat_dossiers ADD COLUMN IF NOT EXISTS strategie_principale TEXT;

-- 2. Table avocat_strategies — Stratégies par dossier
CREATE TABLE IF NOT EXISTS public.avocat_strategies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL,
  dossier_id UUID NOT NULL REFERENCES public.avocat_dossiers(id) ON DELETE CASCADE,
  rang TEXT DEFAULT 'principale', -- principale, secondaire, abandonnee, adverse
  type_strategie TEXT NOT NULL, -- harcelement, obligation_securite, heures_sup, etc.
  objectif TEXT,
  arguments JSONB DEFAULT '[]',
  pieces_utilisees JSONB DEFAULT '[]',
  risques TEXT,
  solidite INT DEFAULT 50, -- 0-100
  jurisprudences JSONB DEFAULT '[]',
  issue_attendue TEXT,
  issue_reelle TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_strategies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_strategies TO service_role;
ALTER TABLE public.avocat_strategies ENABLE ROW LEVEL SECURITY;
CREATE POLICY avocat_strategies_service ON public.avocat_strategies FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Table avocat_issues — Issue finale par dossier
CREATE TABLE IF NOT EXISTS public.avocat_issues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL,
  dossier_id UUID NOT NULL REFERENCES public.avocat_dossiers(id) ON DELETE CASCADE,
  resultat_global TEXT, -- transaction, condamnation, rejet, accord_partiel, desistement, appel, gagne, perdu, abandonne
  montant_demande NUMERIC DEFAULT 0,
  montant_negocie NUMERIC DEFAULT 0,
  montant_obtenu NUMERIC DEFAULT 0,
  montant_transactionnel NUMERIC DEFAULT 0,
  montant_condamne NUMERIC DEFAULT 0,
  article_700 NUMERIC DEFAULT 0,
  rappels_salaire NUMERIC DEFAULT 0,
  dommages_interets NUMERIC DEFAULT 0,
  resultat_par_axe JSONB DEFAULT '[]', -- [{axe, demande, obtenu, analyse}]
  date_issue DATE,
  decision_importee TEXT, -- HTML/texte du jugement importé
  decision_type TEXT, -- jugement_cph, arret_ca, protocole_transactionnel
  decision_juridiction TEXT,
  decision_date DATE,
  decision_numero TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(dossier_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_issues TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_issues TO service_role;
ALTER TABLE public.avocat_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY avocat_issues_service ON public.avocat_issues FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Table avocat_post_mortem — Analyse post-dossier
CREATE TABLE IF NOT EXISTS public.avocat_post_mortem (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL,
  dossier_id UUID NOT NULL REFERENCES public.avocat_dossiers(id) ON DELETE CASCADE,
  ce_qui_a_fonctionne JSONB DEFAULT '[]', -- liste de textes
  ce_qui_a_echoue JSONB DEFAULT '[]',
  preuve_decisive TEXT,
  preuve_manquante TEXT,
  strategie_efficace TEXT,
  strategie_inutile TEXT,
  erreurs_a_eviter TEXT,
  negociation_preferable BOOLEAN,
  enseignement_principal TEXT,
  resume_strategique TEXT, -- généré par IA
  pattern_extrait JSONB, -- pattern abstrait extrait
  satisfaction INT, -- 1-5
  rentabilite TEXT, -- tres_rentable, rentable, neutre, peu_rentable, non_rentable
  juridiction_favorable BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(dossier_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_post_mortem TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_post_mortem TO service_role;
ALTER TABLE public.avocat_post_mortem ENABLE ROW LEVEL SECURITY;
CREATE POLICY avocat_post_mortem_service ON public.avocat_post_mortem FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. Table avocat_patterns — Patterns stratégiques abstraits
CREATE TABLE IF NOT EXISTS public.avocat_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL,
  source TEXT DEFAULT 'cabinet', -- cabinet, reseau
  type_contentieux TEXT,
  contexte JSONB DEFAULT '{}', -- {anciennete_tranche, salaire_tranche, type_employeur, statut, secteur}
  preuves_presentes JSONB DEFAULT '[]',
  preuves_absentes JSONB DEFAULT '[]',
  strategie_efficace TEXT,
  strategie_fragile TEXT,
  preuves_decisives JSONB DEFAULT '[]',
  issue_frequente TEXT,
  montant_tranche TEXT, -- "15K-25K"
  taux_transaction NUMERIC, -- 0-100
  taux_succes NUMERIC, -- 0-100
  nb_dossiers_source INT DEFAULT 1,
  fiabilite TEXT DEFAULT 'a_verifier', -- tres_fiable, fiable, a_verifier, fragile, insuffisant
  date_derniere_maj TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_patterns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_patterns TO service_role;
ALTER TABLE public.avocat_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY avocat_patterns_service ON public.avocat_patterns FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. Table avocat_preuves — Preuves structurées par dossier
CREATE TABLE IF NOT EXISTS public.avocat_preuves (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL,
  dossier_id UUID NOT NULL REFERENCES public.avocat_dossiers(id) ON DELETE CASCADE,
  piece_id UUID, -- lien vers avocat_pieces si existe
  type_preuve TEXT NOT NULL, -- mail, sms, whatsapp, attestation, medecine_travail, certificat_medical, horaires, badgeuse, fiche_paie, contrat, avenant, avertissement, convocation, licenciement, temoignage, rapport_rh, inspection_travail
  date_preuve DATE,
  auteur TEXT,
  resume TEXT,
  force_probatoire INT DEFAULT 3, -- 1-5
  axe_strategique TEXT, -- harcelement, heures_sup, obligation_securite, etc.
  statut TEXT DEFAULT 'a_verifier', -- utilisee, non_utilisee, a_verifier, decisive, faible
  lien_timeline TEXT, -- event_id
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_preuves TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_preuves TO service_role;
ALTER TABLE public.avocat_preuves ENABLE ROW LEVEL SECURITY;
CREATE POLICY avocat_preuves_service ON public.avocat_preuves FOR ALL TO service_role USING (true) WITH CHECK (true);
