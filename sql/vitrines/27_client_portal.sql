-- =============================================
-- JADOMI — Migration 27 — Espace client securise
-- Passe 24 (22-23 avril 2026)
-- =============================================

-- Comptes clients (visiteurs du site avocat)
CREATE TABLE IF NOT EXISTS client_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES vitrines_sites(id) ON DELETE CASCADE,
  email text NOT NULL,
  password_hash text NOT NULL,
  name text,
  phone text,
  created_at timestamptz DEFAULT now(),
  last_login_at timestamptz,
  UNIQUE(site_id, email)
);

-- Dossiers client
CREATE TABLE IF NOT EXISTS client_dossiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id uuid REFERENCES client_accounts(id) ON DELETE CASCADE,
  site_id uuid REFERENCES vitrines_sites(id) ON DELETE CASCADE,
  reference text NOT NULL,
  title text NOT NULL,
  status text DEFAULT 'en_cours' CHECK (status IN ('en_cours','clos','en_attente','archive')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Documents lies aux dossiers
CREATE TABLE IF NOT EXISTS client_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid REFERENCES client_dossiers(id) ON DELETE CASCADE,
  uploaded_by text NOT NULL CHECK (uploaded_by IN ('client','avocat')),
  filename text NOT NULL,
  file_size int,
  mime_type text,
  r2_key text NOT NULL,
  encrypted boolean DEFAULT true,
  uploaded_at timestamptz DEFAULT now()
);

-- Messages entre client et avocat
CREATE TABLE IF NOT EXISTS client_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid REFERENCES client_dossiers(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('client','avocat')),
  content text NOT NULL,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_accounts_site ON client_accounts(site_id);
CREATE INDEX IF NOT EXISTS idx_client_dossiers_account ON client_dossiers(client_account_id);
CREATE INDEX IF NOT EXISTS idx_client_documents_dossier ON client_documents(dossier_id);
CREATE INDEX IF NOT EXISTS idx_client_messages_dossier ON client_messages(dossier_id);
