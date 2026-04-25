-- =============================================
-- Passe 52 - JADOMI Triangle Photo
-- Systeme de communication photo 3 parties :
-- Patient <-> Praticien <-> Prothesiste (Labo)
-- WORLD FIRST : routage triangulaire avec regle stricte
-- Patient et Labo ne communiquent JAMAIS directement
-- Tout transite par le praticien (dentiste)
-- =============================================

-- =============================================
-- 1. dentiste_pro_labos
-- Laboratoires de prothese dentaire lies a un cabinet.
-- Portail d'acces securise par OTP email.
-- =============================================
CREATE TABLE IF NOT EXISTS public.dentiste_pro_labos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.dentiste_pro_cabinets(id) ON DELETE CASCADE,
  nom VARCHAR(200) NOT NULL,
  email VARCHAR(200),
  telephone VARCHAR(20),
  ville VARCHAR(100),
  specialites TEXT[],  -- ceramique, zircone, implant, orthodontie
  actif BOOLEAN DEFAULT true,
  -- Auth pour portail labo
  auth_token_hash VARCHAR(128),
  auth_email VARCHAR(200),
  otp_code VARCHAR(6),
  otp_expires_at TIMESTAMP,
  otp_attempts INT DEFAULT 0,
  push_subscription JSONB,
  derniere_connexion TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dp_labos_cabinet ON public.dentiste_pro_labos(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_dp_labos_email ON public.dentiste_pro_labos(auth_email) WHERE auth_email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_dp_labos_cabinet_email ON public.dentiste_pro_labos(cabinet_id, auth_email) WHERE auth_email IS NOT NULL;
COMMENT ON TABLE public.dentiste_pro_labos IS 'Laboratoires de prothese lies au cabinet. Auth par OTP email pour portail labo.';

-- =============================================
-- 2. dentiste_pro_cases
-- Dossiers/cas prothetiques liant les 3 parties :
-- cabinet + patient + labo. Reference unique, suivi complet.
-- =============================================
CREATE TABLE IF NOT EXISTS public.dentiste_pro_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id UUID NOT NULL REFERENCES public.dentiste_pro_cabinets(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.dentiste_pro_patients(id) ON DELETE SET NULL,
  labo_id UUID REFERENCES public.dentiste_pro_labos(id) ON DELETE SET NULL,
  reference VARCHAR(50),         -- "CAS-2026-0042"
  titre VARCHAR(200),            -- "Couronne ceramique 15"
  type VARCHAR(50),              -- couronne, bridge, facette, implant, gouttiere, etc.
  dent_numero VARCHAR(10),       -- notation FDI (11, 15, 36...)
  teinte VARCHAR(20),            -- VITA shade (A2, B1, etc.)
  instructions TEXT,
  statut VARCHAR(30) DEFAULT 'ouvert'
    CHECK (statut IN ('ouvert','en_cours','essayage','modification','termine','annule')),
  date_empreinte DATE,
  date_livraison_prevue DATE,
  date_livraison_reelle DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dp_cases_cabinet ON public.dentiste_pro_cases(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_dp_cases_patient ON public.dentiste_pro_cases(patient_id);
CREATE INDEX IF NOT EXISTS idx_dp_cases_labo ON public.dentiste_pro_cases(labo_id);
CREATE INDEX IF NOT EXISTS idx_dp_cases_statut ON public.dentiste_pro_cases(cabinet_id, statut);
CREATE INDEX IF NOT EXISTS idx_dp_cases_reference ON public.dentiste_pro_cases(cabinet_id, reference);
COMMENT ON TABLE public.dentiste_pro_cases IS 'Dossier prothetique liant patient + cabinet + labo. Suivi complet du cas de l empreinte a la livraison.';

-- =============================================
-- 3. dentiste_pro_photos
-- Photos echangees dans le triangle.
-- REGLE FONDAMENTALE : patient et labo ne communiquent
-- jamais directement. Tout passe par le praticien.
-- Contrainte SQL : triangle_routing
-- =============================================
CREATE TABLE IF NOT EXISTS public.dentiste_pro_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.dentiste_pro_cases(id) ON DELETE SET NULL,
  cabinet_id UUID NOT NULL REFERENCES public.dentiste_pro_cabinets(id) ON DELETE CASCADE,
  sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('patient','praticien','labo')),
  sender_id UUID,
  recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN ('praticien','patient','labo')),
  -- Donnees photo
  photo_url TEXT NOT NULL,
  thumbnail_url TEXT,
  photo_type VARCHAR(30) CHECK (photo_type IN (
    'urgence','suivi','question',           -- patient -> praticien
    'teinte','clinique','empreinte',         -- praticien -> labo
    'instruction','avant_apres','resultat',  -- praticien -> patient
    'explication',                           -- praticien -> patient
    'fabrication','essayage',                -- labo -> praticien
    'produit_fini'                           -- labo -> praticien
  )),
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,  -- exif, dimensions, etc.
  -- Annotation (cercles, fleches)
  annotation_url TEXT,
  -- Suivi lecture
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Contrainte de routage triangulaire : WORLD FIRST
-- Patient -> praticien UNIQUEMENT
-- Labo -> praticien UNIQUEMENT
-- Praticien -> patient OU labo
ALTER TABLE public.dentiste_pro_photos DROP CONSTRAINT IF EXISTS triangle_routing;
ALTER TABLE public.dentiste_pro_photos ADD CONSTRAINT triangle_routing CHECK (
  (sender_type = 'patient' AND recipient_type = 'praticien') OR
  (sender_type = 'labo' AND recipient_type = 'praticien') OR
  (sender_type = 'praticien' AND recipient_type IN ('patient', 'labo'))
);

CREATE INDEX IF NOT EXISTS idx_dp_photos_cabinet ON public.dentiste_pro_photos(cabinet_id);
CREATE INDEX IF NOT EXISTS idx_dp_photos_case ON public.dentiste_pro_photos(case_id);
CREATE INDEX IF NOT EXISTS idx_dp_photos_sender ON public.dentiste_pro_photos(sender_type, sender_id);
CREATE INDEX IF NOT EXISTS idx_dp_photos_recipient ON public.dentiste_pro_photos(recipient_type, cabinet_id);
CREATE INDEX IF NOT EXISTS idx_dp_photos_unread ON public.dentiste_pro_photos(cabinet_id, recipient_type) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dp_photos_created ON public.dentiste_pro_photos(cabinet_id, created_at DESC);
COMMENT ON TABLE public.dentiste_pro_photos IS 'Photos du triangle Patient-Praticien-Labo. Routage contraint : patient et labo ne communiquent jamais directement.';

-- =============================================
-- RLS
-- =============================================
ALTER TABLE public.dentiste_pro_labos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentiste_pro_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentiste_pro_photos ENABLE ROW LEVEL SECURITY;

-- =============================================
-- Auto-generation de reference pour les cas
-- =============================================
CREATE OR REPLACE FUNCTION generate_case_reference()
RETURNS TRIGGER AS $$
DECLARE
  seq INT;
BEGIN
  IF NEW.reference IS NULL OR NEW.reference = '' THEN
    SELECT COALESCE(MAX(
      CAST(NULLIF(regexp_replace(reference, '^CAS-\d{4}-', ''), reference) AS INT)
    ), 0) + 1
    INTO seq
    FROM public.dentiste_pro_cases
    WHERE cabinet_id = NEW.cabinet_id
      AND reference LIKE 'CAS-' || EXTRACT(YEAR FROM NOW()) || '-%';
    NEW.reference := 'CAS-' || EXTRACT(YEAR FROM NOW()) || '-' || LPAD(seq::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_case_reference ON public.dentiste_pro_cases;
CREATE TRIGGER trg_case_reference
  BEFORE INSERT ON public.dentiste_pro_cases
  FOR EACH ROW
  EXECUTE FUNCTION generate_case_reference();

-- =============================================
-- Verification
-- =============================================
SELECT 'dentiste_pro_labos' AS tbl, 'Triangle Photo - Labos' AS description UNION ALL
SELECT 'dentiste_pro_cases', 'Triangle Photo - Dossiers' UNION ALL
SELECT 'dentiste_pro_photos', 'Triangle Photo - Photos routees';
