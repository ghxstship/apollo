/* The Activity taxonomy, as rows.

   The activity kit is a poster: three categories, four tiles each, every tile
   carrying a capacity, a price-or-an-answer-instead, and a division. Apollo
   already files an event on three axes — `voyages.class` (sea/shore/sky),
   `voyages.kind` (sea_day/port_day/voyage) and `voyages.sub_class` (the
   duration ladder). None of them is the kit's axis: a private charter is Sea
   AND Premium, an [UN] Bound gathering is Port AND Premium, so Premium cannot
   be a fourth value of `class` without losing the ability to say "a Premium Sea
   format". So the format is its own vocabulary, joined to a voyage, and the
   three existing columns keep meaning exactly what they meant.

   A catalogue rather than a check constraint because the one rule the kit
   actually enforces — Port formats never require a Captain's Pass — is a
   property of the FORMAT, not of each sailing. Put `requires_vetting` on
   `voyages` and it is fourteen chances to file a beach day as vetted; put it
   here and it is one row. */
create table public.activity_formats (
  slug text primary key,
  category text not null check (category in ('sea', 'port', 'premium')),
  label text not null,
  blurb text not null,
  /* Which [UN] division hosts it. Kept as the division id rather than the
     accent token: an accent is a token reference and lives in tokens.css, and
     a hex in this column would be a second source of truth for a colour that
     the design system already owns. */
  division text not null check (division in ('hinged', 'bound', 'limited', 'scripted', 'cut')),
  /* "On request" and "Invite" are complete answers, never placeholders — the
     kit says so in as many words. So they are values on this axis, and the
     absence of a price is a statement rather than a null nobody filled in. */
  access text not null default 'open'
    check (access in ('open', 'invite', 'on_request', 'included', 'seasonal')),
  price_cents integer check (price_cents is null or price_cents >= 0),
  /* Every format states its capacity. Null only where the format has no
     headcount of its own (Shore Leave rides the sailing that fed it). */
  capacity integer check (capacity is null or capacity > 0),
  /* The one rule in the kit that changes behaviour rather than layout, and the
     reason this is a table. Consulted by rsvp_guard(). */
  requires_vetting boolean not null default true,
  /* "Every format states capacity, price, and what it does not include." The
     third of those has never had a column anywhere in this schema. */
  excludes text[] not null default '{}',
  position smallint not null default 0,
  active boolean not null default true,
  /* The kit's pricing discipline, as a constraint rather than as a paragraph:
     a format that is open to buy publishes its number, and a format that is
     not open to buy does not carry one. Without this, "Invite" and "$0" are
     the same row, and a sales surface that reads price_cents renders a
     members-only gathering as free. */
  constraint a_format_publishes_a_price_exactly_when_it_is_open_to_buy
    check ((access = 'open') = (price_cents is not null))
);

alter table public.activity_formats enable row level security;

/* Catalogue, so the open water reads it — the public activity pages are the
   whole point of writing the taxonomy down. Split in two rather than one
   `to public` policy because security_report() refuses a policy anon can reach
   that calls is_staff(): Postgres resolves EXECUTE on every referenced function
   up front, so the read would error for anon instead of returning rows. */
create policy "formats are anon-readable" on public.activity_formats
  for select to anon using (active);
create policy "cast and crew read formats" on public.activity_formats
  for select to authenticated using (active or public.is_staff());
create policy "staff keep formats" on public.activity_formats
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

/* Supabase's default privileges hand anon full DML on a new table in public.
   Every other catalogue here has had it taken back; this one joins them. */
revoke insert, update, delete on public.activity_formats from anon;

/* Which format a sailing is. Nullable, and every one of the eighteen sailings
   that exist today stays null: a backfill would have to guess, and the guard
   below reads a null format as "vetted", which is the safe way to be wrong. */
alter table public.voyages add column format text references public.activity_formats(slug);

/* The kit's twelve tiles minus the two that are not formats: VIP DAYBED is an
   add-on to a sailing (addons/rsvp_addons already model it, and operations.md
   §3 caps it at 2 groups where the membership kit says 4 — two sources against
   one), and MEMBERSHIP is a subscription, not an experience.

   Prices: operations.md is canonical on operations and prices only the five
   products in its §3; it is silent on Port formats entirely. The activity kit
   is the only source that prices a pool social or a beach day, and README §7
   says where a kit states a number, that number is drawn. So $120 and $90
   stand, and if operations ever speaks on them, operations wins. */
insert into public.activity_formats
  (slug, category, label, blurb, division, access, price_cents, capacity, requires_vetting, excludes, position)
values
  ('sandbar', 'sea', 'Sandbar social',
   'The anchor format. Seven hours, Miami to Haulover and back.',
   'hinged', 'open', 35000, 40, true,
   array['Shore Leave is optional and separately hosted', 'No cabin — this is a day boat'], 1),
  ('water_sports', 'sea', 'Water sports',
   'Tandem paddleboard heats and kayaks off the sandbar.',
   'hinged', 'included', null, 12, true,
   array['Included with a sailing pass, never sold alone'], 2),
  ('crossing', 'sea', 'Crossing',
   'Multi-day offshore passage with watches posted.',
   'limited', 'on_request', null, 12, true,
   array['Priced per charter', 'Not a weekly sailing'], 3),
  ('theme_voyage', 'sea', 'Theme voyage',
   'Masquerade and Art Basel editions of the weekly sailing.',
   'hinged', 'seasonal', null, 40, true,
   array['Dates announced per season, never standing'], 4),
  ('shore_leave', 'port', 'Shore Leave',
   'The partnered afterparty. Doors at 19:00, shuttle at 18:30.',
   'bound', 'included', null, null, false,
   array['No cover, and no pass required', 'Drinks beyond the sponsor package'], 5),
  ('pool_social', 'port', 'Pool social',
   'Hotel daybeds, an afternoon, no vessel.',
   'bound', 'open', 12000, 60, false,
   array['No boat, no sandbar', 'Cabanas are shared, never reserved'], 6),
  ('mixer', 'port', 'Mixer',
   'An [UN] Bound lifestyle evening ashore.',
   'bound', 'invite', null, 40, false,
   array['By invitation, and the list is not published'], 7),
  ('beach_day', 'port', 'Beach day',
   'A cabana takeover with no vessel and no departure.',
   'bound', 'open', 9000, 80, false,
   array['No boat', 'No open bar — the bar is a tab'], 8),
  ('private_charter', 'premium', 'Private charter',
   'The full vessel and your own manifest.',
   'limited', 'on_request', null, 40, true,
   array['Priced per charter', 'Not sold by the seat'], 9),
  ('gathering', 'premium', 'Gathering',
   'An [UN] Bound private member night.',
   'bound', 'invite', null, 40, true,
   array['By invitation', 'Never listed publicly'], 10);
;
