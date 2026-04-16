-- =====================================================================
-- JADOMI — Multi-sociétés : Module Société Commerciale (Phase 5)
-- À exécuter APRÈS 01_foundations.sql et 02_sci.sql (séquence partagée)
-- Idempotent.
-- =====================================================================

-- ---------- Catalogue produits ----------
CREATE TABLE IF NOT EXISTS public.produits_societe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  reference text,
  designation text NOT NULL,
  description text,
  prix_ht numeric(12,2) NOT NULL DEFAULT 0,
  taux_tva numeric(5,2) NOT NULL DEFAULT 20,
  unite text DEFAULT 'unité',
  stock_actuel integer DEFAULT 0,
  stock_alerte integer DEFAULT 0,
  image_url text,
  code_barre text,
  source text DEFAULT 'manuel' CHECK (source IN ('manuel','csv','wordpress','api','scan','barcode')),
  external_id text,
  actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (societe_id, reference)
);
CREATE INDEX IF NOT EXISTS idx_produits_societe ON public.produits_societe(societe_id);
CREATE INDEX IF NOT EXISTS idx_produits_designation ON public.produits_societe(societe_id, designation);
CREATE INDEX IF NOT EXISTS idx_produits_code_barre ON public.produits_societe(societe_id, code_barre);

-- ---------- Documents liés à un produit ----------
CREATE TABLE IF NOT EXISTS public.documents_produit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_id uuid NOT NULL REFERENCES public.produits_societe(id) ON DELETE CASCADE,
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  type text CHECK (type IN ('fiche_technique','doc_commerciale','photo','autre')),
  nom text,
  url text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_docprod_produit ON public.documents_produit(produit_id);

-- ---------- Clients ----------
CREATE TABLE IF NOT EXISTS public.clients_societe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'professionnel' CHECK (type IN ('professionnel','particulier')),
  raison_sociale text,
  nom text,
  prenom text,
  siren text,
  tva_intracom text,
  adresse text,
  code_postal text,
  ville text,
  pays text DEFAULT 'France',
  email text,
  telephone text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clients_societe ON public.clients_societe(societe_id);
CREATE INDEX IF NOT EXISTS idx_clients_email ON public.clients_societe(societe_id, email);

-- ---------- Devis ----------
CREATE TABLE IF NOT EXISTS public.devis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients_societe(id) ON DELETE SET NULL,
  numero text NOT NULL,
  date_emission date NOT NULL DEFAULT current_date,
  date_validite date NOT NULL DEFAULT (current_date + INTERVAL '30 days')::date,
  statut text DEFAULT 'brouillon' CHECK (statut IN ('brouillon','envoye','accepte','refuse','expire')),
  lignes jsonb NOT NULL DEFAULT '[]'::jsonb,
  sous_total_ht numeric(12,2) NOT NULL DEFAULT 0,
  total_tva numeric(12,2) NOT NULL DEFAULT 0,
  total_ttc numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  conditions text,
  pdf_url text,
  envoye_at timestamptz,
  accepte_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (societe_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_devis_societe ON public.devis(societe_id);
CREATE INDEX IF NOT EXISTS idx_devis_client ON public.devis(client_id);
CREATE INDEX IF NOT EXISTS idx_devis_statut ON public.devis(societe_id, statut);

-- ---------- Factures ----------
CREATE TABLE IF NOT EXISTS public.factures_societe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients_societe(id) ON DELETE SET NULL,
  devis_id uuid REFERENCES public.devis(id) ON DELETE SET NULL,
  numero text NOT NULL,
  date_emission date NOT NULL DEFAULT current_date,
  date_echeance date NOT NULL DEFAULT (current_date + INTERVAL '30 days')::date,
  statut text DEFAULT 'brouillon' CHECK (statut IN ('brouillon','envoyee','payee','partielle','retard','annulee')),
  lignes jsonb NOT NULL DEFAULT '[]'::jsonb,
  sous_total_ht numeric(12,2) NOT NULL DEFAULT 0,
  total_tva numeric(12,2) NOT NULL DEFAULT 0,
  total_ttc numeric(12,2) NOT NULL DEFAULT 0,
  montant_paye numeric(12,2) NOT NULL DEFAULT 0,
  stripe_payment_intent text,
  stripe_payment_link text,
  nb_echeances integer DEFAULT 1 CHECK (nb_echeances IN (1,2,3,4)),
  notes text,
  pdf_url text,
  envoyee_at timestamptz,
  payee_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (societe_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_factures_societe ON public.factures_societe(societe_id);
CREATE INDEX IF NOT EXISTS idx_factures_client ON public.factures_societe(client_id);
CREATE INDEX IF NOT EXISTS idx_factures_statut ON public.factures_societe(societe_id, statut);
CREATE INDEX IF NOT EXISTS idx_factures_echeance ON public.factures_societe(date_echeance) WHERE statut IN ('envoyee','partielle','retard');

-- ---------- Échéances facture (paiement en plusieurs fois) ----------
CREATE TABLE IF NOT EXISTS public.factures_echeances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id uuid NOT NULL REFERENCES public.factures_societe(id) ON DELETE CASCADE,
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  rang integer NOT NULL,
  montant numeric(12,2) NOT NULL,
  date_prevue date NOT NULL,
  date_payee timestamptz,
  stripe_payment_intent text,
  statut text DEFAULT 'en_attente' CHECK (statut IN ('en_attente','payee','echec')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (facture_id, rang)
);
CREATE INDEX IF NOT EXISTS idx_echeances_facture ON public.factures_echeances(facture_id);

-- ---------- Relances factures ----------
CREATE TABLE IF NOT EXISTS public.relances_factures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id uuid NOT NULL REFERENCES public.factures_societe(id) ON DELETE CASCADE,
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('rappel','formelle','mise_en_demeure')),
  date_envoi timestamptz DEFAULT now(),
  contenu text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_relances_fact_facture ON public.relances_factures(facture_id);

-- ---------- Factures fournisseurs (scanner email) ----------
CREATE TABLE IF NOT EXISTS public.factures_fournisseurs_societe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  fournisseur text,
  numero_fournisseur text,
  date_emission date,
  montant_ht numeric(12,2) DEFAULT 0,
  total_tva numeric(12,2) DEFAULT 0,
  montant_ttc numeric(12,2) DEFAULT 0,
  produits jsonb DEFAULT '[]'::jsonb,
  pdf_url text,
  source_email text,
  statut text DEFAULT 'nouvelle' CHECK (statut IN ('nouvelle','validee','rejetee','integree')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_factfourn_societe ON public.factures_fournisseurs_societe(societe_id);

-- ---------- Intégration WordPress (config) ----------
CREATE TABLE IF NOT EXISTS public.integrations_wordpress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  site_url text NOT NULL,
  consumer_key text,
  consumer_secret text,
  webhook_secret text,
  actif boolean DEFAULT true,
  dernier_sync timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (societe_id)
);

-- ---------- Triggers updated_at ----------
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'produits_societe','clients_societe','devis','factures_societe',
    'factures_fournisseurs_societe','integrations_wordpress'])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated ON public.%1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', t);
  END LOOP;
END$$;

-- =====================================================================
-- RLS
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'produits_societe','documents_produit','clients_societe','devis',
    'factures_societe','factures_echeances','relances_factures',
    'factures_fournisseurs_societe','integrations_wordpress'])
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
-- FIN Phase 5 (Commerce) — schéma complet
-- =====================================================================
