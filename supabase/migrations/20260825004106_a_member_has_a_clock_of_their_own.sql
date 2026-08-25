-- There is a harbour clock and a voyage clock. There has never been a MEMBER
-- clock — profiles carries no time_zone — so every personal timestamp in the
-- product (a statement line, a signature date, a renewal, a match, a message)
-- is rendered in whatever zone the machine doing the rendering happens to be
-- in. On a UTC production host that is nobody's clock at all.
--
-- Measured on live data: 270 of 1,378 account_ledger rows — 19.6% — fall on a
-- different calendar day in UTC than in Eastern or Pacific. Roughly one line in
-- five of a member's own statement is dated to the wrong day on their own
-- clock, and always the day AFTER, since every harbour this club sails from is
-- behind UTC. A member reading their account cannot reconcile it against their
-- own memory of the week.
--
-- A member belongs to a home harbour, and that harbour has a zone. That is the
-- honest default, and it is overridable because people travel and move.
alter table public.profiles
  add column if not exists time_zone text;

comment on column public.profiles.time_zone is
  'The clock this member reads their own account on. Defaults from their home harbour; personal timestamps render here rather than in whatever zone the render host happens to sit in.';

-- Backfill from the harbour they already told us about.
update public.profiles p
set time_zone = h.time_zone
from public.harbors h
where p.home_harbor = h.id and p.time_zone is null;

-- Keep it following the harbour unless the member has set it themselves.
create or replace function public.profile_takes_harbor_clock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.home_harbor is not null
     and (tg_op = 'INSERT' or new.home_harbor is distinct from old.home_harbor)
     and (new.time_zone is null or new.time_zone = (
        select h.time_zone from public.harbors h where h.id = old.home_harbor))
  then
    select h.time_zone into new.time_zone from public.harbors h where h.id = new.home_harbor;
  end if;
  return new;
end $$;

drop trigger if exists profile_clock_follows_harbor on public.profiles;
create trigger profile_clock_follows_harbor
  before insert or update of home_harbor on public.profiles
  for each row execute function public.profile_takes_harbor_clock();
;
