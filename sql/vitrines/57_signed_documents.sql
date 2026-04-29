-- Passe 56 — Documents signés (DocuSeal integration)
-- Table pour stocker tous les documents signés électroniquement

CREATE TABLE IF NOT EXISTS signed_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES societes(id),
  user_id UUID,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'contrat', -- contrat, mandat, avocat, juridique, administratif, autre
  subcategory TEXT, -- sous-dossier thème
  docuseal_submission_id INTEGER UNIQUE, -- DocuSeal submission ID (unique to prevent duplicate webhooks)
  docuseal_template_id INTEGER, -- DocuSeal template ID
  signer_name TEXT,
  signer_email TEXT,
  signer_role TEXT, -- fournisseur, client, patient, avocat, partenaire
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','viewed','signed','expired','rejected')),
  signed_at TIMESTAMPTZ,
  signed_pdf_url TEXT, -- URL to signed PDF (stored locally or R2)
  signed_pdf_path TEXT, -- local path to signed PDF
  original_document_url TEXT, -- original document before signing
  metadata JSONB DEFAULT '{}', -- flexible extra data
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sd_societe ON signed_documents(societe_id);
CREATE INDEX IF NOT EXISTS idx_sd_user ON signed_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_sd_category ON signed_documents(category);
CREATE INDEX IF NOT EXISTS idx_sd_status ON signed_documents(status);
CREATE INDEX IF NOT EXISTS idx_sd_signed_at ON signed_documents(signed_at);
CREATE INDEX IF NOT EXISTS idx_sd_signer_email ON signed_documents(signer_email);
CREATE INDEX IF NOT EXISTS idx_sd_docuseal_sub ON signed_documents(docuseal_submission_id);
CREATE INDEX IF NOT EXISTS idx_sd_societe_created ON signed_documents(societe_id, created_at DESC);

-- NOTE: RLS is NOT enabled here because queries go through the service_role key
-- in server.js. If switching to anon key or direct client access, enable RLS:
-- ALTER TABLE signed_documents ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY ... ON signed_documents FOR SELECT USING (societe_id = auth.jwt()->>'societe_id');
