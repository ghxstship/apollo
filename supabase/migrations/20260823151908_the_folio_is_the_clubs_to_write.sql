-- The free pass, a fourth time, and the deepest. handle_rsvp_aboard asks "does
-- this member already owe anything on this sailing" by summing account_ledger —
-- a table the member could write to. Post one row of minus one cent and the sum
-- is positive, so the trigger decides the pass is paid for and charges nothing.
--
-- Round 3 capped exactly this trick inside accept_pass_transfer and left the
-- identical unfiltered sum here. The fault is upstream: a member could write
-- their own charges at all. Add-ons were the only reason, so they move to a
-- definer and the folio becomes what it always claimed to be.
create or replace function public.attach_addons(p_rsvp uuid, p_addons uuid[], p_qty integer)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  r record; n integer := 0;
  v_qty integer := greatest(1, least(coalesce(p_qty, 1), 12));
begin
  if v_uid is null then raise exception 'sign in required'; end if;
  if not public.is_active() then raise exception 'your membership is on hold'; end if;
  if not exists (select 1 from public.rsvps where id = p_rsvp and profile_id = v_uid and status = 'aboard') then
    raise exception 'that pass is not yours';
  end if;

  for r in
    select a.id, a.name, a.price_cents, rv.voyage_id
    from public.addons a
    cross join lateral (select voyage_id from public.rsvps where id = p_rsvp) rv
    where a.id = any(coalesce(p_addons, '{}')) and a.active
      and not exists (select 1 from public.rsvp_addons x where x.rsvp_id = p_rsvp and x.addon_id = a.id)
  loop
    insert into public.rsvp_addons (rsvp_id, addon_id, qty) values (p_rsvp, r.id, v_qty);
    insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id, created_by)
    values (v_uid, -(r.price_cents * v_qty), 'addon', r.name, r.voyage_id, p_rsvp, v_uid);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.attach_addons(uuid, uuid[], integer) from public, anon;
grant execute on function public.attach_addons(uuid, uuid[], integer) to authenticated;

drop policy if exists "member posts own charges" on public.account_ledger;

drop policy if exists "own rsvp addons" on public.rsvp_addons;
create policy "read own rsvp addons" on public.rsvp_addons
  for select to authenticated
  using (exists (select 1 from public.rsvps r where r.id = rsvp_addons.rsvp_id
                 and (r.profile_id = auth.uid() or public.is_staff())));
create policy "staff attach addons" on public.rsvp_addons
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "own or staff order items" on public.galley_order_items;
create policy "read own galley lines" on public.galley_order_items
  for select to authenticated
  using (exists (select 1 from public.galley_orders o where o.id = galley_order_items.order_id
                 and (o.profile_id = auth.uid() or public.is_staff())));
create policy "staff write galley lines" on public.galley_order_items
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "own or staff shop items" on public.shop_order_items;
create policy "read own shop lines" on public.shop_order_items
  for select to authenticated
  using (exists (select 1 from public.shop_orders o where o.id = shop_order_items.order_id
                 and (o.profile_id = auth.uid() or public.is_staff())));
create policy "staff write shop lines" on public.shop_order_items
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
