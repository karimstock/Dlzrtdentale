-- =============================================
-- Passe 53 - JADOMI Care Network (Reseau de Soins)
-- Extension du Triangle Photo : coordination
-- interprofessionnelle N praticiens autour d'un patient.
-- Cercle de soins + partages inter-praticiens + adressage
-- =============================================

-- =============================================
-- 1. dentiste_pro_care_circle
-- Lie N praticiens a un patient.
-- Praticiens internes (sur JADOMI) ou externes.
-- =============================================
CREATE TABLE IF NOT EXISTS public.dentiste_pro_care_circle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.dentiste_pro_patients(id) ON DELETE CASCADE,
  -- Praticien interne JADOMI (nullable si externe)
  praticien_cabinet_id UUID REFERENCES public.dentiste_pro_cabinets(id) ON DELETE SET NULL,
  -- Praticien externe (pas sur JADOMI)
  praticien_externe_nom VARCHAR(200),
  praticien_externe_email VARCHAR(200),
  praticien_externe_telephone VARCHAR(20),
  praticien_externe_profession VARCHAR(50),
  -- Role dans le cercle
  profession VARCHAR(50) NOT NULL,  -- dentiste, kine, medecin, osteo, dermato, orl, etc.
  role VARCHAR(30) DEFAULT 'membre' CHECK (role IN ('referent','membre','consultant')),
  -- Statut
  statut VARCHAR(20) DEFAULT 'actif' CHECK (statut IN ('actif','inactif','invite')),
  invite_par UUID REFERENCES public.dentiste_pro_cabinets(id) ON DELETE SET NULL,
  date_ajout TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dp_care_circle_patient ON public.dentiste_pro_care_circle(patient_id);
CREATE INDEX IF NOT EXISTS idx_dp_care_circle_cabinet ON public.dentiste_pro_care_circle(praticien_cabinet_id) WHERE praticien_cabinet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dp_care_circle_statut ON public.dentiste_pro_care_circle(patient_id, statut);
CREATE INDEX IF NOT EXISTS idx_dp_care_circle_profession ON public.dentiste_pro_care_circle(patient_id, profession);
CREATE INDEX IF NOT EXISTS idx_dp_care_circle_invite ON public.dentiste_pro_care_circle(invite_par);

-- Unicite : un praticien interne ne peut etre dans le cercle qu'une seule fois par patient
CREATE UNIQUE INDEX IF NOT EXISTS idx_dp_care_circle_unique_cabinet
  ON public.dentiste_pro_care_circle(patient_id, praticien_cabinet_id)
  WHERE praticien_cabinet_id IS NOT NULL AND statut != 'inactif';

COMMENT ON TABLE public.dentiste_pro_care_circle IS 'Cercle de soins : N praticiens lies a un patient. Internes (JADOMI) ou externes.';

-- =============================================
-- 2. dentiste_pro_partages
-- Partages inter-praticiens : photos, videos, notes,
-- documents, referrals entre membres du cercle de soins.
-- =============================================
CREATE TABLE IF NOT EXISTS public.dentiste_pro_partages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.dentiste_pro_patients(id) ON DELETE CASCADE,
  -- Emetteur
  sender_cabinet_id UUID NOT NULL REFERENCES public.dentiste_pro_cabinets(id) ON DELETE CASCADE,
  sender_profession VARCHAR(50),
  -- Destinataire
  recipient_cabinet_id UUID REFERENCES public.dentiste_pro_cabinets(id) ON DELETE SET NULL,
  recipient_externe_email VARCHAR(200),
  recipient_profession VARCHAR(50),
  -- Contenu
  type VARCHAR(30) NOT NULL CHECK (type IN ('photo','video','note','document','referral')),
  titre VARCHAR(200),
  description TEXT,
  media_url TEXT,
  thumbnail_url TEXT,
  document_url TEXT,
  -- Specifique adressage
  motif_adressage TEXT,    -- "Suspicion contracture musculaire ATM"
  urgence VARCHAR(20) CHECK (urgence IN ('routine','urgent','immediat')),
  -- Analyse IA
  ai_analysis JSONB DEFAULT '{}'::jsonb,
  -- Suivi
  read_at TIMESTAMP,
  repondu_at TIMESTAMP,
  reponse TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dp_partages_patient ON public.dentiste_pro_partages(patient_id);
CREATE INDEX IF NOT EXISTS idx_dp_partages_sender ON public.dentiste_pro_partages(sender_cabinet_id);
CREATE INDEX IF NOT EXISTS idx_dp_partages_recipient ON public.dentiste_pro_partages(recipient_cabinet_id) WHERE recipient_cabinet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dp_partages_type ON public.dentiste_pro_partages(type);
CREATE INDEX IF NOT EXISTS idx_dp_partages_unread ON public.dentiste_pro_partages(recipient_cabinet_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dp_partages_created ON public.dentiste_pro_partages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dp_partages_urgence ON public.dentiste_pro_partages(urgence) WHERE urgence IN ('urgent','immediat');

COMMENT ON TABLE public.dentiste_pro_partages IS 'Partages inter-praticiens : photos, notes, documents, referrals dans le cercle de soins.';

-- =============================================
-- 3. Vue : equipe de soins d'un patient
-- Aggregation lisible du cercle de soins
-- =============================================
CREATE OR REPLACE VIEW public.dentiste_pro_care_team_view AS
SELECT
  cc.id,
  cc.patient_id,
  cc.profession,
  cc.role,
  cc.statut,
  cc.date_ajout,
  -- Praticien interne
  cc.praticien_cabinet_id,
  cab.nom_cabinet AS cabinet_nom,
  -- Praticien externe
  cc.praticien_externe_nom,
  cc.praticien_externe_email,
  cc.praticien_externe_profession,
  -- Nom affiche (interne ou externe)
  COALESCE(cab.nom_cabinet, cc.praticien_externe_nom) AS nom_affiche,
  -- Qui a invite
  cc.invite_par,
  inv.nom_cabinet AS invite_par_nom
FROM public.dentiste_pro_care_circle cc
LEFT JOIN public.dentiste_pro_cabinets cab ON cab.id = cc.praticien_cabinet_id
LEFT JOIN public.dentiste_pro_cabinets inv ON inv.id = cc.invite_par
WHERE cc.statut != 'inactif';

COMMENT ON VIEW public.dentiste_pro_care_team_view IS 'Vue lisible du cercle de soins : noms resolus, praticiens internes et externes.';

-- =============================================
-- RLS
-- =============================================
ALTER TABLE public.dentiste_pro_care_circle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentiste_pro_partages ENABLE ROW LEVEL SECURITY;

-- =============================================
-- Verification
-- =============================================
SELECT 'dentiste_pro_care_circle' AS tbl, 'Reseau Soins - Cercle de soins' AS description UNION ALL
SELECT 'dentiste_pro_partages', 'Reseau Soins - Partages inter-praticiens' UNION ALL
SELECT 'dentiste_pro_care_team_view', 'Reseau Soins - Vue equipe de soins';
