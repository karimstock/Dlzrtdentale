-- =============================================
-- Passe 71 - JADOMI Tournées Livreur Prothésiste
-- Suivi intelligent des tournées de livraison
-- labo → cabinet dentaire (bidirectionnel)
-- Inspiré du module IDE tournées (Passe 59)
-- =============================================

-- =============================================
-- 1. labo_livreurs
-- Livreurs rattachés à un laboratoire
-- =============================================
CREATE TABLE IF NOT EXISTS public.labo_livreurs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES public.labo_prothesistes(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  telephone TEXT,
  email TEXT,
  vehicule TEXT, -- 'voiture', 'utilitaire', 'scooter'
  zone_rayon_km INTEGER DEFAULT 50,
  couleur TEXT DEFAULT '#6366f1',
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.labo_livreurs IS 'Livreurs rattachés à un laboratoire prothésiste. Chaque livreur a sa zone et ses tournées.';

-- =============================================
-- 2. labo_demandes_passage
-- Demandes de passage dentiste → prothésiste
-- Le dentiste notifie qu'il a du travail à récupérer
-- ou le prothésiste notifie un envoi à livrer
-- =============================================
CREATE TABLE IF NOT EXISTS public.labo_demandes_passage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES public.labo_prothesistes(id) ON DELETE CASCADE,
  dentiste_client_id UUID NOT NULL REFERENCES public.dentistes_clients(id) ON DELETE CASCADE,
  -- Qui a créé la demande
  origine TEXT NOT NULL CHECK (origine IN ('dentiste', 'prothesiste')),
  -- Type de passage
  type_passage TEXT NOT NULL CHECK (type_passage IN ('recuperation', 'livraison', 'les_deux')),
  -- Priorité
  priorite TEXT NOT NULL DEFAULT 'normal' CHECK (priorite IN ('urgent', 'normal', 'light')),
  -- Références travaux (numéros de cas, PAS de noms de patients - conformité)
  references_travaux TEXT[], -- ex: ['CAS-2024-001', 'CAS-2024-002']
  description TEXT, -- description libre du contenu
  nb_colis INTEGER DEFAULT 1,
  -- Bon de livraison lié (optionnel)
  bon_livraison_id UUID,
  -- Adresse (par défaut celle du dentiste, ou alternative)
  adresse_livraison TEXT,
  ville_livraison TEXT,
  cp_livraison TEXT,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  -- Créneau souhaité
  date_souhaitee DATE,
  creneau TEXT CHECK (creneau IN ('matin', 'apres_midi', 'indifferent')),
  -- Statut
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN (
    'en_attente',     -- vient d'être créée
    'planifiee',      -- intégrée dans une tournée
    'en_cours_envoi', -- le livreur est en route
    'recuperee',      -- travail récupéré chez le dentiste
    'livree',         -- prothèse livrée au dentiste
    'annulee'         -- annulée
  )),
  -- Notifications
  dentiste_notifie BOOLEAN DEFAULT false,
  prothesiste_notifie BOOLEAN DEFAULT false,
  -- Tournée assignée
  tournee_id UUID,
  livreur_id UUID REFERENCES public.labo_livreurs(id),
  -- Validation passage
  heure_passage TIMESTAMPTZ,
  signature_passage TEXT, -- base64 ou confirmation
  bon_passage_valide BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.labo_demandes_passage IS 'Demandes de passage : dentiste notifie travail prêt ou prothésiste notifie envoi. Flux bidirectionnel optimisé.';
COMMENT ON COLUMN public.labo_demandes_passage.references_travaux IS 'Numéros de cas/client uniquement - JAMAIS de noms de patients (conformité réglementaire RGPD).';
COMMENT ON COLUMN public.labo_demandes_passage.priorite IS 'urgent = dès que possible, normal = prochaine tournée, light = quand ça arrange le livreur.';

-- =============================================
-- 3. labo_tournees_livreur
-- Tournées optimisées (une par livreur/date/créneau)
-- =============================================
CREATE TABLE IF NOT EXISTS public.labo_tournees_livreur (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES public.labo_prothesistes(id) ON DELETE CASCADE,
  livreur_id UUID NOT NULL REFERENCES public.labo_livreurs(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  creneau TEXT NOT NULL CHECK (creneau IN ('matin', 'apres_midi')),
  -- Ordre optimisé des arrêts
  ordre_arrets JSONB, -- [{demande_id, dentiste_nom, adresse, type, priorite, lat, lng}]
  -- Stats
  nb_arrets INTEGER DEFAULT 0,
  distance_totale_km DECIMAL(8,2),
  duree_estimee_min INTEGER,
  -- Statut de la tournée
  statut TEXT NOT NULL DEFAULT 'planifiee' CHECK (statut IN (
    'planifiee',   -- tournée construite, pas encore partie
    'en_cours',    -- livreur en route
    'terminee',    -- tous les arrêts faits
    'annulee'
  )),
  heure_depart TIMESTAMPTZ,
  heure_fin TIMESTAMPTZ,
  -- Choix navigation
  navigation_app TEXT DEFAULT 'waze' CHECK (navigation_app IN ('waze', 'google_maps')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(livreur_id, date, creneau)
);

COMMENT ON TABLE public.labo_tournees_livreur IS 'Tournées optimisées du livreur : une par livreur/date/créneau. Feuille de route intelligente avec GPS.';

-- =============================================
-- 4. labo_arrets_tournee
-- Chaque arrêt dans une tournée
-- =============================================
CREATE TABLE IF NOT EXISTS public.labo_arrets_tournee (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournee_id UUID NOT NULL REFERENCES public.labo_tournees_livreur(id) ON DELETE CASCADE,
  demande_id UUID NOT NULL REFERENCES public.labo_demandes_passage(id) ON DELETE CASCADE,
  dentiste_client_id UUID NOT NULL REFERENCES public.dentistes_clients(id),
  ordre INTEGER NOT NULL,
  type_passage TEXT NOT NULL CHECK (type_passage IN ('recuperation', 'livraison', 'les_deux')),
  -- Statut de cet arrêt
  statut TEXT NOT NULL DEFAULT 'a_faire' CHECK (statut IN (
    'a_faire',     -- pas encore passé
    'en_route',    -- livreur en route vers cet arrêt
    'arrive',      -- livreur sur place
    'termine',     -- passage effectué
    'absent',      -- dentiste absent
    'reporte'      -- reporté à une prochaine tournée
  )),
  heure_arrivee TIMESTAMPTZ,
  heure_depart TIMESTAMPTZ,
  bon_passage_valide BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.labo_arrets_tournee IS 'Arrêts individuels dans une tournée. Chaque arrêt correspond à une demande de passage chez un dentiste.';

-- =============================================
-- 5. labo_absences_dentiste
-- Dates d'absence du dentiste (pour ne pas passer pour rien)
-- =============================================
CREATE TABLE IF NOT EXISTS public.labo_absences_dentiste (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id UUID NOT NULL REFERENCES public.labo_prothesistes(id) ON DELETE CASCADE,
  dentiste_client_id UUID NOT NULL REFERENCES public.dentistes_clients(id) ON DELETE CASCADE,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  motif TEXT,
  adresse_alternative TEXT, -- adresse de livraison alternative pendant l'absence
  ville_alternative TEXT,
  cp_alternative TEXT,
  latitude_alt DECIMAL(10,8),
  longitude_alt DECIMAL(11,8),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.labo_absences_dentiste IS 'Dates d''absence des dentistes clients. Permet d''éviter des passages inutiles et de proposer une adresse alternative.';

-- =============================================
-- 6. INDEX
-- =============================================

-- labo_livreurs
CREATE INDEX IF NOT EXISTS idx_labo_livreurs_prothesiste
  ON public.labo_livreurs(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_labo_livreurs_actif
  ON public.labo_livreurs(prothesiste_id) WHERE actif = true;

-- labo_demandes_passage
CREATE INDEX IF NOT EXISTS idx_labo_demandes_prothesiste
  ON public.labo_demandes_passage(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_labo_demandes_dentiste
  ON public.labo_demandes_passage(dentiste_client_id);
CREATE INDEX IF NOT EXISTS idx_labo_demandes_statut
  ON public.labo_demandes_passage(statut);
CREATE INDEX IF NOT EXISTS idx_labo_demandes_date
  ON public.labo_demandes_passage(date_souhaitee);
CREATE INDEX IF NOT EXISTS idx_labo_demandes_priorite
  ON public.labo_demandes_passage(priorite) WHERE statut = 'en_attente';
CREATE INDEX IF NOT EXISTS idx_labo_demandes_tournee
  ON public.labo_demandes_passage(tournee_id);

-- labo_tournees_livreur
CREATE INDEX IF NOT EXISTS idx_labo_tournees_prothesiste
  ON public.labo_tournees_livreur(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_labo_tournees_livreur_id
  ON public.labo_tournees_livreur(livreur_id);
CREATE INDEX IF NOT EXISTS idx_labo_tournees_date
  ON public.labo_tournees_livreur(date);
CREATE INDEX IF NOT EXISTS idx_labo_tournees_statut
  ON public.labo_tournees_livreur(statut);
CREATE INDEX IF NOT EXISTS idx_labo_tournees_livreur_date
  ON public.labo_tournees_livreur(livreur_id, date);

-- labo_arrets_tournee
CREATE INDEX IF NOT EXISTS idx_labo_arrets_tournee_id
  ON public.labo_arrets_tournee(tournee_id);
CREATE INDEX IF NOT EXISTS idx_labo_arrets_demande
  ON public.labo_arrets_tournee(demande_id);
CREATE INDEX IF NOT EXISTS idx_labo_arrets_statut
  ON public.labo_arrets_tournee(statut);

-- labo_absences_dentiste
CREATE INDEX IF NOT EXISTS idx_labo_absences_prothesiste
  ON public.labo_absences_dentiste(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_labo_absences_dentiste_id
  ON public.labo_absences_dentiste(dentiste_client_id);
CREATE INDEX IF NOT EXISTS idx_labo_absences_dates
  ON public.labo_absences_dentiste(date_debut, date_fin);

-- =============================================
-- 7. TRIGGERS updated_at
-- =============================================

CREATE OR REPLACE FUNCTION public.labo_tournees_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- labo_livreurs
DROP TRIGGER IF EXISTS trg_labo_livreurs_updated_at ON public.labo_livreurs;
CREATE TRIGGER trg_labo_livreurs_updated_at
  BEFORE UPDATE ON public.labo_livreurs
  FOR EACH ROW
  EXECUTE FUNCTION public.labo_tournees_updated_at();

-- labo_demandes_passage
DROP TRIGGER IF EXISTS trg_labo_demandes_updated_at ON public.labo_demandes_passage;
CREATE TRIGGER trg_labo_demandes_updated_at
  BEFORE UPDATE ON public.labo_demandes_passage
  FOR EACH ROW
  EXECUTE FUNCTION public.labo_tournees_updated_at();

-- labo_tournees_livreur
DROP TRIGGER IF EXISTS trg_labo_tournees_livreur_updated_at ON public.labo_tournees_livreur;
CREATE TRIGGER trg_labo_tournees_livreur_updated_at
  BEFORE UPDATE ON public.labo_tournees_livreur
  FOR EACH ROW
  EXECUTE FUNCTION public.labo_tournees_updated_at();

-- labo_arrets_tournee
DROP TRIGGER IF EXISTS trg_labo_arrets_updated_at ON public.labo_arrets_tournee;
CREATE TRIGGER trg_labo_arrets_updated_at
  BEFORE UPDATE ON public.labo_arrets_tournee
  FOR EACH ROW
  EXECUTE FUNCTION public.labo_tournees_updated_at();

-- =============================================
-- 8. RLS - Row Level Security
-- Toutes les tables : filtrage par prothesiste_id
-- via societe_id → user_societe_roles
-- =============================================

-- Helper: check if current user owns the prothesiste
CREATE OR REPLACE FUNCTION public.labo_user_owns_prothesiste(p_prothesiste_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.labo_prothesistes p
    JOIN public.societes s ON s.id = p.societe_id
    JOIN public.user_societe_roles r ON r.societe_id = s.id
    WHERE p.id = p_prothesiste_id
      AND r.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ---------- labo_livreurs ----------
ALTER TABLE public.labo_livreurs ENABLE ROW LEVEL SECURITY;

CREATE POLICY labo_livreurs_select ON public.labo_livreurs
  FOR SELECT TO authenticated
  USING (public.labo_user_owns_prothesiste(prothesiste_id));

CREATE POLICY labo_livreurs_insert ON public.labo_livreurs
  FOR INSERT TO authenticated
  WITH CHECK (public.labo_user_owns_prothesiste(prothesiste_id));

CREATE POLICY labo_livreurs_update ON public.labo_livreurs
  FOR UPDATE TO authenticated
  USING (public.labo_user_owns_prothesiste(prothesiste_id));

CREATE POLICY labo_livreurs_delete ON public.labo_livreurs
  FOR DELETE TO authenticated
  USING (public.labo_user_owns_prothesiste(prothesiste_id));

-- ---------- labo_demandes_passage ----------
ALTER TABLE public.labo_demandes_passage ENABLE ROW LEVEL SECURITY;

CREATE POLICY labo_demandes_select ON public.labo_demandes_passage
  FOR SELECT TO authenticated
  USING (public.labo_user_owns_prothesiste(prothesiste_id));

CREATE POLICY labo_demandes_insert ON public.labo_demandes_passage
  FOR INSERT TO authenticated
  WITH CHECK (public.labo_user_owns_prothesiste(prothesiste_id));

CREATE POLICY labo_demandes_update ON public.labo_demandes_passage
  FOR UPDATE TO authenticated
  USING (public.labo_user_owns_prothesiste(prothesiste_id));

-- ---------- labo_tournees_livreur ----------
ALTER TABLE public.labo_tournees_livreur ENABLE ROW LEVEL SECURITY;

CREATE POLICY labo_tournees_livreur_select ON public.labo_tournees_livreur
  FOR SELECT TO authenticated
  USING (public.labo_user_owns_prothesiste(prothesiste_id));

CREATE POLICY labo_tournees_livreur_insert ON public.labo_tournees_livreur
  FOR INSERT TO authenticated
  WITH CHECK (public.labo_user_owns_prothesiste(prothesiste_id));

CREATE POLICY labo_tournees_livreur_update ON public.labo_tournees_livreur
  FOR UPDATE TO authenticated
  USING (public.labo_user_owns_prothesiste(prothesiste_id));

-- ---------- labo_arrets_tournee ----------
ALTER TABLE public.labo_arrets_tournee ENABLE ROW LEVEL SECURITY;

CREATE POLICY labo_arrets_select ON public.labo_arrets_tournee
  FOR SELECT TO authenticated
  USING (
    tournee_id IN (
      SELECT id FROM public.labo_tournees_livreur
      WHERE public.labo_user_owns_prothesiste(prothesiste_id)
    )
  );

CREATE POLICY labo_arrets_insert ON public.labo_arrets_tournee
  FOR INSERT TO authenticated
  WITH CHECK (
    tournee_id IN (
      SELECT id FROM public.labo_tournees_livreur
      WHERE public.labo_user_owns_prothesiste(prothesiste_id)
    )
  );

CREATE POLICY labo_arrets_update ON public.labo_arrets_tournee
  FOR UPDATE TO authenticated
  USING (
    tournee_id IN (
      SELECT id FROM public.labo_tournees_livreur
      WHERE public.labo_user_owns_prothesiste(prothesiste_id)
    )
  );

-- ---------- labo_absences_dentiste ----------
ALTER TABLE public.labo_absences_dentiste ENABLE ROW LEVEL SECURITY;

CREATE POLICY labo_absences_dentiste_select ON public.labo_absences_dentiste
  FOR SELECT TO authenticated
  USING (public.labo_user_owns_prothesiste(prothesiste_id));

CREATE POLICY labo_absences_dentiste_insert ON public.labo_absences_dentiste
  FOR INSERT TO authenticated
  WITH CHECK (public.labo_user_owns_prothesiste(prothesiste_id));

CREATE POLICY labo_absences_dentiste_update ON public.labo_absences_dentiste
  FOR UPDATE TO authenticated
  USING (public.labo_user_owns_prothesiste(prothesiste_id));

CREATE POLICY labo_absences_dentiste_delete ON public.labo_absences_dentiste
  FOR DELETE TO authenticated
  USING (public.labo_user_owns_prothesiste(prothesiste_id));

-- =============================================
-- FIN Passe 71 - JADOMI Tournées Livreur
-- 5 tables, 18 index, RLS complet,
-- triggers updated_at, conformité RGPD
-- =============================================
