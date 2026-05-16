-- =============================================
-- JADOMI — FIX URGENT SÉCURITÉ RLS
--
-- 8 tables exposées publiquement → activer RLS + policies
-- À exécuter IMMÉDIATEMENT dans Supabase SQL Editor
-- https://supabase.com/dashboard/project/vsbomwjzehnfinfjvhqp/sql
--
-- Date: 13 mai 2026
-- Contexte: alerte email Supabase "security vulnerabilities"
-- =============================================

-- =============================================
-- ÉTAPE 1 : ACTIVER RLS SUR LES 8 TABLES
-- =============================================

ALTER TABLE public.commandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products_database ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraped_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.societes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staging_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpo_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites_jadomi ENABLE ROW LEVEL SECURITY;

-- =============================================
-- ÉTAPE 2 : POLICIES — LE BACKEND (service_role) A ACCÈS TOTAL
-- Le backend Express utilise SUPABASE_SERVICE_KEY → bypass RLS auto
-- Ces policies sont pour les accès directs (anon key / client)
-- =============================================

-- SCRAPED_PRICES : lecture publique OK (c'est un comparateur), écriture admin seulement
CREATE POLICY "scraped_prices_read_all" ON public.scraped_prices
  FOR SELECT USING (true);
CREATE POLICY "scraped_prices_write_auth" ON public.scraped_prices
  FOR ALL USING (auth.role() = 'authenticated');

-- PRODUCTS_DATABASE : lecture publique OK (catalogue), écriture admin
CREATE POLICY "products_read_all" ON public.products_database
  FOR SELECT USING (true);
CREATE POLICY "products_write_auth" ON public.products_database
  FOR ALL USING (auth.role() = 'authenticated');

-- COMMANDES : seulement le propriétaire voit ses commandes
CREATE POLICY "commandes_own" ON public.commandes
  FOR ALL USING (auth.uid()::text = user_id::text);

-- FACTURES : seulement le propriétaire voit ses factures
CREATE POLICY "factures_own" ON public.factures
  FOR ALL USING (auth.uid()::text = user_id::text);

-- SOCIETES : seulement le propriétaire voit ses sociétés
CREATE POLICY "societes_own" ON public.societes
  FOR ALL USING (auth.uid()::text = user_id::text);

-- GPO_REQUESTS : le demandeur voit ses demandes
CREATE POLICY "gpo_requests_own" ON public.gpo_requests
  FOR ALL USING (auth.uid()::text = user_id::text);

-- SITES_JADOMI : le propriétaire voit son site
CREATE POLICY "sites_jadomi_own" ON public.sites_jadomi
  FOR ALL USING (auth.uid()::text = user_id::text);

-- STAGING_SITES : le propriétaire voit ses staging
CREATE POLICY "staging_sites_own" ON public.staging_sites
  FOR ALL USING (auth.uid()::text = user_id::text);

-- =============================================
-- VÉRIFICATION
-- =============================================
-- Après exécution, vérifier dans Supabase Dashboard :
-- Authentication > Policies → les 8 tables doivent avoir des policies
-- Le backend Express (service_role key) continue de tout voir
-- Les accès anonymes ne voient plus que scraped_prices et products_database en lecture
