-- ---- handle_voyage_status ----------------------------------------------------
-- Cancelled: the installment plans stop (they kept drawing after the "full
-- credit"); the credit is owed to everyone the ledger says was charged, not
-- only to those still aboard; a verified phone hears it (the hold texted them,
-- the cancellation did not). Completed: a deposit is returned once at most
-- (book, release 48h+, rebook left two deposit rows and both came back); the
-- knots for water under the keel go to those who were under it — when the
-- gangway was worked and a member never crossed it, the deposit forfeits and
-- the miles are not theirs either. Every Word carries its sailing.
create or replace function public.handle_voyage_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  award int;
  net int;
  dep int;
  gangway_worked boolean;
begin
  if new.status = 'weather_hold' and old.status <> 'weather_hold' then
    for r in select rv.profile_id, p.email, p.full_name, p.phone, p.phone_verified, p.notification_prefs
             from public.rsvps rv join public.profiles p on p.id = rv.profile_id
             where rv.voyage_id = new.id and rv.status in ('aboard','waitlist') loop
      if coalesce((r.notification_prefs->>'weather')::boolean, true) then
        insert into public.notifications (profile_id, kind, title, body, voyage_id)
        values (r.profile_id, 'weather', 'Weather hold: ' || new.title,
                'Held for weather. Your pass is safe and nothing more is charged until we sail. We call it by 18:00 the night before.', new.id);
        if r.email is not null then
          insert into public.email_outbox (to_email, template, payload)
          values (r.email, 'weather-hold', jsonb_build_object('name', r.full_name, 'voyage', new.title, 'starts_at', new.starts_at));
        end if;
      end if;
      if r.phone is not null and r.phone_verified then
        insert into public.sms_outbox (to_phone, template, payload)
        values (r.phone, 'weather-hold',
                jsonb_build_object('title', 'Weather hold: ' || new.title,
                                   'body', 'Held for weather. We call it by 18:00 the night before.',
                                   'voyage', new.title, 'sailing', new.title));
      end if;
    end loop;

  elsif old.status = 'weather_hold' and new.status = 'scheduled' then
    for r in select rv.profile_id, p.notification_prefs, p.phone, p.phone_verified
             from public.rsvps rv join public.profiles p on p.id = rv.profile_id
             where rv.voyage_id = new.id and rv.status in ('aboard','waitlist') loop
      if coalesce((r.notification_prefs->>'weather')::boolean, true) then
        insert into public.notifications (profile_id, kind, title, body, voyage_id)
        values (r.profile_id, 'weather', 'Hold lifted: ' || new.title, 'The window opened. We sail as planned.', new.id);
      end if;
      if r.phone is not null and r.phone_verified then
        insert into public.sms_outbox (to_phone, template, payload)
        values (r.phone, 'weather-hold',
                jsonb_build_object('title', 'Hold lifted: ' || new.title,
                                   'body', 'The window opened. We sail as planned.',
                                   'voyage', new.title, 'sailing', new.title));
      end if;
    end loop;

  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    -- The draws stop first, so no slice lands after the credit.
    update public.installment_plans ip
       set status = 'cancelled', next_charge_at = null
      from public.rsvps rv
     where rv.id = ip.rsvp_id and rv.voyage_id = new.id and ip.status = 'active';

    -- Everyone the ledger says was charged on this sailing, whether or not a
    -- pass still stands for them.
    for r in select p.id as profile_id, p.email, p.full_name, p.phone, p.phone_verified, p.notification_prefs,
                    coalesce(-sum(l.delta_cents), 0) as owed
             from public.account_ledger l join public.profiles p on p.id = l.profile_id
             where l.voyage_id = new.id
             group by p.id, p.email, p.full_name, p.phone, p.phone_verified, p.notification_prefs
             having coalesce(-sum(l.delta_cents), 0) > 0 loop
      insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id)
      values (r.profile_id, r.owed, 'credit', 'Cancelled — full credit: ' || new.title, new.id);
    end loop;

    -- The word goes to everyone holding or queued for a pass.
    for r in select rv.profile_id, p.email, p.full_name, p.phone, p.phone_verified, p.notification_prefs
             from public.rsvps rv join public.profiles p on p.id = rv.profile_id
             where rv.voyage_id = new.id and rv.status in ('aboard','waitlist') loop
      insert into public.notifications (profile_id, kind, title, body, voyage_id)
      values (r.profile_id, 'manifest', 'Cancelled: ' || new.title,
              'The club called it. Your account is credited in full — no games, no forms.', new.id);
      -- Only for the member the berths switch would silence: fan_out already
      -- pushes the manifest notice to everyone whose switch is on.
      if not coalesce((r.notification_prefs->>'berths')::boolean, true) then
        insert into public.push_outbox (profile_id, title, body, url)
        values (r.profile_id, 'Cancelled: ' || new.title, 'Your account is credited in full.', '/manifest');
      end if;
      if r.email is not null then
        insert into public.email_outbox (to_email, template, payload)
        values (r.email, 'voyage-cancelled', jsonb_build_object('name', r.full_name, 'voyage', new.title));
      end if;
      if r.phone is not null and r.phone_verified then
        insert into public.sms_outbox (to_phone, template, payload)
        values (r.phone, 'weather-hold',
                jsonb_build_object('title', 'Cancelled: ' || new.title,
                                   'body', 'The club called it. Your account is credited in full.',
                                   'voyage', new.title, 'sailing', new.title));
      end if;
    end loop;

  elsif new.status = 'completed' and old.status <> 'completed' then
    select exists (select 1 from public.rsvps x where x.voyage_id = new.id and x.checked_in_at is not null)
      into gangway_worked;

    for r in select rv.profile_id, rv.checked_in_at, p.notification_prefs
             from public.rsvps rv join public.profiles p on p.id = rv.profile_id
             where rv.voyage_id = new.id and rv.status = 'aboard' loop
      award := case when new.distance_nm is not null and new.distance_nm > 0
                    then round(new.distance_nm * public.club_setting('knots_per_nm') * new.fathoms_multiplier)::int
                    else round(public.club_setting('knots_port_day') * new.fathoms_multiplier)::int end;
      -- Miles are banked by those who were aboard. When the gangway was worked
      -- and this member never crossed it, the miles are not theirs.
      if award > 0 and not (gangway_worked and r.checked_in_at is null)
         and not exists (select 1 from public.fathoms_ledger
            where profile_id = r.profile_id and voyage_id = new.id and reason like 'Miles banked%') then
        insert into public.fathoms_ledger (profile_id, delta, reason, voyage_id)
        values (r.profile_id, award,
                case when new.distance_nm is not null and new.distance_nm > 0
                     then 'Miles banked — ' || new.distance_nm || ' NM'
                     else 'Miles banked — a day in port' end, new.id);
        if coalesce((r.notification_prefs->>'fathoms')::boolean, true) then
          insert into public.notifications (profile_id, kind, title, body, voyage_id)
          values (r.profile_id, 'fathoms', award || ' knots banked.',
                  'From ' || new.title || ' — the ledger rewards water under the keel.', new.id);
        end if;
      end if;

      -- The deposit promise, kept once: back aboard, or forfeited by absence.
      select coalesce(-sum(delta_cents), 0) into dep
      from public.account_ledger
      where profile_id = r.profile_id and voyage_id = new.id and kind = 'deposit';
      dep := least(dep, new.deposit_cents);
      if dep > 0 and not exists (select 1 from public.account_ledger
            where profile_id = r.profile_id and voyage_id = new.id
              and kind = 'credit' and memo like 'Deposit returned aboard%') then
        if r.checked_in_at is not null or not gangway_worked then
          insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id)
          values (r.profile_id, dep, 'credit', 'Deposit returned aboard — ' || new.title, new.id);
          insert into public.notifications (profile_id, kind, title, body, voyage_id)
          values (r.profile_id, 'manifest', 'Deposit returned.',
                  'You came aboard ' || new.title || ' — the deposit is back on your account.', new.id);
        else
          insert into public.notifications (profile_id, kind, title, body, voyage_id)
          values (r.profile_id, 'manifest', 'Deposit forfeited — no show.',
                  'The gangway never saw you for ' || new.title || '. The deposit stays with the club, as the pass said it would.', new.id);
        end if;
      end if;
    end loop;
  end if;
  return new;
end $$;

-- ---- close_out_a_cancelled_sailing: reasons once, and every hold released ----
create or replace function public.close_out_a_cancelled_sailing()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    insert into public.fathoms_ledger (profile_id, delta, reason, voyage_id)
    select f.profile_id, -sum(f.delta), 'Sailing cancelled', new.id
    from public.fathoms_ledger f
    where f.voyage_id = new.id
      and f.reason = any (public.knots_booking_reasons())
    group by f.profile_id
    having sum(f.delta) > 0;

    delete from public.table_seats ts
    using public.dating_tables dt
    where dt.id = ts.table_id and dt.voyage_id = new.id;

    -- Cabin options and the numbered line are released with the sailing.
    update public.charter_options
       set released_at = now()
     where voyage_id = new.id and released_at is null and confirmed_at is null;
    update public.waitlist_entries
       set released_at = now()
     where voyage_id = new.id and released_at is null and claimed_at is null;
  end if;
  return new;
end $$;

-- ---- the hull ceiling and head weights, from their tables --------------------
create or replace function public.the_hull_holds_forty()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare heads int; ceiling int := public.club_setting('hull_ceiling_heads');
begin
  select coalesce(sum(cap * public.segment_heads(segment)), 0)
    into heads
  from public.voyage_segment_caps
  where voyage_id = new.voyage_id;
  if heads > ceiling then
    raise exception 'the hull holds % — this composition seats % heads', ceiling, heads;
  end if;
  return new;
end $$;

-- ---- inside the credit window, a sailing is cancelled, never struck ---------
-- A DELETE cascades the passes through handle_rsvp_release, which credits only
-- outside the window; every charge inside it would be forfeit with no word.
create or replace function public.a_sailing_inside_the_window_is_cancelled_not_struck()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if old.status in ('scheduled','live','weather_hold')
     and old.starts_at - now() <= make_interval(hours => public.club_setting('release_credit_hours'))
     and exists (select 1 from public.rsvps r where r.voyage_id = old.id and r.status = 'aboard') then
    raise exception 'inside the credit window a sailing is cancelled, not struck — cancel it and the folios square themselves';
  end if;
  return old;
end $$;
revoke execute on function public.a_sailing_inside_the_window_is_cancelled_not_struck() from public, anon, authenticated;
create trigger a_sailing_inside_the_window_is_cancelled_not_struck
  before delete on public.voyages
  for each row execute function public.a_sailing_inside_the_window_is_cancelled_not_struck();

-- ---- a sailing honours its format --------------------------------------------
create or replace function public.a_sailing_honours_its_format()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare f record;
begin
  if new.format is null then return new; end if;
  select access, capacity, label into f from public.activity_formats where slug = new.format;
  if f.access = 'included' and coalesce(new.price_cents, 0) > 0 then
    raise exception '% is included with a pass and never sold alone — its price is nothing', f.label;
  end if;
  if f.capacity is not null and new.berths_total > f.capacity then
    raise exception 'a % seats % — this hull is set to %', f.label, f.capacity, new.berths_total;
  end if;
  return new;
end $$;
revoke execute on function public.a_sailing_honours_its_format() from public, anon, authenticated;
create trigger a_sailing_honours_its_format
  before insert or update of format, price_cents, berths_total on public.voyages
  for each row execute function public.a_sailing_honours_its_format();

-- ---- a hull with claimed cabins stays on the sailing -------------------------
create or replace function public.a_hull_with_claimed_cabins_stays()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if exists (
    select 1 from public.rsvps r join public.cabins c on c.id = r.cabin_id
    where r.voyage_id = old.voyage_id and r.status = 'aboard' and c.vessel_id = old.vessel_id
  ) then
    raise exception 'members hold cabins on that hull — move them first, then take the hull off the sailing';
  end if;
  return old;
end $$;
revoke execute on function public.a_hull_with_claimed_cabins_stays() from public, anon, authenticated;
create trigger a_hull_with_claimed_cabins_stays
  before delete on public.voyage_vessels
  for each row execute function public.a_hull_with_claimed_cabins_stays();

-- ---- extend_the_series: the occurrence is the whole sailing -----------------
-- Steps on the harbour's wall clock (a UTC step drifted an hour across DST);
-- starts from the first future date rather than raising ghosts behind a stale
-- template; copies the composition, the hulls, the legs, the sponsors and the
-- drop (shifted with the date); binds the season by the date; leaves last
-- week's weather behind; and a cancelled week's slug steps aside for a fresh row.
create or replace function public.extend_the_series(p_series uuid, p_count integer)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
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
    raise exception 'raise between one and twenty-six sailings at a time';
  end if;

  perform pg_advisory_xact_lock(hashtext('series:' || p_series::text));

  select * into s from public.voyage_series where id = p_series and active;
  if s.id is null then raise exception 'no such series on the books'; end if;
  select * into t from public.voyages where id = s.template_voyage_id;
  if t.id is null then raise exception 'the series lost its template sailing'; end if;

  tz := coalesce(nullif(btrim(t.time_zone), ''), 'UTC');
  span := t.ends_at - t.starts_at;

  select max(starts_at) into base from public.voyages where series_id = s.id;
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
    if exists (select 1 from public.voyages where slug = occ_slug and status <> 'cancelled') then
      continue;
    end if;
    if exists (select 1 from public.voyages where slug = occ_slug) then
      occ_slug := occ_slug || '-2';
      if exists (select 1 from public.voyages where slug = occ_slug) then continue; end if;
    end if;

    select id into season from public.seasons
    where active and (next_start at time zone tz)::date between starts_on and ends_on
    order by starts_on desc limit 1;

    insert into public.voyages
      (slug, title, class, kind, harbor_id, starts_at, ends_at, coordinates,
       distance_nm, berths_total, price_cents, status, blurb, description, media,
       min_tier, deposit_required, deposit_cents, muster,
       fathoms_multiplier, sub_class, itinerary, held_passes, time_zone, format,
       sale_opens_at, presale_hours, season_id, venue_id, series_id)
    values
      (occ_slug, t.title, t.class, t.kind, t.harbor_id, next_start,
       case when span is null then null else next_start + span end, t.coordinates,
       t.distance_nm, t.berths_total, t.price_cents, 'scheduled', t.blurb, t.description, t.media,
       t.min_tier, t.deposit_required, t.deposit_cents, t.muster,
       t.fathoms_multiplier, t.sub_class, t.itinerary, t.held_passes, t.time_zone, t.format,
       case when t.sale_opens_at is null then null else t.sale_opens_at + shift end,
       t.presale_hours, coalesce(season, t.season_id), t.venue_id, s.id)
    returning id into occ_id;

    insert into public.voyage_segment_caps (voyage_id, segment, cap)
    select occ_id, segment, cap from public.voyage_segment_caps where voyage_id = t.id;
    insert into public.voyage_vessels (voyage_id, vessel_id, position)
    select occ_id, vessel_id, position from public.voyage_vessels where voyage_id = t.id;
    insert into public.voyage_sponsors (voyage_id, sponsor_id, placement)
    select occ_id, sponsor_id, placement from public.voyage_sponsors where voyage_id = t.id;
    insert into public.voyage_legs (voyage_id, day, port, note, starts_at)
    select occ_id, day, port, note, case when starts_at is null then null else starts_at + shift end
    from public.voyage_legs where voyage_id = t.id;

    raised := raised + 1;
  end loop;

  return raised;
end $$;;
