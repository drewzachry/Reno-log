-- Phase 4: documents.
--
-- An uploaded contract, plan set or spec becomes a document that is read in
-- the background: a summary, key facts with page numbers, and searchable page
-- text. People add, retry and remove documents through the functions below;
-- the reader (server, service role) fills in what it finds and marks the
-- document ready, writing the "Document added" event.

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  file_id uuid not null references public.files (id),
  title text not null,
  kind text not null default 'other' check (kind in ('plans', 'contract', 'specs', 'estimate',
    'permit', 'schedule', 'inspection', 'other')),
  summary text,
  page_count int,
  status text not null default 'reading' check (status in ('reading', 'ready', 'failed')),
  progress text,
  error text,
  -- Contract price, allowances and dates when the document states them.
  details jsonb not null default '{}',
  created_by uuid references public.profiles (id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.document_facts (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  topic text not null,
  detail text not null,
  page int,
  sort_order int not null default 0
);

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  page int,
  seq int not null default 0,
  text text not null,
  tsv tsvector generated always as (to_tsvector('english', text)) stored
);

-- Background work. Only the server touches this table.
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('read_document')),
  payload jsonb not null default '{}',
  state jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts int not null default 0,
  run_after timestamptz not null default now(),
  locked_until timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_project_idx on public.documents (project_id);
create index document_facts_document_idx on public.document_facts (document_id);
create index document_facts_project_idx on public.document_facts (project_id);
create index document_chunks_document_idx on public.document_chunks (document_id);
create index document_chunks_project_idx on public.document_chunks (project_id);
create index document_chunks_tsv_idx on public.document_chunks using gin (tsv);
create index jobs_pending_idx on public.jobs (status, run_after);

alter table public.documents enable row level security;
alter table public.document_facts enable row level security;
alter table public.document_chunks enable row level security;
alter table public.jobs enable row level security;

create policy "members read" on public.documents for select to authenticated
  using (public.project_role(project_id) is not null);
create policy "members read" on public.document_facts for select to authenticated
  using (public.project_role(project_id) is not null);
create policy "members read" on public.document_chunks for select to authenticated
  using (public.project_role(project_id) is not null);

revoke all on public.documents, public.document_facts, public.document_chunks, public.jobs
  from anon, authenticated;
grant select on public.documents, public.document_facts, public.document_chunks to authenticated;
grant all on public.documents, public.document_facts, public.document_chunks, public.jobs
  to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.documents;
  end if;
end;
$$;

-- ---------------------------------------------------------------- adding, retrying, removing

-- Starts reading an uploaded file (registered with record_file). Returns the
-- document id. The "Document added" event is written once it has been read.
create function public.add_document(p_project_id uuid, p_file_id uuid, p_title text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public.require_editor(p_project_id);
  v_id uuid;
begin
  if not exists (select 1 from public.files where id = p_file_id and project_id = p_project_id) then
    raise exception 'That file isn''t in this project.' using errcode = '22023';
  end if;
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'A document needs a name.' using errcode = '22023';
  end if;
  insert into public.documents (project_id, file_id, title, created_by, progress)
  values (p_project_id, p_file_id, left(btrim(p_title), 200), v_user, 'Waiting to start')
  returning id into v_id;
  insert into public.jobs (type, payload) values ('read_document', jsonb_build_object('document_id', v_id));
  return v_id;
end;
$$;

-- Reads a document again after a failure.
create function public.retry_document(p_document_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.documents;
begin
  select * into v_doc from public.documents where id = p_document_id and deleted_at is null for update;
  if not found then
    raise exception 'That document isn''t on this project.' using errcode = 'P0002';
  end if;
  perform public.require_editor(v_doc.project_id);
  if v_doc.status = 'reading' then
    return;
  end if;
  delete from public.document_facts where document_id = p_document_id;
  delete from public.document_chunks where document_id = p_document_id;
  update public.documents
  set status = 'reading', error = null, progress = 'Waiting to start', updated_at = now()
  where id = p_document_id;
  insert into public.jobs (type, payload)
  values ('read_document', jsonb_build_object('document_id', p_document_id));
end;
$$;

-- Soft delete: the document leaves the list and the chat's memory, the
-- original stays in storage, and history records it.
create function public.remove_document(p_document_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.documents;
  v_user uuid;
begin
  select * into v_doc from public.documents where id = p_document_id and deleted_at is null for update;
  if not found then
    raise exception 'That document isn''t on this project.' using errcode = 'P0002';
  end if;
  v_user := public.require_editor(v_doc.project_id);
  update public.documents set deleted_at = now(), updated_at = now() where id = p_document_id;
  update public.jobs set status = 'done', error = 'removed', updated_at = now()
  where type = 'read_document' and payload ->> 'document_id' = p_document_id::text
    and status in ('queued', 'running');
  insert into public.events (project_id, actor_id, type, entity_type, entity_id, summary, before)
  values (v_doc.project_id, v_user, 'document', 'document', p_document_id,
    'Document removed: ' || v_doc.title, jsonb_build_object('title', v_doc.title, 'kind', v_doc.kind));
end;
$$;

-- ---------------------------------------------------------------- search

-- Document passages that match any of the question's words, best first.
-- Runs with the caller's access (RLS), so it only sees their projects.
create function public.search_documents(p_project_id uuid, p_query text, p_limit int default 8)
returns table (document_id uuid, title text, page int, text text, rank real)
language sql stable security invoker set search_path = '' as $$
  with q as (
    select nullif(replace(plainto_tsquery('english', coalesce(p_query, ''))::text, ' & ', ' | '), '')
      as t
  )
  select c.document_id, d.title, c.page, c.text, ts_rank_cd(c.tsv, to_tsquery('english', q.t)) as rank
  from q, public.document_chunks c
  join public.documents d on d.id = c.document_id
  where q.t is not null
    and c.project_id = p_project_id
    and d.deleted_at is null and d.status = 'ready'
    and c.tsv @@ to_tsquery('english', q.t)
  order by rank desc, c.seq
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;

-- ---------------------------------------------------------------- jobs (server only)

-- Takes the next job that's due, or one whose runner stopped (its lock ran
-- out), and locks it for a few minutes.
create function public.claim_job() returns public.jobs
language plpgsql set search_path = '' as $$
declare
  v_job public.jobs;
begin
  select * into v_job from public.jobs
  where (status = 'queued' and run_after <= now())
     or (status = 'running' and locked_until < now())
  order by run_after
  limit 1
  for update skip locked;
  if not found then
    return null;
  end if;
  update public.jobs
  set status = 'running', attempts = attempts + 1, locked_until = now() + interval '6 minutes',
      updated_at = now()
  where id = v_job.id
  returning * into v_job;
  return v_job;
end;
$$;

revoke execute on function public.add_document(uuid, uuid, text), public.retry_document(uuid),
  public.remove_document(uuid), public.search_documents(uuid, text, int), public.claim_job()
  from public, anon, authenticated;
grant execute on function public.add_document(uuid, uuid, text), public.retry_document(uuid),
  public.remove_document(uuid), public.search_documents(uuid, text, int) to authenticated;
grant execute on function public.search_documents(uuid, text, int), public.claim_job() to service_role;

-- Reading documents uses AI too, but doesn't count toward the chat's daily limit.
alter table public.usage add column purpose text not null default 'chat'
  check (purpose in ('chat', 'document'));
