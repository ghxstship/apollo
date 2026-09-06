-- radar_sweep() already honours the manifest opt-out on the READ: it will not
-- return a pass whose show_on_manifest is false, or whose member has
-- profiles.on_manifest false, with a comment saying the opt-out must not be
-- "quietly overridden by a newer surface". hold_the_radar_lock — the trigger
-- that is the actual authority on a pick — checked that the picked pass was on
-- the episode, aboard and checked in, and checked neither flag. So a caller
-- holding an opted-out guest's pass uuid could pin them, and a mutual pick
-- fires anchor_on_mutual_pick, which writes a shared_anchors row and exchanges
-- contact details with somebody who asked not to be listed.
--
-- Defence in depth rather than a live path: the sweep never returns those ids
-- and passes SELECT is own-or-staff, so the uuid is not obtainable from any
-- surface that member can read. The gap is that the read gate and the write
-- gate disagreed, and the read gate is the one it is easy to add a new surface
-- beside.
--
-- Only the PICKED side is checked. A member who has opted out may still pick —
-- the opt-out is about being listed, not about looking — which is the same
-- asymmetry radar_sweep has. The DELETE path returns before this check, so a
-- pick made before an opt-out can still be withdrawn and nobody is stuck.
--
-- Everything else is verbatim from the live definition.
create or replace function public.hold_the_radar_lock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  r      record;
  v      record;
  target uuid;
  picker uuid;
  used   integer;
  mine   record;
  theirs record;
begin
  target := coalesce(new.episode_id, old.episode_id);
  picker := coalesce(new.picker_rsvp, old.picker_rsvp);

  select * into r from public.episode_radar where episode_id = target;

  if r.episode_id is null then
    -- The clock is gone. On a delete that is the cascade tidying up after
    -- staff, and there is nothing left to hold shut.
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'radar does not run on this episode';
  end if;

  if now() < r.opens_at then
    raise exception 'radar opens at 17:15, on open water';
  end if;
  if now() >= r.locks_at then
    raise exception 'picks closed at 17:30 and nothing moves after';
  end if;

  if tg_op = 'DELETE' then return old; end if;

  -- Only aboard. The kit says Radar "is not a dating app you scroll at home",
  -- and checked_in_at is the only fact this schema holds about a body being on
  -- the boat -- a geofence would be a better predicate and does not exist here.
  select * into v from public.episodes where id = target;
  if v.status <> 'live' then
    raise exception 'radar is live aboard only — this episode is not under way';
  end if;

  select * into mine from public.passes where id = new.picker_rsvp;
  select * into theirs from public.passes where id = new.picked_rsvp;
  if mine.episode_id <> target or theirs.episode_id <> target then
    raise exception 'that pass is not on this episode';
  end if;
  if mine.status <> 'aboard' or mine.checked_in_at is null then
    raise exception 'radar opens when you are aboard';
  end if;
  if theirs.status <> 'aboard' or theirs.checked_in_at is null then
    raise exception 'that pin is not aboard';
  end if;

  -- The manifest opt-out, honoured on the write as it already is on the read.
  -- radar_sweep excludes exactly these two flags; without this a pin the sweep
  -- would never show could still be plotted by uuid, and a mutual pick would
  -- hand out the contact details of somebody who asked not to be listed.
  if not theirs.show_on_manifest
     or not exists (
       select 1 from public.profiles p
       where p.id = theirs.profile_id and p.on_manifest
     ) then
    raise exception 'that pin is not on the radar';
  end if;

  -- "Three is the ceiling, not a target." A cross-row count, so a CHECK
  -- constraint cannot hold it; same shape as guard_cabin_capacity -- lock the
  -- thing being counted, then count, then act.
  perform pg_advisory_xact_lock(hashtext('radar:' || target::text || ':' || picker::text));
  select count(*) into used from public.radar_picks
  where episode_id = target and picker_rsvp = picker
    and picked_rsvp <> new.picked_rsvp;
  if used >= r.slots then
    raise exception '% picks, % used — a slot has to come free first', r.slots, used;
  end if;

  return new;
end $fn$;;
