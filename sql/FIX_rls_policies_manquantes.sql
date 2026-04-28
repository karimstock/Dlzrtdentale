-- =============================================
-- FIX: Tables avec RLS active mais 0 policy
-- Tables concernees: avocat_coffre_documents, avocat_clients, dentiste_pro_patients
-- Date: 2026-04-28
-- =============================================

-- 1. avocat_coffre_documents — seul le user proprietaire peut lire/ecrire ses documents
ALTER TABLE avocat_coffre_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "avocat_coffre_documents_select_own"
  ON avocat_coffre_documents
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "avocat_coffre_documents_insert_own"
  ON avocat_coffre_documents
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "avocat_coffre_documents_update_own"
  ON avocat_coffre_documents
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "avocat_coffre_documents_delete_own"
  ON avocat_coffre_documents
  FOR DELETE
  USING (user_id = auth.uid());

-- 2. avocat_clients — seul le user proprietaire peut gerer ses clients
ALTER TABLE avocat_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "avocat_clients_select_own"
  ON avocat_clients
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "avocat_clients_insert_own"
  ON avocat_clients
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "avocat_clients_update_own"
  ON avocat_clients
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "avocat_clients_delete_own"
  ON avocat_clients
  FOR DELETE
  USING (user_id = auth.uid());

-- 3. dentiste_pro_patients — seul le user proprietaire peut gerer ses patients
ALTER TABLE dentiste_pro_patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dentiste_pro_patients_select_own"
  ON dentiste_pro_patients
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "dentiste_pro_patients_insert_own"
  ON dentiste_pro_patients
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "dentiste_pro_patients_update_own"
  ON dentiste_pro_patients
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "dentiste_pro_patients_delete_own"
  ON dentiste_pro_patients
  FOR DELETE
  USING (user_id = auth.uid());
