-- Money set aside for the project: named accounts and amounts the owner
-- types in (savings, a home equity line). Not linked to any real account.
-- The app compares the total with what's still to pay to show a buffer.

create table public.funding_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  amount_cents bigint not null check (amount_cents between 0 and 100000000000),
  sort_order int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index funding_sources_project_idx on public.funding_sources (project_id);

alter table public.funding_sources enable row level security;
create policy "members read" on public.funding_sources for select to authenticated
  using (public.project_role(project_id) is not null);
revoke all on public.funding_sources from anon, authenticated;
grant select on public.funding_sources to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.funding_sources;
  end if;
end;
$$;

create function public.money_text(p_cents bigint) returns text
language sql immutable set search_path = '' as $$
  select '$' || to_char(round(p_cents / 100.0), 'FM999,999,999,990');
$$;

-- Adds an account (p_id null) or changes one's name or amount.
create function public.save_funding_source(
  p_project_id uuid, p_id uuid, p_name text, p_amount_cents bigint
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public.require_editor(p_project_id);
  v_old public.funding_sources;
  v_id uuid;
  v_name text := btrim(p_name);
begin
  if v_name is null or v_name = '' or char_length(v_name) > 80 then
    raise exception 'Give the account a name (up to 80 characters).' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents < 0 then
    raise exception 'Enter an amount of zero or more.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.funding_sources (project_id, name, amount_cents, sort_order)
    values (p_project_id, v_name, p_amount_cents,
            coalesce((select max(sort_order) + 1 from public.funding_sources where project_id = p_project_id), 1))
    returning id into v_id;
    insert into public.events (project_id, actor_id, type, entity_type, entity_id, summary, after)
    values (p_project_id, v_user, 'budget', 'funding_source', v_id,
            'Added ' || v_name || ': ' || public.money_text(p_amount_cents) || ' for the project',
            jsonb_build_object('name', v_name, 'amount_cents', p_amount_cents));
    return v_id;
  end if;

  select * into v_old from public.funding_sources
  where id = p_id and project_id = p_project_id and deleted_at is null for update;
  if not found then
    raise exception 'That account isn''t on this project.' using errcode = 'P0002';
  end if;
  if v_old.name = v_name and v_old.amount_cents = p_amount_cents then
    return p_id;
  end if;

  update public.funding_sources set name = v_name, amount_cents = p_amount_cents, updated_at = now()
  where id = p_id;
  insert into public.events (project_id, actor_id, type, entity_type, entity_id, summary, before, after)
  values (p_project_id, v_user, 'budget', 'funding_source', p_id,
          case when v_old.amount_cents <> p_amount_cents
               then v_name || ' changed from ' || public.money_text(v_old.amount_cents) || ' to ' || public.money_text(p_amount_cents)
               else v_old.name || ' renamed to ' || v_name end,
          jsonb_build_object('name', v_old.name, 'amount_cents', v_old.amount_cents),
          jsonb_build_object('name', v_name, 'amount_cents', p_amount_cents));
  return p_id;
end;
$$;

-- Soft delete: the row stays, with an event saying it was removed.
create function public.remove_funding_source(p_project_id uuid, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public.require_editor(p_project_id);
  v_old public.funding_sources;
begin
  select * into v_old from public.funding_sources
  where id = p_id and project_id = p_project_id and deleted_at is null for update;
  if not found then
    return;
  end if;
  update public.funding_sources set deleted_at = now() where id = p_id;
  insert into public.events (project_id, actor_id, type, entity_type, entity_id, summary, before)
  values (p_project_id, v_user, 'budget', 'funding_source', p_id,
          'Removed ' || v_old.name || ' (' || public.money_text(v_old.amount_cents) || ')',
          jsonb_build_object('name', v_old.name, 'amount_cents', v_old.amount_cents));
end;
$$;

-- The sample project now includes two accounts.
create or replace function public.load_sample_project() returns uuid
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

  insert into public.funding_sources (project_id, name, amount_cents, sort_order) values
    (v_project, 'Savings', 9000000, 1),
    (v_project, 'Home equity line of credit', 20000000, 2);

  insert into public.events (project_id, actor_id, type, entity_type, entity_id, summary, after)
  values (v_project, v_user, 'setup', 'project', v_project, 'Loaded the sample project',
          jsonb_build_object('decisions', 32, 'buckets', 6, 'ledger_entries', 6, 'funding_sources', 2));
  return v_project;
end;
$$;

revoke execute on function public.money_text(bigint),
  public.save_funding_source(uuid, uuid, text, bigint), public.remove_funding_source(uuid, uuid),
  public.load_sample_project()
  from public, anon, authenticated;
grant execute on function public.save_funding_source(uuid, uuid, text, bigint),
  public.remove_funding_source(uuid, uuid), public.load_sample_project()
  to authenticated;
