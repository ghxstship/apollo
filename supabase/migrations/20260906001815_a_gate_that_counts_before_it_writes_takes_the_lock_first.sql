-- Found by firing N genuinely simultaneous callers at every limited resource in
-- the schema and reading the invariant back. Twenty-two of twenty-six held —
-- every seat, every berth, every knot, every code — because each of those takes
-- an advisory lock before it counts, or lets a unique index answer.
--
-- These four did not. All four are the same shape: ask how many there are, then
-- write one more, with nothing holding the answer still in between.

-- 1 ── The Producer's turn budget.
-- 19 turns spent of 20, 8 members asking at one instant: 26 turns recorded and
-- 7 accepted where one place was left. Every caller counted 19 before any of
-- them wrote. The lock is on the member, so two people asking at once never
-- wait on each other.
create or replace function public.take_a_producer_turn()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare me uuid := auth.uid(); recent int; cap int := 20;
begin
  if me is null then raise exception 'sign in first'; end if;

  /* The budget is counted and spent under one lock, or it is not a budget.
     Keyed on the member: this serialises one person's own tabs, never two
     different people. */
  perform pg_advisory_xact_lock(hashtext('producer:' || me::text));

  delete from public.producer_turns where asked_at < now() - interval '1 day';

  select count(*) into recent
  from public.producer_turns
  where profile_id = me and asked_at > now() - interval '10 minutes';

  if recent >= cap then
    raise exception 'the Producer needs a moment — try again in a few minutes';
  end if;

  insert into public.producer_turns (profile_id) values (me);
  return cap - recent - 1;
end;
$fn$;

-- 2 ── The application pacing gates.
-- Eight applications from one address against a pacing of three: six to eight
-- landed. On the real path a partial unique index caps open applications at
-- one, so what was actually exposed is the per-address and per-origin hourly
-- counter — which is the arm that exists to stop a campaign, and it counted
-- without holding anything.
create or replace function public.pace_the_applications()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare who text; from_here int; for_this_address int;
begin
  who := coalesce(
    nullif(split_part(
      coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1), ''),
    'unknown'
  );

  /* Both counters are read and written under the address's own lock. Two
     different applicants do not queue behind one another. */
  perform pg_advisory_xact_lock(hashtext('apply:' || lower(btrim(new.email))));

  delete from public.status_lookups where looked_at < now() - interval '1 hour';

  select count(*) into for_this_address
  from public.status_lookups
  where fingerprint = 'apply-email:' || lower(btrim(new.email))
    and looked_at > now() - interval '1 hour';

  select count(*) into from_here
  from public.status_lookups
  where fingerprint = 'apply-from:' || who
    and looked_at > now() - interval '1 hour';

  -- Three is a person who mistyped and tried again. It is not a campaign.
  if for_this_address >= 3 then
    raise exception 'an application from that address is already with Shoreside — give it a little time'
      using errcode = '53400';
  end if;

  -- Loose, because on the legitimate path this counts the web server rather
  -- than the applicant. It still bounds the direct-to-PostgREST path, which is
  -- the one an attacker uses.
  if from_here >= 150 then
    raise exception 'too many applications from there just now — give it a few minutes'
      using errcode = '53400';
  end if;

  insert into public.status_lookups (fingerprint) values ('apply-email:' || lower(btrim(new.email)));
  insert into public.status_lookups (fingerprint) values ('apply-from:' || who);
  return new;
end $fn$;

create or replace function public.pace_the_crew_applications()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare who text; from_here int; for_this_address int;
begin
  who := coalesce(
    nullif(split_part(
      coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1), ''),
    'unknown'
  );

  perform pg_advisory_xact_lock(hashtext('crew-apply:' || lower(btrim(new.email))));

  delete from public.status_lookups where looked_at < now() - interval '1 hour';

  select count(*) into for_this_address
  from public.status_lookups
  where fingerprint = 'crew-email:' || lower(btrim(new.email))
    and looked_at > now() - interval '1 hour';

  select count(*) into from_here
  from public.status_lookups
  where fingerprint = 'crew-from:' || who
    and looked_at > now() - interval '1 hour';

  -- Higher than the member gate: there are four roles, and a candidate who
  -- wants two of them is not a campaign.
  if for_this_address >= 5 then
    raise exception 'we have your applications — give them a little time'
      using errcode = '53400';
  end if;

  if from_here >= 150 then
    raise exception 'too many applications from there just now — give it a few minutes'
      using errcode = '53400';
  end if;

  insert into public.status_lookups (fingerprint) values ('crew-email:' || lower(btrim(new.email)));
  insert into public.status_lookups (fingerprint) values ('crew-from:' || who);
  return new;
end $fn$;

-- 3 ── One standing offer per pass.
-- The rule was written in TypeScript — select the standing offers, refuse,
-- then insert — over an index that was not unique. Eight simultaneous offers,
-- eight stood. The seat itself was never at risk (accepting is locked, and
-- eight simultaneous acceptances still yield one holder), so the harm is N
-- members each told a pass is theirs and N-1 later meeting "no offer to
-- accept". The database says it now.
drop index if exists public.pass_transfers_open_offer_idx;
create unique index pass_transfers_open_offer_idx
  on public.pass_transfers (rsvp_id) where (status = 'offered');

-- 4 ── One live membership per member.
-- Nothing pinned it: subscriptions was unique on the Stripe id alone, and the
-- subscribe route carries no idempotency key where the checkout route does.
-- Eight subscriptions for one member, all live — two tabs bill dues twice.
-- Zero rows violate this today.
create unique index if not exists subscriptions_one_live_per_member
  on public.subscriptions (profile_id)
  where (status in ('active','trialing','past_due','paused'));

comment on index public.subscriptions_one_live_per_member is
  'A member holds one live membership. Statuses outside this set are history and may repeat.';;
