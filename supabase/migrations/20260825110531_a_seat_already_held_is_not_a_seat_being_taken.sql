-- Four faults an adversarial read found in the new crew screens.

-- ONE. A pass already seated in an over-cap segment could not be written to at
-- all. guard_the_ratio counts the OTHER aboard passes in the segment, so with a
-- cap of 1 and two people seated, re-saving either one saw units=1 >= cap=1 and
-- was refused — with "1 seats, 1 taken — the waitlist runs in order", which
-- blames a waitlist that has nothing to do with it. Postgres fires
-- `UPDATE OF col` whenever the column appears in the SET list, unchanged value
-- or not, so an ordinary save of an unrelated field hit this.
--
-- The seat check exists to stop a NEW seat being consumed. A row that was
-- already aboard in the same segment is not consuming one; it is holding the
-- one it had. Lowering a cap below what is booked is allowed on purpose — the
-- people already seated keep their places and the segment simply reads full
-- from here on — and that promise is only kept if their rows stay writable.
create or replace function public.guard_the_ratio()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  gated   boolean;
  ceiling integer;
  units   integer;
  heads   integer;
  weight  integer;
  hull    integer;
  holds   boolean;
begin
  -- Waitlisted and declined passes occupy nothing. Only a seat counts.
  if new.status <> 'aboard' then return new; end if;

  select exists (
    select 1 from public.voyage_segment_caps c where c.voyage_id = new.voyage_id
  ) into gated;
  if not gated then return new; end if;

  -- Staff are NOT exempt here, and that is deliberate -- unlike every other
  -- check in rsvp_guard, which lets staff through on the first line. The 40 is
  -- the USCG number for a certified passenger pontoon and the segment split is
  -- the thing the whole product promises. The way to seat an eleventh single
  -- woman is to raise her cap and own that decision in a row someone can read,
  -- not to have an operator quietly walk past the gate at the keyboard.

  if new.segment is null then
    raise exception 'this sailing seats by segment — the pass has to say which';
  end if;

  -- A ratio sailing has no guest passes. `rsvps.guests` is the Global-tier
  -- companion path: an unsegmented head riding on someone else's pass. Allowing
  -- it here would be a hole exactly the width of the singles caps -- two guests
  -- of any gender, seated, counted against nothing.
  if coalesce(new.guests, 0) > 0 then
    raise exception 'a ratio sailing carries no companions — every seat is a vetted pass of its own';
  end if;

  -- Was this row ALREADY holding a seat in this same segment? Then nothing is
  -- being taken and the ceiling has nothing to say. Moving between segments, or
  -- joining from waitlist/declined, does take one and is counted below.
  holds := tg_op = 'UPDATE'
       and old.status = 'aboard'
       and old.segment is not distinct from new.segment;

  -- Everything below counts and then acts on the count. Same key rsvp_guard
  -- takes, so two people reaching for the last seat in a segment serialise.
  perform pg_advisory_xact_lock(hashtext('voyage:' || new.voyage_id::text));

  select cap into ceiling from public.voyage_segment_caps
  where voyage_id = new.voyage_id and segment = new.segment;
  if ceiling is null then
    raise exception 'this sailing does not seat that segment';
  end if;

  if not holds then
    select count(*) into units from public.rsvps
    where voyage_id = new.voyage_id and status = 'aboard'
      and segment = new.segment and id <> new.id;

    -- The kit's refusal copy, verbatim where it fits: "Ten seats, ten taken."
    -- Naming the number is the point -- a member who is refused learns the shape
    -- of the rule rather than being told the sale failed.
    if units >= ceiling then
      raise exception '% seats, % taken — the waitlist runs in order', ceiling, units;
    end if;

    -- The head cap. Note this is NOT today's count(*): a couple is one row and two
    -- heads, and the difference is invisible until the first couple books.
    weight := case when new.segment = 'couple' then 2 else 1 end;
    select coalesce(sum(case when segment = 'couple' then 2 else 1 end), 0) into heads
    from public.rsvps
    where voyage_id = new.voyage_id and status = 'aboard' and id <> new.id;

    select berths_total - held_passes into hull from public.voyages where id = new.voyage_id;
    if heads + weight > hull then
      raise exception 'the manifest is full at % — the waitlist runs in order', hull;
    end if;
  end if;

  return new;
end $function$;

-- TWO. The capacity view counted only passes that state a segment, and every
-- pass sold before a sailing was gated has segment NULL. So the first act of
-- gating any existing sailing read "0 SOLD" while people were aboard, and the
-- operator set ceilings against a number that was not the truth. The hull check
-- above counts them, so the overflow surfaced at a member's checkout instead —
-- which the screen's own copy calls the worst place to find out.
drop view if exists public.voyage_segment_capacity;
create view public.voyage_segment_capacity
with (security_invoker = on) as
select c.voyage_id,
       c.segment,
       c.cap,
       coalesce(t.units, 0::bigint) as units,
       greatest(c.cap - coalesce(t.units, 0::bigint), 0::bigint) as remaining,
       -- The passes this view used to leave out. Same number on every row of a
       -- voyage, so a screen can say plainly how many seats are spoken for by
       -- people who booked before the segments existed.
       coalesce(u.unsegmented, 0::bigint) as unsegmented_aboard
  from public.voyage_segment_caps c
  left join (
    select r.voyage_id, r.segment, count(*) as units
      from public.rsvps r
     where r.status = 'aboard' and r.segment is not null
     group by r.voyage_id, r.segment
  ) t on t.voyage_id = c.voyage_id and t.segment = c.segment
  left join (
    select r.voyage_id, count(*) as unsegmented
      from public.rsvps r
     where r.status = 'aboard' and r.segment is null
     group by r.voyage_id
  ) u on u.voyage_id = c.voyage_id;

grant select on public.voyage_segment_capacity to authenticated;

-- THREE. Radar times were pinned to the sailing's DATE — 17:15 on the day it
-- departs — not to the departure. Key Biscayne leaves at 11:00, so its radar
-- opened at 17:15, six hours after it docked. Catalina leaves at 21:00, so its
-- anchors would unlock at 19:00, two hours before boarding. The screen says the
-- times are set "off that sailing's own departure", and now they are: the kit's
-- 17:15 / 17:30 / 19:00 are exactly departure +15m / +30m / +2h for the 17:00
-- sailing they were written for. Interval arithmetic on timestamptz also means
-- no wall-clock to lose across a DST boundary.
--
-- And opening the radar on a sailing that has already docked promised a
-- guarantee that could never settle: settle_the_match_guarantee fires on the
-- edge into 'completed', and for an already-completed sailing that edge is
-- gone, so the column read "ON DOCKING" for ever.
create or replace function public.open_the_radar(p_voyage uuid)
returns voyage_radar
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v   record;
  row public.voyage_radar;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  select * into v from public.voyages where id = p_voyage;
  if v.id is null then raise exception 'no such sailing'; end if;
  if v.status in ('completed', 'cancelled') then
    raise exception 'that sailing is in the log — the radar cannot open behind it';
  end if;

  insert into public.voyage_radar
    (voyage_id, opens_at, locks_at, anchors_unlock_at, anchors_expire_at)
  values (
    p_voyage,
    v.starts_at + interval '15 minutes',
    v.starts_at + interval '30 minutes',
    v.starts_at + interval '2 hours',
    v.starts_at + interval '2 hours' + interval '24 hours'
  )
  on conflict (voyage_id) do update
    set opens_at = excluded.opens_at,
        locks_at = excluded.locks_at,
        anchors_unlock_at = excluded.anchors_unlock_at,
        anchors_expire_at = excluded.anchors_expire_at
  returning * into row;

  return row;
end $function$;

-- FOUR. "We do not reopen them" was enforced by a disabled <select> and nothing
-- else. advanceTheFile never looked at the current state, so a declined file
-- could be walked straight back to cleared with a fresh twelve-month clearance
-- — and two operators racing did it silently: A opens the dialog on a submitted
-- file, B declines it, A saves cleared, and the decline is gone with no trace.
create or replace function public.a_decline_is_final()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.declined_at is not null and new.declined_at is null then
    raise exception 'that file was declined — a decline is not reopened from here';
  end if;
  if old.declined_at is not null
     and (new.cleared_at is distinct from old.cleared_at
       or new.cleared_until is distinct from old.cleared_until) then
    raise exception 'that file was declined — it cannot be cleared from here';
  end if;
  return new;
end $function$;

revoke execute on function public.a_decline_is_final() from public, anon, authenticated;

drop trigger if exists vetting_decline_is_final on public.vetting_files;
create trigger vetting_decline_is_final
  before update on public.vetting_files
  for each row execute function public.a_decline_is_final();;
