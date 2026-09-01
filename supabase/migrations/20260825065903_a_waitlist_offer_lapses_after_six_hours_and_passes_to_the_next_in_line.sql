-- "You get six hours to claim it, then it passes to position two."
--
-- Lazy expiry, not a cron sweep, and the reason is the same one claim_table_seat
-- was written for: a scheduler that is down turns a six-hour hold into an
-- indefinite one, and the member in position two never finds out there was a
-- seat. Here the stale offers are released inside the same advisory lock that
-- the next read takes, so the rule is correct on the first call after the
-- deadline whether or not anything ran at midnight.

create or replace function public.lapse_stale_waitlist_offers(p_voyage uuid, p_segment text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  lapsed integer;
begin
  update public.waitlist_entries
  set released_at = now()
  where voyage_id = p_voyage and segment = p_segment
    and claimed_at is null and released_at is null
    and claim_expires_at is not null and claim_expires_at <= now();
  get diagnostics lapsed = row_count;
  return lapsed;
end $$;

comment on function public.lapse_stale_waitlist_offers(uuid, text) is
  'Releases waitlist offers whose six hours have run out. Called inside the queue lock by anything that reads the queue, so the deadline holds without a scheduler.';

-- Internal only: the callers below take the lock first, and an unlocked call
-- from PostgREST would race exactly the read it is meant to protect.
revoke all on function public.lapse_stale_waitlist_offers(uuid, text) from public, anon, authenticated;

-- ── Offering the seat ──────────────────────────────────────────────────────
create or replace function public.offer_the_next_place(p_voyage uuid, p_segment text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  next_up record;
  ceiling integer;
  units   integer;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;

  perform pg_advisory_xact_lock(hashtext('waitlist:' || p_voyage::text || ':' || p_segment));
  perform public.lapse_stale_waitlist_offers(p_voyage, p_segment);

  -- An offer against a segment that is not actually short is how a member gets
  -- written to once, told to hurry, and then refused at the gate six hours
  -- later. Check the room exists before promising it.
  select cap into ceiling from public.voyage_segment_caps
  where voyage_id = p_voyage and segment = p_segment;
  if ceiling is null then raise exception 'this sailing does not seat that segment'; end if;

  select count(*) into units from public.rsvps
  where voyage_id = p_voyage and status = 'aboard' and segment = p_segment;
  if units >= ceiling then
    raise exception '% seats, % taken — there is nothing to offer', ceiling, units;
  end if;

  select * into next_up from public.waitlist_entries
  where voyage_id = p_voyage and segment = p_segment
    and claimed_at is null and released_at is null and offered_at is null
  order by place
  limit 1;

  if next_up.id is null then return null; end if;

  update public.waitlist_entries
  set offered_at = now(), claim_expires_at = now() + interval '6 hours'
  where id = next_up.id;

  -- "If a seat opens we write once." One notice, no reminder chain -- the whole
  -- comms map in operations.md is one message per trigger.
  insert into public.notifications (profile_id, kind, title, body)
  values (next_up.profile_id, 'word', 'A seat opened',
          'You are first in line and the seat is yours for six hours. After that it passes to the next in line.');

  return next_up.id;
end $$;

comment on function public.offer_the_next_place(uuid, text) is
  'Offers the open seat to position one in that segment, for six hours, with one notice and no reminders.';

-- ── Claiming it ────────────────────────────────────────────────────────────
create or replace function public.claim_your_place(p_entry uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  e record;
  new_pass uuid;
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;

  select * into e from public.waitlist_entries where id = p_entry;
  if e.id is null then raise exception 'no such place in line'; end if;
  if e.profile_id <> auth.uid() then raise exception 'that place in line is not yours'; end if;

  perform pg_advisory_xact_lock(hashtext('waitlist:' || e.voyage_id::text || ':' || e.segment));
  perform public.lapse_stale_waitlist_offers(e.voyage_id, e.segment);

  select * into e from public.waitlist_entries where id = p_entry;
  if e.claimed_at is not null then raise exception 'that seat is already yours'; end if;
  if e.offered_at is null then raise exception 'nothing has opened yet — the line runs in order'; end if;
  if e.released_at is not null then
    raise exception 'the six hours ran out and the seat passed to the next in line';
  end if;

  -- The seat is taken by inserting a real pass, which means it goes through the
  -- ratio gate and the vetting gate like any other sale. If the composition
  -- moved while the offer was out, this raises and the whole claim rolls back --
  -- including the claimed_at below -- rather than recording a seat that the
  -- manifest does not have.
  insert into public.rsvps (voyage_id, profile_id, status, segment)
  values (e.voyage_id, e.profile_id, 'aboard', e.segment)
  returning id into new_pass;

  update public.waitlist_entries set claimed_at = now() where id = p_entry;
  return new_pass;
end $$;

comment on function public.claim_your_place(uuid) is
  'Turns an offered waitlist place into a pass, through the same gates as any sale. A composition that moved under the offer refuses here rather than seating a passenger the hull does not have.';

revoke all on function public.offer_the_next_place(uuid, text) from public, anon;
grant execute on function public.offer_the_next_place(uuid, text) to authenticated;
revoke all on function public.claim_your_place(uuid) from public, anon;
grant execute on function public.claim_your_place(uuid) to authenticated;;
