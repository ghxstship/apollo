-- ===== Passes vocabulary + box office fields =====
alter table public.membership_plans add column early_days int not null default 30;
update public.membership_plans set early_days = case
  when plan_type = 'access' then 21
  when tier = 1 then 30 when tier = 2 then 45 else 60 end;

alter table public.voyages add column held_passes int not null default 0;
alter table public.rsvps
  add column comp boolean not null default false,
  add column guest_names text[] not null default '{}';

-- New members inherit a default plan (type at tier II)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_member_no text;
  roll record;
begin
  select * into roll from public.member_roll where lower(email) = lower(new.email);
  new_member_no := 'LYR-' || lpad(nextval('public.member_no_seq')::text, 4, '0');
  insert into public.profiles (id, email, full_name, member_no, tier, home_harbor, plan_id)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''), '@', 1)),
    new_member_no,
    coalesce(roll.tier, 'regional'),
    roll.home_harbor,
    (select id from public.membership_plans mp where mp.plan_type = coalesce(roll.tier,'regional')::text and mp.tier = 2)
  );
  insert into public.fathoms_ledger (profile_id, delta, reason) values (new.id, 100, 'Welcome aboard');
  insert into public.notifications (profile_id, kind, title, body)
  values (new.id, 'word', 'Welcome aboard.', 'Your pass to the water is set. The manifest arrives each Sunday.');
  return new;
end $$;

-- Monthly pass usage (calendar month of the sailing)
create view public.member_pass_usage with (security_invoker = on) as
select r.profile_id, date_trunc('month', v.starts_at) as month,
       count(*)::int as passes_used
from public.rsvps r join public.voyages v on v.id = r.voyage_id
where r.status = 'aboard'
group by r.profile_id, date_trunc('month', v.starts_at);

-- ===== Booking guard: capacity/tier/guests + metering, ceilings, windows =====
create or replace function public.rsvp_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v record;
  member record;
  plan record;
  taken int;
  used int;
  tier_rank int;
  min_rank int;
  ceiling_rank int;
  sub_rank int;
  opens timestamptz;
begin
  if new.status <> 'aboard' then return new; end if;
  if public.is_staff() then return new; end if;
  select * into v from public.voyages where id = new.voyage_id;
  select * into member from public.profiles where id = new.profile_id;
  select * into plan from public.membership_plans where id = member.plan_id;
  if member.status <> 'active' then
    raise exception 'membership is on hold';
  end if;
  tier_rank := case member.tier when 'regional' then 1 when 'national' then 2 else 3 end;
  min_rank := case v.min_tier when 'regional' then 1 when 'national' then 2 else 3 end;
  if tier_rank < min_rank then
    raise exception 'passes for this sailing open at % tier', v.min_tier;
  end if;
  if new.guests > 0 and member.tier <> 'global' then
    raise exception 'guest passes ride on Global memberships';
  end if;
  if new.guests > 2 then
    raise exception 'two guest passes per member';
  end if;
  -- Class ceiling (sea ladder only; Access has no ceiling)
  if plan.id is not null and plan.class_ceiling is not null
     and v.sub_class in ('voyage','expedition','odyssey') then
    ceiling_rank := case plan.class_ceiling when 'voyage' then 1 when 'expedition' then 2 else 3 end;
    sub_rank := case v.sub_class when 'voyage' then 1 when 'expedition' then 2 else 3 end;
    if sub_rank > ceiling_rank then
      raise exception 'this sailing runs past your class tier — % passes open at a deeper tier', v.sub_class;
    end if;
  end if;
  -- Monthly allowance (0 = a la carte, uncapped)
  if plan.id is not null and plan.events_per_month > 0 then
    select count(*) into used from public.rsvps r
    join public.voyages vv on vv.id = r.voyage_id
    where r.profile_id = new.profile_id and r.status = 'aboard' and r.id <> new.id
      and date_trunc('month', vv.starts_at) = date_trunc('month', v.starts_at);
    if used >= plan.events_per_month then
      raise exception 'monthly passes are spent — the ledger resets with the month';
    end if;
  end if;
  -- Booking window (deeper tiers open earlier)
  if plan.id is not null then
    opens := v.starts_at - make_interval(days => plan.early_days);
    if now() < opens then
      raise exception 'the window opens % for your tier', to_char(opens, 'Mon DD');
    end if;
  end if;
  -- Capacity net of operator holds
  select count(*) into taken from public.rsvps
  where voyage_id = new.voyage_id and status = 'aboard' and id <> new.id;
  if taken >= v.berths_total - v.held_passes then
    raise exception 'the manifest is full — join the waitlist';
  end if;
  return new;
end $$;
revoke execute on function public.rsvp_guard() from public, anon, authenticated;

-- ===== Aboard trigger: pass vocabulary + comp handling =====
create or replace function public.handle_rsvp_aboard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v record;
  m text;
begin
  if new.status = 'aboard' then
    select * into v from public.voyages where id = new.voyage_id;
    if new.boarding_code is null then
      select member_no into m from public.profiles where id = new.profile_id;
      new.boarding_code := 'LS-' || upper(left(regexp_replace(v.slug,'[^a-zA-Z]','','g'),4))
        || '-' || to_char(v.starts_at,'MMDD') || '-' || right(coalesce(m,'0000'),4);
      update public.rsvps set boarding_code = new.boarding_code where id = new.id and boarding_code is null;
    end if;
    if not exists (select 1 from public.fathoms_ledger
                   where profile_id = new.profile_id and voyage_id = new.voyage_id
                     and reason in ('Berth confirmed','Pass confirmed')) then
      insert into public.fathoms_ledger (profile_id, delta, reason, voyage_id)
      values (new.profile_id, 25, 'Pass confirmed', new.voyage_id);
      insert into public.notifications (profile_id, kind, title, body)
      values (new.profile_id, 'manifest', 'You''re aboard: ' || v.title,
              'Pass confirmed. Gangway details land 48 hours before departure.');
      if not new.comp then
        if v.price_cents > 0 and not exists (select 1 from public.account_ledger where rsvp_id = new.id and kind = 'berth') then
          insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id, created_by)
          values (new.profile_id, -v.price_cents, 'berth', v.title, v.id, new.id, new.profile_id);
        end if;
        if v.deposit_required and not exists (select 1 from public.account_ledger where rsvp_id = new.id and kind = 'deposit') then
          insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id, created_by)
          values (new.profile_id, -5000, 'deposit', 'Pass deposit — credited to the galley aboard', v.id, new.id, new.profile_id);
        end if;
      end if;
      insert into public.email_outbox (to_email, template, payload)
      select p.email, 'boarding-pass',
             jsonb_build_object('name', p.full_name, 'voyage', v.title, 'starts_at', v.starts_at,
                                'code', new.boarding_code, 'muster', coalesce(v.muster,'Gangway B-12'))
      from public.profiles p where p.id = new.profile_id and p.email is not null;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.handle_rsvp_aboard() from public, anon, authenticated;

-- ===== Release trigger: pass vocabulary =====
create or replace function public.handle_rsvp_release()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  nextup record;
  charges int;
  credits int;
  credit_due int;
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
      select r.*, p.email, p.full_name, p.notification_prefs into nextup
      from public.rsvps r join public.profiles p on p.id = r.profile_id
      where r.voyage_id = old.voyage_id and r.status = 'waitlist'
      order by r.created_at asc limit 1;
      if nextup.id is not null then
        update public.rsvps set status = 'aboard' where id = nextup.id;
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
      end if;
    end if;
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function public.handle_rsvp_release() from public, anon, authenticated;

-- ===== Voyage lifecycle: add cancellation fan-out + full credit =====
create or replace function public.handle_voyage_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
  award int;
  net int;
begin
  if new.status = 'weather_hold' and old.status <> 'weather_hold' then
    for r in select rv.profile_id, p.email, p.full_name, p.notification_prefs
             from public.rsvps rv join public.profiles p on p.id = rv.profile_id
             where rv.voyage_id = new.id and rv.status in ('aboard','waitlist') loop
      if coalesce((r.notification_prefs->>'weather')::boolean, true) then
        insert into public.notifications (profile_id, kind, title, body)
        values (r.profile_id, 'weather', 'Weather hold: ' || new.title,
                'Held for weather. Your pass is safe and nothing more is charged until we sail. We call it by 18:00 the night before.');
      end if;
      insert into public.email_outbox (to_email, template, payload)
      values (r.email, 'weather-hold', jsonb_build_object('name', r.full_name, 'voyage', new.title, 'starts_at', new.starts_at));
    end loop;
  elsif old.status = 'weather_hold' and new.status = 'scheduled' then
    for r in select rv.profile_id, p.notification_prefs
             from public.rsvps rv join public.profiles p on p.id = rv.profile_id
             where rv.voyage_id = new.id and rv.status in ('aboard','waitlist') loop
      if coalesce((r.notification_prefs->>'weather')::boolean, true) then
        insert into public.notifications (profile_id, kind, title, body)
        values (r.profile_id, 'weather', 'Hold lifted: ' || new.title, 'The window opened. We sail as planned.');
      end if;
    end loop;
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    for r in select rv.profile_id, p.email, p.full_name
             from public.rsvps rv join public.profiles p on p.id = rv.profile_id
             where rv.voyage_id = new.id and rv.status in ('aboard','waitlist') loop
      select coalesce(-sum(delta_cents), 0) into net
      from public.account_ledger
      where profile_id = r.profile_id and voyage_id = new.id;
      if net > 0 then
        insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id)
        values (r.profile_id, net, 'credit', 'Cancelled — full credit: ' || new.title, new.id);
      end if;
      insert into public.notifications (profile_id, kind, title, body)
      values (r.profile_id, 'manifest', 'Cancelled: ' || new.title,
              'The club called it. Your account is credited in full — no games, no forms.');
      insert into public.email_outbox (to_email, template, payload)
      values (r.email, 'voyage-cancelled', jsonb_build_object('name', r.full_name, 'voyage', new.title));
    end loop;
  elsif new.status = 'completed' and old.status <> 'completed' then
    for r in select rv.profile_id, p.notification_prefs
             from public.rsvps rv join public.profiles p on p.id = rv.profile_id
             where rv.voyage_id = new.id and rv.status = 'aboard' loop
      award := case when new.kind = 'voyage' and new.distance_nm is not null
                    then round(new.distance_nm * 10 * new.fathoms_multiplier)::int
                    else round(40 * new.fathoms_multiplier)::int end;
      if award > 0 and not exists (select 1 from public.fathoms_ledger
            where profile_id = r.profile_id and voyage_id = new.id and reason like 'Miles banked%') then
        insert into public.fathoms_ledger (profile_id, delta, reason, voyage_id)
        values (r.profile_id, award,
                case when new.kind = 'voyage' then 'Miles banked — ' || coalesce(new.distance_nm,0) || ' NM'
                     else 'Miles banked — a night ashore' end, new.id);
        if coalesce((r.notification_prefs->>'fathoms')::boolean, true) then
          insert into public.notifications (profile_id, kind, title, body)
          values (r.profile_id, 'fathoms', award || ' knots banked.',
                  'From ' || new.title || ' — the ledger rewards water under the keel.');
        end if;
      end if;
    end loop;
  end if;
  return new;
end $$;
revoke execute on function public.handle_voyage_status() from public, anon, authenticated;

-- ===== Content vocabulary: passes, not berths =====
update public.voyages set
  blurb = replace(replace(blurb, 'berths', 'passes'), 'Berths', 'Passes'),
  description = replace(replace(replace(description, 'berths', 'passes'), 'Berths', 'Passes'), 'berth', 'pass');
update public.dispatch_posts set
  title = replace(replace(title, 'Berths', 'Passes'), 'berths', 'passes'),
  dek = replace(replace(dek, 'berths', 'passes'), 'berth', 'pass'),
  body = replace(replace(replace(body, 'Berths', 'Passes'), 'berths', 'passes'), 'berth', 'pass');
update public.rewards set
  name = replace(name, 'berths', 'passes'),
  detail = replace(replace(detail, 'berths', 'passes'), 'berth', 'pass');
