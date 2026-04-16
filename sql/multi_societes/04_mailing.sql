-- =====================================================================
-- JADOMI — Multi-sociétés : Module Mailing & Campagnes (Phase 6)
-- À exécuter APRÈS 01_foundations.sql.
-- Idempotent.
-- =====================================================================

-- ---------- Bases emails importées ----------
CREATE TABLE IF NOT EXISTS public.bases_emails_importees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  nom text NOT NULL,
  nb_contacts integer DEFAULT 0,
  fichier_url text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bases_societe ON public.bases_emails_importees(societe_id);

-- ---------- Contacts importés ----------
CREATE TABLE IF NOT EXISTS public.contacts_importes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id uuid NOT NULL REFERENCES public.bases_emails_importees(id) ON DELETE CASCADE,
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  email text NOT NULL,
  nom text,
  prenom text,
  societe text,
  actif boolean DEFAULT true,
  desabo_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (base_id, email)
);
CREATE INDEX IF NOT EXISTS idx_contacts_base ON public.contacts_importes(base_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON public.contacts_importes(societe_id, email);

-- ---------- Campagnes mailing ----------
CREATE TABLE IF NOT EXISTS public.campagnes_mailing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  titre text NOT NULL,
  objet_email text NOT NULL,
  contenu_html text,
  cible text NOT NULL CHECK (cible IN ('base_jadomi','base_importee','les_deux')),
  base_id uuid REFERENCES public.bases_emails_importees(id) ON DELETE SET NULL,
  statut text DEFAULT 'brouillon' CHECK (statut IN ('brouillon','planifiee','envoyee','terminee')),
  date_envoi timestamptz,
  nb_envoyes integer DEFAULT 0,
  nb_ouverts integer DEFAULT 0,
  nb_clics integer DEFAULT 0,
  prix_paye numeric(10,2) DEFAULT 0,
  stripe_payment_intent text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_camp_societe ON public.campagnes_mailing(societe_id);
CREATE INDEX IF NOT EXISTS idx_camp_statut ON public.campagnes_mailing(societe_id, statut);

-- ---------- Envois individuels (tracking) ----------
CREATE TABLE IF NOT EXISTS public.campagne_envois (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campagne_id uuid NOT NULL REFERENCES public.campagnes_mailing(id) ON DELETE CASCADE,
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  email text NOT NULL,
  token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  envoye_at timestamptz DEFAULT now(),
  ouvert_at timestamptz,
  clic_at timestamptz,
  desabo_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_envois_campagne ON public.campagne_envois(campagne_id);
CREATE INDEX IF NOT EXISTS idx_envois_token ON public.campagne_envois(token);

-- ---------- Triggers updated_at ----------
DROP TRIGGER IF EXISTS trg_campagnes_updated ON public.campagnes_mailing;
CREATE TRIGGER trg_campagnes_updated BEFORE UPDATE ON public.campagnes_mailing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- RLS
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'bases_emails_importees','contacts_importes','campagnes_mailing','campagne_envois'])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_all ON public.%1$s;', t);
    EXECUTE format(
      'CREATE POLICY %1$s_all ON public.%1$s FOR ALL USING (public.is_member_of_societe(societe_id)) WITH CHECK (public.is_member_of_societe(societe_id));',
      t
    );
  END LOOP;
END$$;

-- =====================================================================
-- FIN Phase 6 (Mailing) — schéma complet
-- =====================================================================
