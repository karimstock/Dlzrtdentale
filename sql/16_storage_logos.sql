-- =====================================================================
-- JADOMI — Supabase Storage : bucket logos-societes
-- À exécuter dans Supabase SQL Editor (nécessite droits superuser / postgres).
-- Si Supabase refuse l'INSERT dans storage.buckets, créez le bucket à la main
-- via Dashboard > Storage > New bucket :
--   Name  : logos-societes
--   Public : YES
--   Allowed MIME : image/jpeg, image/png, image/svg+xml, image/webp
--   Max size : 2 MB
-- =====================================================================

-- Bucket public 'logos-societes' (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos-societes',
  'logos-societes',
  true,
  2 * 1024 * 1024,
  ARRAY['image/jpeg','image/png','image/svg+xml','image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policies : lecture publique + écriture uniquement via service_role (serveur)
-- L'upload se fait côté serveur via admin() → service_role, donc pas besoin
-- de policy user pour l'insert. On autorise juste la lecture anonyme.
DROP POLICY IF EXISTS "logos public read" ON storage.objects;
CREATE POLICY "logos public read"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'logos-societes');

-- =====================================================================
-- FIN bucket storage
-- =====================================================================
