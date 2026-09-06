-- Decision 3. Five demonstration orders carry a charge and no contents.
--
-- They were seeded on 24 July, before place_shop_order existed to write lines,
-- and the charge trigger fired on each. So five fixture members hold a real
-- ledger charge against an order whose contents are missing, and any demo that
-- opens one shows a receipt with a total and nothing above it.
--
-- The ledger is not touched. It was made append-only on the principle that a
-- correction is another line and never an edit, and these would be the first
-- exception to a rule one day old. Exceptions to append-only rules are how a
-- ledger stops being worth trusting. Not one figure moves here.
--
-- What is written is the contents, and only where the arithmetic leaves no
-- choice about what they were. Each total matches the catalogue exactly:
--
--   14500  Watch-keeper wool jumper
--    4200  Deck tee, bone
--   22000  Deck shell jacket
--     700  Cold one, deck-safe
--    1900  Cold one, deck-safe + Salt-rim paloma  (the only pair that sums to it;
--          no single item is 1900, and 400+1500 has no second item)
--
-- Guarded three ways: the order is named by id, it must still have no lines,
-- and its total must still be what it was when this was written. If any of
-- those has moved the row is skipped rather than guessed at, because a
-- demonstration receipt is worth repairing and is not worth inventing.
do $backfill$
declare n int := 0;
begin
  -- shop: one line each, at the price the order was charged
  insert into public.shop_order_items (order_id, product_id, qty, price_cents)
  select o.id, p.id, 1, p.price_cents
    from public.shop_orders o
    join public.products p on p.price_cents = o.total_cents
   where o.id in (
           'cc1b8e19-e618-42c2-8e0d-698c1ecdd03d',
           '0e06f800-cc5e-4129-85ed-4ee9744ff72d',
           '10c467d7-e80f-41fe-9de9-eb9841ff698b')
     and not exists (select 1 from public.shop_order_items i where i.order_id = o.id);
  get diagnostics n = row_count;
  raise notice 'shop lines written: %', n;

  -- galley: the single-item ticket
  insert into public.galley_order_items (order_id, item_id, qty, price_cents)
  select o.id, g.id, 1, g.price_cents
    from public.galley_orders o
    join public.galley_items g on g.price_cents = o.total_cents
   where o.id = '8e065071-d994-4ac3-8115-bac71cb67191'
     and not exists (select 1 from public.galley_order_items i where i.order_id = o.id);

  -- galley: the pair
  insert into public.galley_order_items (order_id, item_id, qty, price_cents)
  select o.id, g.id, 1, g.price_cents
    from public.galley_orders o
    join public.galley_items g on g.price_cents in (700, 1200)
   where o.id = 'fed3cc3e-9917-4957-b9b3-b87f979a8be5'
     and o.total_cents = 1900
     and not exists (select 1 from public.galley_order_items i where i.order_id = o.id);
end $backfill$;
