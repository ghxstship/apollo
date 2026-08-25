-- Two clocks in this function, both the wrong one. The DB session runs in UTC;
-- every harbour is behind it; a voyage carries the zone it sails from.
--
-- 1. THE BOOKING WINDOW IS ANNOUNCED ON A DAY IT DOES NOT OPEN.
--    `to_char(opens, 'Mon DD')` renders in the session zone — UTC. Verified
--    against live rows: for "Chicago: the founding night" (departs May 15,
--    19:00 CDT) on any Expedition plan, this refusal says "the window opens
--    Apr 01" while the manifest banner says "MAR 31" and the harbour's truth is
--    Mar 31, 19:00 CDT. Twenty-four voyage-plan combinations in current data
--    disagree between the guard's word and the harbour's day.
--
--    Passes are scarce and first-come. A member reads "MAR 31", tries on the
--    31st, and is refused in the club's own voice naming a different day. The
--    mirror is worse: for "Night passage: Catalina" both surfaces say "Aug 02"
--    for a window that opens Aug 1 at 21:00 PDT — three hours of a scarce night
--    passage handed to whoever happened to refresh.
--
-- 2. THE MONTHLY ALLOWANCE RESETS ON THE UTC MONTH.
--    `date_trunc('month', starts_at)` in UTC puts an LA sailing at Sep 30,
--    21:00 PDT into OCTOBER. A Regional·Voyage member books it, then cannot
--    claim anything in October — refused with "monthly passes are spent" for
--    two sailings the manifest itself prints as SEP 30 and OCT 20. They have
--    paid dues for a pass the calendar says they still hold. The inverse gives
--    two passes for one allowance.
--
-- Both now read on the sailing's own clock, which is the clock every surface
-- of the product already shows the member.
create or replace function public.rsvp_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v record;
  member record;
  plan record;
  taken int;
  used int;
  tier_rank int;
  min_rank int;
  ceiling_rank int;
  sub_rank int;
  opens timestamptz;
  zone text;
begin
  if public.is_staff() then return new; end if;

  select * into member from public.profiles where id = new.profile_id;

  -- A pass never carries guests it is not entitled to, aboard or waitlisted.
  if coalesce(new.guests, 0) > 0 and member.tier <> 'global' then
    raise exception 'guest passes ride on Global memberships';
  end if;
  if coalesce(new.guests, 0) > 2 then
    raise exception 'two guest passes per member';
  end if;

  if new.status <> 'aboard' then return new; end if;

  -- Everything below counts something and then acts on the count. Serialise the
  -- sailing so two bookings cannot both read the last berth as free.
  perform pg_advisory_xact_lock(hashtext('voyage:' || new.voyage_id::text));

  select * into v from public.voyages where id = new.voyage_id;
  select * into plan from public.membership_plans where id = member.plan_id;
  zone := coalesce(nullif(btrim(v.time_zone), ''), 'UTC');

  if member.status <> 'active' then
    raise exception 'membership is on hold';
  end if;
  tier_rank := case member.tier when 'regional' then 1 when 'national' then 2 else 3 end;
  min_rank := case v.min_tier when 'regional' then 1 when 'national' then 2 else 3 end;
  if tier_rank < min_rank then
    raise exception 'passes for this sailing open at % tier', v.min_tier;
  end if;
  -- Class ceiling (sea ladder only; Access has no ceiling)
  if plan.id is not null and plan.class_ceiling is not null
     and v.sub_class in ('voyage','expedition','odyssey') then
    ceiling_rank := case plan.class_ceiling when 'voyage' then 1 when 'expedition' then 2 else 3 end;
    sub_rank := case v.sub_class when 'voyage' then 1 when 'expedition' then 2 else 3 end;
    if sub_rank > ceiling_rank then
      raise exception 'this sailing runs past your class tier — % passes open at a deeper tier', v.sub_class;
    end if;
  end if;
  -- Monthly allowance (0 = a la carte, uncapped), counted on each sailing's own
  -- harbour month rather than on UTC's.
  if plan.id is not null and plan.events_per_month > 0 then
    select count(*) into used from public.rsvps r
    join public.voyages vv on vv.id = r.voyage_id
    where r.profile_id = new.profile_id and r.status = 'aboard' and r.id <> new.id
      and vv.status <> 'cancelled'
      and date_trunc('month', vv.starts_at at time zone coalesce(nullif(btrim(vv.time_zone), ''), 'UTC'))
        = date_trunc('month', v.starts_at at time zone zone);
    if used >= plan.events_per_month then
      raise exception 'monthly passes are spent — the ledger resets with the month';
    end if;
  end if;
  -- Booking window (deeper tiers open earlier), named in the harbour's day.
  if plan.id is not null then
    opens := v.starts_at - make_interval(days => plan.early_days);
    if now() < opens then
      raise exception 'the window opens % for your tier',
        to_char(opens at time zone zone, 'Mon DD');
    end if;
  end if;
  -- Capacity net of operator holds
  select count(*) into taken from public.rsvps
  where voyage_id = new.voyage_id and status = 'aboard' and id <> new.id;
  if taken >= v.berths_total - v.held_passes then
    raise exception 'the manifest is full — join the waitlist';
  end if;
  return new;
end $function$;
;
