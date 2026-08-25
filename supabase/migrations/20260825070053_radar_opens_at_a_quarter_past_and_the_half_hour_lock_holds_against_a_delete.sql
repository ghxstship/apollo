-- Radar. The kit's standing rules, in the order they matter: "RADAR IS ONLY LIVE
-- ABOARD · THREE PICKS, LOCKED AT 17:30 · MUTUAL ONLY, NEVER ONE-SIDED · NO
-- SCORES, NO STREAKS, NO WHO-VIEWED-YOU".

-- ── The clock ──────────────────────────────────────────────────────────────
-- One row per sailing, and the presence of the row is what makes a sailing a
-- Radar sailing. Everything downstream reads these four timestamps; nothing
-- recomputes 17:30 from anything.
--
-- Absolute timestamptz rather than a time-of-day read against the harbour clock
-- on each request. If the zone on a sailing is corrected mid-season -- and this
-- schema has a whole migration about reading windows on the harbour's clock --
-- a derived lock would move retroactively, which means a pick that was refused
-- at 17:31 becomes a pick that should have been allowed, in a table where the
-- refusal is the product.
create table if not exists public.voyage_radar (
  voyage_id         uuid primary key references public.voyages(id) on delete cascade,
  opens_at          timestamptz not null,
  locks_at          timestamptz not null,
  anchors_unlock_at timestamptz not null,
  anchors_expire_at timestamptz not null,
  slots             smallint not null default 3 check (slots between 1 and 3),
  settled_at        timestamptz,
  check (locks_at > opens_at),
  check (anchors_expire_at > anchors_unlock_at)
);

comment on table public.voyage_radar is
  'The Radar clock for one sailing: 17:15 open, 17:30 lock, 19:00 anchors unlock, +24h expiry, three slots. A sailing with no row here has no Radar.';

alter table public.voyage_radar enable row level security;

-- The clock is guest-facing: a member has to be able to read "12 minutes
-- remaining" from the same source the lock is enforced against, or the countdown
-- and the refusal will eventually disagree.
drop policy if exists "the radar clock is public" on public.voyage_radar;
create policy "the radar clock is public" on public.voyage_radar
  for select to public using (true);

drop policy if exists "staff set the radar clock" on public.voyage_radar;
create policy "staff set the radar clock" on public.voyage_radar
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- The canonical times, computed once on the sailing's own local date. 17:15 and
-- 17:30 are the numbers in operations.md's event arc and in trigger 7 of the
-- comms map; 19:00 is trigger 9.
create or replace function public.open_the_radar(p_voyage uuid)
returns public.voyage_radar
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v   record;
  day date;
  row public.voyage_radar;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  select * into v from public.voyages where id = p_voyage;
  if v.id is null then raise exception 'no such sailing'; end if;

  day := (v.starts_at at time zone v.time_zone)::date;

  insert into public.voyage_radar
    (voyage_id, opens_at, locks_at, anchors_unlock_at, anchors_expire_at)
  values (
    p_voyage,
    (day + time '17:15') at time zone v.time_zone,
    (day + time '17:30') at time zone v.time_zone,
    (day + time '19:00') at time zone v.time_zone,
    ((day + time '19:00') at time zone v.time_zone) + interval '24 hours'
  )
  on conflict (voyage_id) do update
    set opens_at = excluded.opens_at,
        locks_at = excluded.locks_at,
        anchors_unlock_at = excluded.anchors_unlock_at,
        anchors_expire_at = excluded.anchors_expire_at
  returning * into row;

  return row;
end $$;

revoke all on function public.open_the_radar(uuid) from public, anon;
grant execute on function public.open_the_radar(uuid) to authenticated;

-- ── The picks ──────────────────────────────────────────────────────────────
-- The actor is the PASS, not the person. `rsvps` is already unique on (voyage,
-- profile) and a couple is one pass, so "couples plot course as one pin and
-- appear as one anchor" is the primary key rather than a filter some future
-- surface forgets to apply. It also means the half of a couple with no account
-- is representable, which a profile-keyed pick can never do.
--
-- There is no `passed` column and no pass table. "A PASS IS NEVER RECORDED,
-- NEVER SHOWN, NEVER COUNTED" -- so there is nothing here to record it in, and
-- no later change of mind about analytics can quietly start.
create table if not exists public.radar_picks (
  voyage_id   uuid not null references public.voyages(id) on delete cascade,
  picker_rsvp uuid not null references public.rsvps(id) on delete cascade,
  picked_rsvp uuid not null references public.rsvps(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (voyage_id, picker_rsvp, picked_rsvp),
  constraint radar_no_self_pick check (picker_rsvp <> picked_rsvp)
);

comment on table public.radar_picks is
  'Plot Course, keyed on the pass. Three per pass, refused outside 17:15-17:30. No pass/skip is recorded because the kit says one is never recorded.';

alter table public.radar_picks enable row level security;

-- Your own picks, and NOBODY else's -- not even staff. This departs from the
-- house `or is_staff()` default on purpose: the kit says a one-sided pick is
-- "never surfaced, hinted at, or counted", and a Bridge operator scrolling this
-- table is a surfacing. Staff get counts through the aggregate view below and
-- never the rows.
drop policy if exists "your own picks and no one else's" on public.radar_picks;
create policy "your own picks and no one else's" on public.radar_picks
  for select to authenticated using (
    exists (select 1 from public.rsvps r
            where r.id = radar_picks.picker_rsvp and r.profile_id = auth.uid())
  );

drop policy if exists "plot from your own pass" on public.radar_picks;
create policy "plot from your own pass" on public.radar_picks
  for insert to authenticated with check (
    public.is_active() and exists (
      select 1 from public.rsvps r
      where r.id = radar_picks.picker_rsvp and r.profile_id = auth.uid()
    )
  );

-- A DELETE policy exists so that "change" on a filled slot is possible BEFORE
-- the lock. What stops it after the lock is the trigger, not the absence of the
-- policy -- see the note there.
drop policy if exists "unplot your own course" on public.radar_picks;
create policy "unplot your own course" on public.radar_picks
  for delete to authenticated using (
    exists (select 1 from public.rsvps r
            where r.id = radar_picks.picker_rsvp and r.profile_id = auth.uid())
  );

-- ── The lock ───────────────────────────────────────────────────────────────
-- "LOCKS AT 17:30 · NO EDITS AFTER."
--
-- On INSERT, UPDATE **and DELETE**. The delete arm is the one that is easy to
-- forget and the one that breaks the promise: without it a member who is about
-- to be revealed as a mutual anchor at 19:00 can quietly delete the pick at
-- 18:59 and the other side's anchor evaporates. "No edits" that only covers
-- writes is not a lock, it is a one-way ratchet.
--
-- And it lives here rather than in a disabled button, because the button is
-- decoration: PostgREST exposes /rest/v1/radar_picks to any signed-in member
-- with curl.
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

comment on function public.hold_the_radar_lock() is
  'The 17:15 open, the 17:30 lock covering DELETE as well as INSERT, the aboard predicate, and the three-slot ceiling under an advisory lock.';

drop trigger if exists radar_picks_hold_the_lock on public.radar_picks;
create trigger radar_picks_hold_the_lock
  before insert or update or delete on public.radar_picks
  for each row execute function public.hold_the_radar_lock();

-- What staff may know about picks: how many, never who. Aggregate only, and no
-- pick_count of 1 can be resolved to a person because the picker is not in the
-- output at all.
create or replace view public.radar_activity
with (security_invoker = off) as
select r.voyage_id, count(*) as picks_plotted, count(distinct r.picker_rsvp) as passes_plotting
from public.radar_picks r
group by r.voyage_id;

comment on view public.radar_activity is
  'Counts for the Bridge. Deliberately has no picker and no picked column — staff get the volume, never the rows.';

grant select on public.radar_activity to authenticated;;
