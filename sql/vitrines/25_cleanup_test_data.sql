-- ============================================================
-- MIGRATION 25 — Nettoyage donnees test
-- VERIFIER AVANT D'EXECUTER : ces DELETE suppriment des produits
-- ============================================================

-- Supprimer les produits test non-dentaires
DELETE FROM stock_products
WHERE LOWER(category) LIKE '%beverage%'
   OR LOWER(category) LIKE '%food%'
   OR LOWER(category) LIKE '%plant-based%'
   OR LOWER(name) IN ('isabelle', 'protein granarola');
