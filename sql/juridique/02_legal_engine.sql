-- =============================================
-- JADOMI Legal Engine — Tables analyse IA juridique
-- Passe 92 — 21 mai 2026
-- =============================================
-- Dépend de : avocat_dossiers(id), societes(id), is_member_of_societe()
-- Pattern RLS : is_member_of_societe(societe_id) via DO $$ ... EXCEPTION
-- GRANT obligatoire : anon (SELECT), authenticated (CRUD), service_role (CRUD)
-- =============================================


-- ===========================================
-- 1. avocat_pieces — Documents rattachés aux dossiers
-- ===========================================
CREATE TABLE IF NOT EXISTS avocat_pieces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES avocat_dossiers(id) ON DELETE CASCADE,
  societe_id uuid NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  nom_fichier text NOT NULL,
  type_piece text NOT NULL
    CHECK (type_piece IN (
      'contrat','mail','courrier','conclusion','jugement',
      'attestation','piece_adverse','piece_client','mise_en_demeure',
      'bulletin_salaire','preuve_paiement','piece_identite',
      'notification_officielle','autre'
    )),
  importance text DEFAULT 'moyenne'
    CHECK (importance IN ('faible','moyenne','elevee')),
  a_verifier boolean DEFAULT false,
  fichier_url text,
  taille_octets integer,
  mime_type text,
  texte_extrait text,
  qualite_ocr text
    CHECK (qualite_ocr IN ('bonne','moyenne','faible')),
  date_document date,
  metadata jsonb DEFAULT '{}',
  uploaded_by uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE avocat_pieces ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.avocat_pieces TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_pieces TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_pieces TO service_role;

DO $$ BEGIN
  CREATE POLICY avocat_pieces_policy ON avocat_pieces
    FOR ALL USING (public.is_member_of_societe(societe_id))
    WITH CHECK (public.is_member_of_societe(societe_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_avocat_pieces_dossier ON avocat_pieces(dossier_id);
CREATE INDEX IF NOT EXISTS idx_avocat_pieces_societe ON avocat_pieces(societe_id);
CREATE INDEX IF NOT EXISTS idx_avocat_pieces_created ON avocat_pieces(created_at);
CREATE INDEX IF NOT EXISTS idx_avocat_pieces_type ON avocat_pieces(type_piece);


-- ===========================================
-- 2. avocat_analyses — Analyses IA structurées par dossier
-- ===========================================
CREATE TABLE IF NOT EXISTS avocat_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES avocat_dossiers(id) ON DELETE CASCADE,
  societe_id uuid NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  type_analyse text NOT NULL
    CHECK (type_analyse IN (
      'resume','timeline','contradictions','pieces_manquantes',
      'risques','preparation_audience','analyse_complete'
    )),
  resultat jsonb NOT NULL,
  score_confiance integer
    CHECK (score_confiance >= 0 AND score_confiance <= 100),
  niveau_incertitude text
    CHECK (niveau_incertitude IN ('faible','moyen','eleve')),
  sources_utilisees text[],
  elements_manquants text[],
  recommandations text[],
  tokens_utilises integer,
  modele_ia text DEFAULT 'claude-sonnet-4-6',
  duree_ms integer,
  requested_by uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE avocat_analyses ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.avocat_analyses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_analyses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_analyses TO service_role;

DO $$ BEGIN
  CREATE POLICY avocat_analyses_policy ON avocat_analyses
    FOR ALL USING (public.is_member_of_societe(societe_id))
    WITH CHECK (public.is_member_of_societe(societe_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_avocat_analyses_dossier ON avocat_analyses(dossier_id);
CREATE INDEX IF NOT EXISTS idx_avocat_analyses_societe ON avocat_analyses(societe_id);
CREATE INDEX IF NOT EXISTS idx_avocat_analyses_created ON avocat_analyses(created_at);
CREATE INDEX IF NOT EXISTS idx_avocat_analyses_type ON avocat_analyses(type_analyse);


-- ===========================================
-- 3. avocat_timeline_events — Chronologie automatique des dossiers
-- ===========================================
CREATE TABLE IF NOT EXISTS avocat_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES avocat_dossiers(id) ON DELETE CASCADE,
  societe_id uuid NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  date_evenement date,
  type_evenement text NOT NULL
    CHECK (type_evenement IN (
      'contrat','courrier','audience','mise_en_demeure','paiement',
      'incident','rupture','licenciement','relance','jugement',
      'appel','notification','autre'
    )),
  description text,
  personnes text[],
  entreprises text[],
  piece_id uuid REFERENCES avocat_pieces(id) ON DELETE SET NULL,
  source_document text,
  score_confiance integer
    CHECK (score_confiance >= 0 AND score_confiance <= 100),
  commentaire text,
  genere_par text DEFAULT 'ia'
    CHECK (genere_par IN ('ia','manuel')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE avocat_timeline_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.avocat_timeline_events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_timeline_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_timeline_events TO service_role;

DO $$ BEGIN
  CREATE POLICY avocat_timeline_events_policy ON avocat_timeline_events
    FOR ALL USING (public.is_member_of_societe(societe_id))
    WITH CHECK (public.is_member_of_societe(societe_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_avocat_timeline_dossier ON avocat_timeline_events(dossier_id);
CREATE INDEX IF NOT EXISTS idx_avocat_timeline_societe ON avocat_timeline_events(societe_id);
CREATE INDEX IF NOT EXISTS idx_avocat_timeline_created ON avocat_timeline_events(created_at);
CREATE INDEX IF NOT EXISTS idx_avocat_timeline_date ON avocat_timeline_events(date_evenement);


-- ===========================================
-- 4. avocat_contradictions — Contradictions détectées entre documents
-- ===========================================
CREATE TABLE IF NOT EXISTS avocat_contradictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES avocat_dossiers(id) ON DELETE CASCADE,
  societe_id uuid NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  description text NOT NULL,
  type_contradiction text
    CHECK (type_contradiction IN ('date','montant','fait','nom','declaration','absence')),
  piece_ids uuid[],
  documents_concernes text[],
  gravite text DEFAULT 'moyenne'
    CHECK (gravite IN ('faible','moyenne','elevee','critique')),
  score_confiance integer
    CHECK (score_confiance >= 0 AND score_confiance <= 100),
  action_recommandee text
    CHECK (action_recommandee IN (
      'verifier','demander_piece','questionner_client',
      'controler_jurisprudence','ignorer'
    )),
  statut text DEFAULT 'detecte'
    CHECK (statut IN ('detecte','confirme','infirme','resolu')),
  notes_avocat text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE avocat_contradictions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.avocat_contradictions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_contradictions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_contradictions TO service_role;

DO $$ BEGIN
  CREATE POLICY avocat_contradictions_policy ON avocat_contradictions
    FOR ALL USING (public.is_member_of_societe(societe_id))
    WITH CHECK (public.is_member_of_societe(societe_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_avocat_contradictions_dossier ON avocat_contradictions(dossier_id);
CREATE INDEX IF NOT EXISTS idx_avocat_contradictions_societe ON avocat_contradictions(societe_id);
CREATE INDEX IF NOT EXISTS idx_avocat_contradictions_created ON avocat_contradictions(created_at);
CREATE INDEX IF NOT EXISTS idx_avocat_contradictions_gravite ON avocat_contradictions(gravite);


-- ===========================================
-- 5. avocat_pieces_manquantes — Pièces potentiellement manquantes
-- ===========================================
CREATE TABLE IF NOT EXISTS avocat_pieces_manquantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES avocat_dossiers(id) ON DELETE CASCADE,
  societe_id uuid NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  type_piece_attendue text NOT NULL,
  raison text,
  priorite text DEFAULT 'moyenne'
    CHECK (priorite IN ('faible','moyenne','elevee')),
  score_confiance integer
    CHECK (score_confiance >= 0 AND score_confiance <= 100),
  statut text DEFAULT 'suggere'
    CHECK (statut IN ('suggere','confirme','fourni','non_applicable')),
  piece_id uuid REFERENCES avocat_pieces(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE avocat_pieces_manquantes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.avocat_pieces_manquantes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_pieces_manquantes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_pieces_manquantes TO service_role;

DO $$ BEGIN
  CREATE POLICY avocat_pieces_manquantes_policy ON avocat_pieces_manquantes
    FOR ALL USING (public.is_member_of_societe(societe_id))
    WITH CHECK (public.is_member_of_societe(societe_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_avocat_pm_dossier ON avocat_pieces_manquantes(dossier_id);
CREATE INDEX IF NOT EXISTS idx_avocat_pm_societe ON avocat_pieces_manquantes(societe_id);
CREATE INDEX IF NOT EXISTS idx_avocat_pm_created ON avocat_pieces_manquantes(created_at);
CREATE INDEX IF NOT EXISTS idx_avocat_pm_statut ON avocat_pieces_manquantes(statut);


-- ===========================================
-- 6. avocat_audit_logs — Logs d'accès sécurité
-- ===========================================
CREATE TABLE IF NOT EXISTS avocat_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL
    CHECK (action IN (
      'view_dossier','upload_piece','delete_piece','run_analysis',
      'export_data','view_piece','download_piece'
    )),
  dossier_id uuid,
  piece_id uuid,
  details jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE avocat_audit_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.avocat_audit_logs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avocat_audit_logs TO service_role;

DO $$ BEGIN
  CREATE POLICY avocat_audit_logs_policy ON avocat_audit_logs
    FOR ALL USING (public.is_member_of_societe(societe_id))
    WITH CHECK (public.is_member_of_societe(societe_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_avocat_audit_societe ON avocat_audit_logs(societe_id);
CREATE INDEX IF NOT EXISTS idx_avocat_audit_created ON avocat_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_avocat_audit_user ON avocat_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_avocat_audit_action ON avocat_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_avocat_audit_dossier ON avocat_audit_logs(dossier_id);
