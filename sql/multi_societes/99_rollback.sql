-- =====================================================================
-- JADOMI — Multi-sociétés : ROLLBACK COMPLET
-- ⚠️ DESTRUCTIF : supprime toutes les tables, policies, fonctions multi-sociétés
-- À exécuter uniquement si besoin de repartir à zéro
-- =====================================================================

-- Triggers d'abord (pour libérer les fonctions)
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'societes','biens_immobiliers','locataires','quittances',
    'produits_societe','clients_societe','devis','factures_societe',
    'factures_fournisseurs_societe','integrations_wordpress',
    'campagnes_mailing'])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated ON public.%1$s;', t);
  END LOOP;
END$$;

DROP TRIGGER IF EXISTS trg_societes_owner_role ON public.societes;

-- Tables (ordre inverse des dépendances)
DROP TABLE IF EXISTS public.campagne_envois CASCADE;
DROP TABLE IF EXISTS public.campagnes_mailing CASCADE;
DROP TABLE IF EXISTS public.contacts_importes CASCADE;
DROP TABLE IF EXISTS public.bases_emails_importees CASCADE;

DROP TABLE IF EXISTS public.relances_factures CASCADE;
DROP TABLE IF EXISTS public.factures_echeances CASCADE;
DROP TABLE IF EXISTS public.factures_fournisseurs_societe CASCADE;
DROP TABLE IF EXISTS public.factures_societe CASCADE;
DROP TABLE IF EXISTS public.devis CASCADE;
DROP TABLE IF EXISTS public.documents_produit CASCADE;
DROP TABLE IF EXISTS public.produits_societe CASCADE;
DROP TABLE IF EXISTS public.clients_societe CASCADE;
DROP TABLE IF EXISTS public.integrations_wordpress CASCADE;

DROP TABLE IF EXISTS public.relances_sci CASCADE;
DROP TABLE IF EXISTS public.quittances CASCADE;
DROP TABLE IF EXISTS public.locataires CASCADE;
DROP TABLE IF EXISTS public.biens_immobiliers CASCADE;

DROP TABLE IF EXISTS public.compteurs_numerotation CASCADE;
DROP TABLE IF EXISTS public.audit_log CASCADE;
DROP TABLE IF EXISTS public.user_societe_roles CASCADE;
DROP TABLE IF EXISTS public.societes CASCADE;

-- Fonctions
DROP FUNCTION IF EXISTS public.next_numero(uuid, text, integer);
DROP FUNCTION IF EXISTS public.societe_create_owner_role();
DROP FUNCTION IF EXISTS public.is_member_of_societe(uuid);
-- set_updated_at() est partagée (gardée si d'autres modules l'utilisent)
