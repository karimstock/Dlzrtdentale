-- =============================================
-- JADOMI — Commerce : Remises sur devis et factures
-- Exécuter dans Supabase SQL Editor
-- =============================================

-- Remise globale sur les devis
ALTER TABLE devis
ADD COLUMN IF NOT EXISTS remise_globale_pct decimal DEFAULT 0;

ALTER TABLE devis
ADD COLUMN IF NOT EXISTS remise_globale_montant decimal DEFAULT 0;

-- Remise globale sur les factures
ALTER TABLE factures_societe
ADD COLUMN IF NOT EXISTS remise_globale_pct decimal DEFAULT 0;

ALTER TABLE factures_societe
ADD COLUMN IF NOT EXISTS remise_globale_montant decimal DEFAULT 0;

-- Note : les remises par ligne (remise_pct, prix_remise) sont stockées
-- directement dans le JSONB de la colonne `lignes` de chaque document.
-- Pas besoin de colonnes séparées pour ça.
