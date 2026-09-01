/* The itinerary, as rows instead of as `voyages.itinerary jsonb`.

   The charter kit's one-pager is a list of dated legs under a standing
   disclaimer: weather may revise any leg, and the crew posts changes by 08:00
   daily. Untyped JSON can hold the list. It cannot hold the revision — there is
   nothing to timestamp, nothing to point the new leg back at, and no way to say
   which of five legs is held. `itinerary` stays exactly where it is and keeps
   feeding the guest-facing charter card; this is the operational record.

   THE HOLD HERE IS NOT `voyages.status = 'weather_hold'`, and the two must
   never be collapsed. Apollo's hold is a SAILING held for conditions: it fires
   handle_voyage_status(), which notifies every aboard and waitlisted member
   honouring notification_prefs->>'weather', queues the weather-hold letter,
   notifies again on lift, and on the adjacent cancel branch posts a full
   account credit. A whole migration exists to keep that meaning clean
   (3af60d6). The kit's hold moves ONE LEG of a passage that is otherwise
   running: "Cabrera leg moves to tomorrow. We stay alongside in Palma tonight.
   Dinner is still at 21:00." Holding the sailing to move one leg would send
   real mail to real members about an event that did not stop. */
create table public.voyage_legs (
  id uuid primary key default gen_random_uuid(),
  voyage_id uuid not null references public.voyages(id) on delete cascade,
  day smallint not null check (day >= 1),
  port text not null,
  note text,
  /* Absolute, because a leg that has been posted has been posted at an instant
     and a later edit to voyages.time_zone must not move it. */
  starts_at timestamptz,
  status text not null default 'planned' check (status in ('planned', 'revised', 'held')),
  hold_reason text,
  hold_new_plan text,
  hold_unchanged text,
  hold_posted_at timestamptz,
  /* "Crew posts changes by 08:00 daily" needs something to timestamp. */
  posted_at timestamptz not null default now(),
  revised_from uuid references public.voyage_legs(id) on delete set null,
  unique (voyage_id, day),
  /* For the composite foreign key on voyage_stops — a stop cannot belong to a
     leg of a different sailing, and that is a key, not a trigger. */
  unique (voyage_id, id),

  /* The kit's copy rule, as a constraint. "Holds state the reason, the new
     plan, and what is unchanged — in that order." The third field is the one
     that gets dropped, and it is the one that does the work: a member reading
     that their leg moved wants to know dinner is still at 21:00. A hold posted
     with two of the three is a notice that creates a question instead of
     answering one, so the database will not store it. */
  constraint a_hold_states_the_reason_the_plan_and_what_is_unchanged check (
    status <> 'held' or (
      length(btrim(coalesce(hold_reason, ''))) > 0
      and length(btrim(coalesce(hold_new_plan, ''))) > 0
      and length(btrim(coalesce(hold_unchanged, ''))) > 0
      and hold_posted_at is not null
    )
  ),
  /* And the other way, so lifting a hold actually clears it. Without this a
     lifted leg keeps rendering yesterday's amber notice. */
  constraint a_leg_that_is_not_held_carries_no_hold_copy check (
    status = 'held' or (
      hold_reason is null and hold_new_plan is null
      and hold_unchanged is null and hold_posted_at is null
    )
  )
);

/* The port guide card — 4×6, one per stop. A stop is not a leg: a leg can have
   none (an open-water night passage), and the kit draws the card as its own
   printed artefact with its own tender and last-return times. Times are `time`
   and not `timestamptz` because the card is read in harbour-local 24-hour clock
   and the same card is reprinted every season. */
create table public.voyage_stops (
  id uuid primary key default gen_random_uuid(),
  voyage_id uuid not null references public.voyages(id) on delete cascade,
  leg_id uuid,
  position smallint not null check (position >= 1),
  name text not null,
  tender_at time,
  last_return time,
  notes text,
  unique (voyage_id, position),
  /* Composite, so a stop can never be filed under a leg of another sailing.
     The single-column version of this FK admits exactly that mistake and the
     only thing that would catch it is a person reading the printed card. */
  foreign key (voyage_id, leg_id) references public.voyage_legs (voyage_id, id) on delete cascade
);

alter table public.voyage_legs enable row level security;
alter table public.voyage_stops enable row level security;

/* Voyages are public in this app and an itinerary is the guest-facing artefact
   of one, so legs and stops read the same way. Anon and authenticated are
   separate policies because security_report() refuses a policy anon can reach
   that calls is_staff(). */
create policy "legs are anon-readable" on public.voyage_legs
  for select to anon using (true);
create policy "cast and crew read legs" on public.voyage_legs
  for select to authenticated using (true);
create policy "staff post legs" on public.voyage_legs
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "stops are anon-readable" on public.voyage_stops
  for select to anon using (true);
create policy "cast and crew read stops" on public.voyage_stops
  for select to authenticated using (true);
create policy "staff post stops" on public.voyage_stops
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

revoke insert, update, delete on public.voyage_legs from anon;
revoke insert, update, delete on public.voyage_stops from anon;

/* What the cabin card prints and the schema could not say. `voyages.muster` is
   one text field for the whole sailing; the card is a door plate and names the
   muster station for THAT cabin. The safe code is deliberately absent — the kit
   prints "SET ON BOARD", and a safe code in a row that a member can read is a
   safe code that is not a safe code. */
alter table public.cabins add column deck text;
alter table public.cabins add column side text check (side is null or side in ('port', 'starboard', 'centre'));
alter table public.cabins add column muster text;
;
