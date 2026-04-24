-- =============================================
-- Passe 44C - JADOMI AVOCAT EXPERT - Coffre-fort securise
-- Date : 24 avril 2026
-- Chiffrement AES-256, double auth, audit trail 10 ans
-- Conformite RGPD + Article 66-5 loi 1971
-- =============================================

-- Clients d'un avocat
CREATE TABLE IF NOT EXISTS public.avocat_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avocat_societe_id UUID NOT NULL,
  nom VARCHAR(100) NOT NULL,
  prenom VARCHAR(100),
  email VARCHAR(200) NOT NULL,
  telephone VARCHAR(20),
  password_hash VARCHAR(255),
  password_changed BOOLEAN DEFAULT false,
  two_fa_secret VARCHAR(100),
  two_fa_enabled BOOLEAN DEFAULT false,
  last_login TIMESTAMP,
  failed_login_attempts INT DEFAULT 0,
  locked_until TIMESTAMP,
  statut VARCHAR(20) DEFAULT 'invite'
    CHECK (statut IN ('invite', 'actif', 'suspendu', 'archive')),
  rgpd_consent BOOLEAN DEFAULT false,
  rgpd_consent_date TIMESTAMP,
  rgpd_consent_ip INET,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_avocat_clients_societe ON public.avocat_clients(avocat_societe_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_avocat_clients_email ON public.avocat_clients(avocat_societe_id, email);

-- Invitations clients
CREATE TABLE IF NOT EXISTS public.avocat_client_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.avocat_clients(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Dossiers
CREATE TABLE IF NOT EXISTS public.avocat_dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avocat_societe_id UUID NOT NULL,
  client_id UUID REFERENCES public.avocat_clients(id),
  reference VARCHAR(50),
  titre VARCHAR(200),
  type VARCHAR(100),
  statut VARCHAR(30) DEFAULT 'ouvert'
    CHECK (statut IN ('ouvert', 'en_cours', 'en_attente', 'clos', 'archive')),
  date_ouverture DATE DEFAULT CURRENT_DATE,
  date_cloture DATE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dossiers_societe ON public.avocat_dossiers(avocat_societe_id);
CREATE INDEX IF NOT EXISTS idx_dossiers_client ON public.avocat_dossiers(client_id);

-- Coffre-fort double auth
CREATE TABLE IF NOT EXISTS public.avocat_coffre_auth (
  avocat_societe_id UUID PRIMARY KEY,
  coffre_password_hash VARCHAR(255) NOT NULL,
  last_access TIMESTAMP,
  failed_attempts INT DEFAULT 0,
  locked_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Documents chiffres
CREATE TABLE IF NOT EXISTS public.avocat_coffre_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID REFERENCES public.avocat_dossiers(id) ON DELETE CASCADE,
  uploaded_by UUID,
  uploaded_by_role VARCHAR(20) CHECK (uploaded_by_role IN ('client', 'avocat')),
  filename VARCHAR(255),
  file_type VARCHAR(50),
  file_size_kb INT,
  mime_type VARCHAR(100),
  storage_path TEXT,
  encrypted BOOLEAN DEFAULT true,
  encryption_iv TEXT,
  encryption_tag TEXT,
  note_client TEXT,
  statut_validation VARCHAR(20) DEFAULT 'en_attente'
    CHECK (statut_validation IN ('en_attente', 'valide', 'refuse', 'a_modifier')),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coffre_docs_dossier ON public.avocat_coffre_documents(dossier_id);

-- Commentaires sur documents
CREATE TABLE IF NOT EXISTS public.avocat_coffre_commentaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES public.avocat_coffre_documents(id) ON DELETE CASCADE,
  author_id UUID,
  author_role VARCHAR(20) CHECK (author_role IN ('client', 'avocat')),
  content TEXT NOT NULL,
  read_by_other BOOLEAN DEFAULT false,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Audit trail (conservation 10 ans min)
CREATE TABLE IF NOT EXISTS public.avocat_coffre_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  user_role VARCHAR(20),
  action VARCHAR(50) NOT NULL,
  target_type VARCHAR(30),
  target_id UUID,
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN DEFAULT true,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON public.avocat_coffre_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.avocat_coffre_audit(created_at);

-- RLS
ALTER TABLE public.avocat_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avocat_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avocat_coffre_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avocat_coffre_commentaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avocat_coffre_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avocat_coffre_auth ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avocat_client_invitations ENABLE ROW LEVEL SECURITY;

-- Verification
SELECT 'avocat_clients' as tbl UNION ALL SELECT 'avocat_dossiers' UNION ALL SELECT 'avocat_coffre_documents' UNION ALL SELECT 'avocat_coffre_auth' UNION ALL SELECT 'avocat_coffre_audit';
