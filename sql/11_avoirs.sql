-- =====================================================================
-- JADOMI — Module Avoirs (comptabilité française)
-- À exécuter APRÈS sql/multi_societes/03_commerce.sql
-- Idempotent.
-- =====================================================================
-- Contexte légal :
--   En comptabilité française, une facture émise ne peut être NI
--   supprimée NI modifiée. La correction s'effectue exclusivement via
--   l'émission d'un avoir (note de crédit) qui référence la facture
--   d'origine. La numérotation des avoirs doit être séquentielle,
--   continue, sans trou, et horodatée.
-- =====================================================================

-- ---------- Table avoirs ----------
CREATE TABLE IF NOT EXISTS public.avoirs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  facture_id uuid NOT NULL REFERENCES public.factures_societe(id) ON DELETE RESTRICT,
  client_id uuid REFERENCES public.clients_societe(id) ON DELETE SET NULL,
  numero text NOT NULL,
  date_emission date NOT NULL DEFAULT current_date,
  motif text,
  type_avoir text NOT NULL DEFAULT 'total' CHECK (type_avoir IN ('total','partiel')),
  lignes jsonb NOT NULL DEFAULT '[]'::jsonb,
  sous_total_ht numeric(12,2) NOT NULL DEFAULT 0,
  total_tva numeric(12,2) NOT NULL DEFAULT 0,
  total_ttc numeric(12,2) NOT NULL DEFAULT 0,
  pdf_url text,
  envoye_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (societe_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_avoirs_societe ON public.avoirs(societe_id);
CREATE INDEX IF NOT EXISTS idx_avoirs_facture ON public.avoirs(facture_id);
CREATE INDEX IF NOT EXISTS idx_avoirs_client ON public.avoirs(client_id);
CREATE INDEX IF NOT EXISTS idx_avoirs_date ON public.avoirs(societe_id, date_emission);

-- ---------- Séquence numéros AVOIR-YYYY-NNN (par société, par année) ----------
CREATE TABLE IF NOT EXISTS public.avoirs_sequences (
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  annee integer NOT NULL,
  dernier_numero integer NOT NULL DEFAULT 0,
  PRIMARY KEY (societe_id, annee)
);

-- Fonction d'attribution séquentielle atomique (sans trou)
CREATE OR REPLACE FUNCTION public.prochain_numero_avoir(p_societe_id uuid, p_annee integer DEFAULT NULL)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_annee integer := COALESCE(p_annee, EXTRACT(YEAR FROM current_date)::int);
  v_next integer;
BEGIN
  INSERT INTO public.avoirs_sequences(societe_id, annee, dernier_numero)
  VALUES (p_societe_id, v_annee, 1)
  ON CONFLICT (societe_id, annee)
  DO UPDATE SET dernier_numero = public.avoirs_sequences.dernier_numero + 1
  RETURNING dernier_numero INTO v_next;

  RETURN 'AVOIR-' || v_annee::text || '-' || LPAD(v_next::text, 3, '0');
END;
$$;

-- ---------- Trigger updated_at ----------
DROP TRIGGER IF EXISTS trg_avoirs_updated ON public.avoirs;
CREATE TRIGGER trg_avoirs_updated
  BEFORE UPDATE ON public.avoirs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Garde-fou : interdit modification / suppression d'un avoir déjà envoyé ----------
-- (règle comptable : un avoir émis est définitif, seul pdf_url / envoye_at peut évoluer)
CREATE OR REPLACE FUNCTION public.avoirs_protect_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.envoye_at IS NOT NULL THEN
      RAISE EXCEPTION 'Avoir % déjà envoyé : suppression interdite (comptabilité française)', OLD.numero;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.envoye_at IS NOT NULL THEN
    IF NEW.numero <> OLD.numero
       OR NEW.date_emission <> OLD.date_emission
       OR NEW.sous_total_ht <> OLD.sous_total_ht
       OR NEW.total_tva <> OLD.total_tva
       OR NEW.total_ttc <> OLD.total_ttc
       OR NEW.lignes::text <> OLD.lignes::text
       OR NEW.facture_id <> OLD.facture_id THEN
      RAISE EXCEPTION 'Avoir % déjà envoyé : modification comptable interdite', OLD.numero;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_avoirs_immutable ON public.avoirs;
CREATE TRIGGER trg_avoirs_immutable
  BEFORE UPDATE OR DELETE ON public.avoirs
  FOR EACH ROW EXECUTE FUNCTION public.avoirs_protect_immutable();

-- ---------- RLS ----------
ALTER TABLE public.avoirs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS avoirs_all ON public.avoirs;
CREATE POLICY avoirs_all ON public.avoirs
  FOR ALL
  USING (public.is_member_of_societe(societe_id))
  WITH CHECK (public.is_member_of_societe(societe_id));

ALTER TABLE public.avoirs_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS avoirs_sequences_all ON public.avoirs_sequences;
CREATE POLICY avoirs_sequences_all ON public.avoirs_sequences
  FOR ALL
  USING (public.is_member_of_societe(societe_id))
  WITH CHECK (public.is_member_of_societe(societe_id));

-- ---------- Extension statut facture : 'annulee' existe déjà ----------
-- Rien à faire : le CHECK de factures_societe.statut inclut déjà 'annulee'.

-- =====================================================================
-- Extension societes : emails spécialisés + URL site (si absent)
-- (utilisés pour l'envoi devis/factures et import catalogue)
-- =====================================================================
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS email_facturation text;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS email_mailing text;
-- site_web existe déjà dans 01_foundations.sql

-- =====================================================================
-- FIN Phase Avoirs
-- =====================================================================
