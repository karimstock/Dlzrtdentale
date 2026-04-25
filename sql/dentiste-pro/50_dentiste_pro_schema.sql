-- =============================================
-- Passe 50 - JADOMI DENTISTE PRO - Schema complet
-- Date : 25 avril 2026
-- Multi-profession : dentiste, orthodontiste, kine, osteo,
--   podologue, orthophoniste, sage-femme, infirmier, etc.
-- Termes generiques : praticien, patient, cabinet
-- =============================================

-- =============================================
-- 1. dentiste_pro_cabinets
-- Configuration du cabinet, lie a une societe existante.
-- Stocke le type de profession, les cles VAPID pour push,
-- et la configuration globale du cabinet.
-- =============================================
CREATE TABLE IF NOT EXISTS public.dentiste_pro_cabinets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  profession_type VARCHAR(50) NOT NULL DEFAULT 'dentiste'
    CHECK (profession_type IN (
      'dentiste','orthodontiste','kine','osteo','podologue',
      'orthophoniste','psychomotricien','dieteticien',
      'sage_femme','infirmier','avocat','generaliste',
      'dermatologue','ophtalmologue','autre'
    )),
  nom_cabinet VARCHAR(200),
  adresse TEXT,
  code_postal VARCHAR(10),
  ville VARCHAR(100),
  telephone VARCHAR(20),
  email VARCHAR(200),
  timezone VARCHAR(50) DEFAULT 'Europe/Paris',
  vapid_public_key TEXT,
  vapid_private_key TEXT,
  config JSONB DEFAULT '{}'::jsonb,
  horaires JSONB DEFAULT '{}'::jsonb,
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dp_cabinets_societe ON public.dentiste_pro_cabinets(societe_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dp_cabinets_societe_unique ON public.dentiste_pro_cabinets(societe_id);
COMMENT ON TABLE public.dentiste_pro_cabinets IS 'Cabinet de praticien lie a une societe. Supporte toutes professions de sante et juridiques.';

-- =============================================
-- 2. dentiste_pro_patients
-- Patients rattaches a un cabinet. Authentification par telephone
-- (OTP, pas de mot de passe). Stocke la souscription push
-- pour les notifications navigateur.
-- =============================================
CREATE TABLE IF NOT EXISTS public.dentiste_pro_patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.dentiste_pro_cabinets(id) ON DELETE CASCADE,
  nom VARCHAR(100) NOT NULL,
  prenom VARCHAR(100),
  telephone VARCHAR(20) NOT NULL,
  email VARCHAR(200),
  date_naissance DATE,
  sexe VARCHAR(10) CHECK (sexe IN ('M','F','autre')),
  adresse TEXT,
  code_postal VARCHAR(10),
  ville VARCHAR(100),
  notes_praticien TEXT,
  push_subscription JSONB,
  push_enabled BOOLEAN DEFAULT false,
  otp_code VARCHAR(6),
  otp_expires_at TIMESTAMP,
  otp_attempts INT DEFAULT 0,
  last_otp_sent_at TIMESTAMP,
  derniere_visite TIMESTAMP,
  rgpd_consent BOOLEAN DEFAULT false,
  rgpd_consent_date TIMESTAMP,
  statut VARCHAR(20) DEFAULT 'actif'
    CHECK (statut IN ('actif','inactif','archive')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dp_patients_cabinet_tel ON public.dentiste_pro_patients(cabinet_id, telephone);
CREATE INDEX IF NOT EXISTS idx_dp_patients_cabinet ON public.dentiste_pro_patients(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_dp_patients_nom ON public.dentiste_pro_patients(cabinet_id, nom, prenom);
COMMENT ON TABLE public.dentiste_pro_patients IS 'Patients du cabinet. Auth par OTP telephone, sans mot de passe. Un patient est unique par cabinet+telephone.';

-- =============================================
-- 3. dentiste_pro_series
-- Serie de rendez-vous (ex: 6 seances de kine tous les 7 jours).
-- Entite de premier ordre qui regroupe plusieurs creneaux.
-- =============================================
CREATE TABLE IF NOT EXISTS public.dentiste_pro_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.dentiste_pro_cabinets(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.dentiste_pro_patients(id) ON DELETE CASCADE,
  titre VARCHAR(200),
  motif TEXT,
  nb_rdv_total INT NOT NULL DEFAULT 1 CHECK (nb_rdv_total >= 1),
  nb_rdv_booked INT DEFAULT 0 CHECK (nb_rdv_booked >= 0),
  frequency_days INT DEFAULT 7 CHECK (frequency_days >= 1),
  time_window_start TIME,
  time_window_end TIME,
  preferred_days JSONB DEFAULT '[]'::jsonb,
  duration_min INT DEFAULT 30,
  statut VARCHAR(20) DEFAULT 'active'
    CHECK (statut IN ('active','completed','cancelled','paused')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dp_series_cabinet ON public.dentiste_pro_series(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_dp_series_patient ON public.dentiste_pro_series(patient_id);
CREATE INDEX IF NOT EXISTS idx_dp_series_statut ON public.dentiste_pro_series(cabinet_id, statut);
COMMENT ON TABLE public.dentiste_pro_series IS 'Serie de RDV groupes (batch booking). Lie N creneaux avec frequence, fenetre horaire et jours preferes.';

-- =============================================
-- 4. dentiste_pro_series_slots
-- Creneau individuel dans une serie.
-- Peut etre lie a un RDV reel dans appointments.
-- =============================================
CREATE TABLE IF NOT EXISTS public.dentiste_pro_series_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serie_id UUID NOT NULL REFERENCES public.dentiste_pro_series(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  slot_order INT NOT NULL DEFAULT 1,
  target_date DATE NOT NULL,
  target_time TIME,
  statut VARCHAR(20) DEFAULT 'proposed'
    CHECK (statut IN ('proposed','confirmed','conflict','rescheduled','cancelled','completed')),
  alternatives JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dp_slots_serie ON public.dentiste_pro_series_slots(serie_id);
CREATE INDEX IF NOT EXISTS idx_dp_slots_appointment ON public.dentiste_pro_series_slots(appointment_id);
CREATE INDEX IF NOT EXISTS idx_dp_slots_date ON public.dentiste_pro_series_slots(target_date);
CREATE INDEX IF NOT EXISTS idx_dp_slots_statut ON public.dentiste_pro_series_slots(serie_id, statut);
COMMENT ON TABLE public.dentiste_pro_series_slots IS 'Creneau individuel dans une serie. Lie a un appointment reel. Alternatives proposees en JSONB si conflit.';

-- =============================================
-- 5. dentiste_pro_messages
-- Chat entre patient et praticien. Support messages systeme,
-- pieces jointes (media_url), et suivi de lecture.
-- =============================================
CREATE TABLE IF NOT EXISTS public.dentiste_pro_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.dentiste_pro_cabinets(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.dentiste_pro_patients(id) ON DELETE CASCADE,
  sender_type VARCHAR(20) NOT NULL
    CHECK (sender_type IN ('patient','praticien','system')),
  sender_id UUID,
  content TEXT,
  media_url TEXT,
  media_type VARCHAR(50),
  metadata JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMP,
  delivered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dp_messages_conversation ON public.dentiste_pro_messages(cabinet_id, patient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dp_messages_patient ON public.dentiste_pro_messages(patient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dp_messages_unread ON public.dentiste_pro_messages(cabinet_id, patient_id) WHERE read_at IS NULL;
COMMENT ON TABLE public.dentiste_pro_messages IS 'Chat patient/praticien/systeme. Supporte media, suivi de lecture et notifications.';

-- =============================================
-- 6. dentiste_pro_waitlist
-- Liste d attente intelligente avec score d urgence,
-- preferences horaires, et proximite geographique.
-- =============================================
CREATE TABLE IF NOT EXISTS public.dentiste_pro_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.dentiste_pro_cabinets(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.dentiste_pro_patients(id) ON DELETE CASCADE,
  motif TEXT,
  urgency_score INT NOT NULL DEFAULT 5
    CHECK (urgency_score BETWEEN 1 AND 10),
  preferred_times JSONB DEFAULT '[]'::jsonb,
  preferred_days JSONB DEFAULT '[]'::jsonb,
  proximity_km NUMERIC(6,2),
  duration_min INT DEFAULT 30,
  wait_since TIMESTAMP DEFAULT NOW(),
  notified_at TIMESTAMP,
  booked_appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  statut VARCHAR(20) DEFAULT 'waiting'
    CHECK (statut IN ('waiting','notified','booked','expired','cancelled')),
  notes TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dp_waitlist_cabinet ON public.dentiste_pro_waitlist(cabinet_id, statut);
CREATE INDEX IF NOT EXISTS idx_dp_waitlist_urgency ON public.dentiste_pro_waitlist(cabinet_id, urgency_score DESC) WHERE statut = 'waiting';
CREATE INDEX IF NOT EXISTS idx_dp_waitlist_patient ON public.dentiste_pro_waitlist(patient_id);
COMMENT ON TABLE public.dentiste_pro_waitlist IS 'File d attente intelligente. Trie par urgence, preferences horaires et proximite pour attribution optimale.';

-- =============================================
-- 7. dentiste_pro_urgence_slots
-- Recuperation de creneaux annules. Notification atomique
-- des patients en liste d attente, avec claim exclusif.
-- =============================================
CREATE TABLE IF NOT EXISTS public.dentiste_pro_urgence_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.dentiste_pro_cabinets(id) ON DELETE CASCADE,
  original_appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  slot_start TIMESTAMPTZ NOT NULL,
  slot_end TIMESTAMPTZ NOT NULL,
  duration_min INT NOT NULL,
  motif_original TEXT,
  notified_patient_ids UUID[] DEFAULT '{}',
  notified_at TIMESTAMP,
  claimed_by UUID REFERENCES public.dentiste_pro_patients(id) ON DELETE SET NULL,
  claimed_at TIMESTAMP,
  new_appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  statut VARCHAR(20) DEFAULT 'available'
    CHECK (statut IN ('available','notifying','claimed','expired','cancelled')),
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dp_urgence_cabinet ON public.dentiste_pro_urgence_slots(cabinet_id, statut);
CREATE INDEX IF NOT EXISTS idx_dp_urgence_slot_time ON public.dentiste_pro_urgence_slots(slot_start) WHERE statut = 'available';
CREATE INDEX IF NOT EXISTS idx_dp_urgence_claimed ON public.dentiste_pro_urgence_slots(claimed_by) WHERE claimed_by IS NOT NULL;
COMMENT ON TABLE public.dentiste_pro_urgence_slots IS 'Creneaux liberes par annulation. Notification en batch des patients eligibles, claim atomique premier arrive.';

-- =============================================
-- 8. dentiste_pro_ia_config
-- Configuration du chatbot IA par cabinet.
-- Base de connaissances, ton, seuil d escalade vers humain.
-- =============================================
CREATE TABLE IF NOT EXISTS public.dentiste_pro_ia_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.dentiste_pro_cabinets(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT true,
  greeting TEXT DEFAULT 'Bonjour, comment puis-je vous aider ?',
  tone VARCHAR(30) DEFAULT 'professionnel'
    CHECK (tone IN ('professionnel','amical','formel','decontracte')),
  knowledge_base JSONB DEFAULT '{}'::jsonb,
  faq JSONB DEFAULT '[]'::jsonb,
  escalation_threshold INT DEFAULT 3
    CHECK (escalation_threshold BETWEEN 1 AND 10),
  escalation_message TEXT DEFAULT 'Je vous mets en relation avec le cabinet.',
  auto_reply_outside_hours BOOLEAN DEFAULT true,
  outside_hours_message TEXT DEFAULT 'Le cabinet est actuellement ferme. Nous vous repondrons des notre ouverture.',
  max_tokens_per_response INT DEFAULT 500,
  model_config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dp_ia_config_cabinet ON public.dentiste_pro_ia_config(cabinet_id);
COMMENT ON TABLE public.dentiste_pro_ia_config IS 'Configuration IA du chatbot par cabinet. Knowledge base, ton, FAQ, seuil d escalade vers praticien humain.';

-- =============================================
-- 9. dentiste_pro_rappels
-- Suivi des rappels multi-touch (J-7, J-3, J-1, H-2).
-- Multi-canal : SMS, email, push. Tracking statut par envoi.
-- =============================================
CREATE TABLE IF NOT EXISTS public.dentiste_pro_rappels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.dentiste_pro_cabinets(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.dentiste_pro_patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
  serie_id UUID REFERENCES public.dentiste_pro_series(id) ON DELETE SET NULL,
  rappel_type VARCHAR(10) NOT NULL
    CHECK (rappel_type IN ('j7','j3','j1','h2','custom')),
  channel VARCHAR(10) NOT NULL
    CHECK (channel IN ('sms','email','push')),
  scheduled_at TIMESTAMP NOT NULL,
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  opened_at TIMESTAMP,
  clicked_at TIMESTAMP,
  statut VARCHAR(20) DEFAULT 'pending'
    CHECK (statut IN ('pending','sent','delivered','failed','cancelled','opened')),
  error_message TEXT,
  retry_count INT DEFAULT 0,
  message_content TEXT,
  external_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dp_rappels_scheduled ON public.dentiste_pro_rappels(scheduled_at) WHERE statut = 'pending';
CREATE INDEX IF NOT EXISTS idx_dp_rappels_appointment ON public.dentiste_pro_rappels(appointment_id);
CREATE INDEX IF NOT EXISTS idx_dp_rappels_patient ON public.dentiste_pro_rappels(patient_id);
CREATE INDEX IF NOT EXISTS idx_dp_rappels_cabinet_statut ON public.dentiste_pro_rappels(cabinet_id, statut);
COMMENT ON TABLE public.dentiste_pro_rappels IS 'Rappels multi-touch (J-7/J-3/J-1/H-2) et multi-canal (SMS/email/push). Tracking complet envoi/ouverture.';

-- =============================================
-- 10. dentiste_pro_events
-- Evenements analytiques : actions patient, praticien, systeme.
-- Metadata flexible en JSONB pour tout type d evenement.
-- =============================================
CREATE TABLE IF NOT EXISTS public.dentiste_pro_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.dentiste_pro_cabinets(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.dentiste_pro_patients(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  event_category VARCHAR(30) DEFAULT 'general'
    CHECK (event_category IN ('general','booking','cancellation','reminder','chat','waitlist','urgence','ia','auth')),
  source VARCHAR(20) DEFAULT 'system'
    CHECK (source IN ('patient','praticien','system','cron')),
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dp_events_cabinet ON public.dentiste_pro_events(cabinet_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dp_events_patient ON public.dentiste_pro_events(patient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dp_events_type ON public.dentiste_pro_events(cabinet_id, event_type);
CREATE INDEX IF NOT EXISTS idx_dp_events_category ON public.dentiste_pro_events(cabinet_id, event_category, created_at);
COMMENT ON TABLE public.dentiste_pro_events IS 'Evenements analytiques du cabinet. Tracking actions patient/praticien/systeme avec metadata JSONB flexible.';

-- =============================================
-- RLS - Row Level Security sur toutes les tables
-- =============================================
ALTER TABLE public.dentiste_pro_cabinets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentiste_pro_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentiste_pro_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentiste_pro_series_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentiste_pro_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentiste_pro_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentiste_pro_urgence_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentiste_pro_ia_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentiste_pro_rappels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentiste_pro_events ENABLE ROW LEVEL SECURITY;

-- =============================================
-- Verification
-- =============================================
SELECT 'dentiste_pro_cabinets' AS tbl UNION ALL
SELECT 'dentiste_pro_patients' UNION ALL
SELECT 'dentiste_pro_series' UNION ALL
SELECT 'dentiste_pro_series_slots' UNION ALL
SELECT 'dentiste_pro_messages' UNION ALL
SELECT 'dentiste_pro_waitlist' UNION ALL
SELECT 'dentiste_pro_urgence_slots' UNION ALL
SELECT 'dentiste_pro_ia_config' UNION ALL
SELECT 'dentiste_pro_rappels' UNION ALL
SELECT 'dentiste_pro_events';
