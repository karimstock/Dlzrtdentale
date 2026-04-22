-- =============================================
-- JADOMI — Migration 28 — Prise de RDV en ligne
-- Passe 24 (22-23 avril 2026)
-- =============================================

-- Types de consultation
CREATE TABLE IF NOT EXISTS appointment_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES vitrines_sites(id) ON DELETE CASCADE,
  name text NOT NULL,
  duration_min int DEFAULT 60,
  price_eur numeric,
  mode text DEFAULT 'presentiel' CHECK (mode IN ('presentiel','visio','telephone','hybride')),
  description text,
  enabled boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Creneaux de disponibilite
CREATE TABLE IF NOT EXISTS availability_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES vitrines_sites(id) ON DELETE CASCADE,
  day_of_week int CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  recurring boolean DEFAULT true,
  specific_date date,
  enabled boolean DEFAULT true
);

-- RDV pris
CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES vitrines_sites(id) ON DELETE CASCADE,
  appointment_type_id uuid REFERENCES appointment_types(id),
  client_name text NOT NULL,
  client_email text NOT NULL,
  client_phone text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  status text DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled','completed','no_show')),
  notes text,
  reminded_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Buffer entre RDV (configurable par site)
CREATE TABLE IF NOT EXISTS appointment_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES vitrines_sites(id) ON DELETE CASCADE,
  buffer_minutes int DEFAULT 15,
  max_daily_appointments int DEFAULT 10,
  auto_confirm boolean DEFAULT true,
  reminder_hours_before int DEFAULT 24,
  UNIQUE(site_id)
);

CREATE INDEX IF NOT EXISTS idx_appointments_site ON appointments(site_id);
CREATE INDEX IF NOT EXISTS idx_appointments_time ON appointments(start_time);
CREATE INDEX IF NOT EXISTS idx_availability_site ON availability_slots(site_id);
CREATE INDEX IF NOT EXISTS idx_appointment_types_site ON appointment_types(site_id);
