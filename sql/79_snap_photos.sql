-- =============================================
-- JADOMI — Migration 79 : Snap Photos (QR code camera passeports)
-- =============================================

-- Table des tokens snap (liens QR code temporaires)
CREATE TABLE IF NOT EXISTS snap_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  patient_id UUID REFERENCES patients_jadomi(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  passeport_type TEXT NOT NULL CHECK (passeport_type IN ('blanchiment','facettes','implant','rehabilitation','orthodontie')),
  seance_number INTEGER DEFAULT 1,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','used','expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table des photos snap
CREATE TABLE IF NOT EXISTS snap_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients_jadomi(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  passeport_type TEXT NOT NULL,
  seance_number INTEGER DEFAULT 1,
  photo_path TEXT NOT NULL,
  photo_url TEXT,
  taken_at TIMESTAMPTZ DEFAULT now(),
  taken_by UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_snap_tokens_token ON snap_tokens(token);
CREATE INDEX IF NOT EXISTS idx_snap_tokens_patient ON snap_tokens(patient_id);
CREATE INDEX IF NOT EXISTS idx_snap_tokens_societe ON snap_tokens(societe_id);
CREATE INDEX IF NOT EXISTS idx_snap_tokens_status ON snap_tokens(status) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_snap_photos_patient ON snap_photos(patient_id);
CREATE INDEX IF NOT EXISTS idx_snap_photos_societe ON snap_photos(societe_id);
CREATE INDEX IF NOT EXISTS idx_snap_photos_type ON snap_photos(passeport_type);

-- RLS : activer
ALTER TABLE snap_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE snap_photos ENABLE ROW LEVEL SECURITY;

-- RLS policies : snap_tokens
-- Les utilisateurs de la societe peuvent lire/creer des tokens
CREATE POLICY snap_tokens_select ON snap_tokens FOR SELECT
  USING (
    societe_id IN (
      SELECT id FROM societes WHERE owner_id = auth.uid()
    )
    OR
    -- Acces public par token (pour la page camera)
    TRUE
  );

CREATE POLICY snap_tokens_insert ON snap_tokens FOR INSERT
  WITH CHECK (
    societe_id IN (
      SELECT id FROM societes WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY snap_tokens_update ON snap_tokens FOR UPDATE
  USING (
    societe_id IN (
      SELECT id FROM societes WHERE owner_id = auth.uid()
    )
    OR TRUE -- permettre update status par le service
  );

-- RLS policies : snap_photos
CREATE POLICY snap_photos_select ON snap_photos FOR SELECT
  USING (
    societe_id IN (
      SELECT id FROM societes WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY snap_photos_insert ON snap_photos FOR INSERT
  WITH CHECK (
    societe_id IN (
      SELECT id FROM societes WHERE owner_id = auth.uid()
    )
    OR TRUE -- permettre insertion par le service (upload public)
  );

-- Nettoyage automatique des tokens expires (optionnel, via cron pg_cron)
-- SELECT cron.schedule('cleanup-snap-tokens', '0 3 * * *',
--   $$UPDATE snap_tokens SET status = 'expired' WHERE status = 'pending' AND expires_at < now()$$
-- );
