-- =============================================
-- JADOMI BRAIN — Vector Store Migration
-- Table: code_embeddings
-- Extension: pgvector (vector(384))
--
-- Apply via Supabase SQL editor or CLI:
--   psql $DATABASE_URL -f migration-vectors.sql
-- =============================================

-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

-- Code embeddings table
CREATE TABLE IF NOT EXISTS public.code_embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_path TEXT NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  embedding vector(384),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(file_path, chunk_index)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_code_embeddings_file_path ON public.code_embeddings(file_path);
CREATE INDEX IF NOT EXISTS idx_code_embeddings_metadata ON public.code_embeddings USING gin(metadata);

-- HNSW index for fast vector similarity search
CREATE INDEX IF NOT EXISTS idx_code_embeddings_embedding ON public.code_embeddings
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- Similarity search function (cosine distance)
CREATE OR REPLACE FUNCTION match_code_embeddings(
  query_embedding vector(384),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  file_path TEXT,
  chunk_text TEXT,
  chunk_index INTEGER,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.id,
    ce.file_path,
    ce.chunk_text,
    ce.chunk_index,
    ce.metadata,
    1 - (ce.embedding <=> query_embedding) AS similarity
  FROM public.code_embeddings ce
  WHERE 1 - (ce.embedding <=> query_embedding) > match_threshold
  ORDER BY ce.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- GRANT statements (OBLIGATOIRE — CLAUDE.md Supabase rules)
GRANT SELECT ON public.code_embeddings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.code_embeddings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.code_embeddings TO service_role;

-- RLS (OBLIGATOIRE — CLAUDE.md Supabase rules)
ALTER TABLE public.code_embeddings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "service_role_full_access" ON public.code_embeddings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read" ON public.code_embeddings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "anon_read" ON public.code_embeddings
  FOR SELECT TO anon USING (true);
