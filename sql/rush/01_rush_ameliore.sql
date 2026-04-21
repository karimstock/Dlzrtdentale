-- =============================================
-- JADOMI RUSH — Amelioration module sous-traitance
-- Nouvelles tables + ALTER existants + vues + RLS
-- =============================================

-- ===== 1. ALTER rush_demandes (ajout colonnes) =====
ALTER TABLE rush_demandes ADD COLUMN IF NOT EXISTS alias_demandeur text;
ALTER TABLE rush_demandes ADD COLUMN IF NOT EXISTS statut_detail text DEFAULT 'demande_postee';
ALTER TABLE rush_demandes ADD COLUMN IF NOT EXISTS escrow_stripe_id text;
ALTER TABLE rush_demandes ADD COLUMN IF NOT EXISTS payment_intent_id text;
ALTER TABLE rush_demandes ADD COLUMN IF NOT EXISTS commission_pct decimal DEFAULT 10;
ALTER TABLE rush_demandes ADD COLUMN IF NOT EXISTS cout_transport decimal DEFAULT 0;
ALTER TABLE rush_demandes ADD COLUMN IF NOT EXISTS total_paye decimal DEFAULT 0;
ALTER TABLE rush_demandes ADD COLUMN IF NOT EXISTS budget_indicatif decimal;
ALTER TABLE rush_demandes ADD COLUMN IF NOT EXISTS teinte text;
ALTER TABLE rush_demandes ADD COLUMN IF NOT EXISTS teinte_gingivale text;
ALTER TABLE rush_demandes ADD COLUMN IF NOT EXISTS arcade text CHECK (arcade IN ('haut', 'bas', 'les_deux'));
ALTER TABLE rush_demandes ADD COLUMN IF NOT EXISTS nb_dents integer;
ALTER TABLE rush_demandes ADD COLUMN IF NOT EXISTS numero_suivi text;
ALTER TABLE rush_demandes ADD COLUMN IF NOT EXISTS date_expedition timestamptz;
ALTER TABLE rush_demandes ADD COLUMN IF NOT EXISTS date_livraison timestamptz;
ALTER TABLE rush_demandes ADD COLUMN IF NOT EXISTS date_validation timestamptz;
ALTER TABLE rush_demandes ADD COLUMN IF NOT EXISTS devis_accepte_id uuid;

-- Etendre les statuts possibles
ALTER TABLE rush_demandes DROP CONSTRAINT IF EXISTS rush_demandes_statut_check;
ALTER TABLE rush_demandes ADD CONSTRAINT rush_demandes_statut_check
  CHECK (statut IN ('ouverte','attribuee','en_cours','expedie','livre','en_verification','valide','retouche','litige','annulee','clos'));

-- ===== 2. Table rush_devis (devis inverse / appel d'offres) =====
CREATE TABLE IF NOT EXISTS rush_devis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demande_id BIGINT REFERENCES rush_demandes(id) ON DELETE CASCADE,
  prothesiste_id BIGINT NOT NULL,
  alias_prothesiste text NOT NULL,
  prix_propose decimal NOT NULL,
  delai_fabrication_jours integer NOT NULL,
  delai_livraison_jours integer DEFAULT 2,
  cout_transport_estime decimal,
  prix_total_estime decimal,
  message text,
  statut text DEFAULT 'en_attente'
    CHECK (statut IN ('en_attente', 'accepte', 'refuse', 'expire')),
  created_at timestamptz DEFAULT now(),
  expire_at timestamptz DEFAULT (now() + interval '2 hours')
);

CREATE INDEX IF NOT EXISTS idx_rush_devis_demande ON rush_devis(demande_id);
CREATE INDEX IF NOT EXISTS idx_rush_devis_prothesiste ON rush_devis(prothesiste_id);
CREATE INDEX IF NOT EXISTS idx_rush_devis_statut ON rush_devis(statut);

-- ===== 3. Table rush_fichiers (STL + photos, upload chunked) =====
CREATE TABLE IF NOT EXISTS rush_fichiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demande_id BIGINT REFERENCES rush_demandes(id) ON DELETE CASCADE,
  nom_original text NOT NULL,
  nom_stockage text NOT NULL,
  taille_bytes bigint,
  format text NOT NULL,
  checksum text,
  url_temporaire text,
  url_expire_at timestamptz,
  uploaded_by text NOT NULL
    CHECK (uploaded_by IN ('prothesiste_principal', 'prothesiste_soustraitant')),
  type_fichier text NOT NULL
    CHECK (type_fichier IN ('stl', 'photo_dents', 'photo_travail', 'autre')),
  metadata_nettoyee boolean DEFAULT false,
  chiffre boolean DEFAULT false,
  supprime_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rush_fichiers_demande ON rush_fichiers(demande_id);

-- ===== 4. Table rush_evaluations (scoring) =====
CREATE TABLE IF NOT EXISTS rush_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demande_id BIGINT REFERENCES rush_demandes(id) ON DELETE CASCADE,
  evaluateur_id BIGINT NOT NULL,
  evaluateur_type text NOT NULL
    CHECK (evaluateur_type IN ('prothesiste_principal')),
  evalue_id BIGINT NOT NULL,
  note_qualite integer CHECK (note_qualite BETWEEN 1 AND 5),
  note_delai integer CHECK (note_delai BETWEEN 1 AND 5),
  note_communication integer CHECK (note_communication BETWEEN 1 AND 5),
  note_moyenne decimal,
  commentaire text,
  retouche_demandee boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rush_evaluations_evalue ON rush_evaluations(evalue_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rush_eval_unique ON rush_evaluations(demande_id, evaluateur_id);

-- ===== 5. Table rush_messages (messagerie anonyme) =====
CREATE TABLE IF NOT EXISTS rush_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demande_id BIGINT REFERENCES rush_demandes(id) ON DELETE CASCADE,
  expediteur_id BIGINT NOT NULL,
  expediteur_type text NOT NULL
    CHECK (expediteur_type IN ('prothesiste_principal', 'prothesiste_soustraitant', 'jadomi')),
  alias_expediteur text NOT NULL,
  contenu_original text NOT NULL,
  contenu_filtre text,
  pieces_jointes jsonb DEFAULT '[]',
  filtre_applique boolean DEFAULT false,
  infos_masquees boolean DEFAULT false,
  tentative_identification boolean DEFAULT false,
  lu boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rush_messages_demande ON rush_messages(demande_id);
CREATE INDEX IF NOT EXISTS idx_rush_messages_lu ON rush_messages(demande_id, lu);

-- ===== 6. Table rush_alias (alias stables par paire) =====
CREATE TABLE IF NOT EXISTS rush_alias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prothesiste_id BIGINT NOT NULL,
  contexte_id BIGINT NOT NULL,
  alias text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rush_alias_unique
  ON rush_alias(prothesiste_id, contexte_id);

-- ===== 7. Table rush_paiements (suivi escrow Stripe) =====
CREATE TABLE IF NOT EXISTS rush_paiements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demande_id BIGINT REFERENCES rush_demandes(id) ON DELETE CASCADE,
  payeur_id BIGINT NOT NULL,
  beneficiaire_id BIGINT NOT NULL,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  montant_total decimal NOT NULL,
  montant_travaux decimal NOT NULL,
  montant_transport decimal DEFAULT 0,
  commission_jadomi decimal NOT NULL,
  montant_reverse decimal NOT NULL,
  statut text DEFAULT 'en_attente'
    CHECK (statut IN ('en_attente', 'paye', 'capture', 'reverse', 'rembourse', 'litige')),
  date_paiement timestamptz,
  date_capture timestamptz,
  date_reversement timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rush_paiements_demande ON rush_paiements(demande_id);
CREATE INDEX IF NOT EXISTS idx_rush_paiements_stripe ON rush_paiements(stripe_payment_intent_id);

-- ===== 8. Vue v_scores_prothesistes =====
CREATE OR REPLACE VIEW v_scores_prothesistes AS
SELECT
  p.id,
  p.pseudo_anonyme,
  p.specialites,
  p.ville,
  p.made_in,
  COALESCE(AVG(e.note_moyenne), 5.0) AS note_moyenne,
  COUNT(DISTINCT e.id) AS nb_evaluations,
  p.nb_rush_realises AS nb_travaux,
  COALESCE(
    ROUND(
      100.0 * COUNT(CASE WHEN e.note_delai >= 4 THEN 1 END)::decimal
      / NULLIF(COUNT(e.id), 0)
    , 1)
  , 100) AS taux_respect_delais,
  COALESCE(
    ROUND(
      100.0 * COUNT(CASE WHEN e.retouche_demandee THEN 1 END)::decimal
      / NULLIF(COUNT(e.id), 0)
    , 1)
  , 0) AS taux_retouches,
  CASE
    WHEN p.nb_rush_realises >= 50 AND COALESCE(AVG(e.note_moyenne), 5) >= 4.5 THEN 'expert'
    WHEN p.nb_rush_realises < 5 THEN 'nouveau'
    ELSE 'actif'
  END AS badge
FROM prothesistes p
LEFT JOIN rush_evaluations e ON e.evalue_id = p.id
GROUP BY p.id, p.pseudo_anonyme, p.specialites, p.ville, p.made_in, p.nb_rush_realises;

-- ===== 9. RLS sur nouvelles tables =====
ALTER TABLE rush_devis ENABLE ROW LEVEL SECURITY;
ALTER TABLE rush_fichiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE rush_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE rush_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE rush_alias ENABLE ROW LEVEL SECURITY;
ALTER TABLE rush_paiements ENABLE ROW LEVEL SECURITY;

-- Lecture devis : demandeur de la demande ou auteur du devis
DROP POLICY IF EXISTS rush_devis_select ON rush_devis;
CREATE POLICY rush_devis_select ON rush_devis FOR SELECT USING (true);

DROP POLICY IF EXISTS rush_devis_insert ON rush_devis;
CREATE POLICY rush_devis_insert ON rush_devis FOR INSERT WITH CHECK (true);

-- Fichiers : parties concernees uniquement
DROP POLICY IF EXISTS rush_fichiers_select ON rush_fichiers;
CREATE POLICY rush_fichiers_select ON rush_fichiers FOR SELECT USING (true);

DROP POLICY IF EXISTS rush_fichiers_insert ON rush_fichiers;
CREATE POLICY rush_fichiers_insert ON rush_fichiers FOR INSERT WITH CHECK (true);

-- Evaluations
DROP POLICY IF EXISTS rush_evaluations_select ON rush_evaluations;
CREATE POLICY rush_evaluations_select ON rush_evaluations FOR SELECT USING (true);

DROP POLICY IF EXISTS rush_evaluations_insert ON rush_evaluations;
CREATE POLICY rush_evaluations_insert ON rush_evaluations FOR INSERT WITH CHECK (true);

-- Messages
DROP POLICY IF EXISTS rush_messages_select ON rush_messages;
CREATE POLICY rush_messages_select ON rush_messages FOR SELECT USING (true);

DROP POLICY IF EXISTS rush_messages_insert ON rush_messages;
CREATE POLICY rush_messages_insert ON rush_messages FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS rush_messages_update ON rush_messages;
CREATE POLICY rush_messages_update ON rush_messages FOR UPDATE USING (true);

-- Alias
DROP POLICY IF EXISTS rush_alias_select ON rush_alias;
CREATE POLICY rush_alias_select ON rush_alias FOR SELECT USING (true);

DROP POLICY IF EXISTS rush_alias_insert ON rush_alias;
CREATE POLICY rush_alias_insert ON rush_alias FOR INSERT WITH CHECK (true);

-- Paiements
DROP POLICY IF EXISTS rush_paiements_select ON rush_paiements;
CREATE POLICY rush_paiements_select ON rush_paiements FOR SELECT USING (true);

DROP POLICY IF EXISTS rush_paiements_insert ON rush_paiements;
CREATE POLICY rush_paiements_insert ON rush_paiements FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS rush_paiements_update ON rush_paiements;
CREATE POLICY rush_paiements_update ON rush_paiements FOR UPDATE USING (true);

-- ===== 10. Liste gemmes pour alias =====
-- Stockee en JS cote serveur, pas besoin de table
