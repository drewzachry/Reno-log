-- Phase 3: chat with proposals.
--
-- The AI proposes, a person confirms. The server stores the assistant's reply
-- and its proposals (with the service role, so nobody can forge them from the
-- browser); people confirm or dismiss them. Confirming runs the matching write
-- function inside confirm_proposal, so the change, its history event and the
-- proposal's new state commit together, and the event records the proposal.

-- ---------------------------------------------------------------- tables

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id uuid references public.profiles (id), -- null for the assistant
  role text not null check (role in ('user', 'assistant')),
  text text not null default '' check (char_length(text) <= 8000),
  file_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  type text not null check (type in ('log_invoice', 'log_change_order', 'update_decision',
    'add_decision', 'move_milestone', 'add_photo', 'remember_fact', 'add_note')),
  payload jsonb not null,
  -- What the card shows, written by the server from the payload and the record.
  kind_label text not null,
  summary text not null,
  detail text,
  warnings text[] not null default '{}',
  state text not null default 'pending' check (state in ('pending', 'confirmed', 'dismissed', 'failed')),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.project_facts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  fact text not null check (char_length(btrim(fact)) between 1 and 500),
  category text not null check (category in ('preference', 'constraint', 'person', 'vendor', 'other')),
  source_message_id uuid references public.messages (id) on delete set null,
  created_by uuid references public.profiles (id),
  retired_at timestamptz,
  created_at timestamptz not null default now()
);

-- AI spend per project and person, for rate limits and future pricing.
create table public.usage (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid references public.profiles (id),
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  created_at timestamptz not null default now()
);

create index messages_project_created_idx on public.messages (project_id, created_at desc);
create index proposals_message_idx on public.proposals (message_id);
create index proposals_project_state_idx on public.proposals (project_id, state);
create index project_facts_project_idx on public.project_facts (project_id);
create index usage_user_created_idx on public.usage (user_id, created_at desc);

alter table public.messages enable row level security;
alter table public.proposals enable row level security;
alter table public.project_facts enable row level security;
alter table public.usage enable row level security;

create policy "members read" on public.messages for select to authenticated
  using (public.project_role(project_id) is not null);
create policy "members read" on public.proposals for select to authenticated
  using (public.project_role(project_id) is not null);
create policy "members read" on public.project_facts for select to authenticated
  using (public.project_role(project_id) is not null);
create policy "members read own" on public.usage for select to authenticated
  using (user_id = auth.uid());

revoke all on public.messages, public.proposals, public.project_facts, public.usage from anon, authenticated;
grant select on public.messages, public.proposals, public.project_facts, public.usage to authenticated;
-- The server writes assistant replies, proposals and usage with the service role.
grant all on public.messages, public.proposals, public.project_facts, public.usage to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.proposals;
  end if;
end;
$$;

-- ---------------------------------------------------------------- events remember the proposal

-- Inside confirm_proposal, reno.proposal_id is set for the transaction, so
-- every event written while applying a proposal points back to it.
create function public.events_set_proposal() returns trigger
language plpgsql as $$
begin
  if new.proposal_id is null then
    new.proposal_id := nullif(current_setting('reno.proposal_id', true), '')::uuid;
  end if;
  return new;
end;
$$;

create trigger events_set_proposal
  before insert on public.events
  for each row execute function public.events_set_proposal();

-- ---------------------------------------------------------------- files

-- Records an uploaded original. Uploads go straight to Storage under
-- projects/{project_id}/...; this registers the file so it can be linked.
create function public.record_file(
  p_project_id uuid, p_path text, p_name text, p_mime text, p_size bigint, p_kind text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public.require_editor(p_project_id);
  v_id uuid;
begin
  if p_path is null or p_path not like 'projects/' || p_project_id || '/%' or p_path like '%..%' then
    raise exception 'That file isn''t in this project''s storage.' using errcode = '22023';
  end if;
  if p_kind not in ('photo', 'invoice', 'document', 'other') then
    raise exception 'Unknown file kind.' using errcode = '22023';
  end if;
  insert into public.files (project_id, storage_path, original_name, mime_type, size_bytes, uploaded_by, kind)
  values (p_project_id, p_path, left(coalesce(p_name, 'file'), 200), p_mime, p_size, v_user, p_kind)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- messages

-- Any member may post (viewers can ask questions). Only editors attach files.
create function public.post_message(p_project_id uuid, p_text text, p_file_ids uuid[] default '{}')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public.require_user();
  v_id uuid;
  v_files uuid[] := coalesce(p_file_ids, '{}');
begin
  if public.project_role(p_project_id) is null then
    raise exception 'You''re not on this project.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_text, '')) = '' and cardinality(v_files) = 0 then
    raise exception 'Write a message or add a photo.' using errcode = '22023';
  end if;
  if char_length(p_text) > 8000 then
    raise exception 'That message is too long.' using errcode = '22023';
  end if;
  if cardinality(v_files) > 0 then
    perform public.require_editor(p_project_id);
    if cardinality(v_files) > 8 then
      raise exception 'Attach up to 8 photos at a time.' using errcode = '22023';
    end if;
    if exists (select 1 from unnest(v_files) f
               where not exists (select 1 from public.files where id = f and project_id = p_project_id)) then
      raise exception 'That photo isn''t in this project.' using errcode = '22023';
    end if;
  end if;
  insert into public.messages (project_id, author_id, role, text, file_ids)
  values (p_project_id, v_user, 'user', btrim(coalesce(p_text, '')), v_files)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- write functions for proposals

create function public.log_ledger_entry(
  p_project_id uuid, p_kind text, p_date date, p_vendor text, p_description text,
  p_amount_cents bigint, p_bucket_id uuid, p_file_id uuid, p_flags text[],
  p_change_order_status text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public.require_editor(p_project_id);
  v_id uuid;
  v_bucket text;
begin
  if p_kind not in ('invoice', 'payment', 'credit', 'change_order') then
    raise exception 'Unknown entry type.' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents < 0 then
    raise exception 'The amount must be zero or more.' using errcode = '22023';
  end if;
  if p_bucket_id is not null then
    select name into v_bucket from public.budget_buckets
    where id = p_bucket_id and project_id = p_project_id and deleted_at is null;
    if v_bucket is null then
      raise exception 'That budget line isn''t on this project.' using errcode = '22023';
    end if;
  end if;
  if p_file_id is not null and not exists (select 1 from public.files where id = p_file_id and project_id = p_project_id) then
    raise exception 'That file isn''t in this project.' using errcode = '22023';
  end if;

  insert into public.ledger_entries (project_id, kind, date, vendor, description, amount_cents,
    bucket_id, file_id, flags, change_order_status)
  values (p_project_id, p_kind, coalesce(p_date, current_date), btrim(p_vendor), nullif(btrim(p_description), ''),
    p_amount_cents, p_bucket_id, p_file_id, coalesce(p_flags, '{}'),
    case when p_kind = 'change_order' then coalesce(p_change_order_status, 'proposed') end)
  returning id into v_id;

  insert into public.events (project_id, actor_id, type, entity_type, entity_id, summary, after)
  values (p_project_id, v_user, case when p_kind = 'change_order' then 'budget' else 'invoice' end,
    'ledger_entry', v_id,
    case p_kind when 'change_order' then 'Change order logged' when 'payment' then 'Payment logged'
                when 'credit' then 'Credit logged' else 'Invoice logged' end
      || ': ' || btrim(p_vendor) || ' ' || public.money_text(p_amount_cents)
      || coalesce(' for ' || nullif(btrim(p_description), ''), '')
      || coalesce(' (' || v_bucket || ')', ''),
    jsonb_build_object('kind', p_kind, 'amount_cents', p_amount_cents, 'vendor', btrim(p_vendor)));
  return v_id;
end;
$$;

create function public.add_decision(
  p_project_id uuid, p_title text, p_room text, p_category text, p_milestone_key text,
  p_lead_weeks int, p_why text, p_bucket_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public.require_editor(p_project_id);
  v_id uuid;
begin
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'A decision needs a title.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.milestones where project_id = p_project_id and key = p_milestone_key) then
    raise exception 'That milestone isn''t on this project.' using errcode = '22023';
  end if;
  if p_bucket_id is not null and not exists (
    select 1 from public.budget_buckets where id = p_bucket_id and project_id = p_project_id and deleted_at is null) then
    raise exception 'That budget line isn''t on this project.' using errcode = '22023';
  end if;
  insert into public.decisions (project_id, title, room, category, why, milestone_key, lead_weeks, bucket_id)
  values (p_project_id, btrim(p_title), coalesce(nullif(btrim(p_room), ''), 'Whole house'), nullif(btrim(p_category), ''),
    nullif(btrim(p_why), ''), p_milestone_key, greatest(0, least(104, coalesce(p_lead_weeks, 0))), p_bucket_id)
  returning id into v_id;
  insert into public.events (project_id, actor_id, type, entity_type, entity_id, summary, after)
  values (p_project_id, v_user, 'decision', 'decision', v_id,
    'New decision added: ' || btrim(p_title) || ' (' || coalesce(nullif(btrim(p_room), ''), 'Whole house') || ')',
    jsonb_build_object('title', btrim(p_title), 'milestone_key', p_milestone_key, 'lead_weeks', p_lead_weeks));
  return v_id;
end;
$$;

create function public.add_photo(
  p_project_id uuid, p_file_id uuid, p_room text, p_caption text, p_decision_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public.require_editor(p_project_id);
  v_id uuid;
begin
  if not exists (select 1 from public.files where id = p_file_id and project_id = p_project_id) then
    raise exception 'That photo isn''t in this project.' using errcode = '22023';
  end if;
  if p_decision_id is not null and not exists (
    select 1 from public.decisions where id = p_decision_id and project_id = p_project_id and deleted_at is null) then
    raise exception 'That decision isn''t on this project.' using errcode = '22023';
  end if;
  insert into public.photos (project_id, file_id, room, caption, taken_on, decision_id)
  values (p_project_id, p_file_id, nullif(btrim(p_room), ''), nullif(btrim(p_caption), ''), current_date, p_decision_id)
  returning id into v_id;
  insert into public.events (project_id, actor_id, type, entity_type, entity_id, summary)
  values (p_project_id, v_user, 'photo', 'photo', v_id,
    'Photo filed' || coalesce(': ' || nullif(btrim(p_room), ''), '') || coalesce(' · ' || nullif(btrim(p_caption), ''), ''));
  return v_id;
end;
$$;

create function public.remember_fact(
  p_project_id uuid, p_fact text, p_category text, p_source_message_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public.require_editor(p_project_id);
  v_id uuid;
begin
  if btrim(coalesce(p_fact, '')) = '' or char_length(p_fact) > 500 then
    raise exception 'Facts can be 1 to 500 characters.' using errcode = '22023';
  end if;
  insert into public.project_facts (project_id, fact, category, source_message_id, created_by)
  values (p_project_id, btrim(p_fact), coalesce(p_category, 'other'), p_source_message_id, v_user)
  returning id into v_id;
  insert into public.events (project_id, actor_id, type, entity_type, entity_id, summary, after)
  values (p_project_id, v_user, 'fact', 'fact', v_id, 'Remembered: ' || btrim(p_fact),
    jsonb_build_object('fact', btrim(p_fact), 'category', p_category));
  return v_id;
end;
$$;

create function public.retire_fact(p_fact_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_fact public.project_facts;
  v_user uuid;
begin
  select * into v_fact from public.project_facts where id = p_fact_id for update;
  if not found then
    raise exception 'That fact isn''t on this project.' using errcode = 'P0002';
  end if;
  v_user := public.require_editor(v_fact.project_id);
  if v_fact.retired_at is not null then
    return;
  end if;
  update public.project_facts set retired_at = now() where id = p_fact_id;
  insert into public.events (project_id, actor_id, type, entity_type, entity_id, summary, before)
  values (v_fact.project_id, v_user, 'fact', 'fact', p_fact_id, 'Forgot: ' || v_fact.fact,
    jsonb_build_object('fact', v_fact.fact));
end;
$$;

create function public.add_note(p_project_id uuid, p_text text, p_room text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public.require_editor(p_project_id);
begin
  if btrim(coalesce(p_text, '')) = '' then
    raise exception 'A note needs some text.' using errcode = '22023';
  end if;
  insert into public.events (project_id, actor_id, type, entity_type, summary, after)
  values (p_project_id, v_user, 'note', 'note',
    'Note' || coalesce(' (' || nullif(btrim(p_room), '') || ')', '') || ': ' || left(btrim(p_text), 1000),
    jsonb_build_object('text', left(btrim(p_text), 1000), 'room', nullif(btrim(p_room), '')));
end;
$$;

-- ---------------------------------------------------------------- confirming and dismissing

-- Applies a pending proposal ("Log it"). Returns what changed, e.g. the
-- deadlines a schedule change moved, for the ripple message.
create function public.confirm_proposal(p_proposal_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_p public.proposals;
  v_user uuid;
  v_pid uuid;
  d jsonb;
  v_result jsonb := '{}';
  v_id uuid;
begin
  select * into v_p from public.proposals where id = p_proposal_id for update;
  if not found then
    raise exception 'That card isn''t on this project.' using errcode = 'P0002';
  end if;
  v_user := public.require_editor(v_p.project_id);
  if v_p.state <> 'pending' then
    raise exception 'That card was already %.', case v_p.state when 'confirmed' then 'logged' else 'skipped' end
      using errcode = '23505';
  end if;
  v_pid := v_p.project_id;
  d := v_p.payload;
  perform set_config('reno.proposal_id', v_p.id::text, true);

  case v_p.type
    when 'log_invoice' then
      v_id := public.log_ledger_entry(v_pid, d ->> 'kind', (d ->> 'date')::date, d ->> 'vendor', d ->> 'description',
        (d ->> 'amount_cents')::bigint, (d ->> 'bucket_id')::uuid, (d ->> 'file_id')::uuid,
        array(select jsonb_array_elements_text(coalesce(d -> 'flags', '[]'))));
      v_result := jsonb_build_object('ledger_entry_id', v_id);
    when 'log_change_order' then
      v_id := public.log_ledger_entry(v_pid, 'change_order', (d ->> 'date')::date, d ->> 'vendor', d ->> 'description',
        (d ->> 'amount_cents')::bigint, (d ->> 'bucket_id')::uuid, (d ->> 'file_id')::uuid, '{}', d ->> 'status');
      v_result := jsonb_build_object('ledger_entry_id', v_id);
    when 'update_decision' then
      if not exists (select 1 from public.decisions where id = (d ->> 'decision_id')::uuid and project_id = v_pid) then
        raise exception 'That decision isn''t on this project.' using errcode = 'P0002';
      end if;
      perform public.update_decision((d ->> 'decision_id')::uuid, coalesce(d -> 'changes', '{}'), d ->> 'note');
    when 'add_decision' then
      v_id := public.add_decision(v_pid, d ->> 'title', d ->> 'room', d ->> 'category', d ->> 'milestone_key',
        (d ->> 'lead_weeks')::int, d ->> 'why', (d ->> 'bucket_id')::uuid);
      v_result := jsonb_build_object('decision_id', v_id);
    when 'move_milestone' then
      select jsonb_build_object('moved', coalesce(jsonb_agg(to_jsonb(m)), '[]')) into v_result
      from public.move_milestone(v_pid, d ->> 'milestone_key', (d ->> 'date')::date, d ->> 'reason') m;
    when 'add_photo' then
      v_id := public.add_photo(v_pid, (d ->> 'file_id')::uuid, d ->> 'room', d ->> 'caption', (d ->> 'decision_id')::uuid);
      v_result := jsonb_build_object('photo_id', v_id);
    when 'remember_fact' then
      v_id := public.remember_fact(v_pid, d ->> 'fact', d ->> 'category', v_p.message_id);
      v_result := jsonb_build_object('fact_id', v_id);
    when 'add_note' then
      perform public.add_note(v_pid, d ->> 'text', d ->> 'room');
  end case;

  update public.proposals set state = 'confirmed', decided_by = v_user, decided_at = now() where id = v_p.id;
  perform set_config('reno.proposal_id', '', true);
  return v_result;
end;
$$;

-- "Not now". Not a change to the record, so no history event.
create function public.dismiss_proposal(p_proposal_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_p public.proposals;
  v_user uuid;
begin
  select * into v_p from public.proposals where id = p_proposal_id for update;
  if not found then
    raise exception 'That card isn''t on this project.' using errcode = 'P0002';
  end if;
  v_user := public.require_editor(v_p.project_id);
  if v_p.state = 'pending' then
    update public.proposals set state = 'dismissed', decided_by = v_user, decided_at = now() where id = v_p.id;
  end if;
end;
$$;

-- ---------------------------------------------------------------- storage

-- Originals live in a private bucket under projects/{project_id}/. Members
-- can read; owners and editors can upload. Skipped where Storage isn't
-- installed (the plain-Postgres test database).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('project-files', 'project-files', false, 104857600)
    on conflict (id) do nothing;

    execute $p$
      create policy "project members read files" on storage.objects for select to authenticated
      using (bucket_id = 'project-files' and (storage.foldername(name))[1] = 'projects'
             and public.project_role(((storage.foldername(name))[2])::uuid) is not null)
    $p$;
    execute $p$
      create policy "project editors upload files" on storage.objects for insert to authenticated
      with check (bucket_id = 'project-files' and (storage.foldername(name))[1] = 'projects'
             and public.project_role(((storage.foldername(name))[2])::uuid) in ('owner', 'editor'))
    $p$;
  end if;
end;
$$;

-- ---------------------------------------------------------------- grants

revoke execute on function public.record_file(uuid, text, text, text, bigint, text),
  public.post_message(uuid, text, uuid[]),
  public.log_ledger_entry(uuid, text, date, text, text, bigint, uuid, uuid, text[], text),
  public.add_decision(uuid, text, text, text, text, int, text, uuid),
  public.add_photo(uuid, uuid, text, text, uuid),
  public.remember_fact(uuid, text, text, uuid),
  public.retire_fact(uuid), public.add_note(uuid, text, text),
  public.confirm_proposal(uuid), public.dismiss_proposal(uuid),
  public.events_set_proposal()
  from public, anon, authenticated;

-- Cards are applied only through confirm_proposal; the individual write
-- functions are not callable from the browser on their own, except retiring
-- a fact from Project settings.
grant execute on function public.record_file(uuid, text, text, text, bigint, text),
  public.post_message(uuid, text, uuid[]),
  public.retire_fact(uuid),
  public.confirm_proposal(uuid), public.dismiss_proposal(uuid)
  to authenticated;
