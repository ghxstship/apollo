-- Checkout runs in the database: the crate is priced from the catalogue, so
-- nothing a member sends decides what they are charged.
--
-- jsonb_to_recordset matches JSON keys to column names case-sensitively, and the
-- client sends "productId". An unquoted column folds to productid and matched
-- nothing, so every crate looked like it had vanished from the shelf. Quote it.
create or replace function public.place_shop_order(p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid      uuid := auth.uid();
  v_tier     text;
  v_count    integer;
  v_subtotal integer;
  v_discount integer := 0;
  v_order    uuid;
begin
  if v_uid is null then raise exception 'sign in required'; end if;
  if not public.is_active() then raise exception 'your membership is on hold'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'the crate is empty';
  end if;

  select tier into v_tier from public.profiles where id = v_uid;

  select count(*) into v_count
  from jsonb_to_recordset(p_lines) as l("productId" uuid, qty integer, size text)
  where l.qty between 1 and 20
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

  -- The one discount the house gives, taken from the tier on the record.
  if v_tier = 'global' then v_discount := round(v_subtotal * 0.15); end if;

  insert into public.shop_orders (profile_id, total_cents, discount_cents, status)
  values (v_uid, v_subtotal, v_discount, 'placed')
  returning id into v_order;

  insert into public.shop_order_items (order_id, product_id, qty, size, price_cents)
  select v_order, l."productId", l.qty,
         case when coalesce(array_length(p.sizes, 1), 0) > 0 then l.size else null end,
         p.price_cents
  from jsonb_to_recordset(p_lines) as l("productId" uuid, qty integer, size text)
  join public.products p on p.id = l."productId";

  return v_order;
end;
$$;

revoke execute on function public.place_shop_order(jsonb) from public, anon;
grant execute on function public.place_shop_order(jsonb) to authenticated;

comment on function public.place_shop_order(jsonb) is
  'Places one Slop Chest order, priced from the catalogue. Members never state a price; the raw INSERT path is closed to them.';
