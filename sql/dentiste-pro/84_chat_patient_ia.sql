-- =============================================
-- JADOMI — Chat IA Patient : stockage des messages
-- Table : chat_patient_ia_messages
-- =============================================

CREATE TABLE IF NOT EXISTS public.chat_patient_ia_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('patient', 'ia')),
  content TEXT NOT NULL,
  intent TEXT,
  entities JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_chat_patient_ia_patient ON public.chat_patient_ia_messages(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_patient_ia_cabinet ON public.chat_patient_ia_messages(cabinet_id);

-- GRANT obligatoires (Supabase post-octobre 2026)
GRANT SELECT ON public.chat_patient_ia_messages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_patient_ia_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_patient_ia_messages TO service_role;

-- RLS
ALTER TABLE public.chat_patient_ia_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_patient_ia_service ON public.chat_patient_ia_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY chat_patient_ia_read ON public.chat_patient_ia_messages FOR SELECT TO authenticated USING (true);
