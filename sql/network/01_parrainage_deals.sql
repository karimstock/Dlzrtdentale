-- =============================================
-- JADOMI — Network : Parrainage + Deals
-- =============================================

-- Code parrainage sur societes
ALTER TABLE societes ADD COLUMN IF NOT EXISTS code_parrain text UNIQUE;

-- Parrainage
CREATE TABLE IF NOT EXISTS parrainage_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parrain_user_id uuid,
  parrain_societe_id uuid REFERENCES societes(id),
  filleul_user_id uuid,
  filleul_societe_id uuid REFERENCES societes(id),
  code_parrain text NOT NULL,
  source text DEFAULT 'annuaire',
  commission_pct decimal DEFAULT 2,
  total_commissions_generees decimal DEFAULT 0,
  actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS parrainage_gains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid REFERENCES parrainage_referrals(id),
  parrain_user_id uuid,
  transaction_montant decimal NOT NULL,
  commission_pct decimal NOT NULL,
  gain_montant decimal NOT NULL,
  source_type text,
  source_id uuid,
  statut text DEFAULT 'en_attente' CHECK (statut IN ('en_attente','valide','verse')),
  created_at timestamptz DEFAULT now()
);

-- Deals
CREATE TABLE IF NOT EXISTS jadomi_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid REFERENCES societes(id) ON DELETE CASCADE,
  profil_services_id uuid,
  profil_juridique_id uuid,
  profil_btp_id uuid,
  profil_showroom_id uuid,
  titre text NOT NULL,
  description text,
  remise_pct integer,
  avantage_texte text,
  prestation_id uuid,
  photo_url text,
  date_debut date DEFAULT current_date,
  date_fin date,
  max_utilisations integer,
  nb_utilisations integer DEFAULT 0,
  actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jadomi_deals_utilisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES jadomi_deals(id) ON DELETE CASCADE,
  user_id uuid,
  reservation_id uuid,
  created_at timestamptz DEFAULT now(),
  UNIQUE(deal_id, user_id)
);

-- RLS
ALTER TABLE parrainage_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE parrainage_gains ENABLE ROW LEVEL SECURITY;
ALTER TABLE jadomi_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE jadomi_deals_utilisations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY parrainage_referrals_policy ON parrainage_referrals FOR ALL USING (parrain_user_id = auth.uid() OR filleul_user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY parrainage_gains_policy ON parrainage_gains FOR ALL USING (parrain_user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY jadomi_deals_policy ON jadomi_deals FOR ALL USING (public.is_member_of_societe(societe_id)) WITH CHECK (public.is_member_of_societe(societe_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Index
CREATE INDEX IF NOT EXISTS idx_parrainage_code ON parrainage_referrals(code_parrain);
CREATE INDEX IF NOT EXISTS idx_parrainage_parrain ON parrainage_referrals(parrain_user_id);
CREATE INDEX IF NOT EXISTS idx_deals_actif ON jadomi_deals(actif, date_fin);
CREATE INDEX IF NOT EXISTS idx_deals_societe ON jadomi_deals(societe_id);
