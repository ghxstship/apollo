-- Demo history: Season I (Feb–Jun 2026), plus closing out the sailings that had
-- already happened but were still sitting "scheduled".
--
-- The Passage Log, Orders and contests are all derived from completed sailings,
-- so without a past there is nothing to show and nothing to test. This seeds one
-- real season with distances, rosters and hull assignments, chosen so that the
-- nine Orders confer at genuinely different depths across the demo members —
-- Mara has the whole fleet, Ines has her first watch and little else.
--
-- Safe to re-run: every insert is keyed and conflicts do nothing.

-- ===== Close out sailings that already happened ===============================
-- A Port Day from 25 July should not still read "live" in the middle of August.
update public.voyages
set status = 'completed'
where starts_at < now()
  and status in ('scheduled', 'live');

-- ===== Season I ===============================================================
-- Note on class: every demo member is on an Expedition plan, and the metering
-- trigger enforces class_ceiling, so Season I sails at Expedition. Seeding it as
-- Odyssey would mean disabling a correct entitlement rule to force in data that
-- could never have been sold.

with h as (
  select slug, id from public.harbors
)
insert into public.voyages
  (slug, title, class, kind, sub_class, harbor_id, starts_at, ends_at,
   distance_nm, berths_total, price_cents, status, media, min_tier, blurb, itinerary)
values
  ('season-i-winter-crossing', 'The winter crossing.', 'sea', 'sea_day', 'expedition',
   (select id from h where slug = 'miami'),
   '2026-02-14 09:00+00', '2026-02-14 16:00+00', 32, 20, 18500, 'completed', 'dawn', 'regional',
   'Biscayne to Elliott Key and back, into a northerly.', '[]'),
  ('season-i-port-night-i', 'Port night, the first.', 'shore', 'port_day', 'expedition',
   (select id from h where slug = 'miami'),
   '2026-02-28 19:00+00', '2026-02-28 23:00+00', null, 48, 7500, 'completed', 'dusk', 'regional',
   'Long tables, short speeches.', '[]'),
  ('season-i-key-run', 'The key run.', 'sea', 'sea_day', 'expedition',
   (select id from h where slug = 'miami'),
   '2026-03-14 08:00+00', '2026-03-14 14:00+00', 28, 16, 17500, 'completed', 'day', 'regional',
   'South with the tide, back on the sea breeze.', '[]'),
  ('season-i-harbor-tables', 'Harbor tables.', 'shore', 'port_day', 'expedition',
   (select id from h where slug = 'los-angeles'),
   '2026-03-28 19:00+00', '2026-03-28 23:30+00', null, 60, 9500, 'completed', 'dusk', 'regional',
   'The slip end of the marina, cleared for one night.', '[]'),
  ('season-i-channel-islands', 'The Channel Islands.', 'sea', 'sea_day', 'expedition',
   (select id from h where slug = 'los-angeles'),
   '2026-04-11 07:00+00', '2026-04-11 17:00+00', 44, 20, 32000, 'completed', 'dawn', 'national',
   'Anacapa and back — the long one, and everyone knew it.', '[]'),
  ('season-i-spring-ashore', 'Spring ashore.', 'shore', 'port_day', 'expedition',
   (select id from h where slug = 'los-angeles'),
   '2026-04-25 18:00+00', '2026-04-25 22:00+00', null, 40, 0, 'completed', 'day', 'regional',
   'No charge, no agenda.', '[]'),
  ('season-i-night-passage', 'The night passage.', 'sea', 'sea_day', 'expedition',
   (select id from h where slug = 'los-angeles'),
   '2026-05-16 20:00+00', '2026-05-17 05:00+00', 36, 16, 26500, 'completed', 'dusk', 'national',
   'Off the dock at dusk, into Avalon before the sun.', '[]'),
  ('season-i-solstice-run', 'The solstice run.', 'sea', 'sea_day', 'expedition',
   (select id from h where slug = 'miami'),
   '2026-06-20 08:00+00', '2026-06-20 14:00+00', 24, 24, 14500, 'completed', 'day', 'regional',
   'The longest day, used properly.', '[]')
on conflict (slug) do nothing;

-- ===== Flotilla assignments ===================================================

insert into public.voyage_vessels (voyage_id, vessel_id, position)
select v.id, ve.id, t.position
from (values
  ('season-i-winter-crossing', 'Meridian', 1),
  ('season-i-winter-crossing', 'Nightjar', 2),
  ('season-i-key-run',         'Meridian', 1),
  ('season-i-channel-islands', 'Calliope', 1),
  ('season-i-channel-islands', 'Halcyon',  2),
  ('season-i-night-passage',   'Halcyon',  1),
  ('season-i-solstice-run',    'Nightjar', 1)
) as t(slug, vessel, position)
join public.voyages v on v.slug = t.slug
join public.vessels ve on ve.name = t.vessel
on conflict do nothing;

-- ===== Who sailed what, and on which hull =====================================
-- The hull matters: "The Whole Fleet" counts distinct rsvps.vessel_id, so only a
-- member who actually sailed all four earns it.

insert into public.rsvps (voyage_id, profile_id, status, vessel_id, show_on_manifest, checked_in_at)
select v.id, p.id, 'aboard',
       (select id from public.vessels where name = t.vessel),
       true, v.starts_at
from (values
  -- Mara sails everything, and touches all four hulls.
  ('mara@demo.lyre.social',    'season-i-winter-crossing', 'Meridian'),
  ('mara@demo.lyre.social',    'season-i-port-night-i',    null),
  ('mara@demo.lyre.social',    'season-i-key-run',         'Meridian'),
  ('mara@demo.lyre.social',    'season-i-harbor-tables',   null),
  ('mara@demo.lyre.social',    'season-i-channel-islands', 'Calliope'),
  ('mara@demo.lyre.social',    'season-i-spring-ashore',   null),
  ('mara@demo.lyre.social',    'season-i-night-passage',   'Halcyon'),
  ('mara@demo.lyre.social',    'season-i-solstice-run',    'Nightjar'),
  -- Theo skippers most of it but misses the Channel Islands — three hulls.
  ('skipper@lyre.social',      'season-i-winter-crossing', 'Nightjar'),
  ('skipper@lyre.social',      'season-i-key-run',         'Meridian'),
  ('skipper@lyre.social',      'season-i-night-passage',   'Halcyon'),
  ('skipper@lyre.social',      'season-i-solstice-run',    'Nightjar'),
  -- Priya: the miles, not the fleet.
  ('priya@demo.lyre.social',   'season-i-winter-crossing', 'Nightjar'),
  ('priya@demo.lyre.social',   'season-i-key-run',         'Meridian'),
  ('priya@demo.lyre.social',   'season-i-channel-islands', 'Calliope'),
  ('priya@demo.lyre.social',   'season-i-spring-ashore',   null),
  -- Deshawn: the long one and the solstice.
  ('deshawn@demo.lyre.social', 'season-i-port-night-i',    null),
  ('deshawn@demo.lyre.social', 'season-i-harbor-tables',   null),
  ('deshawn@demo.lyre.social', 'season-i-channel-islands', 'Halcyon'),
  ('deshawn@demo.lyre.social', 'season-i-solstice-run',    'Nightjar'),
  -- Suki: both coasts, and the night run.
  ('suki@demo.lyre.social',    'season-i-winter-crossing', 'Meridian'),
  ('suki@demo.lyre.social',    'season-i-harbor-tables',   null),
  ('suki@demo.lyre.social',    'season-i-night-passage',   'Halcyon'),
  -- Jonah: ashore mostly, one sail.
  ('jonah@demo.lyre.social',   'season-i-port-night-i',    null),
  ('jonah@demo.lyre.social',   'season-i-key-run',         'Meridian'),
  ('jonah@demo.lyre.social',   'season-i-spring-ashore',   null),
  -- Ines joined late: a first watch and one more.
  ('ines@demo.lyre.social',    'season-i-spring-ashore',   null),
  ('ines@demo.lyre.social',    'season-i-solstice-run',    'Nightjar')
) as t(email, slug, vessel)
join public.profiles p on p.email = t.email
join public.voyages v on v.slug = t.slug
on conflict (voyage_id, profile_id) do nothing;

-- Assign hulls on the sailings that already existed, so the current season's
-- rosters count toward the fleet too.
update public.rsvps r
set vessel_id = pick.vessel_id
from (
  select r2.id as rsvp_id,
         (array_agg(vv.vessel_id order by vv.position))[
           1 + (abs(('x' || substr(md5(r2.id::text), 1, 8))::bit(32)::int)
                % greatest(count(*), 1)::int)
         ] as vessel_id
  from public.rsvps r2
  join public.voyages v on v.id = r2.voyage_id
  join public.voyage_vessels vv on vv.voyage_id = v.id
  where r2.status = 'aboard' and r2.vessel_id is null and v.class = 'sea'
  group by r2.id
) pick
where r.id = pick.rsvp_id;


-- ===== Confer what the season earned =========================================
-- The completion trigger only fires on a status change, and these rows were
-- inserted already-completed, so conferral is run explicitly here.
do $$
declare m uuid;
begin
  for m in
    select distinct r.profile_id
    from public.rsvps r join public.voyages v on v.id = r.voyage_id
    where r.status = 'aboard' and v.status = 'completed'
  loop
    perform public.confer_marks(m);
  end loop;
end;
$$;
