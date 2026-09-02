/* The five strands of the 2026-27 Miami programme, from the owner's Master
   Playbook. The playbook calls them categories; we call them series.

   Renamed onto one nautical vocabulary so they read as a set rather than five
   moods, and so each name says what the strand actually does:

     Anchor Experience  -> anchor         the flagship that holds the season
     Adventure          -> off_soundings  water too deep to sound: past charted
                                          ground, which is our Exotic class
                                          said in the club's own words
     Arts & Culture     -> night_watch    the late shift on a ship
     Fitness & Wellness -> even_keel      what keeps a hull upright
     Entertainment      -> showboat       the floating theatre

   access is 'seasonal', not 'bookable', and that is a deliberate refusal
   rather than an oversight. The schema holds a good invariant — a bookable
   series publishes a price — and the playbook carries no per-series pricing
   except the anchor model. Inventing three or four price points to satisfy a
   CHECK would put invented numbers in front of members. Seasonal says what is
   true: the series runs on the season's calendar and the price is set on the
   episode. It also still lists publicly, where invite and on_request do not.

   category is null for four of the five, which the CHECK permits and which the
   programme requires: Adventure is an airboat one month and a polo field the
   next, and Fitness is a rooftop in March and a hydrofoil in August. Anchor
   keeps 'sea' because a yacht charter is never ashore. */

insert into public.series
  (slug, category, label, blurb, division, access, price_cents, requires_vetting, position, active, experience_class)
values
  ('anchor', 'sea', 'Anchor',
   'The flagship. A yacht, a sandbar, and the whole club in one place.',
   'limited', 'seasonal', null, true, 1, true, 'premium'),
  ('off_soundings', null, 'Off Soundings',
   'Past charted ground. Everything that means leaving the city to get there.',
   'hinged', 'seasonal', null, true, 2, true, 'club'),
  ('night_watch', null, 'Night Watch',
   'The late shift. Museums after hours, opera by candle, scent built by hand.',
   'hinged', 'seasonal', null, true, 3, true, 'club'),
  ('even_keel', null, 'Even Keel',
   'What keeps you upright. Breath, cold water, movement, and the hour after.',
   'hinged', 'seasonal', null, true, 4, true, 'club'),
  ('showboat', null, 'Showboat',
   'The floating theatre. Cabaret, cinema, comedy, and one masquerade.',
   'hinged', 'seasonal', null, true, 5, true, 'club')
on conflict (slug) do update set
  label = excluded.label, blurb = excluded.blurb, category = excluded.category,
  division = excluded.division, access = excluded.access,
  price_cents = excluded.price_cents, position = excluded.position, active = true,
  experience_class = excluded.experience_class;

/* The seed catalogue steps back rather than out. Those rows were written before
   there was a programme; nothing references them, and deactivating is
   reversible in a way that deleting is not. private_charter survives because it
   is a real product with its own door. */
update public.series set active = false
 where slug not in ('anchor','off_soundings','night_watch','even_keel','showboat','private_charter');

/* The season belongs to the CITY. Miami's first year is Season I; Chicago will
   have its own Season I in 2027 and both will be true at once. */
insert into public.seasons (slug, title, starts_on, ends_on, blurb, active, city_id)
select 's1-miami', 'Season I', date '2026-09-04', date '2027-08-29',
       'Fifty-two weeks in Miami. Five series, one city, one year.',
       true, c.id
from public.cities c where c.slug = 'miami'
on conflict (slug) do update set
  title = excluded.title, starts_on = excluded.starts_on, ends_on = excluded.ends_on,
  blurb = excluded.blurb, city_id = excluded.city_id, active = true;

/* One edition per series, in Miami — the Love Island model, where a series in a
   city is its own run with its own cadence. Cadence is the observed spacing in
   the playbook, not a target: Anchor lands monthly, the rest roughly so. */
insert into public.editions (slug, title, cadence_days, active, series, city_id)
select e.slug, e.title, e.cadence, true, e.series, c.id
from (values
  ('anchor-miami',        'Anchor Miami',        30, 'anchor'),
  ('off-soundings-miami', 'Off Soundings Miami', 40, 'off_soundings'),
  ('night-watch-miami',   'Night Watch Miami',   33, 'night_watch'),
  ('even-keel-miami',     'Even Keel Miami',     33, 'even_keel'),
  ('showboat-miami',      'Showboat Miami',      45, 'showboat')
) as e(slug, title, cadence, series)
cross join public.cities c
where c.slug = 'miami'
on conflict (slug) do update set
  title = excluded.title, cadence_days = excluded.cadence_days,
  series = excluded.series, city_id = excluded.city_id, active = true;;
