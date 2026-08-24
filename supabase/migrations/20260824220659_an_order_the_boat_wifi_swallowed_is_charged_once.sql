-- The galley has an offline queue because boat wifi drops. That queue replays
-- on mount and on `online`, and it drops an order only when the server answers
-- with an error — so the one failure mode the feature exists FOR is the one it
-- handles worst: a request that reached the server, was charged, and whose
-- RESPONSE was lost. The client sees a thrown fetch, queues the order, and
-- sends it again. The member is charged twice for the same round.
--
-- Nothing deduped: place_galley_order takes a line list and nothing else, and
-- charge_galley_order posts the debit on AFTER INSERT.
--
-- The client mints a key per order and re-sends the SAME key on every retry,
-- so a replay is recognised as the order it already is. A unique index does the
-- refusing, and the function returns the existing order id rather than raising:
-- from the member's side the order went through, which is the truth — it did,
-- the first time.
alter table public.galley_orders
  add column if not exists idem_key text;

comment on column public.galley_orders.idem_key is
  'Client-minted, one per order, re-sent unchanged on every offline retry. Unique per member so a replayed order is recognised rather than charged again.';

create unique index if not exists galley_orders_idem_key_once
  on public.galley_orders (profile_id, idem_key)
  where idem_key is not null;

create or replace function public.place_galley_order(
  p_voyage uuid,
  p_lines jsonb,
  p_idem_key text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_count integer;
  v_total integer;
  v_order uuid;
  v_key   text := nullif(btrim(coalesce(p_idem_key, '')), '');
begin
  if v_uid is null then raise exception 'sign in required'; end if;
  if not public.is_active() then raise exception 'your membership is on hold'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'nothing in the order yet';
  end if;

  -- Already placed under this key: hand back the order that exists. A replay
  -- must look, from the member's side, exactly like the first success.
  if v_key is not null then
    select id into v_order from public.galley_orders
    where profile_id = v_uid and idem_key = v_key;
    if v_order is not null then return v_order; end if;
  end if;

  -- The galley serves the crew on the water, and only the sailing you are on.
  if not exists (
    select 1 from public.rsvps r
    where r.voyage_id = p_voyage and r.profile_id = v_uid and r.status = 'aboard'
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

  select coalesce(sum(g.price_cents * l.qty), 0)::integer into v_total
  from jsonb_to_recordset(p_lines) as l("itemId" uuid, qty integer)
  join public.galley_items g on g.id = l."itemId";

  begin
    insert into public.galley_orders (profile_id, voyage_id, source, total_cents, idem_key)
    values (v_uid, p_voyage, 'self', v_total, v_key)
    returning id into v_order;
  exception when unique_violation then
    -- Two replays arrived at once. The other one is the order.
    select id into v_order from public.galley_orders
    where profile_id = v_uid and idem_key = v_key;
    return v_order;
  end;

  insert into public.galley_order_items (order_id, item_id, qty, price_cents)
  select v_order, l."itemId", l.qty, g.price_cents
  from jsonb_to_recordset(p_lines) as l("itemId" uuid, qty integer)
  join public.galley_items g on g.id = l."itemId";

  return v_order;
end;
$function$;

-- The two-argument form is dropped so no caller can quietly keep using the
-- version with no key. A signature that still works is a signature that stays.
drop function if exists public.place_galley_order(uuid, jsonb);

revoke execute on function public.place_galley_order(uuid, jsonb, text) from public, anon;
grant execute on function public.place_galley_order(uuid, jsonb, text) to authenticated;
;
