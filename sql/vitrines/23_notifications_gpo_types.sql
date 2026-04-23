-- ============================================================
-- MIGRATION 23 — Ajouter les types GPO a la table notifications
-- ============================================================

-- Supprimer l'ancien CHECK constraint sur type et le recreer avec les types GPO
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'retour_accepte','retour_refuse','retour_demande',
    'produit_vendu','produit_achete',
    'stock_critique','stock_faible',
    'facture_payee','facture_envoyee','relance_loyer',
    'reclamation_repondue','nouveau_message','autre',
    'gpo_accepted','gpo_counter','gpo_failed'
  ));
