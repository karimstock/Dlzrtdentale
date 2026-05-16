-- =============================================
-- JADOMI — Table agenda dentiste-pro
-- Passe 78 : agenda complet avec multi-actes,
-- copilot, check-in QR, historique
-- =============================================

CREATE TABLE IF NOT EXISTS dentiste_pro_agenda (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cabinet_id TEXT NOT NULL,

  -- Patient
  patient_nom TEXT NOT NULL,
  patient_prenom TEXT,
  patient_tel TEXT,
  patient_email TEXT,

  -- Horaire
  date_heure TIMESTAMPTZ NOT NULL,
  duree_minutes INTEGER NOT NULL DEFAULT 30,

  -- Acte principal (rétrocompat)
  categorie TEXT NOT NULL DEFAULT 'consultation',
  acte TEXT NOT NULL DEFAULT 'premiere_consultation',
  type TEXT, -- rétrocompat ancien système

  -- Multi-actes (array JSON)
  actes JSONB DEFAULT '[]'::jsonb,

  -- Copilot
  copilot_transcript TEXT,
  copilot_actes JSONB,

  -- Suivi temps réel
  statut TEXT DEFAULT 'planifie', -- planifie, arrive, en_soin, termine, absent
  heure_arrivee TIMESTAMPTZ,
  heure_debut_reelle TIMESTAMPTZ,
  heure_fin_reelle TIMESTAMPTZ,

  -- Metadata
  notes TEXT,
  couleur TEXT DEFAULT '#3B82F6',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_agenda_cabinet_date
  ON dentiste_pro_agenda (cabinet_id, date_heure);
CREATE INDEX IF NOT EXISTS idx_agenda_patient_nom
  ON dentiste_pro_agenda (patient_nom);
CREATE INDEX IF NOT EXISTS idx_agenda_statut
  ON dentiste_pro_agenda (statut);
CREATE INDEX IF NOT EXISTS idx_agenda_date
  ON dentiste_pro_agenda (date_heure);

-- RLS
ALTER TABLE dentiste_pro_agenda ENABLE ROW LEVEL SECURITY;

-- Policy : service_role a tout accès (backend)
CREATE POLICY "service_role_full_access" ON dentiste_pro_agenda
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Policy : anon peut lire pour le check-in QR (limité)
CREATE POLICY "anon_checkin_read" ON dentiste_pro_agenda
  FOR SELECT TO anon
  USING (date_heure::date = CURRENT_DATE);

CREATE POLICY "anon_checkin_update" ON dentiste_pro_agenda
  FOR UPDATE TO anon
  USING (date_heure::date = CURRENT_DATE)
  WITH CHECK (date_heure::date = CURRENT_DATE);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_agenda_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agenda_updated_at ON dentiste_pro_agenda;
CREATE TRIGGER trg_agenda_updated_at
  BEFORE UPDATE ON dentiste_pro_agenda
  FOR EACH ROW EXECUTE FUNCTION update_agenda_updated_at();
