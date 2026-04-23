-- =============================================
-- JADOMI — Module Mon site internet
-- 08_contact_requests.sql
-- =============================================

CREATE TABLE IF NOT EXISTS vitrines_contact_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES vitrines_sites(id) ON DELETE CASCADE,
  societe_id uuid NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  motif text,
  message text NOT NULL,
  rgpd_consent boolean DEFAULT false,
  status text DEFAULT 'new',
  created_at timestamptz DEFAULT now(),
  read_at timestamptz,
  replied_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_vitrines_contact_site ON vitrines_contact_requests(site_id);
CREATE INDEX IF NOT EXISTS idx_vitrines_contact_status ON vitrines_contact_requests(status);
