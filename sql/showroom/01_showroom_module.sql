-- =============================================
-- JADOMI — Module Showroom Créateurs & Artisans
-- societe_type = 'createur'
-- =============================================

CREATE TABLE IF NOT EXISTS showroom_profil (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid REFERENCES societes(id) ON DELETE CASCADE,
  slug text UNIQUE NOT NULL,
  type_createur text NOT NULL,
  nom_boutique text NOT NULL,
  tagline text,
  description text,
  histoire text,
  logo_url text,
  banniere_url text,
  photos_atelier_urls text[] DEFAULT '{}',
  ville text, code_postal text, adresse text,
  telephone text, email_contact text,
  instagram_url text, facebook_url text, tiktok_url text, site_web text,
  labels text[] DEFAULT '{}',
  note_moyenne decimal DEFAULT 0,
  nb_avis integer DEFAULT 0,
  nb_ventes integer DEFAULT 0,
  commission_jadomi_pct decimal DEFAULT 5,
  accepte_sur_mesure boolean DEFAULT false,
  accepte_location boolean DEFAULT false,
  livraison_locale boolean DEFAULT false,
  rayon_livraison_km integer DEFAULT 20,
  actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS showroom_produits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES showroom_profil(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('vente','location','sur_mesure','les_trois')),
  categorie text NOT NULL,
  sous_categorie text,
  nom text NOT NULL,
  description text,
  histoire_piece text,
  mots_cles text[], tags text[], hashtags_instagram text[],
  prix_vente decimal,
  prix_location_weekend decimal,
  prix_location_semaine decimal,
  prix_sur_mesure_depuis decimal,
  caution_location decimal DEFAULT 0,
  taille text, tailles_disponibles text[],
  couleur text, couleurs_disponibles text[],
  matiere text,
  made_in_france boolean DEFAULT true,
  etat text DEFAULT 'neuf' CHECK (etat IN ('neuf','excellent','tres_bon','bon')),
  photos_urls text[] DEFAULT '{}',
  video_url text,
  stock integer DEFAULT 1,
  poids_grammes integer,
  est_piece_unique boolean DEFAULT false,
  collection text,
  -- Champs bijouterie
  metal text,
  metal_poids_grammes decimal,
  pierres jsonb DEFAULT '[]',
  poincon text,
  taille_bague text, tailles_bague_disponibles text[],
  longueur_cm decimal,
  certificat_url text,
  gravure_possible boolean DEFAULT false,
  gravure_prix decimal,
  retouche_taille_possible boolean DEFAULT false,
  retouche_taille_prix decimal,
  essayage_domicile boolean DEFAULT false,
  essayage_domicile_zone text,
  visio_disponible boolean DEFAULT false,
  actif boolean DEFAULT true,
  nb_vues integer DEFAULT 0,
  nb_favoris integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS showroom_disponibilites_location (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_id uuid REFERENCES showroom_produits(id) ON DELETE CASCADE,
  date_debut date NOT NULL, date_fin date NOT NULL,
  statut text DEFAULT 'disponible' CHECK (statut IN ('disponible','reserve','loue','bloque')),
  commande_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS showroom_commandes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES showroom_profil(id) ON DELETE CASCADE,
  client_user_id uuid,
  client_nom text NOT NULL, client_email text NOT NULL,
  client_telephone text, client_adresse text, client_cp text, client_ville text,
  type_commande text NOT NULL CHECK (type_commande IN ('achat','location','sur_mesure')),
  lignes jsonb NOT NULL DEFAULT '[]',
  sous_total decimal NOT NULL,
  frais_livraison decimal DEFAULT 0,
  caution decimal DEFAULT 0,
  total decimal NOT NULL,
  commission_jadomi decimal NOT NULL,
  mode_livraison text DEFAULT 'colissimo',
  numero_suivi text,
  stripe_payment_intent_id text,
  statut text DEFAULT 'en_attente' CHECK (statut IN (
    'en_attente','paye','en_preparation','expedie','livre','retourne','annule','litige','termine'
  )),
  date_location_debut date, date_location_fin date,
  date_retour_effective date,
  caution_remboursee boolean DEFAULT false,
  notes_createur text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS showroom_demandes_sur_mesure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES showroom_profil(id) ON DELETE CASCADE,
  client_nom text NOT NULL, client_email text NOT NULL, client_telephone text,
  type_creation text, occasion text,
  taille text, mensurations jsonb,
  couleurs_souhaitees text,
  budget_min decimal, budget_max decimal,
  date_souhaitee date,
  description text,
  photos_inspiration_urls text[] DEFAULT '{}',
  statut text DEFAULT 'nouvelle' CHECK (statut IN (
    'nouvelle','en_etude','devis_envoye','accepte','en_fabrication','livre','annule'
  )),
  devis_montant decimal,
  acompte_pct integer DEFAULT 30,
  commande_id uuid REFERENCES showroom_commandes(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS showroom_avis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES showroom_profil(id) ON DELETE CASCADE,
  commande_id uuid REFERENCES showroom_commandes(id),
  client_nom text,
  note integer CHECK (note BETWEEN 1 AND 5),
  commentaire text,
  photos_urls text[] DEFAULT '{}',
  reponse_createur text,
  visible boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS showroom_favoris (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid, produit_id uuid REFERENCES showroom_produits(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, produit_id)
);

CREATE TABLE IF NOT EXISTS showroom_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES showroom_profil(id) ON DELETE CASCADE,
  client_user_id uuid,
  client_nom text, client_email text,
  expediteur text NOT NULL CHECK (expediteur IN ('client','createur','jadomi')),
  contenu text NOT NULL,
  pieces_jointes_urls text[] DEFAULT '{}',
  lu boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE showroom_profil ENABLE ROW LEVEL SECURITY;
ALTER TABLE showroom_produits ENABLE ROW LEVEL SECURITY;
ALTER TABLE showroom_disponibilites_location ENABLE ROW LEVEL SECURITY;
ALTER TABLE showroom_commandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE showroom_demandes_sur_mesure ENABLE ROW LEVEL SECURITY;
ALTER TABLE showroom_avis ENABLE ROW LEVEL SECURITY;
ALTER TABLE showroom_favoris ENABLE ROW LEVEL SECURITY;
ALTER TABLE showroom_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY showroom_profil_policy ON showroom_profil FOR ALL USING (public.is_member_of_societe(societe_id)) WITH CHECK (public.is_member_of_societe(societe_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY showroom_produits_policy ON showroom_produits FOR ALL USING (EXISTS (SELECT 1 FROM showroom_profil p WHERE p.id = showroom_produits.profil_id AND public.is_member_of_societe(p.societe_id))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY showroom_commandes_policy ON showroom_commandes FOR ALL USING (EXISTS (SELECT 1 FROM showroom_profil p WHERE p.id = showroom_commandes.profil_id AND public.is_member_of_societe(p.societe_id))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY showroom_demandes_policy ON showroom_demandes_sur_mesure FOR ALL USING (EXISTS (SELECT 1 FROM showroom_profil p WHERE p.id = showroom_demandes_sur_mesure.profil_id AND public.is_member_of_societe(p.societe_id))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY showroom_avis_policy ON showroom_avis FOR ALL USING (EXISTS (SELECT 1 FROM showroom_profil p WHERE p.id = showroom_avis.profil_id AND public.is_member_of_societe(p.societe_id))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY showroom_messages_policy ON showroom_messages FOR ALL USING (EXISTS (SELECT 1 FROM showroom_profil p WHERE p.id = showroom_messages.profil_id AND public.is_member_of_societe(p.societe_id))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Index
CREATE INDEX IF NOT EXISTS idx_showroom_produits_actif ON showroom_produits(profil_id, actif, categorie);
CREATE INDEX IF NOT EXISTS idx_showroom_produits_type ON showroom_produits(type, actif);
CREATE INDEX IF NOT EXISTS idx_showroom_commandes_statut ON showroom_commandes(profil_id, statut);
CREATE INDEX IF NOT EXISTS idx_showroom_profil_slug ON showroom_profil(slug);
CREATE INDEX IF NOT EXISTS idx_showroom_profil_ville ON showroom_profil(ville, actif);
CREATE INDEX IF NOT EXISTS idx_showroom_favoris_user ON showroom_favoris(user_id);
