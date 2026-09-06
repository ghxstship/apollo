-- Three places where the invariant held but the refusal did not read like one.
-- Every one of them was found by firing eight simultaneous callers at it: the
-- database stopped the second write, correctly, and then handed the member
-- 'duplicate key value violates unique constraint "..."' — a sentence written
-- for a database administrator, in a product where every other refusal is
-- written for the person reading it.
--
-- Losing a race is not an error. It is one of the two ordinary outcomes of
-- asking for the last of something, and it should say so.

-- 1 ── claim_a_daybed asked "is it already yours?" BEFORE it took the lock.
-- Two taps at one instant both saw no daybed, both went on, and the unique
-- index on rsvp_id stopped the second with a raw constraint name. The check
-- moves inside the lock, where the answer cannot change underneath it — and
-- the member who tapped twice is told the daybed is theirs, which it is.
create or replace function public.claim_a_daybed(p_pass uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  r record;
  prod record;
  v record;
  taken integer;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if not public.is_active() then raise exception 'your membership is paused'; end if;

  select rv.id, rv.episode_id, rv.profile_id, rv.status into r
  from public.passes rv where rv.id = p_pass and rv.profile_id = auth.uid();
  if r.id is null then raise exception 'that pass is not yours to build on'; end if;
  if r.status <> 'aboard' then
    raise exception 'a daybed rides an approved pass — board first';
  end if;

  select status, starts_at, series into v from public.episodes where id = r.episode_id;
  if v.status not in ('scheduled', 'live', 'weather_hold') or v.starts_at <= now() then
    raise exception 'the daybed is claimed before the boat leaves, on an episode that is still to come';
  end if;
  if v.series is not null and exists (
    select 1 from public.series f where f.slug = v.series and f.category <> 'sea'
  ) then
    raise exception 'the bow daybed is on the boat — this one is ashore';
  end if;

  select price_cents, coalesce(per_sailing_cap, 2) as cap, coalesce(party_size, 4) as party into prod
  from public.club_products where slug = 'vip_daybed' and active;
  if prod.price_cents is null then raise exception 'the daybed is off the shelf this season'; end if;

  perform pg_advisory_xact_lock(hashtext('daybed:' || r.episode_id::text));

  /* Inside the lock, because outside it the answer changes between the asking
     and the writing — which is exactly how a second tap reached the unique
     index instead of this sentence. */
  if exists (select 1 from public.episode_daybeds d where d.rsvp_id = r.id) then
    raise exception 'the daybed is already yours on this episode';
  end if;

  select count(*) into taken
  from public.episode_daybeds d join public.passes x on x.id = d.rsvp_id
  where d.episode_id = r.episode_id and x.status = 'aboard';
  if taken >= prod.cap then
    raise exception '% daybed groups an episode — all are spoken for', prod.cap;
  end if;

  insert into public.episode_daybeds (episode_id, rsvp_id, profile_id)
  values (r.episode_id, r.id, r.profile_id);

  insert into public.account_ledger (profile_id, delta_cents, kind, memo, episode_id, rsvp_id, created_by)
  values (r.profile_id, -prod.price_cents, 'addon', 'Bow daybed — group of ' || prod.party, r.episode_id, r.id, r.profile_id);
end $fn$;

-- 2 ── issue_wallet_token is meant to be idempotent: ask twice, get the same
-- token. It was select-then-insert, so two tabs both found nothing and both
-- inserted, and the loser met the unique index rather than the token the
-- winner had just made. Losing that race now means reading the answer.
create or replace function public.issue_wallet_token()
returns table(token uuid, profile_id uuid, issued_at timestamp with time zone, revoked_at timestamp with time zone, touched_at timestamp with time zone)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  return query
    select t.token, t.profile_id, t.issued_at, t.revoked_at, t.touched_at
      from public.wallet_tokens t
     where t.profile_id = v_uid and t.revoked_at is null;
  if found then return; end if;

  begin
    return query
      insert into public.wallet_tokens as w (profile_id)
      values (v_uid)
      returning w.token, w.profile_id, w.issued_at, w.revoked_at, w.touched_at;
  exception when unique_violation then
    /* Another tab asked in the same instant and won. It made the token this
       call was about to make, so the answer is that one — a member asking
       twice for one pass is not an error, it is the same question. */
    return query
      select t.token, t.profile_id, t.issued_at, t.revoked_at, t.touched_at
        from public.wallet_tokens t
       where t.profile_id = v_uid and t.revoked_at is null;
  end;
end;
$fn$;

-- 3 ── reissue_member_number checks that nobody carries the number and then
-- writes it. Between those two an operator on another screen can take it, and
-- the unique index on profiles.member_no answers in Postgres. It says it in
-- the Bridge's own voice now, and names the thing that happened.
create or replace function public.reissue_member_number(p_profile uuid, p_number text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_rel record;
  v_holder uuid;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;

  select * into v_rel from public.member_number_releases where member_no = p_number;
  if v_rel.member_no is null then
    raise exception 'that number was never given up';
  end if;
  if v_rel.reissued_at is not null then
    raise exception 'that number is already carried by someone else';
  end if;
  if v_rel.released_at > now() - make_interval(days => public.club_setting('member_number_hold_days')) then
    raise exception 'that number is still held until %',
      to_char((v_rel.released_at + make_interval(days => public.club_setting('member_number_hold_days'))) at time zone public.club_zone(), 'Mon DD');
  end if;

  select id into v_holder from public.profiles where member_no = p_number and id <> p_profile;
  if v_holder is not null then
    raise exception 'that number is still on a member record';
  end if;

  begin
    update public.profiles set member_no = p_number where id = p_profile;
  exception when unique_violation then
    raise exception 'that number was taken while this was open — read it again before giving it out';
  end;

  update public.member_number_releases
     set reissued_at = now(), reissued_to = p_profile
   where member_no = p_number;
end;
$fn$;;
