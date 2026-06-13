-- =============================================
-- JCI — JADOMI Core Intelligence
-- Migration : tables du moteur d'intelligence collective
--
-- ZERO vocabulaire metier dans les tables.
-- Les "types" sont des strings libres definis par les plugins.
-- =============================================

-- Activer pgvector si pas deja fait
CREATE EXTENSION IF NOT EXISTS vector;

-- ═══════════════════════════════════════
-- KNOWLEDGE GRAPH
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS jci_nodes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  embedding vector(384),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jci_nodes_societe_type ON jci_nodes(societe_id, type);
CREATE INDEX IF NOT EXISTS idx_jci_nodes_label ON jci_nodes USING gin(to_tsvector('french', label));

CREATE TABLE IF NOT EXISTS jci_edges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL,
  from_node UUID REFERENCES jci_nodes(id) ON DELETE CASCADE,
  to_node UUID REFERENCES jci_nodes(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  weight REAL DEFAULT 1.0,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jci_edges_from ON jci_edges(from_node);
CREATE INDEX IF NOT EXISTS idx_jci_edges_to ON jci_edges(to_node);
CREATE INDEX IF NOT EXISTS idx_jci_edges_relation ON jci_edges(societe_id, relation);

-- ═══════════════════════════════════════
-- DEBATE ENGINE
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS jci_debates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL,
  question TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  phase TEXT DEFAULT 'question'
    CHECK (phase IN ('question','independent','publish','contradiction','debate','synthesis','decision')),
  status TEXT DEFAULT 'active'
    CHECK (status IN ('active','completed','aborted')),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jci_debates_societe ON jci_debates(societe_id, status);

CREATE TABLE IF NOT EXISTS jci_opinions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  debate_id UUID REFERENCES jci_debates(id) ON DELETE CASCADE,
  agent_role TEXT NOT NULL,
  phase TEXT NOT NULL
    CHECK (phase IN ('independent','contradiction','debate','synthesis')),
  round INT DEFAULT 1,
  opinion TEXT NOT NULL,
  position TEXT DEFAULT 'neutral'
    CHECK (position IN ('for','against','neutral')),
  confidence REAL DEFAULT 0.5
    CHECK (confidence >= 0 AND confidence <= 1),
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jci_opinions_debate ON jci_opinions(debate_id, phase);

-- ═══════════════════════════════════════
-- DECISIONS
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS jci_decisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID NOT NULL,
  debate_id UUID REFERENCES jci_debates(id),
  decision TEXT NOT NULL,
  confidence REAL NOT NULL
    CHECK (confidence >= 0 AND confidence <= 1),
  action TEXT DEFAULT 'decide'
    CHECK (action IN ('decide','no_action','wait')),
  approved BOOLEAN,
  outcome JSONB,
  correct BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now(),
  feedback_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jci_decisions_societe ON jci_decisions(societe_id, action);
CREATE INDEX IF NOT EXISTS idx_jci_decisions_feedback ON jci_decisions(correct) WHERE correct IS NOT NULL;

-- ═══════════════════════════════════════
-- AGENT REPUTATION
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS jci_agent_reputation (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_role TEXT NOT NULL UNIQUE,
  precision_score REAL DEFAULT 0.5
    CHECK (precision_score >= 0 AND precision_score <= 1),
  weight REAL DEFAULT 1.0
    CHECK (weight >= 0.2 AND weight <= 3.0),
  outcomes_count INT DEFAULT 0,
  correct_count INT DEFAULT 0,
  trend TEXT DEFAULT 'stable'
    CHECK (trend IN ('up','down','stable')),
  last_recalc TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════
-- AUDIT REPORTS
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS jci_audit_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societe_id UUID,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  decisions_count INT DEFAULT 0,
  accuracy REAL,
  biases JSONB DEFAULT '[]',
  top_agents JSONB DEFAULT '[]',
  report JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jci_audit_societe ON jci_audit_reports(societe_id);

-- ═══════════════════════════════════════
-- GRANTS (regle CLAUDE.md — obligatoire)
-- ═══════════════════════════════════════

GRANT SELECT ON jci_nodes TO anon;
GRANT SELECT ON jci_edges TO anon;
GRANT SELECT ON jci_debates TO anon;
GRANT SELECT ON jci_opinions TO anon;
GRANT SELECT ON jci_decisions TO anon;
GRANT SELECT ON jci_agent_reputation TO anon;
GRANT SELECT ON jci_audit_reports TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON jci_nodes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON jci_edges TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON jci_debates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON jci_opinions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON jci_decisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON jci_agent_reputation TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON jci_audit_reports TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON jci_nodes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON jci_edges TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON jci_debates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON jci_opinions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON jci_decisions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON jci_agent_reputation TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON jci_audit_reports TO service_role;

-- ═══════════════════════════════════════
-- RLS (regle CLAUDE.md — obligatoire)
-- ═══════════════════════════════════════

ALTER TABLE jci_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE jci_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE jci_debates ENABLE ROW LEVEL SECURITY;
ALTER TABLE jci_opinions ENABLE ROW LEVEL SECURITY;
ALTER TABLE jci_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE jci_agent_reputation ENABLE ROW LEVEL SECURITY;
ALTER TABLE jci_audit_reports ENABLE ROW LEVEL SECURITY;

-- Policies permissives (a durcir par societe_id plus tard)
CREATE POLICY "jci_nodes_all" ON jci_nodes FOR ALL USING (true);
CREATE POLICY "jci_edges_all" ON jci_edges FOR ALL USING (true);
CREATE POLICY "jci_debates_all" ON jci_debates FOR ALL USING (true);
CREATE POLICY "jci_opinions_all" ON jci_opinions FOR ALL USING (true);
CREATE POLICY "jci_decisions_all" ON jci_decisions FOR ALL USING (true);
CREATE POLICY "jci_reputation_all" ON jci_agent_reputation FOR ALL USING (true);
CREATE POLICY "jci_audit_all" ON jci_audit_reports FOR ALL USING (true);
