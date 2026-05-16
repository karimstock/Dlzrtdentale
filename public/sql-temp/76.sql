-- =====================================================================
-- JADOMI — IA Documentaire (Passe 76)
-- Module de transcription, consultation IA et generation de documents
-- Idempotent.
-- =====================================================================

-- =========================
-- 1. ia_doc_sessions
-- =========================
CREATE TABLE IF NOT EXISTS public.ia_doc_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  patient_id uuid,

  consultation_type text NOT NULL DEFAULT 'general' CHECK (consultation_type IN (
    'general', 'urgence', 'controle', 'implant', 'ortho', 'endo', 'paro', 'prothese', 'chirurgie'
  )),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),

  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer,
  segments_count integer DEFAULT 0,
  languages_detected text[] DEFAULT '{}',
  metadata jsonb DEFAULT '{}',

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ia_doc_sessions_societe
  ON public.ia_doc_sessions(societe_id);
CREATE INDEX IF NOT EXISTS idx_ia_doc_sessions_user
  ON public.ia_doc_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_ia_doc_sessions_patient
  ON public.ia_doc_sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_ia_doc_sessions_status_started
  ON public.ia_doc_sessions(status, started_at DESC);

-- =========================
-- 2. ia_doc_segments
-- =========================
CREATE TABLE IF NOT EXISTS public.ia_doc_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.ia_doc_sessions(id) ON DELETE CASCADE,

  speaker text NOT NULL CHECK (speaker IN ('dentiste', 'patient', 'assistant', 'autre')),
  text text NOT NULL,
  language text DEFAULT 'fr',
  translated_text text,
  timestamp_ms integer,
  duration_ms integer,
  confidence real,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ia_doc_segments_session_created
  ON public.ia_doc_segments(session_id, created_at);

-- =========================
-- 3. ia_doc_documents
-- =========================
CREATE TABLE IF NOT EXISTS public.ia_doc_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.ia_doc_sessions(id) ON DELETE SET NULL,
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  patient_id uuid,

  type text NOT NULL CHECK (type IN (
    'cr_consultation', 'courrier_confrere', 'bon_labo', 'ordonnance',
    'certificat', 'devis', 'consentement', 'lettre_correspondant',
    'cr_implant', 'cr_cone_beam'
  )),
  title text NOT NULL,
  content_html text NOT NULL,
  content_text text NOT NULL,
  source_transcription text,
  language text DEFAULT 'fr',

  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'validated', 'signed', 'sent')),
  validated_at timestamptz,
  validated_by uuid,

  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ia_doc_documents_societe_created
  ON public.ia_doc_documents(societe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ia_doc_documents_session
  ON public.ia_doc_documents(session_id);
CREATE INDEX IF NOT EXISTS idx_ia_doc_documents_type
  ON public.ia_doc_documents(type);
CREATE INDEX IF NOT EXISTS idx_ia_doc_documents_patient
  ON public.ia_doc_documents(patient_id);

-- =========================
-- 4. ia_doc_usage
-- =========================
CREATE TABLE IF NOT EXISTS public.ia_doc_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,

  sessions_count integer DEFAULT 0,
  stt_seconds integer DEFAULT 0,
  tts_seconds integer DEFAULT 0,
  documents_count integer DEFAULT 0,
  translations_count integer DEFAULT 0,
  estimated_cost_cents integer DEFAULT 0,

  created_at timestamptz DEFAULT now(),

  CONSTRAINT uq_ia_doc_usage_societe_user_date UNIQUE (societe_id, user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ia_doc_usage_societe_date
  ON public.ia_doc_usage(societe_id, date);
CREATE INDEX IF NOT EXISTS idx_ia_doc_usage_user_date
  ON public.ia_doc_usage(user_id, date);

-- =====================================================================
-- 5. Trigger updated_at sur ia_doc_documents
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_ia_doc_documents_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ia_doc_documents_updated_at ON public.ia_doc_documents;
CREATE TRIGGER trg_ia_doc_documents_updated_at
  BEFORE UPDATE ON public.ia_doc_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_ia_doc_documents_updated_at();

-- =====================================================================
-- 6. Row Level Security
-- =====================================================================

-- --- ia_doc_sessions ---
ALTER TABLE public.ia_doc_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ia_doc_sessions_select ON public.ia_doc_sessions;
CREATE POLICY ia_doc_sessions_select ON public.ia_doc_sessions
  FOR SELECT USING (
    societe_id IN (
      SELECT id FROM public.societes WHERE user_id = auth.uid()
      UNION
      SELECT societe_id FROM public.membres WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ia_doc_sessions_insert ON public.ia_doc_sessions;
CREATE POLICY ia_doc_sessions_insert ON public.ia_doc_sessions
  FOR INSERT WITH CHECK (
    societe_id IN (
      SELECT id FROM public.societes WHERE user_id = auth.uid()
      UNION
      SELECT societe_id FROM public.membres WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ia_doc_sessions_update ON public.ia_doc_sessions;
CREATE POLICY ia_doc_sessions_update ON public.ia_doc_sessions
  FOR UPDATE USING (
    societe_id IN (
      SELECT id FROM public.societes WHERE user_id = auth.uid()
      UNION
      SELECT societe_id FROM public.membres WHERE user_id = auth.uid()
    )
  );

-- --- ia_doc_segments ---
ALTER TABLE public.ia_doc_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ia_doc_segments_select ON public.ia_doc_segments;
CREATE POLICY ia_doc_segments_select ON public.ia_doc_segments
  FOR SELECT USING (
    session_id IN (
      SELECT id FROM public.ia_doc_sessions WHERE societe_id IN (
        SELECT id FROM public.societes WHERE user_id = auth.uid()
        UNION
        SELECT societe_id FROM public.membres WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS ia_doc_segments_insert ON public.ia_doc_segments;
CREATE POLICY ia_doc_segments_insert ON public.ia_doc_segments
  FOR INSERT WITH CHECK (
    session_id IN (
      SELECT id FROM public.ia_doc_sessions WHERE societe_id IN (
        SELECT id FROM public.societes WHERE user_id = auth.uid()
        UNION
        SELECT societe_id FROM public.membres WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS ia_doc_segments_update ON public.ia_doc_segments;
CREATE POLICY ia_doc_segments_update ON public.ia_doc_segments
  FOR UPDATE USING (
    session_id IN (
      SELECT id FROM public.ia_doc_sessions WHERE societe_id IN (
        SELECT id FROM public.societes WHERE user_id = auth.uid()
        UNION
        SELECT societe_id FROM public.membres WHERE user_id = auth.uid()
      )
    )
  );

-- --- ia_doc_documents ---
ALTER TABLE public.ia_doc_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ia_doc_documents_select ON public.ia_doc_documents;
CREATE POLICY ia_doc_documents_select ON public.ia_doc_documents
  FOR SELECT USING (
    societe_id IN (
      SELECT id FROM public.societes WHERE user_id = auth.uid()
      UNION
      SELECT societe_id FROM public.membres WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ia_doc_documents_insert ON public.ia_doc_documents;
CREATE POLICY ia_doc_documents_insert ON public.ia_doc_documents
  FOR INSERT WITH CHECK (
    societe_id IN (
      SELECT id FROM public.societes WHERE user_id = auth.uid()
      UNION
      SELECT societe_id FROM public.membres WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ia_doc_documents_update ON public.ia_doc_documents;
CREATE POLICY ia_doc_documents_update ON public.ia_doc_documents
  FOR UPDATE USING (
    societe_id IN (
      SELECT id FROM public.societes WHERE user_id = auth.uid()
      UNION
      SELECT societe_id FROM public.membres WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ia_doc_documents_delete ON public.ia_doc_documents;
CREATE POLICY ia_doc_documents_delete ON public.ia_doc_documents
  FOR DELETE USING (
    status = 'draft'
    AND societe_id IN (
      SELECT id FROM public.societes WHERE user_id = auth.uid()
      UNION
      SELECT societe_id FROM public.membres WHERE user_id = auth.uid()
    )
  );

-- --- ia_doc_usage ---
ALTER TABLE public.ia_doc_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ia_doc_usage_select ON public.ia_doc_usage;
CREATE POLICY ia_doc_usage_select ON public.ia_doc_usage
  FOR SELECT USING (
    societe_id IN (
      SELECT id FROM public.societes WHERE user_id = auth.uid()
      UNION
      SELECT societe_id FROM public.membres WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ia_doc_usage_insert ON public.ia_doc_usage;
CREATE POLICY ia_doc_usage_insert ON public.ia_doc_usage
  FOR INSERT WITH CHECK (
    societe_id IN (
      SELECT id FROM public.societes WHERE user_id = auth.uid()
      UNION
      SELECT societe_id FROM public.membres WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ia_doc_usage_update ON public.ia_doc_usage;
CREATE POLICY ia_doc_usage_update ON public.ia_doc_usage
  FOR UPDATE USING (
    societe_id IN (
      SELECT id FROM public.societes WHERE user_id = auth.uid()
      UNION
      SELECT societe_id FROM public.membres WHERE user_id = auth.uid()
    )
  );

-- =====================================================================
-- 7. Commentaires tables
-- =====================================================================
COMMENT ON TABLE public.ia_doc_sessions IS 'Sessions de consultation IA Documentaire — transcription temps reel';
COMMENT ON TABLE public.ia_doc_segments IS 'Segments de transcription (speech-to-text) rattaches a une session';
COMMENT ON TABLE public.ia_doc_documents IS 'Documents generes par l IA a partir des transcriptions';
COMMENT ON TABLE public.ia_doc_usage IS 'Suivi quotidien de consommation IA par societe/utilisateur (quotas)';

-- =====================================================================
-- FIN Passe 76 — IA Documentaire
-- =====================================================================
