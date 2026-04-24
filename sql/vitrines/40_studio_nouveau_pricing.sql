-- =============================================
-- Passe 37 - Nouveau modele tarifaire Studio
-- Creation one-shot + abonnement mensuel
-- Classic sans modification incluse (0 modif/mois)
-- Date : 24 avril 2026
-- =============================================
-- IDEMPOTENT : ALTER ADD IF NOT EXISTS, UPDATE WHERE code
-- ZERO DROP TABLE, ZERO DELETE sans WHERE
-- =============================================

-- 1. Ajouter colonnes prix creation sur studio_forfaits
ALTER TABLE public.studio_forfaits
  ADD COLUMN IF NOT EXISTS prix_creation_eur DECIMAL(6,2);

ALTER TABLE public.studio_forfaits
  ADD COLUMN IF NOT EXISTS stripe_price_id_creation VARCHAR(100);

-- 2. Mettre a jour les 3 forfaits avec nouveaux prix
UPDATE public.studio_forfaits SET
  prix_mensuel_eur = 29.00,
  prix_creation_eur = 199.00,
  quotas = '{"pages": 1, "photos": 10, "modifications_mois": 0, "articles_blog_mois": 0, "modification_ponctuelle_eur": 49}'::jsonb,
  features = '{"cms": false, "modifications": "aucune_incluse", "modification_ponctuelle_possible": true, "effet_hollywood": false, "delai_creation_jours": 5}'::jsonb
WHERE code = 'classic';

UPDATE public.studio_forfaits SET
  prix_mensuel_eur = 49.00,
  prix_creation_eur = 499.00,
  quotas = '{"pages": 5, "photos": 50, "articles_blog_mois": 4}'::jsonb,
  features = '{"cms": true, "editeur_visuel": true, "preview_live": true, "historique": true, "blog": true, "chatbot": true, "effet_hollywood": false, "delai_creation_jours": 7}'::jsonb
WHERE code = 'pro';

UPDATE public.studio_forfaits SET
  prix_mensuel_eur = 79.00,
  prix_creation_eur = 899.00,
  quotas = '{"pages": 15, "photos": "illimite", "langues": 2, "articles_blog_mois": "illimite"}'::jsonb,
  features = '{"cms": true, "editeur_avance": true, "multilangue": true, "analytics_avancees": true, "effet_hollywood": true, "support_dedie": true, "delai_creation_jours": 10}'::jsonb
WHERE code = 'expert';

-- 3. Table paiements de creation (one-shot)
CREATE TABLE IF NOT EXISTS public.studio_paiements_creation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL,
  forfait_id INT NOT NULL REFERENCES public.studio_forfaits(id),
  montant_eur DECIMAL(6,2) NOT NULL,
  stripe_payment_intent_id VARCHAR(100),
  statut VARCHAR(20) DEFAULT 'en_attente'
    CHECK (statut IN ('en_attente', 'paye', 'echoue', 'rembourse')),
  paye_le TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paiements_creation_societe
  ON public.studio_paiements_creation(societe_id);

-- 4. Table modifications ponctuelles (pour Classic, 49 EUR/unite)
CREATE TABLE IF NOT EXISTS public.site_modifications_ponctuelles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL,
  description TEXT NOT NULL,
  montant_eur DECIMAL(6,2) NOT NULL DEFAULT 49.00,
  stripe_payment_intent_id VARCHAR(100),
  statut_paiement VARCHAR(20) DEFAULT 'en_attente'
    CHECK (statut_paiement IN ('en_attente', 'paye', 'echoue', 'rembourse')),
  statut_execution VARCHAR(20) DEFAULT 'en_attente'
    CHECK (statut_execution IN ('en_attente', 'en_cours', 'terminee', 'refusee')),
  demandee_le TIMESTAMP DEFAULT NOW(),
  payee_le TIMESTAMP,
  executee_le TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_modif_ponc_societe
  ON public.site_modifications_ponctuelles(societe_id);

-- 5. RLS
ALTER TABLE public.studio_paiements_creation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_modifications_ponctuelles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
CREATE POLICY paiements_creation_select ON public.studio_paiements_creation
  FOR SELECT USING (
    societe_id IN (
      SELECT societe_id FROM public.user_societe_roles
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY modif_ponc_select ON public.site_modifications_ponctuelles
  FOR SELECT USING (
    societe_id IN (
      SELECT societe_id FROM public.user_societe_roles
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY modif_ponc_insert ON public.site_modifications_ponctuelles
  FOR INSERT WITH CHECK (
    societe_id IN (
      SELECT societe_id FROM public.user_societe_roles
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 6. Module acces sites existants

-- Sites existants a gerer
CREATE TABLE IF NOT EXISTS public.sites_existants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL,
  url TEXT NOT NULL,
  hebergeur VARCHAR(50),
  plateforme VARCHAR(50),
  score_complexite INT,
  recommandation VARCHAR(50),
  statut VARCHAR(30) DEFAULT 'en_attente_acces'
    CHECK (statut IN ('en_attente_acces', 'connecte', 'audite', 'en_intervention', 'archive')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sites_existants_societe
  ON public.sites_existants(societe_id);

-- Credentials chiffres (AES-256-GCM)
CREATE TABLE IF NOT EXISTS public.sites_existants_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites_existants(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL,
  type_acces VARCHAR(20) NOT NULL
    CHECK (type_acces IN ('ftp', 'sftp', 'ssh', 'wordpress_admin', 'api', 'cpanel')),
  donnees_chiffrees TEXT NOT NULL,
  iv TEXT NOT NULL,
  tag TEXT,
  teste_le TIMESTAMP,
  dernier_test_ok BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credentials_site
  ON public.sites_existants_credentials(site_id);

-- Log des interventions sur sites existants
CREATE TABLE IF NOT EXISTS public.sites_existants_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites_existants(id),
  societe_id UUID NOT NULL,
  type_intervention VARCHAR(50),
  description TEXT,
  backup_url TEXT,
  statut VARCHAR(20) DEFAULT 'en_cours'
    CHECK (statut IN ('en_cours', 'terminee', 'echouee', 'annulee')),
  fichiers_modifies JSONB,
  executee_par UUID,
  executee_le TIMESTAMP DEFAULT NOW(),
  rollback_possible BOOLEAN DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_interventions_site
  ON public.sites_existants_interventions(site_id);

-- RLS sites existants
ALTER TABLE public.sites_existants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites_existants_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites_existants_interventions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
CREATE POLICY sites_ex_select ON public.sites_existants
  FOR SELECT USING (
    societe_id IN (SELECT societe_id FROM public.user_societe_roles WHERE user_id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY sites_ex_insert ON public.sites_existants
  FOR INSERT WITH CHECK (
    societe_id IN (SELECT societe_id FROM public.user_societe_roles WHERE user_id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY creds_select ON public.sites_existants_credentials
  FOR SELECT USING (
    societe_id IN (SELECT societe_id FROM public.user_societe_roles WHERE user_id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY interv_select ON public.sites_existants_interventions
  FOR SELECT USING (
    societe_id IN (SELECT societe_id FROM public.user_societe_roles WHERE user_id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7. Verification
SELECT code, nom, prix_creation_eur, prix_mensuel_eur, quotas
FROM public.studio_forfaits
ORDER BY ordre;

-- =============================================
-- FIN migration 40 — Passe 37
-- 5 nouvelles tables, 3 forfaits mis a jour
-- =============================================
