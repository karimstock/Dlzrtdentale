-- =============================================
-- JADOMI — Rappels automatiques patients (Passe 70)
-- Email + SMS pour toutes professions
-- =============================================

-- Configuration des rappels par société
CREATE TABLE IF NOT EXISTS rappels_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('email','sms','both')),
  declencheur TEXT NOT NULL CHECK (declencheur IN ('rdv_j2','rdv_j1','rdv_h2','post_soin_j1','recall_6mois','recall_1an','anniversaire','avis_google','ordonnance_expiration','custom')),
  actif BOOLEAN DEFAULT true,
  template_sujet TEXT,
  template_corps TEXT,
  delai_minutes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Historique des envois
CREATE TABLE IF NOT EXISTS rappels_envois (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rappel_config_id UUID REFERENCES rappels_config(id),
  societe_id UUID NOT NULL,
  patient_email TEXT,
  patient_telephone TEXT,
  patient_nom TEXT,
  type TEXT NOT NULL CHECK (type IN ('email','sms')),
  statut TEXT DEFAULT 'envoye' CHECK (statut IN ('programme','envoye','echoue','annule')),
  rdv_id UUID,
  contenu TEXT,
  envoye_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Portefeuille SMS par société
CREATE TABLE IF NOT EXISTS sms_wallet (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL UNIQUE,
  credits_sms INTEGER DEFAULT 0,
  total_achete INTEGER DEFAULT 0,
  total_envoye INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Packs SMS disponibles
CREATE TABLE IF NOT EXISTS sms_packs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nom TEXT NOT NULL,
  credits INTEGER NOT NULL,
  prix_eur NUMERIC(8,2) NOT NULL,
  prix_unitaire_eur NUMERIC(8,4) NOT NULL,
  populaire BOOLEAN DEFAULT false
);

-- Seed SMS packs
INSERT INTO sms_packs (nom, credits, prix_eur, prix_unitaire_eur, populaire) VALUES
('Découverte', 100, 8, 0.08, false),
('Standard', 500, 35, 0.07, true),
('Pro', 1000, 59, 0.059, false),
('Volume', 5000, 249, 0.0498, false)
ON CONFLICT DO NOTHING;

-- Index de performance
CREATE INDEX IF NOT EXISTS idx_rappels_config_societe ON rappels_config(societe_id);
CREATE INDEX IF NOT EXISTS idx_rappels_envois_societe ON rappels_envois(societe_id);
CREATE INDEX IF NOT EXISTS idx_rappels_envois_statut ON rappels_envois(statut);
CREATE INDEX IF NOT EXISTS idx_rappels_envois_rdv ON rappels_envois(rdv_id);
CREATE INDEX IF NOT EXISTS idx_rappels_envois_config ON rappels_envois(rappel_config_id);

-- =============================================
-- Push Notifications & Cascade d'escalade
-- =============================================

-- Abonnements push notification (RGPD : opt-in uniquement)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  patient_email TEXT,
  patient_telephone TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_sub_email ON push_subscriptions(patient_email);
CREATE INDEX IF NOT EXISTS idx_push_sub_tel ON push_subscriptions(patient_telephone);

-- Colonnes escalade et tracking sur rappels_envois
ALTER TABLE rappels_envois ADD COLUMN IF NOT EXISTS escalated BOOLEAN DEFAULT false;
ALTER TABLE rappels_envois ADD COLUMN IF NOT EXISTS opened BOOLEAN DEFAULT false;
ALTER TABLE rappels_envois ADD COLUMN IF NOT EXISTS tracking_id UUID DEFAULT gen_random_uuid();
ALTER TABLE rappels_envois ADD COLUMN IF NOT EXISTS confirmed BOOLEAN DEFAULT false;

-- Index pour les requetes d'escalade (envois non ouverts apres 6h)
CREATE INDEX IF NOT EXISTS idx_rappels_envois_escalade
  ON rappels_envois(statut, type, escalated, envoye_at)
  WHERE statut = 'envoye' AND type = 'email' AND escalated = false;

-- Ajout du type 'push' dans la contrainte de type si pas deja present
-- (On recree la contrainte pour supporter email/sms/push)
ALTER TABLE rappels_envois DROP CONSTRAINT IF EXISTS rappels_envois_type_check;
ALTER TABLE rappels_envois ADD CONSTRAINT rappels_envois_type_check
  CHECK (type IN ('email','sms','push'));
