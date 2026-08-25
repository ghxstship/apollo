-- The galley learned this yesterday and the Slop Chest never did. Checkout is
-- one server action into place_shop_order, and charge_shop_order posts the
-- debit on AFTER INSERT — so an order is a charge, and nothing anywhere said
-- which order this was. The crate button disables while the request is in
-- flight, which covers a double-click in one tab and nothing else. It does not
-- cover the failure this club actually has: a request that reached the club and
-- was charged, whose RESPONSE the boat wifi swallowed. The member sees a dead
-- page, sends the crate again, and is charged twice for the same crate.
--
-- Same shape as galley_orders: the client mints a key once per crate and
-- re-sends it unchanged on every retry, a unique index does the refusing, and
-- the function returns the order that already exists rather than raising —
-- because from the member's side the order did go through, the first time.
alter table public.shop_orders
  add column if not exists idem_key text;

comment on column public.shop_orders.idem_key is
  'Client-minted, one per crate, re-sent unchanged on every retry. Unique per member so a resent order is recognised rather than charged again.';

create unique index if not exists shop_orders_idem_key_once
  on public.shop_orders (profile_id, idem_key)
  where idem_key is not null;

create or replace function public.place_shop_order(
  p_lines jsonb,
  p_idem_key text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid      uuid := auth.uid();
  v_tier     text;
  v_count    integer;
  v_subtotal integer;
  v_discount integer := 0;
  v_order    uuid;
  v_key      text := nullif(btrim(coalesce(p_idem_key, '')), '');
begin
  if v_uid is null then raise exception 'sign in required'; end if;
  if not public.is_active() then raise exception 'your membership is paused'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'the crate is empty';
  end if;

  -- Already placed under this key: hand back the order that exists. A resend
  -- must look, from the member's side, exactly like the first success.
  if v_key is not null then
    select id into v_order from public.shop_orders
    where profile_id = v_uid and idem_key = v_key;
    if v_order is not null then return v_order; end if;
  end if;

  select tier into v_tier from public.profiles where id = v_uid;

  select count(*) into v_count
  from jsonb_to_recordset(p_lines) as l("productId" uuid, qty integer, size text)
  where l.qty between 1 and 12
    and exists (select 1 from public.products p where p.id = l."productId" and p.active);

  if v_count <> jsonb_array_length(p_lines) then
    raise exception 'the shelf changed — reload and try again';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as l("productId" uuid, qty integer, size text)
    join public.products p on p.id = l."productId"
    where coalesce(array_length(p.sizes, 1), 0) > 0
      and (l.size is null or not (l.size = any (p.sizes)))
  ) then
    raise exception 'pick a size first';
  end if;

  select coalesce(sum(p.price_cents * l.qty), 0)::integer into v_subtotal
  from jsonb_to_recordset(p_lines) as l("productId" uuid, qty integer, size text)
  join public.products p on p.id = l."productId";

  if v_tier = 'global' then v_discount := round(v_subtotal * 0.15); end if;

  begin
    insert into public.shop_orders (profile_id, total_cents, discount_cents, status, idem_key)
    values (v_uid, v_subtotal, v_discount, 'placed', v_key)
    returning id into v_order;
  exception when unique_violation then
    -- Two resends arrived at once. The other one is the order.
    select id into v_order from public.shop_orders
    where profile_id = v_uid and idem_key = v_key;
    return v_order;
  end;

  insert into public.shop_order_items (order_id, product_id, qty, size, price_cents)
  select v_order, l."productId", l.qty,
         case when coalesce(array_length(p.sizes, 1), 0) > 0 then l.size else null end,
         p.price_cents
  from jsonb_to_recordset(p_lines) as l("productId" uuid, qty integer, size text)
  join public.products p on p.id = l."productId";

  return v_order;
end;
$function$;

-- The one-argument form is dropped so no caller can quietly keep using the
-- version with no key. A signature that still works is a signature that stays.
drop function if exists public.place_shop_order(jsonb);

revoke execute on function public.place_shop_order(jsonb, text) from public, anon;
grant execute on function public.place_shop_order(jsonb, text) to authenticated;;
