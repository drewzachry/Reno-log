-- People can set their own name, and History keeps showing the names of
-- people who have since left the project.

-- Visible profiles: yourself, people on a project with you, and anyone who
-- appears in the history of a project you're on.
create or replace function public.shares_project_with(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members mine
    join public.project_members theirs on theirs.project_id = mine.project_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  ) or exists (
    select 1 from public.events e
    join public.project_members mine on mine.project_id = e.project_id
    where mine.user_id = auth.uid() and e.actor_id = p_user_id
  );
$$;

create function public.set_my_name(p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(p_name);
begin
  perform public.require_user();
  if v_name = '' or char_length(v_name) > 80 then
    raise exception 'Names can be 1 to 80 characters.' using errcode = '22023';
  end if;
  update public.profiles set display_name = v_name where id = auth.uid();
end;
$$;

revoke execute on function public.set_my_name(text) from public, anon;
grant execute on function public.set_my_name(text) to authenticated;
