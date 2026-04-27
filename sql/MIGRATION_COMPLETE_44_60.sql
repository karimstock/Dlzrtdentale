-- ╔════════════════════════════════════════════════════════════════╗
-- ║  JADOMI — MIGRATION COMPLETE SQL 44 → 60 + 38 (Coins)       ║
-- ║  A executer en UNE SEULE FOIS dans Supabase Dashboard        ║
-- ║  Date : 27 avril 2026                                        ║
-- ║  19 fichiers combines dans l'ordre                           ║
-- ╚════════════════════════════════════════════════════════════════╝


-- ═══════════════════════════════════════════════════════════════
-- SQL 44 — Chatbot v3 formules + tags themes
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.vitrines_sites
  ADD COLUMN IF NOT EXISTS formule_choisie VARCHAR(20);

ALTER TABLE public.themes_sites
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;


-- ═══════════════════════════════════════════════════════════════
-- SQL 45 — Categories photos equipements/zones
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.vitrines_medias
  ADD COLUMN IF NOT EXISTS category VARCHAR(50);

ALTER TABLE public.vitrines_medias
  ADD COLUMN IF NOT EXISTS tag VARCHAR(100);


-- ═══════════════════════════════════════════════════════════════
-- SQL 46 — Pages dediees + sections enrichies
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.vitrines_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL,
  slug VARCHAR(100) NOT NULL,
  titre VARCHAR(200),
  specialite_id VARCHAR(50),
  type VARCHAR(30) DEFAULT 'custom',
  ordre INT DEFAULT 0,
  is_generated_ia BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(site_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_pages_site ON public.vitrines_pages(site_id);

ALTER TABLE public.vitrines_sections
  ADD COLUMN IF NOT EXISTS section_source VARCHAR(50) DEFAULT 'user_input';
ALTER TABLE public.vitrines_sections
  ADD COLUMN IF NOT EXISTS equipment_id VARCHAR(50);
ALTER TABLE public.vitrines_sections
  ADD COLUMN IF NOT EXISTS specialite_id VARCHAR(50);
ALTER TABLE public.vitrines_sections
  ADD COLUMN IF NOT EXISTS page_id UUID;

ALTER TABLE public.vitrines_pages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
CREATE POLICY pages_all ON public.vitrines_pages FOR ALL USING (
  site_id IN (SELECT id FROM public.vitrines_sites WHERE societe_id IN (
    SELECT societe_id FROM public.user_societe_roles WHERE user_id = auth.uid()
  ))
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- SQL 47 — Staging sites + scanner enrichi
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.staging_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL,
  analysis_id UUID,
  slug VARCHAR(150) UNIQUE NOT NULL,
  url_originale TEXT NOT NULL,
  url_staging TEXT,
  statut VARCHAR(30) DEFAULT 'en_creation'
    CHECK (statut IN ('en_creation', 'pret', 'en_modification', 'valide', 'deploye', 'archive')),
  nombre_pages INT DEFAULT 0,
  nombre_medias INT DEFAULT 0,
  taille_totale_mb NUMERIC(10,2),
  modifications_ia JSONB DEFAULT '[]',
  exports_client JSONB DEFAULT '{}',
  historique_changements JSONB DEFAULT '[]',
  valide_par_client BOOLEAN DEFAULT false,
  valide_le TIMESTAMP,
  deploye_le TIMESTAMP,
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days'),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_staging_societe ON public.staging_sites(societe_id);
CREATE INDEX IF NOT EXISTS idx_staging_statut ON public.staging_sites(statut);

ALTER TABLE public.site_analyses
  ADD COLUMN IF NOT EXISTS hebergeur VARCHAR(50),
  ADD COLUMN IF NOT EXISTS hebergeur_confiance INT;

ALTER TABLE public.staging_sites ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
CREATE POLICY staging_all ON public.staging_sites FOR ALL USING (
  societe_id IN (SELECT societe_id FROM public.user_societe_roles WHERE user_id = auth.uid())
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- SQL 48 — JADOMI Avocat Expert - Coffre-fort securise
-- ═══════════════════════════════════════════════════════════════

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

CREATE TABLE IF NOT EXISTS public.avocat_client_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.avocat_clients(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS public.avocat_coffre_auth (
  avocat_societe_id UUID PRIMARY KEY,
  coffre_password_hash VARCHAR(255) NOT NULL,
  last_access TIMESTAMP,
  failed_attempts INT DEFAULT 0,
  locked_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

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

ALTER TABLE public.avocat_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avocat_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avocat_coffre_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avocat_coffre_commentaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avocat_coffre_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avocat_coffre_auth ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avocat_client_invitations ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════
-- SQL 49 — OTP multi-canal (SMS / WhatsApp / Email)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.avocat_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_role VARCHAR(20) NOT NULL CHECK (user_role IN ('avocat', 'client')),
  canal VARCHAR(20) NOT NULL CHECK (canal IN ('sms', 'whatsapp', 'email')),
  destination VARCHAR(200) NOT NULL,
  code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
  attempts INT DEFAULT 0,
  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_user ON public.avocat_otp_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON public.avocat_otp_codes(expires_at);

ALTER TABLE public.avocat_clients
  ADD COLUMN IF NOT EXISTS otp_canal_prefere VARCHAR(20) DEFAULT 'email';

ALTER TABLE public.avocat_coffre_auth
  ADD COLUMN IF NOT EXISTS otp_canal_prefere VARCHAR(20) DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS otp_telephone VARCHAR(20);

ALTER TABLE public.avocat_otp_codes ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════
-- SQL 50 — JADOMI Dentiste Pro - Schema complet (10 tables)
-- ═══════════════════════════════════════════════════════════════

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


-- ═══════════════════════════════════════════════════════════════
-- SQL 51 — Dentiste Pro - Roles & Permissions (equipe)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.dentiste_pro_team (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.dentiste_pro_cabinets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  email VARCHAR(200) NOT NULL,
  nom VARCHAR(100),
  prenom VARCHAR(100),
  role VARCHAR(30) NOT NULL DEFAULT 'assistante'
    CHECK (role IN ('praticien','associe','secretaire','assistante','comptable','stagiaire')),
  permissions JSONB NOT NULL DEFAULT '{
    "agenda": true,
    "patients": true,
    "chat": true,
    "stock": false,
    "comptabilite": false,
    "facturation": false,
    "statistiques": false,
    "configuration": false,
    "waitlist": true,
    "rappels": true,
    "chat_ia_config": false,
    "series": true,
    "documents": true,
    "timeline": false
  }'::jsonb,
  invitation_token VARCHAR(100),
  invitation_expires_at TIMESTAMP,
  invitation_accepted BOOLEAN DEFAULT false,
  actif BOOLEAN DEFAULT true,
  derniere_connexion TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dp_team_cabinet
  ON public.dentiste_pro_team(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_dp_team_user
  ON public.dentiste_pro_team(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dp_team_email
  ON public.dentiste_pro_team(cabinet_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dp_team_invitation_token
  ON public.dentiste_pro_team(invitation_token) WHERE invitation_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_dp_team_cabinet_email_unique
  ON public.dentiste_pro_team(cabinet_id, email);

ALTER TABLE public.dentiste_pro_team ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════
-- SQL 52 — Triangle Photo (Patient-Praticien-Labo)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.dentiste_pro_labos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.dentiste_pro_cabinets(id) ON DELETE CASCADE,
  nom VARCHAR(200) NOT NULL,
  email VARCHAR(200),
  telephone VARCHAR(20),
  ville VARCHAR(100),
  specialites TEXT[],
  actif BOOLEAN DEFAULT true,
  auth_token_hash VARCHAR(128),
  auth_email VARCHAR(200),
  otp_code VARCHAR(6),
  otp_expires_at TIMESTAMP,
  otp_attempts INT DEFAULT 0,
  push_subscription JSONB,
  derniere_connexion TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dp_labos_cabinet ON public.dentiste_pro_labos(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_dp_labos_email ON public.dentiste_pro_labos(auth_email) WHERE auth_email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_dp_labos_cabinet_email ON public.dentiste_pro_labos(cabinet_id, auth_email) WHERE auth_email IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.dentiste_pro_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.dentiste_pro_cabinets(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.dentiste_pro_patients(id) ON DELETE SET NULL,
  labo_id UUID REFERENCES public.dentiste_pro_labos(id) ON DELETE SET NULL,
  reference VARCHAR(50),
  titre VARCHAR(200),
  type VARCHAR(50),
  dent_numero VARCHAR(10),
  teinte VARCHAR(20),
  instructions TEXT,
  statut VARCHAR(30) DEFAULT 'ouvert'
    CHECK (statut IN ('ouvert','en_cours','essayage','modification','termine','annule')),
  date_empreinte DATE,
  date_livraison_prevue DATE,
  date_livraison_reelle DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dp_cases_cabinet ON public.dentiste_pro_cases(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_dp_cases_patient ON public.dentiste_pro_cases(patient_id);
CREATE INDEX IF NOT EXISTS idx_dp_cases_labo ON public.dentiste_pro_cases(labo_id);
CREATE INDEX IF NOT EXISTS idx_dp_cases_statut ON public.dentiste_pro_cases(cabinet_id, statut);
CREATE INDEX IF NOT EXISTS idx_dp_cases_reference ON public.dentiste_pro_cases(cabinet_id, reference);

CREATE TABLE IF NOT EXISTS public.dentiste_pro_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.dentiste_pro_cases(id) ON DELETE SET NULL,
  cabinet_id UUID NOT NULL REFERENCES public.dentiste_pro_cabinets(id) ON DELETE CASCADE,
  sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('patient','praticien','labo')),
  sender_id UUID,
  recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN ('praticien','patient','labo')),
  photo_url TEXT NOT NULL,
  thumbnail_url TEXT,
  photo_type VARCHAR(30) CHECK (photo_type IN (
    'urgence','suivi','question',
    'teinte','clinique','empreinte',
    'instruction','avant_apres','resultat',
    'explication',
    'fabrication','essayage',
    'produit_fini'
  )),
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  annotation_url TEXT,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE public.dentiste_pro_photos DROP CONSTRAINT IF EXISTS triangle_routing;
ALTER TABLE public.dentiste_pro_photos ADD CONSTRAINT triangle_routing CHECK (
  (sender_type = 'patient' AND recipient_type = 'praticien') OR
  (sender_type = 'labo' AND recipient_type = 'praticien') OR
  (sender_type = 'praticien' AND recipient_type IN ('patient', 'labo'))
);

CREATE INDEX IF NOT EXISTS idx_dp_photos_cabinet ON public.dentiste_pro_photos(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_dp_photos_case ON public.dentiste_pro_photos(case_id);
CREATE INDEX IF NOT EXISTS idx_dp_photos_sender ON public.dentiste_pro_photos(sender_type, sender_id);
CREATE INDEX IF NOT EXISTS idx_dp_photos_recipient ON public.dentiste_pro_photos(recipient_type, cabinet_id);
CREATE INDEX IF NOT EXISTS idx_dp_photos_unread ON public.dentiste_pro_photos(cabinet_id, recipient_type) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dp_photos_created ON public.dentiste_pro_photos(cabinet_id, created_at DESC);

ALTER TABLE public.dentiste_pro_labos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentiste_pro_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentiste_pro_photos ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION generate_case_reference()
RETURNS TRIGGER AS $$
DECLARE
  seq INT;
BEGIN
  IF NEW.reference IS NULL OR NEW.reference = '' THEN
    SELECT COALESCE(MAX(
      CAST(NULLIF(regexp_replace(reference, '^CAS-\d{4}-', ''), reference) AS INT)
    ), 0) + 1
    INTO seq
    FROM public.dentiste_pro_cases
    WHERE cabinet_id = NEW.cabinet_id
      AND reference LIKE 'CAS-' || EXTRACT(YEAR FROM NOW()) || '-%';
    NEW.reference := 'CAS-' || EXTRACT(YEAR FROM NOW()) || '-' || LPAD(seq::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_case_reference ON public.dentiste_pro_cases;
CREATE TRIGGER trg_case_reference
  BEFORE INSERT ON public.dentiste_pro_cases
  FOR EACH ROW
  EXECUTE FUNCTION generate_case_reference();


-- ═══════════════════════════════════════════════════════════════
-- SQL 53 — JADOMI Care Network (Reseau de Soins)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.dentiste_pro_care_circle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.dentiste_pro_patients(id) ON DELETE CASCADE,
  praticien_cabinet_id UUID REFERENCES public.dentiste_pro_cabinets(id) ON DELETE SET NULL,
  praticien_externe_nom VARCHAR(200),
  praticien_externe_email VARCHAR(200),
  praticien_externe_telephone VARCHAR(20),
  praticien_externe_profession VARCHAR(50),
  profession VARCHAR(50) NOT NULL,
  role VARCHAR(30) DEFAULT 'membre' CHECK (role IN ('referent','membre','consultant')),
  statut VARCHAR(20) DEFAULT 'actif' CHECK (statut IN ('actif','inactif','invite')),
  invite_par UUID REFERENCES public.dentiste_pro_cabinets(id) ON DELETE SET NULL,
  date_ajout TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dp_care_circle_patient ON public.dentiste_pro_care_circle(patient_id);
CREATE INDEX IF NOT EXISTS idx_dp_care_circle_cabinet ON public.dentiste_pro_care_circle(praticien_cabinet_id) WHERE praticien_cabinet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dp_care_circle_statut ON public.dentiste_pro_care_circle(patient_id, statut);
CREATE INDEX IF NOT EXISTS idx_dp_care_circle_profession ON public.dentiste_pro_care_circle(patient_id, profession);
CREATE INDEX IF NOT EXISTS idx_dp_care_circle_invite ON public.dentiste_pro_care_circle(invite_par);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dp_care_circle_unique_cabinet
  ON public.dentiste_pro_care_circle(patient_id, praticien_cabinet_id)
  WHERE praticien_cabinet_id IS NOT NULL AND statut != 'inactif';

CREATE TABLE IF NOT EXISTS public.dentiste_pro_partages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.dentiste_pro_patients(id) ON DELETE CASCADE,
  sender_cabinet_id UUID NOT NULL REFERENCES public.dentiste_pro_cabinets(id) ON DELETE CASCADE,
  sender_profession VARCHAR(50),
  recipient_cabinet_id UUID REFERENCES public.dentiste_pro_cabinets(id) ON DELETE SET NULL,
  recipient_externe_email VARCHAR(200),
  recipient_profession VARCHAR(50),
  type VARCHAR(30) NOT NULL CHECK (type IN ('photo','video','note','document','referral')),
  titre VARCHAR(200),
  description TEXT,
  media_url TEXT,
  thumbnail_url TEXT,
  document_url TEXT,
  motif_adressage TEXT,
  urgence VARCHAR(20) CHECK (urgence IN ('routine','urgent','immediat')),
  ai_analysis JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMP,
  repondu_at TIMESTAMP,
  reponse TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dp_partages_patient ON public.dentiste_pro_partages(patient_id);
CREATE INDEX IF NOT EXISTS idx_dp_partages_sender ON public.dentiste_pro_partages(sender_cabinet_id);
CREATE INDEX IF NOT EXISTS idx_dp_partages_recipient ON public.dentiste_pro_partages(recipient_cabinet_id) WHERE recipient_cabinet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dp_partages_type ON public.dentiste_pro_partages(type);
CREATE INDEX IF NOT EXISTS idx_dp_partages_unread ON public.dentiste_pro_partages(recipient_cabinet_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dp_partages_created ON public.dentiste_pro_partages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dp_partages_urgence ON public.dentiste_pro_partages(urgence) WHERE urgence IN ('urgent','immediat');

CREATE OR REPLACE VIEW public.dentiste_pro_care_team_view AS
SELECT
  cc.id,
  cc.patient_id,
  cc.profession,
  cc.role,
  cc.statut,
  cc.date_ajout,
  cc.praticien_cabinet_id,
  cab.nom_cabinet AS cabinet_nom,
  cc.praticien_externe_nom,
  cc.praticien_externe_email,
  cc.praticien_externe_profession,
  COALESCE(cab.nom_cabinet, cc.praticien_externe_nom) AS nom_affiche,
  cc.invite_par,
  inv.nom_cabinet AS invite_par_nom
FROM public.dentiste_pro_care_circle cc
LEFT JOIN public.dentiste_pro_cabinets cab ON cab.id = cc.praticien_cabinet_id
LEFT JOIN public.dentiste_pro_cabinets inv ON inv.id = cc.invite_par
WHERE cc.statut != 'inactif';

ALTER TABLE public.dentiste_pro_care_circle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentiste_pro_partages ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════
-- SQL 54 — Commandes GPO confirmees (gpo_orders)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gpo_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gpo_request_id UUID NOT NULL,
  gpo_attempt_id UUID,
  societe_id UUID NOT NULL,
  cabinet_name VARCHAR(200) NOT NULL,
  cabinet_adresse TEXT,
  cabinet_code_postal VARCHAR(10),
  cabinet_ville VARCHAR(100),
  cabinet_siret VARCHAR(20),
  cabinet_email VARCHAR(200),
  cabinet_telephone VARCHAR(30),
  cabinet_tva_intracom VARCHAR(20),
  supplier_id UUID NOT NULL,
  supplier_name VARCHAR(200) NOT NULL,
  supplier_email VARCHAR(200),
  supplier_telephone VARCHAR(30),
  items JSONB NOT NULL,
  total_ht NUMERIC(12,2) NOT NULL,
  tva_percent NUMERIC(5,2) DEFAULT 20.0,
  total_ttc NUMERIC(12,2),
  currency VARCHAR(3) DEFAULT 'EUR',
  original_target_price NUMERIC(12,2),
  supplier_accepted_price NUMERIC(12,2),
  price_locked_at TIMESTAMPTZ NOT NULL,
  order_number VARCHAR(30) NOT NULL,
  order_pdf_url TEXT,
  order_pdf_hash TEXT,
  status VARCHAR(30) DEFAULT 'confirmed' CHECK (status IN (
    'confirmed','order_sent','acknowledged','shipped','delivered','invoiced','completed','disputed'
  )),
  shipping_address TEXT,
  tracking_number VARCHAR(100),
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  delivery_confirmed_by UUID,
  invoice_number VARCHAR(100),
  invoice_date DATE,
  invoice_pdf_url TEXT,
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN (
    'pending', 'invoiced', 'paid', 'overdue', 'disputed'
  )),
  payment_due_date DATE,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gpo_orders_request ON gpo_orders(gpo_request_id);
CREATE INDEX IF NOT EXISTS idx_gpo_orders_societe ON gpo_orders(societe_id);
CREATE INDEX IF NOT EXISTS idx_gpo_orders_supplier ON gpo_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_gpo_orders_status ON gpo_orders(status);
CREATE INDEX IF NOT EXISTS idx_gpo_orders_number ON gpo_orders(order_number);

CREATE OR REPLACE FUNCTION trg_gpo_orders_updated()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gpo_orders_updated ON gpo_orders;
CREATE TRIGGER trg_gpo_orders_updated
  BEFORE UPDATE ON gpo_orders
  FOR EACH ROW EXECUTE FUNCTION trg_gpo_orders_updated();

ALTER TABLE gpo_orders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
CREATE POLICY gpo_orders_cabinet ON gpo_orders
  FOR SELECT USING (
    societe_id IN (
      SELECT societe_id FROM user_societe_roles
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY gpo_orders_insert ON gpo_orders
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY gpo_orders_update ON gpo_orders
  FOR UPDATE USING (auth.role() = 'service_role' OR societe_id IN (
    SELECT societe_id FROM user_societe_roles
    WHERE user_id = auth.uid() AND role IN ('proprietaire', 'associe')
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE SEQUENCE IF NOT EXISTS gpo_order_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS VARCHAR(30) AS $$
BEGIN
  RETURN 'JD-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' ||
         LPAD(nextval('gpo_order_number_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════════════════════════════════
-- SQL 55 — Facturation Pro (Mandat art. 289 CGI)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS supplier_mandates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL,
  supplier_name VARCHAR(200) NOT NULL,
  supplier_legal_name VARCHAR(300),
  supplier_siret VARCHAR(20),
  supplier_tva_intracom VARCHAR(20),
  supplier_adresse TEXT,
  supplier_code_postal VARCHAR(10),
  supplier_ville VARCHAR(100),
  supplier_email VARCHAR(200) NOT NULL,
  supplier_telephone VARCHAR(30),
  supplier_iban VARCHAR(34),
  supplier_bic VARCHAR(11),
  jadomi_entity_name VARCHAR(200) DEFAULT 'JADOMI SAS',
  jadomi_siret VARCHAR(20),
  jadomi_tva_intracom VARCHAR(20),
  jadomi_adresse TEXT,
  commission_percent NUMERIC(5,2) DEFAULT 3.00,
  commission_fixed_eur NUMERIC(10,2) DEFAULT 0,
  payment_delay_days INTEGER DEFAULT 30,
  contestation_delay_days INTEGER DEFAULT 15,
  auto_acceptance BOOLEAN DEFAULT TRUE,
  scope VARCHAR(50) DEFAULT 'all_gpo' CHECK (scope IN (
    'all_gpo','specific_products','specific_period'
  )),
  scope_details JSONB,
  status VARCHAR(30) DEFAULT 'draft' CHECK (status IN (
    'draft','sent','viewed','signed','active','suspended','revoked','expired'
  )),
  signature_token VARCHAR(100),
  signed_at TIMESTAMPTZ,
  signed_ip VARCHAR(50),
  signed_user_agent TEXT,
  signature_pdf_url TEXT,
  valid_from DATE,
  valid_until DATE,
  revoked_at TIMESTAMPTZ,
  revoked_by VARCHAR(50),
  revocation_reason TEXT,
  invoices_emitted INTEGER DEFAULT 0,
  total_invoiced_ht NUMERIC(14,2) DEFAULT 0,
  total_commission_ht NUMERIC(14,2) DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sm_supplier ON supplier_mandates(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sm_status ON supplier_mandates(status);
CREATE INDEX IF NOT EXISTS idx_sm_token ON supplier_mandates(signature_token);

ALTER TABLE supplier_mandates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
CREATE POLICY sm_service ON supplier_mandates FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY sm_read_auth ON supplier_mandates FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS jadomi_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gpo_order_id UUID REFERENCES gpo_orders(id) ON DELETE SET NULL,
  mandate_id UUID REFERENCES supplier_mandates(id) ON DELETE SET NULL,
  invoice_number VARCHAR(30) NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  supplier_id UUID NOT NULL,
  supplier_name VARCHAR(200) NOT NULL,
  supplier_legal_name VARCHAR(300),
  supplier_siret VARCHAR(20),
  supplier_tva_intracom VARCHAR(20),
  supplier_adresse TEXT,
  societe_id UUID NOT NULL,
  cabinet_name VARCHAR(200) NOT NULL,
  cabinet_siret VARCHAR(20),
  cabinet_tva_intracom VARCHAR(20),
  cabinet_adresse TEXT,
  cabinet_code_postal VARCHAR(10),
  cabinet_ville VARCHAR(100),
  items JSONB NOT NULL,
  total_ht NUMERIC(12,2) NOT NULL,
  tva_rate NUMERIC(5,2) DEFAULT 20.0,
  total_tva NUMERIC(12,2),
  total_ttc NUMERIC(12,2),
  commission_rate NUMERIC(5,2),
  commission_ht NUMERIC(10,2),
  net_supplier_ht NUMERIC(12,2),
  pdf_url TEXT,
  pdf_hash TEXT,
  xml_cii TEXT,
  facturx_profile VARCHAR(20) DEFAULT 'EN16931',
  status VARCHAR(30) DEFAULT 'draft' CHECK (status IN (
    'draft','emitted','accepted','contested','paid_by_cabinet','reversed','cancelled','credit_note'
  )),
  emitted_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,
  legal_mention TEXT DEFAULT 'Facture emise par JADOMI SAS au nom et pour le compte du fournisseur, conformement a l''article 289-I-2 du Code General des Impots.',
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ji_order ON jadomi_invoices(gpo_order_id);
CREATE INDEX IF NOT EXISTS idx_ji_mandate ON jadomi_invoices(mandate_id);
CREATE INDEX IF NOT EXISTS idx_ji_supplier ON jadomi_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_ji_societe ON jadomi_invoices(societe_id);
CREATE INDEX IF NOT EXISTS idx_ji_number ON jadomi_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_ji_status ON jadomi_invoices(status);
CREATE INDEX IF NOT EXISTS idx_ji_date ON jadomi_invoices(invoice_date DESC);

ALTER TABLE jadomi_invoices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
CREATE POLICY ji_service ON jadomi_invoices FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY ji_cabinet_read ON jadomi_invoices
  FOR SELECT USING (societe_id IN (
    SELECT societe_id FROM user_societe_roles WHERE user_id = auth.uid()
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS jadomi_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES jadomi_invoices(id) ON DELETE CASCADE,
  mandate_id UUID REFERENCES supplier_mandates(id) ON DELETE SET NULL,
  gpo_order_id UUID,
  invoice_total_ht NUMERIC(12,2) NOT NULL,
  commission_rate NUMERIC(5,2) NOT NULL,
  commission_ht NUMERIC(10,2) NOT NULL,
  commission_tva NUMERIC(10,2),
  commission_ttc NUMERIC(10,2),
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN (
    'pending','collected','reversed','refunded'
  )),
  collected_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,
  supplier_id UUID NOT NULL,
  supplier_name VARCHAR(200),
  net_to_reverse NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jc_invoice ON jadomi_commissions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_jc_supplier ON jadomi_commissions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_jc_status ON jadomi_commissions(payment_status);

ALTER TABLE jadomi_commissions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
CREATE POLICY jc_service ON jadomi_commissions FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE SEQUENCE IF NOT EXISTS jadomi_invoice_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS VARCHAR(30) AS $$
BEGIN
  RETURN 'JF-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' ||
         LPAD(nextval('jadomi_invoice_number_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE VIEW v_jadomi_revenue AS
SELECT
  DATE_TRUNC('month', ji.invoice_date)::DATE AS month,
  COUNT(*) AS nb_invoices,
  SUM(ji.total_ht) AS total_facture_ht,
  SUM(ji.commission_ht) AS total_commission_ht,
  SUM(ji.net_supplier_ht) AS total_reverse_fournisseurs,
  COUNT(DISTINCT ji.supplier_id) AS nb_fournisseurs,
  COUNT(DISTINCT ji.societe_id) AS nb_cabinets
FROM jadomi_invoices ji
WHERE ji.status NOT IN ('draft', 'cancelled')
GROUP BY DATE_TRUNC('month', ji.invoice_date)::DATE
ORDER BY month DESC;


-- ═══════════════════════════════════════════════════════════════
-- SQL 57 — Documents signes (DocuSeal integration)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS signed_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID REFERENCES societes(id),
  user_id UUID,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'contrat',
  subcategory TEXT,
  docuseal_submission_id INTEGER UNIQUE,
  docuseal_template_id INTEGER,
  signer_name TEXT,
  signer_email TEXT,
  signer_role TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','viewed','signed','expired','rejected')),
  signed_at TIMESTAMPTZ,
  signed_pdf_url TEXT,
  signed_pdf_path TEXT,
  original_document_url TEXT,
  metadata JSONB DEFAULT '{}',
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


-- ═══════════════════════════════════════════════════════════════
-- SQL 58a — Commerce Orders (Amazon-like checkout)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS jadomi_carts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  societe_id UUID,
  items JSONB DEFAULT '[]',
  items_count INTEGER DEFAULT 0,
  subtotal_ht NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_user ON jadomi_carts(user_id);

CREATE TABLE IF NOT EXISTS jadomi_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number VARCHAR(20),
  user_id UUID NOT NULL,
  societe_id UUID,
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  payment_method VARCHAR(30),
  paid_at TIMESTAMPTZ,
  items JSONB DEFAULT '[]',
  subtotal_products_ht NUMERIC(12,2) DEFAULT 0,
  shipping_ht NUMERIC(12,2) DEFAULT 0,
  total_ht NUMERIC(12,2) DEFAULT 0,
  tva_amount NUMERIC(12,2) DEFAULT 0,
  total_ttc NUMERIC(12,2) DEFAULT 0,
  jadomi_commission_ht NUMERIC(12,2) DEFAULT 0,
  jadomi_shipping_margin_ht NUMERIC(12,2) DEFAULT 0,
  status VARCHAR(30) DEFAULT 'pending_payment' CHECK (status IN (
    'pending_payment', 'paid', 'processing', 'shipped', 'delivered',
    'completed', 'cancelled', 'refunded', 'expired', 'payout_scheduled', 'payout_done'
  )),
  shipping_address JSONB,
  tracking_number VARCHAR(100),
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  invoice_number VARCHAR(30),
  invoice_pdf_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON jadomi_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_societe ON jadomi_orders(societe_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON jadomi_orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_stripe ON jadomi_orders(stripe_checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON jadomi_orders(created_at DESC);

CREATE SEQUENCE IF NOT EXISTS jadomi_order_number_seq START 1;


-- ═══════════════════════════════════════════════════════════════
-- SQL 58b — SOS Urgence Confreres
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.sos_urgence_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_societe_id UUID NOT NULL,
  sender_user_id UUID NOT NULL,
  sender_name TEXT NOT NULL,
  patient_initials TEXT,
  urgency_type TEXT NOT NULL CHECK (urgency_type IN (
    'douleur_aigue','traumatisme','infection','prothese_cassee','autre'
  )),
  description TEXT CHECK (char_length(description) <= 200),
  quartier TEXT,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  radius_km INTEGER DEFAULT 10,
  deadline TIMESTAMPTZ,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'expired', 'cancelled')),
  accepted_by_societe_id UUID,
  accepted_by_user_id UUID,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sos_urgence_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.sos_urgence_requests(id) ON DELETE CASCADE,
  target_societe_id UUID NOT NULL,
  target_user_id UUID,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'seen', 'accepted', 'declined')),
  seen_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sos_requests_status ON public.sos_urgence_requests(status);
CREATE INDEX IF NOT EXISTS idx_sos_requests_sender ON public.sos_urgence_requests(sender_societe_id);
CREATE INDEX IF NOT EXISTS idx_sos_requests_created ON public.sos_urgence_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sos_requests_status_created ON public.sos_urgence_requests(status, created_at DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_sos_notifications_request ON public.sos_urgence_notifications(request_id);
CREATE INDEX IF NOT EXISTS idx_sos_notifications_target ON public.sos_urgence_notifications(target_societe_id);

ALTER TABLE public.sos_urgence_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_urgence_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sos_requests_select ON public.sos_urgence_requests;
CREATE POLICY sos_requests_select ON public.sos_urgence_requests
  FOR SELECT USING (
    status = 'open'
    OR sender_user_id = auth.uid()
    OR accepted_by_user_id = auth.uid()
  );

DROP POLICY IF EXISTS sos_requests_insert ON public.sos_urgence_requests;
CREATE POLICY sos_requests_insert ON public.sos_urgence_requests
  FOR INSERT WITH CHECK (sender_user_id = auth.uid());

DROP POLICY IF EXISTS sos_requests_update ON public.sos_urgence_requests;
CREATE POLICY sos_requests_update ON public.sos_urgence_requests
  FOR UPDATE USING (
    sender_user_id = auth.uid()
    OR (status = 'open' AND accepted_by_user_id = auth.uid())
  );

DROP POLICY IF EXISTS sos_notifications_select ON public.sos_urgence_notifications;
CREATE POLICY sos_notifications_select ON public.sos_urgence_notifications
  FOR SELECT USING (
    target_user_id = auth.uid()
    OR request_id IN (
      SELECT id FROM public.sos_urgence_requests WHERE sender_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS sos_notifications_insert ON public.sos_urgence_notifications;
CREATE POLICY sos_notifications_insert ON public.sos_urgence_notifications
  FOR INSERT WITH CHECK (
    request_id IN (
      SELECT id FROM public.sos_urgence_requests WHERE sender_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS sos_notifications_update ON public.sos_urgence_notifications;
CREATE POLICY sos_notifications_update ON public.sos_urgence_notifications
  FOR UPDATE USING (target_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.sos_urgence_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sos_urgence_requests_updated_at ON public.sos_urgence_requests;
CREATE TRIGGER trg_sos_urgence_requests_updated_at
  BEFORE UPDATE ON public.sos_urgence_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.sos_urgence_requests_updated_at();


-- ═══════════════════════════════════════════════════════════════
-- SQL 59a — Disputes (litiges) + Supplier Scoring
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS jadomi_disputes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID,
  societe_id UUID,
  supplier_id UUID,
  type VARCHAR(30) NOT NULL CHECK (type IN (
    'not_received', 'damaged', 'wrong_product', 'expired', 'quality', 'other'
  )),
  description TEXT,
  photo_urls JSONB DEFAULT '[]',
  auto_resolved BOOLEAN DEFAULT FALSE,
  auto_resolution_reason TEXT,
  ai_analysis JSONB,
  status VARCHAR(30) DEFAULT 'opened' CHECK (status IN (
    'opened', 'investigating', 'waiting_supplier', 'waiting_client',
    'auto_resolved', 'manually_resolved', 'refunded', 'rejected', 'closed'
  )),
  resolution VARCHAR(30) CHECK (resolution IN (
    'full_refund', 'partial_refund', 'replacement', 'supplier_credit',
    'no_action', 'rejected'
  )),
  refund_amount NUMERIC(12,2),
  refund_deducted_from_supplier BOOLEAN DEFAULT FALSE,
  escalation_level INTEGER DEFAULT 1,
  supplier_response TEXT,
  supplier_responded_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(50),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disputes_order ON jadomi_disputes(order_id);
CREATE INDEX IF NOT EXISTS idx_disputes_supplier ON jadomi_disputes(supplier_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON jadomi_disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_created ON jadomi_disputes(created_at DESC);

CREATE TABLE IF NOT EXISTS supplier_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID NOT NULL,
  mandate_id UUID,
  score_total INTEGER DEFAULT 100,
  score_expedition INTEGER DEFAULT 100,
  score_conformity INTEGER DEFAULT 100,
  score_price INTEGER DEFAULT 100,
  score_reactivity INTEGER DEFAULT 100,
  score_seniority INTEGER DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  orders_on_time INTEGER DEFAULT 0,
  orders_with_issues INTEGER DEFAULT 0,
  total_disputes INTEGER DEFAULT 0,
  disputes_resolved_favorably INTEGER DEFAULT 0,
  avg_expedition_hours NUMERIC(6,1),
  avg_response_hours NUMERIC(6,1),
  badge VARCHAR(20) DEFAULT 'new' CHECK (badge IN ('new', 'standard', 'premium', 'warning', 'suspended')),
  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_supplier ON supplier_scores(supplier_id);


-- ═══════════════════════════════════════════════════════════════
-- SQL 59b — JADOMI Tournees IDE (7 tables)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ide_cabinets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL,
  nom TEXT NOT NULL,
  adresse TEXT,
  ville TEXT,
  code_postal TEXT,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  telephone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ide_nurses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.ide_cabinets(id) ON DELETE CASCADE,
  user_id UUID,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  telephone TEXT,
  email TEXT,
  rpps TEXT,
  couleur TEXT DEFAULT '#6366f1',
  is_titulaire BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ide_patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.ide_cabinets(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  prenom TEXT,
  adresse TEXT NOT NULL,
  ville TEXT,
  code_postal TEXT,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  telephone TEXT,
  telephone_famille TEXT,
  notes TEXT,
  medecin_traitant TEXT,
  is_banned BOOLEAN DEFAULT false,
  ban_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ide_soins_recurrents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.ide_patients(id) ON DELETE CASCADE,
  soins_type TEXT NOT NULL,
  duree_minutes INTEGER DEFAULT 15,
  tournee TEXT NOT NULL CHECK (tournee IN ('matin', 'soir', 'les_deux')),
  jours_semaine INTEGER[],
  nurse_preferee_id UUID REFERENCES public.ide_nurses(id),
  heure_preferee TIME,
  ordonnance_expire_at DATE,
  notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ide_visites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID REFERENCES public.ide_cabinets(id),
  patient_id UUID REFERENCES public.ide_patients(id),
  nurse_id UUID REFERENCES public.ide_nurses(id),
  soin_recurrent_id UUID REFERENCES public.ide_soins_recurrents(id),
  date DATE NOT NULL,
  tournee TEXT NOT NULL CHECK (tournee IN ('matin', 'soir')),
  ordre_dans_tournee INTEGER,
  heure_estimee TIME,
  heure_arrivee TIME,
  heure_depart TIME,
  duree_minutes INTEGER,
  soins_type TEXT,
  soins_realises TEXT,
  notes_visite TEXT,
  status TEXT DEFAULT 'planifie' CHECK (status IN (
    'planifie', 'en_route', 'en_cours', 'termine', 'annule', 'reporte'
  )),
  annulation_motif TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ide_tournees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID REFERENCES public.ide_cabinets(id),
  nurse_id UUID REFERENCES public.ide_nurses(id),
  date DATE NOT NULL,
  tournee TEXT NOT NULL CHECK (tournee IN ('matin', 'soir')),
  ordre_patients JSONB,
  distance_totale_km DECIMAL(8,2),
  duree_totale_min INTEGER,
  nb_patients INTEGER,
  optimized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(nurse_id, date, tournee)
);

CREATE TABLE IF NOT EXISTS public.ide_absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID REFERENCES public.ide_cabinets(id),
  nurse_id UUID REFERENCES public.ide_nurses(id),
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  motif TEXT,
  remplacant_id UUID REFERENCES public.ide_nurses(id),
  contrat_signe BOOLEAN DEFAULT false,
  contrat_document_id UUID,
  contrat_envoye_ordre BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active' CHECK (status IN (
    'active', 'pourvu', 'terminee', 'annulee'
  )),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index IDE
CREATE INDEX IF NOT EXISTS idx_ide_cabinets_societe_id ON public.ide_cabinets(societe_id);
CREATE INDEX IF NOT EXISTS idx_ide_nurses_cabinet_id ON public.ide_nurses(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_ide_nurses_user_id ON public.ide_nurses(user_id);
CREATE INDEX IF NOT EXISTS idx_ide_patients_cabinet_id ON public.ide_patients(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_ide_soins_recurrents_patient_id ON public.ide_soins_recurrents(patient_id);
CREATE INDEX IF NOT EXISTS idx_ide_soins_recurrents_nurse_preferee ON public.ide_soins_recurrents(nurse_preferee_id);
CREATE INDEX IF NOT EXISTS idx_ide_visites_cabinet_id ON public.ide_visites(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_ide_visites_patient_id ON public.ide_visites(patient_id);
CREATE INDEX IF NOT EXISTS idx_ide_visites_nurse_id ON public.ide_visites(nurse_id);
CREATE INDEX IF NOT EXISTS idx_ide_visites_date ON public.ide_visites(date);
CREATE INDEX IF NOT EXISTS idx_ide_visites_status ON public.ide_visites(status);
CREATE INDEX IF NOT EXISTS idx_ide_visites_nurse_date_tournee ON public.ide_visites(nurse_id, date, tournee);
CREATE INDEX IF NOT EXISTS idx_ide_visites_planifie ON public.ide_visites(date, nurse_id) WHERE status = 'planifie';
CREATE INDEX IF NOT EXISTS idx_ide_tournees_cabinet_id ON public.ide_tournees(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_ide_tournees_nurse_id ON public.ide_tournees(nurse_id);
CREATE INDEX IF NOT EXISTS idx_ide_tournees_date ON public.ide_tournees(date);
CREATE INDEX IF NOT EXISTS idx_ide_absences_cabinet_id ON public.ide_absences(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_ide_absences_nurse_id ON public.ide_absences(nurse_id);
CREATE INDEX IF NOT EXISTS idx_ide_absences_status ON public.ide_absences(status);
CREATE INDEX IF NOT EXISTS idx_ide_absences_dates ON public.ide_absences(date_debut, date_fin);

-- Trigger updated_at IDE visites
CREATE OR REPLACE FUNCTION public.ide_visites_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ide_visites_updated_at ON public.ide_visites;
CREATE TRIGGER trg_ide_visites_updated_at
  BEFORE UPDATE ON public.ide_visites
  FOR EACH ROW
  EXECUTE FUNCTION public.ide_visites_updated_at();

-- RLS IDE (helper function)
CREATE OR REPLACE FUNCTION public.ide_user_owns_cabinet(p_cabinet_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.ide_cabinets c
    JOIN public.societes s ON s.id = c.societe_id
    WHERE c.id = p_cabinet_id
      AND s.owner_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

ALTER TABLE public.ide_cabinets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
CREATE POLICY ide_cabinets_select ON public.ide_cabinets FOR SELECT TO authenticated USING (societe_id IN (SELECT id FROM public.societes WHERE owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
CREATE POLICY ide_cabinets_insert ON public.ide_cabinets FOR INSERT TO authenticated WITH CHECK (societe_id IN (SELECT id FROM public.societes WHERE owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
CREATE POLICY ide_cabinets_update ON public.ide_cabinets FOR UPDATE TO authenticated USING (societe_id IN (SELECT id FROM public.societes WHERE owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.ide_nurses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY ide_nurses_select ON public.ide_nurses FOR SELECT TO authenticated USING (public.ide_user_owns_cabinet(cabinet_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY ide_nurses_insert ON public.ide_nurses FOR INSERT TO authenticated WITH CHECK (public.ide_user_owns_cabinet(cabinet_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY ide_nurses_update ON public.ide_nurses FOR UPDATE TO authenticated USING (public.ide_user_owns_cabinet(cabinet_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.ide_patients ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY ide_patients_select ON public.ide_patients FOR SELECT TO authenticated USING (public.ide_user_owns_cabinet(cabinet_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY ide_patients_insert ON public.ide_patients FOR INSERT TO authenticated WITH CHECK (public.ide_user_owns_cabinet(cabinet_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY ide_patients_update ON public.ide_patients FOR UPDATE TO authenticated USING (public.ide_user_owns_cabinet(cabinet_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.ide_soins_recurrents ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY ide_soins_recurrents_select ON public.ide_soins_recurrents FOR SELECT TO authenticated USING (patient_id IN (SELECT id FROM public.ide_patients WHERE public.ide_user_owns_cabinet(cabinet_id))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY ide_soins_recurrents_insert ON public.ide_soins_recurrents FOR INSERT TO authenticated WITH CHECK (patient_id IN (SELECT id FROM public.ide_patients WHERE public.ide_user_owns_cabinet(cabinet_id))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY ide_soins_recurrents_update ON public.ide_soins_recurrents FOR UPDATE TO authenticated USING (patient_id IN (SELECT id FROM public.ide_patients WHERE public.ide_user_owns_cabinet(cabinet_id))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.ide_visites ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY ide_visites_select ON public.ide_visites FOR SELECT TO authenticated USING (public.ide_user_owns_cabinet(cabinet_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY ide_visites_insert ON public.ide_visites FOR INSERT TO authenticated WITH CHECK (public.ide_user_owns_cabinet(cabinet_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY ide_visites_update ON public.ide_visites FOR UPDATE TO authenticated USING (public.ide_user_owns_cabinet(cabinet_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.ide_tournees ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY ide_tournees_select ON public.ide_tournees FOR SELECT TO authenticated USING (public.ide_user_owns_cabinet(cabinet_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY ide_tournees_insert ON public.ide_tournees FOR INSERT TO authenticated WITH CHECK (public.ide_user_owns_cabinet(cabinet_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY ide_tournees_update ON public.ide_tournees FOR UPDATE TO authenticated USING (public.ide_user_owns_cabinet(cabinet_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.ide_absences ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY ide_absences_select ON public.ide_absences FOR SELECT TO authenticated USING (public.ide_user_owns_cabinet(cabinet_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY ide_absences_insert ON public.ide_absences FOR INSERT TO authenticated WITH CHECK (public.ide_user_owns_cabinet(cabinet_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY ide_absences_update ON public.ide_absences FOR UPDATE TO authenticated USING (public.ide_user_owns_cabinet(cabinet_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ═══════════════════════════════════════════════════════════════
-- SQL 60 — Ordonnances & Comptabilite IDE
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ide_ordonnances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.ide_cabinets(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.ide_patients(id) ON DELETE CASCADE,
  medecin_nom TEXT NOT NULL,
  medecin_rpps TEXT,
  date_prescription DATE NOT NULL,
  date_expiration DATE,
  nb_seances_prescrites INTEGER,
  nb_seances_realisees INTEGER DEFAULT 0,
  soins_type TEXT,
  description TEXT,
  file_path TEXT,
  file_name TEXT,
  file_size_kb INTEGER,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'terminee', 'expiree', 'renouvelee')),
  mois TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ide_factures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.ide_cabinets(id) ON DELETE CASCADE,
  nurse_id UUID REFERENCES public.ide_nurses(id),
  type TEXT NOT NULL CHECK (type IN ('recette', 'depense', 'retrocession')),
  categorie TEXT,
  description TEXT NOT NULL,
  montant DECIMAL(10,2) NOT NULL,
  date_facture DATE NOT NULL,
  mois TEXT,
  patient_id UUID REFERENCES public.ide_patients(id),
  ordonnance_id UUID REFERENCES public.ide_ordonnances(id),
  file_path TEXT,
  file_name TEXT,
  file_size_kb INTEGER,
  status TEXT DEFAULT 'a_traiter' CHECK (status IN ('a_traiter', 'envoyee_cpam', 'payee', 'rejetee')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ide_ordonnances_cabinet_id ON public.ide_ordonnances(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_ide_ordonnances_patient_id ON public.ide_ordonnances(patient_id);
CREATE INDEX IF NOT EXISTS idx_ide_ordonnances_mois ON public.ide_ordonnances(mois);
CREATE INDEX IF NOT EXISTS idx_ide_ordonnances_status ON public.ide_ordonnances(status);
CREATE INDEX IF NOT EXISTS idx_ide_ordonnances_date_prescription ON public.ide_ordonnances(date_prescription);
CREATE INDEX IF NOT EXISTS idx_ide_ordonnances_cabinet_patient_mois ON public.ide_ordonnances(cabinet_id, patient_id, mois);
CREATE INDEX IF NOT EXISTS idx_ide_ordonnances_active ON public.ide_ordonnances(cabinet_id, patient_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_ide_factures_cabinet_id ON public.ide_factures(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_ide_factures_patient_id ON public.ide_factures(patient_id);
CREATE INDEX IF NOT EXISTS idx_ide_factures_nurse_id ON public.ide_factures(nurse_id);
CREATE INDEX IF NOT EXISTS idx_ide_factures_mois ON public.ide_factures(mois);
CREATE INDEX IF NOT EXISTS idx_ide_factures_status ON public.ide_factures(status);
CREATE INDEX IF NOT EXISTS idx_ide_factures_date_facture ON public.ide_factures(date_facture);
CREATE INDEX IF NOT EXISTS idx_ide_factures_cabinet_patient_mois ON public.ide_factures(cabinet_id, patient_id, mois);

CREATE OR REPLACE FUNCTION public.ide_ordonnances_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ide_ordonnances_updated_at ON public.ide_ordonnances;
CREATE TRIGGER trg_ide_ordonnances_updated_at
  BEFORE UPDATE ON public.ide_ordonnances
  FOR EACH ROW EXECUTE FUNCTION public.ide_ordonnances_updated_at();

CREATE OR REPLACE FUNCTION public.ide_factures_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ide_factures_updated_at ON public.ide_factures;
CREATE TRIGGER trg_ide_factures_updated_at
  BEFORE UPDATE ON public.ide_factures
  FOR EACH ROW EXECUTE FUNCTION public.ide_factures_updated_at();

ALTER TABLE public.ide_ordonnances ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY ide_ordonnances_select ON public.ide_ordonnances FOR SELECT TO authenticated USING (public.ide_user_owns_cabinet(cabinet_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY ide_ordonnances_insert ON public.ide_ordonnances FOR INSERT TO authenticated WITH CHECK (public.ide_user_owns_cabinet(cabinet_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY ide_ordonnances_update ON public.ide_ordonnances FOR UPDATE TO authenticated USING (public.ide_user_owns_cabinet(cabinet_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.ide_factures ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY ide_factures_select ON public.ide_factures FOR SELECT TO authenticated USING (public.ide_user_owns_cabinet(cabinet_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY ide_factures_insert ON public.ide_factures FOR INSERT TO authenticated WITH CHECK (public.ide_user_owns_cabinet(cabinet_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY ide_factures_update ON public.ide_factures FOR UPDATE TO authenticated USING (public.ide_user_owns_cabinet(cabinet_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ═══════════════════════════════════════════════════════════════
-- SQL 38 — JADOMI Coins Wallet (gamification)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_coins_wallet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  balance int DEFAULT 0,
  total_earned int DEFAULT 0,
  total_spent int DEFAULT 0,
  level text DEFAULT 'bronze',
  level_xp int DEFAULT 0,
  daily_bonus_last_claimed timestamptz,
  streak_days int DEFAULT 0,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS coins_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount int NOT NULL,
  balance_after int NOT NULL,
  type text NOT NULL,
  description text,
  feature_id text,
  stripe_payment_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coins_tx_user ON coins_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_coins_tx_created ON coins_transactions(created_at);

CREATE TABLE IF NOT EXISTS features_pricing (
  id text PRIMARY KEY,
  category text NOT NULL,
  name text NOT NULL,
  description text,
  coins_cost int NOT NULL DEFAULT 0,
  tier_free_for text[],
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coins_packs (
  id text PRIMARY KEY,
  coins_amount int NOT NULL,
  price_eur numeric(10,2) NOT NULL,
  bonus_coins int DEFAULT 0,
  stripe_price_id text,
  is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS coins_quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  quest_type text NOT NULL,
  condition_type text,
  condition_value int,
  reward_coins int NOT NULL,
  reward_xp int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_quest_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quest_id uuid REFERENCES coins_quests(id) ON DELETE CASCADE,
  progress int DEFAULT 0,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz DEFAULT NOW(),
  UNIQUE(user_id, quest_id)
);

INSERT INTO features_pricing (id, category, name, description, coins_cost, tier_free_for) VALUES
  ('ads_ai_text', 'ads', 'Generation IA texte pub', 'Claude genere 3 variantes titre + description', 2, ARRAY['elite']),
  ('ads_template', 'ads', 'Template pub pre-fait', 'Utiliser un template de la bibliotheque', 5, ARRAY['premium', 'elite']),
  ('ads_ai_visual', 'ads', 'Generation visuel DALL-E', 'Image pub generee par IA', 20, ARRAY['elite']),
  ('ads_video_auto', 'ads', 'Video publicitaire auto', 'Montage video automatique 15-30s', 50, ARRAY['elite']),
  ('ads_avatar_ia', 'ads', 'Avatar IA presentateur', 'Avatar Synthesia pour pub video', 200, NULL),
  ('ads_ai_analyze', 'ads', 'Analyse IA creatif', 'Claude Vision analyse et note la pub', 1, ARRAY['premium', 'elite'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO coins_packs (id, coins_amount, price_eur, bonus_coins) VALUES
  ('pack_100', 100, 9.99, 0),
  ('pack_500', 500, 39.99, 25),
  ('pack_1000', 1000, 69.99, 100),
  ('pack_2500', 2500, 149.99, 375),
  ('pack_10000', 10000, 499.99, 2000)
ON CONFLICT (id) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════
-- RELOAD SCHEMA PostgREST
-- ═══════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';


-- ╔════════════════════════════════════════════════════════════════╗
-- ║  FIN — Migration complete SQL 44 → 60 + 38                   ║
-- ║  ~60 tables, ~150 index, RLS complet, triggers, vues          ║
-- ║  Toutes les instructions sont IF NOT EXISTS / idempotentes    ║
-- ╚════════════════════════════════════════════════════════════════╝
