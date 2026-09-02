/* Two things the production listing showed that the season migration did not
   reach, because both sit outside Season I.

   ONE: a test fixture was on the public board. The e2e suite raises episodes
   and sweeps them when the NEXT run starts, so anything a test forgot to strike
   sat on the live listing in the meantime — in this case one titled "E2E
   fixture episode.", visible to anyone reading /episodes. The suite is fixed to
   clean up after itself; this removes the one already out there and any sibling
   a previous run left. Passes and ledger rows go with them, or the delete is
   refused by the foreign keys and says so.

   TWO: chicago-founding-night still had no price, so it rendered COMPLIMENTARY
   — the exact defect the season pricing was written to end, surviving because
   that migration scoped itself to slugs beginning s1-w. It is a shore
   expedition, so it takes the expedition price. The two other legacy episodes
   carried $145 and $265, which are off the grid; they move onto it, because a
   published price list with two numbers that are not on it is not a price
   list. A non-Anchor odyssey has no line of its own, so the Gulf Stream run
   takes the Anchor price it is closest to in shape: afloat, all day, at scale. */

do $$
declare n int;
begin
  delete from public.passes
   where episode_id in (select id from public.episodes where slug like 'e2e-%');
  delete from public.account_ledger
   where episode_id in (select id from public.episodes where slug like 'e2e-%');
  delete from public.episodes where slug like 'e2e-%';
  get diagnostics n = row_count;
  raise notice 'test fixtures struck from the board: %', n;
end $$;

do $$
declare n int;
begin
  update public.episodes set price_cents = 16500
   where slug = 'chicago-founding-night' and coalesce(price_cents, 0) = 0;
  get diagnostics n = row_count;
  raise notice 'chicago-founding-night priced: %', n;

  update public.episodes set price_cents = 16500
   where slug = 'regatta-day-one' and price_cents = 14500;

  update public.episodes set price_cents = 25000
   where slug = 'gulf-stream-run' and price_cents = 26500;
end $$;

/* Nothing anywhere on the board may read as free, and every price on it must
   be one the club actually publishes. A number off the grid is a number
   nobody can explain. */
do $$
declare offenders text;
begin
  select string_agg(slug || ' ($' || (coalesce(price_cents,0)/100) || ')', ', ')
    into offenders
  from public.episodes
  where status in ('scheduled', 'live', 'weather_hold')
    and starts_at > now()
    and coalesce(price_cents, 0) not in (8500, 16500, 25000, 27500, 85000);
  if offenders is not null then
    raise exception 'on the board at a price that is not on the list: %', offenders;
  end if;
end $$;;
