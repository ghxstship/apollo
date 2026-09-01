-- ---- accept_pass_transfer ----------------------------------------------------
-- A composition sailing keeps its pass with its member (the taker's segment is
-- nobody's to guess); a pass on installments stays until it is paid; a guest
-- who signed is detached, not deleted (the signature pins the row); the
-- taker's own queued row on the sailing steps aside; and the taker's charge is
-- split so the deposit part is a deposit — the one kind the completion return
-- looks for. Money the giver had on the pass through an active plan cannot be
-- half-moved, so the plan blocks the hand-off with the reason.
do $$
declare
  src text := pg_get_functiondef('public.accept_pass_transfer(uuid)'::regprocedure);
  a text;
begin
  a := $a$  -- One pass to a member on a sailing. Say so rather than letting the unique$a$;
  if position(a in src) = 0 then raise exception 'anchor: one pass'; end if;
  src := replace(src, a, $a$  if exists (select 1 from public.voyage_segment_caps c where c.voyage_id = v.id) then
    raise exception 'a pass on a composition sailing stays with its member — release it and the line runs in order';
  end if;
  if exists (select 1 from public.installment_plans ip where ip.rsvp_id = t.rsvp_id and ip.status = 'active') then
    raise exception 'a pass on installments stays until it is paid — settle the draws, then hand it on';
  end if;
  -- The taker's own queued row on this sailing steps aside for the seat.
  delete from public.rsvps r where r.voyage_id = v.id and r.profile_id = t.to_profile and r.status <> 'aboard';

  -- One pass to a member on a sailing. Say so rather than letting the unique$a$);

  a := $a$  delete from public.rsvp_guests where rsvp_id = t.rsvp_id;$a$;
  if position(a in src) = 0 then raise exception 'anchor: guests'; end if;
  src := replace(src, a, $a$  update public.rsvp_guests set rsvp_id = null where rsvp_id = t.rsvp_id;$a$);

  a := $a$    values (t.from_profile, net, 'credit', 'Pass handed to a member — ' || v.title, v.id, t.rsvp_id),
           (t.to_profile, -net, 'berth', 'Pass taken over — ' || v.title, v.id, t.rsvp_id);$a$;
  if position(a in src) = 0 then raise exception 'anchor: settlement rows'; end if;
  src := replace(src, a, $a$    values (t.from_profile, net, 'credit', 'Pass handed to a member — ' || v.title, v.id, t.rsvp_id);
    dep_part := least(net, case when v.deposit_required then v.deposit_cents else 0 end);
    if dep_part > 0 then
      insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id)
      values (t.to_profile, -dep_part, 'deposit', 'Pass deposit — taken over, credited to the galley aboard', v.id, t.rsvp_id);
    end if;
    if net - dep_part > 0 then
      insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id)
      values (t.to_profile, -(net - dep_part), 'berth', 'Pass taken over — ' || v.title, v.id, t.rsvp_id);
    end if;$a$);

  a := $a$declare t record; v record; net int; cap int; m text; holder uuid; holder_status rsvp_status; new_code text;$a$;
  if position(a in src) = 0 then raise exception 'anchor: declare'; end if;
  src := replace(src, a, $a$declare t record; v record; net int; cap int; m text; holder uuid; holder_status rsvp_status; new_code text; dep_part int;$a$);
  execute src;
end $$;

-- ---- guard_pass_transfer: 'void' is the accept path's word alone -------------
do $$
declare
  src text := pg_get_functiondef('public.guard_pass_transfer()'::regprocedure);
  a text := $a$    if new.status = 'cancelled' and old.from_profile <> auth.uid() then$a$;
begin
  if position(a in src) = 0 then raise exception 'anchor: cancelled'; end if;
  src := replace(src, a, $a$    if new.status = 'void'
       and coalesce(current_setting('app.accepting_pass', true), 'off') <> 'on' then
      raise exception 'an offer is voided by the hand-off that spends it, not by hand';
    end if;
    if new.status = 'cancelled' and old.from_profile <> auth.uid() then$a$);
  execute src;
end $$;

-- ---- decide_a_proposal: a ruling is given once ------------------------------
do $$
declare
  src text := pg_get_functiondef('public.decide_a_proposal(uuid, text, text)'::regprocedure);
  a text := $a$   where id = p_id
  returning * into pr;
  if pr.id is null then raise exception 'no such proposal on the books'; end if;$a$;
begin
  if position(a in src) = 0 then raise exception 'anchor: where'; end if;
  src := replace(src, a, $a$   where id = p_id and status in ('submitted', 'considering')
  returning * into pr;
  if pr.id is null then raise exception 'that proposal has been ruled on already, or never stood'; end if;$a$);
  execute src;
end $$;

-- ---- claim_a_daybed: the terms are the product's, the count is of passes ----
create or replace function public.claim_a_daybed(p_rsvp uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  prod record;
  v record;
  taken integer;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if not public.is_active() then raise exception 'your membership is paused'; end if;

  select rv.id, rv.voyage_id, rv.profile_id, rv.status into r
  from public.rsvps rv where rv.id = p_rsvp and rv.profile_id = auth.uid();
  if r.id is null then raise exception 'that pass is not yours to build on'; end if;
  if r.status <> 'aboard' then
    raise exception 'a daybed rides an approved pass — board first';
  end if;
  if exists (select 1 from public.voyage_daybeds d where d.rsvp_id = r.id) then
    raise exception 'the daybed is already yours on this sailing';
  end if;

  select status, starts_at, format into v from public.voyages where id = r.voyage_id;
  if v.status not in ('scheduled', 'live', 'weather_hold') or v.starts_at <= now() then
    raise exception 'the daybed is claimed before the boat leaves, on a sailing that is still to come';
  end if;
  if v.format is not null and exists (
    select 1 from public.activity_formats f where f.slug = v.format and f.category <> 'sea'
  ) then
    raise exception 'the bow daybed is on the boat — this one is ashore';
  end if;

  select price_cents, coalesce(per_sailing_cap, 2) as cap, coalesce(party_size, 4) as party into prod
  from public.club_products where slug = 'vip_daybed' and active;
  if prod.price_cents is null then raise exception 'the daybed is off the shelf this season'; end if;

  perform pg_advisory_xact_lock(hashtext('daybed:' || r.voyage_id::text));

  select count(*) into taken
  from public.voyage_daybeds d join public.rsvps x on x.id = d.rsvp_id
  where d.voyage_id = r.voyage_id and x.status = 'aboard';
  if taken >= prod.cap then
    raise exception '% daybed groups a sailing — all are spoken for', prod.cap;
  end if;

  insert into public.voyage_daybeds (voyage_id, rsvp_id, profile_id)
  values (r.voyage_id, r.id, r.profile_id);

  insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id, created_by)
  values (r.profile_id, -prod.price_cents, 'addon', 'Bow daybed — group of ' || prod.party, r.voyage_id, r.id, r.profile_id);
end $$;

-- ---- the numbered line: an aboard member is not in it -----------------------
create or replace function public.number_the_waitlist()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if exists (select 1 from public.rsvps r where r.voyage_id = new.voyage_id
             and r.profile_id = new.profile_id and r.status = 'aboard') then
    raise exception 'you already hold a pass on this sailing — the line is for those who do not';
  end if;
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

-- ---- offer_the_next_place: the window from settings, the hull checked -------
do $$
declare
  src text := pg_get_functiondef('public.offer_the_next_place(uuid, text)'::regprocedure);
  a text;
begin
  a := $a$  if units >= ceiling then
    raise exception '% seats, % taken — there is nothing to offer', ceiling, units;
  end if;$a$;
  if position(a in src) = 0 then raise exception 'anchor: units'; end if;
  src := replace(src, a, $a$  if units >= ceiling then
    raise exception '% seats, % taken — there is nothing to offer', ceiling, units;
  end if;
  -- The segment has room; does the hull? A couple offered a place the head
  -- count cannot hold is told to hurry and then refused at the gate.
  if public.passes_left(p_voyage) < public.segment_heads(p_segment) then
    raise exception 'the segment has a place but the hull is full — nothing to offer until a pass is released';
  end if;$a$);

  a := $a$  set offered_at = now(), claim_expires_at = now() + interval '6 hours'$a$;
  if position(a in src) = 0 then raise exception 'anchor: 6h'; end if;
  src := replace(src, a, $a$  set offered_at = now(), claim_expires_at = now() + make_interval(hours => public.club_setting('waitlist_claim_hours'))$a$);

  a := $a$          'You are first in line and the seat is yours for six hours. After that it passes to the next in line.');$a$;
  if position(a in src) = 0 then raise exception 'anchor: six hours copy'; end if;
  src := replace(src, a, $a$          'You are first in line and the seat is yours for ' || public.club_setting('waitlist_claim_hours') || ' hours. After that it passes to the next in line.');$a$);
  execute src;
end $$;

-- ---- hold_a_cabin_on_option: the window from settings, the hull on the sailing
do $$
declare
  src text := pg_get_functiondef('public.hold_a_cabin_on_option(uuid, uuid)'::regprocedure);
  a text;
begin
  a := $a$  if v_cabin.id is null then raise exception 'no such cabin'; end if;$a$;
  if position(a in src) = 0 then raise exception 'anchor: no such cabin'; end if;
  src := replace(src, a, $a$  if v_cabin.id is null then raise exception 'no such cabin'; end if;
  if not exists (
    select 1 from public.voyage_vessels vv join public.cabins c on c.vessel_id = vv.vessel_id
    where vv.voyage_id = p_voyage and c.id = p_cabin
  ) then
    raise exception 'that cabin is on a hull that is not sailing this passage';
  end if;$a$);
  a := $a$  v_until := now() + interval '72 hours';$a$;
  if position(a in src) = 0 then raise exception 'anchor: 72h'; end if;
  src := replace(src, a, $a$  v_until := now() + make_interval(hours => public.club_setting('cabin_option_hours'));$a$);
  execute src;
end $$;

-- ---- guard_cabin_capacity: the cabin must be on a hull sailing this passage --
do $$
declare
  src text := pg_get_functiondef('public.guard_cabin_capacity()'::regprocedure);
  a text := $a$  if cap is null then raise exception 'no such cabin'; end if;$a$;
begin
  if position(a in src) = 0 then raise exception 'anchor: cap null'; end if;
  src := replace(src, a, $a$  if cap is null then raise exception 'no such cabin'; end if;
  if not exists (
    select 1 from public.voyage_vessels vv join public.cabins c on c.vessel_id = vv.vessel_id
    where vv.voyage_id = new.voyage_id and c.id = new.cabin_id
  ) then
    raise exception 'that cabin is on a hull that is not sailing this passage';
  end if;$a$);
  execute src;
end $$;

-- ---- the rest of the literals, read from settings ---------------------------
do $$
declare src text; a text;
begin
  src := pg_get_functiondef('public.claim_table_seat(uuid)'::regprocedure);
  a := $a$  do update set held_until = now() + interval '15 minutes'$a$;
  if position(a in src) = 0 then raise exception 'anchor: 15m'; end if;
  src := replace(src, a, $a$  do update set held_until = now() + make_interval(mins => public.club_setting('seat_hold_minutes'))$a$);
  execute src;

  src := pg_get_functiondef('public.settle_the_match_guarantee()'::regprocedure);
  a := $a$  select r.profile_id, 15000, 'credit',$a$;
  if position(a in src) = 0 then raise exception 'anchor: 15000'; end if;
  src := replace(src, a, $a$  select r.profile_id, public.club_setting('match_guarantee_cents'), 'credit',$a$);
  a := $a$'That happens, and it is on us. A $150 credit is already on your next sailing — no form, no request.'$a$;
  if position(a in src) = 0 then raise exception 'anchor: $150'; end if;
  src := replace(src, a, $a$'That happens, and it is on us. A $' || (public.club_setting('match_guarantee_cents') / 100) || ' credit is already on your next sailing — no form, no request.'$a$);
  execute src;

  src := pg_get_functiondef('public.guard_the_pause_budget()'::regprocedure);
  a := $a$  if v_used >= 90 then$a$;
  if position(a in src) = 0 then raise exception 'anchor: 90'; end if;
  src := replace(src, a, $a$  if v_used >= public.club_setting('pause_days_a_year') then$a$);
  execute src;

  src := pg_get_functiondef('public.reissue_member_number(uuid, text)'::regprocedure);
  a := $a$  if v_rel.released_at > now() - interval '90 days' then
    raise exception 'that number is still held until %',
      to_char((v_rel.released_at + interval '90 days') at time zone 'America/New_York', 'Mon DD');$a$;
  if position(a in src) = 0 then raise exception 'anchor: 90 days'; end if;
  src := replace(src, a, $a$  if v_rel.released_at > now() - make_interval(days => public.club_setting('member_number_hold_days')) then
    raise exception 'that number is still held until %',
      to_char((v_rel.released_at + make_interval(days => public.club_setting('member_number_hold_days'))) at time zone public.club_zone(), 'Mon DD');$a$);
  execute src;

  src := pg_get_functiondef('public.accept_application(uuid)'::regprocedure);
  a := $a$      values (inv.inviter_id, 250, 'Referral signature — ' || a.full_name || ' came aboard');$a$;
  if position(a in src) = 0 then raise exception 'anchor: 250'; end if;
  src := replace(src, a, $a$      values (inv.inviter_id, public.club_setting('referral_knots'), 'Referral signature — ' || a.full_name || ' came aboard');$a$);
  a := $a$      values (inv.inviter_id, 'fathoms', '250 fathoms — your signature held.',$a$;
  if position(a in src) = 0 then raise exception 'anchor: 250 title'; end if;
  src := replace(src, a, $a$      values (inv.inviter_id, 'fathoms', public.club_setting('referral_knots') || ' knots — your signature held.',$a$);
  execute src;

  -- attach_addons: the 18:00 wall the evening before was enforced only in TS.
  src := pg_get_functiondef('public.attach_addons(uuid, uuid[], integer)'::regprocedure);
  a := $a$  for r in
    select a.id, a.name, a.price_cents, rv.voyage_id$a$;
  if position(a in src) = 0 then raise exception 'anchor: addons loop'; end if;
  src := replace(src, a, $a$  if exists (
    select 1 from public.rsvps rv join public.voyages v on v.id = rv.voyage_id
    where rv.id = p_rsvp
      and now() > ((date_trunc('day', v.starts_at at time zone coalesce(nullif(btrim(v.time_zone), ''), 'UTC'))
                    - interval '1 day' + make_interval(hours => public.club_setting('addon_cutoff_hour')))
                   at time zone coalesce(nullif(btrim(v.time_zone), ''), 'UTC'))
  ) then
    raise exception 'add-ons closed at %:00 the evening before — the galley has its numbers', public.club_setting('addon_cutoff_hour');
  end if;

  for r in
    select a.id, a.name, a.price_cents, rv.voyage_id$a$);
  execute src;
end $$;

-- ---- sponsor_credits: the retainer's dates, the rate card's order -----------
create or replace function public.sponsor_credits(p_voyage uuid)
returns table (name text, tier text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select s.name, s.tier
  from public.voyage_sponsors vs
  join public.sponsors s on s.id = vs.sponsor_id
  join public.sponsor_tiers st on st.slug = s.tier
  join public.voyages v on v.id = vs.voyage_id
  where vs.voyage_id = p_voyage and s.active
    and (s.starts_on is null or s.starts_on <= (v.starts_at at time zone coalesce(nullif(btrim(v.time_zone), ''), 'UTC'))::date)
    and (s.ends_on is null or s.ends_on >= (v.starts_at at time zone coalesce(nullif(btrim(v.time_zone), ''), 'UTC'))::date)
  order by st.position, s.name;
$$;

-- ---- member_league from the leagues table -----------------------------------
create or replace view public.member_league as
 select p.id as profile_id,
        case when not (public.viewer_is_staff() or p.id = auth.uid() or (p.in_directory and p.status = 'active'))
             then null::integer else l.league end as league,
        case when not (public.viewer_is_staff() or p.id = auth.uid() or (p.in_directory and p.status = 'active'))
             then null::text else l.name end as league_name
 from public.profiles p
 left join lateral (
   select lg.league, lg.name from public.leagues lg
   where p.joined_at <= now() - make_interval(months => lg.months)
   order by lg.months desc limit 1
 ) l on true
 where auth.uid() is not null;

-- ---- profiles.tier follows the plan ------------------------------------------
-- handle_subscription_status moves plan_id and never tier; the two agreed by
-- luck. The tier is the plan's geography when the plan has one.
create or replace function public.tier_follows_the_plan()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare pt text;
begin
  if new.plan_id is distinct from old.plan_id and new.plan_id is not null then
    select plan_type into pt from public.membership_plans where id = new.plan_id;
    if pt in ('regional', 'national', 'global') then
      new.tier := pt::public.membership_tier;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.tier_follows_the_plan() from public, anon, authenticated;
create trigger tier_follows_the_plan
  before update of plan_id on public.profiles
  for each row execute function public.tier_follows_the_plan();;
