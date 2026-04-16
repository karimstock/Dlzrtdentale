-- =====================================================================
-- JADOMI — Notifications temps réel (Phase 15)
-- À exécuter APRÈS 14_retours_marketplace.sql
-- Idempotent.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  societe_id uuid REFERENCES public.societes(id) ON DELETE CASCADE,

  type text NOT NULL CHECK (type IN (
    'retour_accepte','retour_refuse','retour_demande',
    'produit_vendu','produit_achete',
    'stock_critique','stock_faible',
    'facture_payee','facture_envoyee','relance_loyer',
    'reclamation_repondue','nouveau_message','autre'
  )),
  urgence text NOT NULL DEFAULT 'normale' CHECK (urgence IN ('faible','normale','haute','urgente')),

  titre text NOT NULL,
  message text,
  cta_label text,
  cta_url text,

  entity_type text,                 -- 'facture','avoir','retour','reclamation','annonce_market',...
  entity_id uuid,

  lu boolean NOT NULL DEFAULT false,
  lu_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON public.notifications(user_id, lu, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_societe ON public.notifications(societe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_urgence ON public.notifications(user_id, urgence) WHERE lu = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- User voit uniquement ses propres notifications
DROP POLICY IF EXISTS notifications_user_all ON public.notifications;
CREATE POLICY notifications_user_all ON public.notifications
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =====================================================================
-- FIN Phase 15
-- =====================================================================
