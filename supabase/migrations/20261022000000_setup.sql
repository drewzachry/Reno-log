-- Phase 5: setting up a project.
--
-- The homeowner answers a few questions; the server asks the AI to draft a
-- plan (stage dates, budget lines, decisions) from those answers, the
-- project's documents and the decision library below. The draft is shown as
-- a preview, and nothing changes until apply_setup saves it. Saving only adds:
-- dates already set, budget lines with the same name and decisions already on
-- the list are kept as they are.

create table public.decision_library (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  title text not null,
  -- How it repeats: per bathroom, per kitchen, once for the house, etc.
  area text not null check (area in ('bath', 'kitchen', 'whole', 'exterior', 'laundry', 'basement', 'addition')),
  milestone_key text not null check (milestone_key in ('rough_in', 'drywall', 'cabinets', 'countertops', 'finish', 'move_in')),
  lead_weeks int not null check (lead_weeks between 0 and 52),
  why text not null,
  sort_order int not null default 0
);
alter table public.decision_library enable row level security;
create policy "anyone signed in reads" on public.decision_library for select to authenticated using (true);
revoke all on public.decision_library from anon, authenticated;
grant select on public.decision_library to authenticated;
grant all on public.decision_library to service_role;

insert into public.decision_library (category, title, area, milestone_key, lead_weeks, why, sort_order) values
  ('Plumbing fixtures', 'Shower valve and trim', 'bath', 'rough_in', 4, 'The valve body is set inside the wall at rough-in and must match the trim you pick.', 1),
  ('Plumbing fixtures', 'Tub (freestanding or alcove)', 'bath', 'rough_in', 6, 'Drain location and floor framing depend on the exact tub.', 2),
  ('Plumbing fixtures', 'Toilet model and rough-in size', 'bath', 'rough_in', 3, 'The drain is placed 10, 12 or 14 inches from the wall to fit a specific toilet.', 3),
  ('Plumbing fixtures', 'Vanity size and sink type', 'bath', 'rough_in', 6, 'Supply and drain heights depend on vanity width and sink style.', 4),
  ('Plumbing fixtures', 'Kitchen sink and faucet', 'kitchen', 'rough_in', 4, 'Sink width sets the base cabinet; faucet holes affect the counter.', 5),
  ('Plumbing fixtures', 'Pot filler (yes/no)', 'kitchen', 'rough_in', 2, 'Needs a water line run during rough-in.', 6),
  ('Electrical', 'Outlet, switch and USB locations', 'whole', 'rough_in', 1, 'The electrician sets boxes at rough-in. Walk the house with them.', 7),
  ('Electrical', 'Recessed and ceiling light layout', 'whole', 'rough_in', 2, 'Cans and junction boxes are placed before insulation.', 8),
  ('Electrical', 'Under-cabinet lighting', 'kitchen', 'rough_in', 1, 'Needs wiring before walls close.', 9),
  ('Electrical', 'TV, speaker and data locations', 'whole', 'rough_in', 1, 'Low-voltage wiring and blocking go in before drywall.', 10),
  ('Electrical', 'Exterior lights and outlets', 'exterior', 'rough_in', 2, 'Boxes are set in the framing.', 11),
  ('Electrical', 'Heated bathroom floor (yes/no)', 'bath', 'rough_in', 2, 'Needs its own circuit and thermostat location.', 12),
  ('HVAC', 'Register and return locations', 'whole', 'rough_in', 1, 'Ducts run at rough-in; registers in the wrong spot block furniture.', 13),
  ('HVAC', 'Bath fan model', 'bath', 'rough_in', 2, 'Duct size and route depend on the fan.', 14),
  ('HVAC', 'Range hood type and CFM', 'kitchen', 'rough_in', 4, 'Duct size, make-up air and wiring depend on the hood.', 15),
  ('Framing', 'Blocking for TVs, grab bars, heavy mirrors', 'whole', 'drywall', 1, 'Wood backing inside the wall. Cheap now, expensive later.', 16),
  ('Framing', 'Shower niche size and location', 'bath', 'drywall', 1, 'Framed before the shower walls are boarded.', 17),
  ('Exterior', 'Windows and exterior doors', 'exterior', 'rough_in', 12, 'Long lead time; openings are framed to the exact unit.', 18),
  ('Exterior', 'Siding and trim material', 'exterior', 'drywall', 6, 'Ordered while the shell is weathered in.', 19),
  ('Exterior', 'Roofing material and color', 'exterior', 'rough_in', 4, 'Usually installed early to dry in the house.', 20),
  ('Insulation', 'Insulation type', 'whole', 'drywall', 2, 'Spray foam vs. batts affects cost and energy rebates.', 21),
  ('Cabinets', 'Kitchen cabinet layout and style', 'kitchen', 'cabinets', 10, 'Custom and semi-custom boxes take 8–12 weeks.', 22),
  ('Cabinets', 'Cabinet paint or stain color', 'kitchen', 'cabinets', 10, 'Needed to place the cabinet order.', 23),
  ('Cabinets', 'Bathroom vanity order', 'bath', 'cabinets', 8, 'Ordered with or alongside kitchen cabinets.', 24),
  ('Appliances', 'Appliance package (models)', 'kitchen', 'cabinets', 10, 'Cabinet openings are built around exact model dimensions.', 25),
  ('Countertops', 'Countertop material and slab', 'kitchen', 'countertops', 3, 'Choose and hold the slab before templating.', 26),
  ('Countertops', 'Edge profile', 'kitchen', 'countertops', 1, 'Needed at templating.', 27),
  ('Countertops', 'Bathroom counter material', 'bath', 'countertops', 3, 'Templated with the kitchen if possible.', 28),
  ('Tile', 'Shower wall tile', 'bath', 'finish', 6, 'Special-order tile can take 4–8 weeks.', 29),
  ('Tile', 'Bathroom floor tile', 'bath', 'finish', 6, 'Thickness affects the door and threshold heights.', 30),
  ('Tile', 'Kitchen backsplash', 'kitchen', 'finish', 4, 'Affects outlet box depth; tile goes in after counters.', 31),
  ('Tile', 'Grout color', 'bath', 'finish', 1, 'Easy to forget; the tile setter will ask on install day.', 32),
  ('Flooring', 'Main floor material', 'whole', 'finish', 6, 'Hardwood needs to acclimate in the house for 1–2 weeks.', 33),
  ('Flooring', 'Stain color (if site-finished)', 'whole', 'finish', 1, 'Do samples on your actual floor.', 34),
  ('Doors & trim', 'Interior door style', 'whole', 'finish', 6, 'Pre-hung doors are ordered by size and swing.', 35),
  ('Doors & trim', 'Trim and casing profile', 'whole', 'finish', 3, 'Ordered as a package by the carpenter.', 36),
  ('Hardware', 'Door hardware finish and style', 'whole', 'finish', 4, 'Every door needs passage, privacy or dummy sets.', 37),
  ('Hardware', 'Cabinet pulls and knobs', 'kitchen', 'finish', 3, 'Count every drawer and door.', 38),
  ('Hardware', 'Bath accessories (towel bars, hooks, TP)', 'bath', 'drywall', 2, 'Placement needs blocking before drywall.', 39),
  ('Lighting', 'Decorative fixtures (pendants, sconces)', 'whole', 'finish', 6, 'Sconce height must be set at rough-in; fixtures can come later.', 40),
  ('Paint', 'Paint colors and sheens', 'whole', 'finish', 2, 'Painter needs a full schedule by room.', 41),
  ('Paint', 'Exterior paint colors', 'exterior', 'finish', 2, 'Weather-dependent; decide early.', 42),
  ('Glass', 'Shower glass', 'bath', 'finish', 3, 'Measured after tile is complete; 2–3 week lead.', 43),
  ('Closets', 'Closet system', 'whole', 'finish', 4, 'Needs blocking if wall-hung.', 44),
  ('Window treatments', 'Shades and blinds', 'whole', 'move_in', 6, 'Some need blocking or wiring at rough-in (motorized).', 45),
  ('Laundry', 'Washer and dryer location and venting', 'laundry', 'rough_in', 2, 'Water, drain, power and the dryer vent run are set at rough-in.', 46),
  ('Laundry', 'Utility sink (yes/no)', 'laundry', 'rough_in', 2, 'Needs a water line and a drain before the walls close.', 47),
  ('Basement', 'Egress window size and location', 'basement', 'rough_in', 8, 'A bedroom below ground needs a code-sized escape window, cut early.', 48),
  ('Basement', 'Sump pump and drainage', 'basement', 'rough_in', 2, 'Goes in with the slab and the below-ground plumbing.', 49),
  ('Basement', 'Dehumidifier', 'basement', 'finish', 2, 'Needs a drain and an outlet nearby.', 50),
  ('Addition', 'Foundation waterproofing', 'addition', 'rough_in', 2, 'Applied before the dirt is filled back in; later it means digging.', 51),
  ('Addition', 'Heating and cooling capacity check', 'addition', 'rough_in', 2, 'More space may need a bigger system or a new zone.', 52),
  ('Addition', 'Attic access location', 'addition', 'drywall', 1, 'Framed before the ceilings are boarded.', 53),
  ('Electrical', 'Electrical service upgrade and panel location', 'whole', 'rough_in', 6, 'Bigger loads may need a new service, and the utility can take weeks.', 54),
  ('Electrical', 'Smart home and security wiring', 'whole', 'rough_in', 2, 'Low-voltage wire goes in before drywall.', 55),
  ('Electrical', 'EV charger (yes/no)', 'exterior', 'rough_in', 2, 'Needs its own 240-volt circuit from the panel.', 56),
  ('Electrical', 'Generator hookup (yes/no)', 'exterior', 'rough_in', 4, 'Needs a transfer switch or interlock at the panel.', 57),
  ('Exterior', 'Gutters and downspouts', 'exterior', 'finish', 3, 'Installed after siding and roofing, to carry water away from the foundation.', 58),
  ('Exterior', 'Landscaping restoration', 'exterior', 'move_in', 4, 'Plan repairs to the yard once the heavy equipment leaves.', 59),
  ('Appliances', 'Appliance delivery date', 'kitchen', 'finish', 2, 'Time delivery so nothing sits in the way or gets damaged.', 60),
  ('Move-in', 'Final cleaning', 'whole', 'move_in', 2, 'Construction dust needs a professional clean before you move in.', 61),
  ('Move-in', 'Punch-list walkthrough', 'whole', 'move_in', 1, 'Walk the house with the contractor and list every fix before the final payment.', 62);

alter table public.projects add column start_date date, add column target_move_in date;

create table public.setup_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  created_by uuid references public.profiles (id),
  status text not null default 'building'
    check (status in ('building', 'ready', 'failed', 'applied', 'discarded')),
  answers jsonb not null,
  plan jsonb,
  progress text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index setup_plans_project_idx on public.setup_plans (project_id, created_at desc);
alter table public.setup_plans enable row level security;
create policy "members read" on public.setup_plans for select to authenticated
  using (public.project_role(project_id) is not null);
revoke all on public.setup_plans from anon, authenticated;
grant select on public.setup_plans to authenticated;
grant all on public.setup_plans to service_role;

alter table public.jobs drop constraint jobs_type_check;
alter table public.jobs add constraint jobs_type_check check (type in ('read_document', 'build_setup'));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.setup_plans;
  end if;
end;
$$;

-- ---------------------------------------------------------------- functions

-- Starts drafting a plan from the homeowner's answers. Any earlier draft that
-- wasn't saved is set aside.
create function public.request_setup(p_project_id uuid, p_answers jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public.require_editor(p_project_id);
  v_id uuid;
begin
  if btrim(coalesce(p_answers ->> 'scope', '')) = '' then
    raise exception 'Say what you''re renovating.' using errcode = '22023';
  end if;
  if coalesce(p_answers ->> 'start_date', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Add a start date.' using errcode = '22023';
  end if;
  update public.setup_plans set status = 'discarded', updated_at = now()
  where project_id = p_project_id and status in ('building', 'ready', 'failed');
  update public.jobs set status = 'done', error = 'replaced', updated_at = now()
  where type = 'build_setup' and status in ('queued', 'running')
    and payload ->> 'project_id' = p_project_id::text;
  insert into public.setup_plans (project_id, created_by, answers, progress)
  values (p_project_id, v_user, p_answers, 'Waiting to start')
  returning id into v_id;
  insert into public.jobs (type, payload)
  values ('build_setup', jsonb_build_object('plan_id', v_id, 'project_id', p_project_id));
  return v_id;
end;
$$;

create function public.discard_setup(p_plan_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.setup_plans;
begin
  select * into v_plan from public.setup_plans where id = p_plan_id for update;
  if not found then
    raise exception 'That plan isn''t on this project.' using errcode = 'P0002';
  end if;
  perform public.require_editor(v_plan.project_id);
  if v_plan.status in ('building', 'ready', 'failed') then
    update public.setup_plans set status = 'discarded', updated_at = now() where id = p_plan_id;
    update public.jobs set status = 'done', error = 'discarded', updated_at = now()
    where type = 'build_setup' and payload ->> 'plan_id' = p_plan_id::text and status in ('queued', 'running');
  end if;
end;
$$;

-- Saves a ready plan, adding only what isn't there yet, and logs it as one
-- setup event. Returns what was added.
create function public.apply_setup(p_plan_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.setup_plans;
  v_user uuid;
  v_pid uuid;
  p jsonb;
  m record;
  b jsonb;
  d jsonb;
  v_bucket uuid;
  v_buckets jsonb := '{}';
  v_dates int := 0;
  v_new_buckets int := 0;
  v_new_decisions int := 0;
  v_skipped int := 0;
  v_sort int;
begin
  select * into v_plan from public.setup_plans where id = p_plan_id for update;
  if not found then
    raise exception 'That plan isn''t on this project.' using errcode = 'P0002';
  end if;
  v_user := public.require_editor(v_plan.project_id);
  if v_plan.status <> 'ready' then
    raise exception 'That plan was already %.', case v_plan.status when 'applied' then 'saved' else 'set aside' end
      using errcode = '23505';
  end if;
  v_pid := v_plan.project_id;
  p := v_plan.plan;

  -- The homeowner's own answers about the project.
  update public.projects
  set scope = coalesce(nullif(btrim(v_plan.answers ->> 'scope'), ''), scope),
      start_date = coalesce((v_plan.answers ->> 'start_date')::date, start_date),
      target_move_in = coalesce(nullif(v_plan.answers ->> 'move_in', '')::date, target_move_in)
  where id = v_pid;

  -- Stage dates, only where none is set.
  for m in select key, value #>> '{}' as date from jsonb_each(coalesce(p -> 'milestones', '{}')) loop
    update public.milestones set date = m.date::date
    where project_id = v_pid and key = m.key and date is null and m.date ~ '^\d{4}-\d{2}-\d{2}$';
    if found then v_dates := v_dates + 1; end if;
  end loop;

  -- Budget lines, reusing one with the same name.
  select coalesce(max(sort_order), 0) into v_sort from public.budget_buckets where project_id = v_pid;
  for b in select * from jsonb_array_elements(coalesce(p -> 'buckets', '[]')) loop
    select id into v_bucket from public.budget_buckets
    where project_id = v_pid and deleted_at is null and lower(btrim(name)) = lower(btrim(b ->> 'name'))
    limit 1;
    if v_bucket is null then
      v_sort := v_sort + 1;
      insert into public.budget_buckets (project_id, name, kind, budget_cents, sort_order)
      values (v_pid, btrim(b ->> 'name'), b ->> 'kind', greatest(0, (b ->> 'budget_cents')::bigint), v_sort)
      returning id into v_bucket;
      v_new_buckets := v_new_buckets + 1;
    end if;
    v_buckets := v_buckets || jsonb_build_object(b ->> 'key', v_bucket);
  end loop;

  -- Decisions, skipping any already on the list (same title and room).
  for d in select * from jsonb_array_elements(coalesce(p -> 'decisions', '[]')) loop
    if exists (
      select 1 from public.decisions
      where project_id = v_pid and deleted_at is null
        and lower(btrim(title)) = lower(btrim(d ->> 'title'))
        and lower(btrim(room)) = lower(btrim(coalesce(d ->> 'room', 'Whole house')))
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    insert into public.decisions (project_id, title, room, category, why, milestone_key, lead_weeks,
      status, selection, bucket_id, source)
    values (v_pid, btrim(d ->> 'title'), coalesce(nullif(btrim(d ->> 'room'), ''), 'Whole house'),
      nullif(btrim(d ->> 'category'), ''), nullif(btrim(d ->> 'why'), ''), d ->> 'milestone_key',
      greatest(0, least(104, coalesce((d ->> 'lead_weeks')::int, 0))),
      case when d ->> 'status' = 'decided' then 'decided' else 'not_started' end,
      nullif(btrim(d ->> 'selection'), ''),
      (v_buckets ->> (d ->> 'bucket_key'))::uuid,
      nullif(btrim(d ->> 'source'), ''));
    v_new_decisions := v_new_decisions + 1;
  end loop;

  update public.setup_plans set status = 'applied', updated_at = now() where id = p_plan_id;
  insert into public.events (project_id, actor_id, type, entity_type, entity_id, summary, after)
  values (v_pid, v_user, 'setup', 'project', v_pid,
    'Project set up: ' || v_new_decisions || ' decision' || case when v_new_decisions = 1 then '' else 's' end
      || ', ' || v_new_buckets || ' budget line' || case when v_new_buckets = 1 then '' else 's' end
      || ', ' || v_dates || ' date' || case when v_dates = 1 then '' else 's' end
      || case when v_skipped > 0 then ' (' || v_skipped || ' already on the list)' else '' end,
    jsonb_build_object('decisions', v_new_decisions, 'buckets', v_new_buckets, 'dates', v_dates,
      'skipped', v_skipped, 'plan_id', p_plan_id));
  return jsonb_build_object('decisions', v_new_decisions, 'buckets', v_new_buckets, 'dates', v_dates,
    'skipped', v_skipped);
end;
$$;

revoke execute on function public.request_setup(uuid, jsonb), public.discard_setup(uuid),
  public.apply_setup(uuid) from public, anon;
grant execute on function public.request_setup(uuid, jsonb), public.discard_setup(uuid),
  public.apply_setup(uuid) to authenticated;
