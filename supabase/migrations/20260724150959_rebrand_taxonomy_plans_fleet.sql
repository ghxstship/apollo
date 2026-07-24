-- ===== Phase 2: event taxonomy + itineraries =====
alter table public.voyages
  add column sub_class text check (sub_class in ('voyage','expedition','odyssey','trek','excursion','overland')),
  add column itinerary jsonb not null default '[]';

-- Backfill sub_class: SEA by duration, PRT default excursion, OVN none
update public.voyages set sub_class = case
  when class = 'sea' then
    case when ends_at is null then 'expedition'
         when ends_at - starts_at < interval '4 hours' then 'voyage'
         when ends_at - starts_at <= interval '8 hours' then 'expedition'
         else 'odyssey' end
  when class = 'shore' then 'excursion'
  else null end;

-- Itineraries for seeded voyages (time offsets in minutes from cast off)
update public.voyages set itinerary = '[
  {"offset":-30,"title":"Muster","note":"Gangway B-12. Coffee on the dock, waivers clear."},
  {"offset":0,"title":"Cast off","note":"Lines off sharp. Find your yacht on the Passbook."},
  {"offset":240,"title":"Swim stop","note":"If the water agrees. Ladder aft, buddy up."},
  {"offset":480,"title":"Golden hour run","note":"The long way back in. Galley open."},
  {"offset":660,"title":"Alongside","note":"Home port. The Open Deck hears about it."}]'
where kind = 'voyage' and itinerary = '[]';
update public.voyages set itinerary = '[
  {"offset":-15,"title":"Doors","note":"Names at the gangway. One guest per member."},
  {"offset":0,"title":"First pour","note":"The room finds its tables."},
  {"offset":120,"title":"Long tables","note":"Family style. The conversation is the program."},
  {"offset":300,"title":"The turn","note":"Records on. Terrace open."}]'
where kind = 'salon' and itinerary = '[]';

-- ===== Phase 3: membership plans (type x tier) =====
create table public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  plan_type text not null check (plan_type in ('access','regional','national','global','guest')),
  tier smallint not null check (tier between 1 and 3),
  label text not null,
  price_cents int not null,
  events_per_month int not null default 0,
  class_ceiling text check (class_ceiling in ('voyage','expedition','odyssey')),
  active boolean not null default true,
  unique (plan_type, tier)
);
alter table public.membership_plans enable row level security;
create policy "plans are public" on public.membership_plans for select using (true);
create policy "staff write plans" on public.membership_plans
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

insert into public.membership_plans (plan_type, tier, label, price_cents, events_per_month, class_ceiling) values
  ('access',   1, 'Access',                0,     0, null),
  ('regional', 1, 'Regional · Voyage',     19900, 1, 'voyage'),
  ('regional', 2, 'Regional · Expedition', 29900, 1, 'expedition'),
  ('regional', 3, 'Regional · Odyssey',    54900, 1, 'odyssey'),
  ('national', 1, 'National · Voyage',     34900, 3, 'voyage'),
  ('national', 2, 'National · Expedition', 74900, 3, 'expedition'),
  ('national', 3, 'National · Odyssey',    109900, 3, 'odyssey'),
  ('global',   1, 'Global · Voyage',       79900, 7, 'voyage'),
  ('global',   2, 'Global · Expedition',   119900, 7, 'expedition'),
  ('global',   3, 'Global · Odyssey',      149900, 7, 'odyssey'),
  ('guest',    1, 'Guest · Voyage',        14900, 1, 'voyage'),
  ('guest',    2, 'Guest · Expedition',    24900, 1, 'expedition'),
  ('guest',    3, 'Guest · Odyssey',       34900, 1, 'odyssey');

alter table public.profiles add column plan_id uuid references public.membership_plans(id);
update public.profiles p set plan_id = mp.id
from public.membership_plans mp
where mp.plan_type = p.tier::text and mp.tier = 2;

-- ===== Leagues: loyalty depth by tenure =====
create view public.member_league with (security_invoker = on) as
select id as profile_id,
  case
    when joined_at > now() - interval '6 months' then 1
    when joined_at > now() - interval '12 months' then 2
    when joined_at > now() - interval '24 months' then 3
    when joined_at > now() - interval '48 months' then 4
    else 5 end as league,
  case
    when joined_at > now() - interval '6 months' then 'First League — Harborline'
    when joined_at > now() - interval '12 months' then 'Second League — Soundings'
    when joined_at > now() - interval '24 months' then 'Third League — Blue Water'
    when joined_at > now() - interval '48 months' then 'Fourth League — Deep Water'
    else 'Fifth League — The Trench' end as league_name
from public.profiles;

-- ===== Phase 4: the fleet =====
create table public.vessels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  capacity int not null default 10,
  home_harbor uuid references public.harbors(id),
  active boolean not null default true
);
alter table public.vessels enable row level security;
create policy "members read fleet" on public.vessels for select to authenticated using (true);
create policy "staff write fleet" on public.vessels
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create table public.voyage_vessels (
  voyage_id uuid not null references public.voyages(id) on delete cascade,
  vessel_id uuid not null references public.vessels(id) on delete cascade,
  position int not null default 1,
  primary key (voyage_id, vessel_id)
);
alter table public.voyage_vessels enable row level security;
create policy "members read flotilla" on public.voyage_vessels for select to authenticated using (true);
create policy "staff write flotilla" on public.voyage_vessels
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

alter table public.rsvps add column vessel_id uuid references public.vessels(id);
create policy "staff assign berths" on public.vessels for update to authenticated using (public.is_staff());

insert into public.vessels (name, capacity, home_harbor) values
  ('Calliope', 10, (select id from public.harbors where slug='los-angeles')),
  ('Halcyon', 10, (select id from public.harbors where slug='los-angeles')),
  ('Meridian', 10, (select id from public.harbors where slug='miami')),
  ('Nightjar', 10, (select id from public.harbors where slug='miami'));

insert into public.voyage_vessels (voyage_id, vessel_id, position)
select v.id, ve.id, row_number() over (partition by v.id order by ve.name)
from public.voyages v cross join public.vessels ve
where v.class = 'sea' and v.kind = 'voyage'
  and ((v.harbor_id = ve.home_harbor) or ve.name in ('Calliope','Halcyon'))
  and v.slug in ('the-long-way-home','biscayne-crossing','night-passage-catalina','regatta-day-one','gulf-stream-run');