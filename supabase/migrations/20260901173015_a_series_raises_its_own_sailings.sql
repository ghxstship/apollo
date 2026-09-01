-- The weekly flagship is twelve hand-made rows; the study calls the series
-- object the top retention lever. A series is a template sailing plus a
-- cadence; extend_the_series clones the template forward, one real voyage per
-- occurrence, each answering to every constraint a hand-made row answers to.
create table public.voyage_series (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,48}$'),
  title text not null check (btrim(title) <> ''),
  cadence_days integer not null default 7 check (cadence_days between 1 and 92),
  template_voyage_id uuid not null references public.voyages(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.voyages
  add column series_id uuid references public.voyage_series(id) on delete set null;

alter table public.voyage_series enable row level security;
create policy "a series is public reading" on public.voyage_series
  for select to anon, authenticated using (true);
create policy "the bridge writes the series" on public.voyage_series
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Clone the template forward. Idempotent by slug: an occurrence that already
-- exists is skipped, not doubled, so the Bridge can press the button twice.
create or replace function public.extend_the_series(p_series uuid, p_count integer)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s record;
  t record;
  last_start timestamptz;
  next_start timestamptz;
  span interval;
  occ_slug text;
  raised integer := 0;
  i integer;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if p_count is null or p_count < 1 or p_count > 26 then
    raise exception 'raise between one and twenty-six sailings at a time';
  end if;

  perform pg_advisory_xact_lock(hashtext('series:' || p_series::text));

  select * into s from public.voyage_series where id = p_series and active;
  if s.id is null then raise exception 'no such series on the books'; end if;

  select * into t from public.voyages where id = s.template_voyage_id;
  if t.id is null then raise exception 'the series lost its template sailing'; end if;

  span := t.ends_at - t.starts_at;

  select max(starts_at) into last_start from public.voyages
  where series_id = s.id;
  last_start := coalesce(last_start, t.starts_at);

  for i in 1..p_count loop
    next_start := last_start + make_interval(days => s.cadence_days * i);
    occ_slug := s.slug || '-' || to_char(next_start at time zone coalesce(nullif(btrim(t.time_zone), ''), 'UTC'), 'YYYYMMDD');
    if exists (select 1 from public.voyages where slug = occ_slug) then
      continue;
    end if;
    insert into public.voyages
      (slug, title, class, kind, harbor_id, starts_at, ends_at, coordinates,
       distance_nm, berths_total, price_cents, status, blurb, description, media,
       min_tier, deposit_required, deposit_cents, muster, conditions,
       fathoms_multiplier, sub_class, itinerary, held_passes, time_zone, format,
       presale_hours, season_id, venue_id, series_id)
    values
      (occ_slug, t.title, t.class, t.kind, t.harbor_id, next_start,
       case when span is null then null else next_start + span end, t.coordinates,
       t.distance_nm, t.berths_total, t.price_cents, 'scheduled', t.blurb, t.description, t.media,
       t.min_tier, t.deposit_required, t.deposit_cents, t.muster, t.conditions,
       t.fathoms_multiplier, t.sub_class, t.itinerary, 0, t.time_zone, t.format,
       t.presale_hours, t.season_id, t.venue_id, s.id);
    raised := raised + 1;
  end loop;

  return raised;
end $$;

revoke execute on function public.extend_the_series(uuid, integer) from public, anon;;
