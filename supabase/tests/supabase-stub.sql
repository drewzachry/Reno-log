-- The parts of a Supabase database our migrations rely on, for running them
-- against plain Postgres in tests. Never apply this to a real Supabase project.
do $$ begin
  create role anon nologin;
  exception when duplicate_object then null;
end $$;
do $$ begin
  create role authenticated nologin;
  exception when duplicate_object then null;
end $$;
do $$ begin
  create role service_role nologin bypassrls;
  exception when duplicate_object then null;
end $$;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(
    current_setting('request.jwt.claim.sub', true),
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub'
  ), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Supabase grants table access to these roles by default; mirror that so the
-- migration's own revokes are what's being tested.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
