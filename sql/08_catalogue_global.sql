-- =====================================================================
-- JADOMI — Catalogue global anti-doublon (EAN) + comparateur prix
-- À exécuter APRÈS sql/06_secteurs.sql
-- NB : numéroté 08 car sql/07_add_image_url.sql est déjà pris.
-- Idempotent — safe à réexécuter.
-- =====================================================================
-- Objectif :
--  · 1 produit global = 1 EAN unique, partagé entre tous les fournisseurs.
--  · Chaque société fournisseur déclare son prix dans prix_fournisseurs.
--  · Historique des prix conservé dans historique_prix.
--  · Agrégats (nb fournisseurs, prix min/max/moyen) recalculés par trigger.
--  · Vue v_comparateur_prix pour l'UI côté dentiste.
-- =====================================================================

-- ---------- 1. Catalogue global ----------
CREATE TABLE IF NOT EXISTS public.produits_catalogue_global (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ean text UNIQUE,
  reference_fabricant text,
  designation_generique text NOT NULL,
  description text,
  categorie text,
  secteur text CHECK (secteur IS NULL OR secteur IN (
    'sante','btp','esthetique','restauration','juridique','autre'
  )),
  image_url text,
  nb_fournisseurs integer NOT NULL DEFAULT 0,
  prix_moyen_ht numeric(12,2),
  prix_min_ht numeric(12,2),
  prix_max_ht numeric(12,2),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalogue_ean     ON public.produits_catalogue_global(ean);
CREATE INDEX IF NOT EXISTS idx_catalogue_secteur ON public.produits_catalogue_global(secteur);
CREATE INDEX IF NOT EXISTS idx_catalogue_designation
  ON public.produits_catalogue_global(designation_generique);

DROP TRIGGER IF EXISTS trg_catalogue_global_updated ON public.produits_catalogue_global;
CREATE TRIGGER trg_catalogue_global_updated
  BEFORE UPDATE ON public.produits_catalogue_global
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- 2. Prix par fournisseur ----------
CREATE TABLE IF NOT EXISTS public.prix_fournisseurs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_global_id uuid NOT NULL REFERENCES public.produits_catalogue_global(id) ON DELETE CASCADE,
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  prix_ht numeric(12,2) NOT NULL,
  taux_tva numeric(5,2) DEFAULT 20,
  unite text DEFAULT 'unité',
  disponible boolean DEFAULT true,
  date_maj timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE (produit_global_id, societe_id)
);
CREATE INDEX IF NOT EXISTS idx_prix_fourn_produit ON public.prix_fournisseurs(produit_global_id);
CREATE INDEX IF NOT EXISTS idx_prix_fourn_societe ON public.prix_fournisseurs(societe_id);

-- ---------- 3. Historique prix (traçabilité) ----------
CREATE TABLE IF NOT EXISTS public.historique_prix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_global_id uuid NOT NULL REFERENCES public.produits_catalogue_global(id) ON DELETE CASCADE,
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  prix_ht numeric(12,2) NOT NULL,
  date_prix timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_historique_produit ON public.historique_prix(produit_global_id);
CREATE INDEX IF NOT EXISTS idx_historique_date    ON public.historique_prix(date_prix DESC);
CREATE INDEX IF NOT EXISTS idx_historique_societe ON public.historique_prix(societe_id);

-- ---------- 4. Vue comparateur prix ----------
CREATE OR REPLACE VIEW public.v_comparateur_prix AS
SELECT
  pg.id                      AS produit_id,
  pg.ean,
  pg.designation_generique,
  pg.categorie,
  pg.secteur,
  pg.nb_fournisseurs,
  pg.prix_moyen_ht,
  pg.prix_min_ht,
  pg.prix_max_ht,
  pf.societe_id,
  pf.prix_ht,
  pf.taux_tva,
  pf.disponible,
  RANK() OVER (PARTITION BY pg.id ORDER BY pf.prix_ht ASC) AS rang_prix
FROM public.produits_catalogue_global pg
JOIN public.prix_fournisseurs        pf ON pf.produit_global_id = pg.id
WHERE pf.disponible = true;

-- ---------- 5. Trigger : sync catalogue global à chaque produit ajouté/modifié ----------
CREATE OR REPLACE FUNCTION public.sync_catalogue_global()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_global_id uuid;
  v_secteur text;
BEGIN
  -- Nécessite un EAN (code_barre) pour être mutualisé dans le catalogue global.
  IF NEW.code_barre IS NULL OR NEW.code_barre = '' THEN
    RETURN NEW;
  END IF;

  SELECT secteur INTO v_secteur FROM public.societes WHERE id = NEW.societe_id;

  -- 1. Trouve ou crée la ligne catalogue
  SELECT id INTO v_global_id
  FROM public.produits_catalogue_global
  WHERE ean = NEW.code_barre;

  IF v_global_id IS NULL THEN
    INSERT INTO public.produits_catalogue_global (ean, designation_generique, categorie, secteur, image_url)
    VALUES (NEW.code_barre, NEW.designation, 'general', v_secteur, NEW.image_url)
    RETURNING id INTO v_global_id;
  END IF;

  -- 2. Upsert du prix de ce fournisseur
  INSERT INTO public.prix_fournisseurs (produit_global_id, societe_id, prix_ht, taux_tva, unite)
  VALUES (v_global_id, NEW.societe_id, COALESCE(NEW.prix_ht, 0), COALESCE(NEW.taux_tva, 20), COALESCE(NEW.unite, 'unité'))
  ON CONFLICT (produit_global_id, societe_id)
  DO UPDATE SET
    prix_ht  = EXCLUDED.prix_ht,
    taux_tva = EXCLUDED.taux_tva,
    unite    = EXCLUDED.unite,
    date_maj = now();

  -- 3. Ligne d'historique
  INSERT INTO public.historique_prix (produit_global_id, societe_id, prix_ht)
  VALUES (v_global_id, NEW.societe_id, COALESCE(NEW.prix_ht, 0));

  -- 4. Recalcule les agrégats
  UPDATE public.produits_catalogue_global SET
    nb_fournisseurs = (
      SELECT COUNT(*) FROM public.prix_fournisseurs
      WHERE produit_global_id = v_global_id AND disponible = true
    ),
    prix_moyen_ht = (
      SELECT AVG(prix_ht) FROM public.prix_fournisseurs
      WHERE produit_global_id = v_global_id AND disponible = true
    ),
    prix_min_ht = (
      SELECT MIN(prix_ht) FROM public.prix_fournisseurs
      WHERE produit_global_id = v_global_id AND disponible = true
    ),
    prix_max_ht = (
      SELECT MAX(prix_ht) FROM public.prix_fournisseurs
      WHERE produit_global_id = v_global_id AND disponible = true
    )
  WHERE id = v_global_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_catalogue_global ON public.produits_societe;
CREATE TRIGGER trg_sync_catalogue_global
  AFTER INSERT OR UPDATE OF prix_ht, code_barre, designation, taux_tva, unite, image_url
  ON public.produits_societe
  FOR EACH ROW EXECUTE FUNCTION public.sync_catalogue_global();

-- ---------- 6. RLS ----------
ALTER TABLE public.produits_catalogue_global ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS catalogue_global_select ON public.produits_catalogue_global;
CREATE POLICY catalogue_global_select ON public.produits_catalogue_global
  FOR SELECT USING (true);   -- visible par tous les connectés

ALTER TABLE public.prix_fournisseurs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prix_select ON public.prix_fournisseurs;
CREATE POLICY prix_select ON public.prix_fournisseurs
  FOR SELECT USING (true);   -- prix visibles par tous
DROP POLICY IF EXISTS prix_write ON public.prix_fournisseurs;
CREATE POLICY prix_write ON public.prix_fournisseurs
  FOR ALL USING (public.is_member_of_societe(societe_id))
           WITH CHECK (public.is_member_of_societe(societe_id));

ALTER TABLE public.historique_prix ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS historique_select ON public.historique_prix;
CREATE POLICY historique_select ON public.historique_prix
  FOR SELECT USING (true);
DROP POLICY IF EXISTS historique_write ON public.historique_prix;
CREATE POLICY historique_write ON public.historique_prix
  FOR ALL USING (public.is_member_of_societe(societe_id))
           WITH CHECK (public.is_member_of_societe(societe_id));

-- =====================================================================
-- FIN 08_catalogue_global — catalogue anti-doublon + comparateur prêt
-- =====================================================================
