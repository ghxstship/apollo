-- Show: the crew's operating surface. Three things that were prose and are now
-- rows -- the run of show, the deck state, and the elements catalogue -- plus the
-- one rule in the whole module that has to be a write policy rather than a
-- component: the anonymity blur.

-- ── The deck state ─────────────────────────────────────────────────────────
-- A column, not a table. "ONE FLAG FLIES AT A TIME" is exactly a single-valued
-- column; a table of hoisted flags would permit two, which is the one thing the
-- kit forbids. Nullable because no flag flying is a real answer -- the sailing
-- has not started.
--
-- Deliberately NOT folded into voyage_status. That enum is a lifecycle
-- (scheduled/live/weather_hold/completed/cancelled) and 'stand_by' overlaps
-- 'weather_hold' without being it: a weather hold is a sailing held for
-- conditions and has a whole migration insisting it means nothing else, while
-- STAND BY is a flag the crew raises for two minutes because a swimmer is out of
-- the perimeter.
alter table public.voyages add column if not exists deck_state text;
alter table public.voyages drop constraint if exists voyages_deck_state_check;
alter table public.voyages add constraint voyages_deck_state_check
  check (deck_state is null or deck_state in ('underway', 'anchored', 'stand_by', 'ceremony'));

comment on column public.voyages.deck_state is
  'The signal flag currently flying: underway | anchored | stand_by | ceremony. Null is no flag. Rides the public voyages select policy — guests are meant to read it.';

-- ── The run of show ────────────────────────────────────────────────────────
-- voyages.itinerary is jsonb, and untyped JSON cannot be filtered on
-- critical_path, which is precisely what element-schema.md says the Show Kit
-- does with the board. Rows instead; itinerary stays what it is for the
-- guest-facing one-pager, which is a different artefact.
--
-- Times as `time`, not timestamptz. The board is read in the harbour's own
-- 24-hour clock and the same eight windows are reused every week; a timestamptz
-- would make each week's board a different object and would put a date on a
-- template.
create table if not exists public.run_of_show (
  id            uuid primary key default gen_random_uuid(),
  voyage_id     uuid not null references public.voyages(id) on delete cascade,
  position      smallint not null,
  window_start  time not null,
  window_end    time,
  stage         text not null,
  cue           text not null,
  staff_lead    text,
  sound         text,
  bpm           smallint check (bpm is null or bpm between 40 and 220),
  five_a        text check (five_a is null or five_a in ('arrival','atmosphere','appetite','activity','afterglow')),
  critical_path boolean not null default false,
  unique (voyage_id, position)
);

comment on table public.run_of_show is
  'The bridge board: eight windows per sailing, each with a stage, an operational cue, a lead, a sound cue and a critical-path flag. Crew surface.';

alter table public.run_of_show enable row level security;

drop policy if exists "the board is the crew's" on public.run_of_show;
create policy "the board is the crew's" on public.run_of_show
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- The eight canonical windows from operations.md §2, so a new sailing's board is
-- the run of show rather than an empty table someone retypes at 06:00.
create or replace function public.seed_the_run_of_show(p_voyage uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare seeded integer;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;

  insert into public.run_of_show
    (voyage_id, position, window_start, window_end, stage, cue, staff_lead, sound, bpm, five_a, critical_path)
  values
    (p_voyage, 1, '11:00', '12:00', 'Pre-Boarding Social',
     'ID scan, waiver verification, drink passes', 'Host / Marina Lead', 'Lounge', 115, 'arrival', false),
    (p_voyage, 2, '12:00', '12:45', 'Boarding and Casting',
     'Pass validation, Preference Sheet confirm, safety briefing', 'Chief Vibe Stew and Dock Crew', 'Deep house', 118, 'arrival', true),
    (p_voyage, 3, '12:45', '14:00', 'Departure and Cruise',
     'Hoist signal flag, consent briefing, open Pod queue, ring bell', 'MC and Media Team', 'Vocal house', 122, 'atmosphere', true),
    (p_voyage, 4, '14:00', '16:00', 'Sandbar and Challenges',
     'Deploy floating hub, safety perimeter, SPF stations, run heats', 'Marine Safety and Challenge Leads', 'Pool sets', 125, 'activity', true),
    (p_voyage, 5, '16:00', '17:00', 'Water Lounge',
     'Lifeguards on perimeter, media captures hero content', 'Resident DJ and Safety Crew', 'Melodic', 124, 'activity', false),
    (p_voyage, 6, '17:00', '18:00', 'Sunset Cruise',
     'Radar locks 17:30, tally the picks, Match of the Day, champagne', 'MC and App Tech Lead', 'Golden hour', null, 'afterglow', true),
    (p_voyage, 7, '18:00', '18:30', 'Dock and Transition',
     'Distribute Captain''s Log envelopes, Sprinter transfers', 'GM and Transport Lead', 'Lounge outro', null, 'afterglow', true),
    (p_voyage, 8, '19:00', null, 'Shore Leave',
     'VIP tables, reserved lounge, sponsor drink package', 'Shore Leave Lead / Host', 'Peak club', null, 'afterglow', false)
  on conflict (voyage_id, position) do nothing;
  get diagnostics seeded = row_count;
  return seeded;
end $$;

revoke all on function public.seed_the_run_of_show(uuid) from public, anon;
grant execute on function public.seed_the_run_of_show(uuid) to authenticated;

-- ── The elements catalogue ─────────────────────────────────────────────────
-- element-schema.md says a Claude Code export "should treat these field names as
-- the canonical column set", so these are its field names in its order, with no
-- renaming and no tidying. `client_visible` and `critical_path` are 0/1 smallint
-- rather than boolean because the Data Kit SUMS them.
create table if not exists public.elements (
  id               uuid primary key default gen_random_uuid(),
  element_id       text not null unique,
  urid             text not null check (urid ~ '^\d{4}\.\d{2}\.\d{3}$'),
  name             text not null,
  department       text not null check (department in ('3000 Marketing','4000 Build','5000 Production','8000 Hospitality')),
  discipline       text not null,
  category         text not null,
  kind             text not null check (kind in ('equipment','uniform','consumable','credential')),
  tier             text not null check (tier in ('04 Physical','05 Experiential')),
  phase            text not null check (phase in ('Install','Operate','Strike')),
  grain            text not null check (grain in ('class','instance')),
  element_state    text not null default 'Draft' check (element_state in ('Active','Draft','Retired')),
  specifications   text not null,
  uom              text not null,
  qty              numeric not null check (qty >= 0),
  unit_cost_usd    numeric not null check (unit_cost_usd >= 0),
  total_cost_usd   numeric,
  price_confidence text not null check (price_confidence in ('QUOTED','PUBLISHED','BENCHMARKED')),
  sense            text,
  five_a           text not null check (five_a in ('arrival','atmosphere','appetite','activity','afterglow')),
  client_visible   smallint not null default 0 check (client_visible in (0,1)),
  critical_path    smallint not null default 0 check (critical_path in (0,1)),
  weather          text not null check (weather in ('waterproof_marine','all_weather','indoor_only')),
  -- "URID first segment matches the department number." One line here; a
  -- sentence in a markdown table everywhere else, which is how 4000.01.101 ends
  -- up filed under 8000 Hospitality and a budget rollup quietly moves $1,200
  -- between departments.
  constraint element_urid_matches_department check (left(urid, 4) = left(department, 4))
);

comment on table public.elements is
  'The XPMS3 element catalogue, column-for-column from element-schema.md. Two orthogonal axes: five_a (when in the guest day) and weather (what it survives).';

-- total_cost_usd is NOT generated: element-schema.md notes a quote can be for a
-- bundle whose arithmetic does not reduce to the unit price. Defaulted to the
-- product when nobody says otherwise, so the common case cannot be typed wrong.
create or replace function public.total_an_element()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.total_cost_usd is null then
    new.total_cost_usd := new.qty * new.unit_cost_usd;
  end if;
  return new;
end $$;

drop trigger if exists an_element_totals_itself on public.elements;
create trigger an_element_totals_itself
  before insert or update on public.elements
  for each row execute function public.total_an_element();

alter table public.elements enable row level security;

drop policy if exists "the catalogue is the crew's" on public.elements;
create policy "the catalogue is the crew's" on public.elements
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create table if not exists public.element_substitutes (
  element_id            uuid not null references public.elements(id) on delete cascade,
  substitute_element_id uuid references public.elements(id) on delete cascade,
  context               text not null,
  primary key (element_id, context)
);

comment on table public.element_substitutes is
  'What runs instead when an element cannot. `context` is the named plan and is required — "moved indoors" is not a substitute on a boat, and a substitute row with no words in it is a box someone ticked.';

alter table public.element_substitutes enable row level security;

drop policy if exists "substitutes are the crew's" on public.element_substitutes;
create policy "substitutes are the crew's" on public.element_substitutes
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- README §5: "an indoor_only element in an activity phase with no named
-- substitute is a specification error." The Activity phase is the sandbar --
-- paddleboard heats, the ring raft hub -- and it is the two hours of the day
-- furthest from a roof. The difference between a mis-specified element and the
-- Confessional Pod's own genuinely-indoor interior is whether anyone has said
-- what happens when the weather turns.
--
-- A CONSTRAINT trigger, deferred to commit, because the element and its
-- substitute are two inserts and a non-deferred check would refuse the first one
-- for not yet having the second. Registered on both tables so that deleting the
-- substitute is caught as well as never writing it.
create or replace function public.an_indoor_element_names_its_substitute()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  offender text;
begin
  select e.element_id into offender
  from public.elements e
  where e.five_a = 'activity'
    and e.weather = 'indoor_only'
    and e.element_state = 'Active'
    and not exists (
      select 1 from public.element_substitutes s
      where s.element_id = e.id and btrim(s.context) <> ''
    )
  limit 1;

  if offender is not null then
    raise exception '% is indoor_only in the activity phase with no named substitute',
      offender using errcode = 'check_violation';
  end if;
  return null;
end $$;

drop trigger if exists indoor_activity_needs_a_substitute on public.elements;
create constraint trigger indoor_activity_needs_a_substitute
  after insert or update on public.elements
  deferrable initially deferred
  for each row execute function public.an_indoor_element_names_its_substitute();

drop trigger if exists indoor_activity_keeps_its_substitute on public.element_substitutes;
create constraint trigger indoor_activity_keeps_its_substitute
  after delete or update on public.element_substitutes
  deferrable initially deferred
  for each row execute function public.an_indoor_element_names_its_substitute();

-- ── The Confessional Pod queue ─────────────────────────────────────────────
create table if not exists public.pod_sessions (
  id            uuid primary key default gen_random_uuid(),
  voyage_id     uuid not null references public.voyages(id) on delete cascade,
  rsvp_id       uuid not null references public.rsvps(id) on delete cascade,
  position      smallint not null,
  state         text not null default 'waiting'
                  check (state in ('waiting','ready','recording','done','skipped')),
  blur_required boolean not null default false,
  vip_priority  boolean not null default false,
  started_at    timestamptz,
  ended_at      timestamptz,
  duration_s    smallint check (duration_s is null or (duration_s > 0 and duration_s <= 90)),
  unique (voyage_id, position),
  unique (voyage_id, rsvp_id)
);

comment on table public.pod_sessions is
  'The Confessional Pod queue on the crew tablet. 90 seconds is a check; voluntary is the absence of a compulsion and is not a constraint.';

alter table public.pod_sessions enable row level security;

-- A member may read their own row -- they were recorded, and a recording someone
-- cannot confirm exists is not consent. They may not write it: the queue is the
-- crew's, and the one field a member controls is controlled from the Preference
-- Sheet, which is where it belongs.
drop policy if exists "your own pod session, or the crew's" on public.pod_sessions;
create policy "your own pod session, or the crew's" on public.pod_sessions
  for select to authenticated using (
    public.is_staff() or exists (
      select 1 from public.rsvps r where r.id = pod_sessions.rsvp_id and r.profile_id = auth.uid()
    )
  );

drop policy if exists "the queue is the crew's" on public.pod_sessions;
create policy "the queue is the crew's" on public.pod_sessions
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Where the blur comes from. One function, so the Pod, the media approval gate
-- and any future export path all ask the same question and cannot drift.
--
-- Three sources, any one of which is a yes: the Preference Sheet boundary, the
-- standing on_camera flag, and a withdrawal after the fact. camera_withdrawn_at
-- is included because consent withdrawn later is consent withdrawn.
create or replace function public.blur_is_required(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select true from public.preference_boundaries b
     where b.profile_id = p_profile and b.topic = 'photographed' and b.stance = 'never'),
    (select not p.on_camera or p.camera_withdrawn_at is not null
     from public.profiles p where p.id = p_profile),
    false
  );
$$;

comment on function public.blur_is_required(uuid) is
  'The anonymity state, from the Preference Sheet boundary, the on_camera flag, or a later withdrawal. The single source the Pod queue and the media gate both read.';

-- "BLUR REQUESTED IS SET FROM THE PREFERENCE SHEET AND CANNOT BE OVERRIDDEN ON
-- DECK." That is a statement about write authority, so it is a trigger and not a
-- disabled toggle on a crew tablet.
--
-- A ratchet, not an overwrite. It can only ever go up: the Preference Sheet
-- raises it, a guest asking the crew in person on the day raises it, and nothing
-- lowers it — not a crew edit, not a later sheet change, not a re-queue. A guest
-- who asked for anonymity is never shown unblurred in any cut, so the state has
-- to survive every subsequent write to the row.
create or replace function public.a_pod_session_keeps_its_blur()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  owner uuid;
begin
  select r.profile_id into owner from public.rsvps r where r.id = new.rsvp_id;
  new.blur_required :=
    public.blur_is_required(owner)
    or coalesce(new.blur_required, false)
    or (tg_op = 'UPDATE' and coalesce(old.blur_required, false));
  return new;
end $$;

drop trigger if exists a_pod_session_keeps_its_blur on public.pod_sessions;
create trigger a_pod_session_keeps_its_blur
  before insert or update on public.pod_sessions
  for each row execute function public.a_pod_session_keeps_its_blur();;
