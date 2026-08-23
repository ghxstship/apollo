-- shop_order_items and galley_order_items both CHECK qty <= 12, but the pricing
-- RPCs accepted 1..20 and the steppers offered 20 — so a member could click to
-- thirteen and be shown a constraint name.
do $$
declare src text; newsrc text;
begin
  for src in
    select pg_get_functiondef(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('place_shop_order', 'place_galley_order')
  loop
    newsrc := replace(src, 'qty between 1 and 20', 'qty between 1 and 12');
    if newsrc <> src then execute newsrc; end if;
  end loop;
end $$;
