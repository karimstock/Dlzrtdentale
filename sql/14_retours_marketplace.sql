-- =====================================================================
-- JADOMI — Retours client + Marketplace d'occasion (Phase 14)
-- À exécuter APRÈS 13_defectueux_reclamations.sql
-- Idempotent.
-- =====================================================================

-- ---------- Demandes de retour (dentiste/client → fournisseur JADOMI) ----------
CREATE TABLE IF NOT EXISTS public.demandes_retour (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Société qui demande le retour (acheteur / client final)
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Facture d'achat / produit concerné (côté acheteur)
  facture_societe_id uuid REFERENCES public.factures_societe(id) ON DELETE SET NULL,
  produit_id uuid REFERENCES public.produits_societe(id) ON DELETE SET NULL,
  produit_designation text,
  produit_reference text,
  quantite integer NOT NULL DEFAULT 1,
  montant numeric(12,2) NOT NULL DEFAULT 0,

  -- Fournisseur : société JADOMI ou externe
  fournisseur_societe_id uuid REFERENCES public.societes(id) ON DELETE SET NULL,
  fournisseur_nom text,
  fournisseur_email text,

  -- Motif
  raison text NOT NULL CHECK (raison IN (
    'defectueux','erreur_commande','non_conforme','non_deballe','autre'
  )),
  deballe boolean DEFAULT false,
  utilise boolean DEFAULT false,
  emballage_intact boolean DEFAULT true,
  photo_urls jsonb DEFAULT '[]'::jsonb,
  note text,

  -- Workflow fournisseur
  statut text NOT NULL DEFAULT 'en_attente' CHECK (statut IN (
    'en_attente',            -- demande envoyée, pas encore traitée
    'accepte_retour_physique', -- fournisseur accepte le retour physique
    'accepte_nouveau_produit', -- fournisseur envoie un nouveau produit
    'refuse',
    'expire',
    'clos_sans_suite'
  )),
  resolution text,
  etiquette_retour_url text,
  numero_suivi text,
  raison_refus text,

  -- Calcul rentabilité JADOMI (informatif)
  cout_transport_estime numeric(6,2),
  rentable boolean,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_retours_societe ON public.demandes_retour(societe_id);
CREATE INDEX IF NOT EXISTS idx_retours_fournisseur ON public.demandes_retour(fournisseur_societe_id);
CREATE INDEX IF NOT EXISTS idx_retours_statut ON public.demandes_retour(statut, created_at DESC);

DROP TRIGGER IF EXISTS trg_retours_updated ON public.demandes_retour;
CREATE TRIGGER trg_retours_updated
  BEFORE UPDATE ON public.demandes_retour
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.demandes_retour ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS retours_owner_all ON public.demandes_retour;
CREATE POLICY retours_owner_all ON public.demandes_retour
  FOR ALL
  USING (public.is_member_of_societe(societe_id))
  WITH CHECK (public.is_member_of_societe(societe_id));

DROP POLICY IF EXISTS retours_fournisseur_select ON public.demandes_retour;
CREATE POLICY retours_fournisseur_select ON public.demandes_retour
  FOR SELECT
  USING (
    fournisseur_societe_id IS NOT NULL
    AND public.is_member_of_societe(fournisseur_societe_id)
  );

DROP POLICY IF EXISTS retours_fournisseur_update ON public.demandes_retour;
CREATE POLICY retours_fournisseur_update ON public.demandes_retour
  FOR UPDATE
  USING (
    fournisseur_societe_id IS NOT NULL
    AND public.is_member_of_societe(fournisseur_societe_id)
  )
  WITH CHECK (
    fournisseur_societe_id IS NOT NULL
    AND public.is_member_of_societe(fournisseur_societe_id)
  );

-- ---------- Marketplace occasion ----------
CREATE TABLE IF NOT EXISTS public.annonces_market (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendeur_societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  vendeur_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  produit_id uuid REFERENCES public.produits_societe(id) ON DELETE SET NULL,
  designation text NOT NULL,
  description text,
  reference text,
  ean text,

  categorie text,                -- santé, btp, esthetique, ... (secteur)
  etat text NOT NULL CHECK (etat IN (
    'non_deballe','deballe_non_utilise','utilise_bon_etat','defectueux_pieces'
  )),
  photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  quantite integer NOT NULL DEFAULT 1,

  prix_neuf_indicatif numeric(12,2),
  prix_vente numeric(12,2) NOT NULL,
  commission_pct numeric(4,2) DEFAULT 8,
  cout_transport_estime numeric(6,2),

  statut text NOT NULL DEFAULT 'active' CHECK (statut IN (
    'brouillon','active','reservee','vendue','retiree'
  )),
  acheteur_societe_id uuid REFERENCES public.societes(id) ON DELETE SET NULL,
  stripe_payment_intent text,
  vendue_at timestamptz,

  note_vendeur integer CHECK (note_vendeur BETWEEN 1 AND 5),
  note_acheteur integer CHECK (note_acheteur BETWEEN 1 AND 5),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_market_vendeur ON public.annonces_market(vendeur_societe_id);
CREATE INDEX IF NOT EXISTS idx_market_statut ON public.annonces_market(statut, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_categorie ON public.annonces_market(categorie, statut);

DROP TRIGGER IF EXISTS trg_market_updated ON public.annonces_market;
CREATE TRIGGER trg_market_updated
  BEFORE UPDATE ON public.annonces_market
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.annonces_market ENABLE ROW LEVEL SECURITY;

-- Le vendeur (société) peut tout faire
DROP POLICY IF EXISTS market_vendeur_all ON public.annonces_market;
CREATE POLICY market_vendeur_all ON public.annonces_market
  FOR ALL
  USING (public.is_member_of_societe(vendeur_societe_id))
  WITH CHECK (public.is_member_of_societe(vendeur_societe_id));

-- Tous les pros connectés voient les annonces actives + brouillon réservé au vendeur
DROP POLICY IF EXISTS market_public_select ON public.annonces_market;
CREATE POLICY market_public_select ON public.annonces_market
  FOR SELECT
  USING (
    statut IN ('active','reservee','vendue')
    AND auth.uid() IS NOT NULL
  );

-- Acheteur peut mettre à jour (réserver / noter) sa transaction
DROP POLICY IF EXISTS market_acheteur_update ON public.annonces_market;
CREATE POLICY market_acheteur_update ON public.annonces_market
  FOR UPDATE
  USING (
    acheteur_societe_id IS NOT NULL
    AND public.is_member_of_societe(acheteur_societe_id)
  )
  WITH CHECK (
    acheteur_societe_id IS NOT NULL
    AND public.is_member_of_societe(acheteur_societe_id)
  );

-- ---------- Scores fournisseurs (créer si absent) ----------
CREATE TABLE IF NOT EXISTS public.scores_fournisseurs (
  societe_id uuid PRIMARY KEY REFERENCES public.societes(id) ON DELETE CASCADE,
  note_moyenne numeric(3,2),           -- /5
  nb_avis integer DEFAULT 0,
  taux_retours_ok numeric(5,2),        -- %
  nb_retours_total integer DEFAULT 0,
  nb_retours_acceptes integer DEFAULT 0,
  delai_reponse_median_heures numeric(6,2),
  badges jsonb DEFAULT '[]'::jsonb,    -- ['retours_faciles','reactif','premium',...]
  updated_at timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_scores_updated ON public.scores_fournisseurs;
CREATE TRIGGER trg_scores_updated
  BEFORE UPDATE ON public.scores_fournisseurs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.scores_fournisseurs ENABLE ROW LEVEL SECURITY;
-- Lecture publique (score affiché dans comparateur)
DROP POLICY IF EXISTS scores_public_select ON public.scores_fournisseurs;
CREATE POLICY scores_public_select ON public.scores_fournisseurs
  FOR SELECT USING (auth.uid() IS NOT NULL);
-- Écriture serveur uniquement (service_role), aucune policy user

-- =====================================================================
-- FIN Phase 14
-- =====================================================================
