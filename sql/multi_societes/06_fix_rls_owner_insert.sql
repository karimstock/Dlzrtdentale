-- =====================================================================
-- JADOMI — Fix RLS : autoriser l'owner à voir sa propre société
-- Corrige le circular dependency détecté par scripts/test-rls.js (test #11)
--
-- Problème :
--   1. INSERT societes (owner_id = auth.uid()) — policy societes_insert OK
--   2. Trigger AFTER INSERT tente INSERT user_societe_roles (role='proprietaire')
--   3. Policy roles_insert fait EXISTS sur public.societes → SELECT
--   4. Policy societes_select exige is_member_of_societe(id) — qui n'existe PAS encore
--   5. → policy rejette le select dans EXISTS → trigger échoue → rollback
--
-- Fix : la policy societes_select autorise aussi owner_id = auth.uid().
-- Idempotent.
-- =====================================================================

DROP POLICY IF EXISTS societes_select ON public.societes;
CREATE POLICY societes_select ON public.societes
  FOR SELECT USING (
    public.is_member_of_societe(id)
    OR owner_id = auth.uid()
  );

-- Idem sur user_societe_roles : l'owner doit voir les rôles de ses sociétés
-- immédiatement après insert (pour que le trigger puisse lire ce qu'il vient d'écrire).
DROP POLICY IF EXISTS roles_select ON public.user_societe_roles;
CREATE POLICY roles_select ON public.user_societe_roles
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.societes s
               WHERE s.id = societe_id AND s.owner_id = auth.uid())
  );

-- =====================================================================
-- FIN 06_fix_rls_owner_insert
-- =====================================================================
