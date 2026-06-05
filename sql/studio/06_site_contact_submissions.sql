-- =============================================
-- JADOMI — Table soumissions formulaire contact
-- Pour les sites vitrines générés par JADOMI
-- =============================================

CREATE TABLE IF NOT EXISTS public.site_contact_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL,
  site_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT NOT NULL,
  ip_address TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour requêtes rapides
CREATE INDEX IF NOT EXISTS idx_contact_submissions_societe ON public.site_contact_submissions(societe_id);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_slug ON public.site_contact_submissions(site_slug);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_created ON public.site_contact_submissions(created_at DESC);

-- GRANT obligatoire (mai 2026 Supabase policy)
GRANT SELECT ON public.site_contact_submissions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_contact_submissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_contact_submissions TO service_role;

-- RLS
ALTER TABLE public.site_contact_submissions ENABLE ROW LEVEL SECURITY;

-- Politique : les visiteurs peuvent soumettre (INSERT via anon)
CREATE POLICY "anon_can_submit" ON public.site_contact_submissions
  FOR INSERT TO anon WITH CHECK (true);

-- Politique : les utilisateurs auth voient les soumissions de leur société
CREATE POLICY "auth_own_societe" ON public.site_contact_submissions
  FOR ALL TO authenticated
  USING (societe_id IN (
    SELECT societe_id FROM public.user_societe_roles WHERE user_id = auth.uid()
  ));

-- Politique : service_role a accès total
CREATE POLICY "service_role_all" ON public.site_contact_submissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
