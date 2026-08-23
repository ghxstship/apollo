-- The previous galley migration did nothing. It dropped three policy names that
-- never existed and added a staff-only INSERT policy alongside the real one,
-- "place own order" — and permissive policies OR together, so the member path
-- survived untouched. Worse, its premise was wrong: members DO order from the
-- galley themselves when they are aboard (source 'self'), so staff-only was
-- never the right shape.
--
-- Same answer as the Slop Chest: the member sends a tab, never a price.
-- place_galley_order prices the lines from galley_items, and refuses an order
-- against a voyage the caller is not aboard — which the old path did not check.
create or replace function public.place_galley_order(p_voyage uuid, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_count integer;
  v_total integer;
  v_order uuid;
begin
  if v_uid is null then raise exception 'sign in required'; end if;
  if not public.is_active() then raise exception 'your membership is on hold'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'nothing in the order yet';
  end if;

  if not exists (
    select 1 from public.rsvps r
    where r.voyage_id = p_voyage and r.profile_id = v_uid and r.status = 'aboard'
  ) then
    raise exception 'the galley serves the crew aboard';
  end if;

  select count(*) into v_count
  from jsonb_to_recordset(p_lines) as l("itemId" uuid, qty integer)
  where l.qty between 1 and 20
    and exists (select 1 from public.galley_items g where g.id = l."itemId" and g.active);

  if v_count <> jsonb_array_length(p_lines) then
    raise exception 'the galley shelf changed — reload and try again';
  end if;

  select coalesce(sum(g.price_cents * l.qty), 0)::integer into v_total
  from jsonb_to_recordset(p_lines) as l("itemId" uuid, qty integer)
  join public.galley_items g on g.id = l."itemId";

  insert into public.galley_orders (profile_id, voyage_id, source, total_cents)
  values (v_uid, p_voyage, 'self', v_total)
  returning id into v_order;

  insert into public.galley_order_items (order_id, item_id, qty, price_cents)
  select v_order, l."itemId", l.qty, g.price_cents
  from jsonb_to_recordset(p_lines) as l("itemId" uuid, qty integer)
  join public.galley_items g on g.id = l."itemId";

  return v_order;
end;
$$;

revoke execute on function public.place_galley_order(uuid, jsonb) from public, anon;
grant execute on function public.place_galley_order(uuid, jsonb) to authenticated;

comment on function public.place_galley_order(uuid, jsonb) is
  'Opens one galley tab, priced from the shelf, for a member aboard that sailing. Members never state a price.';

drop policy if exists "place own order" on public.galley_orders;
