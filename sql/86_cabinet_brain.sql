-- =============================================
-- JADOMI — Migration 86 : Cabinet Brain
-- Mémoire structurée et évolutive du cabinet
-- 4 tables + pgvector + RLS + GRANT
-- =============================================

-- 0. Activer pgvector si pas encore fait
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================
-- TABLE 1 : cabinet_brain — identité + préférences
-- 1 row par société (cabinet)
-- =============================================
CREATE TABLE IF NOT EXISTS public.cabinet_brain (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,

  -- Identité du cabinet
  identity jsonb DEFAULT '{}'::jsonb,
  -- { nom_cabinet, siret, tva_intra, rpps, num_ordre, adresse, ville, cp, tel,
  --   banque, iban_masque, comptable_nom, comptable_email, assureur, rcp }

  -- Équipe
  team jsonb DEFAULT '[]'::jsonb,
  -- [{ nom, role, horaires, email, tel, conges, specialite }]

  -- Contacts clés (comptable, banque, avocat, assureur, fournisseurs favoris)
  contacts jsonb DEFAULT '[]'::jsonb,
  -- [{ nom, role, email, tel, notes }]

  -- Préférences globales du cabinet
  preferences jsonb DEFAULT '{}'::jsonb,
  -- { ton_mail: "professionnel", langue: "fr", devise: "EUR",
  --   auto_class_factures: true, auto_reponse_simple: false,
  --   digest_heure: "07:30", digest_actif: true,
  --   seuil_validation_montant: 500 }

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT uq_cabinet_brain_societe UNIQUE (societe_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_cabinet_brain_societe ON public.cabinet_brain(societe_id);

-- =============================================
-- TABLE 2 : cabinet_brain_documents — index documents
-- Chaque document du cabinet (facture, devis, STL, radio...)
-- =============================================
CREATE TABLE IF NOT EXISTS public.cabinet_brain_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,

  -- Source du document
  source text NOT NULL DEFAULT 'upload',
  -- 'desktop_agent' | 'mail' | 'upload' | 'scan' | 'connector' | 'ia_doc'

  -- Type de document
  doc_type text NOT NULL DEFAULT 'autre',
  -- 'facture' | 'devis' | 'ordonnance' | 'certificat' | 'contrat' | 'stl'
  -- | 'radio' | 'photo' | 'courrier' | 'compte_rendu' | 'autre'

  -- Métadonnées
  title text NOT NULL,
  content_text text,              -- OCR / texte extrait
  metadata jsonb DEFAULT '{}'::jsonb,
  -- { montant, tva, fournisseur, patient_id, date_document, ref_facture,
  --   expediteur, destinataire, tags[], categorie_compta }

  -- Recherche sémantique (pgvector)
  embedding vector(1536),

  -- Stockage
  storage_path text,              -- chemin R2 ou local
  file_size integer,              -- taille en octets
  mime_type text,                 -- application/pdf, image/jpeg, etc.
  checksum text,                  -- SHA-256 intégrité

  -- Classification IA
  classification jsonb DEFAULT '{}'::jsonb,
  -- { categorie, confidence, agent, classified_at }

  -- État
  indexed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),

  -- Contrainte : pas de doublon même fichier même société
  CONSTRAINT uq_brain_doc_checksum UNIQUE (societe_id, checksum)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_brain_docs_societe ON public.cabinet_brain_documents(societe_id);
CREATE INDEX IF NOT EXISTS idx_brain_docs_type ON public.cabinet_brain_documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_brain_docs_source ON public.cabinet_brain_documents(source);
CREATE INDEX IF NOT EXISTS idx_brain_docs_created ON public.cabinet_brain_documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brain_docs_title_search ON public.cabinet_brain_documents USING gin(to_tsvector('french', title));
CREATE INDEX IF NOT EXISTS idx_brain_docs_content_search ON public.cabinet_brain_documents USING gin(to_tsvector('french', coalesce(content_text, '')));

-- Index HNSW pour recherche vectorielle (si pgvector >= 0.5)
-- CREATE INDEX IF NOT EXISTS idx_brain_docs_embedding ON public.cabinet_brain_documents USING hnsw(embedding vector_cosine_ops);

-- =============================================
-- TABLE 3 : cabinet_brain_events — journal apprentissage
-- Le Brain observe et apprend des actions utilisateur
-- =============================================
CREATE TABLE IF NOT EXISTS public.cabinet_brain_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  user_id uuid,                   -- qui a fait l'action (null = système)

  -- Type d'événement
  event_type text NOT NULL,
  -- 'document_filed' | 'document_renamed' | 'mail_classified' | 'mail_replied'
  -- | 'task_created' | 'task_completed' | 'rule_triggered' | 'rule_corrected'
  -- | 'search_performed' | 'preference_changed' | 'connector_synced'

  -- Contexte de l'événement
  context jsonb DEFAULT '{}'::jsonb,
  -- { quoi, pourquoi, résultat, document_id, mail_id, rule_id, ... }

  -- Action corrective de l'utilisateur (si le Brain s'est trompé)
  user_correction text,           -- ex: "Non, c'est une facture pas un devis"

  created_at timestamptz DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_brain_events_societe ON public.cabinet_brain_events(societe_id);
CREATE INDEX IF NOT EXISTS idx_brain_events_type ON public.cabinet_brain_events(event_type);
CREATE INDEX IF NOT EXISTS idx_brain_events_created ON public.cabinet_brain_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brain_events_user ON public.cabinet_brain_events(user_id);

-- =============================================
-- TABLE 4 : cabinet_brain_rules — règles apprises/configurées
-- Le Brain propose des automatisations, l'utilisateur valide
-- =============================================
CREATE TABLE IF NOT EXISTS public.cabinet_brain_rules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,

  -- Catégorie de la règle
  category text NOT NULL,
  -- 'mail' | 'compta' | 'agenda' | 'fournisseur' | 'patient' | 'document' | 'general'

  -- Description lisible
  rule_name text NOT NULL,        -- ex: "Classer factures GACD en Comptabilité"
  rule_text text NOT NULL,        -- description complète

  -- Conditions d'application (quand la règle se déclenche)
  conditions jsonb DEFAULT '{}'::jsonb,
  -- { trigger: 'mail_received', match: { from_contains: 'gacd' } }

  -- Actions à effectuer
  actions jsonb DEFAULT '[]'::jsonb,
  -- [{ action: 'classify_document', params: { category: 'comptabilite' } },
  --  { action: 'create_task', params: { title: 'Vérifier facture GACD' } }]

  -- Confiance et source
  confidence float DEFAULT 1.0,   -- 0.0 à 1.0
  source text DEFAULT 'user_configured',
  -- 'user_configured' | 'learned' | 'default' | 'suggested'

  -- État
  active boolean DEFAULT true,
  times_triggered integer DEFAULT 0,
  times_corrected integer DEFAULT 0,
  last_triggered_at timestamptz,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_brain_rules_societe ON public.cabinet_brain_rules(societe_id);
CREATE INDEX IF NOT EXISTS idx_brain_rules_category ON public.cabinet_brain_rules(category);
CREATE INDEX IF NOT EXISTS idx_brain_rules_active ON public.cabinet_brain_rules(active) WHERE active = true;

-- =============================================
-- TABLE 5 : cabinet_brain_tasks — tâches auto-générées
-- Le Brain génère des tâches depuis mails, documents, événements
-- =============================================
CREATE TABLE IF NOT EXISTS public.cabinet_brain_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,

  -- Qui
  assigned_to uuid,               -- user_id assigné (null = non assigné)
  created_by text DEFAULT 'brain', -- 'brain' | 'user' | 'mail_copilot' | 'rule'

  -- Quoi
  title text NOT NULL,
  description text,
  category text DEFAULT 'general',
  -- 'compta' | 'fournisseur' | 'patient' | 'admin' | 'labo' | 'general'

  -- Priorité et deadline
  priority text DEFAULT 'normal',  -- 'urgent' | 'high' | 'normal' | 'low'
  due_date date,

  -- Lien vers la source
  source_type text,                -- 'mail' | 'document' | 'rule' | 'event'
  source_id text,                  -- id du mail/document/rule qui a généré la tâche
  source_context jsonb DEFAULT '{}'::jsonb,

  -- État
  status text DEFAULT 'todo',     -- 'todo' | 'in_progress' | 'done' | 'cancelled'
  completed_at timestamptz,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_brain_tasks_societe ON public.cabinet_brain_tasks(societe_id);
CREATE INDEX IF NOT EXISTS idx_brain_tasks_status ON public.cabinet_brain_tasks(status);
CREATE INDEX IF NOT EXISTS idx_brain_tasks_assigned ON public.cabinet_brain_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_brain_tasks_due ON public.cabinet_brain_tasks(due_date) WHERE status IN ('todo', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_brain_tasks_priority ON public.cabinet_brain_tasks(priority) WHERE status IN ('todo', 'in_progress');

-- =============================================
-- GRANTS (OBLIGATOIRE — Supabase API access)
-- =============================================
GRANT SELECT ON public.cabinet_brain TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cabinet_brain TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cabinet_brain TO service_role;

GRANT SELECT ON public.cabinet_brain_documents TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cabinet_brain_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cabinet_brain_documents TO service_role;

GRANT SELECT ON public.cabinet_brain_events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cabinet_brain_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cabinet_brain_events TO service_role;

GRANT SELECT ON public.cabinet_brain_rules TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cabinet_brain_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cabinet_brain_rules TO service_role;

GRANT SELECT ON public.cabinet_brain_tasks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cabinet_brain_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cabinet_brain_tasks TO service_role;

-- =============================================
-- RLS (Row Level Security)
-- =============================================
ALTER TABLE public.cabinet_brain ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cabinet_brain_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cabinet_brain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cabinet_brain_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cabinet_brain_tasks ENABLE ROW LEVEL SECURITY;

-- Policies : chaque cabinet ne voit que ses données
CREATE POLICY "brain_own_societe" ON public.cabinet_brain
  FOR ALL USING (societe_id IN (
    SELECT societe_id FROM public.user_societe_roles WHERE user_id = auth.uid()
  ));

CREATE POLICY "brain_docs_own_societe" ON public.cabinet_brain_documents
  FOR ALL USING (societe_id IN (
    SELECT societe_id FROM public.user_societe_roles WHERE user_id = auth.uid()
  ));

CREATE POLICY "brain_events_own_societe" ON public.cabinet_brain_events
  FOR ALL USING (societe_id IN (
    SELECT societe_id FROM public.user_societe_roles WHERE user_id = auth.uid()
  ));

CREATE POLICY "brain_rules_own_societe" ON public.cabinet_brain_rules
  FOR ALL USING (societe_id IN (
    SELECT societe_id FROM public.user_societe_roles WHERE user_id = auth.uid()
  ));

CREATE POLICY "brain_tasks_own_societe" ON public.cabinet_brain_tasks
  FOR ALL USING (societe_id IN (
    SELECT societe_id FROM public.user_societe_roles WHERE user_id = auth.uid()
  ));

-- Service role bypass (pour les opérations serveur)
CREATE POLICY "brain_service_role" ON public.cabinet_brain
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "brain_docs_service_role" ON public.cabinet_brain_documents
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "brain_events_service_role" ON public.cabinet_brain_events
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "brain_rules_service_role" ON public.cabinet_brain_rules
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "brain_tasks_service_role" ON public.cabinet_brain_tasks
  FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- FONCTION : recherche hybride (full-text + sémantique)
-- =============================================
CREATE OR REPLACE FUNCTION search_brain_documents(
  p_societe_id uuid,
  p_query text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  title text,
  doc_type text,
  source text,
  content_preview text,
  metadata jsonb,
  relevance float,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.doc_type,
    d.source,
    left(d.content_text, 200) as content_preview,
    d.metadata,
    ts_rank(
      to_tsvector('french', d.title || ' ' || coalesce(d.content_text, '')),
      plainto_tsquery('french', p_query)
    ) as relevance,
    d.created_at
  FROM public.cabinet_brain_documents d
  WHERE d.societe_id = p_societe_id
    AND (
      to_tsvector('french', d.title || ' ' || coalesce(d.content_text, ''))
      @@ plainto_tsquery('french', p_query)
      OR d.title ILIKE '%' || p_query || '%'
      OR d.content_text ILIKE '%' || p_query || '%'
    )
  ORDER BY relevance DESC, d.created_at DESC
  LIMIT p_limit;
END;
$$;

-- =============================================
-- FONCTION : statistiques Brain par cabinet
-- =============================================
CREATE OR REPLACE FUNCTION get_brain_stats(p_societe_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'documents_total', (SELECT count(*) FROM cabinet_brain_documents WHERE societe_id = p_societe_id),
    'documents_par_type', (
      SELECT jsonb_object_agg(doc_type, cnt)
      FROM (SELECT doc_type, count(*) as cnt FROM cabinet_brain_documents WHERE societe_id = p_societe_id GROUP BY doc_type) sub
    ),
    'rules_actives', (SELECT count(*) FROM cabinet_brain_rules WHERE societe_id = p_societe_id AND active = true),
    'rules_apprises', (SELECT count(*) FROM cabinet_brain_rules WHERE societe_id = p_societe_id AND source = 'learned'),
    'tasks_todo', (SELECT count(*) FROM cabinet_brain_tasks WHERE societe_id = p_societe_id AND status = 'todo'),
    'tasks_done_30j', (SELECT count(*) FROM cabinet_brain_tasks WHERE societe_id = p_societe_id AND status = 'done' AND completed_at > now() - interval '30 days'),
    'events_30j', (SELECT count(*) FROM cabinet_brain_events WHERE societe_id = p_societe_id AND created_at > now() - interval '30 days')
  ) INTO result;

  RETURN coalesce(result, '{}'::jsonb);
END;
$$;
