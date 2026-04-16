-- =====================================================================
-- JADOMI — Multi-sociétés : Module SCI (Phase 4)
-- À exécuter dans Supabase SQL Editor APRÈS 01_foundations.sql
-- Idempotent.
-- =====================================================================
-- Tables : biens_immobiliers, locataires, quittances, relances_sci
-- RLS strict via helper is_member_of_societe
-- =====================================================================

-- ---------- Biens immobiliers ----------
CREATE TABLE IF NOT EXISTS public.biens_immobiliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  reference text,
  type text CHECK (type IN ('residentiel','professionnel','mixte')),
  adresse text,
  code_postal text,
  ville text,
  surface numeric(10,2),
  description text,
  actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_biens_societe ON public.biens_immobiliers(societe_id);

-- ---------- Locataires ----------
CREATE TABLE IF NOT EXISTS public.locataires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  bien_id uuid REFERENCES public.biens_immobiliers(id) ON DELETE SET NULL,
  nom text,
  prenom text,
  raison_sociale text,
  adresse text,
  code_postal text,
  ville text,
  email text,
  telephone text,
  type_bail text CHECK (type_bail IN ('habitation','commercial','professionnel')),
  date_debut date,
  duree_mois integer,
  loyer_ht numeric(10,2) NOT NULL DEFAULT 0,
  charges_incluses boolean DEFAULT false,
  montant_charges numeric(10,2) DEFAULT 0,
  depot_garantie numeric(10,2) DEFAULT 0,
  jour_echeance integer DEFAULT 1 CHECK (jour_echeance BETWEEN 1 AND 28),
  actif boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_locataires_societe ON public.locataires(societe_id);
CREATE INDEX IF NOT EXISTS idx_locataires_bien ON public.locataires(bien_id);
CREATE INDEX IF NOT EXISTS idx_locataires_actif ON public.locataires(societe_id, actif);

-- ---------- Quittances ----------
CREATE TABLE IF NOT EXISTS public.quittances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  locataire_id uuid NOT NULL REFERENCES public.locataires(id) ON DELETE CASCADE,
  numero text NOT NULL,
  mois integer NOT NULL CHECK (mois BETWEEN 1 AND 12),
  annee integer NOT NULL,
  loyer_ht numeric(10,2) NOT NULL DEFAULT 0,
  charges numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  statut text DEFAULT 'generee' CHECK (statut IN ('generee','envoyee','payee','impayee')),
  date_envoi timestamptz,
  date_paiement timestamptz,
  pdf_url text,
  meta jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (societe_id, numero),
  UNIQUE (locataire_id, mois, annee)
);
CREATE INDEX IF NOT EXISTS idx_quittances_societe ON public.quittances(societe_id);
CREATE INDEX IF NOT EXISTS idx_quittances_statut ON public.quittances(societe_id, statut);
CREATE INDEX IF NOT EXISTS idx_quittances_periode ON public.quittances(societe_id, annee, mois);

-- ---------- Relances SCI ----------
CREATE TABLE IF NOT EXISTS public.relances_sci (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quittance_id uuid NOT NULL REFERENCES public.quittances(id) ON DELETE CASCADE,
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('rappel','formelle','mise_en_demeure')),
  date_envoi timestamptz DEFAULT now(),
  contenu text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_relances_quittance ON public.relances_sci(quittance_id);
CREATE INDEX IF NOT EXISTS idx_relances_societe ON public.relances_sci(societe_id);

-- ---------- Triggers updated_at ----------
DROP TRIGGER IF EXISTS trg_biens_updated ON public.biens_immobiliers;
CREATE TRIGGER trg_biens_updated BEFORE UPDATE ON public.biens_immobiliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_locataires_updated ON public.locataires;
CREATE TRIGGER trg_locataires_updated BEFORE UPDATE ON public.locataires
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_quittances_updated ON public.quittances;
CREATE TRIGGER trg_quittances_updated BEFORE UPDATE ON public.quittances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- RLS
-- =====================================================================
ALTER TABLE public.biens_immobiliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locataires        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quittances        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relances_sci      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS biens_all ON public.biens_immobiliers;
CREATE POLICY biens_all ON public.biens_immobiliers
  FOR ALL USING (public.is_member_of_societe(societe_id))
          WITH CHECK (public.is_member_of_societe(societe_id));

DROP POLICY IF EXISTS locataires_all ON public.locataires;
CREATE POLICY locataires_all ON public.locataires
  FOR ALL USING (public.is_member_of_societe(societe_id))
          WITH CHECK (public.is_member_of_societe(societe_id));

DROP POLICY IF EXISTS quittances_all ON public.quittances;
CREATE POLICY quittances_all ON public.quittances
  FOR ALL USING (public.is_member_of_societe(societe_id))
          WITH CHECK (public.is_member_of_societe(societe_id));

DROP POLICY IF EXISTS relances_sci_all ON public.relances_sci;
CREATE POLICY relances_sci_all ON public.relances_sci
  FOR ALL USING (public.is_member_of_societe(societe_id))
          WITH CHECK (public.is_member_of_societe(societe_id));

-- =====================================================================
-- Séquence de numérotation par société/année (persistée en table)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.compteurs_numerotation (
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('quittance','devis','facture','facture_fournisseur')),
  annee integer NOT NULL,
  dernier_numero integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (societe_id, type, annee)
);
ALTER TABLE public.compteurs_numerotation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compteurs_all ON public.compteurs_numerotation;
CREATE POLICY compteurs_all ON public.compteurs_numerotation
  FOR ALL USING (public.is_member_of_societe(societe_id))
          WITH CHECK (public.is_member_of_societe(societe_id));

-- Fonction : prochaine numérotation (atomique, jamais de trou, jamais de remise à zéro dans l'année)
CREATE OR REPLACE FUNCTION public.next_numero(p_societe uuid, p_type text, p_annee integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  INSERT INTO public.compteurs_numerotation (societe_id, type, annee, dernier_numero)
  VALUES (p_societe, p_type, p_annee, 1)
  ON CONFLICT (societe_id, type, annee)
  DO UPDATE SET dernier_numero = public.compteurs_numerotation.dernier_numero + 1,
                updated_at = now()
  RETURNING dernier_numero INTO v_next;
  RETURN v_next;
END;
$$;

-- =====================================================================
-- FIN Phase 4 (SCI) — schéma complet
-- =====================================================================
