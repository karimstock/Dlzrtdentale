-- =============================================
-- JADOMI LABO — Maintenance machines
-- Tables pour suivi maintenance equipements labo
-- =============================================

CREATE TABLE IF NOT EXISTS labo_machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  nom TEXT NOT NULL,
  type_machine TEXT NOT NULL,
  marque TEXT, modele TEXT, numero_serie TEXT,
  date_achat DATE, fournisseur TEXT, cout_achat NUMERIC(10,2),
  frequence_maintenance_jours INTEGER DEFAULT 90,
  compteur_heures INTEGER DEFAULT 0,
  derniere_maintenance DATE, prochaine_maintenance DATE,
  photo_url TEXT, notes TEXT,
  statut TEXT DEFAULT 'actif' CHECK (statut IN ('actif','en_panne','en_maintenance','inactif')),
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labo_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES labo_machines(id) ON DELETE CASCADE,
  type_intervention TEXT DEFAULT 'preventive' CHECK (type_intervention IN ('preventive','corrective','calibration','nettoyage')),
  description TEXT, technicien TEXT, cout NUMERIC(10,2),
  pieces_remplacees TEXT, duree_minutes INTEGER,
  date_intervention TIMESTAMPTZ DEFAULT now(),
  prochaine_prevue DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_machines_prothesiste ON labo_machines(prothesiste_id);
CREATE INDEX idx_machines_prochaine ON labo_machines(prochaine_maintenance);
CREATE INDEX idx_interventions_machine ON labo_interventions(machine_id);
