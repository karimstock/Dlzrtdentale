-- =============================================
-- JADOMI — Fix audit bugs : colonnes manquantes + rush_fichiers
-- =============================================

-- 1. rush_fichiers — s'assurer que la table existe (idempotent)
CREATE TABLE IF NOT EXISTS rush_fichiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demande_id BIGINT REFERENCES rush_demandes(id) ON DELETE CASCADE,
  nom_original text NOT NULL,
  nom_stockage text NOT NULL,
  taille_bytes bigint,
  format text NOT NULL,
  checksum text,
  url_temporaire text,
  url_expire_at timestamptz,
  uploaded_by text NOT NULL DEFAULT 'prothesiste_principal',
  type_fichier text NOT NULL DEFAULT 'autre',
  metadata_nettoyee boolean DEFAULT false,
  chiffre boolean DEFAULT false,
  supprime_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rush_fichiers_demande ON rush_fichiers(demande_id);

-- RLS
ALTER TABLE rush_fichiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rush_fichiers_select ON rush_fichiers;
CREATE POLICY rush_fichiers_select ON rush_fichiers FOR SELECT USING (true);
DROP POLICY IF EXISTS rush_fichiers_insert ON rush_fichiers;
CREATE POLICY rush_fichiers_insert ON rush_fichiers FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS rush_fichiers_update ON rush_fichiers;
CREATE POLICY rush_fichiers_update ON rush_fichiers FOR UPDATE USING (true);
DROP POLICY IF EXISTS rush_fichiers_delete ON rush_fichiers;
CREATE POLICY rush_fichiers_delete ON rush_fichiers FOR DELETE USING (true);

-- 2. Exposer la table au schema cache PostgREST (grant)
GRANT SELECT, INSERT, UPDATE, DELETE ON rush_fichiers TO anon, authenticated, service_role;

-- 3. juridique_profil — s'assurer aussi que les grants sont ok
GRANT SELECT, INSERT, UPDATE, DELETE ON juridique_profil TO anon, authenticated, service_role;

-- 4. services_profil — grants
GRANT SELECT, INSERT, UPDATE, DELETE ON services_profil TO anon, authenticated, service_role;

-- 5. showroom_profil — grants
GRANT SELECT, INSERT, UPDATE, DELETE ON showroom_profil TO anon, authenticated, service_role;

-- 6. btp_profil — grants
GRANT SELECT, INSERT, UPDATE, DELETE ON btp_profil TO anon, authenticated, service_role;

-- 7. Forcer le reload du schema cache PostgREST
NOTIFY pgrst, 'reload schema';
