-- A executer dans Supabase SQL Editor une seule fois

create table if not exists public.yahoo_oauth_tokens (
  user_id text primary key,
  email text,
  access_token text not null,
  refresh_token text,
  xoauth_yahoo_guid text,
  expires_at timestamptz,
  updated_at timestamptz default now()
);

-- RLS: acces uniquement via service key cote serveur (pas d'expose client)
alter table public.yahoo_oauth_tokens enable row level security;
-- Pas de policy => aucun acces via anon/authenticated key.
-- Le backend utilise la clef service (service_role) ou anon + desactivation RLS selon config.
-- Si le backend utilise la cle anon (publishable), ajoutez une policy restrictive :
-- create policy "self" on public.yahoo_oauth_tokens for all using (auth.uid()::text = user_id);
