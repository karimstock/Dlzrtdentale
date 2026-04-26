-- =============================================
-- JADOMI — Détection produits identiques (white label)
-- Passe 51b — KILLER FEATURE
--
-- Problème : Le même produit dentaire (fabriqué en Chine ou ailleurs)
-- est vendu sous différentes marques à des prix très différents.
-- Ex: Lime "Reverso" (GACD) = même produit qu'une lime "ProFile" (autre fournisseur)
--     Même usine, même moule, même qualité, prix x2 ou x3.
--
-- Solution : Quand JADOMI scanne un QR code ou une photo, on détecte
-- les ÉQUIVALENCES et on montre au dentiste :
-- "Ce produit est identique à X sous la marque Y, 40% moins cher chez Z"
--
-- 3 niveaux de détection :
-- 1. Même GTIN/code-barres → certitude 100%
-- 2. Même référence fabricant d'origine (manufacturer_ref) → certitude 95%
-- 3. Détection IA (photo similaire, spécifications identiques) → certitude 70-90%
-- =============================================

-- ════════════════════════════════════════════
-- TABLE : product_equivalences
-- ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS product_equivalences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Les deux produits liés
  product_a_id UUID REFERENCES products_database(id) ON DELETE CASCADE,
  product_b_id UUID REFERENCES products_database(id) ON DELETE CASCADE,

  -- Détails de l'équivalence
  equivalence_type VARCHAR(30) NOT NULL,
    -- 'same_gtin'         : même code-barres (=même produit physique, emballage différent)
    -- 'same_manufacturer_ref' : même référence fabricant d'origine (OEM)
    -- 'same_oem'          : même usine/fabricant OEM (ex: même usine chinoise)
    -- 'ai_visual_match'   : détecté par IA (photo similaire)
    -- 'ai_spec_match'     : détecté par IA (spécifications identiques)
    -- 'user_reported'     : signalé par un dentiste
    -- 'community_validated' : confirmé par plusieurs dentistes

  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.70,
    -- 1.00 = same_gtin (certitude absolue)
    -- 0.95 = same_manufacturer_ref
    -- 0.90 = same_oem (confirmé)
    -- 0.70-0.85 = ai_visual_match / ai_spec_match
    -- 0.80 = user_reported
    -- 0.95 = community_validated (3+ confirmations)

  -- Détails OEM (le vrai fabricant, pas le distributeur)
  oem_manufacturer VARCHAR(200),       -- Ex: "Shenzhen Superline Technology Co., Ltd"
  oem_reference VARCHAR(100),          -- Référence chez le fabricant OEM
  oem_country VARCHAR(2),              -- Pays de fabrication (CN, DE, JP...)

  -- Différences connues (même produit mais variantes mineures)
  differences JSONB,
    -- Ex: {"packaging": "différent", "quantity_per_box": "10 vs 6", "sterilization": "identique"}

  -- Validation communautaire
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  reports INTEGER DEFAULT 0,           -- Signalements "c'est pas le même produit"

  -- Qui a créé l'équivalence
  created_by UUID,                     -- user_id (null si IA)
  source VARCHAR(30) NOT NULL DEFAULT 'system',
    -- 'system'        : détecté automatiquement (GTIN, ref)
    -- 'ai'            : détecté par Claude Vision
    -- 'user'          : signalé par un dentiste
    -- 'admin'         : créé par JADOMI admin
    -- 'community'     : validé par la communauté

  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Un couple de produits ne peut apparaître qu'une fois
  UNIQUE(product_a_id, product_b_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_equiv_product_a ON product_equivalences(product_a_id);
CREATE INDEX IF NOT EXISTS idx_equiv_product_b ON product_equivalences(product_b_id);
CREATE INDEX IF NOT EXISTS idx_equiv_type ON product_equivalences(equivalence_type);
CREATE INDEX IF NOT EXISTS idx_equiv_confidence ON product_equivalences(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_equiv_oem ON product_equivalences(oem_manufacturer);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trg_product_equiv_updated()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_product_equiv_updated ON product_equivalences;
CREATE TRIGGER trg_product_equiv_updated
  BEFORE UPDATE ON product_equivalences
  FOR EACH ROW EXECUTE FUNCTION trg_product_equiv_updated();

-- RLS
ALTER TABLE product_equivalences ENABLE ROW LEVEL SECURITY;
CREATE POLICY equiv_read_all ON product_equivalences
  FOR SELECT USING (true);
CREATE POLICY equiv_insert_auth ON product_equivalences
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY equiv_update_auth ON product_equivalences
  FOR UPDATE USING (auth.role() = 'authenticated');

-- ════════════════════════════════════════════
-- VUE : Produits équivalents avec prix comparés
-- Quand on scanne un produit, on veut voir instantanément
-- toutes les alternatives moins chères
-- ════════════════════════════════════════════
CREATE OR REPLACE VIEW v_product_equivalences_with_prices AS
SELECT
  pe.id AS equivalence_id,
  pe.equivalence_type,
  pe.confidence,
  pe.oem_manufacturer,
  pe.oem_country,

  -- Produit A
  pa.id AS product_a_id,
  pa.name AS product_a_name,
  pa.brand AS product_a_brand,
  pa.manufacturer AS product_a_manufacturer,
  pa.gtin AS product_a_gtin,

  -- Produit B
  pb.id AS product_b_id,
  pb.name AS product_b_name,
  pb.brand AS product_b_brand,
  pb.manufacturer AS product_b_manufacturer,
  pb.gtin AS product_b_gtin,

  -- Prix les plus récents (via supplier_prices)
  (SELECT price_negotiated FROM supplier_prices
   WHERE product_id = pa.id AND price_negotiated > 0
   ORDER BY observed_at DESC LIMIT 1) AS price_a,

  (SELECT supplier_name FROM supplier_prices
   WHERE product_id = pa.id AND price_negotiated > 0
   ORDER BY observed_at DESC LIMIT 1) AS supplier_a,

  (SELECT price_negotiated FROM supplier_prices
   WHERE product_id = pb.id AND price_negotiated > 0
   ORDER BY observed_at DESC LIMIT 1) AS price_b,

  (SELECT supplier_name FROM supplier_prices
   WHERE product_id = pb.id AND price_negotiated > 0
   ORDER BY observed_at DESC LIMIT 1) AS supplier_b

FROM product_equivalences pe
JOIN products_database pa ON pe.product_a_id = pa.id
JOIN products_database pb ON pe.product_b_id = pb.id
WHERE pe.confidence >= 0.70
  AND pe.downvotes < 3;
