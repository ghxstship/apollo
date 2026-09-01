-- The companion to a_seat_already_held_is_not_a_seat_being_taken. Fixing the
-- ratio gate uncovered this one immediately underneath it: a pass sold BEFORE a
-- sailing was gated belongs to someone with no vetting file at all, so
-- guard_the_vetting refused every subsequent write to that row with "the
-- vetting file is not open yet — identity comes first".
--
-- Refusing there achieves nothing it intends. The member is already aboard;
-- the gate cannot unseat them, it can only make their row unwritable — so the
-- crew cannot correct a guest count, and the member cannot release the pass
-- they no longer want. The rule is about TAKING a seat on a gated sailing.
-- Someone who is already in one is past the door.
--
-- Moving between sailings is not a way around it: rsvp_stays_on_its_sailing
-- refuses that outright for anyone but staff, and an INSERT — the actual act of
-- taking a seat — still faces every check below.
create or replace function public.guard_the_vetting()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  f record;
begin
  if new.status <> 'aboard' then return new; end if;
  if not exists (
    select 1 from public.voyage_segment_caps c where c.voyage_id = new.voyage_id
  ) then return new; end if;

  -- Already aboard this sailing: the seat is held, and this gate guards the
  -- door rather than the room.
  if tg_op = 'UPDATE' and old.status = 'aboard' and old.voyage_id = new.voyage_id then
    return new;
  end if;

  select * into f from public.vetting_files where profile_id = new.profile_id;

  if f.id is null or f.id_verified_at is null then
    raise exception 'the vetting file is not open yet — identity comes first';
  end if;
  if not f.age_ok then
    raise exception 'this sailing seats 25 to 45, with no exceptions';
  end if;
  if f.background_state = 'needs_a_call' then
    raise exception 'a ten-minute video call finishes your clearance';
  end if;
  if f.background_state <> 'cleared' then
    -- Says nothing about why. A declined file and a pending one get the same
    -- sentence on purpose: the refusal is at a checkout, where a member may be
    -- reading it over someone's shoulder, and "declined" is not a thing to
    -- publish to a room.
    raise exception 'your clearance is not in — the vetting team writes when it is';
  end if;
  if f.cleared_until is not null and f.cleared_until <= now() then
    raise exception 'your clearance lapsed on % — the vetting team reopens it',
      to_char(f.cleared_until at time zone 'America/New_York', 'Mon DD');
  end if;

  return new;
end $function$;;
