-- =============================================
-- JADOMI — Passe 52 : Compare + Intelligence Achats
-- 26 avril 2026
--
-- Nouvelles tables :
-- 1. price_watches      — Alertes prix ("Prevenez-moi quand ce produit baisse")
-- 2. spend_snapshots    — Snapshots mensuels depenses par categorie/fournisseur
-- 3. cabinet_benchmarks — Benchmark anonyme inter-cabinets
--
-- Nouvelles vues :
-- 4. v_economies_jadomi     — Tous les produits ou un meilleur prix existe
-- 5. v_spend_by_category    — Depenses par categorie
-- 6. v_spend_by_supplier    — Depenses par fournisseur
-- 7. v_price_history        — Historique prix par produit (courbe)
-- 8. v_benchmark_category   — Benchmark anonyme par categorie
-- =============================================

-- ════════════════════════════════════════════
-- TABLE 1 : price_watches (Alertes prix)
-- Le dentiste surveille un produit : "Prevenez-moi quand < 35EUR"
-- ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS price_watches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL,
  user_id UUID NOT NULL,

  -- Produit surveille
  product_id UUID REFERENCES products_database(id) ON DELETE CASCADE,
  gtin VARCHAR(14),
  product_name VARCHAR(300), -- cache pour affichage rapide

  -- Seuil d'alerte
  target_price NUMERIC(10,2) NOT NULL,
  current_best_price NUMERIC(10,2),
  current_best_supplier VARCHAR(100),

  -- Etat
  is_active BOOLEAN DEFAULT TRUE,
  triggered_at TIMESTAMPTZ,         -- derniere fois que l'alerte s'est declenchee
  triggered_count INTEGER DEFAULT 0,

  -- Notification
  notify_email BOOLEAN DEFAULT TRUE,
  notify_push BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pw_societe ON price_watches(societe_id);
CREATE INDEX IF NOT EXISTS idx_pw_product ON price_watches(product_id);
CREATE INDEX IF NOT EXISTS idx_pw_gtin ON price_watches(gtin);
CREATE INDEX IF NOT EXISTS idx_pw_active ON price_watches(is_active) WHERE is_active = TRUE;

ALTER TABLE price_watches ENABLE ROW LEVEL SECURITY;
CREATE POLICY pw_own ON price_watches
  FOR ALL USING (auth.uid() = user_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trg_price_watches_updated()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_price_watches_updated ON price_watches;
CREATE TRIGGER trg_price_watches_updated
  BEFORE UPDATE ON price_watches
  FOR EACH ROW EXECUTE FUNCTION trg_price_watches_updated();

-- ════════════════════════════════════════════
-- TABLE 2 : spend_snapshots (Snapshots mensuels)
-- Agrege les depenses chaque mois pour analytics rapide
-- ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS spend_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL,

  -- Periode
  period_month DATE NOT NULL, -- toujours le 1er du mois (2026-04-01)

  -- Ventilation
  category VARCHAR(100),      -- 'Composites', 'Endodontie', 'ALL' pour total
  supplier_name VARCHAR(100), -- 'DPI', 'GACD', 'ALL' pour total

  -- Montants
  total_ht NUMERIC(12,2) DEFAULT 0,
  total_ttc NUMERIC(12,2) DEFAULT 0,
  nb_invoices INTEGER DEFAULT 0,
  nb_products INTEGER DEFAULT 0,
  nb_units INTEGER DEFAULT 0,

  -- Comparaison marche
  best_possible_ht NUMERIC(12,2),  -- si on avait pris le moins cher a chaque fois
  potential_savings NUMERIC(12,2),  -- total_ht - best_possible_ht

  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Un seul snapshot par mois/categorie/fournisseur/cabinet
  UNIQUE(societe_id, period_month, category, supplier_name)
);

CREATE INDEX IF NOT EXISTS idx_ss_societe ON spend_snapshots(societe_id);
CREATE INDEX IF NOT EXISTS idx_ss_period ON spend_snapshots(period_month DESC);
CREATE INDEX IF NOT EXISTS idx_ss_category ON spend_snapshots(category);
CREATE INDEX IF NOT EXISTS idx_ss_supplier ON spend_snapshots(supplier_name);

ALTER TABLE spend_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY ss_own ON spend_snapshots
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ════════════════════════════════════════════
-- TABLE 3 : cabinet_benchmarks (Benchmark anonyme)
-- Donnees ANONYMISEES pour comparer entre cabinets
-- Jamais de lien direct vers un cabinet specifique
-- ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS cabinet_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Periode
  period_month DATE NOT NULL,

  -- Segmentation anonyme (pour comparer des comparables)
  cabinet_size VARCHAR(20) NOT NULL,     -- 'solo', '2-3_praticiens', '4+'
  cabinet_region VARCHAR(50),            -- 'Hauts-de-France', 'Ile-de-France'...
  cabinet_specialty VARCHAR(50),         -- 'omnipratique', 'orthodontie', 'implanto'

  -- Categorie de produits
  category VARCHAR(100) NOT NULL,

  -- Stats anonymisees (agregees sur tous les cabinets du segment)
  avg_spend_ht NUMERIC(10,2),
  median_spend_ht NUMERIC(10,2),
  p25_spend_ht NUMERIC(10,2),           -- 25e percentile (les plus economes)
  p75_spend_ht NUMERIC(10,2),           -- 75e percentile (les plus depensiers)
  avg_price_per_unit NUMERIC(10,2),
  nb_cabinets INTEGER DEFAULT 0,        -- nombre de cabinets dans ce segment

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(period_month, cabinet_size, cabinet_region, cabinet_specialty, category)
);

CREATE INDEX IF NOT EXISTS idx_cb_period ON cabinet_benchmarks(period_month DESC);
CREATE INDEX IF NOT EXISTS idx_cb_category ON cabinet_benchmarks(category);
CREATE INDEX IF NOT EXISTS idx_cb_size ON cabinet_benchmarks(cabinet_size);
CREATE INDEX IF NOT EXISTS idx_cb_region ON cabinet_benchmarks(cabinet_region);

-- Pas de RLS strict ici : ce sont des donnees anonymes, lisibles par tous
ALTER TABLE cabinet_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY cb_read_all ON cabinet_benchmarks
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY cb_insert_system ON cabinet_benchmarks
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ════════════════════════════════════════════
-- VUE 4 : v_economies_jadomi
-- Tous les produits commandes ou un meilleur prix existe ailleurs
-- C'est le coeur de l'onglet "Economies JADOMI"
-- ════════════════════════════════════════════
CREATE OR REPLACE VIEW v_economies_jadomi AS
WITH latest_purchases AS (
  -- Dernier prix paye par chaque cabinet pour chaque produit
  SELECT DISTINCT ON (sp.societe_id, sp.gtin)
    sp.societe_id,
    sp.gtin,
    sp.product_id,
    sp.supplier_name AS current_supplier,
    COALESCE(sp.price_negotiated, sp.price_catalog) AS price_paid,
    sp.observed_at AS last_purchased,
    pd.name_fr AS product_name,
    pd.name AS product_name_en,
    pd.brand,
    pd.category,
    pd.image_url
  FROM supplier_prices sp
  LEFT JOIN products_database pd ON sp.product_id = pd.id
  WHERE sp.societe_id IS NOT NULL
    AND COALESCE(sp.price_negotiated, sp.price_catalog) > 0
  ORDER BY sp.societe_id, sp.gtin, sp.observed_at DESC
),
best_market AS (
  -- Meilleur prix du marche pour chaque produit (tous fournisseurs confondus)
  SELECT DISTINCT ON (gtin)
    gtin,
    supplier_name AS best_supplier,
    COALESCE(price_negotiated, price_catalog) AS best_price,
    observed_at AS best_price_date
  FROM supplier_prices
  WHERE COALESCE(price_negotiated, price_catalog) > 0
  ORDER BY gtin, COALESCE(price_negotiated, price_catalog) ASC
)
SELECT
  lp.societe_id,
  lp.gtin,
  lp.product_id,
  COALESCE(lp.product_name, lp.product_name_en, 'Produit inconnu') AS product_name,
  lp.brand,
  lp.category,
  lp.image_url,
  lp.current_supplier,
  lp.price_paid,
  lp.last_purchased,
  bm.best_supplier,
  bm.best_price,
  bm.best_price_date,
  -- Economies
  (lp.price_paid - bm.best_price) AS savings_per_unit,
  CASE WHEN lp.price_paid > 0
    THEN ROUND(((lp.price_paid - bm.best_price) / lp.price_paid * 100)::NUMERIC, 1)
    ELSE 0
  END AS savings_percent
FROM latest_purchases lp
JOIN best_market bm ON lp.gtin = bm.gtin
WHERE bm.best_price < lp.price_paid  -- uniquement si meilleur prix existe
  AND (lp.price_paid - bm.best_price) > 0.50  -- seuil minimum 0.50EUR
ORDER BY (lp.price_paid - bm.best_price) DESC; -- plus grosse economie d'abord

-- ════════════════════════════════════════════
-- VUE 5 : v_spend_by_category
-- Depenses par categorie pour un cabinet
-- ════════════════════════════════════════════
CREATE OR REPLACE VIEW v_spend_by_category AS
SELECT
  sp.societe_id,
  pd.category,
  DATE_TRUNC('month', sp.observed_at)::DATE AS month,
  COUNT(*) AS nb_purchases,
  SUM(COALESCE(sp.price_negotiated, sp.price_catalog)) AS total_ht,
  AVG(COALESCE(sp.price_negotiated, sp.price_catalog)) AS avg_price,
  COUNT(DISTINCT sp.supplier_name) AS nb_suppliers
FROM supplier_prices sp
LEFT JOIN products_database pd ON sp.product_id = pd.id
WHERE sp.societe_id IS NOT NULL
  AND COALESCE(sp.price_negotiated, sp.price_catalog) > 0
GROUP BY sp.societe_id, pd.category, DATE_TRUNC('month', sp.observed_at)::DATE;

-- ════════════════════════════════════════════
-- VUE 6 : v_spend_by_supplier
-- Depenses par fournisseur pour un cabinet
-- ════════════════════════════════════════════
CREATE OR REPLACE VIEW v_spend_by_supplier AS
SELECT
  sp.societe_id,
  sp.supplier_name,
  DATE_TRUNC('month', sp.observed_at)::DATE AS month,
  COUNT(*) AS nb_purchases,
  SUM(COALESCE(sp.price_negotiated, sp.price_catalog)) AS total_ht,
  AVG(COALESCE(sp.price_negotiated, sp.price_catalog)) AS avg_price,
  COUNT(DISTINCT pd.category) AS nb_categories
FROM supplier_prices sp
LEFT JOIN products_database pd ON sp.product_id = pd.id
WHERE sp.societe_id IS NOT NULL
  AND COALESCE(sp.price_negotiated, sp.price_catalog) > 0
GROUP BY sp.societe_id, sp.supplier_name, DATE_TRUNC('month', sp.observed_at)::DATE;

-- ════════════════════════════════════════════
-- VUE 7 : v_price_history
-- Historique prix par produit (pour courbe type CamelCamelCamel)
-- ════════════════════════════════════════════
CREATE OR REPLACE VIEW v_price_history AS
SELECT
  sp.gtin,
  sp.product_id,
  pd.name_fr AS product_name,
  pd.brand,
  sp.supplier_name,
  COALESCE(sp.price_negotiated, sp.price_catalog) AS price,
  sp.price_catalog,
  sp.price_negotiated,
  sp.discount_percent,
  sp.observed_at,
  sp.source
FROM supplier_prices sp
LEFT JOIN products_database pd ON sp.product_id = pd.id
WHERE COALESCE(sp.price_negotiated, sp.price_catalog) > 0
ORDER BY sp.gtin, sp.observed_at ASC;

-- ════════════════════════════════════════════
-- VUE 8 : v_benchmark_category
-- Benchmark anonyme : mon cabinet vs la moyenne du segment
-- ════════════════════════════════════════════
CREATE OR REPLACE VIEW v_benchmark_category AS
SELECT
  cb.period_month,
  cb.category,
  cb.cabinet_size,
  cb.cabinet_region,
  cb.avg_spend_ht AS segment_avg,
  cb.median_spend_ht AS segment_median,
  cb.p25_spend_ht AS segment_best_quartile,
  cb.p75_spend_ht AS segment_worst_quartile,
  cb.avg_price_per_unit AS segment_avg_unit_price,
  cb.nb_cabinets AS segment_size
FROM cabinet_benchmarks cb
WHERE cb.nb_cabinets >= 5; -- minimum 5 cabinets pour etre statistiquement pertinent

-- ════════════════════════════════════════════
-- FONCTION : check_price_watches
-- Appelee apres chaque import facture pour declencher les alertes
-- ════════════════════════════════════════════
CREATE OR REPLACE FUNCTION check_price_watches()
RETURNS INTEGER AS $$
DECLARE
  triggered_count INTEGER := 0;
  watch RECORD;
BEGIN
  FOR watch IN
    SELECT pw.id, pw.gtin, pw.target_price, pw.societe_id, pw.user_id,
           pw.product_name
    FROM price_watches pw
    WHERE pw.is_active = TRUE
  LOOP
    -- Chercher si un prix est passe sous le seuil
    PERFORM 1
    FROM supplier_prices sp
    WHERE sp.gtin = watch.gtin
      AND COALESCE(sp.price_negotiated, sp.price_catalog) <= watch.target_price
      AND sp.observed_at > COALESCE(
        (SELECT triggered_at FROM price_watches WHERE id = watch.id),
        '2000-01-01'::TIMESTAMPTZ
      )
    LIMIT 1;

    IF FOUND THEN
      UPDATE price_watches
      SET triggered_at = NOW(),
          triggered_count = COALESCE(price_watches.triggered_count, 0) + 1,
          current_best_price = (
            SELECT MIN(COALESCE(sp2.price_negotiated, sp2.price_catalog))
            FROM supplier_prices sp2 WHERE sp2.gtin = watch.gtin
              AND COALESCE(sp2.price_negotiated, sp2.price_catalog) > 0
          ),
          current_best_supplier = (
            SELECT sp3.supplier_name FROM supplier_prices sp3
            WHERE sp3.gtin = watch.gtin
              AND COALESCE(sp3.price_negotiated, sp3.price_catalog) > 0
            ORDER BY COALESCE(sp3.price_negotiated, sp3.price_catalog) ASC
            LIMIT 1
          )
      WHERE id = watch.id;

      triggered_count := triggered_count + 1;
    END IF;
  END LOOP;

  RETURN triggered_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
