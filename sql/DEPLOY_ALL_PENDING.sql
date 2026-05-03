-- =====================================================================
-- JADOMI — TOUS LES SQL EN ATTENTE DE DEPLOIEMENT
-- Date : 3 mai 2026
-- A copier-coller dans Supabase Dashboard > SQL Editor
-- ORDRE : respecte les dependances FK
-- =====================================================================
-- CONTENU :
--   1. MIGRATION_COMPLETE_65 (28 tables labo + RPC)
--   2. 53_reseau_soins (Care Network)
--   3. 57_signed_documents (Signature electronique)
--   4. product_equivalences (White label)
--   5. SQL 44-47 (CMS / Chatbot v3 / Staging)
--   6. 38_coins_wallet_structure (Coins wallet)
-- =====================================================================


-- =============================================================
-- =============================================================
-- BLOC 1 : MIGRATION COMPLETE PASSE 65
-- 28 tables labo + 1 RPC + RLS + GRANTS
-- =============================================================
-- =============================================================

BEGIN;

-- SECTION 1 : TECHNICIENS LABORATOIRE
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

-- SECTION 2 : PRODUCTION
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

-- SECTION 3 : REMAKES
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

-- SECTION 4 : GARANTIES
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

-- SECTION 5 : CHAT dentiste-prothesiste
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

-- SECTION 6 : SHADE / Colorimetrie
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

-- SECTION 7 : EXPEDITIONS
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

-- SECTION 8 : PLANNING / Conges
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

-- SECTION 9 : MAINTENANCE machines
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

-- SECTION 10 : FICHIERS 3D
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

-- SECTION 11 : PORTAIL PATIENT
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

-- SECTION 12 : RESEAU SOLIDAIRE
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

-- SECTION 13 : ABONNEMENTS
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

-- SECTION 14 : RPC get_database_stats()
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

-- SECTION 15 : GRANTS
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
-- =============================================================
-- BLOC 2 : RESEAU DE SOINS (Passe 53)
-- =============================================================
-- =============================================================

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
  cc.id, cc.patient_id, cc.profession, cc.role, cc.statut, cc.date_ajout,
  cc.praticien_cabinet_id, cab.nom_cabinet AS cabinet_nom,
  cc.praticien_externe_nom, cc.praticien_externe_email, cc.praticien_externe_profession,
  COALESCE(cab.nom_cabinet, cc.praticien_externe_nom) AS nom_affiche,
  cc.invite_par, inv.nom_cabinet AS invite_par_nom
FROM public.dentiste_pro_care_circle cc
LEFT JOIN public.dentiste_pro_cabinets cab ON cab.id = cc.praticien_cabinet_id
LEFT JOIN public.dentiste_pro_cabinets inv ON inv.id = cc.invite_par
WHERE cc.statut != 'inactif';

ALTER TABLE public.dentiste_pro_care_circle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentiste_pro_partages ENABLE ROW LEVEL SECURITY;


-- =============================================================
-- =============================================================
-- BLOC 3 : SIGNED DOCUMENTS (Passe 57)
-- =============================================================
-- =============================================================

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


-- =============================================================
-- =============================================================
-- BLOC 4 : PRODUCT EQUIVALENCES (Passe 51b)
-- =============================================================
-- =============================================================

CREATE TABLE IF NOT EXISTS product_equivalences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_a_id UUID REFERENCES products_database(id) ON DELETE CASCADE,
  product_b_id UUID REFERENCES products_database(id) ON DELETE CASCADE,
  equivalence_type VARCHAR(30) NOT NULL,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.70,
  oem_manufacturer VARCHAR(200),
  oem_reference VARCHAR(100),
  oem_country VARCHAR(2),
  differences JSONB,
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  reports INTEGER DEFAULT 0,
  created_by UUID,
  source VARCHAR(30) NOT NULL DEFAULT 'system',
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_a_id, product_b_id)
);

CREATE INDEX IF NOT EXISTS idx_equiv_product_a ON product_equivalences(product_a_id);
CREATE INDEX IF NOT EXISTS idx_equiv_product_b ON product_equivalences(product_b_id);
CREATE INDEX IF NOT EXISTS idx_equiv_type ON product_equivalences(equivalence_type);
CREATE INDEX IF NOT EXISTS idx_equiv_confidence ON product_equivalences(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_equiv_oem ON product_equivalences(oem_manufacturer);

CREATE OR REPLACE FUNCTION trg_product_equiv_updated()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_product_equiv_updated ON product_equivalences;
CREATE TRIGGER trg_product_equiv_updated
  BEFORE UPDATE ON product_equivalences
  FOR EACH ROW EXECUTE FUNCTION trg_product_equiv_updated();

ALTER TABLE product_equivalences ENABLE ROW LEVEL SECURITY;
CREATE POLICY equiv_read_all ON product_equivalences
  FOR SELECT USING (true);
CREATE POLICY equiv_insert_auth ON product_equivalences
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY equiv_update_auth ON product_equivalences
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE OR REPLACE VIEW v_product_equivalences_with_prices AS
SELECT
  pe.id AS equivalence_id, pe.equivalence_type, pe.confidence,
  pe.oem_manufacturer, pe.oem_country,
  pa.id AS product_a_id, pa.name AS product_a_name, pa.brand AS product_a_brand,
  pa.manufacturer AS product_a_manufacturer, pa.gtin AS product_a_gtin,
  pb.id AS product_b_id, pb.name AS product_b_name, pb.brand AS product_b_brand,
  pb.manufacturer AS product_b_manufacturer, pb.gtin AS product_b_gtin,
  (SELECT price_negotiated FROM supplier_prices
   WHERE product_id = pa.id AND price_negotiated > 0
   ORDER BY observed_at DESC LIMIT 1) AS price_a,
  (SELECT supplier_name FROM supplier_prices
   WHERE product_id = pa.id AND price_negotiated > 0
   ORDER BY observed_at DESC LIMIT 1) AS supplier_a,
  (SELECT price_negotiated FROM supplier_prices
   WHERE product_id = pb.id AND price_negotiated > 0
   ORDER BY observed_at DESC LIMIT 1) AS price_b,
  (SELECT supplier_name FROM supplier_prices
   WHERE product_id = pb.id AND price_negotiated > 0
   ORDER BY observed_at DESC LIMIT 1) AS supplier_b
FROM product_equivalences pe
JOIN products_database pa ON pe.product_a_id = pa.id
JOIN products_database pb ON pe.product_b_id = pb.id
WHERE pe.confidence >= 0.70
  AND pe.downvotes < 3;


-- =============================================================
-- =============================================================
-- BLOC 5 : CMS / CHATBOT V3 / STAGING (SQL 44-47)
-- =============================================================
-- =============================================================

-- SQL 44
ALTER TABLE public.vitrines_sites
  ADD COLUMN IF NOT EXISTS formule_choisie VARCHAR(20);

ALTER TABLE public.themes_sites
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

-- SQL 45
ALTER TABLE public.vitrines_medias
  ADD COLUMN IF NOT EXISTS category VARCHAR(50);

ALTER TABLE public.vitrines_medias
  ADD COLUMN IF NOT EXISTS tag VARCHAR(100);

-- SQL 46
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

-- SQL 47
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


-- =============================================================
-- =============================================================
-- BLOC 6 : COINS WALLET (Passe 38 — preparatoire)
-- =============================================================
-- =============================================================

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

NOTIFY pgrst, 'reload schema';


-- =============================================================
-- VERIFICATION FINALE
-- =============================================================
SELECT '=== VERIFICATION ===' AS status;

SELECT 'BLOC 1 - Labo' AS bloc, count(*) AS tables FROM information_schema.tables
WHERE table_name LIKE 'labo_%' AND table_schema = 'public';

SELECT 'BLOC 2 - Care' AS bloc, count(*) AS tables FROM information_schema.tables
WHERE table_name LIKE 'dentiste_pro_care%' OR table_name LIKE 'dentiste_pro_partage%';

SELECT 'BLOC 3 - Signed' AS bloc, count(*) AS tables FROM information_schema.tables
WHERE table_name = 'signed_documents';

SELECT 'BLOC 4 - Equiv' AS bloc, count(*) AS tables FROM information_schema.tables
WHERE table_name = 'product_equivalences';

SELECT 'BLOC 5 - CMS' AS bloc, count(*) AS tables FROM information_schema.tables
WHERE table_name IN ('vitrines_pages', 'staging_sites');

SELECT 'BLOC 6 - Coins' AS bloc, count(*) AS tables FROM information_schema.tables
WHERE table_name LIKE 'coins_%' OR table_name = 'user_coins_wallet' OR table_name = 'features_pricing' OR table_name = 'user_quest_progress';

SELECT '=== TOUT DEPLOYE ===' AS status;
