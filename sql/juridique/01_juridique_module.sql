-- =============================================
-- JADOMI — Module Professions Juridiques
-- societe_type = 'juridique'
-- =============================================

-- Profil du professionnel juridique
CREATE TABLE IF NOT EXISTS juridique_profil (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid REFERENCES societes(id) ON DELETE CASCADE,
  slug text UNIQUE NOT NULL,
  type_professionnel text NOT NULL
    CHECK (type_professionnel IN ('avocat','juriste','notaire','expert_comptable','commissaire_justice','detective','autre')),
  titre text,
  nom text NOT NULL,
  prenom text NOT NULL,
  photo_url text,
  description text,
  specialites text[] DEFAULT '{}',
  barreau text,
  langues text[] DEFAULT '{"Français"}',
  adresse text,
  code_postal text,
  ville text,
  telephone text,
  email_contact text,
  note_moyenne decimal DEFAULT 0,
  nb_avis integer DEFAULT 0,
  commission_jadomi_pct decimal DEFAULT 5,
  actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Offres de consultation
CREATE TABLE IF NOT EXISTS juridique_offres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES juridique_profil(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('cabinet','visio','telephone','ecrit','document')),
  titre text NOT NULL,
  description text,
  duree_minutes integer,
  prix decimal NOT NULL,
  delai_livraison_jours integer,
  actif boolean DEFAULT true,
  ordre integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Disponibilités hebdomadaires
CREATE TABLE IF NOT EXISTS juridique_disponibilites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES juridique_profil(id) ON DELETE CASCADE,
  jour_semaine integer CHECK (jour_semaine BETWEEN 0 AND 6),
  heure_debut time NOT NULL,
  heure_fin time NOT NULL,
  pause_debut time,
  pause_fin time
);

-- Blocages (congés, fermetures)
CREATE TABLE IF NOT EXISTS juridique_blocages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES juridique_profil(id) ON DELETE CASCADE,
  date_debut date NOT NULL,
  date_fin date NOT NULL,
  motif text,
  journee_entiere boolean DEFAULT true,
  heure_debut time,
  heure_fin time,
  created_at timestamptz DEFAULT now()
);

-- Réservations / consultations
CREATE TABLE IF NOT EXISTS juridique_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES juridique_profil(id) ON DELETE CASCADE,
  offre_id uuid REFERENCES juridique_offres(id),
  client_nom text NOT NULL,
  client_prenom text,
  client_email text NOT NULL,
  client_telephone text,
  problematique text,
  documents_urls text[] DEFAULT '{}',
  date_rdv date,
  heure_rdv time,
  duree_minutes integer,
  prix_total decimal NOT NULL,
  commission_jadomi decimal NOT NULL,
  stripe_payment_intent_id text,
  stripe_refund_id text,
  visio_token text UNIQUE,
  visio_url text,
  statut text DEFAULT 'en_attente'
    CHECK (statut IN ('en_attente','confirme','en_cours','termine','annule_client','annule_pro','rembourse')),
  rappel_24h_envoye boolean DEFAULT false,
  rappel_1h_envoye boolean DEFAULT false,
  notes_pro text,
  created_at timestamptz DEFAULT now()
);

-- Dossiers clients
CREATE TABLE IF NOT EXISTS juridique_dossiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES juridique_profil(id) ON DELETE CASCADE,
  client_nom text NOT NULL,
  client_email text,
  client_telephone text,
  titre_dossier text,
  type_droit text,
  notes text,
  documents_urls text[] DEFAULT '{}',
  statut text DEFAULT 'en_cours'
    CHECK (statut IN ('en_cours','en_attente','cloture')),
  honoraires_total decimal DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Avis clients
CREATE TABLE IF NOT EXISTS juridique_avis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES juridique_profil(id) ON DELETE CASCADE,
  reservation_id uuid REFERENCES juridique_reservations(id),
  client_nom text,
  note integer CHECK (note BETWEEN 1 AND 5),
  commentaire text,
  reponse_pro text,
  visible boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Honoraires / comptabilité
CREATE TABLE IF NOT EXISTS juridique_honoraires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profil_id uuid REFERENCES juridique_profil(id) ON DELETE CASCADE,
  reservation_id uuid REFERENCES juridique_reservations(id),
  designation text NOT NULL,
  date_acte date NOT NULL DEFAULT current_date,
  montant_brut decimal NOT NULL,
  commission_jadomi decimal NOT NULL DEFAULT 0,
  montant_net decimal NOT NULL,
  mode_paiement text DEFAULT 'stripe'
    CHECK (mode_paiement IN ('stripe','cb','especes','cheque','virement')),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE juridique_profil ENABLE ROW LEVEL SECURITY;
ALTER TABLE juridique_offres ENABLE ROW LEVEL SECURITY;
ALTER TABLE juridique_disponibilites ENABLE ROW LEVEL SECURITY;
ALTER TABLE juridique_blocages ENABLE ROW LEVEL SECURITY;
ALTER TABLE juridique_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE juridique_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE juridique_avis ENABLE ROW LEVEL SECURITY;
ALTER TABLE juridique_honoraires ENABLE ROW LEVEL SECURITY;

-- Policies RLS
DO $$ BEGIN
  CREATE POLICY juridique_profil_policy ON juridique_profil
    FOR ALL USING (public.is_member_of_societe(societe_id))
    WITH CHECK (public.is_member_of_societe(societe_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY juridique_offres_policy ON juridique_offres
    FOR ALL USING (
      EXISTS (SELECT 1 FROM juridique_profil p
        WHERE p.id = juridique_offres.profil_id
        AND public.is_member_of_societe(p.societe_id))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY juridique_disponibilites_policy ON juridique_disponibilites
    FOR ALL USING (
      EXISTS (SELECT 1 FROM juridique_profil p
        WHERE p.id = juridique_disponibilites.profil_id
        AND public.is_member_of_societe(p.societe_id))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY juridique_blocages_policy ON juridique_blocages
    FOR ALL USING (
      EXISTS (SELECT 1 FROM juridique_profil p
        WHERE p.id = juridique_blocages.profil_id
        AND public.is_member_of_societe(p.societe_id))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY juridique_reservations_policy ON juridique_reservations
    FOR ALL USING (
      EXISTS (SELECT 1 FROM juridique_profil p
        WHERE p.id = juridique_reservations.profil_id
        AND public.is_member_of_societe(p.societe_id))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY juridique_dossiers_policy ON juridique_dossiers
    FOR ALL USING (
      EXISTS (SELECT 1 FROM juridique_profil p
        WHERE p.id = juridique_dossiers.profil_id
        AND public.is_member_of_societe(p.societe_id))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY juridique_avis_policy ON juridique_avis
    FOR ALL USING (
      EXISTS (SELECT 1 FROM juridique_profil p
        WHERE p.id = juridique_avis.profil_id
        AND public.is_member_of_societe(p.societe_id))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY juridique_honoraires_policy ON juridique_honoraires
    FOR ALL USING (
      EXISTS (SELECT 1 FROM juridique_profil p
        WHERE p.id = juridique_honoraires.profil_id
        AND public.is_member_of_societe(p.societe_id))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Index performances
CREATE INDEX IF NOT EXISTS idx_jur_reservations_date ON juridique_reservations(profil_id, date_rdv);
CREATE INDEX IF NOT EXISTS idx_jur_disponibilites ON juridique_disponibilites(profil_id, jour_semaine);
CREATE INDEX IF NOT EXISTS idx_jur_profil_slug ON juridique_profil(slug);
CREATE INDEX IF NOT EXISTS idx_jur_avis_profil ON juridique_avis(profil_id);
CREATE INDEX IF NOT EXISTS idx_jur_honoraires_date ON juridique_honoraires(profil_id, date_acte);
CREATE INDEX IF NOT EXISTS idx_jur_profil_specialites ON juridique_profil USING GIN (specialites);
CREATE INDEX IF NOT EXISTS idx_jur_blocages_dates ON juridique_blocages(profil_id, date_debut, date_fin);
