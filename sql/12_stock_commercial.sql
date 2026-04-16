-- =====================================================================
-- JADOMI — Stock fournisseur + Analytics commercial (Phase 12)
-- À exécuter APRÈS sql/multi_societes/03_commerce.sql et sql/11_avoirs.sql
-- Idempotent.
-- =====================================================================
-- Objectif :
--   · Suivre stock réel / réservé / disponible par produit
--   · Tracer chaque mouvement (entrée, sortie, vente, retour, ajustement)
--   · Calculer marges HT par produit (prix_vente - prix_achat) — DATA
--     CONFIDENTIELLE : prix_achat et marge visibles uniquement par
--     owner/associe (filtrés côté API, RLS colonne impossible pg std).
-- =====================================================================

-- ---------- Extension produits_societe ----------
ALTER TABLE public.produits_societe ADD COLUMN IF NOT EXISTS prix_achat_ht numeric(12,2);
ALTER TABLE public.produits_societe ADD COLUMN IF NOT EXISTS stock_reel integer DEFAULT 0;
ALTER TABLE public.produits_societe ADD COLUMN IF NOT EXISTS stock_reserve integer DEFAULT 0;
-- stock_disponible = stock_reel - stock_reserve (calculé dans la vue / côté API)

-- Back-fill : stock_reel ← stock_actuel pour les anciens enregistrements
UPDATE public.produits_societe
SET stock_reel = COALESCE(stock_actuel, 0)
WHERE stock_reel IS NULL OR stock_reel = 0 AND stock_actuel IS NOT NULL;

-- ---------- Mouvements de stock ----------
CREATE TABLE IF NOT EXISTS public.mouvements_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits_societe(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'entree','sortie','vente','retour','ajustement','inventaire','import_initial'
  )),
  quantite integer NOT NULL,
  stock_avant integer,
  stock_apres integer,
  reference_doc text,            -- ex: numéro facture, avoir, bon de commande
  reference_doc_id uuid,         -- facture_id / avoir_id si applicable
  note text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mvt_stock_societe ON public.mouvements_stock(societe_id);
CREATE INDEX IF NOT EXISTS idx_mvt_stock_produit ON public.mouvements_stock(produit_id);
CREATE INDEX IF NOT EXISTS idx_mvt_stock_date ON public.mouvements_stock(societe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mvt_stock_type ON public.mouvements_stock(societe_id, type);

ALTER TABLE public.mouvements_stock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mouvements_stock_all ON public.mouvements_stock;
CREATE POLICY mouvements_stock_all ON public.mouvements_stock
  FOR ALL
  USING (public.is_member_of_societe(societe_id))
  WITH CHECK (public.is_member_of_societe(societe_id));

-- ---------- Fonction : enregistrer un mouvement + maj stock atomique ----------
CREATE OR REPLACE FUNCTION public.enregistrer_mouvement_stock(
  p_societe_id uuid,
  p_produit_id uuid,
  p_type text,
  p_quantite integer,           -- signé : négatif pour sortie, positif pour entrée
  p_reference_doc text DEFAULT NULL,
  p_reference_doc_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS public.mouvements_stock
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avant integer;
  v_apres integer;
  v_row public.mouvements_stock;
BEGIN
  -- Lock ligne produit pour éviter race conditions
  SELECT COALESCE(stock_reel, 0) INTO v_avant
  FROM public.produits_societe
  WHERE id = p_produit_id AND societe_id = p_societe_id
  FOR UPDATE;

  IF v_avant IS NULL THEN
    RAISE EXCEPTION 'produit % introuvable pour société %', p_produit_id, p_societe_id;
  END IF;

  v_apres := v_avant + p_quantite;

  UPDATE public.produits_societe
     SET stock_reel = v_apres,
         stock_actuel = v_apres, -- synchronisation avec ancienne colonne
         updated_at = now()
   WHERE id = p_produit_id AND societe_id = p_societe_id;

  INSERT INTO public.mouvements_stock(
    societe_id, produit_id, type, quantite, stock_avant, stock_apres,
    reference_doc, reference_doc_id, note, user_id
  ) VALUES (
    p_societe_id, p_produit_id, p_type, p_quantite, v_avant, v_apres,
    p_reference_doc, p_reference_doc_id, p_note, p_user_id
  ) RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ---------- Vue analytics (sans prix_achat — le filtrage se fait côté API) ----------
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
  (COALESCE(p.stock_reel,0) - COALESCE(p.stock_reserve,0))       AS stock_disponible,
  COALESCE(p.stock_alerte, 0)                                    AS stock_alerte,
  CASE
    WHEN COALESCE(p.stock_reel,0) <= 0                            THEN 'rupture'
    WHEN COALESCE(p.stock_reel,0) <= COALESCE(p.stock_alerte,0)   THEN 'faible'
    ELSE 'ok'
  END                                                            AS statut_stock
FROM public.produits_societe p
WHERE p.actif IS DISTINCT FROM false;

-- RLS sur la vue héritée de produits_societe via security_invoker
ALTER VIEW public.v_stock_analytics SET (security_invoker = true);

-- =====================================================================
-- FIN Phase 12 (Stock + Analytics)
-- =====================================================================
