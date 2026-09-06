-- WHAT THE LIVE DATA ACTUALLY SAYS. Five of the six orders in the database
-- carry a charged total and no lines at all, which reads like a hole in the
-- checkout. It is not. All five were written in one transaction — the same
-- created_at to the microsecond, 2026-07-24 14:33:45.541627+00, across both
-- shop_orders and galley_orders — every one of them belongs to a
-- @demo.fixtures.invalid member, and their totals are the seeded catalogue
-- prices of the wool jumper and the harbor jacket. They are demonstration
-- headers, seeded a month before place_shop_order existed. The one order
-- placed through the real path, four minutes later, has its line and its
-- header agrees with it exactly: 2200 and 2200.
--
-- SO THE HEADER IS THE AUTHORITY, and correctly so. charge_shop_order posts
-- total_cents - discount_cents from the header; the refund path reads
-- total_cents - discount_cents from the same header. Charge and refund are the
-- same arithmetic on the same row, so a header that disagrees with its lines
-- cannot refund more than it charged. What a disagreement corrupts is the
-- receipt the member reads, not the balance.
--
-- WHAT IS ACTUALLY WRONG is that the header and the lines are priced from TWO
-- separate reads of the catalogue. Under READ COMMITTED each statement takes
-- its own snapshot, so a price edit committing between them leaves a header and
-- a line permanently disagreeing, in the same transaction, with nothing to
-- notice. All three writers had the shape. So: read the catalogue once, and
-- write the header and the lines from that one reading. Header equals the sum
-- of its lines by construction, not by later inspection.

create or replace function public.place_shop_order(p_lines jsonb, p_idem_key text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid      uuid := auth.uid();
  v_tier     text;
  v_count    integer;
  v_priced   jsonb;
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

  /* The one reading of the shelf. Everything below prices from v_priced, so
     the header and the lines cannot be quoted a different catalogue. */
  select jsonb_agg(jsonb_build_object(
           'product_id',  l."productId",
           'qty',         l.qty,
           'size',        case when coalesce(array_length(p.sizes, 1), 0) > 0 then l.size else null end,
           'price_cents', p.price_cents))
    into v_priced
  from jsonb_to_recordset(p_lines) as l("productId" uuid, qty integer, size text)
  join public.products p on p.id = l."productId";

  select coalesce(sum((x->>'price_cents')::integer * (x->>'qty')::integer), 0)::integer
    into v_subtotal
  from jsonb_array_elements(v_priced) x;

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
  select v_order, (x->>'product_id')::uuid, (x->>'qty')::integer, x->>'size', (x->>'price_cents')::integer
  from jsonb_array_elements(v_priced) x;

  return v_order;
end;
$function$;

create or replace function public.place_galley_order(p_episode uuid, p_lines jsonb, p_idem_key text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid    uuid := auth.uid();
  v_count  integer;
  v_priced jsonb;
  v_total  integer;
  v_order  uuid;
  v_key    text := nullif(btrim(coalesce(p_idem_key, '')), '');
begin
  if v_uid is null then raise exception 'sign in required'; end if;
  if not public.is_active() then raise exception 'your membership is paused'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'nothing in the order yet';
  end if;

  if v_key is not null then
    select id into v_order from public.galley_orders
    where profile_id = v_uid and idem_key = v_key;
    if v_order is not null then return v_order; end if;
  end if;

  -- The galley serves the crew on the water, and only the sailing you are on.
  if not exists (
    select 1 from public.passes r
    where r.episode_id = p_episode and r.profile_id = v_uid and r.status = 'aboard'
  ) then
    raise exception 'the galley serves the crew aboard';
  end if;

  select count(*) into v_count
  from jsonb_to_recordset(p_lines) as l("itemId" uuid, qty integer)
  where l.qty between 1 and 12
    and exists (select 1 from public.galley_items g where g.id = l."itemId" and g.active);

  if v_count <> jsonb_array_length(p_lines) then
    raise exception 'the galley shelf changed — reload and try again';
  end if;

  select jsonb_agg(jsonb_build_object('item_id', l."itemId", 'qty', l.qty, 'price_cents', g.price_cents))
    into v_priced
  from jsonb_to_recordset(p_lines) as l("itemId" uuid, qty integer)
  join public.galley_items g on g.id = l."itemId";

  select coalesce(sum((x->>'price_cents')::integer * (x->>'qty')::integer), 0)::integer
    into v_total
  from jsonb_array_elements(v_priced) x;

  begin
    insert into public.galley_orders (profile_id, episode_id, source, total_cents, idem_key)
    values (v_uid, p_episode, 'self', v_total, v_key)
    returning id into v_order;
  exception when unique_violation then
    select id into v_order from public.galley_orders
    where profile_id = v_uid and idem_key = v_key;
    return v_order;
  end;

  insert into public.galley_order_items (order_id, item_id, qty, price_cents)
  select v_order, (x->>'item_id')::uuid, (x->>'qty')::integer, (x->>'price_cents')::integer
  from jsonb_array_elements(v_priced) x;

  return v_order;
end;
$function$;

create or replace function public.settle_galley_ticket(p_profile uuid, p_lines jsonb, p_tender text, p_idem_key text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order  uuid;
  v_priced jsonb;
  v_total  integer;
  v_count  integer;
  v_key    text := nullif(btrim(coalesce(p_idem_key, '')), '');
  v_staff  uuid := auth.uid();
begin
  if not public.is_staff() then raise exception 'that is the Bridge''s to ring'; end if;
  if p_profile is null then raise exception 'attach a member first'; end if;
  if p_tender not in ('account','till') then raise exception 'that is not a tender'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'ring the first item — the order is empty';
  end if;

  -- Already rung under this key: hand back the ticket that exists.
  if v_key is not null then
    select id into v_order from public.galley_orders
    where profile_id = p_profile and idem_key = v_key;
    if v_order is not null then return v_order; end if;
  end if;

  -- The price is the catalogue's, never the caller's — the POS used to send
  -- priceCents and the ledger believed it.
  select count(*) into v_count
  from jsonb_to_recordset(p_lines) as l("itemId" uuid, qty integer)
  where l.qty between 1 and 96
    and exists (select 1 from public.galley_items g where g.id = l."itemId" and g.active);
  if v_count <> jsonb_array_length(p_lines) then
    raise exception 'the galley shelf changed — reload and ring again';
  end if;

  select jsonb_agg(jsonb_build_object('item_id', l."itemId", 'qty', l.qty, 'price_cents', g.price_cents))
    into v_priced
  from jsonb_to_recordset(p_lines) as l("itemId" uuid, qty integer)
  join public.galley_items g on g.id = l."itemId";

  select coalesce(sum((x->>'price_cents')::integer * (x->>'qty')::integer), 0)::integer
    into v_total
  from jsonb_array_elements(v_priced) x;

  begin
    insert into public.galley_orders (profile_id, source, total_cents, idem_key)
    values (p_profile, 'pos', v_total, v_key)
    returning id into v_order;
  exception when unique_violation then
    select id into v_order from public.galley_orders
    where profile_id = p_profile and idem_key = v_key;
    return v_order;
  end;

  insert into public.galley_order_items (order_id, item_id, qty, price_cents)
  select v_order, (x->>'item_id')::uuid, (x->>'qty')::integer, (x->>'price_cents')::integer
  from jsonb_array_elements(v_priced) x;

  if p_tender = 'till' then
    insert into public.account_ledger (profile_id, delta_cents, kind, memo, created_by, idem_key)
    values (p_profile, v_total, 'payment', 'Paid at the till', v_staff,
            case when v_key is null then null else 'galley-till:' || v_key end);
  end if;

  return v_order;
end;
$function$;

-- And a check that the construction held, deferred to commit so the header may
-- be written before the lines it names. It skips an order with no lines at
-- all: that is the shape of the five seeded demonstration headers, and it is
-- the shape the suite's own cleanup passes through when it strikes an order's
-- lines and then the order. An order that HAS lines must agree with them.
create or replace function public.an_order_totals_its_lines()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare oid uuid := coalesce(new.order_id, old.order_id); s integer; t integer;
begin
  select coalesce(sum(price_cents * qty), 0), count(*) into s, t
    from public.shop_order_items where order_id = oid;
  if t = 0 then return null; end if;
  select total_cents into t from public.shop_orders where id = oid;
  if t is null then return null; end if;
  if t is distinct from s then
    raise exception 'an order costs what its lines cost: the header says %, the lines say %', t, s;
  end if;
  return null;
end $function$;

create or replace function public.a_ticket_totals_its_lines()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare oid uuid := coalesce(new.order_id, old.order_id); s integer; t integer;
begin
  select coalesce(sum(price_cents * qty), 0), count(*) into s, t
    from public.galley_order_items where order_id = oid;
  if t = 0 then return null; end if;
  select total_cents into t from public.galley_orders where id = oid;
  if t is null then return null; end if;
  if t is distinct from s then
    raise exception 'a ticket costs what its lines cost: the header says %, the lines say %', t, s;
  end if;
  return null;
end $function$;

drop trigger if exists an_order_totals_its_lines on public.shop_order_items;
create constraint trigger an_order_totals_its_lines
  after insert or update or delete on public.shop_order_items
  deferrable initially deferred
  for each row execute function public.an_order_totals_its_lines();

drop trigger if exists a_ticket_totals_its_lines on public.galley_order_items;
create constraint trigger a_ticket_totals_its_lines
  after insert or update or delete on public.galley_order_items
  deferrable initially deferred
  for each row execute function public.a_ticket_totals_its_lines();
