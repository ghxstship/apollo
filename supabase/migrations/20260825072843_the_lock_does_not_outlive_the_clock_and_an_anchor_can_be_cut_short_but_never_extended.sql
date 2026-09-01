-- Two corrections to Radar, both found by the e2e suite rather than by reading.

-- ── 1. A Radar sailing could not be deleted. At all. ───────────────────────
-- `delete from voyages` cascades to voyage_radar and to radar_picks, and the
-- cascade order is Postgres's business, not ours. When voyage_radar went first,
-- the BEFORE DELETE arm of hold_the_radar_lock looked up the clock it enforces
-- against, found nothing, and raised 'radar does not run on this sailing' —
-- which aborted the whole cascade. So the trigger written to stop a member
-- editing picks after 17:30 was also stopping the club from removing a sailing,
-- and it failed as a refusal deep inside a foreign-key action where nobody
-- would think to look for it.
--
-- The fix is to say what the missing clock actually means. A member cannot
-- delete a voyage_radar row — that table is staff-only — so "no clock" can only
-- mean staff have taken Radar off this sailing or removed the sailing itself.
-- In that case there is no window left to enforce and refusing the delete only
-- strands rows the foreign key is trying to clean up. On INSERT and UPDATE it
-- still means what it always meant: you cannot plot a course on a sailing that
-- has no Radar.
create or replace function public.hold_the_radar_lock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r      record;
  v      record;
  target uuid;
  picker uuid;
  used   integer;
  mine   record;
  theirs record;
begin
  target := coalesce(new.voyage_id, old.voyage_id);
  picker := coalesce(new.picker_rsvp, old.picker_rsvp);

  select * into r from public.voyage_radar where voyage_id = target;

  if r.voyage_id is null then
    -- The clock is gone. On a delete that is the cascade tidying up after
    -- staff, and there is nothing left to hold shut.
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'radar does not run on this sailing';
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
  select * into v from public.voyages where id = target;
  if v.status <> 'live' then
    raise exception 'radar is live aboard only — this sailing is not under way';
  end if;

  select * into mine from public.rsvps where id = new.picker_rsvp;
  select * into theirs from public.rsvps where id = new.picked_rsvp;
  if mine.voyage_id <> target or theirs.voyage_id <> target then
    raise exception 'that pass is not on this sailing';
  end if;
  if mine.status <> 'aboard' or mine.checked_in_at is null then
    raise exception 'radar opens when you are aboard';
  end if;
  if theirs.status <> 'aboard' or theirs.checked_in_at is null then
    raise exception 'that pin is not aboard';
  end if;

  -- "Three is the ceiling, not a target." A cross-row count, so a CHECK
  -- constraint cannot hold it; same shape as guard_cabin_capacity -- lock the
  -- thing being counted, then count, then act.
  perform pg_advisory_xact_lock(hashtext('radar:' || target::text || ':' || picker::text));
  select count(*) into used from public.radar_picks
  where voyage_id = target and picker_rsvp = picker
    and picked_rsvp <> new.picked_rsvp;
  if used >= r.slots then
    raise exception '% picks, % used — a slot has to come free first', r.slots, used;
  end if;

  return new;
end $$;

-- ── 2. "No extension" was a sentence, not a rule ───────────────────────────
-- shared_anchors had no UPDATE policy at all, which looked like safety and was
-- really an absence: staff could not shorten an anchor after an incident, and
-- the twenty-four hours held only because nobody could reach the column.
--
-- An absence is a bad way to hold a rule, because the first person who needs
-- the legitimate half of it adds a policy and gets the illegitimate half free.
-- So the write is allowed and the DIRECTION is the constraint: an expiry may
-- only ever come forward, and unlocked_at may not be cleared. That is the kit's
-- "no extension and no reminder" as something the database can refuse, and it
-- leaves room for the real operational need — the Chief Vibe Stew cutting a
-- contact short because something happened on deck.
drop policy if exists "staff may cut an anchor short" on public.shared_anchors;
create policy "staff may cut an anchor short" on public.shared_anchors
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

create or replace function public.an_anchor_is_never_extended()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.expires_at > old.expires_at then
    raise exception 'an anchor runs twenty-four hours and is never extended';
  end if;
  if old.unlocked_at is not null and new.unlocked_at is null then
    raise exception 'an opened envelope does not close again';
  end if;
  -- The pair is the contact. Re-pointing an anchor at a different pass would be
  -- introducing two people who never plotted a course to each other.
  if new.voyage_id <> old.voyage_id or new.rsvp_a <> old.rsvp_a or new.rsvp_b <> old.rsvp_b then
    raise exception 'an anchor is the pair it was made from';
  end if;
  return new;
end $$;

drop trigger if exists an_anchor_is_never_extended on public.shared_anchors;
create trigger an_anchor_is_never_extended
  before update on public.shared_anchors
  for each row execute function public.an_anchor_is_never_extended();;
