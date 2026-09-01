-- ---- passes_left: capacity said one way -------------------------------------
create or replace function public.passes_left(p_voyage uuid, p_except_rsvp uuid default null)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select v.berths_total - v.held_passes
       - coalesce((select sum(public.segment_heads(r.segment) + coalesce(r.guests, 0))
                   from public.rsvps r
                   where r.voyage_id = v.id and r.status = 'aboard'
                     and (p_except_rsvp is null or r.id <> p_except_rsvp)), 0)
  from public.voyages v where v.id = p_voyage
$$;
grant execute on function public.passes_left(uuid, uuid) to anon, authenticated;

create or replace view public.voyage_capacity as
 select v.id as voyage_id,
        v.berths_total,
        count(r.id) filter (where r.status = 'aboard') as aboard,
        count(r.id) filter (where r.status = 'waitlist') as waitlisted,
        greatest(public.passes_left(v.id), 0)::bigint as berths_left
 from public.voyages v
 left join public.rsvps r on r.voyage_id = v.id
 group by v.id, v.berths_total;

-- The pass meter read the month in UTC while the guard reads it on the
-- harbour's clock. Same type as before (timestamptz), harbour month inside.
create or replace view public.member_pass_usage as
 select r.profile_id,
        (date_trunc('month', v.starts_at at time zone coalesce(nullif(btrim(v.time_zone), ''), 'UTC'))
           at time zone coalesce(nullif(btrim(v.time_zone), ''), 'UTC')) as month,
        count(*)::integer as passes_used
 from public.rsvps r join public.voyages v on v.id = r.voyage_id
 where r.status = 'aboard'
 group by r.profile_id, 2;

-- ---- rsvp_guard --------------------------------------------------------------
do $$
declare
  src text := pg_get_functiondef('public.rsvp_guard()'::regprocedure);
  a text;
begin
  a := $a$  if new.status <> 'aboard' then return new; end if;$a$;
  if position(a in src) = 0 then raise exception 'anchor: early return'; end if;
  src := replace(src, a, $a$  -- The line and the drop are answered before the door: a waitlist on a
  -- segment sailing belongs in the numbered line on the vetting page, and a
  -- waitlist before the drop opens would never be promoted when it does.
  if new.status = 'waitlist' then
    if exists (select 1 from public.voyage_segment_caps c where c.voyage_id = new.voyage_id) then
      raise exception 'this sailing seats by segment — join the line on the vetting page';
    end if;
    select sale_opens_at, presale_hours, coalesce(nullif(btrim(time_zone), ''), 'UTC')
      into v_drop_at, v_presale, zone from public.voyages where id = new.voyage_id;
    if v_drop_at is not null then
      opens := v_drop_at - make_interval(hours => (public.tier_rank(member.tier) - 1) * v_presale);
      if now() < opens then
        raise exception 'the drop opens % for your tier — the line forms then',
          to_char(opens at time zone zone, 'Mon DD, HH24:MI');
      end if;
    end if;
  end if;

  if new.status <> 'aboard' then return new; end if;

  -- A pass already held, editing its guests or names: the door was answered
  -- when it boarded. Re-running the ladder here refused legitimate edits after
  -- a plan change or a hold the operator raised.
  if tg_op = 'UPDATE' and old.status = 'aboard' and old.profile_id = new.profile_id
     and old.voyage_id = new.voyage_id then
    return new;
  end if;$a$);

  a := $a$declare
  v record;$a$;
  if position(a in src) = 0 then raise exception 'anchor: declare'; end if;
  src := replace(src, a, $a$declare
  v record;
  v_drop_at timestamptz;
  v_presale integer;
  v_access text;$a$);

  a := $a$  if member.status <> 'active' then
    raise exception 'your membership is paused';
  end if;$a$;
  if position(a in src) = 0 then raise exception 'anchor: paused'; end if;
  src := replace(src, a, $a$  if member.status <> 'active' then
    raise exception 'your membership is paused';
  end if;

  -- The format's access mode means what the catalogue says it means.
  select f.access into v_access from public.activity_formats f where f.slug = v.format;
  if v_access = 'invite' then
    raise exception 'this one is by invitation — the Bridge seats it';
  elsif v_access = 'on_request' then
    raise exception 'this one is on request — enquire and the Bridge writes back';
  end if;$a$);

  a := $a$    tier_rank := case member.tier when 'regional' then 1 when 'national' then 2 else 3 end;
    min_rank := case v.min_tier when 'regional' then 1 when 'national' then 2 else 3 end;$a$;
  if position(a in src) = 0 then raise exception 'anchor: tier ranks'; end if;
  src := replace(src, a, $a$    tier_rank := public.tier_rank(member.tier);
    min_rank := public.tier_rank(v.min_tier);$a$);

  a := $a$      (case member.tier when 'regional' then 0 when 'national' then 1 else 2 end) * v.presale_hours);$a$;
  if position(a in src) = 0 then raise exception 'anchor: presale ranks'; end if;
  src := replace(src, a, $a$      (public.tier_rank(member.tier) - 1) * v.presale_hours);$a$);

  a := $a$  select count(*) into taken from public.rsvps
  where voyage_id = new.voyage_id and status = 'aboard' and id <> new.id;
  if taken >= v.berths_total - v.held_passes then
    raise exception 'the manifest is full — join the waitlist';
  end if;$a$;
  if position(a in src) = 0 then raise exception 'anchor: capacity'; end if;
  src := replace(src, a, $a$  if public.passes_left(new.voyage_id, new.id) < public.segment_heads(new.segment) + coalesce(new.guests, 0) then
    raise exception 'the manifest is full — join the waitlist';
  end if;$a$);
  execute src;
end $$;

drop trigger if exists rsvp_guard_check on public.rsvps;
create trigger rsvp_guard_check
  before insert or update of status, guests, segment, profile_id on public.rsvps
  for each row execute function public.rsvp_guard();

-- ---- guard_the_vetting -------------------------------------------------------
do $$
declare
  src text := pg_get_functiondef('public.guard_the_vetting()'::regprocedure);
  a text;
begin
  a := $a$  if not exists (
    select 1 from public.voyage_segment_caps c where c.voyage_id = new.voyage_id
  ) then return new; end if;$a$;
  if position(a in src) = 0 then raise exception 'anchor: caps gate'; end if;
  src := replace(src, a, $a$  if not exists (
    select 1 from public.voyage_segment_caps c where c.voyage_id = new.voyage_id
  ) and not exists (
    select 1 from public.voyages v
    where v.id = new.voyage_id and v.format is not null and public.a_pass_is_required(v.format)
  ) then return new; end if;$a$);

  a := $a$  if tg_op = 'UPDATE' and old.status = 'aboard' and old.voyage_id = new.voyage_id then
    return new;
  end if;$a$;
  if position(a in src) = 0 then raise exception 'anchor: already aboard'; end if;
  src := replace(src, a, $a$  if tg_op = 'UPDATE' and old.status = 'aboard' and old.voyage_id = new.voyage_id
     and old.profile_id = new.profile_id then
    return new;
  end if;$a$);

  a := $a$to_char(f.cleared_until at time zone 'America/New_York', 'Mon DD')$a$;
  if position(a in src) = 0 then raise exception 'anchor: zone'; end if;
  src := replace(src, a, $a$to_char(f.cleared_until at time zone public.club_zone(), 'Mon DD')$a$);
  execute src;
end $$;

drop trigger if exists rsvp_vetting_gate on public.rsvps;
create trigger rsvp_vetting_gate
  before insert or update of status, segment, profile_id on public.rsvps
  for each row execute function public.guard_the_vetting();

-- ---- guard_the_ratio: head weights from the segments table -----------------
do $$
declare
  src text := pg_get_functiondef('public.guard_the_ratio()'::regprocedure);
  a text;
begin
  a := $a$    weight := case when new.segment = 'couple' then 2 else 1 end;
    select coalesce(sum(case when segment = 'couple' then 2 else 1 end), 0) into heads$a$;
  if position(a in src) = 0 then raise exception 'anchor: weights'; end if;
  src := replace(src, a, $a$    weight := public.segment_heads(new.segment);
    select coalesce(sum(public.segment_heads(segment)), 0) into heads$a$);
  execute src;
end $$;

-- ---- the cabin premium on the way aboard --------------------------------------
create or replace function public.a_cabin_costs_its_premium()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  net integer;
  cab record;
  moved boolean;
  boarded boolean;
begin
  if new.status <> 'aboard' or coalesce(new.comp, false) then return new; end if;
  moved := tg_op = 'UPDATE' and old.cabin_id is distinct from new.cabin_id;
  boarded := tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.status <> 'aboard');
  if not moved and not boarded then return new; end if;

  if moved and old.cabin_id is not null then
    select coalesce(-sum(delta_cents), 0) into net
    from public.account_ledger
    where rsvp_id = new.id and memo like 'Cabin — %';
    if net > 0 then
      insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id, created_by)
      values (new.profile_id, net, 'credit', 'Cabin — given up', new.voyage_id, new.id, new.profile_id);
    end if;
  end if;

  if new.cabin_id is not null then
    select coalesce(-sum(delta_cents), 0) into net
    from public.account_ledger
    where rsvp_id = new.id and memo like 'Cabin — %';
    select c.name, c.premium_cents into cab from public.cabins c where c.id = new.cabin_id;
    if cab.premium_cents > 0 and net <= 0 then
      insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id, created_by)
      values (new.profile_id, -cab.premium_cents, 'addon', 'Cabin — ' || cab.name,
              new.voyage_id, new.id, new.profile_id);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists a_cabin_costs_its_premium on public.rsvps;
create trigger a_cabin_costs_its_premium
  before insert or update of cabin_id, status on public.rsvps
  for each row execute function public.a_cabin_costs_its_premium();

-- ---- the plan leaves with the pass, BEFORE the FK nulls its rsvp_id ---------
create or replace function public.a_pass_leaves_with_its_plan_cancelled()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.installment_plans
     set status = 'cancelled', next_charge_at = null
   where rsvp_id = old.id and status = 'active';
  return old;
end $$;
revoke execute on function public.a_pass_leaves_with_its_plan_cancelled() from public, anon, authenticated;
create trigger a_pass_leaves_with_its_plan_cancelled
  before delete on public.rsvps
  for each row execute function public.a_pass_leaves_with_its_plan_cancelled();

-- ---- handle_rsvp_release -----------------------------------------------------
do $$
declare
  src text := pg_get_functiondef('public.handle_rsvp_release()'::regprocedure);
  a text;
begin
  a := $a$      if credit_due > 0 and exists (select 1 from public.voyages v where v.id = old.voyage_id and v.starts_at - now() > interval '48 hours') then$a$;
  if position(a in src) = 0 then raise exception 'anchor: 48h'; end if;
  src := replace(src, a, $a$      select starts_at, title into v_sail from public.voyages where id = old.voyage_id;
      if credit_due > 0 and v_sail.starts_at - now() > make_interval(hours => public.club_setting('release_credit_hours')) then$a$);

  a := $a$      delete from public.rsvp_addons where rsvp_id = old.id;$a$;
  if position(a in src) = 0 then raise exception 'anchor: addons'; end if;
  src := replace(src, a, $a$      delete from public.rsvp_addons where rsvp_id = old.id;
      -- The daybed slot goes with the pass; its money came back with the credit
      -- above (or is forfeit inside the window, as the pass is).
      delete from public.voyage_daybeds where rsvp_id = old.id;$a$);

  a := $a$        if not coalesce(nextup.auto_claim, true) then$a$;
  if position(a in src) = 0 then raise exception 'anchor: toggle'; end if;
  src := replace(src, a, $a$        if not coalesce(nextup.auto_claim, true)
           or v_sail.starts_at - now() <= make_interval(hours => public.club_setting('release_credit_hours')) then$a$);

  a := $a$        exception when others then
          continue;
        end;$a$;
  if position(a in src) = 0 then raise exception 'anchor: swallow'; end if;
  src := replace(src, a, $a$        exception when others then
          -- Said, not swallowed: the member learns why the line moved past them.
          insert into public.notifications (profile_id, kind, title, body, voyage_id)
          values (nextup.profile_id, 'manifest', 'A pass opened, and the door said no: ' || v_sail.title,
                  regexp_replace(sqlerrm, '^[^:]*:\s*', '') || ' — the line moved on; your place in it stands.', old.voyage_id);
          continue;
        end;$a$);

  a := $a$declare
  nextup record; charges int; credits int; credit_due int; promoted record;$a$;
  if position(a in src) = 0 then raise exception 'anchor: declare'; end if;
  src := replace(src, a, $a$declare
  nextup record; charges int; credits int; credit_due int; promoted record; v_sail record;$a$);
  execute src;
end $$;

-- ---- knots reasons and awards, stated once ----------------------------------
do $$
declare
  src text; a text;
begin
  src := pg_get_functiondef('public.handle_rsvp_aboard()'::regprocedure);
  a := $a$      and reason in ('Berth confirmed','Pass confirmed','Pass released');$a$;
  if position(a in src) = 0 then raise exception 'anchor: aboard reasons'; end if;
  src := replace(src, a, $a$      and reason = any (public.knots_booking_reasons());$a$);
  a := $a$      values (new.profile_id, 25, 'Pass confirmed', new.voyage_id);$a$;
  if position(a in src) = 0 then raise exception 'anchor: aboard 25'; end if;
  src := replace(src, a, $a$      values (new.profile_id, public.club_setting('knots_pass_award'), 'Pass confirmed', new.voyage_id);$a$);
  execute src;

  src := pg_get_functiondef('public.return_knots_with_the_pass()'::regprocedure);
  a := $a$      and reason in ('Berth confirmed', 'Pass confirmed', 'Pass released', 'Sailing cancelled');$a$;
  if position(a in src) = 0 then raise exception 'anchor: return reasons'; end if;
  src := replace(src, a, $a$      and reason = any (public.knots_booking_reasons());$a$);
  a := $a$    if not exists (
      select 1 from public.fathoms_ledger
      where profile_id = new.profile_id and voyage_id = old.voyage_id
        and reason in ('Berth confirmed', 'Pass confirmed')
    ) then
      insert into public.fathoms_ledger (profile_id, delta, reason, voyage_id)
      values (new.profile_id, 25, 'Pass confirmed', old.voyage_id);$a$;
  if position(a in src) = 0 then raise exception 'anchor: handed award'; end if;
  src := replace(src, a, $a$    if (select coalesce(sum(delta), 0) from public.fathoms_ledger
        where profile_id = new.profile_id and voyage_id = old.voyage_id
          and reason = any (public.knots_booking_reasons())) <= 0 then
      insert into public.fathoms_ledger (profile_id, delta, reason, voyage_id)
      values (new.profile_id, public.club_setting('knots_pass_award'), 'Pass confirmed', old.voyage_id);$a$);
  execute src;

  src := pg_get_functiondef('public.return_knots_before_the_sailing_goes()'::regprocedure);
  a := $a$and f.reason in ('Berth confirmed', 'Pass confirmed', 'Pass released', 'Sailing cancelled')$a$;
  if position(a in src) = 0 then raise exception 'anchor: strike reasons'; end if;
  src := replace(src, a, $a$and f.reason = any (public.knots_booking_reasons())$a$);
  execute src;
end $$;;
