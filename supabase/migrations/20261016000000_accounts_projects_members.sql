-- Phase 1: accounts, projects, collaborators and the append-only event log.
--
-- Write model: tables are read-only to clients (RLS select policies only).
-- Every change goes through a security-definer function below that checks the
-- caller's role, applies the change and writes the event row in the same
-- transaction. See docs/TECHNICAL_SPEC.md "Write path".

-- ---------------------------------------------------------------- tables

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  email text not null,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  address text,
  scope text,
  owner_id uuid not null references public.profiles (id),
  weekly_backup boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  invited_by uuid references public.profiles (id),
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  role text not null check (role in ('editor', 'viewer')),
  token_hash text not null unique,
  invited_by uuid not null references public.profiles (id),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  actor_id uuid references public.profiles (id),
  type text not null check (type in ('decision', 'invoice', 'schedule', 'photo',
    'document', 'note', 'fact', 'member', 'setup', 'budget')),
  entity_type text,
  entity_id uuid,
  summary text not null,
  before jsonb,
  after jsonb,
  reason text,
  proposal_id uuid,
  created_at timestamptz not null default now()
);

create index project_members_project_id_idx on public.project_members (project_id);
create index project_members_user_id_idx on public.project_members (user_id);
create index invitations_project_id_idx on public.invitations (project_id);
create index events_project_created_idx on public.events (project_id, created_at desc);

-- History is never overwritten. The only way an event row disappears is a
-- deliberate hard delete of its whole project (not built yet), which must set
-- reno.hard_delete for that transaction.
create function public.events_append_only() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and current_setting('reno.hard_delete', true) = 'on' then
    return old;
  end if;
  raise exception 'History can''t be changed or deleted.' using errcode = '42501';
end;
$$;

create trigger events_append_only
  before update or delete on public.events
  for each row execute function public.events_append_only();

-- ---------------------------------------------------------------- profiles from auth

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name',
             split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Anyone who signed up before this migration ran.
insert into public.profiles (id, email, display_name)
select id, lower(email), coalesce(raw_user_meta_data ->> 'full_name', split_part(email, '@', 1))
from auth.users where email is not null
on conflict (id) do nothing;

-- ---------------------------------------------------------------- helpers

-- The caller's role on a project, or null if they aren't a member.
create function public.project_role(p_project_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select role from public.project_members
  where project_id = p_project_id and user_id = auth.uid();
$$;

create function public.shares_project_with(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members mine
    join public.project_members theirs on theirs.project_id = mine.project_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  );
$$;

create function public.role_label(p_role text) returns text
language sql immutable set search_path = '' as $$
  select case p_role when 'owner' then 'Owner' when 'editor' then 'Editor'
                     when 'viewer' then 'Viewer' else p_role end;
$$;

create function public.display_name(p_user_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(display_name, email) from public.profiles where id = p_user_id;
$$;

create function public.require_user() returns uuid
language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  return auth.uid();
end;
$$;

-- ---------------------------------------------------------------- row level security

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.invitations enable row level security;
alter table public.events enable row level security;

create policy "see yourself and people you share a project with" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_project_with(id));

create policy "members see their projects" on public.projects
  for select to authenticated
  using (public.project_role(id) is not null);

create policy "members see who is on the project" on public.project_members
  for select to authenticated
  using (public.project_role(project_id) is not null);

create policy "members see invitations" on public.invitations
  for select to authenticated
  using (public.project_role(project_id) is not null);

create policy "members see history" on public.events
  for select to authenticated
  using (public.project_role(project_id) is not null);

-- Clients read; they never write directly. Writes go through the functions below.
revoke all on public.profiles, public.projects, public.project_members,
  public.invitations, public.events from anon, authenticated;
grant select on public.profiles, public.projects, public.project_members,
  public.invitations, public.events to authenticated;

-- ---------------------------------------------------------------- write functions

create function public.create_project(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public.require_user();
  v_project uuid;
begin
  insert into public.projects (name, owner_id) values (btrim(p_name), v_user)
  returning id into v_project;

  insert into public.project_members (project_id, user_id, role)
  values (v_project, v_user, 'owner');

  insert into public.events (project_id, actor_id, type, entity_type, entity_id, summary, after)
  values (v_project, v_user, 'setup', 'project', v_project,
          'Started the project "' || btrim(p_name) || '"',
          jsonb_build_object('name', btrim(p_name)));
  return v_project;
end;
$$;

-- p_token_hash is the SHA-256 of a random token generated on the server.
-- Re-inviting an email that has a pending invite replaces it (that's "resend").
create function public.create_invitation(
  p_project_id uuid, p_email text, p_role text, p_token_hash text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public.require_user();
  v_role text := public.project_role(p_project_id);
  v_email text := lower(btrim(p_email));
  v_invite uuid;
begin
  if v_role is null or v_role not in ('owner', 'editor') then
    raise exception 'Only the owner or an editor can invite people.' using errcode = '42501';
  end if;
  if p_role not in ('editor', 'viewer') then
    raise exception 'People can be invited as Editor or Viewer.' using errcode = '22023';
  end if;
  if exists (select 1 from public.project_members m join public.profiles p on p.id = m.user_id
             where m.project_id = p_project_id and p.email = v_email) then
    raise exception '% is already on this project.', v_email using errcode = '23505';
  end if;

  update public.invitations set revoked_at = now()
  where project_id = p_project_id and email = v_email
    and accepted_at is null and revoked_at is null;

  insert into public.invitations (project_id, email, role, token_hash, invited_by)
  values (p_project_id, v_email, p_role, p_token_hash, v_user)
  returning id into v_invite;

  insert into public.events (project_id, actor_id, type, entity_type, entity_id, summary, after)
  values (p_project_id, v_user, 'member', 'invitation', v_invite,
          'Invited ' || v_email || ' as ' || public.role_label(p_role),
          jsonb_build_object('email', v_email, 'role', p_role));
  return v_invite;
end;
$$;

-- What the invite page shows. Callable before sign-in, so it returns only what
-- the page needs, with the invited email partly hidden.
create function public.get_invitation(p_token_hash text)
returns table (project_name text, inviter_name text, email_hint text, role text, status text)
language sql stable security definer set search_path = '' as $$
  select pr.name,
         public.display_name(i.invited_by),
         left(i.email, 1) || '***@' || split_part(i.email, '@', 2),
         i.role,
         case when i.revoked_at is not null then 'revoked'
              when i.accepted_at is not null then 'accepted'
              when i.expires_at < now() then 'expired'
              else 'pending' end
  from public.invitations i join public.projects pr on pr.id = i.project_id
  where i.token_hash = p_token_hash;
$$;

create function public.accept_invitation(p_token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public.require_user();
  v_email text;
  v_inv public.invitations;
begin
  select * into v_inv from public.invitations where token_hash = p_token_hash for update;
  if not found then
    raise exception 'This invite link isn''t valid. Ask for a new one.' using errcode = 'P0002';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'This invite was cancelled. Ask for a new one.' using errcode = '42501';
  end if;
  if v_inv.accepted_at is not null then
    if public.project_role(v_inv.project_id) is not null then
      return v_inv.project_id;
    end if;
    raise exception 'This invite has already been used. Ask for a new one.' using errcode = '42501';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'This invite has expired. Ask for a new one.' using errcode = '42501';
  end if;

  select lower(email) into v_email from public.profiles where id = v_user;
  if v_email is distinct from v_inv.email then
    raise exception 'This invite was sent to %. Sign in with that email, or ask % to invite this address.',
      left(v_inv.email, 1) || '***@' || split_part(v_inv.email, '@', 2),
      public.display_name(v_inv.invited_by)
      using errcode = '42501', hint = 'email_mismatch';
  end if;

  insert into public.project_members (project_id, user_id, role, invited_by)
  values (v_inv.project_id, v_user, v_inv.role, v_inv.invited_by)
  on conflict (project_id, user_id) do nothing;

  update public.invitations set accepted_at = now() where id = v_inv.id;

  insert into public.events (project_id, actor_id, type, entity_type, entity_id, summary, after)
  values (v_inv.project_id, v_user, 'member', 'member', v_user,
          public.display_name(v_user) || ' joined as ' || public.role_label(v_inv.role),
          jsonb_build_object('user_id', v_user, 'role', v_inv.role));
  return v_inv.project_id;
end;
$$;

create function public.revoke_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public.require_user();
  v_inv public.invitations;
begin
  select * into v_inv from public.invitations where id = p_invitation_id for update;
  if not found or coalesce(public.project_role(v_inv.project_id), '') not in ('owner', 'editor') then
    raise exception 'Only the owner or an editor can cancel invites.' using errcode = '42501';
  end if;
  if v_inv.accepted_at is not null or v_inv.revoked_at is not null then
    return;
  end if;

  update public.invitations set revoked_at = now() where id = v_inv.id;

  insert into public.events (project_id, actor_id, type, entity_type, entity_id, summary, before)
  values (v_inv.project_id, v_user, 'member', 'invitation', v_inv.id,
          'Cancelled the invite for ' || v_inv.email,
          jsonb_build_object('email', v_inv.email, 'role', v_inv.role));
end;
$$;

create function public.change_member_role(
  p_project_id uuid, p_user_id uuid, p_role text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public.require_user();
  v_old text;
begin
  if public.project_role(p_project_id) is distinct from 'owner' then
    raise exception 'Only the project owner can change roles.' using errcode = '42501';
  end if;
  if p_role not in ('editor', 'viewer') then
    raise exception 'Roles can be Editor or Viewer.' using errcode = '22023';
  end if;

  select role into v_old from public.project_members
  where project_id = p_project_id and user_id = p_user_id for update;
  if v_old is null then
    raise exception 'That person isn''t on this project.' using errcode = 'P0002';
  end if;
  if v_old = 'owner' then
    raise exception 'The owner''s role can''t be changed.' using errcode = '42501';
  end if;
  if v_old = p_role then
    return;
  end if;

  update public.project_members set role = p_role
  where project_id = p_project_id and user_id = p_user_id;

  insert into public.events (project_id, actor_id, type, entity_type, entity_id, summary, before, after)
  values (p_project_id, v_user, 'member', 'member', p_user_id,
          public.display_name(p_user_id) || ' is now ' || public.role_label(p_role),
          jsonb_build_object('role', v_old), jsonb_build_object('role', p_role));
end;
$$;

-- The owner can remove anyone else; anyone but the owner can remove themselves.
create function public.remove_member(p_project_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public.require_user();
  v_target text;
begin
  select role into v_target from public.project_members
  where project_id = p_project_id and user_id = p_user_id for update;
  if v_target is null then
    raise exception 'That person isn''t on this project.' using errcode = 'P0002';
  end if;
  if v_target = 'owner' then
    raise exception 'The owner can''t be removed from the project.' using errcode = '42501';
  end if;
  if p_user_id <> v_user and public.project_role(p_project_id) is distinct from 'owner' then
    raise exception 'Only the project owner can remove people.' using errcode = '42501';
  end if;

  insert into public.events (project_id, actor_id, type, entity_type, entity_id, summary, before)
  values (p_project_id, v_user, 'member', 'member', p_user_id,
          case when p_user_id = v_user then public.display_name(p_user_id) || ' left the project'
               else 'Removed ' || public.display_name(p_user_id) end,
          jsonb_build_object('user_id', p_user_id, 'role', v_target));

  delete from public.project_members where project_id = p_project_id and user_id = p_user_id;
end;
$$;

-- Functions are callable only by signed-in users, except the invite preview.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.project_role(uuid),
  public.shares_project_with(uuid),
  public.create_project(text),
  public.create_invitation(uuid, text, text, text),
  public.get_invitation(text),
  public.accept_invitation(text),
  public.revoke_invitation(uuid),
  public.change_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid)
  to authenticated;
grant execute on function public.get_invitation(text) to anon;
