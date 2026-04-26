-- =============================================
-- JADOMI — Passe 54 : Facturation Pro (Mandat art. 289 CGI)
-- 26 avril 2026
--
-- JADOMI emet des factures AU NOM ET POUR LE COMPTE des fournisseurs.
-- Commission JADOMI sur chaque transaction.
-- Format Factur-X (PDF/A-3 + XML CII) conforme EN 16931.
-- =============================================

-- ════════════════════════════════════════════
-- TABLE 1 : supplier_mandates (mandats de facturation)
-- Le fournisseur autorise JADOMI a facturer en son nom
-- ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS supplier_mandates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Fournisseur (mandant)
  supplier_id UUID NOT NULL,
  supplier_name VARCHAR(200) NOT NULL,
  supplier_legal_name VARCHAR(300),       -- raison sociale exacte
  supplier_siret VARCHAR(20),
  supplier_tva_intracom VARCHAR(20),
  supplier_adresse TEXT,
  supplier_code_postal VARCHAR(10),
  supplier_ville VARCHAR(100),
  supplier_email VARCHAR(200) NOT NULL,
  supplier_telephone VARCHAR(30),
  supplier_iban VARCHAR(34),              -- pour reversement
  supplier_bic VARCHAR(11),

  -- Mandataire (JADOMI)
  jadomi_entity_name VARCHAR(200) DEFAULT 'JADOMI SAS',
  jadomi_siret VARCHAR(20),
  jadomi_tva_intracom VARCHAR(20),
  jadomi_adresse TEXT,

  -- Termes du mandat
  commission_percent NUMERIC(5,2) DEFAULT 3.00,  -- commission JADOMI %
  commission_fixed_eur NUMERIC(10,2) DEFAULT 0,  -- commission fixe par facture
  payment_delay_days INTEGER DEFAULT 30,          -- delai reversement fournisseur
  contestation_delay_days INTEGER DEFAULT 15,     -- delai contestation facture
  auto_acceptance BOOLEAN DEFAULT TRUE,           -- acceptation tacite apres delai

  -- Scope du mandat
  scope VARCHAR(50) DEFAULT 'all_gpo' CHECK (scope IN (
    'all_gpo',          -- toutes les commandes GPO
    'specific_products', -- produits specifiques
    'specific_period'    -- periode definie
  )),
  scope_details JSONB,

  -- Signature
  status VARCHAR(30) DEFAULT 'draft' CHECK (status IN (
    'draft',            -- brouillon, pas encore envoye
    'sent',             -- envoye au fournisseur
    'viewed',           -- fournisseur a ouvert le lien
    'signed',           -- fournisseur a signe
    'active',           -- mandat actif (apres validation JADOMI)
    'suspended',        -- suspendu temporairement
    'revoked',          -- revoque par une partie
    'expired'           -- expire
  )),
  signature_token VARCHAR(100),           -- token unique pour page signature
  signed_at TIMESTAMPTZ,
  signed_ip VARCHAR(50),
  signed_user_agent TEXT,
  signature_pdf_url TEXT,                 -- copie signee archivee

  -- Validite
  valid_from DATE,
  valid_until DATE,                       -- null = illimite
  revoked_at TIMESTAMPTZ,
  revoked_by VARCHAR(50),                 -- 'supplier' ou 'jadomi'
  revocation_reason TEXT,

  -- Compteurs
  invoices_emitted INTEGER DEFAULT 0,
  total_invoiced_ht NUMERIC(14,2) DEFAULT 0,
  total_commission_ht NUMERIC(14,2) DEFAULT 0,

  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sm_supplier ON supplier_mandates(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sm_status ON supplier_mandates(status);
CREATE INDEX IF NOT EXISTS idx_sm_token ON supplier_mandates(signature_token);

ALTER TABLE supplier_mandates ENABLE ROW LEVEL SECURITY;
CREATE POLICY sm_service ON supplier_mandates
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY sm_read_auth ON supplier_mandates
  FOR SELECT USING (auth.role() = 'authenticated');

-- ════════════════════════════════════════════
-- TABLE 2 : jadomi_invoices (factures emises par JADOMI)
-- JADOMI facture AU NOM du fournisseur → vers le cabinet
-- ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS jadomi_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Lien commande
  gpo_order_id UUID REFERENCES gpo_orders(id) ON DELETE SET NULL,
  mandate_id UUID REFERENCES supplier_mandates(id) ON DELETE SET NULL,

  -- Numero facture (sequence JADOMI)
  invoice_number VARCHAR(30) NOT NULL,    -- ex: JF-2026-0001
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,

  -- Emetteur (fournisseur via mandat JADOMI)
  supplier_id UUID NOT NULL,
  supplier_name VARCHAR(200) NOT NULL,
  supplier_legal_name VARCHAR(300),
  supplier_siret VARCHAR(20),
  supplier_tva_intracom VARCHAR(20),
  supplier_adresse TEXT,

  -- Destinataire (cabinet acheteur)
  societe_id UUID NOT NULL,
  cabinet_name VARCHAR(200) NOT NULL,
  cabinet_siret VARCHAR(20),
  cabinet_tva_intracom VARCHAR(20),
  cabinet_adresse TEXT,
  cabinet_code_postal VARCHAR(10),
  cabinet_ville VARCHAR(100),

  -- Montants
  items JSONB NOT NULL,                   -- detail des lignes
  total_ht NUMERIC(12,2) NOT NULL,
  tva_rate NUMERIC(5,2) DEFAULT 20.0,
  total_tva NUMERIC(12,2),
  total_ttc NUMERIC(12,2),

  -- Commission JADOMI
  commission_rate NUMERIC(5,2),           -- % applique
  commission_ht NUMERIC(10,2),            -- montant commission HT
  net_supplier_ht NUMERIC(12,2),          -- montant reverse au fournisseur (total_ht - commission)

  -- Fichiers
  pdf_url TEXT,                           -- PDF Factur-X
  pdf_hash TEXT,                          -- SHA256 du PDF
  xml_cii TEXT,                           -- XML CII embarque (Factur-X)
  facturx_profile VARCHAR(20) DEFAULT 'EN16931',

  -- Statut
  status VARCHAR(30) DEFAULT 'draft' CHECK (status IN (
    'draft',            -- brouillon
    'emitted',          -- emise (envoyee au cabinet)
    'accepted',         -- acceptee par fournisseur (tacite ou explicite)
    'contested',        -- contestee par fournisseur dans le delai
    'paid_by_cabinet',  -- cabinet a paye JADOMI
    'reversed',         -- JADOMI a reverse au fournisseur
    'cancelled',        -- annulee
    'credit_note'       -- avoir
  )),
  emitted_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,

  -- Mentions legales obligatoires
  legal_mention TEXT DEFAULT 'Facture emise par JADOMI SAS au nom et pour le compte du fournisseur, conformement a l''article 289-I-2 du Code General des Impots.',

  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ji_order ON jadomi_invoices(gpo_order_id);
CREATE INDEX IF NOT EXISTS idx_ji_mandate ON jadomi_invoices(mandate_id);
CREATE INDEX IF NOT EXISTS idx_ji_supplier ON jadomi_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_ji_societe ON jadomi_invoices(societe_id);
CREATE INDEX IF NOT EXISTS idx_ji_number ON jadomi_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_ji_status ON jadomi_invoices(status);
CREATE INDEX IF NOT EXISTS idx_ji_date ON jadomi_invoices(invoice_date DESC);

ALTER TABLE jadomi_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY ji_service ON jadomi_invoices
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY ji_cabinet_read ON jadomi_invoices
  FOR SELECT USING (societe_id IN (
    SELECT societe_id FROM user_societe_roles WHERE user_id = auth.uid()
  ));

-- ════════════════════════════════════════════
-- TABLE 3 : jadomi_commissions (commissions par transaction)
-- ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS jadomi_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  invoice_id UUID REFERENCES jadomi_invoices(id) ON DELETE CASCADE,
  mandate_id UUID REFERENCES supplier_mandates(id) ON DELETE SET NULL,
  gpo_order_id UUID,

  -- Montants
  invoice_total_ht NUMERIC(12,2) NOT NULL,
  commission_rate NUMERIC(5,2) NOT NULL,
  commission_ht NUMERIC(10,2) NOT NULL,
  commission_tva NUMERIC(10,2),
  commission_ttc NUMERIC(10,2),

  -- Paiement
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN (
    'pending',          -- en attente paiement cabinet
    'collected',        -- cabinet a paye JADOMI
    'reversed',         -- JADOMI a reverse au fournisseur (net de commission)
    'refunded'          -- rembourse
  )),
  collected_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,

  -- Fournisseur
  supplier_id UUID NOT NULL,
  supplier_name VARCHAR(200),
  net_to_reverse NUMERIC(12,2),           -- montant a reverser (total_ht - commission)

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jc_invoice ON jadomi_commissions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_jc_supplier ON jadomi_commissions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_jc_status ON jadomi_commissions(payment_status);

ALTER TABLE jadomi_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY jc_service ON jadomi_commissions
  FOR ALL USING (auth.role() = 'service_role');

-- ════════════════════════════════════════════
-- SEQUENCES factures JADOMI
-- ════════════════════════════════════════════
CREATE SEQUENCE IF NOT EXISTS jadomi_invoice_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS VARCHAR(30) AS $$
BEGIN
  RETURN 'JF-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' ||
         LPAD(nextval('jadomi_invoice_number_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ════════════════════════════════════════════
-- VUE : dashboard commissions JADOMI
-- ════════════════════════════════════════════
CREATE OR REPLACE VIEW v_jadomi_revenue AS
SELECT
  DATE_TRUNC('month', ji.invoice_date)::DATE AS month,
  COUNT(*) AS nb_invoices,
  SUM(ji.total_ht) AS total_facture_ht,
  SUM(ji.commission_ht) AS total_commission_ht,
  SUM(ji.net_supplier_ht) AS total_reverse_fournisseurs,
  COUNT(DISTINCT ji.supplier_id) AS nb_fournisseurs,
  COUNT(DISTINCT ji.societe_id) AS nb_cabinets
FROM jadomi_invoices ji
WHERE ji.status NOT IN ('draft', 'cancelled')
GROUP BY DATE_TRUNC('month', ji.invoice_date)::DATE
ORDER BY month DESC;
