-- Unpaid invoices, and the budget math the project dashboard uses.
--
-- An invoice is a bill: it can be received before it is paid. Until now every
-- invoice counted as money already out the door, which made "still to pay" and
-- the buffer look better than they were. An invoice is now paid unless it is
-- marked unpaid (so every existing invoice stays as it was); "Mark paid" on the
-- Budget screen, or the chat, settles it. Payments and credits are always money
-- that has moved.

alter table public.ledger_entries add column unpaid boolean not null default false;
alter table public.ledger_entries add constraint ledger_unpaid_invoices_only
  check (not unpaid or kind = 'invoice');

drop function public.log_ledger_entry(uuid, text, date, text, text, bigint, uuid, uuid, text[], text);

create function public.log_ledger_entry(
  p_project_id uuid, p_kind text, p_date date, p_vendor text, p_description text,
  p_amount_cents bigint, p_bucket_id uuid, p_file_id uuid, p_flags text[],
  p_change_order_status text default null,
  p_unpaid boolean default false
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
    bucket_id, file_id, flags, change_order_status, unpaid)
  values (p_project_id, p_kind, coalesce(p_date, current_date), btrim(p_vendor), nullif(btrim(p_description), ''),
    p_amount_cents, p_bucket_id, p_file_id, coalesce(p_flags, '{}'),
    case when p_kind = 'change_order' then coalesce(p_change_order_status, 'proposed') end,
    p_kind = 'invoice' and coalesce(p_unpaid, false))
  returning id into v_id;

  insert into public.events (project_id, actor_id, type, entity_type, entity_id, summary, after)
  values (p_project_id, v_user, case when p_kind = 'change_order' then 'budget' else 'invoice' end,
    'ledger_entry', v_id,
    case p_kind when 'change_order' then 'Change order logged' when 'payment' then 'Payment logged'
                when 'credit' then 'Credit logged' else 'Invoice logged' end
      || ': ' || btrim(p_vendor) || ' ' || public.money_text(p_amount_cents)
      || coalesce(' for ' || nullif(btrim(p_description), ''), '')
      || coalesce(' (' || v_bucket || ')', '')
      || case when p_kind = 'invoice' and coalesce(p_unpaid, false) then ', not paid yet' else '' end,
    jsonb_build_object('kind', p_kind, 'amount_cents', p_amount_cents, 'vendor', btrim(p_vendor),
      'unpaid', p_kind = 'invoice' and coalesce(p_unpaid, false)));
  return v_id;
end;
$$;

revoke execute on function public.log_ledger_entry(uuid, text, date, text, text, bigint, uuid, uuid, text[], text, boolean)
  from public, anon, authenticated;

create or replace function public.confirm_proposal(p_proposal_id uuid) returns jsonb
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
        array(select jsonb_array_elements_text(coalesce(d -> 'flags', '[]'))),
        null, coalesce((d ->> 'unpaid')::boolean, false));
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

-- Marks an invoice paid, or back to unpaid. History keeps both.
create function public.set_invoice_paid(p_entry_id uuid, p_paid boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_e public.ledger_entries;
  v_user uuid;
begin
  select * into v_e from public.ledger_entries where id = p_entry_id and deleted_at is null for update;
  if not found then
    raise exception 'That invoice isn''t on this project.' using errcode = 'P0002';
  end if;
  v_user := public.require_editor(v_e.project_id);
  if v_e.kind <> 'invoice' then
    raise exception 'Only invoices can be marked paid or unpaid.' using errcode = '22023';
  end if;
  if v_e.unpaid = not p_paid then
    return;
  end if;
  update public.ledger_entries set unpaid = not p_paid where id = p_entry_id;
  insert into public.events (project_id, actor_id, type, entity_type, entity_id, summary, before, after)
  values (v_e.project_id, v_user, 'invoice', 'ledger_entry', p_entry_id,
    case when p_paid then 'Invoice marked paid: ' else 'Invoice marked not paid: ' end
      || v_e.vendor || ' ' || public.money_text(v_e.amount_cents),
    jsonb_build_object('unpaid', v_e.unpaid), jsonb_build_object('unpaid', not p_paid));
end;
$$;

revoke execute on function public.set_invoice_paid(uuid, boolean) from public, anon;
grant execute on function public.set_invoice_paid(uuid, boolean) to authenticated;
