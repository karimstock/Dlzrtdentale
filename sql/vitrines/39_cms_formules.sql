-- =============================================
-- Passe 36 - CMS 3 formules Studio (Classic/Pro/Expert)
-- Date : 24 avril 2026
-- Objectif : tables pour forfaits + contenus editables + historique
-- =============================================
-- IDEMPOTENT : CREATE IF NOT EXISTS partout
-- ZERO DROP TABLE, ZERO DELETE sans WHERE
-- =============================================

-- 1. Forfaits JADOMI Studio (referentiel des 3 niveaux)
CREATE TABLE IF NOT EXISTS public.studio_forfaits (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  nom VARCHAR(100) NOT NULL,
  prix_mensuel_eur DECIMAL(6,2) NOT NULL,
  stripe_price_id VARCHAR(100),
  features JSONB NOT NULL DEFAULT '{}',
  quotas JSONB NOT NULL DEFAULT '{}',
  ordre INT NOT NULL,
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seeds des 3 forfaits
INSERT INTO public.studio_forfaits
  (code, nom, prix_mensuel_eur, ordre, features, quotas)
VALUES
('classic', 'JADOMI Studio Classic', 29.00, 1,
  '{"cms": false, "modifications": "via_support", "delai_modif_h": 48, "effet_hollywood": false}',
  '{"pages": 1, "photos": 10, "modifications_mois": 2, "articles_blog_mois": 0}'),
('pro', 'JADOMI Studio Pro', 79.00, 2,
  '{"cms": true, "editeur_visuel": true, "preview_live": true, "historique": true, "blog": true, "effet_hollywood": false}',
  '{"pages": 10, "photos": 100, "articles_blog_mois": 4}'),
('expert', 'JADOMI Studio Expert', 199.00, 3,
  '{"cms": true, "editeur_avance": true, "ab_testing": true, "multilangue": true, "analytics_avancees": true, "effet_hollywood": true}',
  '{"pages": "illimite", "photos": "illimite", "langues": 5, "articles_blog_mois": 20}')
ON CONFLICT (code) DO NOTHING;

-- 2. Abonnement d'une organisation a un forfait Studio
CREATE TABLE IF NOT EXISTS public.studio_abonnements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL,
  forfait_id INT NOT NULL REFERENCES public.studio_forfaits(id),
  stripe_subscription_id VARCHAR(100),
  statut VARCHAR(20) DEFAULT 'actif'
    CHECK (statut IN ('actif', 'suspendu', 'annule', 'expire')),
  date_debut DATE NOT NULL DEFAULT CURRENT_DATE,
  date_fin DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_abo_org
  ON public.studio_abonnements(societe_id);
CREATE INDEX IF NOT EXISTS idx_studio_abo_statut
  ON public.studio_abonnements(statut);

-- 3. Contenus editables du site (CMS pour Pro/Expert)
CREATE TABLE IF NOT EXISTS public.site_contenus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL,
  section VARCHAR(50) NOT NULL,
  cle VARCHAR(100) NOT NULL,
  valeur TEXT,
  type VARCHAR(20) DEFAULT 'texte'
    CHECK (type IN ('texte', 'html', 'image', 'lien', 'json', 'horaires')),
  version INT DEFAULT 1,
  publie BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(societe_id, section, cle)
);

CREATE INDEX IF NOT EXISTS idx_site_contenus_org
  ON public.site_contenus(societe_id);

-- 4. Historique modifications (rollback Pro/Expert)
CREATE TABLE IF NOT EXISTS public.site_contenus_historique (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contenu_id UUID NOT NULL REFERENCES public.site_contenus(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL,
  valeur_avant TEXT,
  valeur_apres TEXT,
  modifie_par UUID,
  modifie_le TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_hist_contenu
  ON public.site_contenus_historique(contenu_id);
CREATE INDEX IF NOT EXISTS idx_site_hist_org
  ON public.site_contenus_historique(societe_id);

-- 5. Photos cabinet
CREATE TABLE IF NOT EXISTS public.site_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL,
  url TEXT NOT NULL,
  titre VARCHAR(200),
  description TEXT,
  section VARCHAR(50),
  ordre INT DEFAULT 0,
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_photos_org
  ON public.site_photos(societe_id);

-- 6. Demandes de modification pour formule Classic
CREATE TABLE IF NOT EXISTS public.site_demandes_modif (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL,
  description TEXT NOT NULL,
  statut VARCHAR(20) DEFAULT 'en_attente'
    CHECK (statut IN ('en_attente', 'en_cours', 'terminee', 'refusee')),
  demandee_le TIMESTAMP DEFAULT NOW(),
  traitee_le TIMESTAMP,
  traitee_par UUID,
  notes_internes TEXT
);

CREATE INDEX IF NOT EXISTS idx_site_demandes_org
  ON public.site_demandes_modif(societe_id);

-- 7. RLS policies — chaque orga ne voit que son contenu
ALTER TABLE public.studio_abonnements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_contenus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_contenus_historique ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_demandes_modif ENABLE ROW LEVEL SECURITY;

-- Policy : lecture/ecriture restreinte a l'organisation de l'utilisateur
-- Utilise le meme pattern que les tables existantes JADOMI :
-- L'utilisateur doit avoir un role dans user_societe_roles pour cette organisation

-- studio_abonnements : lecture par membre de l'orga
DO $$ BEGIN
CREATE POLICY studio_abo_select ON public.studio_abonnements
  FOR SELECT USING (
    societe_id IN (
      SELECT societe_id FROM public.user_societe_roles
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- site_contenus : lecture/ecriture par membre de l'orga
DO $$ BEGIN
CREATE POLICY site_contenus_select ON public.site_contenus
  FOR SELECT USING (
    societe_id IN (
      SELECT societe_id FROM public.user_societe_roles
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY site_contenus_insert ON public.site_contenus
  FOR INSERT WITH CHECK (
    societe_id IN (
      SELECT societe_id FROM public.user_societe_roles
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY site_contenus_update ON public.site_contenus
  FOR UPDATE USING (
    societe_id IN (
      SELECT societe_id FROM public.user_societe_roles
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- site_photos : lecture/ecriture par membre de l'orga
DO $$ BEGIN
CREATE POLICY site_photos_select ON public.site_photos
  FOR SELECT USING (
    societe_id IN (
      SELECT societe_id FROM public.user_societe_roles
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY site_photos_all ON public.site_photos
  FOR ALL USING (
    societe_id IN (
      SELECT societe_id FROM public.user_societe_roles
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- site_contenus_historique : lecture seule par membre de l'orga
DO $$ BEGIN
CREATE POLICY site_hist_select ON public.site_contenus_historique
  FOR SELECT USING (
    societe_id IN (
      SELECT societe_id FROM public.user_societe_roles
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- site_demandes_modif : lecture/ecriture par membre de l'orga
DO $$ BEGIN
CREATE POLICY site_demandes_select ON public.site_demandes_modif
  FOR SELECT USING (
    societe_id IN (
      SELECT societe_id FROM public.user_societe_roles
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY site_demandes_insert ON public.site_demandes_modif
  FOR INSERT WITH CHECK (
    societe_id IN (
      SELECT societe_id FROM public.user_societe_roles
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- studio_forfaits : lecture publique (tout le monde peut voir les forfaits)
DO $$ BEGIN
ALTER TABLE public.studio_forfaits ENABLE ROW LEVEL SECURITY;
CREATE POLICY studio_forfaits_public ON public.studio_forfaits
  FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 8. Analyses de sites existants (scanner URL)
CREATE TABLE IF NOT EXISTS public.site_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID,
  url_analysee TEXT NOT NULL,
  type_site VARCHAR(50),
  plateforme_detectee VARCHAR(50),
  theme_detecte VARCHAR(100),
  plugins_detectes JSONB,
  nb_pages INT,
  nb_produits INT,
  has_ecommerce BOOLEAN DEFAULT false,
  has_stripe BOOLEAN DEFAULT false,
  score_performance INT,
  score_seo INT,
  score_complexite INT,
  recommandation VARCHAR(50)
    CHECK (recommandation IN ('reconstruire', 'ameliorer', 'refuser')),
  rapport_complet JSONB,
  analysee_le TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_analyses_org
  ON public.site_analyses(societe_id);
CREATE INDEX IF NOT EXISTS idx_site_analyses_url
  ON public.site_analyses(url_analysee);

ALTER TABLE public.site_analyses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
CREATE POLICY site_analyses_select ON public.site_analyses
  FOR SELECT USING (
    societe_id IN (
      SELECT societe_id FROM public.user_societe_roles
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY site_analyses_insert ON public.site_analyses
  FOR INSERT WITH CHECK (
    societe_id IN (
      SELECT societe_id FROM public.user_societe_roles
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- FIN migration 39 — Passe 36 CMS 3 formules + analyses sites
-- 7 tables creees, RLS actif, seeds inclus
-- =============================================
