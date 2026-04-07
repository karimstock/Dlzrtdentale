-- =====================================================================
-- JADOMI — Schéma SQL Prothésistes + Module Rush / Sous-traitance
-- À exécuter manuellement dans le dashboard Supabase (SQL editor).
-- =====================================================================
-- RÈGLES :
--  - Anonymat total entre prothésistes (jamais de nom/email/téléphone partagé)
--  - L'adresse exacte est chiffrée AES-256-GCM côté serveur (colonne adresse_chiffree)
--  - Seules ville + code postal + pays sont visibles côté JADOMI IA
--  - Commission JADOMI = 10% sur travaux uniquement (pas sur la livraison)
--  - Badge made_in: 'FR' (Made in France) ou 'IMPORT'
-- =====================================================================


-- ----- 1. Profil prothésiste (anonyme côté communauté) -----
CREATE TABLE IF NOT EXISTS prothesistes (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,                          -- lien Supabase auth.users
  pseudo_anonyme TEXT NOT NULL,          -- ex: "PROTH-A1B2" (jamais de vrai nom)
  raison_sociale TEXT,                   -- visible uniquement par le prothésiste lui-même
  email TEXT,                            -- jamais exposé aux confrères
  ville TEXT,
  code_postal TEXT,
  pays TEXT DEFAULT 'FR',
  made_in TEXT DEFAULT 'FR' CHECK (made_in IN ('FR','IMPORT')),
  specialites TEXT[],                    -- ex: {'zircone','ceramique','resine'}
  note_moyenne NUMERIC(3,2) DEFAULT 5.00,
  nb_rush_realises INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prothesistes_user ON prothesistes(user_id);
CREATE INDEX IF NOT EXISTS idx_prothesistes_ville ON prothesistes(ville);


-- ----- 2. Demandes Rush (un prothésiste sous-traite à un autre) -----
CREATE TABLE IF NOT EXISTS rush_demandes (
  id BIGSERIAL PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,            -- token public anonyme (UUID hex)
  demandeur_id BIGINT REFERENCES prothesistes(id) ON DELETE CASCADE,
  type_travail TEXT NOT NULL,            -- ex: 'couronne_zircone'
  description TEXT,
  matiere TEXT,                          -- zircone / ceramique / alliage / resine / cire
  quantite INTEGER DEFAULT 1,
  delai_jours INTEGER DEFAULT 3,
  tarif_propose NUMERIC(10,2),           -- HT, hors livraison
  commission_jadomi NUMERIC(10,2),       -- 10% sur tarif_propose
  livraison_estimee NUMERIC(10,2),       -- estimée par JADOMI IA
  ville_depart TEXT,
  cp_depart TEXT,
  ville_arrivee TEXT,                    -- rempli quand match
  cp_arrivee TEXT,
  -- ADRESSE EXACTE CHIFFRÉE AES-256-GCM (jamais en clair, jamais loggée)
  adresse_chiffree_depart TEXT,          -- format: iv:authTag:ciphertext (hex)
  adresse_chiffree_arrivee TEXT,
  stl_path TEXT,                         -- chemin serveur du fichier STL
  stl_filename TEXT,
  made_in_demandeur TEXT CHECK (made_in_demandeur IN ('FR','IMPORT')),
  statut TEXT DEFAULT 'ouverte' CHECK (statut IN ('ouverte','attribuee','en_cours','livree','annulee')),
  preneur_id BIGINT REFERENCES prothesistes(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rush_demandes_token ON rush_demandes(token);
CREATE INDEX IF NOT EXISTS idx_rush_demandes_statut ON rush_demandes(statut);
CREATE INDEX IF NOT EXISTS idx_rush_demandes_demandeur ON rush_demandes(demandeur_id);


-- ----- 3. Offres / réponses sur une demande Rush -----
CREATE TABLE IF NOT EXISTS rush_offres (
  id BIGSERIAL PRIMARY KEY,
  rush_id BIGINT REFERENCES rush_demandes(id) ON DELETE CASCADE,
  prothesiste_id BIGINT REFERENCES prothesistes(id) ON DELETE CASCADE,
  pseudo_anonyme TEXT,                   -- copie pour anonymat
  tarif NUMERIC(10,2),
  delai_jours INTEGER,
  message TEXT,
  made_in TEXT CHECK (made_in IN ('FR','IMPORT')),
  statut TEXT DEFAULT 'proposee' CHECK (statut IN ('proposee','acceptee','refusee')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rush_offres_rush ON rush_offres(rush_id);


-- ----- 4. Étiquettes QR transporteur (révèlent l'adresse au scan uniquement) -----
CREATE TABLE IF NOT EXISTS rush_etiquettes (
  id BIGSERIAL PRIMARY KEY,
  rush_id BIGINT REFERENCES rush_demandes(id) ON DELETE CASCADE,
  token_qr TEXT UNIQUE NOT NULL,         -- token QR scanné par transporteur
  sens TEXT CHECK (sens IN ('aller','retour')),
  scanne BOOLEAN DEFAULT FALSE,
  date_scan TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rush_etiquettes_token ON rush_etiquettes(token_qr);


-- ----- 5. Commandes prothésiste (travaux reçus des dentistes) -----
CREATE TABLE IF NOT EXISTS prothesiste_commandes (
  id BIGSERIAL PRIMARY KEY,
  prothesiste_id BIGINT REFERENCES prothesistes(id) ON DELETE CASCADE,
  cabinet_nom TEXT,                      -- nom du cabinet dentiste
  dentiste_nom TEXT,
  patient_ref TEXT,                      -- référence anonymisée patient
  type_travail TEXT,                     -- couronne, bridge, inlay, etc.
  matiere TEXT,
  teinte TEXT,
  quantite INTEGER DEFAULT 1,
  date_reception DATE DEFAULT CURRENT_DATE,
  date_livraison_prevue DATE,
  statut TEXT DEFAULT 'recue' CHECK (statut IN ('recue','en_cours','terminee','livree','facturee')),
  prix_ht NUMERIC(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proth_cmd_prot ON prothesiste_commandes(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_proth_cmd_statut ON prothesiste_commandes(statut);


-- ----- 6. Stock matériaux prothésiste -----
CREATE TABLE IF NOT EXISTS prothesiste_stock (
  id BIGSERIAL PRIMARY KEY,
  prothesiste_id BIGINT REFERENCES prothesistes(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,                     -- ex: 'Disque zircone Multilayer A2'
  categorie TEXT,                        -- zircone | ceramique | alliage | resine | cire
  quantite NUMERIC(10,2) DEFAULT 0,
  unite TEXT DEFAULT 'unite',            -- unite, gramme, ml, disque
  seuil NUMERIC(10,2) DEFAULT 1,
  fournisseur TEXT,
  prix_unitaire NUMERIC(10,2),
  date_peremption DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proth_stock_prot ON prothesiste_stock(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_proth_stock_cat ON prothesiste_stock(categorie);


-- ----- 7. Factures émises par le prothésiste vers les dentistes -----
CREATE TABLE IF NOT EXISTS prothesiste_factures (
  id BIGSERIAL PRIMARY KEY,
  prothesiste_id BIGINT REFERENCES prothesistes(id) ON DELETE CASCADE,
  numero TEXT NOT NULL,
  cabinet_nom TEXT,
  dentiste_nom TEXT,
  date_emission DATE DEFAULT CURRENT_DATE,
  date_echeance DATE,
  montant_ht NUMERIC(10,2),
  tva_pct NUMERIC(5,2) DEFAULT 20,
  montant_ttc NUMERIC(10,2),
  statut TEXT DEFAULT 'emise' CHECK (statut IN ('emise','envoyee','payee','retard','annulee')),
  date_paiement DATE,
  lignes JSONB,                          -- [{designation, quantite, prix_unitaire, total}]
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proth_fact_prot ON prothesiste_factures(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_proth_fact_statut ON prothesiste_factures(statut);


-- ----- 8. Catalogue tarifs propre au prothésiste -----
CREATE TABLE IF NOT EXISTS prothesiste_tarifs (
  id BIGSERIAL PRIMARY KEY,
  prothesiste_id BIGINT REFERENCES prothesistes(id) ON DELETE CASCADE,
  type_travail TEXT NOT NULL,            -- 'Couronne zircone monolithique'
  matiere TEXT,
  prix_ht NUMERIC(10,2),
  delai_jours INTEGER DEFAULT 5,
  description TEXT,
  actif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proth_tarifs_prot ON prothesiste_tarifs(prothesiste_id);


-- =====================================================================
-- RLS minimal (à raffiner selon politique Supabase utilisée)
-- =====================================================================
ALTER TABLE prothesistes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rush_demandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rush_offres ENABLE ROW LEVEL SECURITY;
ALTER TABLE rush_etiquettes ENABLE ROW LEVEL SECURITY;
ALTER TABLE prothesiste_commandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE prothesiste_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE prothesiste_factures ENABLE ROW LEVEL SECURITY;
ALTER TABLE prothesiste_tarifs ENABLE ROW LEVEL SECURITY;

-- Lecture publique anonyme des demandes ouvertes (sans adresse chiffrée exposée
-- côté client : la colonne adresse_chiffree_* n'est jamais renvoyée par les
-- routes API, qui filtrent les champs explicitement).
DROP POLICY IF EXISTS "rush_demandes_read_open" ON rush_demandes;
CREATE POLICY "rush_demandes_read_open" ON rush_demandes
  FOR SELECT USING (statut = 'ouverte');
