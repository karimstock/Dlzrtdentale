-- =============================================
-- Passe 69 - JADOMI App Livreur + Tracking GPS
-- Suivi temps réel des coursiers prothésistes
-- =============================================

-- =============================================
-- 1. Ajout colonnes sur labo_livreurs
-- Token d'accès pour app mobile livreur
-- =============================================
ALTER TABLE public.labo_livreurs
  ADD COLUMN IF NOT EXISTS access_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS token_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS derniere_position JSONB,
  ADD COLUMN IF NOT EXISTS position_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS app_installee BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.labo_livreurs.access_token IS 'Token unique pour authentifier le livreur dans l''app mobile (pas de compte Supabase nécessaire).';
COMMENT ON COLUMN public.labo_livreurs.derniere_position IS 'Dernière position GPS connue {lat, lng, precision, vitesse, timestamp}.';

-- =============================================
-- 2. labo_positions_livreur
-- Historique des positions GPS (pings toutes les 30s)
-- =============================================
CREATE TABLE IF NOT EXISTS public.labo_positions_livreur (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  livreur_id UUID NOT NULL REFERENCES public.labo_livreurs(id) ON DELETE CASCADE,
  tournee_id UUID REFERENCES public.labo_tournees_livreur(id) ON DELETE SET NULL,
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  precision_m INTEGER, -- précision GPS en mètres
  vitesse_kmh DECIMAL(5,1),
  heading DECIMAL(5,1), -- direction en degrés (0-360)
  batterie INTEGER, -- pourcentage batterie du téléphone
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.labo_positions_livreur IS 'Historique des positions GPS du livreur pendant ses tournées. Ping toutes les 30 secondes.';

-- Nettoyage auto : garder seulement 7 jours d'historique
-- (à exécuter en cron si besoin)
-- DELETE FROM labo_positions_livreur WHERE created_at < now() - interval '7 days';

-- =============================================
-- 3. labo_notifications_dentiste
-- Notifications de livraison vers les dentistes
-- =============================================
CREATE TABLE IF NOT EXISTS public.labo_notifications_dentiste (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES public.labo_prothesistes(id) ON DELETE CASCADE,
  dentiste_client_id UUID NOT NULL REFERENCES public.dentistes_clients(id) ON DELETE CASCADE,
  tournee_id UUID REFERENCES public.labo_tournees_livreur(id),
  demande_id UUID REFERENCES public.labo_demandes_passage(id),
  type TEXT NOT NULL CHECK (type IN (
    'en_route',          -- le livreur est en route vers ce dentiste
    'arrive_bientot',    -- le livreur est au stop précédent (environ 10-15 min)
    'sur_place',         -- le livreur est arrivé
    'livre',             -- livraison effectuée
    'absent_passage',    -- livreur passé mais dentiste absent
    'recupere'           -- empreinte/travail récupéré
  )),
  message TEXT NOT NULL,
  lien_suivi TEXT, -- lien vers page de suivi pour dentiste non-JADOMI
  email_envoye BOOLEAN DEFAULT false,
  notification_push BOOLEAN DEFAULT false,
  lu BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.labo_notifications_dentiste IS 'Notifications envoyées aux dentistes pour les informer de l''avancement des livraisons. Incitation à rejoindre JADOMI.';

-- =============================================
-- 4. INDEX
-- =============================================

-- Positions
CREATE INDEX IF NOT EXISTS idx_positions_livreur_id
  ON public.labo_positions_livreur(livreur_id);
CREATE INDEX IF NOT EXISTS idx_positions_tournee
  ON public.labo_positions_livreur(tournee_id);
CREATE INDEX IF NOT EXISTS idx_positions_created
  ON public.labo_positions_livreur(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_positions_livreur_recent
  ON public.labo_positions_livreur(livreur_id, created_at DESC);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notif_dentiste_prothesiste
  ON public.labo_notifications_dentiste(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_notif_dentiste_client
  ON public.labo_notifications_dentiste(dentiste_client_id);
CREATE INDEX IF NOT EXISTS idx_notif_dentiste_tournee
  ON public.labo_notifications_dentiste(tournee_id);
CREATE INDEX IF NOT EXISTS idx_notif_dentiste_recent
  ON public.labo_notifications_dentiste(created_at DESC);

-- Token livreur (pour auth rapide)
CREATE INDEX IF NOT EXISTS idx_livreurs_token
  ON public.labo_livreurs(access_token) WHERE access_token IS NOT NULL;

-- =============================================
-- 5. RLS
-- =============================================

-- Positions : même règle que livreurs
ALTER TABLE public.labo_positions_livreur ENABLE ROW LEVEL SECURITY;

CREATE POLICY labo_positions_select ON public.labo_positions_livreur
  FOR SELECT TO authenticated
  USING (
    livreur_id IN (
      SELECT id FROM public.labo_livreurs
      WHERE public.labo_user_owns_prothesiste(prothesiste_id)
    )
  );

CREATE POLICY labo_positions_insert ON public.labo_positions_livreur
  FOR INSERT TO authenticated
  WITH CHECK (
    livreur_id IN (
      SELECT id FROM public.labo_livreurs
      WHERE public.labo_user_owns_prothesiste(prothesiste_id)
    )
  );

-- Notifications dentiste
ALTER TABLE public.labo_notifications_dentiste ENABLE ROW LEVEL SECURITY;

CREATE POLICY labo_notif_dentiste_select ON public.labo_notifications_dentiste
  FOR SELECT TO authenticated
  USING (public.labo_user_owns_prothesiste(prothesiste_id));

CREATE POLICY labo_notif_dentiste_insert ON public.labo_notifications_dentiste
  FOR INSERT TO authenticated
  WITH CHECK (public.labo_user_owns_prothesiste(prothesiste_id));

-- =============================================
-- FIN Passe 69 - App Livreur + Tracking GPS
-- 2 nouvelles tables + ALTER labo_livreurs
-- =============================================
