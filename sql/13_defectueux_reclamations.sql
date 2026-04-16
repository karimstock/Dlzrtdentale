-- =====================================================================
-- JADOMI — Produits défectueux + réclamations fournisseurs (Phase 13)
-- À exécuter APRÈS 12_stock_commercial.sql
-- Idempotent.
-- =====================================================================

-- ---------- Stock en quarantaine (défectueux) ----------
ALTER TABLE public.produits_societe
  ADD COLUMN IF NOT EXISTS stock_defectueux integer DEFAULT 0;

-- ---------- Étendre types mouvements_stock ----------
-- Ajoute quarantaine + reprise fournisseur + remise en vente
ALTER TABLE public.mouvements_stock DROP CONSTRAINT IF EXISTS mouvements_stock_type_check;
ALTER TABLE public.mouvements_stock
  ADD CONSTRAINT mouvements_stock_type_check CHECK (type IN (
    'entree','sortie','vente','retour',
    'ajustement','inventaire','import_initial',
    'quarantaine','perte_seche','reprise_fournisseur','remise_en_vente'
  ));

-- ---------- Fournisseurs référencés (si marché externe — pointeurs libres) ----------
-- Réclamation vers un fournisseur peut cibler :
--   · une société JADOMI (fournisseur_societe_id)
--   · un fournisseur hors JADOMI (fournisseur_nom / email libre)
CREATE TABLE IF NOT EXISTS public.reclamations_fournisseurs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  produit_id uuid REFERENCES public.produits_societe(id) ON DELETE SET NULL,
  facture_societe_id uuid REFERENCES public.factures_societe(id) ON DELETE SET NULL,

  fournisseur_societe_id uuid REFERENCES public.societes(id) ON DELETE SET NULL,
  fournisseur_nom text,
  fournisseur_email text,

  motif text NOT NULL CHECK (motif IN (
    'defectueux','erreur_commande','non_conforme','non_livre','autre'
  )),
  quantite integer NOT NULL DEFAULT 1,
  montant numeric(12,2) NOT NULL DEFAULT 0,
  description text,
  photo_urls jsonb DEFAULT '[]'::jsonb,
  numero_facture_fournisseur text,

  statut text NOT NULL DEFAULT 'ouverte' CHECK (statut IN (
    'ouverte','en_cours','remboursee','avoir_recu','perte_seche','refusee'
  )),
  resolution_montant numeric(12,2),
  resolution_note text,

  emails_envoyes jsonb DEFAULT '[]'::jsonb,  -- journal des échanges
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_reclam_societe ON public.reclamations_fournisseurs(societe_id);
CREATE INDEX IF NOT EXISTS idx_reclam_statut ON public.reclamations_fournisseurs(societe_id, statut);
CREATE INDEX IF NOT EXISTS idx_reclam_fournisseur ON public.reclamations_fournisseurs(fournisseur_societe_id);
CREATE INDEX IF NOT EXISTS idx_reclam_date ON public.reclamations_fournisseurs(societe_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_reclamations_updated ON public.reclamations_fournisseurs;
CREATE TRIGGER trg_reclamations_updated
  BEFORE UPDATE ON public.reclamations_fournisseurs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.reclamations_fournisseurs ENABLE ROW LEVEL SECURITY;

-- Visible par la société qui réclame
DROP POLICY IF EXISTS reclamations_owner_all ON public.reclamations_fournisseurs;
CREATE POLICY reclamations_owner_all ON public.reclamations_fournisseurs
  FOR ALL
  USING (public.is_member_of_societe(societe_id))
  WITH CHECK (public.is_member_of_societe(societe_id));

-- Visible aussi par le fournisseur JADOMI ciblé (lecture seule) — pour traitement
DROP POLICY IF EXISTS reclamations_fournisseur_select ON public.reclamations_fournisseurs;
CREATE POLICY reclamations_fournisseur_select ON public.reclamations_fournisseurs
  FOR SELECT
  USING (
    fournisseur_societe_id IS NOT NULL
    AND public.is_member_of_societe(fournisseur_societe_id)
  );

-- Mise à jour du statut par le fournisseur (accepter/refuser/etc.)
DROP POLICY IF EXISTS reclamations_fournisseur_update ON public.reclamations_fournisseurs;
CREATE POLICY reclamations_fournisseur_update ON public.reclamations_fournisseurs
  FOR UPDATE
  USING (
    fournisseur_societe_id IS NOT NULL
    AND public.is_member_of_societe(fournisseur_societe_id)
  )
  WITH CHECK (
    fournisseur_societe_id IS NOT NULL
    AND public.is_member_of_societe(fournisseur_societe_id)
  );

-- ---------- Vue stock analytics étendue (3 niveaux + marge) ----------
-- Recrée la vue de sql/12 pour inclure stock_defectueux (quarantaine)
CREATE OR REPLACE VIEW public.v_stock_analytics AS
SELECT
  p.id,
  p.societe_id,
  p.reference,
  p.designation,
  p.image_url,
  p.prix_ht                                                     AS prix_vente_ht,
  p.taux_tva,
  p.prix_achat_ht,
  (p.prix_ht - COALESCE(p.prix_achat_ht, 0))                    AS marge_unitaire_ht,
  CASE
    WHEN p.prix_ht > 0
      THEN ROUND( ((p.prix_ht - COALESCE(p.prix_achat_ht,0)) / p.prix_ht) * 100, 2)
    ELSE NULL
  END                                                            AS marge_pourcent,
  COALESCE(p.stock_reel, 0)                                      AS stock_reel,
  COALESCE(p.stock_reserve, 0)                                   AS stock_reserve,
  COALESCE(p.stock_defectueux, 0)                                AS stock_defectueux,
  (COALESCE(p.stock_reel,0) - COALESCE(p.stock_reserve,0))       AS stock_disponible,
  COALESCE(p.stock_alerte, 0)                                    AS stock_alerte,
  CASE
    WHEN (COALESCE(p.stock_reel,0) - COALESCE(p.stock_reserve,0)) <= 0             THEN 'rupture'
    WHEN (COALESCE(p.stock_reel,0) - COALESCE(p.stock_reserve,0)) <= COALESCE(p.stock_alerte,0)   THEN 'faible'
    ELSE 'ok'
  END                                                            AS statut_stock
FROM public.produits_societe p
WHERE p.actif IS DISTINCT FROM false;

ALTER VIEW public.v_stock_analytics SET (security_invoker = true);

-- ---------- Vue pertes & réclamations (analytics) ----------
CREATE OR REPLACE VIEW public.v_pertes_reclamations AS
SELECT
  r.societe_id,
  date_trunc('month', r.created_at)::date         AS mois,
  COUNT(*)                                         AS nb_reclamations,
  COUNT(*) FILTER (WHERE r.statut = 'ouverte')     AS nb_ouvertes,
  COUNT(*) FILTER (WHERE r.statut = 'en_cours')    AS nb_en_cours,
  COUNT(*) FILTER (WHERE r.statut = 'remboursee')  AS nb_remboursees,
  COUNT(*) FILTER (WHERE r.statut = 'avoir_recu')  AS nb_avoirs_recus,
  COUNT(*) FILTER (WHERE r.statut = 'perte_seche') AS nb_pertes_seches,
  COALESCE(SUM(r.montant) FILTER (WHERE r.statut = 'perte_seche'), 0) AS montant_perte_seche,
  COALESCE(SUM(r.resolution_montant) FILTER (WHERE r.statut IN ('remboursee','avoir_recu')), 0) AS montant_recupere,
  COALESCE(SUM(r.montant), 0)                       AS montant_reclame_total
FROM public.reclamations_fournisseurs r
GROUP BY r.societe_id, date_trunc('month', r.created_at);

ALTER VIEW public.v_pertes_reclamations SET (security_invoker = true);

-- =====================================================================
-- FIN Phase 13
-- =====================================================================
