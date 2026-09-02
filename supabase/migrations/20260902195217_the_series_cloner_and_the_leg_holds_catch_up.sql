/* Two columns the body rewrite had no entry for, found by running the suite
   rather than by reading the list again.

   series_id was deliberately absent from that substitution list because it
   pointed at two different things: on episodes it became edition_id, and on
   seasons it became city_id. A blanket rule would have been wrong on one of
   them, so it got no rule at all — and extend_the_series, the only function
   that reads it, was left addressing a column that does not exist. It fails at
   the moment an operator raises the next run of a series.

   episode_legs.port became place in the same pass; three functions write that
   column and none were updated.

   Both are fixed here by naming the functions rather than by pattern, because
   there are three of them and a pattern is what missed them the first time. */

create or replace function public.extend_the_series(p_series uuid, p_count integer)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s record;
  t record;
  tz text;
  base timestamptz;
  next_start timestamptz;
  shift interval;
  span interval;
  occ_slug text;
  occ_id uuid;
  season uuid;
  raised integer := 0;
  i integer;
  guard integer := 0;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if p_count is null or p_count < 1 or p_count > 26 then
    raise exception 'raise between one and twenty-six episodes at a time';
  end if;

  perform pg_advisory_xact_lock(hashtext('series:' || p_series::text));

  select * into s from public.editions where id = p_series and active;
  if s.id is null then raise exception 'no such edition on the books'; end if;
  select * into t from public.episodes where id = s.template_episode_id;
  if t.id is null then raise exception 'the edition lost its template episode'; end if;

  tz := coalesce(nullif(btrim(t.time_zone), ''), 'UTC');
  span := t.ends_at - t.starts_at;

  select max(starts_at) into base from public.episodes where edition_id = s.id;
  base := coalesce(base, t.starts_at);
  -- Walk forward on the wall clock until the next date is in the future.
  while ((base at time zone tz) + make_interval(days => s.cadence_days)) at time zone tz <= now() and guard < 1000 loop
    base := ((base at time zone tz) + make_interval(days => s.cadence_days)) at time zone tz;
    guard := guard + 1;
  end loop;

  for i in 1..p_count loop
    next_start := ((base at time zone tz) + make_interval(days => s.cadence_days * i)) at time zone tz;
    shift := next_start - t.starts_at;
    occ_slug := s.slug || '-' || to_char(next_start at time zone tz, 'YYYYMMDD');
    if exists (select 1 from public.episodes where slug = occ_slug and status <> 'cancelled') then
      continue;
    end if;
    if exists (select 1 from public.episodes where slug = occ_slug) then
      occ_slug := occ_slug || '-2';
      if exists (select 1 from public.episodes where slug = occ_slug) then continue; end if;
    end if;

    select id into season from public.seasons
    where active and (next_start at time zone tz)::date between starts_on and ends_on
    order by starts_on desc limit 1;

    insert into public.episodes
      (slug, title, setting, kind, city_id, starts_at, ends_at, coordinates,
       distance_nm, passes_total, price_cents, status, blurb, description, media,
       min_tier, deposit_required, deposit_cents, muster,
       knots_multiplier, sub_class, itinerary, held_passes, time_zone, series,
       sale_opens_at, presale_hours, season_id, venue_id, edition_id)
    values
      (occ_slug, t.title, t.setting, t.kind, t.city_id, next_start,
       case when span is null then null else next_start + span end, t.coordinates,
       t.distance_nm, t.passes_total, t.price_cents, 'scheduled', t.blurb, t.description, t.media,
       t.min_tier, t.deposit_required, t.deposit_cents, t.muster,
       t.knots_multiplier, t.sub_class, t.itinerary, t.held_passes, t.time_zone, t.series,
       case when t.sale_opens_at is null then null else t.sale_opens_at + shift end,
       t.presale_hours, coalesce(season, t.season_id), t.venue_id, s.id)
    returning id into occ_id;

    insert into public.episode_segment_caps (episode_id, segment, cap)
    select occ_id, segment, cap from public.episode_segment_caps where episode_id = t.id;
    insert into public.episode_vessels (episode_id, vessel_id, position)
    select occ_id, vessel_id, position from public.episode_vessels where episode_id = t.id;
    insert into public.episode_sponsors (episode_id, sponsor_id, placement)
    select occ_id, sponsor_id, placement from public.episode_sponsors where episode_id = t.id;
    insert into public.episode_legs (episode_id, day, place, note, starts_at)
    select occ_id, day, place, note, case when starts_at is null then null else starts_at + shift end
    from public.episode_legs where episode_id = t.id;

    raised := raised + 1;
  end loop;

  return raised;
end $function$;

/* The two leg-hold functions write the same renamed column. Patched by string
   surgery because their bodies are otherwise long and untouched, and rewriting
   them by hand risks changing something the rename had nothing to do with. */
do $$
declare fn record; src text; out text; n int := 0;
begin
  for fn in
    select p.oid from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname in ('post_a_leg_hold', 'lift_a_leg_hold')
  loop
    src := pg_get_functiondef(fn.oid);
    out := regexp_replace(src, '\mport\M', 'place', 'g');
    if out is distinct from src then execute out; n := n + 1; end if;
  end loop;
  raise notice 'leg-hold functions patched: %', n;
end $$;;
