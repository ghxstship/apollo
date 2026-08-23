-- Two faults, one root: rsvp_guard returned immediately unless the row was
-- going 'aboard'.
--
-- 1. Guests were never checked on a waitlist row, so a National member could
--    hold guests = 2 — the thing "guest passes ride on Global memberships"
--    forbids. Guest count is a property of the pass, not of the moment it goes
--    aboard, so it is checked on every write now.
--
-- 2. handle_rsvp_release promotes the first waitlister with an UPDATE that
--    rsvp_guard is free to refuse. The raise happened inside the RELEASING
--    member's transaction, so their "Release pass" failed with a stranger's
--    error and the waitlist stopped moving for everyone behind them. The
--    promotion now steps over anyone the guard would refuse.
create or replace function public.rsvp_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v record; member record; plan record;
  taken int; used int; tier_rank int; min_rank int;
  ceiling_rank int; sub_rank int; opens timestamptz;
begin
  if public.is_staff() then return new; end if;

  select * into member from public.profiles where id = new.profile_id;

  if coalesce(new.guests, 0) > 0 and member.tier <> 'global' then
    raise exception 'guest passes ride on Global memberships';
  end if;
  if coalesce(new.guests, 0) > 2 then
    raise exception 'two guest passes per member';
  end if;

  if new.status <> 'aboard' then return new; end if;

  select * into v from public.voyages where id = new.voyage_id;
  select * into plan from public.membership_plans where id = member.plan_id;
  if member.status <> 'active' then
    raise exception 'membership is on hold';
  end if;
  tier_rank := case member.tier when 'regional' then 1 when 'national' then 2 else 3 end;
  min_rank := case v.min_tier when 'regional' then 1 when 'national' then 2 else 3 end;
  if tier_rank < min_rank then
    raise exception 'passes for this sailing open at % tier', v.min_tier;
  end if;
  if plan.id is not null and plan.class_ceiling is not null
     and v.sub_class in ('voyage','expedition','odyssey') then
    ceiling_rank := case plan.class_ceiling when 'voyage' then 1 when 'expedition' then 2 else 3 end;
    sub_rank := case v.sub_class when 'voyage' then 1 when 'expedition' then 2 else 3 end;
    if sub_rank > ceiling_rank then
      raise exception 'this sailing runs past your class tier — % passes open at a deeper tier', v.sub_class;
    end if;
  end if;
  if plan.id is not null and plan.events_per_month > 0 then
    select count(*) into used from public.rsvps r
    join public.voyages vv on vv.id = r.voyage_id
    where r.profile_id = new.profile_id and r.status = 'aboard' and r.id <> new.id
      and date_trunc('month', vv.starts_at) = date_trunc('month', v.starts_at);
    if used >= plan.events_per_month then
      raise exception 'monthly passes are spent — the ledger resets with the month';
    end if;
  end if;
  if plan.id is not null then
    opens := v.starts_at - make_interval(days => plan.early_days);
    if now() < opens then
      raise exception 'the window opens % for your tier', to_char(opens, 'Mon DD');
    end if;
  end if;
  select count(*) into taken from public.rsvps
  where voyage_id = new.voyage_id and status = 'aboard' and id <> new.id;
  if taken >= v.berths_total - v.held_passes then
    raise exception 'the manifest is full — join the waitlist';
  end if;
  return new;
end $function$;

create or replace function public.handle_rsvp_release()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  nextup record; charges int; credits int; credit_due int;
  promoted boolean := false;
begin
  if tg_op = 'DELETE' or (old.status = 'aboard' and new.status <> 'aboard') then
    if old.status = 'aboard' then
      select coalesce(-sum(delta_cents), 0) into charges
      from public.account_ledger
      where profile_id = old.profile_id and voyage_id = old.voyage_id
        and delta_cents < 0 and kind in ('berth','deposit','addon');
      select coalesce(sum(delta_cents), 0) into credits
      from public.account_ledger
      where profile_id = old.profile_id and voyage_id = old.voyage_id and kind = 'credit';
      credit_due := charges - credits;
      if credit_due > 0 and exists (select 1 from public.voyages v where v.id = old.voyage_id and v.starts_at - now() > interval '48 hours') then
        insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, created_by)
        values (old.profile_id, credit_due, 'credit', 'Pass released 48h+ out — full credit', old.voyage_id, old.profile_id);
      end if;

      for nextup in
        select r.*, p.email, p.full_name, p.notification_prefs
        from public.rsvps r join public.profiles p on p.id = r.profile_id
        where r.voyage_id = old.voyage_id and r.status = 'waitlist'
        order by r.created_at asc
      loop
        begin
          update public.rsvps set status = 'aboard' where id = nextup.id;
          promoted := true;
        exception when others then
          continue;
        end;

        if coalesce((nextup.notification_prefs->>'berths')::boolean, true) then
          insert into public.notifications (profile_id, kind, title, body)
          select nextup.profile_id, 'manifest', 'A pass released to you: ' || v.title,
                 'You were first in order on the waitlist. You''re aboard — release it within 48 hours if the tide has turned.'
          from public.voyages v where v.id = old.voyage_id;
        end if;
        insert into public.email_outbox (to_email, template, payload)
        select nextup.email, 'waitlist-release',
               jsonb_build_object('name', nextup.full_name, 'voyage', v.title, 'starts_at', v.starts_at)
        from public.voyages v where v.id = old.voyage_id and nextup.email is not null;
        exit;
      end loop;
    end if;
  end if;
  return coalesce(new, old);
end $function$;
