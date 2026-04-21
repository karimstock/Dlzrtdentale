-- =============================================
-- JADOMI — Parametres plateforme
-- Configuration globale admin
-- =============================================

CREATE TABLE IF NOT EXISTS parametres_plateforme (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cle text UNIQUE NOT NULL,
  valeur text NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO parametres_plateforme (cle, valeur, description) VALUES
  ('commission_rush', '10', 'Commission Rush %'),
  ('commission_services', '8', 'Commission Services %'),
  ('commission_showroom', '5', 'Commission Showroom %'),
  ('commission_juridique', '5', 'Commission Juridique %'),
  ('commission_btp', '5', 'Commission BTP %'),
  ('prix_solo', '29', 'Prix Solo euros/mois'),
  ('prix_pro', '79', 'Prix Pro euros/mois'),
  ('prix_business', '149', 'Prix Business euros/mois'),
  ('prix_entreprise', '299', 'Prix Entreprise euros/mois'),
  ('maintenance_mode', 'false', 'Mode maintenance'),
  ('maintenance_message', 'JADOMI est en maintenance', 'Message maintenance')
ON CONFLICT (cle) DO NOTHING;
