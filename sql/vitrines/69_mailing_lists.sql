-- =====================================================================
-- JADOMI — Module Mailing : Listes de diffusion (Passe 69)
-- Système de listes de contacts pour campagnes ciblées
-- À exécuter APRÈS sql/multi_societes/04_mailing.sql
-- Idempotent.
-- =====================================================================

-- ---------- Listes de diffusion ----------
CREATE TABLE IF NOT EXISTS public.mailing_lists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'custom' CHECK (type IN ('custom','patients','professionnels','fournisseurs','prospects')),
  filters JSONB DEFAULT '{}',
  contacts_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ml_societe ON public.mailing_lists(societe_id);

-- ---------- Contacts des listes ----------
CREATE TABLE IF NOT EXISTS public.mailing_list_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id UUID REFERENCES public.mailing_lists(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nom TEXT,
  prenom TEXT,
  telephone TEXT,
  profession TEXT,
  ville TEXT,
  tags JSONB DEFAULT '[]',
  statut TEXT DEFAULT 'actif' CHECK (statut IN ('actif','desabonne','bounced')),
  source TEXT DEFAULT 'manuel',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(list_id, email)
);

CREATE INDEX IF NOT EXISTS idx_mlc_list ON public.mailing_list_contacts(list_id);
CREATE INDEX IF NOT EXISTS idx_mlc_email ON public.mailing_list_contacts(email);
CREATE INDEX IF NOT EXISTS idx_mlc_statut ON public.mailing_list_contacts(statut);

-- ---------- Historique des campagnes envoyées à une liste ----------
CREATE TABLE IF NOT EXISTS public.mailing_list_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id UUID REFERENCES public.mailing_lists(id) ON DELETE CASCADE,
  campagne_id UUID REFERENCES public.campagnes_mailing(id) ON DELETE SET NULL,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  nb_envoyes INTEGER DEFAULT 0,
  nb_ouverts INTEGER DEFAULT 0,
  nb_clics INTEGER DEFAULT 0,
  nb_desabonnes INTEGER DEFAULT 0,
  nb_bounces INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mlcmp_list ON public.mailing_list_campaigns(list_id);

-- ---------- Forfaits mailing ----------
CREATE TABLE IF NOT EXISTS public.mailing_packs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  pack TEXT NOT NULL CHECK (pack IN ('gratuit','pack_2500','pack_10000','pack_50000','illimite')),
  emails_inclus INTEGER NOT NULL,
  prix_mensuel NUMERIC(10,2) NOT NULL DEFAULT 0,
  emails_envoyes_mois INTEGER DEFAULT 0,
  mois_courant TEXT, -- format YYYY-MM
  stripe_subscription_id TEXT,
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mp_societe ON public.mailing_packs(societe_id);

-- ---------- Triggers updated_at ----------
DROP TRIGGER IF EXISTS trg_mailing_lists_updated ON public.mailing_lists;
CREATE TRIGGER trg_mailing_lists_updated BEFORE UPDATE ON public.mailing_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_mailing_packs_updated ON public.mailing_packs;
CREATE TRIGGER trg_mailing_packs_updated BEFORE UPDATE ON public.mailing_packs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- RLS
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'mailing_lists','mailing_list_campaigns','mailing_packs'])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_all ON public.%1$s;', t);
    EXECUTE format(
      'CREATE POLICY %1$s_all ON public.%1$s FOR ALL USING (public.is_member_of_societe(societe_id)) WITH CHECK (public.is_member_of_societe(societe_id));',
      t
    );
  END LOOP;
END$$;

-- Note : mailing_list_contacts n'a pas de societe_id directement,
-- on applique la RLS via la liste parente. Ajoutons une policy join :
ALTER TABLE public.mailing_list_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mailing_list_contacts_all ON public.mailing_list_contacts;
CREATE POLICY mailing_list_contacts_via_list ON public.mailing_list_contacts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.mailing_lists ml
      WHERE ml.id = mailing_list_contacts.list_id
      AND public.is_member_of_societe(ml.societe_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.mailing_lists ml
      WHERE ml.id = mailing_list_contacts.list_id
      AND public.is_member_of_societe(ml.societe_id)
    )
  );

-- =====================================================================
-- FIN 69_mailing_lists — Listes de diffusion
-- =====================================================================
