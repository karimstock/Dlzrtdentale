-- =============================================
-- OTP multi-canal (SMS / WhatsApp / Email) pour coffre avocat
-- Date : 25 avril 2026
-- =============================================

CREATE TABLE IF NOT EXISTS public.avocat_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_role VARCHAR(20) NOT NULL CHECK (user_role IN ('avocat', 'client')),
  canal VARCHAR(20) NOT NULL CHECK (canal IN ('sms', 'whatsapp', 'email')),
  destination VARCHAR(200) NOT NULL,
  code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
  attempts INT DEFAULT 0,
  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_user ON public.avocat_otp_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON public.avocat_otp_codes(expires_at);

-- Canal prefere par utilisateur
ALTER TABLE public.avocat_clients
  ADD COLUMN IF NOT EXISTS otp_canal_prefere VARCHAR(20) DEFAULT 'email';

ALTER TABLE public.avocat_coffre_auth
  ADD COLUMN IF NOT EXISTS otp_canal_prefere VARCHAR(20) DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS otp_telephone VARCHAR(20);

ALTER TABLE public.avocat_otp_codes ENABLE ROW LEVEL SECURITY;
