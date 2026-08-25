-- The ratio gate, in the database, because a gate enforced in a React component
-- is a suggestion. operations.md §2: "The ratio engine is a gate, not a
-- guideline: it refuses sales that would break composition." The vetting kit's
-- capacity panel is the authoritative arithmetic -- "40 PASSENGERS · 20/20 WITH
-- SINGLES CAPPED 10 AND 10 · OR 10 COUPLES PLUS 20 SINGLES" -- and its specimen
-- checks out: 10 women + 8 men + 8 couples = 34 of 40. README §5's "10 couples
-- plus 10 singles" is 30 heads on a 40-seat hull and is wrong; it is not encoded
-- here.
--
-- Three segment caps and one head cap. There are no "compositions": at full
-- occupancy the caps give 10/10/10 = 40 heads, and "20 singles split evenly"
-- falls out of the two singles caps rather than being a rule of its own.

-- ── Where the segment lives ────────────────────────────────────────────────
-- On the PASS, not on the profile, and this is the load-bearing decision of the
-- whole module.
--
-- A column on `profiles` would mean every member of this club has to state a
-- gender to have an account -- to read the Open Deck, to hold a Shop order, to
-- exist. Nobody should have to answer that question to be a member. On the pass
-- it is asked exactly once, at the moment it is operationally needed: buying a
-- SINGLE seat on a sailing whose singles are capped. A member who only ever
-- takes couple passes never states one, because a couple is gender-blind by the
-- kit's own rule ("Couples plot course as one pin and appear as one anchor").
--
-- It also makes "a couple is one unit worth two heads" structural. The couple's
-- partner is not a second row and not a `guests` count -- it is the weight of
-- this row. Radar then keys on `rsvps.id` and gets "one pin per couple" for
-- free, instead of a UI filter over `profiles` that the next surface forgets.
--
-- Nullable, deliberately. 46 live passes predate this column and there is no
-- data on earth from which to derive their segment; a NOT NULL would force a
-- fabricated backfill about real people's genders. The hole that leaves is
-- closed at the gate instead: a sailing that HAS caps refuses a pass with no
-- segment, so null is only ever legal where the ratio does not apply.
alter table public.rsvps add column if not exists segment text;

alter table public.rsvps drop constraint if exists rsvps_segment_check;
alter table public.rsvps add constraint rsvps_segment_check
  check (segment is null or segment in ('single_woman', 'single_man', 'couple'));

comment on column public.rsvps.segment is
  'Ratio segment for this pass on a ratio-gated sailing: single_woman | single_man | couple. Null where the sailing has no segment caps. A couple is one row worth two heads; it carries no gender.';

-- ── The caps, per sailing ──────────────────────────────────────────────────
-- Per sailing rather than a constant, because 10/10/10 is a product decision and
-- Art Basel week will not honour it. The presence of ANY row here is what makes
-- a sailing ratio-gated -- there is no separate boolean to fall out of sync with
-- the caps it is supposed to describe.
create table if not exists public.voyage_segment_caps (
  voyage_id uuid not null references public.voyages(id) on delete cascade,
  segment   text not null check (segment in ('single_woman', 'single_man', 'couple')),
  cap       integer not null check (cap >= 0),
  primary key (voyage_id, segment)
);

comment on table public.voyage_segment_caps is
  'Per-sailing segment ceilings. A sailing with rows here is ratio-gated; one without is not. Singles count in heads, couples in units.';

alter table public.voyage_segment_caps enable row level security;

-- Guest-facing by design: the vetting kit's capacity panel is a GUEST surface,
-- and its standing rule is "CAPACITY IS SHOWN BY SEGMENT, NEVER AS ONE NUMBER".
-- A member cannot be shown remaining seats by segment if the ceilings are staff
-- only, so the ceilings are public. The counts they are compared against come
-- from a definer view below, not from `rsvps`.
drop policy if exists "segment caps are public" on public.voyage_segment_caps;
create policy "segment caps are public" on public.voyage_segment_caps
  for select to public using (true);

drop policy if exists "staff set the composition" on public.voyage_segment_caps;
create policy "staff set the composition" on public.voyage_segment_caps
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ── What a guest may read of the manifest ──────────────────────────────────
-- `rsvps` is "own passes or staff", so a member counting seats by segment
-- through PostgREST reads their own row and nothing else. This view is the
-- counting surface: aggregate only, one row per (sailing, segment), no member
-- identities, no way to ask who is aboard. Security invoker would inherit the
-- rsvps policy and return the member's own pass as the whole manifest, which is
-- worse than useless -- it reads as "1 of 10" on a full sailing.
create or replace view public.voyage_segment_capacity
with (security_invoker = off) as
select
  c.voyage_id,
  c.segment,
  c.cap,
  coalesce(t.units, 0) as units,
  greatest(c.cap - coalesce(t.units, 0), 0) as remaining
from public.voyage_segment_caps c
left join (
  select voyage_id, segment, count(*) as units
  from public.rsvps
  where status = 'aboard' and segment is not null
  group by voyage_id, segment
) t on t.voyage_id = c.voyage_id and t.segment = c.segment;

comment on view public.voyage_segment_capacity is
  'Seats by segment for a guest-facing capacity panel: units taken, cap, remaining. Aggregate only -- it can say a segment is full and can never say who filled it.';

grant select on public.voyage_segment_capacity to anon, authenticated;

-- ── The gate ───────────────────────────────────────────────────────────────
-- A separate trigger rather than an edit to rsvp_guard(). rsvp_guard is 90 lines
-- that eight other things depend on and another agent is working in this
-- database today; a new trigger adds the rule without a single character of risk
-- to the tier, allowance, window and capacity logic already in there. It fires
-- after rsvp_guard_check on the same BEFORE row (alphabetical order: "rsvp_g" <
-- "rsvp_r") and takes the SAME advisory lock key, so the two nest in one
-- transaction rather than contending.
create or replace function public.guard_the_ratio()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  gated   boolean;
  ceiling integer;
  units   integer;
  heads   integer;
  weight  integer;
  hull    integer;
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

  -- Everything below counts and then acts on the count. Same key rsvp_guard
  -- takes, so two people reaching for the last seat in a segment serialise.
  perform pg_advisory_xact_lock(hashtext('voyage:' || new.voyage_id::text));

  select cap into ceiling from public.voyage_segment_caps
  where voyage_id = new.voyage_id and segment = new.segment;
  if ceiling is null then
    raise exception 'this sailing does not seat that segment';
  end if;

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

  return new;
end $$;

comment on function public.guard_the_ratio() is
  'Segment caps and the head cap, under the sailing advisory lock. Applies to staff as well as members: raising a cap is a decision with a row, walking past it is not.';

drop trigger if exists rsvp_ratio_gate on public.rsvps;
create trigger rsvp_ratio_gate
  before insert or update of status, segment, guests on public.rsvps
  for each row execute function public.guard_the_ratio();

-- ── The waitlist ───────────────────────────────────────────────────────────
-- rsvp_status already has a 'waitlist' value, and it cannot carry this: it has
-- no order, no segment, and nowhere to hold a six-hour claim. The kit is
-- specific -- "POSITION 01 · SINGLE WOMEN", "You get six hours to claim it, then
-- it passes to position two" -- and position is per segment, because a woman
-- waiting on a full women's segment is not behind a man waiting on his.
create table if not exists public.waitlist_entries (
  id               uuid primary key default gen_random_uuid(),
  voyage_id        uuid not null references public.voyages(id) on delete cascade,
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  segment          text not null check (segment in ('single_woman', 'single_man', 'couple')),
  place            integer not null check (place > 0),
  joined_at        timestamptz not null default now(),
  offered_at       timestamptz,
  claim_expires_at timestamptz,
  claimed_at       timestamptz,
  released_at      timestamptz,
  unique (voyage_id, profile_id)
);

comment on table public.waitlist_entries is
  'Ordered waitlist per sailing and segment, with a six-hour claim. Place is per segment: a full women''s segment does not queue behind a full men''s.';

create index if not exists waitlist_entries_queue
  on public.waitlist_entries (voyage_id, segment, place)
  where released_at is null and claimed_at is null;

alter table public.waitlist_entries enable row level security;

drop policy if exists "your place in line" on public.waitlist_entries;
create policy "your place in line" on public.waitlist_entries
  for select to authenticated using (profile_id = auth.uid() or public.is_staff());

drop policy if exists "join the line yourself" on public.waitlist_entries;
create policy "join the line yourself" on public.waitlist_entries
  for insert to authenticated with check (profile_id = auth.uid() and public.is_active());

drop policy if exists "leave the line yourself" on public.waitlist_entries;
create policy "leave the line yourself" on public.waitlist_entries
  for delete to authenticated using (profile_id = auth.uid() or public.is_staff());

drop policy if exists "staff work the line" on public.waitlist_entries;
create policy "staff work the line" on public.waitlist_entries
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- Place is assigned by the database, never by the client. A client-supplied
-- place is a client-supplied position in a queue, and two members refreshing the
-- same full sailing would both compute the same number.
create or replace function public.number_the_waitlist()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform pg_advisory_xact_lock(hashtext('waitlist:' || new.voyage_id::text || ':' || new.segment));
  select coalesce(max(place), 0) + 1 into new.place
  from public.waitlist_entries
  where voyage_id = new.voyage_id and segment = new.segment;
  new.offered_at := null;
  new.claim_expires_at := null;
  new.claimed_at := null;
  new.released_at := null;
  return new;
end $$;

drop trigger if exists waitlist_takes_its_number on public.waitlist_entries;
create trigger waitlist_takes_its_number
  before insert on public.waitlist_entries
  for each row execute function public.number_the_waitlist();;
