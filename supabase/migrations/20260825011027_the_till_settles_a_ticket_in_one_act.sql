-- The staff POS made three writes with nothing holding them together, and the
-- CHARGE lands on the first one — `on_galley_order` fires charge_galley_order
-- on AFTER INSERT. So:
--
--   the items insert fails → the member is charged, the ticket has no lines,
--   and the operator is told "That didn't land. Try again." Re-ringing charges
--   them a second time.
--
--   the till offset fails → the member is charged for drinks they just paid
--   cash for, same message, and re-ringing produces a second order AND a second
--   offset, netting one un-offset charge.
--
-- The member-facing twin got an idempotency key earlier today. This path was
-- missed, and it is the one an operator uses at a bar with a queue behind them.
--
-- One function, one transaction: either the order, its lines and its offset all
-- exist, or none of them do. Plus the same idempotency key, so a double-tap on
-- a POS screen at sea cannot ring twice.
create or replace function public.settle_galley_ticket(
  p_profile uuid,
  p_lines jsonb,
  p_tender text,
  p_idem_key text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order uuid;
  v_total integer;
  v_count integer;
  v_key   text := nullif(btrim(coalesce(p_idem_key, '')), '');
  v_staff uuid := auth.uid();
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

  select coalesce(sum(g.price_cents * l.qty), 0)::integer into v_total
  from jsonb_to_recordset(p_lines) as l("itemId" uuid, qty integer)
  join public.galley_items g on g.id = l."itemId";

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
  select v_order, l."itemId", l.qty, g.price_cents
  from jsonb_to_recordset(p_lines) as l("itemId" uuid, qty integer)
  join public.galley_items g on g.id = l."itemId";

  if p_tender = 'till' then
    insert into public.account_ledger (profile_id, delta_cents, kind, memo, created_by, idem_key)
    values (p_profile, v_total, 'payment', 'Paid at the till', v_staff,
            case when v_key is null then null else 'galley-till:' || v_key end);
  end if;

  return v_order;
end;
$function$;

revoke execute on function public.settle_galley_ticket(uuid, jsonb, text, text) from public, anon;
grant execute on function public.settle_galley_ticket(uuid, jsonb, text, text) to authenticated;
;
