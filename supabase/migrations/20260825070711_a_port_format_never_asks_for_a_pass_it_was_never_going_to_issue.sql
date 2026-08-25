/* The one rule in the activity kit that changes behaviour rather than layout:
   "Port formats never require a Captain's Pass. They are the low-commitment
   door into the club — and the only formats open to unvetted guests of
   members."

   Enforced by teaching rsvp_guard() to ask, rather than by a second trigger,
   because the rule is SUBTRACTIVE: it removes two gates from a booking that
   would otherwise be refused, and a trigger cannot un-raise another trigger's
   exception. It is the one place in this module where data becomes behaviour.

   Fails closed. A voyage with no format — which is all eighteen of them today —
   reads as requiring a pass, so this migration changes the answer for exactly
   zero existing rows and cannot open a sailing by omission. */
create or replace function public.a_pass_is_required(p_format text)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select coalesce(
    (select f.requires_vetting from public.activity_formats f where f.slug = p_format),
    true);
$$;

/* Rewritten from pg_get_functiondef, not retyped. Everything below is the
   deployed body with one change: the tier gate and the class ceiling now sit
   behind `if v_pass_required`. The membership standing check, the guest
   allowance, the monthly allowance, the booking window and the capacity count
   are untouched — a beach day that asks for no Captain's Pass is still a thing
   a paused membership cannot book, and is still counted against the cap. */
CREATE OR REPLACE FUNCTION public.rsvp_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_pass_required boolean;
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
  v_pass_required := public.a_pass_is_required(v.format);

  if member.status <> 'active' then
    raise exception 'your membership is paused';
  end if;

  -- The Captain's Pass gate. A Port format has none, by definition: it is the
  -- door for people who have not been vetted yet, and gating it on the tier
  -- that vetting produces would close the only entrance the club has.
  if v_pass_required then
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

revoke all on function public.a_pass_is_required(text) from public;
grant execute on function public.a_pass_is_required(text) to anon, authenticated;
;
