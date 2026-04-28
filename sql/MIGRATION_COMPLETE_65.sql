-- =====================================================================
-- JADOMI — MIGRATION COMPLETE PASSE 65
-- Date : 28 avril 2026
-- Description : Toutes les tables labo Passe 65 + RPC Passe 64
-- Tables : 28 tables
-- RPC : 1 fonction (get_database_stats)
-- A executer dans Supabase Dashboard (SQL Editor)
-- =====================================================================
-- ORDRE FK : techniciens > production > remakes > garanties > chat >
--            shade > expeditions > planning > maintenance > fichiers3d >
--            portail_patient > reseau > formules > RPC
-- =====================================================================

BEGIN;

-- =============================================================
-- SECTION 1 : TECHNICIENS LABORATOIRE
-- Source : sql/labo/65_techniciens.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS labo_techniciens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  nom TEXT NOT NULL,
  prenom TEXT,
  email TEXT,
  telephone TEXT,
  specialites TEXT[] DEFAULT '{}',
  date_embauche DATE,
  taux_horaire NUMERIC(8,2),
  statut TEXT DEFAULT 'actif' CHECK (statut IN ('actif','inactif')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_techniciens_prothesiste ON labo_techniciens(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_techniciens_statut ON labo_techniciens(statut);

ALTER TABLE labo_techniciens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "labo_techniciens_select" ON labo_techniciens
  FOR SELECT TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_techniciens_insert" ON labo_techniciens
  FOR INSERT TO authenticated
  WITH CHECK (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_techniciens_update" ON labo_techniciens
  FOR UPDATE TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

-- =============================================================
-- SECTION 2 : PRODUCTION — Suivi de production par etapes
-- Source : sql/labo/65_production.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS labo_production_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  bon_livraison_id UUID REFERENCES bons_livraison(id),
  dentiste_id UUID REFERENCES dentistes_clients(id),
  patient_ref TEXT,
  type_travail TEXT NOT NULL CHECK (type_travail IN ('couronne','bridge','prothese_amovible','prothese_fixe','gouttiere','implant','facette','inlay_onlay','reparation','autre')),
  materiaux TEXT,
  dents INTEGER[],
  teinte TEXT,
  teintier TEXT,
  urgence BOOLEAN DEFAULT false,
  etape_actuelle TEXT DEFAULT 'reception',
  statut TEXT DEFAULT 'en_cours' CHECK (statut IN ('en_cours','termine','annule','en_attente')),
  technicien_id UUID,
  technicien_nom TEXT,
  date_reception TIMESTAMPTZ DEFAULT now(),
  date_livraison_prevue DATE,
  date_livraison_reelle DATE,
  qr_code TEXT UNIQUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labo_production_etapes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES labo_production_cases(id) ON DELETE CASCADE,
  etape TEXT NOT NULL,
  technicien_id UUID,
  technicien_nom TEXT,
  debut TIMESTAMPTZ DEFAULT now(),
  fin TIMESTAMPTZ,
  duree_minutes INTEGER,
  notes TEXT,
  photos TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prod_cases_prothesiste ON labo_production_cases(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_prod_cases_etape ON labo_production_cases(etape_actuelle);
CREATE INDEX IF NOT EXISTS idx_prod_cases_statut ON labo_production_cases(statut);
CREATE INDEX IF NOT EXISTS idx_prod_cases_qr ON labo_production_cases(qr_code);
CREATE INDEX IF NOT EXISTS idx_prod_etapes_case ON labo_production_etapes(case_id);

ALTER TABLE labo_production_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE labo_production_etapes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "labo_production_cases_select" ON labo_production_cases
  FOR SELECT TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_production_cases_insert" ON labo_production_cases
  FOR INSERT TO authenticated
  WITH CHECK (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_production_cases_update" ON labo_production_cases
  FOR UPDATE TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_production_etapes_select" ON labo_production_etapes
  FOR SELECT TO authenticated
  USING (case_id IN (SELECT id FROM labo_production_cases WHERE prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid())));

CREATE POLICY "labo_production_etapes_insert" ON labo_production_etapes
  FOR INSERT TO authenticated
  WITH CHECK (case_id IN (SELECT id FROM labo_production_cases WHERE prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid())));

CREATE POLICY "labo_production_etapes_update" ON labo_production_etapes
  FOR UPDATE TO authenticated
  USING (case_id IN (SELECT id FROM labo_production_cases WHERE prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid())));

-- =============================================================
-- SECTION 3 : REMAKES / Refabrications
-- Source : sql/labo/65_remakes.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS labo_remakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  case_production_id UUID REFERENCES labo_production_cases(id),
  bon_livraison_id UUID REFERENCES bons_livraison(id),
  dentiste_id UUID REFERENCES dentistes_clients(id),
  type_travail TEXT,
  cause TEXT NOT NULL CHECK (cause IN ('adaptation','fracture','esthetique','teinte','occlusion','matiere_defectueuse','erreur_conception','erreur_fabrication','autre')),
  description_probleme TEXT,
  responsabilite TEXT DEFAULT 'labo' CHECK (responsabilite IN ('labo','dentiste','fournisseur','patient')),
  cout_remake NUMERIC(10,2) DEFAULT 0,
  photos_probleme TEXT[],
  technicien_responsable TEXT,
  action_corrective TEXT,
  resolution TEXT,
  statut TEXT DEFAULT 'ouvert' CHECK (statut IN ('ouvert','en_cours','resolu','ferme')),
  date_probleme TIMESTAMPTZ DEFAULT now(),
  date_resolution TIMESTAMPTZ,
  nouveau_bl_id UUID REFERENCES bons_livraison(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_remakes_prothesiste ON labo_remakes(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_remakes_cause ON labo_remakes(cause);
CREATE INDEX IF NOT EXISTS idx_remakes_dentiste ON labo_remakes(dentiste_id);
CREATE INDEX IF NOT EXISTS idx_remakes_statut ON labo_remakes(statut);

ALTER TABLE labo_remakes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "labo_remakes_select" ON labo_remakes
  FOR SELECT TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_remakes_insert" ON labo_remakes
  FOR INSERT TO authenticated
  WITH CHECK (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_remakes_update" ON labo_remakes
  FOR UPDATE TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

-- =============================================================
-- SECTION 4 : GARANTIES / Warranties
-- Source : sql/labo/65_garanties.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS labo_garanties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  bon_livraison_id UUID REFERENCES bons_livraison(id),
  case_production_id UUID REFERENCES labo_production_cases(id),
  dentiste_id UUID REFERENCES dentistes_clients(id),
  patient_ref TEXT,
  type_travail TEXT NOT NULL,
  dents INTEGER[],
  materiaux TEXT,
  duree_mois INTEGER NOT NULL DEFAULT 24,
  date_debut DATE NOT NULL DEFAULT CURRENT_DATE,
  date_fin DATE,
  statut TEXT DEFAULT 'active' CHECK (statut IN ('active','expiree','reclamation','annulee')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labo_garantie_reclamations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garantie_id UUID NOT NULL REFERENCES labo_garanties(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  cause TEXT,
  photos TEXT[],
  date_reclamation DATE DEFAULT CURRENT_DATE,
  remake_id UUID REFERENCES labo_remakes(id),
  resolution TEXT,
  statut TEXT DEFAULT 'ouverte' CHECK (statut IN ('ouverte','en_cours','resolue','rejetee')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labo_garanties_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id) UNIQUE,
  durees JSONB DEFAULT '{"couronne":60,"ccm":36,"bridge":60,"prothese_amovible":24,"gouttiere":12,"facette":36,"inlay_onlay":60,"implant":60,"reparation":6}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_garanties_prothesiste ON labo_garanties(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_garanties_statut ON labo_garanties(statut);
CREATE INDEX IF NOT EXISTS idx_garanties_date_fin ON labo_garanties(date_fin);
CREATE INDEX IF NOT EXISTS idx_garanties_dentiste ON labo_garanties(dentiste_id);
CREATE INDEX IF NOT EXISTS idx_garantie_reclamations_garantie ON labo_garantie_reclamations(garantie_id);

ALTER TABLE labo_garanties ENABLE ROW LEVEL SECURITY;
ALTER TABLE labo_garantie_reclamations ENABLE ROW LEVEL SECURITY;
ALTER TABLE labo_garanties_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "labo_garanties_select" ON labo_garanties
  FOR SELECT TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_garanties_insert" ON labo_garanties
  FOR INSERT TO authenticated
  WITH CHECK (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_garanties_update" ON labo_garanties
  FOR UPDATE TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_garantie_reclamations_select" ON labo_garantie_reclamations
  FOR SELECT TO authenticated
  USING (garantie_id IN (SELECT id FROM labo_garanties WHERE prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid())));

CREATE POLICY "labo_garantie_reclamations_insert" ON labo_garantie_reclamations
  FOR INSERT TO authenticated
  WITH CHECK (garantie_id IN (SELECT id FROM labo_garanties WHERE prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid())));

CREATE POLICY "labo_garantie_reclamations_update" ON labo_garantie_reclamations
  FOR UPDATE TO authenticated
  USING (garantie_id IN (SELECT id FROM labo_garanties WHERE prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid())));

CREATE POLICY "labo_garanties_config_select" ON labo_garanties_config
  FOR SELECT TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_garanties_config_insert" ON labo_garanties_config
  FOR INSERT TO authenticated
  WITH CHECK (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_garanties_config_update" ON labo_garanties_config
  FOR UPDATE TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

-- =============================================================
-- SECTION 5 : CHAT dentiste-prothesiste
-- Source : sql/labo/65_chat.sql
-- =============================================================

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

ALTER TABLE labo_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE labo_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "labo_conversations_select" ON labo_conversations
  FOR SELECT TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_conversations_insert" ON labo_conversations
  FOR INSERT TO authenticated
  WITH CHECK (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_conversations_update" ON labo_conversations
  FOR UPDATE TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_messages_select" ON labo_messages
  FOR SELECT TO authenticated
  USING (conversation_id IN (SELECT id FROM labo_conversations WHERE prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid())));

CREATE POLICY "labo_messages_insert" ON labo_messages
  FOR INSERT TO authenticated
  WITH CHECK (conversation_id IN (SELECT id FROM labo_conversations WHERE prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid())));

CREATE POLICY "labo_messages_update" ON labo_messages
  FOR UPDATE TO authenticated
  USING (conversation_id IN (SELECT id FROM labo_conversations WHERE prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid())));

-- =============================================================
-- SECTION 6 : SHADE / Colorimetrie dentaire
-- Source : sql/labo/65_shade.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS labo_shade_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  dentiste_id UUID REFERENCES dentistes_clients(id),
  cas_production_id UUID REFERENCES labo_production_cases(id),
  patient_ref TEXT,
  dents INTEGER[],
  teintier_reference TEXT,
  analyse_ia JSONB,
  teinte_finale TEXT,
  notes TEXT,
  statut TEXT DEFAULT 'en_cours' CHECK (statut IN ('en_cours','analyse','valide')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labo_shade_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shade_case_id UUID NOT NULL REFERENCES labo_shade_cases(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  type TEXT DEFAULT 'labial' CHECK (type IN ('labial','lingual','occlusale','gros_plan','comparaison','avant','apres')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shade_prothesiste ON labo_shade_cases(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_shade_photos_case ON labo_shade_photos(shade_case_id);

ALTER TABLE labo_shade_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE labo_shade_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "labo_shade_cases_select" ON labo_shade_cases
  FOR SELECT TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_shade_cases_insert" ON labo_shade_cases
  FOR INSERT TO authenticated
  WITH CHECK (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_shade_cases_update" ON labo_shade_cases
  FOR UPDATE TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_shade_photos_select" ON labo_shade_photos
  FOR SELECT TO authenticated
  USING (shade_case_id IN (SELECT id FROM labo_shade_cases WHERE prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid())));

CREATE POLICY "labo_shade_photos_insert" ON labo_shade_photos
  FOR INSERT TO authenticated
  WITH CHECK (shade_case_id IN (SELECT id FROM labo_shade_cases WHERE prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid())));

-- =============================================================
-- SECTION 7 : EXPEDITIONS / Shipments
-- Source : sql/labo/65_expeditions.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS labo_expeditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  dentiste_id UUID REFERENCES dentistes_clients(id),
  bons_livraison_ids UUID[] DEFAULT '{}',
  cases_production_ids UUID[] DEFAULT '{}',
  transporteur TEXT DEFAULT 'colissimo' CHECK (transporteur IN ('colissimo','chronopost','coursier','main_propre','autre')),
  numero_suivi TEXT,
  poids_grammes INTEGER,
  valeur_declaree NUMERIC(10,2),
  assurance BOOLEAN DEFAULT false,
  statut TEXT DEFAULT 'prepare' CHECK (statut IN ('prepare','enleve','en_transit','livre','retour','annule')),
  adresse_expediteur JSONB,
  adresse_destination JSONB,
  notes_expedition TEXT,
  date_expedition TIMESTAMPTZ,
  date_livraison_estimee DATE,
  date_livraison_reelle TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labo_expedition_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expedition_id UUID NOT NULL REFERENCES labo_expeditions(id) ON DELETE CASCADE,
  statut TEXT NOT NULL,
  localisation TEXT,
  commentaire TEXT,
  date_evenement TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exp_prothesiste ON labo_expeditions(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_exp_statut ON labo_expeditions(statut);
CREATE INDEX IF NOT EXISTS idx_exp_dentiste ON labo_expeditions(dentiste_id);
CREATE INDEX IF NOT EXISTS idx_exp_events ON labo_expedition_events(expedition_id);

ALTER TABLE labo_expeditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE labo_expedition_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "labo_expeditions_select" ON labo_expeditions
  FOR SELECT TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_expeditions_insert" ON labo_expeditions
  FOR INSERT TO authenticated
  WITH CHECK (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_expeditions_update" ON labo_expeditions
  FOR UPDATE TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_expedition_events_select" ON labo_expedition_events
  FOR SELECT TO authenticated
  USING (expedition_id IN (SELECT id FROM labo_expeditions WHERE prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid())));

CREATE POLICY "labo_expedition_events_insert" ON labo_expedition_events
  FOR INSERT TO authenticated
  WITH CHECK (expedition_id IN (SELECT id FROM labo_expeditions WHERE prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid())));

-- =============================================================
-- SECTION 8 : PLANNING / Conges techniciens
-- Source : sql/labo/65_planning.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS labo_planning_conges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  technicien_id UUID NOT NULL REFERENCES labo_techniciens(id),
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  motif TEXT DEFAULT 'conge' CHECK (motif IN ('conge','maladie','formation','autre')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conges_prothesiste ON labo_planning_conges(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_conges_technicien ON labo_planning_conges(technicien_id);
CREATE INDEX IF NOT EXISTS idx_conges_dates ON labo_planning_conges(date_debut, date_fin);

ALTER TABLE labo_planning_conges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "labo_planning_conges_select" ON labo_planning_conges
  FOR SELECT TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_planning_conges_insert" ON labo_planning_conges
  FOR INSERT TO authenticated
  WITH CHECK (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_planning_conges_update" ON labo_planning_conges
  FOR UPDATE TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

-- =============================================================
-- SECTION 9 : MAINTENANCE machines
-- Source : sql/labo/65_maintenance.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS labo_machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  nom TEXT NOT NULL,
  type_machine TEXT NOT NULL,
  marque TEXT,
  modele TEXT,
  numero_serie TEXT,
  date_achat DATE,
  fournisseur TEXT,
  cout_achat NUMERIC(10,2),
  frequence_maintenance_jours INTEGER DEFAULT 90,
  compteur_heures INTEGER DEFAULT 0,
  derniere_maintenance DATE,
  prochaine_maintenance DATE,
  photo_url TEXT,
  notes TEXT,
  statut TEXT DEFAULT 'actif' CHECK (statut IN ('actif','en_panne','en_maintenance','inactif')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labo_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES labo_machines(id) ON DELETE CASCADE,
  type_intervention TEXT DEFAULT 'preventive' CHECK (type_intervention IN ('preventive','corrective','calibration','nettoyage')),
  description TEXT,
  technicien TEXT,
  cout NUMERIC(10,2),
  pieces_remplacees TEXT,
  duree_minutes INTEGER,
  date_intervention TIMESTAMPTZ DEFAULT now(),
  prochaine_prevue DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_machines_prothesiste ON labo_machines(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_machines_prochaine ON labo_machines(prochaine_maintenance);
CREATE INDEX IF NOT EXISTS idx_interventions_machine ON labo_interventions(machine_id);

ALTER TABLE labo_machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE labo_interventions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "labo_machines_select" ON labo_machines
  FOR SELECT TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_machines_insert" ON labo_machines
  FOR INSERT TO authenticated
  WITH CHECK (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_machines_update" ON labo_machines
  FOR UPDATE TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_interventions_select" ON labo_interventions
  FOR SELECT TO authenticated
  USING (machine_id IN (SELECT id FROM labo_machines WHERE prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid())));

CREATE POLICY "labo_interventions_insert" ON labo_interventions
  FOR INSERT TO authenticated
  WITH CHECK (machine_id IN (SELECT id FROM labo_machines WHERE prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid())));

-- =============================================================
-- SECTION 10 : FICHIERS 3D + validations design
-- Source : sql/labo/65_fichiers3d.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS labo_fichiers3d (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  cas_production_id UUID REFERENCES labo_production_cases(id),
  dentiste_id UUID REFERENCES dentistes_clients(id),
  nom_fichier TEXT NOT NULL,
  type_fichier TEXT CHECK (type_fichier IN ('stl','ply','obj','dcm','3mf','step','iges')),
  taille_octets BIGINT,
  url TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  parent_id UUID REFERENCES labo_fichiers3d(id),
  description TEXT,
  version_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labo_validations_3d (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fichier_id UUID NOT NULL REFERENCES labo_fichiers3d(id) ON DELETE CASCADE,
  prothesiste_id UUID NOT NULL,
  dentiste_id UUID NOT NULL REFERENCES dentistes_clients(id),
  statut TEXT DEFAULT 'en_attente' CHECK (statut IN ('en_attente','approuve','rejete','modification')),
  commentaire TEXT,
  annotations TEXT,
  date_soumission TIMESTAMPTZ DEFAULT now(),
  date_reponse TIMESTAMPTZ,
  token TEXT UNIQUE,
  token_expire_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_f3d_prothesiste ON labo_fichiers3d(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_f3d_case ON labo_fichiers3d(cas_production_id);
CREATE INDEX IF NOT EXISTS idx_val_statut ON labo_validations_3d(statut);
CREATE INDEX IF NOT EXISTS idx_val_token ON labo_validations_3d(token);

ALTER TABLE labo_fichiers3d ENABLE ROW LEVEL SECURITY;
ALTER TABLE labo_validations_3d ENABLE ROW LEVEL SECURITY;

CREATE POLICY "labo_fichiers3d_select" ON labo_fichiers3d
  FOR SELECT TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_fichiers3d_insert" ON labo_fichiers3d
  FOR INSERT TO authenticated
  WITH CHECK (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_fichiers3d_update" ON labo_fichiers3d
  FOR UPDATE TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_validations_3d_select" ON labo_validations_3d
  FOR SELECT TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_validations_3d_insert" ON labo_validations_3d
  FOR INSERT TO authenticated
  WITH CHECK (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_validations_3d_update" ON labo_validations_3d
  FOR UPDATE TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

-- =============================================================
-- SECTION 11 : PORTAIL PATIENT (liens publics)
-- Source : sql/labo/65_portail_patient.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS labo_patient_liens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  cas_production_id UUID NOT NULL REFERENCES labo_production_cases(id),
  patient_nom TEXT,
  patient_prenom TEXT,
  patient_email TEXT,
  token TEXT UNIQUE NOT NULL,
  expire_at TIMESTAMPTZ NOT NULL,
  consulte_count INTEGER DEFAULT 0,
  derniere_consultation TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_liens_token ON labo_patient_liens(token);
CREATE INDEX IF NOT EXISTS idx_patient_liens_case ON labo_patient_liens(cas_production_id);

ALTER TABLE labo_patient_liens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "labo_patient_liens_select" ON labo_patient_liens
  FOR SELECT TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_patient_liens_insert" ON labo_patient_liens
  FOR INSERT TO authenticated
  WITH CHECK (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_patient_liens_update" ON labo_patient_liens
  FOR UPDATE TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

-- =============================================================
-- SECTION 12 : RESEAU SOLIDAIRE INTER-LABOS
-- Source : sql/labo/65_reseau.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS labo_reseau_profils (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id) UNIQUE,
  specialites TEXT[] DEFAULT '{}',
  capacite_production TEXT DEFAULT 'moyenne',
  accepte_soustraitance BOOLEAN DEFAULT true,
  zone_geographique TEXT,
  departement TEXT,
  ville TEXT,
  equipements TEXT[] DEFAULT '{}',
  certifications TEXT[] DEFAULT '{}',
  description_courte TEXT,
  charte_france BOOLEAN DEFAULT false,
  note_moyenne NUMERIC(3,2) DEFAULT 0,
  nombre_avis INTEGER DEFAULT 0,
  statut TEXT DEFAULT 'actif' CHECK (statut IN ('actif','suspendu','banni')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labo_reseau_annonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  type TEXT NOT NULL CHECK (type IN ('offre','demande')),
  titre TEXT NOT NULL,
  description TEXT,
  specialite_requise TEXT,
  type_travail TEXT,
  quantite INTEGER,
  urgence BOOLEAN DEFAULT false,
  date_limite DATE,
  tarif_propose NUMERIC(10,2),
  statut TEXT DEFAULT 'active' CHECK (statut IN ('active','pourvue','expiree','annulee')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labo_reseau_reponses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annonce_id UUID NOT NULL REFERENCES labo_reseau_annonces(id) ON DELETE CASCADE,
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  message TEXT,
  tarif_propose NUMERIC(10,2),
  statut TEXT DEFAULT 'en_attente' CHECK (statut IN ('en_attente','acceptee','refusee')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labo_achats_groupes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  createur_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  produit TEXT NOT NULL,
  marque TEXT,
  fournisseur TEXT,
  description TEXT,
  quantite_unitaire TEXT,
  prix_catalogue NUMERIC(10,2),
  paliers JSONB DEFAULT '[]',
  date_cloture DATE,
  statut TEXT DEFAULT 'ouvert' CHECK (statut IN ('ouvert','atteint','cloture','annule')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labo_achats_groupes_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  achat_groupe_id UUID NOT NULL REFERENCES labo_achats_groupes(id) ON DELETE CASCADE,
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  quantite INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(achat_groupe_id, prothesiste_id)
);

CREATE TABLE IF NOT EXISTS labo_reseau_entraide (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  categorie TEXT DEFAULT 'technique' CHECK (categorie IN ('technique','juridique','commercial','formation','autre')),
  titre TEXT NOT NULL,
  contenu TEXT NOT NULL,
  reponses_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labo_reseau_entraide_reponses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sujet_id UUID NOT NULL REFERENCES labo_reseau_entraide(id) ON DELETE CASCADE,
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  contenu TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reseau_profils_dept ON labo_reseau_profils(departement);
CREATE INDEX IF NOT EXISTS idx_reseau_profils_charte ON labo_reseau_profils(charte_france);
CREATE INDEX IF NOT EXISTS idx_reseau_annonces_type ON labo_reseau_annonces(type);
CREATE INDEX IF NOT EXISTS idx_reseau_annonces_statut ON labo_reseau_annonces(statut);
CREATE INDEX IF NOT EXISTS idx_achats_groupes_statut ON labo_achats_groupes(statut);
CREATE INDEX IF NOT EXISTS idx_entraide_categorie ON labo_reseau_entraide(categorie);

ALTER TABLE labo_reseau_profils ENABLE ROW LEVEL SECURITY;
ALTER TABLE labo_reseau_annonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE labo_reseau_reponses ENABLE ROW LEVEL SECURITY;
ALTER TABLE labo_achats_groupes ENABLE ROW LEVEL SECURITY;
ALTER TABLE labo_achats_groupes_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE labo_reseau_entraide ENABLE ROW LEVEL SECURITY;
ALTER TABLE labo_reseau_entraide_reponses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "labo_reseau_profils_select" ON labo_reseau_profils
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "labo_reseau_profils_insert" ON labo_reseau_profils
  FOR INSERT TO authenticated
  WITH CHECK (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_reseau_profils_update" ON labo_reseau_profils
  FOR UPDATE TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_reseau_annonces_select" ON labo_reseau_annonces
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "labo_reseau_annonces_insert" ON labo_reseau_annonces
  FOR INSERT TO authenticated
  WITH CHECK (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_reseau_annonces_update" ON labo_reseau_annonces
  FOR UPDATE TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_reseau_reponses_select" ON labo_reseau_reponses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "labo_reseau_reponses_insert" ON labo_reseau_reponses
  FOR INSERT TO authenticated
  WITH CHECK (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_achats_groupes_select" ON labo_achats_groupes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "labo_achats_groupes_insert" ON labo_achats_groupes
  FOR INSERT TO authenticated
  WITH CHECK (createur_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_achats_groupes_update" ON labo_achats_groupes
  FOR UPDATE TO authenticated
  USING (createur_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_achats_groupes_participants_select" ON labo_achats_groupes_participants
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "labo_achats_groupes_participants_insert" ON labo_achats_groupes_participants
  FOR INSERT TO authenticated
  WITH CHECK (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_reseau_entraide_select" ON labo_reseau_entraide
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "labo_reseau_entraide_insert" ON labo_reseau_entraide
  FOR INSERT TO authenticated
  WITH CHECK (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_reseau_entraide_update" ON labo_reseau_entraide
  FOR UPDATE TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_reseau_entraide_reponses_select" ON labo_reseau_entraide_reponses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "labo_reseau_entraide_reponses_insert" ON labo_reseau_entraide_reponses
  FOR INSERT TO authenticated
  WITH CHECK (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

-- =============================================================
-- SECTION 13 : ABONNEMENTS ET FORMULES
-- Source : sql/labo/65_formules.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS labo_abonnements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id) UNIQUE,
  formule TEXT DEFAULT 'essentiel' CHECK (formule IN ('essentiel','pro','premium')),
  prix_mensuel NUMERIC(8,2),
  date_debut DATE DEFAULT CURRENT_DATE,
  date_fin DATE,
  stripe_subscription_id TEXT,
  statut TEXT DEFAULT 'actif' CHECK (statut IN ('actif','essai','suspendu','annule')),
  max_techniciens INTEGER DEFAULT 5,
  max_bl_mois INTEGER DEFAULT 200,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labo_abonnements_historique (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  ancienne_formule TEXT,
  nouvelle_formule TEXT NOT NULL,
  ancien_prix NUMERIC(8,2),
  nouveau_prix NUMERIC(8,2),
  raison TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_labo_abo_prothesiste ON labo_abonnements(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_labo_abo_hist_prothesiste ON labo_abonnements_historique(prothesiste_id);

ALTER TABLE labo_abonnements ENABLE ROW LEVEL SECURITY;
ALTER TABLE labo_abonnements_historique ENABLE ROW LEVEL SECURITY;

CREATE POLICY "labo_abonnements_select" ON labo_abonnements
  FOR SELECT TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_abonnements_insert" ON labo_abonnements
  FOR INSERT TO authenticated
  WITH CHECK (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_abonnements_update" ON labo_abonnements
  FOR UPDATE TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_abonnements_historique_select" ON labo_abonnements_historique
  FOR SELECT TO authenticated
  USING (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

CREATE POLICY "labo_abonnements_historique_insert" ON labo_abonnements_historique
  FOR INSERT TO authenticated
  WITH CHECK (prothesiste_id IN (SELECT id FROM labo_prothesistes WHERE user_id = auth.uid()));

-- =============================================================
-- SECTION 14 : RPC get_database_stats()
-- Source : sql/services/64_database_stats_rpc.sql
-- =============================================================

CREATE OR REPLACE FUNCTION get_database_stats()
RETURNS json
LANGUAGE sql STABLE
AS $$
  SELECT json_build_object(
    'total_products', (SELECT count(*) FROM products_database),
    'by_source', COALESCE((
      SELECT json_object_agg(src, cnt)
      FROM (
        SELECT COALESCE(source, 'unknown') AS src, count(*) AS cnt
        FROM products_database
        GROUP BY source
        ORDER BY cnt DESC
      ) s
    ), '{}'::json),
    'by_category', COALESCE((
      SELECT json_object_agg(cat, cnt)
      FROM (
        SELECT category AS cat, count(*) AS cnt
        FROM products_database
        WHERE category IS NOT NULL
        GROUP BY category
        ORDER BY cnt DESC
        LIMIT 100
      ) c
    ), '{}'::json),
    'distinct_categories', COALESCE((
      SELECT json_agg(category ORDER BY category)
      FROM (
        SELECT DISTINCT category
        FROM products_database
        WHERE category IS NOT NULL
      ) d
    ), '[]'::json)
  );
$$;

GRANT EXECUTE ON FUNCTION get_database_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_database_stats() TO anon;

-- =============================================================
-- SECTION 15 : GRANTS — acces tables pour roles Supabase
-- =============================================================

GRANT SELECT, INSERT, UPDATE ON labo_techniciens TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_production_cases TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_production_etapes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_remakes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_garanties TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_garantie_reclamations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_garanties_config TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_shade_cases TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_shade_photos TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_expeditions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_expedition_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_planning_conges TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_machines TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_interventions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_fichiers3d TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_validations_3d TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_patient_liens TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_reseau_profils TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_reseau_annonces TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_reseau_reponses TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_achats_groupes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_achats_groupes_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_reseau_entraide TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_reseau_entraide_reponses TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_abonnements TO authenticated;
GRANT SELECT, INSERT, UPDATE ON labo_abonnements_historique TO authenticated;

COMMIT;

-- =============================================================
-- SECTION 16 : VERIFICATION — Comptage de toutes les tables
-- Executer apres le COMMIT pour verifier la creation
-- =============================================================

SELECT 'labo_techniciens' AS table_name, count(*) AS rows FROM labo_techniciens
UNION ALL SELECT 'labo_production_cases', count(*) FROM labo_production_cases
UNION ALL SELECT 'labo_production_etapes', count(*) FROM labo_production_etapes
UNION ALL SELECT 'labo_remakes', count(*) FROM labo_remakes
UNION ALL SELECT 'labo_garanties', count(*) FROM labo_garanties
UNION ALL SELECT 'labo_garantie_reclamations', count(*) FROM labo_garantie_reclamations
UNION ALL SELECT 'labo_garanties_config', count(*) FROM labo_garanties_config
UNION ALL SELECT 'labo_conversations', count(*) FROM labo_conversations
UNION ALL SELECT 'labo_messages', count(*) FROM labo_messages
UNION ALL SELECT 'labo_shade_cases', count(*) FROM labo_shade_cases
UNION ALL SELECT 'labo_shade_photos', count(*) FROM labo_shade_photos
UNION ALL SELECT 'labo_expeditions', count(*) FROM labo_expeditions
UNION ALL SELECT 'labo_expedition_events', count(*) FROM labo_expedition_events
UNION ALL SELECT 'labo_planning_conges', count(*) FROM labo_planning_conges
UNION ALL SELECT 'labo_machines', count(*) FROM labo_machines
UNION ALL SELECT 'labo_interventions', count(*) FROM labo_interventions
UNION ALL SELECT 'labo_fichiers3d', count(*) FROM labo_fichiers3d
UNION ALL SELECT 'labo_validations_3d', count(*) FROM labo_validations_3d
UNION ALL SELECT 'labo_patient_liens', count(*) FROM labo_patient_liens
UNION ALL SELECT 'labo_reseau_profils', count(*) FROM labo_reseau_profils
UNION ALL SELECT 'labo_reseau_annonces', count(*) FROM labo_reseau_annonces
UNION ALL SELECT 'labo_reseau_reponses', count(*) FROM labo_reseau_reponses
UNION ALL SELECT 'labo_achats_groupes', count(*) FROM labo_achats_groupes
UNION ALL SELECT 'labo_achats_groupes_participants', count(*) FROM labo_achats_groupes_participants
UNION ALL SELECT 'labo_reseau_entraide', count(*) FROM labo_reseau_entraide
UNION ALL SELECT 'labo_reseau_entraide_reponses', count(*) FROM labo_reseau_entraide_reponses
UNION ALL SELECT 'labo_abonnements', count(*) FROM labo_abonnements
UNION ALL SELECT 'labo_abonnements_historique', count(*) FROM labo_abonnements_historique
ORDER BY table_name;

-- Verification RPC
SELECT get_database_stats();

-- =====================================================================
-- FIN DE MIGRATION — 28 tables + 1 RPC + RLS + GRANTS
-- =====================================================================
