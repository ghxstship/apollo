-- Two tables that look alike and are opposites. The vetting file is the CLUB's
-- record of an applicant and the member may not write a word of it; the
-- Preference Sheet is the MEMBER's own statement and the club may not answer for
-- them. Getting that backwards is how a background state becomes editable by the
-- person it is about, and how a boundary becomes a crew preference.

-- ── The vetting file ───────────────────────────────────────────────────────
-- The kit's four background states live here. Note what is deliberately absent:
-- there is no `decline_reason`. "We do not explain declines" is not a copy rule
-- if the reason is sitting in a column waiting for a well-meaning surface to
-- render it, or for a subject-access request to disclose it.
--
-- There is also no date of birth. The kit says the ID "never leaves the vetting
-- file" and is deleted thirty days after the last sailing; storing a DOB to
-- re-derive "25-45" would keep the most re-identifying field in the record
-- forever to answer a question that reduces to one bit. `age_ok` is that bit.
create table if not exists public.vetting_files (
  id               uuid primary key default gen_random_uuid(),
  application_id   uuid references public.applications(id) on delete cascade,
  profile_id       uuid references public.profiles(id) on delete cascade,
  id_verified_at   timestamptz,
  id_purge_due     date,
  age_ok           boolean not null default false,
  background_state text not null default 'submitted'
                     check (background_state in ('submitted', 'needs_a_call', 'cleared', 'declined')),
  cleared_at       timestamptz,
  cleared_until    timestamptz,
  declined_at      timestamptz,
  interview_at     timestamptz,
  fast_track       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.vetting_files is
  'One file per applicant: identity, age predicate, the four background states, and the twelve-month clearance. Written by staff only. Carries no decline reason and no date of birth, by design.';

create unique index if not exists vetting_files_one_per_profile
  on public.vetting_files (profile_id) where profile_id is not null;
create unique index if not exists vetting_files_one_per_application
  on public.vetting_files (application_id) where application_id is not null;

alter table public.vetting_files enable row level security;

-- No member-facing policy at all. Not "select your own" -- the file carries the
-- interview date, the purge date and the state machine, and a member reading
-- their own row is one PostgREST call away from a surface that renders the lot.
-- What a member is owed is their STATE, and that comes from the narrow view
-- below.
drop policy if exists "the vetting file is the vetting team's" on public.vetting_files;
create policy "the vetting file is the vetting team's" on public.vetting_files
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- What an applicant is allowed to know about themselves: the state, whether age
-- and ID cleared, and when a lapse falls. Not the interview note, not the purge
-- schedule, not the row id. Same shape as own_counter_signature.
create or replace view public.own_vetting_state
with (security_invoker = off) as
select
  f.profile_id,
  f.background_state,
  f.age_ok,
  (f.id_verified_at is not null) as id_verified,
  f.cleared_until,
  f.interview_at,
  f.fast_track
from public.vetting_files f
where f.profile_id = auth.uid();

comment on view public.own_vetting_state is
  'A member''s own vetting state and nothing else. The file itself is staff-only; this is the half a member is owed.';

grant select on public.own_vetting_state to authenticated;

-- ── Clearance and fast-track, computed rather than typed ───────────────────
-- The kit: "Fast-track clearance is a membership benefit, never a purchasable
-- upgrade." A settable boolean makes that a rule enforced in whichever admin
-- form happens to be in front of someone; recomputing it on every write makes it
-- a rule at all. Whatever anyone submits in this column is discarded.
--
-- The twelve months are computed here too, for the same reason: "Good for 12
-- months across all formats" written by hand is twelve months until someone
-- types 2027 in the wrong box.
create or replace function public.settle_the_vetting_file()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  new.updated_at := now();

  new.fast_track := new.profile_id is not null and exists (
    select 1 from public.subscriptions s
    where s.profile_id = new.profile_id
      and s.status in ('active', 'trialing')
  );

  if new.background_state = 'cleared' then
    if new.cleared_at is null then new.cleared_at := now(); end if;
    new.cleared_until := new.cleared_at + interval '12 months';
    new.declined_at := null;
  elsif new.background_state = 'declined' then
    if new.declined_at is null then new.declined_at := now(); end if;
    new.cleared_at := null;
    new.cleared_until := null;
  else
    new.cleared_until := null;
  end if;

  return new;
end $$;

drop trigger if exists a_vetting_file_settles_itself on public.vetting_files;
create trigger a_vetting_file_settles_itself
  before insert or update on public.vetting_files
  for each row execute function public.settle_the_vetting_file();

-- ── The vetting gate on a seat ─────────────────────────────────────────────
-- The kit's funnel has six gates and "SEATED THIS SAILING" is the last of them,
-- below "BACKGROUND CLEARED". A sale that skips them is the whole product
-- failing quietly.
--
-- Scoped to ratio-gated sailings only, and that scope is load-bearing: applying
-- it to every voyage would refuse every booking on this database tomorrow
-- morning, because no live member has a vetting file yet. A sailing that has
-- opted into the composition has opted into the funnel that fills it.
create or replace function public.guard_the_vetting()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  f record;
begin
  if new.status <> 'aboard' then return new; end if;
  if not exists (
    select 1 from public.voyage_segment_caps c where c.voyage_id = new.voyage_id
  ) then return new; end if;

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
    raise exception 'your clearance lapsed on %  — the vetting team reopens it',
      to_char(f.cleared_until at time zone 'America/New_York', 'Mon DD');
  end if;

  return new;
end $$;

drop trigger if exists rsvp_vetting_gate on public.rsvps;
create trigger rsvp_vetting_gate
  before insert or update of status, segment on public.rsvps
  for each row execute function public.guard_the_vetting();

-- ── A decline is final, and saying so out loud is a leak ───────────────────
-- The kit: "We do not explain declines, and we do not reopen them." The obvious
-- implementation is a BEFORE INSERT that raises on a previously-declined
-- address. Do not do that. `applications` INSERT is open to `anon` -- that is
-- the public apply form -- so a refusal that fires only for declined addresses
-- turns an unauthenticated endpoint into an oracle: post any address, read the
-- error, learn whether that person was declined by this club. The club's own
-- status lookup is rate-limited to eight tries per address per ten minutes for
-- exactly this reason; a trigger would hand the same fact out for free.
--
-- So the application is accepted, and closed. The applicant is told what every
-- applicant is told; the funnel never reopens. AFTER INSERT rather than BEFORE
-- because the "anyone applies" policy pins status to 'received', and a BEFORE
-- trigger writing 'declined' would be refused by the very policy that lets the
-- form work.
create or replace function public.a_decline_stays_declined()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if exists (
    select 1 from public.applications a
    where a.id <> new.id
      and lower(btrim(a.email)) = lower(btrim(new.email))
      and a.status = 'declined'
  ) then
    update public.applications
    set status = 'declined', decided_at = coalesce(decided_at, now())
    where id = new.id;
  end if;
  return null;
end $$;

drop trigger if exists a_decline_stays_declined on public.applications;
create trigger a_decline_stays_declined
  after insert on public.applications
  for each row execute function public.a_decline_stays_declined();

-- ── The Preference Sheet ───────────────────────────────────────────────────
-- Three parts, and the kit is emphatic about who may read them: "used by the
-- vetting team and the Chief Vibe Stew", "never surfaced in Radar, never shown
-- to another guest". There is no crew-but-not-staff role in this schema --
-- `profiles.is_staff` is one boolean and `crew_roles` is an applicant-tracking
-- table, not an authorisation one -- so the Chief Vibe Stew reads these as
-- staff. That is a wider audience than the kit draws and it is written down here
-- rather than papered over.
create table if not exists public.preference_sheets (
  profile_id   uuid primary key references public.profiles(id) on delete cascade,
  drinks       text[] not null default '{}',
  flag_green   text check (flag_green is null or char_length(flag_green) <= 200),
  flag_red     text check (flag_red   is null or char_length(flag_red)   <= 200),
  completed_at timestamptz,
  updated_at   timestamptz not null default now()
);

comment on table public.preference_sheets is
  'Part 1 (drinks) and part 3 (green and red flags) of the Preference Sheet. Part 2 is preference_boundaries. Read by the member and by staff; never by another guest.';

alter table public.preference_sheets enable row level security;

drop policy if exists "your sheet, and the vetting team's" on public.preference_sheets;
create policy "your sheet, and the vetting team's" on public.preference_sheets
  for select to authenticated using (profile_id = auth.uid() or public.is_staff());

drop policy if exists "you answer for yourself" on public.preference_sheets;
create policy "you answer for yourself" on public.preference_sheets
  for insert to authenticated with check (profile_id = auth.uid() and public.is_active());

drop policy if exists "you may change your mind" on public.preference_sheets;
create policy "you may change your mind" on public.preference_sheets
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- No member DELETE. The sheet is an operational input to seating and to the
-- media team's shot list on a sailing that has already been planned around it;
-- a member who wants it gone wants their account gone, and that cascades.
drop policy if exists "staff clear a sheet" on public.preference_sheets;
create policy "staff clear a sheet" on public.preference_sheets
  for delete to authenticated using (public.is_staff());

-- Part 2. A child table rather than three columns because the kit draws
-- boundaries as a list, not a fixed set, and the next sailing will add one.
create table if not exists public.preference_boundaries (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  topic      text not null check (topic ~ '^[a-z][a-z0-9_]{1,40}$'),
  stance     text not null check (stance in ('never', 'ask_me', 'happy_to')),
  updated_at timestamptz not null default now(),
  primary key (profile_id, topic)
);

comment on table public.preference_boundaries is
  'Part 2 of the Preference Sheet. Topic is an open slug; the topic "photographed" is load-bearing — the Confessional Pod reads it as the blur flag and the crew cannot override it.';

alter table public.preference_boundaries enable row level security;

drop policy if exists "your boundaries, and the vetting team's" on public.preference_boundaries;
create policy "your boundaries, and the vetting team's" on public.preference_boundaries
  for select to authenticated using (profile_id = auth.uid() or public.is_staff());

drop policy if exists "you set your own boundaries" on public.preference_boundaries;
create policy "you set your own boundaries" on public.preference_boundaries
  for insert to authenticated with check (profile_id = auth.uid() and public.is_active());

drop policy if exists "you may move your own boundaries" on public.preference_boundaries;
create policy "you may move your own boundaries" on public.preference_boundaries
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists "you may drop a boundary" on public.preference_boundaries;
create policy "you may drop a boundary" on public.preference_boundaries
  for delete to authenticated using (profile_id = auth.uid() or public.is_staff());

-- ── Identity retention ─────────────────────────────────────────────────────
-- "ID IS DELETED 30 DAYS AFTER YOUR LAST SAILING." Two halves: work out when
-- that is, and then actually do it. Both live here because a retention promise
-- kept only in a support runbook is not kept.
--
-- Modelled on purge_expired_signatures: a sweep that is safe to run repeatedly
-- and needs no scheduler to be CORRECT, only to be timely.
create or replace function public.purge_spent_identity_records()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  swept integer;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;

  -- Recompute the due date from the member's own last completed sailing, so a
  -- member who sails again has their clock restarted rather than their record
  -- swept out from under a live booking.
  update public.vetting_files f
  set id_purge_due = (last_sail.d + interval '30 days')::date
  from (
    select r.profile_id, max(v.starts_at) as d
    from public.rsvps r join public.voyages v on v.id = r.voyage_id
    where r.status = 'aboard' and v.status = 'completed'
    group by r.profile_id
  ) last_sail
  where f.profile_id = last_sail.profile_id
    and f.id_verified_at is not null;

  update public.vetting_files
  set id_verified_at = null, id_purge_due = null
  where id_purge_due is not null and id_purge_due <= current_date;
  get diagnostics swept = row_count;

  return swept;
end $$;

comment on function public.purge_spent_identity_records() is
  'Clears the identity verification record thirty days after a member''s last completed sailing. Idempotent; safe to run on any schedule or none.';

revoke all on function public.purge_spent_identity_records() from public;
grant execute on function public.purge_spent_identity_records() to authenticated;;
