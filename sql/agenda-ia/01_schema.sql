-- =============================================================================
-- JADOMI Agenda IA - Schema de base de donnees
-- Module de planification intelligente pour cabinet dentaire
-- Supabase (PostgreSQL avec RLS)
-- Date: 2026-05-10
-- =============================================================================

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE profession_type AS ENUM (
  'dentiste',
  'orthodontiste',
  'chirurgien_oral',
  'parodontiste',
  'endodontiste',
  'pedodontiste',
  'prothesiste',
  'hygieniste',
  'assistante'
);

-- ============================================================
-- 1. agenda_practitioners — Profils praticiens pour la planification
-- ============================================================

CREATE TABLE agenda_practitioners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cabinet_id uuid NOT NULL,
  nom varchar(100) NOT NULL,
  prenom varchar(100) NOT NULL,
  profession profession_type NOT NULL,
  specialites text[] DEFAULT '{}',
  color varchar(7),
  horaires_defaut jsonb DEFAULT '{}',
  max_patients_jour int DEFAULT 30,
  seuil_surcharge int DEFAULT 25,
  preferences jsonb DEFAULT '{"morning_heavy_ok": true, "break_frequency": 120, "end_time_preference": "19:00"}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE agenda_practitioners IS 'Profils des praticiens avec leurs preferences de planification et horaires par defaut';

CREATE INDEX idx_agenda_practitioners_cabinet ON agenda_practitioners(cabinet_id);
CREATE INDEX idx_agenda_practitioners_user ON agenda_practitioners(user_id);

-- ============================================================
-- 2. agenda_fatigue_profiles — Profil d apprentissage fatigue par praticien
-- ============================================================

CREATE TABLE agenda_fatigue_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id uuid NOT NULL REFERENCES agenda_practitioners(id) ON DELETE CASCADE,
  duree_reelle_moyenne jsonb DEFAULT '{}',
  retard_moyen_minutes int DEFAULT 0,
  heures_fatigue text[] DEFAULT '{}',
  actes_stress text[] DEFAULT '{}',
  capacite_max_jour int DEFAULT 25,
  seuil_burnout int DEFAULT 80,
  horaires_efficaces text[] DEFAULT '{}',
  besoin_pause_minutes int DEFAULT 10,
  pause_frequency_minutes int DEFAULT 120,
  historique_scores jsonb DEFAULT '[]',
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE agenda_fatigue_profiles IS 'Profil de fatigue et performance appris par l IA pour chaque praticien';

CREATE INDEX idx_agenda_fatigue_practitioner ON agenda_fatigue_profiles(practitioner_id);

-- ============================================================
-- 3. agenda_patients_reliability — Profil comportemental patient (fiabilite)
-- ============================================================

CREATE TABLE agenda_patients_reliability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  cabinet_id uuid NOT NULL,
  score_fiabilite int DEFAULT 100 CHECK (score_fiabilite >= 0 AND score_fiabilite <= 100),
  retards_count int DEFAULT 0,
  absences_count int DEFAULT 0,
  annulations_count int DEFAULT 0,
  retard_moyen_minutes int DEFAULT 0,
  derniere_absence date,
  confirmation_requise boolean DEFAULT false,
  marge_supplementaire_minutes int DEFAULT 0,
  notes_organisation text,
  profil_anxiete int DEFAULT 1 CHECK (profil_anxiete >= 1 AND profil_anxiete <= 5),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(patient_id, cabinet_id)
);

COMMENT ON TABLE agenda_patients_reliability IS 'Score de fiabilite et comportement des patients pour ajuster la planification';

CREATE INDEX idx_agenda_patients_reliability_cabinet ON agenda_patients_reliability(cabinet_id);
CREATE INDEX idx_agenda_patients_reliability_patient ON agenda_patients_reliability(patient_id);
CREATE INDEX idx_agenda_patients_reliability_score ON agenda_patients_reliability(score_fiabilite);

-- ============================================================
-- 4. agenda_appointment_types — Types d actes avec metadonnees
-- ============================================================

CREATE TABLE agenda_appointment_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL,
  code varchar(50),
  nom varchar(200) NOT NULL,
  duree_standard int NOT NULL,
  duree_min int,
  duree_max int,
  complexite int DEFAULT 1 CHECK (complexite >= 1 AND complexite <= 5),
  fatigue_impact int DEFAULT 1 CHECK (fatigue_impact >= 1 AND fatigue_impact <= 5),
  necessite_assistante boolean DEFAULT false,
  necessite_salle_specifique varchar(100),
  placement_optimal varchar(20) DEFAULT 'indifferent' CHECK (placement_optimal IN ('matin', 'apres_midi', 'indifferent')),
  pause_apres_minutes int DEFAULT 0,
  deplacable boolean DEFAULT true,
  priorite_medicale int DEFAULT 5 CHECK (priorite_medicale >= 1 AND priorite_medicale <= 10),
  color varchar(7),
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE agenda_appointment_types IS 'Catalogue des types d actes avec durees, complexite et contraintes de placement';

CREATE INDEX idx_agenda_appointment_types_cabinet ON agenda_appointment_types(cabinet_id);
CREATE INDEX idx_agenda_appointment_types_code ON agenda_appointment_types(cabinet_id, code);

-- ============================================================
-- 5. agenda_appointments — Table principale des rendez-vous
-- ============================================================

CREATE TABLE agenda_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL,
  practitioner_id uuid NOT NULL REFERENCES agenda_practitioners(id) ON DELETE CASCADE,
  patient_id uuid,
  appointment_type_id uuid REFERENCES agenda_appointment_types(id) ON DELETE SET NULL,
  date date NOT NULL,
  heure_debut time NOT NULL,
  heure_fin time NOT NULL,
  duree_prevue int NOT NULL,
  duree_reelle int,
  statut varchar(20) DEFAULT 'planifie' CHECK (statut IN ('planifie', 'confirme', 'en_cours', 'termine', 'annule', 'absent')),
  source varchar(20) DEFAULT 'manuel' CHECK (source IN ('doctolib', 'jadomi', 'manuel', 'ia_suggestion')),
  salle varchar(50),
  notes text,
  urgence boolean DEFAULT false,
  score_placement int,
  deplacable boolean DEFAULT true,
  ia_suggestion_id uuid,
  validated_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE agenda_appointments IS 'Rendez-vous du cabinet avec scoring IA et tracabilite de la source';

CREATE INDEX idx_agenda_appointments_cabinet_date ON agenda_appointments(cabinet_id, date);
CREATE INDEX idx_agenda_appointments_practitioner ON agenda_appointments(practitioner_id, date);
CREATE INDEX idx_agenda_appointments_patient ON agenda_appointments(patient_id);
CREATE INDEX idx_agenda_appointments_statut ON agenda_appointments(statut);
CREATE INDEX idx_agenda_appointments_date ON agenda_appointments(date);
CREATE INDEX idx_agenda_appointments_urgence ON agenda_appointments(date, urgence) WHERE urgence = true;

-- ============================================================
-- 6. agenda_stress_scores — Historique des scores journaliers
-- ============================================================

CREATE TABLE agenda_stress_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL,
  practitioner_id uuid NOT NULL REFERENCES agenda_practitioners(id) ON DELETE CASCADE,
  date date NOT NULL,
  score_serenite int CHECK (score_serenite >= 0 AND score_serenite <= 100),
  score_detail jsonb DEFAULT '{}',
  nb_patients int DEFAULT 0,
  duree_totale_minutes int DEFAULT 0,
  taux_remplissage decimal(5,2),
  temps_pause_total int DEFAULT 0,
  nb_actes_lourds int DEFAULT 0,
  nb_urgences int DEFAULT 0,
  journee_rouge boolean DEFAULT false,
  alertes jsonb DEFAULT '[]',
  suggestions jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  UNIQUE(practitioner_id, date)
);

COMMENT ON TABLE agenda_stress_scores IS 'Score de serenite quotidien et indicateurs de charge pour chaque praticien';

CREATE INDEX idx_agenda_stress_scores_cabinet ON agenda_stress_scores(cabinet_id);
CREATE INDEX idx_agenda_stress_scores_practitioner_date ON agenda_stress_scores(practitioner_id, date);
CREATE INDEX idx_agenda_stress_scores_serenite ON agenda_stress_scores(score_serenite);
CREATE INDEX idx_agenda_stress_scores_rouge ON agenda_stress_scores(date, journee_rouge) WHERE journee_rouge = true;

-- ============================================================
-- 7. agenda_optimization_suggestions — Journal des suggestions IA
-- ============================================================

CREATE TABLE agenda_optimization_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL,
  practitioner_id uuid,
  date date,
  type varchar(30) NOT NULL CHECK (type IN ('recasage', 'pause', 'alerte', 'placement', 'redistribution')),
  titre varchar(200) NOT NULL,
  description text,
  priorite int DEFAULT 3 CHECK (priorite >= 1 AND priorite <= 5),
  data jsonb DEFAULT '{}',
  statut varchar(20) DEFAULT 'proposee' CHECK (statut IN ('proposee', 'acceptee', 'refusee', 'expiree')),
  validated_by uuid,
  validated_at timestamptz,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE agenda_optimization_suggestions IS 'Suggestions d optimisation generees par l IA avec suivi d acceptation';

CREATE INDEX idx_agenda_suggestions_cabinet ON agenda_optimization_suggestions(cabinet_id);
CREATE INDEX idx_agenda_suggestions_practitioner ON agenda_optimization_suggestions(practitioner_id, date);
CREATE INDEX idx_agenda_suggestions_statut ON agenda_optimization_suggestions(statut);

-- ============================================================
-- 8. agenda_schedule_rules — Regles de planification du cabinet
-- ============================================================

CREATE TABLE agenda_schedule_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL,
  practitioner_id uuid REFERENCES agenda_practitioners(id) ON DELETE CASCADE,
  type varchar(30) NOT NULL CHECK (type IN ('plage_urgence', 'mode_focus', 'blocage', 'pause_obligatoire')),
  jour_semaine int[] DEFAULT '{}',
  heure_debut time,
  heure_fin time,
  config jsonb DEFAULT '{}',
  actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE agenda_schedule_rules IS 'Regles de planification configurables par cabinet et par praticien';

CREATE INDEX idx_agenda_rules_cabinet ON agenda_schedule_rules(cabinet_id);
CREATE INDEX idx_agenda_rules_practitioner ON agenda_schedule_rules(practitioner_id);
CREATE INDEX idx_agenda_rules_actif ON agenda_schedule_rules(actif) WHERE actif = true;

-- ============================================================
-- 9. agenda_ai_action_logs — Piste d audit pour toutes les actions IA (RGPD)
-- ============================================================

CREATE TABLE agenda_ai_action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL,
  user_id uuid,
  action varchar(100) NOT NULL,
  details jsonb DEFAULT '{}',
  resultat varchar(50),
  impact text,
  mode varchar(20) DEFAULT 'lecture' CHECK (mode IN ('lecture', 'semi_auto', 'automatique')),
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE agenda_ai_action_logs IS 'Journal d audit RGPD de toutes les actions effectuees par l IA sur l agenda';

CREATE INDEX idx_agenda_ai_logs_cabinet ON agenda_ai_action_logs(cabinet_id);
CREATE INDEX idx_agenda_ai_logs_user ON agenda_ai_action_logs(user_id);
CREATE INDEX idx_agenda_ai_logs_action ON agenda_ai_action_logs(action);
CREATE INDEX idx_agenda_ai_logs_created ON agenda_ai_action_logs(created_at);

-- ============================================================
-- 10. agenda_voice_commands — Historique des commandes vocales
-- ============================================================

CREATE TABLE agenda_voice_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL,
  user_id uuid,
  transcript text NOT NULL,
  intent varchar(100),
  entities jsonb DEFAULT '{}',
  response text,
  actions_prises jsonb DEFAULT '[]',
  statut varchar(20) DEFAULT 'compris' CHECK (statut IN ('compris', 'execute', 'echoue')),
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE agenda_voice_commands IS 'Historique des commandes vocales traitees par la secretaire IA';

CREATE INDEX idx_agenda_voice_cabinet ON agenda_voice_commands(cabinet_id);
CREATE INDEX idx_agenda_voice_user ON agenda_voice_commands(user_id);
CREATE INDEX idx_agenda_voice_intent ON agenda_voice_commands(intent);

-- ============================================================
-- 11. agenda_break_recommendations — Suggestions de pauses
-- ============================================================

CREATE TABLE agenda_break_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id uuid NOT NULL REFERENCES agenda_practitioners(id) ON DELETE CASCADE,
  date date NOT NULL,
  heure_proposee time NOT NULL,
  duree_minutes int DEFAULT 10,
  raison text,
  type varchar(30) DEFAULT 'mini_pause' CHECK (type IN ('mini_pause', 'post_chirurgie', 'administrative', 'dejeuner')),
  acceptee boolean,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE agenda_break_recommendations IS 'Recommandations de pauses generees par l IA selon la charge et la fatigue';

CREATE INDEX idx_agenda_breaks_practitioner ON agenda_break_recommendations(practitioner_id, date);

-- ============================================================
-- 12. agenda_emergency_slots — Capacite d urgence reservee
-- ============================================================

CREATE TABLE agenda_emergency_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL,
  practitioner_id uuid REFERENCES agenda_practitioners(id) ON DELETE CASCADE,
  jour_semaine int NOT NULL CHECK (jour_semaine >= 0 AND jour_semaine <= 6),
  heure_debut time NOT NULL,
  heure_fin time NOT NULL,
  duree_slot_minutes int DEFAULT 15,
  actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE agenda_emergency_slots IS 'Creneaux reserves pour les urgences dentaires, configurables par jour et praticien';

CREATE INDEX idx_agenda_emergency_cabinet ON agenda_emergency_slots(cabinet_id);
CREATE INDEX idx_agenda_emergency_practitioner ON agenda_emergency_slots(practitioner_id);
CREATE INDEX idx_agenda_emergency_actif ON agenda_emergency_slots(actif) WHERE actif = true;

-- ============================================================
-- FONCTION UTILITAIRE: get_user_cabinet_id
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_cabinet_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT cabinet_id FROM agenda_practitioners WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — Les utilisateurs ne voient que les donnees de leur cabinet
-- ============================================================

-- Activer RLS sur toutes les tables
ALTER TABLE agenda_practitioners ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_fatigue_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_patients_reliability ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_appointment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_stress_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_optimization_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_schedule_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_ai_action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_voice_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_break_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_emergency_slots ENABLE ROW LEVEL SECURITY;

-- Policies: agenda_practitioners
CREATE POLICY "practitioners_select_own_cabinet" ON agenda_practitioners
  FOR SELECT USING (cabinet_id = get_user_cabinet_id());
CREATE POLICY "practitioners_insert_own_cabinet" ON agenda_practitioners
  FOR INSERT WITH CHECK (cabinet_id = get_user_cabinet_id());
CREATE POLICY "practitioners_update_own_cabinet" ON agenda_practitioners
  FOR UPDATE USING (cabinet_id = get_user_cabinet_id());
CREATE POLICY "practitioners_delete_own_cabinet" ON agenda_practitioners
  FOR DELETE USING (cabinet_id = get_user_cabinet_id());

-- Policies: agenda_fatigue_profiles
CREATE POLICY "fatigue_select_own_cabinet" ON agenda_fatigue_profiles
  FOR SELECT USING (
    practitioner_id IN (SELECT id FROM agenda_practitioners WHERE cabinet_id = get_user_cabinet_id())
  );
CREATE POLICY "fatigue_insert_own_cabinet" ON agenda_fatigue_profiles
  FOR INSERT WITH CHECK (
    practitioner_id IN (SELECT id FROM agenda_practitioners WHERE cabinet_id = get_user_cabinet_id())
  );
CREATE POLICY "fatigue_update_own_cabinet" ON agenda_fatigue_profiles
  FOR UPDATE USING (
    practitioner_id IN (SELECT id FROM agenda_practitioners WHERE cabinet_id = get_user_cabinet_id())
  );

-- Policies: agenda_patients_reliability
CREATE POLICY "patients_reliability_select_own_cabinet" ON agenda_patients_reliability
  FOR SELECT USING (cabinet_id = get_user_cabinet_id());
CREATE POLICY "patients_reliability_insert_own_cabinet" ON agenda_patients_reliability
  FOR INSERT WITH CHECK (cabinet_id = get_user_cabinet_id());
CREATE POLICY "patients_reliability_update_own_cabinet" ON agenda_patients_reliability
  FOR UPDATE USING (cabinet_id = get_user_cabinet_id());

-- Policies: agenda_appointments
CREATE POLICY "appointments_select_own_cabinet" ON agenda_appointments
  FOR SELECT USING (cabinet_id = get_user_cabinet_id());
CREATE POLICY "appointments_insert_own_cabinet" ON agenda_appointments
  FOR INSERT WITH CHECK (cabinet_id = get_user_cabinet_id());
CREATE POLICY "appointments_update_own_cabinet" ON agenda_appointments
  FOR UPDATE USING (cabinet_id = get_user_cabinet_id());
CREATE POLICY "appointments_delete_own_cabinet" ON agenda_appointments
  FOR DELETE USING (cabinet_id = get_user_cabinet_id());

-- Policies: agenda_appointment_types
CREATE POLICY "appointment_types_select_own_cabinet" ON agenda_appointment_types
  FOR SELECT USING (cabinet_id = get_user_cabinet_id());
CREATE POLICY "appointment_types_insert_own_cabinet" ON agenda_appointment_types
  FOR INSERT WITH CHECK (cabinet_id = get_user_cabinet_id());
CREATE POLICY "appointment_types_update_own_cabinet" ON agenda_appointment_types
  FOR UPDATE USING (cabinet_id = get_user_cabinet_id());
CREATE POLICY "appointment_types_delete_own_cabinet" ON agenda_appointment_types
  FOR DELETE USING (cabinet_id = get_user_cabinet_id());

-- Policies: agenda_stress_scores
CREATE POLICY "stress_scores_select_own_cabinet" ON agenda_stress_scores
  FOR SELECT USING (cabinet_id = get_user_cabinet_id());
CREATE POLICY "stress_scores_insert_own_cabinet" ON agenda_stress_scores
  FOR INSERT WITH CHECK (cabinet_id = get_user_cabinet_id());
CREATE POLICY "stress_scores_update_own_cabinet" ON agenda_stress_scores
  FOR UPDATE USING (cabinet_id = get_user_cabinet_id());

-- Policies: agenda_optimization_suggestions
CREATE POLICY "suggestions_select_own_cabinet" ON agenda_optimization_suggestions
  FOR SELECT USING (cabinet_id = get_user_cabinet_id());
CREATE POLICY "suggestions_insert_own_cabinet" ON agenda_optimization_suggestions
  FOR INSERT WITH CHECK (cabinet_id = get_user_cabinet_id());
CREATE POLICY "suggestions_update_own_cabinet" ON agenda_optimization_suggestions
  FOR UPDATE USING (cabinet_id = get_user_cabinet_id());

-- Policies: agenda_schedule_rules
CREATE POLICY "rules_select_own_cabinet" ON agenda_schedule_rules
  FOR SELECT USING (cabinet_id = get_user_cabinet_id());
CREATE POLICY "rules_insert_own_cabinet" ON agenda_schedule_rules
  FOR INSERT WITH CHECK (cabinet_id = get_user_cabinet_id());
CREATE POLICY "rules_update_own_cabinet" ON agenda_schedule_rules
  FOR UPDATE USING (cabinet_id = get_user_cabinet_id());
CREATE POLICY "rules_delete_own_cabinet" ON agenda_schedule_rules
  FOR DELETE USING (cabinet_id = get_user_cabinet_id());

-- Policies: agenda_ai_action_logs
CREATE POLICY "ai_logs_select_own_cabinet" ON agenda_ai_action_logs
  FOR SELECT USING (cabinet_id = get_user_cabinet_id());
CREATE POLICY "ai_logs_insert_own_cabinet" ON agenda_ai_action_logs
  FOR INSERT WITH CHECK (cabinet_id = get_user_cabinet_id());

-- Policies: agenda_voice_commands
CREATE POLICY "voice_select_own_cabinet" ON agenda_voice_commands
  FOR SELECT USING (cabinet_id = get_user_cabinet_id());
CREATE POLICY "voice_insert_own_cabinet" ON agenda_voice_commands
  FOR INSERT WITH CHECK (cabinet_id = get_user_cabinet_id());

-- Policies: agenda_break_recommendations
CREATE POLICY "breaks_select_own_cabinet" ON agenda_break_recommendations
  FOR SELECT USING (
    practitioner_id IN (SELECT id FROM agenda_practitioners WHERE cabinet_id = get_user_cabinet_id())
  );
CREATE POLICY "breaks_insert_own_cabinet" ON agenda_break_recommendations
  FOR INSERT WITH CHECK (
    practitioner_id IN (SELECT id FROM agenda_practitioners WHERE cabinet_id = get_user_cabinet_id())
  );
CREATE POLICY "breaks_update_own_cabinet" ON agenda_break_recommendations
  FOR UPDATE USING (
    practitioner_id IN (SELECT id FROM agenda_practitioners WHERE cabinet_id = get_user_cabinet_id())
  );

-- Policies: agenda_emergency_slots
CREATE POLICY "emergency_select_own_cabinet" ON agenda_emergency_slots
  FOR SELECT USING (cabinet_id = get_user_cabinet_id());
CREATE POLICY "emergency_insert_own_cabinet" ON agenda_emergency_slots
  FOR INSERT WITH CHECK (cabinet_id = get_user_cabinet_id());
CREATE POLICY "emergency_update_own_cabinet" ON agenda_emergency_slots
  FOR UPDATE USING (cabinet_id = get_user_cabinet_id());
CREATE POLICY "emergency_delete_own_cabinet" ON agenda_emergency_slots
  FOR DELETE USING (cabinet_id = get_user_cabinet_id());

-- ============================================================
-- TRIGGER: updated_at automatique
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_practitioners
  BEFORE UPDATE ON agenda_practitioners
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_fatigue
  BEFORE UPDATE ON agenda_fatigue_profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_patients_reliability
  BEFORE UPDATE ON agenda_patients_reliability
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_appointments
  BEFORE UPDATE ON agenda_appointments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_rules
  BEFORE UPDATE ON agenda_schedule_rules
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- FIN DU SCHEMA AGENDA IA
-- ============================================================
