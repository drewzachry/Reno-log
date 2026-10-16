-- Phase 2: the project record. Milestones, decisions, budget, ledger, files
-- and photos, plus the write functions that change them. As in Phase 1,
-- clients only read; every change goes through a function that checks the
-- caller's role, applies the change and writes the history event together.

-- ---------------------------------------------------------------- tables

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  key text not null check (key ~ '^[a-z_]{1,40}$'),
  label text not null,
  explanation text,
  date date,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, key)
);

create table public.budget_buckets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('contract', 'allowance', 'owner', 'contingency')),
  budget_cents bigint not null default 0 check (budget_cents >= 0),
  sort_order int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  room text not null default 'Whole house',
  category text,
  why text,
  milestone_key text not null,
  lead_weeks int not null default 0 check (lead_weeks between 0 and 104),
  due_date_override date,
  status text not null default 'not_started'
    check (status in ('not_started', 'exploring', 'decided', 'ordered', 'delivered', 'installed')),
  selection text,
  cost_cents bigint check (cost_cents >= 0),
  bucket_id uuid references public.budget_buckets (id),
  source text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  storage_path text not null,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  uploaded_by uuid references public.profiles (id),
  kind text not null check (kind in ('photo', 'invoice', 'document', 'other')),
  created_at timestamptz not null default now()
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (kind in ('invoice', 'payment', 'change_order', 'credit')),
  date date not null,
  vendor text not null,
  description text,
  amount_cents bigint not null check (amount_cents >= 0),
  bucket_id uuid references public.budget_buckets (id),
  file_id uuid references public.files (id),
  flags text[] not null default '{}',
  change_order_status text check (change_order_status in ('proposed', 'approved', 'rejected')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  check ((kind = 'change_order') = (change_order_status is not null))
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  file_id uuid not null references public.files (id),
  room text,
  caption text,
  taken_on date,
  decision_id uuid references public.decisions (id),
  created_at timestamptz not null default now()
);

create index milestones_project_idx on public.milestones (project_id);
create index decisions_project_idx on public.decisions (project_id);
create index budget_buckets_project_idx on public.budget_buckets (project_id);
create index ledger_entries_project_idx on public.ledger_entries (project_id, date desc);
create index files_project_idx on public.files (project_id);
create index photos_project_idx on public.photos (project_id);
create index events_entity_idx on public.events (entity_id);

-- ---------------------------------------------------------------- access

alter table public.milestones enable row level security;
alter table public.decisions enable row level security;
alter table public.budget_buckets enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.files enable row level security;
alter table public.photos enable row level security;

create policy "members read" on public.milestones for select to authenticated
  using (public.project_role(project_id) is not null);
create policy "members read" on public.decisions for select to authenticated
  using (public.project_role(project_id) is not null);
create policy "members read" on public.budget_buckets for select to authenticated
  using (public.project_role(project_id) is not null);
create policy "members read" on public.ledger_entries for select to authenticated
  using (public.project_role(project_id) is not null);
create policy "members read" on public.files for select to authenticated
  using (public.project_role(project_id) is not null);
create policy "members read" on public.photos for select to authenticated
  using (public.project_role(project_id) is not null);

revoke all on public.milestones, public.decisions, public.budget_buckets,
  public.ledger_entries, public.files, public.photos from anon, authenticated;
grant select on public.milestones, public.decisions, public.budget_buckets,
  public.ledger_entries, public.files, public.photos to authenticated;

-- Live updates for a second device (Supabase Realtime respects RLS).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.milestones, public.decisions,
      public.budget_buckets, public.ledger_entries, public.photos, public.events;
  end if;
end;
$$;

-- ---------------------------------------------------------------- helpers

create function public.require_editor(p_project_id uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := public.require_user();
begin
  if coalesce(public.project_role(p_project_id), '') not in ('owner', 'editor') then
    raise exception 'Only the owner or an editor can change the project.' using errcode = '42501';
  end if;
  return v_user;
end;
$$;

create function public.status_label(p_status text) returns text
language sql immutable set search_path = '' as $$
  select case p_status when 'not_started' then 'Not started' when 'exploring' then 'Exploring'
    when 'decided' then 'Decided' when 'ordered' then 'Ordered' when 'delivered' then 'Delivered'
    when 'installed' then 'Installed' else p_status end;
$$;

create function public.short_date(p_date date) returns text
language sql immutable set search_path = '' as $$
  select coalesce(to_char(p_date, 'Mon FMDD, YYYY'), 'no date');
$$;

-- The six standard milestones, from the prototype.
create function public.add_standard_milestones(p_project_id uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.milestones (project_id, key, label, explanation, sort_order)
  values
    (p_project_id, 'rough_in', 'Rough-in', 'Plumbing, wiring and ducts run inside open walls. Anything that needs a pipe, wire or box in the wall must be decided before this.', 1),
    (p_project_id, 'drywall', 'Walls close', 'Drywall goes up. After this, moving an outlet, valve or light means cutting walls open again.', 2),
    (p_project_id, 'cabinets', 'Cabinets in', 'Cabinets arrive and get installed. They are often ordered 8–12 weeks ahead.', 3),
    (p_project_id, 'countertops', 'Countertops templated', 'The fabricator measures installed cabinets. Slab, edge and sink must be chosen by then.', 4),
    (p_project_id, 'finish', 'Finish work', 'Tile, trim, paint, fixtures, hardware and lights go in.', 5),
    (p_project_id, 'move_in', 'Move-in', 'Punch list done, final inspection, certificate of occupancy.', 6)
  on conflict (project_id, key) do nothing;
$$;

-- Every project gets the standard milestones (dates come later).
select public.add_standard_milestones(id) from public.projects;

create function public.projects_add_milestones() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.add_standard_milestones(new.id);
  return new;
end;
$$;

create trigger projects_add_milestones
  after insert on public.projects
  for each row execute function public.projects_add_milestones();

-- ---------------------------------------------------------------- write functions

-- Changes a decision's status, selection, cost or allowance. Only keys present
-- in p_changes are touched. The old values stay in the history event.
create function public.update_decision(p_decision_id uuid, p_changes jsonb, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_dec public.decisions;
  v_user uuid;
  v_before jsonb := '{}';
  v_after jsonb := '{}';
  v_summary text;
  v_key text;
begin
  select * into v_dec from public.decisions where id = p_decision_id and deleted_at is null for update;
  if not found then
    raise exception 'That decision isn''t on this project.' using errcode = 'P0002';
  end if;
  v_user := public.require_editor(v_dec.project_id);

  for v_key in select jsonb_object_keys(p_changes) loop
    if v_key not in ('status', 'selection', 'cost_cents', 'bucket_id') then
      raise exception 'Can''t change "%" on a decision.', v_key using errcode = '22023';
    end if;
  end loop;

  if p_changes ? 'status' and p_changes ->> 'status' is distinct from v_dec.status then
    v_before := v_before || jsonb_build_object('status', v_dec.status);
    v_after := v_after || jsonb_build_object('status', p_changes ->> 'status');
  end if;
  if p_changes ? 'selection' and nullif(btrim(p_changes ->> 'selection'), '') is distinct from v_dec.selection then
    v_before := v_before || jsonb_build_object('selection', v_dec.selection);
    v_after := v_after || jsonb_build_object('selection', nullif(btrim(p_changes ->> 'selection'), ''));
  end if;
  if p_changes ? 'cost_cents' and (p_changes ->> 'cost_cents')::bigint is distinct from v_dec.cost_cents then
    v_before := v_before || jsonb_build_object('cost_cents', v_dec.cost_cents);
    v_after := v_after || jsonb_build_object('cost_cents', (p_changes ->> 'cost_cents')::bigint);
  end if;
  if p_changes ? 'bucket_id' and (p_changes ->> 'bucket_id')::uuid is distinct from v_dec.bucket_id then
    if p_changes ->> 'bucket_id' is not null and not exists (
      select 1 from public.budget_buckets
      where id = (p_changes ->> 'bucket_id')::uuid and project_id = v_dec.project_id and deleted_at is null
    ) then
      raise exception 'That budget line isn''t on this project.' using errcode = '22023';
    end if;
    v_before := v_before || jsonb_build_object('bucket_id', v_dec.bucket_id);
    v_after := v_after || jsonb_build_object('bucket_id', p_changes ->> 'bucket_id');
  end if;

  if v_after = '{}' then
    return;
  end if;

  update public.decisions set
    status = coalesce(v_after ->> 'status', status),
    selection = case when v_after ? 'selection' then v_after ->> 'selection' else selection end,
    cost_cents = case when v_after ? 'cost_cents' then (v_after ->> 'cost_cents')::bigint else cost_cents end,
    bucket_id = case when v_after ? 'bucket_id' then (v_after ->> 'bucket_id')::uuid else bucket_id end,
    updated_at = now()
  where id = v_dec.id;

  v_summary := v_dec.title || ' (' || v_dec.room || ')' || case
    when v_after ? 'selection' and v_after ->> 'selection' is not null then ': picked ' || (v_after ->> 'selection')
    when v_after ? 'status' then ' marked ' || public.status_label(v_after ->> 'status')
    else ' updated' end;

  insert into public.events (project_id, actor_id, type, entity_type, entity_id, summary, before, after, reason)
  values (v_dec.project_id, v_user, 'decision', 'decision', v_dec.id, v_summary, v_before, v_after,
          nullif(btrim(p_reason), ''));
end;
$$;

-- Moves a milestone. Every decision tied to it without its own due date moves
-- with it; those are returned so the app can say which deadlines changed.
create function public.move_milestone(
  p_project_id uuid, p_key text, p_date date, p_reason text default null
) returns table (decision_id uuid, title text, room text, status text, old_decide_by date, new_decide_by date)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public.require_editor(p_project_id);
  v_ms public.milestones;
  v_moved int;
begin
  select * into v_ms from public.milestones where project_id = p_project_id and key = p_key for update;
  if not found then
    raise exception 'That milestone isn''t on this project.' using errcode = 'P0002';
  end if;
  if p_date is null then
    raise exception 'Pick a date.' using errcode = '22023';
  end if;
  if v_ms.date = p_date then
    return;
  end if;

  update public.milestones set date = p_date where id = v_ms.id;

  select count(*) into v_moved from public.decisions d
  where d.project_id = p_project_id and d.milestone_key = p_key
    and d.deleted_at is null and d.due_date_override is null;

  insert into public.events (project_id, actor_id, type, entity_type, entity_id, summary, before, after, reason)
  values (p_project_id, v_user, 'schedule', 'milestone', v_ms.id,
          case when v_ms.date is null then v_ms.label || ' set for ' || public.short_date(p_date)
               else v_ms.label || ' moved from ' || public.short_date(v_ms.date) || ' to ' || public.short_date(p_date) end
          || case when v_moved > 0 then ' (' || v_moved || ' deadline' || case when v_moved = 1 then '' else 's' end || ' moved)' else '' end,
          jsonb_build_object('date', v_ms.date),
          jsonb_build_object('date', p_date, 'deadlines_moved', v_moved),
          nullif(btrim(p_reason), ''));

  return query
    select d.id, d.title, d.room, d.status,
           v_ms.date - d.lead_weeks * 7, p_date - d.lead_weeks * 7
    from public.decisions d
    where d.project_id = p_project_id and d.milestone_key = p_key
      and d.deleted_at is null and d.due_date_override is null
    order by p_date - d.lead_weeks * 7, d.title;
end;
$$;

-- ---------------------------------------------------------------- sample project

-- Creates "Rivera renovation (sample)" for the caller: a kitchen, a primary
-- bath and a hall bath, built from the decision library. Dates are relative to
-- today so "Up next" always has something to show. The numbers are listed in
-- docs/SAMPLE_PROJECT.md.
create function public.load_sample_project() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public.require_user();
  v_project uuid;
  t date := current_date;
  b_contract uuid; b_tile uuid; b_plumbing uuid; b_lighting uuid; b_appliances uuid; b_cushion uuid;
begin
  insert into public.projects (name, address, scope, owner_id)
  values ('Rivera renovation (sample)', '1418 Alder Street',
          'Kitchen remodel, primary bath and hall bath, new floors throughout', v_user)
  returning id into v_project;
  insert into public.project_members (project_id, user_id, role) values (v_project, v_user, 'owner');

  update public.milestones set date = case key
      when 'rough_in' then t + 24 when 'drywall' then t + 52 when 'cabinets' then t + 80
      when 'countertops' then t + 101 when 'finish' then t + 122 when 'move_in' then t + 165 end
  where project_id = v_project;

  insert into public.budget_buckets (project_id, name, kind, budget_cents, sort_order) values
    (v_project, 'Construction contract', 'contract', 28500000, 1) returning id into b_contract;
  insert into public.budget_buckets (project_id, name, kind, budget_cents, sort_order) values
    (v_project, 'Tile allowance', 'allowance', 800000, 2) returning id into b_tile;
  insert into public.budget_buckets (project_id, name, kind, budget_cents, sort_order) values
    (v_project, 'Plumbing fixtures allowance', 'allowance', 950000, 3) returning id into b_plumbing;
  insert into public.budget_buckets (project_id, name, kind, budget_cents, sort_order) values
    (v_project, 'Lighting allowance', 'allowance', 400000, 4) returning id into b_lighting;
  insert into public.budget_buckets (project_id, name, kind, budget_cents, sort_order) values
    (v_project, 'Appliances', 'owner', 1400000, 5) returning id into b_appliances;
  insert into public.budget_buckets (project_id, name, kind, budget_cents, sort_order) values
    (v_project, 'Cushion', 'contingency', 2850000, 6) returning id into b_cushion;

  insert into public.decisions
    (project_id, room, category, title, milestone_key, lead_weeks, status, selection, cost_cents, bucket_id, why)
  values
    -- Before rough-in (13)
    (v_project, 'Primary bath', 'Plumbing fixtures', 'Shower valve and trim', 'rough_in', 4, 'ordered', 'Delta Trinsic pressure-balance valve, brushed nickel trim', 124000, b_plumbing, 'The valve body is set inside the wall at rough-in and must match the trim you pick.'),
    (v_project, 'Primary bath', 'Plumbing fixtures', 'Tub (freestanding or alcove)', 'rough_in', 6, 'exploring', null, null, b_plumbing, 'Drain location and floor framing depend on the exact tub.'),
    (v_project, 'Primary bath', 'Plumbing fixtures', 'Toilet model and rough-in size', 'rough_in', 3, 'not_started', null, null, b_plumbing, 'The drain is placed 10, 12 or 14 inches from the wall to fit a specific toilet.'),
    (v_project, 'Primary bath', 'Plumbing fixtures', 'Vanity size and sink type', 'rough_in', 6, 'ordered', '60-inch double vanity, undermount sinks', 285000, b_plumbing, 'Supply and drain heights depend on vanity width and sink style.'),
    (v_project, 'Primary bath', 'Electrical', 'Heated bathroom floor (yes/no)', 'rough_in', 2, 'not_started', null, null, null, 'Needs its own circuit and thermostat location.'),
    (v_project, 'Hall bath', 'Plumbing fixtures', 'Shower valve and trim', 'rough_in', 4, 'not_started', null, null, b_plumbing, 'The valve body is set inside the wall at rough-in and must match the trim you pick.'),
    (v_project, 'Hall bath', 'Plumbing fixtures', 'Toilet model and rough-in size', 'rough_in', 3, 'not_started', null, null, b_plumbing, 'The drain is placed 10, 12 or 14 inches from the wall to fit a specific toilet.'),
    (v_project, 'Hall bath', 'Plumbing fixtures', 'Vanity size and sink type', 'rough_in', 6, 'ordered', '36-inch vanity with integrated top', 118000, b_plumbing, 'Supply and drain heights depend on vanity width and sink style.'),
    (v_project, 'Kitchen', 'Plumbing fixtures', 'Kitchen sink and faucet', 'rough_in', 4, 'decided', '33-inch farmhouse sink, Kohler Artifacts faucet', 162000, b_plumbing, 'Sink width sets the base cabinet; faucet holes affect the counter.'),
    (v_project, 'Kitchen', 'HVAC', 'Range hood type and CFM', 'rough_in', 4, 'not_started', null, null, null, 'Duct size, make-up air and wiring depend on the hood.'),
    (v_project, 'Whole house', 'Electrical', 'Outlet, switch and USB locations', 'rough_in', 1, 'not_started', null, null, null, 'The electrician sets boxes at rough-in. Walk the house with them.'),
    (v_project, 'Whole house', 'Electrical', 'Recessed and ceiling light layout', 'rough_in', 2, 'not_started', null, null, null, 'Cans and junction boxes are placed before insulation.'),
    (v_project, 'Whole house', 'HVAC', 'Register and return locations', 'rough_in', 1, 'not_started', null, null, null, 'Ducts run at rough-in; registers in the wrong spot block furniture.'),
    -- Before walls close (4)
    (v_project, 'Whole house', 'Framing', 'Blocking for TVs, grab bars, heavy mirrors', 'drywall', 1, 'not_started', null, null, null, 'Wood backing inside the wall. Cheap now, expensive later.'),
    (v_project, 'Primary bath', 'Framing', 'Shower niche size and location', 'drywall', 1, 'decided', '12 x 24 in niche on the valve wall', null, null, 'Framed before the shower walls are boarded.'),
    (v_project, 'Hall bath', 'Hardware', 'Bath accessories (towel bars, hooks, TP)', 'drywall', 2, 'not_started', null, null, null, 'Placement needs blocking before drywall.'),
    (v_project, 'Whole house', 'Insulation', 'Insulation type', 'drywall', 2, 'decided', 'Batts in walls, spray foam at the rim joists', null, b_contract, 'Spray foam vs. batts affects cost and energy rebates.'),
    -- Before cabinets (4)
    (v_project, 'Kitchen', 'Cabinets', 'Kitchen cabinet layout and style', 'cabinets', 10, 'ordered', 'Inset Shaker, 42-inch uppers', null, b_contract, 'Custom and semi-custom boxes take 8–12 weeks.'),
    (v_project, 'Kitchen', 'Cabinets', 'Cabinet paint or stain color', 'cabinets', 10, 'decided', 'Benjamin Moore Hale Navy', null, b_contract, 'Needed to place the cabinet order.'),
    (v_project, 'Kitchen', 'Appliances', 'Appliance package (models)', 'cabinets', 10, 'decided', 'Bosch 36-inch range and dishwasher, Liebherr fridge', 1360000, b_appliances, 'Cabinet openings are built around exact model dimensions.'),
    (v_project, 'Primary bath', 'Cabinets', 'Bathroom vanity order', 'cabinets', 8, 'not_started', null, null, b_plumbing, 'Ordered with or alongside kitchen cabinets.'),
    -- Before countertops (2)
    (v_project, 'Kitchen', 'Countertops', 'Countertop material and slab', 'countertops', 3, 'exploring', null, null, b_contract, 'Choose and hold the slab before templating.'),
    (v_project, 'Kitchen', 'Countertops', 'Edge profile', 'countertops', 1, 'not_started', null, null, null, 'Needed at templating.'),
    -- Before finish work (8)
    (v_project, 'Primary bath', 'Tile', 'Bathroom floor tile', 'finish', 6, 'decided', 'Hex Carrara marble mosaic', 390000, b_tile, 'Thickness affects the door and threshold heights.'),
    (v_project, 'Hall bath', 'Tile', 'Shower wall tile', 'finish', 6, 'decided', 'Handmade zellige, 4 x 4 in, white', 535000, b_tile, 'Special-order tile can take 4–8 weeks.'),
    (v_project, 'Primary bath', 'Tile', 'Shower wall tile', 'finish', 6, 'exploring', null, null, b_tile, 'Special-order tile can take 4–8 weeks.'),
    (v_project, 'Kitchen', 'Tile', 'Kitchen backsplash', 'finish', 4, 'not_started', null, null, b_tile, 'Affects outlet box depth; tile goes in after counters.'),
    (v_project, 'Whole house', 'Flooring', 'Main floor material', 'finish', 6, 'decided', 'White oak, 5-inch plank, site-finished', null, b_contract, 'Hardwood needs to acclimate in the house for 1–2 weeks.'),
    (v_project, 'Whole house', 'Hardware', 'Door hardware finish and style', 'finish', 4, 'not_started', null, null, null, 'Every door needs passage, privacy or dummy sets.'),
    (v_project, 'Whole house', 'Lighting', 'Decorative fixtures (pendants, sconces)', 'finish', 6, 'exploring', null, null, b_lighting, 'Sconce height must be set at rough-in; fixtures can come later.'),
    (v_project, 'Whole house', 'Paint', 'Paint colors and sheens', 'finish', 2, 'not_started', null, null, null, 'Painter needs a full schedule by room.'),
    -- Before move-in (1)
    (v_project, 'Whole house', 'Window treatments', 'Shades and blinds', 'move_in', 6, 'not_started', null, null, null, 'Some need blocking or wiring at rough-in (motorized).');

  insert into public.ledger_entries
    (project_id, kind, date, vendor, description, amount_cents, bucket_id, change_order_status)
  values
    (v_project, 'invoice', t - 60, 'Bayside Builders', 'Deposit at contract signing', 2850000, b_contract, null),
    (v_project, 'invoice', t - 21, 'Bayside Builders', 'Progress payment: demolition and framing', 4275000, b_contract, null),
    (v_project, 'change_order', t - 12, 'Bayside Builders', 'Move the kitchen window 18 inches', 240000, b_cushion, 'approved'),
    (v_project, 'payment', t - 14, 'Coast Appliance', 'Appliance deposit', 400000, b_appliances, null),
    (v_project, 'payment', t - 9, 'The Tile Shop', 'Deposit on marble and zellige tile', 195000, b_tile, null),
    (v_project, 'change_order', t - 3, 'Bayside Builders', 'Add blocking for a floating vanity', 65000, b_cushion, 'proposed');

  insert into public.events (project_id, actor_id, type, entity_type, entity_id, summary, after)
  values (v_project, v_user, 'setup', 'project', v_project, 'Loaded the sample project',
          jsonb_build_object('decisions', 32, 'buckets', 6, 'ledger_entries', 6));
  return v_project;
end;
$$;

revoke execute on function public.require_editor(uuid), public.add_standard_milestones(uuid),
  public.projects_add_milestones(), public.update_decision(uuid, jsonb, text),
  public.move_milestone(uuid, text, date, text), public.load_sample_project()
  from public, anon, authenticated;
grant execute on function public.update_decision(uuid, jsonb, text),
  public.move_milestone(uuid, text, date, text), public.load_sample_project()
  to authenticated;
