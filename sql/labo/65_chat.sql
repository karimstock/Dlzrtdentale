-- =============================================
-- JADOMI LABO — Chat dentiste-prothesiste
-- Tables conversations et messages
-- =============================================

CREATE TABLE IF NOT EXISTS labo_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  dentiste_id UUID NOT NULL REFERENCES dentistes_clients(id),
  case_production_id UUID REFERENCES labo_production_cases(id),
  sujet TEXT,
  dernier_message_at TIMESTAMPTZ DEFAULT now(),
  statut TEXT DEFAULT 'active' CHECK (statut IN ('active','archivee')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labo_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES labo_conversations(id) ON DELETE CASCADE,
  auteur_type TEXT NOT NULL CHECK (auteur_type IN ('labo','dentiste')),
  auteur_nom TEXT,
  contenu TEXT NOT NULL,
  pieces_jointes TEXT[] DEFAULT '{}',
  type TEXT DEFAULT 'text' CHECK (type IN ('text','photo','fichier','systeme')),
  lu_labo BOOLEAN DEFAULT false,
  lu_dentiste BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_prothesiste ON labo_conversations(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_conv_dentiste ON labo_conversations(dentiste_id);
CREATE INDEX IF NOT EXISTS idx_conv_dernier ON labo_conversations(dernier_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON labo_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_msg_created ON labo_messages(created_at DESC);
