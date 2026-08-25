-- "Night Reckoning" is for sailing past midnight. The test asked whether the
-- sailing crossed midnight IN UTC, which for every harbour this club sails from
-- is somewhere between four and eight in the evening, local.
--
-- Counted against live data, five members hold this mark and evaluating it on
-- the harbour's clock changes four sailings' classification:
--   3 members hold it who never sailed past local midnight — they were on
--     06:00–20:00 PDT and 13:00–22:00 PDT runs, plainly daytime.
--   2 members who DID cross local midnight are denied it — 19:00–01:00 PDT and
--     20:00–00:00 PDT.
-- Marks carry no knots, so this is reputation and the passage log rather than
-- money — which is exactly the kind of thing a member would notice and nobody
-- would ever be able to explain to them.
--
-- Existing member_marks rows are left alone deliberately. Taking a mark back off
-- somebody's log because the rule was wrong when they earned it is a worse
-- wrong than the one being fixed; from here it is decided correctly.
create or replace function public.confer_marks(p_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  conferred integer := 0;
begin
  with sail as (
    select v.id, v.harbor_id, v.distance_nm, v.starts_at, v.ends_at, v.time_zone, r.vessel_id
    from public.rsvps r
    join public.voyages v on v.id = r.voyage_id
    where r.profile_id = p_profile_id
      and r.status = 'aboard'
      and v.status = 'completed'
  ),
  stat as (
    select
      (select count(*) from sail) as sailings,
      (select coalesce(sum(s.distance_nm), 0) from sail s) as nm,
      (select count(distinct s.harbor_id) from sail s where s.harbor_id is not null) as harbors,
      (select count(distinct s.vessel_id) from sail s where s.vessel_id is not null) as vessels,
      (select count(*) from sail s where s.distance_nm >= 25) as bluewater,
      (select count(*) from sail s
        where s.ends_at is not null and s.ends_at - s.starts_at >= interval '8 hours') as longrun,
      -- Midnight where the boat is, not midnight in Greenwich.
      (select count(*) from sail s
        where s.ends_at is not null
          and (s.ends_at   at time zone coalesce(nullif(btrim(s.time_zone), ''), 'UTC'))::date
            > (s.starts_at at time zone coalesce(nullif(btrim(s.time_zone), ''), 'UTC'))::date) as nightrun,
      (select count(distinct r2.profile_id) from public.rsvps r2
        where r2.voyage_id in (select s.id from sail s)
          and r2.status = 'aboard'
          and r2.profile_id <> p_profile_id) as crew_met,
      (select count(*) from public.harbors where status = 'open') as open_harbors,
      (select count(*) from public.vessels where active) as active_vessels
  ),
  earned as (
    select m.code
    from public.marks m cross join stat s
    where m.active and case m.code
      when 'first-watch'     then s.sailings >= 1
      when 'sea-legs'        then s.sailings >= 3
      when 'blue-water'      then s.bluewater >= 1
      when 'long-passage'    then s.longrun >= 1
      when 'night-reckoning' then s.nightrun >= 1
      when 'the-hundred'     then s.nm >= 100
      when 'ships-company'   then s.crew_met >= 25
      when 'full-compass'    then s.open_harbors >= 2 and s.harbors >= s.open_harbors
      when 'whole-fleet'     then s.active_vessels >= 2 and s.vessels >= s.active_vessels
      else false
    end
  ),
  ins as (
    insert into public.member_marks (profile_id, mark_code)
    select p_profile_id, e.code from earned e
    on conflict (profile_id, mark_code) do nothing
    returning mark_code
  )
  insert into public.notifications (profile_id, kind, title, body)
  select p_profile_id, 'word', 'Mark rounded — ' || m.name, m.blurb
  from ins i join public.marks m on m.code = i.mark_code;

  get diagnostics conferred = row_count;
  return conferred;
end;
$function$;
;
