-- =====================================================================
-- JADOMI — Comptes email scannés par société (Phase 20)
-- Table destinée au CRON de scan IMAP automatique.
-- Le password IMAP est chiffré côté serveur (AES-256-GCM) avec la clé
-- process.env.JADOMI_SECRET_KEY (à définir dans .env).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.comptes_email_societe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  provider text NOT NULL CHECK (provider IN (
    'Gmail','Outlook','Yahoo','OVH','Orange','Free','SFR','Laposte','custom'
  )),
  email text NOT NULL,
  password_chiffre text,                 -- chiffré AES-GCM
  password_iv text,                      -- IV / nonce
  password_tag text,                     -- tag auth
  -- Pour Yahoo OAuth : référence au yahoo_oauth_tokens (géré séparément)
  oauth_provider text,                   -- 'yahoo', etc.

  custom_host text,
  custom_port integer DEFAULT 993,
  actif boolean DEFAULT true,

  frequence_minutes integer NOT NULL DEFAULT 30 CHECK (frequence_minutes >= 15),
  dernier_scan timestamptz,
  dernier_uid text,                      -- UID du dernier mail scanné
  derniere_erreur text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (societe_id, email)
);
CREATE INDEX IF NOT EXISTS idx_comptes_email_societe ON public.comptes_email_societe(societe_id);
CREATE INDEX IF NOT EXISTS idx_comptes_email_actif ON public.comptes_email_societe(actif, dernier_scan) WHERE actif = true;

DROP TRIGGER IF EXISTS trg_comptes_email_updated ON public.comptes_email_societe;
CREATE TRIGGER trg_comptes_email_updated
  BEFORE UPDATE ON public.comptes_email_societe
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.comptes_email_societe ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS comptes_email_all ON public.comptes_email_societe;
CREATE POLICY comptes_email_all ON public.comptes_email_societe
  FOR ALL
  USING (public.is_member_of_societe(societe_id))
  WITH CHECK (public.is_member_of_societe(societe_id));

-- Ajout d'un lien vers le compte scanné sur factures_fournisseurs_societe
ALTER TABLE public.factures_fournisseurs_societe
  ADD COLUMN IF NOT EXISTS compte_email_id uuid REFERENCES public.comptes_email_societe(id) ON DELETE SET NULL;
ALTER TABLE public.factures_fournisseurs_societe
  ADD COLUMN IF NOT EXISTS source_mail_uid text;
ALTER TABLE public.factures_fournisseurs_societe
  ADD COLUMN IF NOT EXISTS hash_dedup text;
CREATE UNIQUE INDEX IF NOT EXISTS ux_factures_fourn_hash
  ON public.factures_fournisseurs_societe(societe_id, hash_dedup)
  WHERE hash_dedup IS NOT NULL;

-- =====================================================================
-- FIN Phase 20
-- =====================================================================
