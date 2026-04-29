-- =============================================
-- JADOMI IDE — Demandes de soins patients
-- Migration 68 — Passe 68
-- =============================================

-- Table des demandes de soins provenant de patients (page publique)
CREATE TABLE IF NOT EXISTS ide_demandes_soins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  telephone TEXT NOT NULL,
  adresse TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  type_soin TEXT NOT NULL,
  ordonnance_path TEXT,
  rgpd_consent BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'en_attente' CHECK (status IN ('en_attente','notifiee','acceptee','expiree','annulee')),
  nurse_id INTEGER,
  cabinet_id INTEGER,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_demandes_soins_status ON ide_demandes_soins(status);
CREATE INDEX IF NOT EXISTS idx_demandes_soins_geo ON ide_demandes_soins(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_demandes_soins_created ON ide_demandes_soins(created_at);

-- Table des abonnements cabinets IDE (gating par formule)
CREATE TABLE IF NOT EXISTS ide_abonnements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cabinet_id INTEGER NOT NULL,
  formule TEXT NOT NULL DEFAULT 'essentiel' CHECK (formule IN ('essentiel','pro','premium')),
  prix_mensuel INTEGER NOT NULL DEFAULT 29,
  max_patients INTEGER DEFAULT 30,
  max_nurses INTEGER DEFAULT 1,
  max_acceptations_jour INTEGER DEFAULT 2,
  rayon_km INTEGER DEFAULT 5,
  delai_notification_minutes INTEGER DEFAULT 30,
  features JSONB DEFAULT '{}',
  stripe_subscription_id TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ide_abonnements_cabinet ON ide_abonnements(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_ide_abonnements_active ON ide_abonnements(active);
