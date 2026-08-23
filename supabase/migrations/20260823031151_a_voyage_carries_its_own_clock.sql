-- The harbor knows its zone, but every departure surface had to remember to ask
-- for it — and only the charter detail page did. The manifest, /live, /home,
-- /stub, the tables page, the public charter list and the Bridge consoles kept
-- printing the server's clock, so an LA sailing read AUG 23 00:00 on one page
-- and AUG 22 21:00 on another.
alter table public.voyages
  add column if not exists time_zone text not null default 'America/New_York';

update public.voyages v
set time_zone = h.time_zone
from public.harbors h
where h.id = v.harbor_id and v.time_zone is distinct from h.time_zone;

create or replace function public.voyage_takes_harbor_clock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.harbor_id is not null then
    select h.time_zone into new.time_zone from public.harbors h where h.id = new.harbor_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.voyage_takes_harbor_clock() from public, anon, authenticated;

drop trigger if exists voyage_takes_harbor_clock on public.voyages;
create trigger voyage_takes_harbor_clock
  before insert or update of harbor_id on public.voyages
  for each row execute function public.voyage_takes_harbor_clock();

create or replace function public.harbor_clock_moves_its_voyages()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.time_zone is distinct from old.time_zone then
    update public.voyages set time_zone = new.time_zone where harbor_id = new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.harbor_clock_moves_its_voyages() from public, anon, authenticated;

drop trigger if exists harbor_clock_moves_its_voyages on public.harbors;
create trigger harbor_clock_moves_its_voyages
  after update of time_zone on public.harbors
  for each row execute function public.harbor_clock_moves_its_voyages();

comment on column public.voyages.time_zone is
  'The harbor''s IANA clock, carried on the sailing so every surface reads the same time.';
