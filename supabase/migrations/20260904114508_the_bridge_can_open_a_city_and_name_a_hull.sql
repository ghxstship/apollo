-- cities had one policy, public select, and authenticated held only SELECT.
-- Opening Los Angeles, or fixing a time zone, was a hand-written migration
-- against production on the table with the most downstream dependencies —
-- episodes, ratio caps, per-hull fill, and now tax. vessels already let staff
-- write; nothing in the application did.
--
-- Staff keep the roster. The public read stays as it is. Status is bound to
-- the three words the site already renders — open, waitlist, soon — plus
-- closed, so a typo cannot invent a fourth state the home page has no badge
-- for.

grant insert, update on public.cities to authenticated;

drop policy if exists "staff keep the cities" on public.cities;
create policy "staff keep the cities" on public.cities
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

alter table public.cities drop constraint if exists cities_status_check;
alter table public.cities
  add constraint cities_status_check check (status in ('open','waitlist','soon','closed'));

-- A hull's capacity is read in six places and was written in none.
alter table public.vessels
  add constraint vessels_capacity_check check (capacity >= 0);;
