-- Migration : ajoute la colonne image_url à produits
-- Stocke l'URL publique d'une photo uploadée dans le bucket Supabase Storage `produits-photos`.
-- Idempotent : safe à rejouer.

ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN produits.image_url IS
  'URL publique de la photo produit dans le bucket Supabase Storage `produits-photos` (uploadée depuis l''app mobile).';

-- ────────────────────────────────────────────────────────────
-- Setup manuel à faire UNE FOIS dans Supabase Console (pas en SQL) :
--
-- 1. Storage → New bucket
--      Nom : produits-photos
--      Public : ✅ (lecture publique)
--      File size limit : 5 MB
--      Allowed MIME types : image/jpeg, image/png, image/webp
--
-- 2. Storage → produits-photos → Policies → New policy
--      Allow authenticated users to upload to their own folder :
--
--        CREATE POLICY "owner_can_upload"
--          ON storage.objects FOR INSERT
--          TO authenticated
--          WITH CHECK (
--            bucket_id = 'produits-photos'
--            AND (storage.foldername(name))[1] = 'produits'
--            AND (storage.foldername(name))[2] = auth.uid()::text
--          );
--
--        CREATE POLICY "owner_can_update"
--          ON storage.objects FOR UPDATE
--          TO authenticated
--          USING (
--            bucket_id = 'produits-photos'
--            AND (storage.foldername(name))[2] = auth.uid()::text
--          );
--
--        CREATE POLICY "public_read"
--          ON storage.objects FOR SELECT
--          TO public
--          USING (bucket_id = 'produits-photos');
--
-- ────────────────────────────────────────────────────────────

-- Vérification : la colonne doit exister
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'produits' AND column_name = 'image_url';
