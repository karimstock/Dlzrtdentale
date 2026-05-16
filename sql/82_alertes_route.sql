-- Alertes route communautaires (style Waze)
-- Les utilisateurs JADOMI signalent travaux, bouchons, accidents, routes barrées

CREATE TABLE IF NOT EXISTS public.alertes_route (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  type text NOT NULL CHECK (type IN ('travaux', 'bouchon', 'accident', 'route_barree', 'police', 'danger', 'verglas')),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  description text,
  votes_up int DEFAULT 1,
  votes_down int DEFAULT 0,
  active boolean DEFAULT true,
  expires_at timestamptz DEFAULT (now() + interval '2 hours'),
  created_at timestamptz DEFAULT now()
);

-- Index spatial pour requêtes géographiques
CREATE INDEX IF NOT EXISTS idx_alertes_route_geo ON public.alertes_route (lat, lng) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_alertes_route_expires ON public.alertes_route (expires_at) WHERE active = true;

-- Expirer automatiquement les alertes après 2h
-- (via cron Supabase ou check côté API)

-- Permissions
GRANT SELECT ON public.alertes_route TO anon;
GRANT SELECT, INSERT, UPDATE ON public.alertes_route TO authenticated;
GRANT ALL ON public.alertes_route TO service_role;

ALTER TABLE public.alertes_route ENABLE ROW LEVEL SECURITY;

-- Tout le monde peut lire les alertes actives
CREATE POLICY "alertes_route_read" ON public.alertes_route
  FOR SELECT USING (active = true AND expires_at > now());

-- Les utilisateurs connectés peuvent créer des alertes
CREATE POLICY "alertes_route_insert" ON public.alertes_route
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Les utilisateurs peuvent voter (update votes)
CREATE POLICY "alertes_route_vote" ON public.alertes_route
  FOR UPDATE USING (active = true AND expires_at > now());
