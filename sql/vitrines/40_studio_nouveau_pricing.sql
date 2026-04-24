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

-- 6. Verification
SELECT code, nom, prix_creation_eur, prix_mensuel_eur, quotas
FROM public.studio_forfaits
ORDER BY ordre;

-- =============================================
-- FIN migration 40 — Passe 37 nouveaux prix Studio
-- 2 nouvelles tables, 3 forfaits mis a jour
-- =============================================
