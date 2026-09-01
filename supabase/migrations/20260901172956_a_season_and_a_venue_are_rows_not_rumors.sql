-- The event-type study's programming objects, first pair. A season binds a run
-- of sailings into the arc operations.md §8 describes; a venue gives Shore
-- Leave, mixers and pool socials the row they never had. Both are public
-- reading matter — the names appear on public pages — and the Bridge's to write.
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  title text not null check (btrim(title) <> ''),
  starts_on date not null,
  ends_on date not null,
  blurb text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint a_season_ends_after_it_begins check (ends_on >= starts_on)
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name text not null check (btrim(name) <> ''),
  harbor_id uuid references public.harbors(id) on delete set null,
  kind text not null default 'partner'
    check (kind in ('marina','club','restaurant','beach','pool','partner')),
  address text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.voyages
  add column season_id uuid references public.seasons(id) on delete set null,
  add column venue_id uuid references public.venues(id) on delete set null;

alter table public.seasons enable row level security;
alter table public.venues enable row level security;

create policy "a season is public reading" on public.seasons
  for select to anon, authenticated using (true);
create policy "the bridge writes the seasons" on public.seasons
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "a venue is public reading" on public.venues
  for select to anon, authenticated using (true);
create policy "the bridge writes the venues" on public.venues
  for all to authenticated using (public.is_staff()) with check (public.is_staff());;
