-- =============================================
-- JADOMI — Table rapports securite
-- Stocke les resultats des scans nocturnes
-- Passe 54 — Securite niveau etatique
-- =============================================

CREATE TABLE IF NOT EXISTS security_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Antivirus (ClamAV)
  antivirus_status VARCHAR(20) DEFAULT 'unknown', -- clean, INFECTED, clamav_not_installed
  antivirus_scanned INT DEFAULT 0,
  antivirus_infected INT DEFAULT 0,

  -- Rootkit (rkhunter)
  rootkit_status VARCHAR(20) DEFAULT 'unknown', -- clean, warnings
  rootkit_warnings INT DEFAULT 0,

  -- Integrite fichiers
  integrity_status VARCHAR(20) DEFAULT 'unknown', -- clean, modified
  integrity_changes INT DEFAULT 0,

  -- Reseau
  network_suspicious_ports INT DEFAULT 0,
  network_suspicious_procs INT DEFAULT 0,
  network_failed_ssh INT DEFAULT 0,

  -- Ressources
  memory_pct INT DEFAULT 0,
  disk_pct INT DEFAULT 0,

  -- Score global (0-100)
  security_score INT DEFAULT 100,

  -- Rapport complet JSON
  raw_report JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour requetes dashboard
CREATE INDEX IF NOT EXISTS idx_security_reports_date ON security_reports(report_date DESC);

-- RLS : service_role only pour insert, admin pour select
ALTER TABLE security_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY security_reports_service_insert ON security_reports
  FOR INSERT WITH CHECK (true);

CREATE POLICY security_reports_read ON security_reports
  FOR SELECT USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');
