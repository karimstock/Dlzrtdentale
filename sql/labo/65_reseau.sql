-- =============================================
-- JADOMI LABO — Réseau solidaire inter-labos
-- Annuaire, sous-traitance, achats groupés, entraide
-- =============================================

-- Profils réseau
CREATE TABLE IF NOT EXISTS labo_reseau_profils (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id) UNIQUE,
  specialites TEXT[] DEFAULT '{}',
  capacite_production TEXT DEFAULT 'moyenne',
  accepte_soustraitance BOOLEAN DEFAULT true,
  zone_geographique TEXT,
  departement TEXT,
  ville TEXT,
  equipements TEXT[] DEFAULT '{}',
  certifications TEXT[] DEFAULT '{}',
  description_courte TEXT,
  charte_france BOOLEAN DEFAULT false,
  note_moyenne NUMERIC(3,2) DEFAULT 0,
  nombre_avis INTEGER DEFAULT 0,
  statut TEXT DEFAULT 'actif' CHECK (statut IN ('actif','suspendu','banni')),
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

-- Annonces sous-traitance
CREATE TABLE IF NOT EXISTS labo_reseau_annonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  type TEXT NOT NULL CHECK (type IN ('offre','demande')),
  titre TEXT NOT NULL, description TEXT,
  specialite_requise TEXT, type_travail TEXT,
  quantite INTEGER, urgence BOOLEAN DEFAULT false,
  date_limite DATE, tarif_propose NUMERIC(10,2),
  statut TEXT DEFAULT 'active' CHECK (statut IN ('active','pourvue','expiree','annulee')),
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

-- Réponses aux annonces
CREATE TABLE IF NOT EXISTS labo_reseau_reponses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annonce_id UUID NOT NULL REFERENCES labo_reseau_annonces(id) ON DELETE CASCADE,
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  message TEXT, tarif_propose NUMERIC(10,2),
  statut TEXT DEFAULT 'en_attente' CHECK (statut IN ('en_attente','acceptee','refusee')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Achats groupés
CREATE TABLE IF NOT EXISTS labo_achats_groupes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  createur_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  produit TEXT NOT NULL, marque TEXT, fournisseur TEXT,
  description TEXT, quantite_unitaire TEXT,
  prix_catalogue NUMERIC(10,2),
  paliers JSONB DEFAULT '[]',
  date_cloture DATE,
  statut TEXT DEFAULT 'ouvert' CHECK (statut IN ('ouvert','atteint','cloture','annule')),
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labo_achats_groupes_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  achat_groupe_id UUID NOT NULL REFERENCES labo_achats_groupes(id) ON DELETE CASCADE,
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  quantite INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(achat_groupe_id, prothesiste_id)
);

-- Entraide / Forum
CREATE TABLE IF NOT EXISTS labo_reseau_entraide (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  categorie TEXT DEFAULT 'technique' CHECK (categorie IN ('technique','juridique','commercial','formation','autre')),
  titre TEXT NOT NULL, contenu TEXT NOT NULL,
  reponses_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labo_reseau_entraide_reponses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sujet_id UUID NOT NULL REFERENCES labo_reseau_entraide(id) ON DELETE CASCADE,
  prothesiste_id UUID NOT NULL REFERENCES labo_prothesistes(id),
  contenu TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reseau_profils_dept ON labo_reseau_profils(departement);
CREATE INDEX IF NOT EXISTS idx_reseau_profils_charte ON labo_reseau_profils(charte_france);
CREATE INDEX IF NOT EXISTS idx_reseau_annonces_type ON labo_reseau_annonces(type);
CREATE INDEX IF NOT EXISTS idx_reseau_annonces_statut ON labo_reseau_annonces(statut);
CREATE INDEX IF NOT EXISTS idx_achats_groupes_statut ON labo_achats_groupes(statut);
CREATE INDEX IF NOT EXISTS idx_entraide_categorie ON labo_reseau_entraide(categorie);
