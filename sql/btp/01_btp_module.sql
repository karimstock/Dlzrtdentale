-- =============================================
-- JADOMI — Module Artisan BTP
-- societe_type = 'artisan_btp'
-- =============================================

-- Profil artisan
CREATE TABLE IF NOT EXISTS btp_profil (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid REFERENCES societes(id) ON DELETE CASCADE,
  slug text UNIQUE NOT NULL,
  metier text NOT NULL,
  nom_entreprise text NOT NULL,
  description text,
  logo_url text,
  adresse text,
  code_postal text,
  ville text,
  telephone text,
  email_contact text,
  zone_intervention_km integer DEFAULT 30,
  numero_siret text,
  numero_assurance_decennale text,
  assureur text,
  certifications text[] DEFAULT '{}',
  tva_travaux_renovation decimal DEFAULT 10,
  tva_travaux_neuf decimal DEFAULT 20,
  taux_horaire_default decimal,
  note_moyenne decimal DEFAULT 0,
  nb_avis integer DEFAULT 0,
  actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Ouvriers / équipe
CREATE TABLE IF NOT EXISTS btp_ouvriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES btp_profil(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  nom text NOT NULL,
  prenom text,
  photo_url text,
  metier text,
  taux_horaire decimal,
  telephone text,
  actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Clients
CREATE TABLE IF NOT EXISTS btp_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES btp_profil(id) ON DELETE CASCADE,
  type_client text DEFAULT 'particulier'
    CHECK (type_client IN ('particulier','professionnel','copropriete','collectivite')),
  nom text NOT NULL,
  prenom text,
  raison_sociale text,
  siren text,
  email text,
  telephone text,
  adresse text,
  code_postal text,
  ville text,
  notes text,
  nb_chantiers integer DEFAULT 0,
  ca_total decimal DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Chantiers
CREATE TABLE IF NOT EXISTS btp_chantiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES btp_profil(id) ON DELETE CASCADE,
  reference text NOT NULL,
  client_id uuid REFERENCES btp_clients(id),
  adresse_chantier text NOT NULL,
  cp_chantier text,
  ville_chantier text,
  type_travaux text NOT NULL,
  description text,
  date_debut date,
  date_fin_prevue date,
  date_fin_reelle date,
  duree_estimee_heures decimal,
  duree_reelle_heures decimal,
  ouvriers_ids uuid[] DEFAULT '{}',
  statut text DEFAULT 'a_planifier' CHECK (statut IN (
    'a_planifier','planifie','en_cours','termine','facture','annule'
  )),
  devis_id uuid,
  facture_id uuid,
  photos_avant_urls text[] DEFAULT '{}',
  photos_apres_urls text[] DEFAULT '{}',
  notes_techniques text,
  type_logement text CHECK (type_logement IN ('neuf','renovation_plus_2ans','renovation_moins_2ans')),
  annee_construction integer,
  cout_materiaux decimal DEFAULT 0,
  cout_main_oeuvre decimal DEFAULT 0,
  marge decimal DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(profil_id, reference)
);

-- Devis BTP
CREATE TABLE IF NOT EXISTS btp_devis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES btp_profil(id) ON DELETE CASCADE,
  chantier_id uuid REFERENCES btp_chantiers(id),
  client_id uuid REFERENCES btp_clients(id),
  numero_devis text NOT NULL,
  date_devis date NOT NULL DEFAULT current_date,
  date_validite date,
  lignes_main_oeuvre jsonb DEFAULT '[]',
  lignes_fournitures jsonb DEFAULT '[]',
  lignes_deplacement jsonb DEFAULT '[]',
  sous_total_mo decimal DEFAULT 0,
  sous_total_fournitures decimal DEFAULT 0,
  sous_total_deplacement decimal DEFAULT 0,
  remise_pct decimal DEFAULT 0,
  remise_montant decimal DEFAULT 0,
  total_ht decimal NOT NULL DEFAULT 0,
  tva_10 decimal DEFAULT 0,
  tva_20 decimal DEFAULT 0,
  total_tva decimal NOT NULL DEFAULT 0,
  total_ttc decimal NOT NULL DEFAULT 0,
  acompte_pct decimal DEFAULT 30,
  acompte_montant decimal DEFAULT 0,
  numero_assurance text,
  mentions_legales text,
  statut text DEFAULT 'brouillon' CHECK (statut IN (
    'brouillon','envoye','signe','accepte','refuse','expire'
  )),
  signature_client_url text,
  signature_date timestamptz,
  pdf_url text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(profil_id, numero_devis)
);

-- Factures BTP (avec situations de travaux)
CREATE TABLE IF NOT EXISTS btp_factures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES btp_profil(id) ON DELETE CASCADE,
  chantier_id uuid REFERENCES btp_chantiers(id),
  client_id uuid REFERENCES btp_clients(id),
  devis_id uuid REFERENCES btp_devis(id),
  numero_facture text NOT NULL,
  date_facture date NOT NULL DEFAULT current_date,
  date_echeance date,
  type_facture text DEFAULT 'finale' CHECK (type_facture IN (
    'acompte','situation','finale','avoir'
  )),
  numero_situation integer,
  pct_avancement integer,
  lignes jsonb NOT NULL DEFAULT '[]',
  total_ht decimal NOT NULL DEFAULT 0,
  tva_10 decimal DEFAULT 0,
  tva_20 decimal DEFAULT 0,
  total_tva decimal NOT NULL DEFAULT 0,
  total_ttc decimal NOT NULL DEFAULT 0,
  acomptes_verses decimal DEFAULT 0,
  net_a_payer decimal NOT NULL DEFAULT 0,
  statut text DEFAULT 'brouillon' CHECK (statut IN (
    'brouillon','envoyee','payee','partiellement_payee','en_retard','annulee'
  )),
  date_paiement date,
  mode_paiement text,
  pdf_url text,
  relance_1_at timestamptz,
  relance_2_at timestamptz,
  relance_3_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(profil_id, numero_facture)
);

-- Rapports d'intervention
CREATE TABLE IF NOT EXISTS btp_rapports_intervention (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES btp_profil(id) ON DELETE CASCADE,
  chantier_id uuid REFERENCES btp_chantiers(id),
  ouvrier_id uuid REFERENCES btp_ouvriers(id),
  date_intervention date NOT NULL DEFAULT current_date,
  heure_debut time,
  heure_fin time,
  duree_heures decimal,
  travaux_effectues text NOT NULL,
  materiaux_utilises jsonb DEFAULT '[]',
  observations text,
  photos_urls text[] DEFAULT '{}',
  signature_client_url text,
  signature_date timestamptz,
  pdf_url text,
  created_at timestamptz DEFAULT now()
);

-- Stock matériaux
CREATE TABLE IF NOT EXISTS btp_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES btp_profil(id) ON DELETE CASCADE,
  categorie text,
  sous_categorie text,
  reference text,
  designation text NOT NULL,
  unite text DEFAULT 'unité',
  quantite decimal DEFAULT 0,
  seuil_alerte decimal DEFAULT 5,
  prix_achat_ht decimal,
  prix_vente_ht decimal,
  fournisseur text,
  code_barres text,
  emplacement text,
  actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Mouvements de stock
CREATE TABLE IF NOT EXISTS btp_stock_mouvements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id uuid REFERENCES btp_stock(id) ON DELETE CASCADE,
  profil_id uuid REFERENCES btp_profil(id),
  chantier_id uuid REFERENCES btp_chantiers(id),
  type text NOT NULL CHECK (type IN ('entree','sortie','retour','inventaire')),
  quantite decimal NOT NULL,
  motif text,
  created_at timestamptz DEFAULT now()
);

-- Demandes de devis publiques
CREATE TABLE IF NOT EXISTS btp_demandes_devis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES btp_profil(id) ON DELETE CASCADE,
  client_nom text NOT NULL,
  client_email text NOT NULL,
  client_telephone text,
  adresse_chantier text,
  type_travaux text,
  description text,
  photos_urls text[] DEFAULT '{}',
  urgence text DEFAULT 'normale' CHECK (urgence IN ('normale','urgente','tres_urgente')),
  statut text DEFAULT 'nouvelle' CHECK (statut IN ('nouvelle','vue','devis_envoye','accepte','refuse')),
  created_at timestamptz DEFAULT now()
);

-- Avis clients
CREATE TABLE IF NOT EXISTS btp_avis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES btp_profil(id) ON DELETE CASCADE,
  chantier_id uuid REFERENCES btp_chantiers(id),
  client_nom text,
  note integer CHECK (note BETWEEN 1 AND 5),
  commentaire text,
  reponse_pro text,
  visible boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Comptabilité charges
CREATE TABLE IF NOT EXISTS btp_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES btp_profil(id) ON DELETE CASCADE,
  categorie text NOT NULL,
  designation text NOT NULL,
  montant decimal NOT NULL,
  tva_pct decimal DEFAULT 20,
  tva_montant decimal DEFAULT 0,
  date_charge date NOT NULL DEFAULT current_date,
  fournisseur text,
  reference_facture text,
  chantier_id uuid REFERENCES btp_chantiers(id),
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE btp_profil ENABLE ROW LEVEL SECURITY;
ALTER TABLE btp_ouvriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE btp_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE btp_chantiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE btp_devis ENABLE ROW LEVEL SECURITY;
ALTER TABLE btp_factures ENABLE ROW LEVEL SECURITY;
ALTER TABLE btp_rapports_intervention ENABLE ROW LEVEL SECURITY;
ALTER TABLE btp_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE btp_stock_mouvements ENABLE ROW LEVEL SECURITY;
ALTER TABLE btp_demandes_devis ENABLE ROW LEVEL SECURITY;
ALTER TABLE btp_avis ENABLE ROW LEVEL SECURITY;
ALTER TABLE btp_charges ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$ BEGIN
  CREATE POLICY btp_profil_policy ON btp_profil
    FOR ALL USING (public.is_member_of_societe(societe_id))
    WITH CHECK (public.is_member_of_societe(societe_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY btp_ouvriers_policy ON btp_ouvriers
    FOR ALL USING (EXISTS (SELECT 1 FROM btp_profil p WHERE p.id = btp_ouvriers.profil_id AND public.is_member_of_societe(p.societe_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY btp_clients_policy ON btp_clients
    FOR ALL USING (EXISTS (SELECT 1 FROM btp_profil p WHERE p.id = btp_clients.profil_id AND public.is_member_of_societe(p.societe_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY btp_chantiers_policy ON btp_chantiers
    FOR ALL USING (EXISTS (SELECT 1 FROM btp_profil p WHERE p.id = btp_chantiers.profil_id AND public.is_member_of_societe(p.societe_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY btp_devis_policy ON btp_devis
    FOR ALL USING (EXISTS (SELECT 1 FROM btp_profil p WHERE p.id = btp_devis.profil_id AND public.is_member_of_societe(p.societe_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY btp_factures_policy ON btp_factures
    FOR ALL USING (EXISTS (SELECT 1 FROM btp_profil p WHERE p.id = btp_factures.profil_id AND public.is_member_of_societe(p.societe_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY btp_rapports_policy ON btp_rapports_intervention
    FOR ALL USING (EXISTS (SELECT 1 FROM btp_profil p WHERE p.id = btp_rapports_intervention.profil_id AND public.is_member_of_societe(p.societe_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY btp_stock_policy ON btp_stock
    FOR ALL USING (EXISTS (SELECT 1 FROM btp_profil p WHERE p.id = btp_stock.profil_id AND public.is_member_of_societe(p.societe_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY btp_stock_mvts_policy ON btp_stock_mouvements
    FOR ALL USING (EXISTS (SELECT 1 FROM btp_profil p WHERE p.id = btp_stock_mouvements.profil_id AND public.is_member_of_societe(p.societe_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY btp_demandes_policy ON btp_demandes_devis
    FOR ALL USING (EXISTS (SELECT 1 FROM btp_profil p WHERE p.id = btp_demandes_devis.profil_id AND public.is_member_of_societe(p.societe_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY btp_avis_policy ON btp_avis
    FOR ALL USING (EXISTS (SELECT 1 FROM btp_profil p WHERE p.id = btp_avis.profil_id AND public.is_member_of_societe(p.societe_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY btp_charges_policy ON btp_charges
    FOR ALL USING (EXISTS (SELECT 1 FROM btp_profil p WHERE p.id = btp_charges.profil_id AND public.is_member_of_societe(p.societe_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Index performances
CREATE INDEX IF NOT EXISTS idx_btp_chantiers_date ON btp_chantiers(profil_id, date_debut, statut);
CREATE INDEX IF NOT EXISTS idx_btp_chantiers_ref ON btp_chantiers(profil_id, reference);
CREATE INDEX IF NOT EXISTS idx_btp_factures_statut ON btp_factures(profil_id, statut);
CREATE INDEX IF NOT EXISTS idx_btp_devis_statut ON btp_devis(profil_id, statut);
CREATE INDEX IF NOT EXISTS idx_btp_profil_slug ON btp_profil(slug);
CREATE INDEX IF NOT EXISTS idx_btp_stock_profil ON btp_stock(profil_id, actif);
CREATE INDEX IF NOT EXISTS idx_btp_rapports_date ON btp_rapports_intervention(profil_id, date_intervention);
