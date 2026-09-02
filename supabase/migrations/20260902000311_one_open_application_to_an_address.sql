-- Two tabs, two submits, two applications. One open application per address;
-- the front door reads the collision and says the first one is already with
-- Shoreside.
create unique index applications_one_open_per_address
  on public.applications (lower(email)) where status in ('received','review');;
