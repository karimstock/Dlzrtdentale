-- =============================================
-- JADOMI — Migration : Communication Cabinet (optionnelle)
-- Tables dédiées si vous souhaitez séparer les données
-- À exécuter dans Supabase SQL Editor si besoin
-- =============================================

CREATE TABLE IF NOT EXISTS contacts_cabinet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid REFERENCES societes(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('confrere','patient')),
  nom text NOT NULL,
  prenom text,
  email text,
  telephone text,
  specialite text,
  date_naissance date,
  derniere_visite date,
  type_traitement text,
  actif boolean DEFAULT true,
  desabonne boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campagnes_cabinet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid REFERENCES societes(id) ON DELETE CASCADE,
  nom text NOT NULL,
  type_destinataire text CHECK (type_destinataire IN ('confreres','patients','tous')),
  sujet text NOT NULL,
  contenu_html text NOT NULL,
  nb_envoyes integer DEFAULT 0,
  nb_ouverts integer DEFAULT 0,
  statut text DEFAULT 'brouillon',
  envoye_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE contacts_cabinet ENABLE ROW LEVEL SECURITY;
ALTER TABLE campagnes_cabinet ENABLE ROW LEVEL SECURITY;

CREATE POLICY contacts_cabinet_policy ON contacts_cabinet FOR ALL
  USING (public.is_member_of_societe(societe_id))
  WITH CHECK (public.is_member_of_societe(societe_id));

CREATE POLICY campagnes_cabinet_policy ON campagnes_cabinet FOR ALL
  USING (public.is_member_of_societe(societe_id))
  WITH CHECK (public.is_member_of_societe(societe_id));
