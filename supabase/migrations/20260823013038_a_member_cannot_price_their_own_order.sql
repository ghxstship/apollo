-- The Slop Chest minted money. guard_shop_order_columns runs BEFORE UPDATE, so
-- it protected an order only after it existed; the charge fires AFTER INSERT.
-- A member could therefore POST a brand-new order with any economics they liked
-- and charge_shop_order would post -(total_cents - discount_cents) — a discount
-- larger than the total makes that a POSITIVE ledger entry, i.e. house credit
-- out of nothing. total_cents = 1 bought anything, and status could be set to
-- 'fulfilled' on the way in. galley_orders had no column guard at all, so a
-- self-priced galley order undercharged the same way.
--
-- Two moves. First, a member never states a price again: place_shop_order()
-- prices the crate from the catalogue inside the database and writes the order
-- and its items in one transaction. Second, the raw INSERT paths are closed and
-- the charge itself is made incapable of paying a member.
-- (The function body is superseded below by the set-based version.)

-- Members place orders through the RPC now, so the direct INSERT goes away.
drop policy if exists "place shop order" on public.shop_orders;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.shop_orders'::regclass and polname = 'staff place shop order'
  ) then
    create policy "staff place shop order" on public.shop_orders
      for insert to authenticated
      with check (public.is_staff());
  end if;
end $$;

-- A purchase charges. It must never, under any arithmetic, pay a member.
create or replace function public.charge_shop_order()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_net integer := greatest(coalesce(new.total_cents, 0) - coalesce(new.discount_cents, 0), 0);
begin
  if v_net > 0 then
    insert into public.account_ledger (profile_id, delta_cents, kind, memo, created_by)
    values (new.profile_id, -v_net, 'chandlery', 'The Slop Chest', new.profile_id);
  end if;
  return new;
end $function$;
