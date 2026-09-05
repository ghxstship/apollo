-- Four holes the crew-and-door tests reproduced.
--
-- 1. The door's UPDATE policy covers the row; the gangway guard fired only on
--    the gangway columns, so a door PATCH of status or guests never met it.
--    The guard now runs on every update, and a door may move only
--    checked_in_at and checked_in_by (and a standby flag the boarding itself
--    flips).
create or replace function public.guard_the_gangway_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_standby_boarded boolean := false;
begin
  if coalesce(new.standby, false) and new.checked_in_at is not null and old.checked_in_at is null then
    if public.passes_left(new.episode_id, new.id) < public.segment_heads(new.segment) + coalesce(new.guests, 0) then
      raise exception 'no seat has come free for this standby pass';
    end if;
    new.standby := false;
    v_standby_boarded := true;
  end if;
  if auth.uid() is null or public.is_staff() then return new; end if;
  if pg_trigger_depth() > 1 then return new; end if;
  if coalesce(current_setting('app.accepting_pass', true), 'off') = 'on' then return new; end if;

  if not exists (select 1 from public.passes mine where mine.id = new.id and mine.profile_id = auth.uid())
     and public.is_door(new.episode_id) then
    /* A door stamps arrivals and touches nothing else on the pass. */
    if new.status is distinct from old.status
       or new.profile_id is distinct from old.profile_id
       or new.episode_id is distinct from old.episode_id
       or new.guests is distinct from old.guests
       or new.guest_names is distinct from old.guest_names
       or new.show_on_manifest is distinct from old.show_on_manifest
       or new.vessel_id is distinct from old.vessel_id
       or new.comp is distinct from old.comp
       or new.promo_code is distinct from old.promo_code
       or new.auto_claim is distinct from old.auto_claim
       or new.cabin_id is distinct from old.cabin_id
       or new.segment is distinct from old.segment
       or new.sponsor_id is distinct from old.sponsor_id
       or new.boarding_code is distinct from old.boarding_code
       or (new.standby is distinct from old.standby and not v_standby_boarded) then
      raise exception 'the door stamps arrivals and nothing else';
    end if;
    return new;
  end if;

  if new.checked_in_at is distinct from old.checked_in_at
     or new.checked_in_by is distinct from old.checked_in_by then
    raise exception 'the gangway checks you in, not the other way round';
  end if;
  if new.boarding_code is distinct from old.boarding_code then
    raise exception 'a boarding code is issued by the club';
  end if;
  if new.vessel_id is distinct from old.vessel_id then
    raise exception 'the Bridge assigns hulls';
  end if;
  if new.segment is distinct from old.segment
     and old.status = 'aboard' and new.status = 'aboard' then
    raise exception 'a pass keeps the segment it was booked in — release it and book again';
  end if;
  return new;
end $function$;
drop trigger if exists guard_the_gangway_columns on public.passes;
create trigger guard_the_gangway_columns
  before update on public.passes
  for each row execute function public.guard_the_gangway_columns();

-- 2. Anyone could apply to a CLOSED posting and stamp their own decision.
drop policy if exists "anyone applies to crew" on public.crew_candidates;
create policy "anyone applies to crew" on public.crew_candidates
  for insert to anon, authenticated
  with check (
    char_length(full_name) between 1 and 120
    and position('@' in email) > 1 and char_length(email) between 5 and 254
    and coalesce(stage, 'applied') = 'applied'
    and coalesce(char_length(note), 0) <= 2000
    and coalesce(char_length(phone), 0) <= 40
    and coalesce(char_length(links), 0) <= 300
    and coalesce(char_length(source), 0) <= 200
    and coalesce(char_length(cv_url), 0) <= 500
    and reviewed_by is null and decided_at is null and rejected_reason is null
    and exists (select 1 from public.crew_roles r where r.id = role_id and r.open)
  );

-- 3. A blackout was honoured by the picker and by nothing else.
create or replace function public.a_blackout_holds_at_the_rota()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_day date;
begin
  if new.status not in ('offered', 'confirmed') then return new; end if;
  select (e.starts_at at time zone coalesce(nullif(btrim(e.time_zone), ''), 'UTC'))::date into v_day
    from public.episodes e where e.id = new.episode_id;
  if exists (select 1 from public.crew_blackouts b
              where b.crew_id = new.crew_id and b.from_date <= v_day and b.to_date >= v_day) then
    raise exception 'they said they cannot work that day — the blackout stands';
  end if;
  return new;
end $function$;
revoke all on function public.a_blackout_holds_at_the_rota() from public, anon, authenticated;
drop trigger if exists a_blackout_holds_at_the_rota on public.crew_assignments;
create trigger a_blackout_holds_at_the_rota
  before insert or update of status, crew_id, episode_id on public.crew_assignments
  for each row execute function public.a_blackout_holds_at_the_rota();

-- 4. One member is one crew row.
create unique index if not exists crew_one_row_per_profile on public.crew (profile_id) where profile_id is not null;;
