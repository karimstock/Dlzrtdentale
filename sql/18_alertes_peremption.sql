-- =====================================================================
-- JADOMI — Alertes péremption produits (Phase 18)
-- Suivi des dates péremption par produit + génération alertes via CRON.
-- Idempotent.
-- =====================================================================

-- Le champ date_peremption existe-t-il déjà sur les produits cabinet ?
-- Dans le schéma legacy (produits du cabinet dentaire — table 'produits'),
-- on l'ajoute si absent. Pour les sociétés commerciales (produits_societe),
-- on ajoute aussi.

ALTER TABLE public.produits_societe ADD COLUMN IF NOT EXISTS date_peremption date;
CREATE INDEX IF NOT EXISTS idx_produits_peremption
  ON public.produits_societe(date_peremption)
  WHERE date_peremption IS NOT NULL;

-- Table produits cabinet dentaire (legacy) — tolérer l'absence
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='produits') THEN
    EXECUTE 'ALTER TABLE public.produits ADD COLUMN IF NOT EXISTS date_peremption date';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_produits_legacy_peremption ON public.produits(date_peremption) WHERE date_peremption IS NOT NULL';
  END IF;
END$$;

-- ---------- Table d'alertes (idempotente par (produit, niveau)) ----------
CREATE TABLE IF NOT EXISTS public.alertes_peremption (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid REFERENCES public.societes(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,  -- propriétaire cabinet (legacy produits)

  -- cible : produit_societe OU produit cabinet legacy
  produit_id uuid,                                            -- uuid générique
  produit_kind text NOT NULL CHECK (produit_kind IN ('societe','cabinet')),

  designation text,
  reference text,
  date_peremption date NOT NULL,
  niveau text NOT NULL CHECK (niveau IN ('90j','60j','30j','depassee')),
  jours_restants integer,

  traite boolean NOT NULL DEFAULT false,
  traite_at timestamptz,

  created_at timestamptz DEFAULT now(),

  -- Une alerte par produit et par niveau
  UNIQUE (produit_id, niveau)
);
CREATE INDEX IF NOT EXISTS idx_alertes_per_societe
  ON public.alertes_peremption(societe_id, niveau) WHERE traite = false;
CREATE INDEX IF NOT EXISTS idx_alertes_per_user
  ON public.alertes_peremption(user_id, niveau) WHERE traite = false;
CREATE INDEX IF NOT EXISTS idx_alertes_per_date
  ON public.alertes_peremption(date_peremption);

ALTER TABLE public.alertes_peremption ENABLE ROW LEVEL SECURITY;

-- Visible par les membres de la société
DROP POLICY IF EXISTS alertes_per_societe_all ON public.alertes_peremption;
CREATE POLICY alertes_per_societe_all ON public.alertes_peremption
  FOR ALL
  USING (
    societe_id IS NOT NULL AND public.is_member_of_societe(societe_id)
  )
  WITH CHECK (
    societe_id IS NOT NULL AND public.is_member_of_societe(societe_id)
  );

-- Visible par le user propriétaire (produits cabinet legacy sans société)
DROP POLICY IF EXISTS alertes_per_user_all ON public.alertes_peremption;
CREATE POLICY alertes_per_user_all ON public.alertes_peremption
  FOR ALL
  USING (
    user_id IS NOT NULL AND user_id = auth.uid()
  )
  WITH CHECK (
    user_id IS NOT NULL AND user_id = auth.uid()
  );

-- =====================================================================
-- FIN Phase 18
-- =====================================================================
