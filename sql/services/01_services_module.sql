-- =============================================
-- JADOMI — Module Services & Marketplace
-- societe_type = 'services'
-- =============================================

CREATE TABLE IF NOT EXISTS services_profil (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid REFERENCES societes(id) ON DELETE CASCADE,
  slug text UNIQUE NOT NULL,
  metier text NOT NULL,
  sous_metier text,
  description text,
  description_courte text,
  logo_url text,
  photos_urls text[] DEFAULT '{}',
  adresse text,
  code_postal text,
  ville text,
  telephone text,
  email_contact text,
  horaires jsonb DEFAULT '{}',
  acompte_pct integer DEFAULT 30 CHECK (acompte_pct IN (10,20,30,50,100)),
  commission_jadomi_pct decimal DEFAULT 8,
  stripe_account_id text,
  note_moyenne decimal DEFAULT 0,
  nb_avis integer DEFAULT 0,
  actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services_praticiens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES services_profil(id) ON DELETE CASCADE,
  nom text NOT NULL,
  prenom text,
  photo_url text,
  specialites text[],
  actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services_disponibilites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  praticien_id uuid REFERENCES services_praticiens(id),
  profil_id uuid REFERENCES services_profil(id) ON DELETE CASCADE,
  jour_semaine integer CHECK (jour_semaine BETWEEN 0 AND 6),
  heure_debut time NOT NULL,
  heure_fin time NOT NULL,
  pause_debut time,
  pause_fin time
);

CREATE TABLE IF NOT EXISTS services_prestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES services_profil(id) ON DELETE CASCADE,
  categorie text,
  nom text NOT NULL,
  description text,
  mots_cles text[],
  duree_minutes integer NOT NULL DEFAULT 60,
  prix decimal NOT NULL,
  acompte_pct integer DEFAULT 30,
  photo_url text,
  praticiens_ids uuid[],
  actif boolean DEFAULT true,
  ordre integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES services_profil(id) ON DELETE CASCADE,
  prestation_id uuid REFERENCES services_prestations(id),
  praticien_id uuid REFERENCES services_praticiens(id),
  client_nom text NOT NULL,
  client_prenom text,
  client_email text NOT NULL,
  client_telephone text,
  client_note text,
  date_rdv date NOT NULL,
  heure_rdv time NOT NULL,
  duree_minutes integer NOT NULL,
  prix_total decimal NOT NULL,
  acompte_montant decimal NOT NULL,
  acompte_pct integer NOT NULL,
  commission_jadomi decimal NOT NULL,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_refund_id text,
  statut text DEFAULT 'en_attente' CHECK (statut IN (
    'en_attente','confirme','annule_client','annule_pro','termine','no_show'
  )),
  rappel_envoye boolean DEFAULT false,
  notes_pro text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services_liste_attente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES services_profil(id) ON DELETE CASCADE,
  prestation_id uuid REFERENCES services_prestations(id),
  date_rdv date NOT NULL,
  heure_rdv time NOT NULL,
  client_nom text NOT NULL,
  client_email text NOT NULL,
  client_telephone text,
  notifie_at timestamptz,
  expire_at timestamptz,
  confirme boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services_produits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES services_profil(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('vente','location')),
  categorie text,
  nom text NOT NULL,
  description text,
  mots_cles text[],
  prix decimal NOT NULL,
  caution decimal DEFAULT 0,
  duree_location_jours integer,
  delai_retour_heures integer DEFAULT 48,
  stock integer DEFAULT 1,
  photos_urls text[] DEFAULT '{}',
  variantes jsonb DEFAULT '[]',
  etat text DEFAULT 'neuf' CHECK (etat IN ('neuf','tres_bon','bon','correct')),
  commission_jadomi_pct decimal DEFAULT 5,
  actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services_commandes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES services_profil(id) ON DELETE CASCADE,
  produit_id uuid REFERENCES services_produits(id),
  client_nom text NOT NULL,
  client_email text NOT NULL,
  client_telephone text,
  type text NOT NULL CHECK (type IN ('achat','location')),
  prix decimal NOT NULL,
  caution decimal DEFAULT 0,
  commission_jadomi decimal NOT NULL,
  stripe_payment_intent_id text,
  statut text DEFAULT 'en_attente' CHECK (statut IN (
    'en_attente','paye','expedie','livre','retourne','annule','litige'
  )),
  date_retour_prevue date,
  date_retour_effective date,
  caution_remboursee boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services_avis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES services_profil(id) ON DELETE CASCADE,
  reservation_id uuid REFERENCES services_reservations(id),
  client_nom text,
  note integer CHECK (note BETWEEN 1 AND 5),
  commentaire text,
  reponse_pro text,
  visible boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services_ca_journalier (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES services_profil(id) ON DELETE CASCADE,
  praticien_id uuid REFERENCES services_praticiens(id),
  prestation_id uuid REFERENCES services_prestations(id),
  prestation_nom text,
  date_acte date NOT NULL DEFAULT current_date,
  prix decimal NOT NULL,
  mode_paiement text DEFAULT 'cb' CHECK (mode_paiement IN ('cb','especes','cheque','virement','acompte_jadomi')),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES services_profil(id) ON DELETE CASCADE,
  nom text NOT NULL,
  prenom text,
  email text,
  telephone text,
  date_naissance date,
  preferences text,
  allergies text,
  notes text,
  derniere_visite date,
  nb_visites integer DEFAULT 0,
  ca_total decimal DEFAULT 0,
  points_fidelite integer DEFAULT 0,
  opt_in_email boolean DEFAULT false,
  opt_in_sms boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE (profil_id, email)
);

CREATE TABLE IF NOT EXISTS services_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES services_profil(id) ON DELETE CASCADE,
  categorie text,
  designation text NOT NULL,
  reference text,
  quantite decimal DEFAULT 0,
  seuil_alerte decimal DEFAULT 5,
  prix_achat decimal,
  fournisseur text,
  code_barres text,
  date_peremption date,
  actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE services_profil ENABLE ROW LEVEL SECURITY;
ALTER TABLE services_praticiens ENABLE ROW LEVEL SECURITY;
ALTER TABLE services_disponibilites ENABLE ROW LEVEL SECURITY;
ALTER TABLE services_prestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE services_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE services_liste_attente ENABLE ROW LEVEL SECURITY;
ALTER TABLE services_produits ENABLE ROW LEVEL SECURITY;
ALTER TABLE services_commandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE services_avis ENABLE ROW LEVEL SECURITY;
ALTER TABLE services_ca_journalier ENABLE ROW LEVEL SECURITY;
ALTER TABLE services_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE services_stock ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY services_profil_policy ON services_profil
    FOR ALL USING (public.is_member_of_societe(societe_id))
    WITH CHECK (public.is_member_of_societe(societe_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY services_praticiens_policy ON services_praticiens
    FOR ALL USING (EXISTS (SELECT 1 FROM services_profil p WHERE p.id = services_praticiens.profil_id AND public.is_member_of_societe(p.societe_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY services_disponibilites_policy ON services_disponibilites
    FOR ALL USING (EXISTS (SELECT 1 FROM services_profil p WHERE p.id = services_disponibilites.profil_id AND public.is_member_of_societe(p.societe_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY services_prestations_policy ON services_prestations
    FOR ALL USING (EXISTS (SELECT 1 FROM services_profil p WHERE p.id = services_prestations.profil_id AND public.is_member_of_societe(p.societe_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY services_reservations_policy ON services_reservations
    FOR ALL USING (EXISTS (SELECT 1 FROM services_profil p WHERE p.id = services_reservations.profil_id AND public.is_member_of_societe(p.societe_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY services_liste_attente_policy ON services_liste_attente
    FOR ALL USING (EXISTS (SELECT 1 FROM services_profil p WHERE p.id = services_liste_attente.profil_id AND public.is_member_of_societe(p.societe_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY services_produits_policy ON services_produits
    FOR ALL USING (EXISTS (SELECT 1 FROM services_profil p WHERE p.id = services_produits.profil_id AND public.is_member_of_societe(p.societe_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY services_commandes_policy ON services_commandes
    FOR ALL USING (EXISTS (SELECT 1 FROM services_profil p WHERE p.id = services_commandes.profil_id AND public.is_member_of_societe(p.societe_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY services_avis_policy ON services_avis
    FOR ALL USING (EXISTS (SELECT 1 FROM services_profil p WHERE p.id = services_avis.profil_id AND public.is_member_of_societe(p.societe_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY services_ca_policy ON services_ca_journalier
    FOR ALL USING (EXISTS (SELECT 1 FROM services_profil p WHERE p.id = services_ca_journalier.profil_id AND public.is_member_of_societe(p.societe_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY services_clients_policy ON services_clients
    FOR ALL USING (EXISTS (SELECT 1 FROM services_profil p WHERE p.id = services_clients.profil_id AND public.is_member_of_societe(p.societe_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY services_stock_policy ON services_stock
    FOR ALL USING (EXISTS (SELECT 1 FROM services_profil p WHERE p.id = services_stock.profil_id AND public.is_member_of_societe(p.societe_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Index
CREATE INDEX IF NOT EXISTS idx_services_reservations_date ON services_reservations(profil_id, date_rdv);
CREATE INDEX IF NOT EXISTS idx_services_produits_type ON services_produits(profil_id, type, actif);
CREATE INDEX IF NOT EXISTS idx_services_clients_email ON services_clients(profil_id, email);
CREATE INDEX IF NOT EXISTS idx_services_profil_slug ON services_profil(slug);
CREATE INDEX IF NOT EXISTS idx_services_ca_date ON services_ca_journalier(profil_id, date_acte);
