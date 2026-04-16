-- ============================================
-- JADOMI ADMIN SCHEMA — comptabilite + Stripe + mailing
-- A executer dans Supabase SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS compta_factures (
  id BIGSERIAL PRIMARY KEY,
  numero VARCHAR(30) UNIQUE,
  client_jadomi_id VARCHAR(20),
  client_email VARCHAR(200),
  stripe_invoice_id VARCHAR(100),
  description TEXT,
  montant_ht NUMERIC(10,2),
  taux_tva NUMERIC(5,2) DEFAULT 20,
  montant_tva NUMERIC(10,2),
  montant_ttc NUMERIC(10,2),
  statut VARCHAR(20) DEFAULT 'en_attente',
  date_emission DATE DEFAULT CURRENT_DATE,
  date_echeance DATE,
  date_paiement DATE,
  type_operation VARCHAR(20) DEFAULT 'prestation',
  siren_client VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compta_depenses (
  id BIGSERIAL PRIMARY KEY,
  date_depense DATE DEFAULT CURRENT_DATE,
  categorie VARCHAR(100),
  description TEXT,
  montant_ht NUMERIC(10,2),
  taux_tva NUMERIC(5,2) DEFAULT 20,
  montant_tva NUMERIC(10,2),
  montant_ttc NUMERIC(10,2),
  justificatif_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mailing_campagnes (
  id BIGSERIAL PRIMARY KEY,
  sujet VARCHAR(200),
  profession_cible VARCHAR(50),
  nb_destinataires INTEGER DEFAULT 0,
  statut VARCHAR(20) DEFAULT 'envoye',
  type VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_logs (
  id BIGSERIAL PRIMARY KEY,
  action VARCHAR(100),
  cible VARCHAR(100),
  details TEXT,
  admin_email VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stripe_abonnements (
  id BIGSERIAL PRIMARY KEY,
  user_jadomi_id VARCHAR(20),
  stripe_customer_id VARCHAR(100),
  stripe_subscription_id VARCHAR(100),
  plan VARCHAR(20),
  montant NUMERIC(10,2),
  statut VARCHAR(20) DEFAULT 'actif',
  date_debut DATE,
  prochaine_echeance DATE,
  jours_retard INTEGER DEFAULT 0,
  nb_relances INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_factures_statut ON compta_factures(statut);
CREATE INDEX IF NOT EXISTS idx_factures_date ON compta_factures(date_emission);
CREATE INDEX IF NOT EXISTS idx_depenses_date ON compta_depenses(date_depense);
CREATE INDEX IF NOT EXISTS idx_abos_statut ON stripe_abonnements(statut);
