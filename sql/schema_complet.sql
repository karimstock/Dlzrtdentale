-- =====================================================================
-- JADOMI — Schéma complet plateforme Dentiste ↔ Prothésiste
-- À exécuter dans Supabase SQL editor APRÈS sql/rush_schema.sql
-- =====================================================================
-- RÈGLES :
--  - Anonymat total (jadomi_id JADOMI-XXXXXXXX, jamais nom)
--  - Adresse exacte chiffrée AES-256-GCM côté serveur
--  - QR token : expire 48h + invalidé après premier scan
--  - Commission JADOMI = 10% sur tarif travaux uniquement (jamais livraison)
--  - Niveaux : standard / confirme / expert (upgrade automatique selon notes)
-- =====================================================================

-- ----- ALTER : extensions de la table prothesistes existante (rush_schema) -----
ALTER TABLE prothesistes ADD COLUMN IF NOT EXISTS jadomi_id VARCHAR(20) UNIQUE;
ALTER TABLE prothesistes ADD COLUMN IF NOT EXISTS nom_labo VARCHAR(200);
ALTER TABLE prothesistes ADD COLUMN IF NOT EXISTS label TEXT DEFAULT 'made_in_france' CHECK (label IN ('made_in_france','import','mixte'));
ALTER TABLE prothesistes ADD COLUMN IF NOT EXISTS niveau TEXT DEFAULT 'standard' CHECK (niveau IN ('standard','confirme','expert'));
ALTER TABLE prothesistes ADD COLUMN IF NOT EXISTS nombre_avis INTEGER DEFAULT 0;
ALTER TABLE prothesistes ADD COLUMN IF NOT EXISTS nombre_travaux INTEGER DEFAULT 0;
ALTER TABLE prothesistes ADD COLUMN IF NOT EXISTS tarif_multiplicateur NUMERIC(3,2) DEFAULT 1.0;
ALTER TABLE prothesistes ADD COLUMN IF NOT EXISTS actif BOOLEAN DEFAULT TRUE;
ALTER TABLE prothesistes ADD COLUMN IF NOT EXISTS tarifs_acceptes BOOLEAN DEFAULT FALSE;
ALTER TABLE prothesistes ADD COLUMN IF NOT EXISTS tarifs_acceptes_at TIMESTAMPTZ;


-- ----- Dentistes -----
CREATE TABLE IF NOT EXISTS dentistes (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  jadomi_id VARCHAR(20) UNIQUE,
  nom VARCHAR(200),
  email VARCHAR(200) UNIQUE,
  ville VARCHAR(100),
  cp VARCHAR(10),
  adresse_chiffree TEXT,
  actif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dentistes_jadomi ON dentistes(jadomi_id);


-- ----- Catalogue de référence des travaux JADOMI (fourchettes officielles) -----
CREATE TABLE IF NOT EXISTS travaux_catalogue (
  id SERIAL PRIMARY KEY,
  categorie VARCHAR(100),
  nom VARCHAR(200),
  tarif_min NUMERIC(10,2),
  tarif_max NUMERIC(10,2),
  tarif_reference NUMERIC(10,2),
  delai_jours_standard INTEGER DEFAULT 5,
  delai_jours_expert INTEGER DEFAULT 3
);


-- ----- Commandes dentiste → prothésiste -----
CREATE TABLE IF NOT EXISTS commandes (
  id BIGSERIAL PRIMARY KEY,
  reference VARCHAR(20) UNIQUE,
  dentiste_id BIGINT REFERENCES dentistes(id),
  prothesiste_id BIGINT REFERENCES prothesistes(id),
  travaux JSONB,
  tarif_travaux NUMERIC(10,2),
  tarif_livraison NUMERIC(10,2),
  tarif_total NUMERIC(10,2),
  commission_jadomi NUMERIC(10,2),
  tarif_net_prothesiste NUMERIC(10,2),
  transporteur VARCHAR(100),
  qr_token UUID DEFAULT gen_random_uuid() UNIQUE,
  qr_expire_at TIMESTAMPTZ,
  qr_scanne BOOLEAN DEFAULT FALSE,
  adresse_livraison_chiffree TEXT,
  ville_livraison VARCHAR(100),
  cp_livraison VARCHAR(10),
  statut TEXT DEFAULT 'en_attente' CHECK (statut IN ('en_attente','acceptee','en_cours','expedie','livre','note','litige')),
  note_dentiste INTEGER CHECK (note_dentiste BETWEEN 1 AND 5),
  commentaire_dentiste TEXT,
  stl_url TEXT,
  delai_jours INTEGER,
  notif_lue BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_commandes_proth ON commandes(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_commandes_dent ON commandes(dentiste_id);
CREATE INDEX IF NOT EXISTS idx_commandes_token ON commandes(qr_token);
CREATE INDEX IF NOT EXISTS idx_commandes_statut ON commandes(statut);


-- ----- Notifications upgrade prothésiste -----
CREATE TABLE IF NOT EXISTS notifications_upgrade (
  id BIGSERIAL PRIMARY KEY,
  prothesiste_id BIGINT REFERENCES prothesistes(id),
  ancien_niveau TEXT,
  nouveau_niveau TEXT,
  message TEXT,
  lue BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_upgrade_proth ON notifications_upgrade(prothesiste_id);


-- ----- Stock matériaux prothésiste -----
CREATE TABLE IF NOT EXISTS stock_materiaux (
  id BIGSERIAL PRIMARY KEY,
  prothesiste_id BIGINT REFERENCES prothesistes(id),
  nom VARCHAR(200),
  categorie VARCHAR(100),
  quantite NUMERIC(10,2),
  unite VARCHAR(20),
  seuil_alerte NUMERIC(10,2),
  fournisseur VARCHAR(200),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_proth ON stock_materiaux(prothesiste_id);


-- ----- Catalogue tarifs propre au prothésiste (lié à travaux_catalogue) -----
CREATE TABLE IF NOT EXISTS catalogue_tarifs_prothesiste (
  id BIGSERIAL PRIMARY KEY,
  prothesiste_id BIGINT REFERENCES prothesistes(id),
  travail_id INTEGER REFERENCES travaux_catalogue(id),
  tarif_propose NUMERIC(10,2),
  actif BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(prothesiste_id, travail_id)
);


-- ----- Factures (commandes ↔ prothésiste) -----
CREATE TABLE IF NOT EXISTS factures (
  id BIGSERIAL PRIMARY KEY,
  reference VARCHAR(20) UNIQUE,
  prothesiste_id BIGINT REFERENCES prothesistes(id),
  commande_id BIGINT REFERENCES commandes(id),
  montant NUMERIC(10,2),
  statut VARCHAR(20) DEFAULT 'en_attente',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_factures_proth ON factures(prothesiste_id);


-- =====================================================================
-- Catalogue de référence JADOMI (fourchettes tarifaires officielles)
-- =====================================================================
INSERT INTO travaux_catalogue (categorie, nom, tarif_min, tarif_max, tarif_reference, delai_jours_standard, delai_jours_expert) VALUES
('Prothèse fixe','Couronne céramo-métallique',90,140,115,5,3),
('Prothèse fixe','Couronne tout céramique',130,180,155,5,3),
('Prothèse fixe','Couronne zircone',150,220,185,6,4),
('Prothèse fixe','Couronne provisoire',20,35,28,2,1),
('Prothèse fixe','Bridge 3 éléments',250,380,315,7,5),
('Prothèse fixe','Bridge 4 éléments',320,480,400,8,5),
('Prothèse fixe','Inlay/Onlay résine',60,90,75,4,2),
('Prothèse fixe','Inlay/Onlay céramique',80,130,105,5,3),
('Prothèse fixe','Facette céramique',120,180,150,6,4),
('Prothèse fixe','Couronne sur implant',140,200,170,6,4),
('Prothèse fixe','Faux moignon',30,50,40,2,1),
('Prothèse amovible','Prothèse partielle résine 1-4 dents',90,130,110,5,3),
('Prothèse amovible','Prothèse partielle résine 5-8 dents',130,180,155,6,4),
('Prothèse amovible','Prothèse complète dentier',80,130,105,7,5),
('Prothèse amovible','Stellite 1-4 dents',180,250,215,7,5),
('Prothèse amovible','Stellite 5-8 dents',220,320,270,8,6),
('Prothèse amovible','Gouttière occlusale',60,100,80,3,2),
('Orthodontie','Gouttière thermoformée',40,70,55,3,2),
('Orthodontie','Retainer fixe',50,80,65,4,3),
('Orthodontie','Retainer amovible',60,90,75,4,3),
('Orthodontie','Disjoncteur',90,140,115,7,5),
('Implantologie','Pilier implantaire',80,130,105,5,3),
('Implantologie','Couronne implant vissée',150,220,185,6,4),
('Implantologie','Guide chirurgical',120,180,150,5,3),
('Implantologie','Wax-up implant',80,130,105,4,3),
('Esthétique','Wax-up diagnostique',70,120,95,4,3),
('Esthétique','Mock-up',60,100,80,3,2),
('Esthétique','Smile design',100,160,130,5,3),
('Réparation','Réparation prothèse',45,80,62,2,1),
('Réparation','Rebasage',55,90,72,3,2),
('Réparation','Adjonction dent',40,65,52,2,1),
('Réparation','Soudure',30,50,40,2,1),
('Pédiatrie','Couronne pédiatrique',60,100,80,4,3),
('Pédiatrie','Mainteneur espace',70,110,90,4,3),
('Pédiatrie','Gouttière pédiatrique',40,70,55,3,2)
ON CONFLICT DO NOTHING;
