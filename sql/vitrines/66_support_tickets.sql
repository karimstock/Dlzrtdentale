-- =============================================
-- JADOMI — Passe 66 : Support Ticket System
-- Tables, indexes, RLS policies
-- =============================================

-- 1) Enum types
DO $$ BEGIN
  CREATE TYPE support_ticket_category AS ENUM ('bug', 'question', 'demande_fonctionnalite', 'facturation', 'technique', 'autre');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE support_ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE support_ticket_status AS ENUM ('ouvert', 'en_cours', 'resolu', 'ferme');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE support_message_sender AS ENUM ('user', 'admin', 'system');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Table support_tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id   UUID NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  user_email   TEXT NOT NULL,
  subject      TEXT NOT NULL,
  description  TEXT NOT NULL,
  category     support_ticket_category NOT NULL DEFAULT 'autre',
  priority     support_ticket_priority NOT NULL DEFAULT 'medium',
  status       support_ticket_status NOT NULL DEFAULT 'ouvert',
  assigned_to  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ
);

-- 3) Table support_ticket_messages
CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_type  support_message_sender NOT NULL DEFAULT 'user',
  sender_email TEXT NOT NULL,
  message      TEXT NOT NULL,
  attachments  JSONB DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4) Table support_ticket_satisfaction
CREATE TABLE IF NOT EXISTS support_ticket_satisfaction (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  rating       SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ticket_id)
);

-- 5) Indexes
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_societe ON support_tickets(societe_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_email ON support_tickets(user_email);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket ON support_ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_ticket_satisfaction_ticket ON support_ticket_satisfaction(ticket_id);

-- 6) Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_support_ticket_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_support_tickets_updated ON support_tickets;
CREATE TRIGGER trg_support_tickets_updated
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_support_ticket_updated_at();

-- 7) RLS policies
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_satisfaction ENABLE ROW LEVEL SECURITY;

-- Tickets: users see only their societe's tickets
DROP POLICY IF EXISTS support_tickets_user_select ON support_tickets;
CREATE POLICY support_tickets_user_select ON support_tickets
  FOR SELECT USING (
    societe_id IN (
      SELECT societe_id FROM user_societe_roles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS support_tickets_user_insert ON support_tickets;
CREATE POLICY support_tickets_user_insert ON support_tickets
  FOR INSERT WITH CHECK (
    societe_id IN (
      SELECT societe_id FROM user_societe_roles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS support_tickets_user_update ON support_tickets;
CREATE POLICY support_tickets_user_update ON support_tickets
  FOR UPDATE USING (
    societe_id IN (
      SELECT societe_id FROM user_societe_roles WHERE user_id = auth.uid()
    )
  );

-- Messages: users see messages of their societe's tickets
DROP POLICY IF EXISTS support_messages_user_select ON support_ticket_messages;
CREATE POLICY support_messages_user_select ON support_ticket_messages
  FOR SELECT USING (
    ticket_id IN (
      SELECT id FROM support_tickets WHERE societe_id IN (
        SELECT societe_id FROM user_societe_roles WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS support_messages_user_insert ON support_ticket_messages;
CREATE POLICY support_messages_user_insert ON support_ticket_messages
  FOR INSERT WITH CHECK (
    ticket_id IN (
      SELECT id FROM support_tickets WHERE societe_id IN (
        SELECT societe_id FROM user_societe_roles WHERE user_id = auth.uid()
      )
    )
  );

-- Satisfaction: users can read/write for their tickets
DROP POLICY IF EXISTS support_satisfaction_user_select ON support_ticket_satisfaction;
CREATE POLICY support_satisfaction_user_select ON support_ticket_satisfaction
  FOR SELECT USING (
    ticket_id IN (
      SELECT id FROM support_tickets WHERE societe_id IN (
        SELECT societe_id FROM user_societe_roles WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS support_satisfaction_user_insert ON support_ticket_satisfaction;
CREATE POLICY support_satisfaction_user_insert ON support_ticket_satisfaction
  FOR INSERT WITH CHECK (
    ticket_id IN (
      SELECT id FROM support_tickets WHERE societe_id IN (
        SELECT societe_id FROM user_societe_roles WHERE user_id = auth.uid()
      )
    )
  );

-- Service role bypasses RLS (used by API backend)
-- Already handled by Supabase service_role key
