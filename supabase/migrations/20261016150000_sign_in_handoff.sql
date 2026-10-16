-- Sign-in handoff between Safari and the home-screen app.
--
-- On iPhone an installed web app keeps its own cookies, so a sign-in link from
-- email opens in Safari, which lacks the PKCE code verifier the app holds. The
-- Safari page parks the one-time auth code here under a hash of a random
-- nonce that only the waiting app knows; the app collects it and exchanges it
-- with its own verifier. A parked code is useless without that verifier.

create table public.auth_handoffs (
  nonce_hash text primary key check (nonce_hash ~ '^[0-9a-f]{64}$'),
  code text not null check (char_length(code) between 1 and 512),
  created_at timestamptz not null default now()
);

alter table public.auth_handoffs enable row level security;
revoke all on public.auth_handoffs from anon, authenticated;

create function public.park_sign_in(p_nonce_hash text, p_code text) returns void
language sql security definer set search_path = '' as $$
  delete from public.auth_handoffs where created_at < now() - interval '15 minutes';
  insert into public.auth_handoffs (nonce_hash, code) values (p_nonce_hash, p_code)
  on conflict (nonce_hash) do update set code = excluded.code, created_at = now();
$$;

-- Returns the parked code once, then forgets it.
create function public.collect_sign_in(p_nonce_hash text) returns text
language sql security definer set search_path = '' as $$
  delete from public.auth_handoffs
  where nonce_hash = p_nonce_hash and created_at > now() - interval '15 minutes'
  returning code;
$$;

revoke execute on function public.park_sign_in(text, text), public.collect_sign_in(text) from public;
grant execute on function public.park_sign_in(text, text), public.collect_sign_in(text)
  to anon, authenticated;
