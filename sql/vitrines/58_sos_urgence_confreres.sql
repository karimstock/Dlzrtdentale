-- =============================================
-- Passe 58 - SOS Urgence Confreres
-- Module de mise en relation urgente entre
-- cabinets dentaires pour placement de patients
-- en situation d'urgence (douleur, trauma, etc.)
-- =============================================

-- =============================================
-- 1. sos_urgence_requests
-- Demandes d'urgence emises par un cabinet
-- pour placer un patient chez un confrere.
-- Patient anonymise (initiales uniquement).
-- =============================================
CREATE TABLE IF NOT EXISTS public.sos_urgence_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cabinet emetteur
  sender_societe_id UUID NOT NULL,
  sender_user_id UUID NOT NULL,
  sender_name TEXT NOT NULL,

  -- Patient (anonymise, jamais le nom complet)
  patient_initials TEXT,

  -- Type d'urgence
  urgency_type TEXT NOT NULL CHECK (urgency_type IN (
    'douleur_aigue',
    'traumatisme',
    'infection',
    'prothese_cassee',
    'autre'
  )),
  description TEXT CHECK (char_length(description) <= 200),

  -- Localisation
  quartier TEXT,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  radius_km INTEGER DEFAULT 10,

  -- Delai
  deadline TIMESTAMPTZ,

  -- Statut
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'expired', 'cancelled')),

  -- Acceptation
  accepted_by_societe_id UUID,
  accepted_by_user_id UUID,
  accepted_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.sos_urgence_requests IS 'Demandes SOS urgence entre confreres dentistes. Patient anonymise (initiales). Rayon geographique configurable.';

-- =============================================
-- 2. sos_urgence_notifications
-- Notifications envoyees aux cabinets dans le
-- rayon de recherche pour chaque demande SOS.
-- =============================================
CREATE TABLE IF NOT EXISTS public.sos_urgence_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Lien vers la demande
  request_id UUID NOT NULL REFERENCES public.sos_urgence_requests(id) ON DELETE CASCADE,

  -- Cabinet cible
  target_societe_id UUID NOT NULL,
  target_user_id UUID,

  -- Statut de la notification
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'seen', 'accepted', 'declined')),
  seen_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.sos_urgence_notifications IS 'Notifications SOS envoyees aux confreres dans le rayon de recherche. Tracking vu/accepte/decline.';

-- =============================================
-- 3. INDEX
-- =============================================
CREATE INDEX IF NOT EXISTS idx_sos_requests_status
  ON public.sos_urgence_requests(status);

CREATE INDEX IF NOT EXISTS idx_sos_requests_sender
  ON public.sos_urgence_requests(sender_societe_id);

CREATE INDEX IF NOT EXISTS idx_sos_requests_created
  ON public.sos_urgence_requests(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sos_requests_status_created
  ON public.sos_urgence_requests(status, created_at DESC)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_sos_notifications_request
  ON public.sos_urgence_notifications(request_id);

CREATE INDEX IF NOT EXISTS idx_sos_notifications_target
  ON public.sos_urgence_notifications(target_societe_id);

-- =============================================
-- 4. RLS POLICIES
-- =============================================
ALTER TABLE public.sos_urgence_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_urgence_notifications ENABLE ROW LEVEL SECURITY;

-- Requests: un user voit les demandes open + ses propres demandes
DROP POLICY IF EXISTS sos_requests_select ON public.sos_urgence_requests;
CREATE POLICY sos_requests_select ON public.sos_urgence_requests
  FOR SELECT USING (
    status = 'open'
    OR sender_user_id = auth.uid()
    OR accepted_by_user_id = auth.uid()
  );

-- Requests: un user ne peut inserer que pour son propre compte
DROP POLICY IF EXISTS sos_requests_insert ON public.sos_urgence_requests;
CREATE POLICY sos_requests_insert ON public.sos_urgence_requests
  FOR INSERT WITH CHECK (
    sender_user_id = auth.uid()
  );

-- Requests: un user peut update ses propres demandes (annuler) ou accepter une demande open
DROP POLICY IF EXISTS sos_requests_update ON public.sos_urgence_requests;
CREATE POLICY sos_requests_update ON public.sos_urgence_requests
  FOR UPDATE USING (
    sender_user_id = auth.uid()
    OR (status = 'open' AND accepted_by_user_id = auth.uid())
  );

-- Notifications: un user voit les notifications qui le concernent
DROP POLICY IF EXISTS sos_notifications_select ON public.sos_urgence_notifications;
CREATE POLICY sos_notifications_select ON public.sos_urgence_notifications
  FOR SELECT USING (
    target_user_id = auth.uid()
    OR request_id IN (
      SELECT id FROM public.sos_urgence_requests
      WHERE sender_user_id = auth.uid()
    )
  );

-- Notifications: insertion par le systeme (sender de la request)
DROP POLICY IF EXISTS sos_notifications_insert ON public.sos_urgence_notifications;
CREATE POLICY sos_notifications_insert ON public.sos_urgence_notifications
  FOR INSERT WITH CHECK (
    request_id IN (
      SELECT id FROM public.sos_urgence_requests
      WHERE sender_user_id = auth.uid()
    )
  );

-- Notifications: update par le destinataire (marquer vu/accepte/decline)
DROP POLICY IF EXISTS sos_notifications_update ON public.sos_urgence_notifications;
CREATE POLICY sos_notifications_update ON public.sos_urgence_notifications
  FOR UPDATE USING (
    target_user_id = auth.uid()
  );

-- =============================================
-- 5. Trigger updated_at automatique
-- =============================================
CREATE OR REPLACE FUNCTION public.sos_urgence_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sos_urgence_requests_updated_at ON public.sos_urgence_requests;
CREATE TRIGGER trg_sos_urgence_requests_updated_at
  BEFORE UPDATE ON public.sos_urgence_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.sos_urgence_requests_updated_at();
