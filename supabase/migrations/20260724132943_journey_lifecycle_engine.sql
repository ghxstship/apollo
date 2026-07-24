-- ===== New members inherit their roll entry (tier, harbor); waiver noted =====
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_member_no text;
  roll record;
begin
  select * into roll from public.member_roll where lower(email) = lower(new.email);
  new_member_no := 'LYR-' || lpad(nextval('public.member_no_seq')::text, 4, '0');
  insert into public.profiles (id, email, full_name, member_no, tier, home_harbor)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''), '@', 1)),
    new_member_no,
    coalesce(roll.tier, 'regional'),
    roll.home_harbor
  );
  insert into public.fathoms_ledger (profile_id, delta, reason) values (new.id, 100, 'Welcome aboard');
  insert into public.notifications (profile_id, kind, title, body)
  values (new.id, 'word', 'Welcome aboard.', 'Your berth in the club is set. The manifest arrives each Sunday.');
  return new;
end $$;

-- ===== RSVP aboard: fathoms + notification + boarding code + house charges =====
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
                   where profile_id = new.profile_id and voyage_id = new.voyage_id and reason = 'Berth confirmed') then
      insert into public.fathoms_ledger (profile_id, delta, reason, voyage_id)
      values (new.profile_id, 25, 'Berth confirmed', new.voyage_id);
      insert into public.notifications (profile_id, kind, title, body)
      values (new.profile_id, 'manifest', 'You''re aboard: ' || v.title,
              'Berth confirmed. Gangway details land 48 hours before departure.');
      -- House charges: berth price and (when required) the $50 deposit
      if v.price_cents > 0 and not exists (select 1 from public.account_ledger where rsvp_id = new.id and kind = 'berth') then
        insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id, created_by)
        values (new.profile_id, -v.price_cents, 'berth', v.title, v.id, new.id, new.profile_id);
      end if;
      if v.deposit_required and not exists (select 1 from public.account_ledger where rsvp_id = new.id and kind = 'deposit') then
        insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id, created_by)
        values (new.profile_id, -5000, 'deposit', 'Berth deposit — credited to the galley aboard', v.id, new.id, new.profile_id);
      end if;
      -- Boarding-pass email
      insert into public.email_outbox (to_email, template, payload)
      select p.email, 'boarding-pass',
             jsonb_build_object('name', p.full_name, 'voyage', v.title, 'starts_at', v.starts_at,
                                'code', new.boarding_code, 'muster', coalesce(v.muster,'Gangway B-12'))
      from public.profiles p where p.id = new.profile_id and p.email is not null;
    end if;
  end if;
  return new;
end $$;

-- ===== Berth release: credit inside policy + promote the waitlist in order =====
create or replace function public.handle_rsvp_release()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  freed record;
  nextup record;
  charged int;
begin
  freed := coalesce(old, new);
  if tg_op = 'DELETE' or (old.status = 'aboard' and new.status <> 'aboard') then
    if old.status = 'aboard' then
      -- Full credit when released more than 48h out
      select coalesce(sum(delta_cents),0) into charged
      from public.account_ledger where rsvp_id = old.id and delta_cents < 0;
      if charged < 0 and exists (select 1 from public.voyages v where v.id = old.voyage_id and v.starts_at - now() > interval '48 hours') then
        insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id, created_by)
        values (old.profile_id, -charged, 'credit', 'Berth released 48h+ out — full credit', old.voyage_id, old.id, old.profile_id);
      end if;
      -- Promote the first waitlisted member, in order
      select r.*, p.email, p.full_name, p.notification_prefs into nextup
      from public.rsvps r join public.profiles p on p.id = r.profile_id
      where r.voyage_id = old.voyage_id and r.status = 'waitlist'
      order by r.created_at asc limit 1;
      if nextup.id is not null then
        update public.rsvps set status = 'aboard' where id = nextup.id;
        if coalesce((nextup.notification_prefs->>'berths')::boolean, true) then
          insert into public.notifications (profile_id, kind, title, body)
          select nextup.profile_id, 'manifest', 'A berth released to you: ' || v.title,
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
create trigger on_rsvp_release
after update of status or delete on public.rsvps
for each row execute function public.handle_rsvp_release();

-- ===== Voyage lifecycle fan-out: weather holds + completion fathoms =====
create or replace function public.handle_voyage_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
  award int;
begin
  if new.status = 'weather_hold' and old.status <> 'weather_hold' then
    for r in select rv.profile_id, p.email, p.full_name, p.notification_prefs
             from public.rsvps rv join public.profiles p on p.id = rv.profile_id
             where rv.voyage_id = new.id and rv.status in ('aboard','waitlist') loop
      if coalesce((r.notification_prefs->>'weather')::boolean, true) then
        insert into public.notifications (profile_id, kind, title, body)
        values (r.profile_id, 'weather', 'Weather hold: ' || new.title,
                'Held for weather. Your berth is safe and nothing is charged until we sail. We call it by 18:00 the night before.');
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
  elsif new.status = 'completed' and old.status <> 'completed' then
    -- The fathom standard: 10 FM per nautical mile under sail, 40 per salon night
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
          values (r.profile_id, 'fathoms', award || ' fathoms banked.',
                  'From ' || new.title || ' — the ledger rewards water under the keel.');
        end if;
      end if;
    end loop;
  end if;
  return new;
end $$;
create trigger on_voyage_status
after update of status on public.voyages
for each row execute function public.handle_voyage_status();

-- ===== Application funnel =====
create or replace function public.handle_new_application()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.email_outbox (to_email, template, payload)
  values (new.email, 'application-received', jsonb_build_object('name', new.full_name));
  return new;
end $$;
create trigger on_application_received
after insert on public.applications
for each row execute function public.handle_new_application();

create or replace function public.set_application_status(p_id uuid, p_status public.application_status)
returns void language plpgsql security definer set search_path = public as $$
declare a record;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  select * into a from public.applications where id = p_id;
  if a.id is null then raise exception 'no such application'; end if;
  update public.applications set status = p_status, reviewed_by = auth.uid(),
    decided_at = case when p_status in ('aboard','declined') then now() else decided_at end
  where id = p_id;
  if p_status = 'invited' then
    insert into public.email_outbox (to_email, template, payload)
    values (a.email, 'salon-invite', jsonb_build_object('name', a.full_name));
  end if;
end $$;
grant execute on function public.set_application_status(uuid, public.application_status) to authenticated;

create or replace function public.accept_application(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  a record;
  inv record;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  select * into a from public.applications where id = p_id;
  if a.id is null then raise exception 'no such application'; end if;
  update public.applications set status = 'aboard', reviewed_by = auth.uid(), decided_at = now() where id = p_id;
  insert into public.member_roll (email, tier, invite_code, source, approved_by)
  values (lower(a.email), a.tier_requested, a.invite_code, 'application', auth.uid())
  on conflict (email) do nothing;
  insert into public.email_outbox (to_email, template, payload)
  values (a.email, 'welcome-aboard', jsonb_build_object('name', a.full_name, 'tier', a.tier_requested));
  -- Referral signature: 250 fathoms to the inviter when their code joins
  if a.invite_code is not null then
    select * into inv from public.invites where code = upper(a.invite_code) and uses < max_uses;
    if inv.code is not null then
      update public.invites set uses = uses + 1 where code = inv.code;
      insert into public.fathoms_ledger (profile_id, delta, reason)
      values (inv.inviter_id, 250, 'Referral signature — ' || a.full_name || ' came aboard');
      insert into public.notifications (profile_id, kind, title, body)
      values (inv.inviter_id, 'fathoms', '250 fathoms — your signature held.',
              a.full_name || ' is aboard on your word. The ledger remembers.');
    end if;
  end if;
end $$;
grant execute on function public.accept_application(uuid) to authenticated;

-- ===== Rewards: redemption burns fathoms =====
create or replace function public.redeem_reward(p_reward uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  rw record;
  bal int;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select * into rw from public.rewards where id = p_reward and active;
  if rw.id is null then raise exception 'no such reward'; end if;
  select coalesce(sum(delta),0) into bal from public.fathoms_ledger where profile_id = auth.uid();
  if bal < rw.cost_fm then raise exception 'not enough fathoms'; end if;
  insert into public.reward_redemptions (profile_id, reward_id) values (auth.uid(), rw.id);
  insert into public.fathoms_ledger (profile_id, delta, reason) values (auth.uid(), -rw.cost_fm, 'Redeemed — ' || rw.name);
  insert into public.notifications (profile_id, kind, title, body)
  values (auth.uid(), 'fathoms', 'Redeemed: ' || rw.name, 'The shore office will make it so.');
end $$;
grant execute on function public.redeem_reward(uuid) to authenticated;

-- ===== Server-side booking guard: capacity + tier + guest passes =====
create or replace function public.rsvp_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v record;
  member record;
  taken int;
  tier_rank int;
  min_rank int;
begin
  if new.status <> 'aboard' then return new; end if;
  select * into v from public.voyages where id = new.voyage_id;
  select * into member from public.profiles where id = new.profile_id;
  if member.status <> 'active' and not public.is_staff() then
    raise exception 'membership is on hold';
  end if;
  tier_rank := case member.tier when 'regional' then 1 when 'national' then 2 else 3 end;
  min_rank := case v.min_tier when 'regional' then 1 when 'national' then 2 else 3 end;
  if tier_rank < min_rank and not public.is_staff() then
    raise exception 'berths on this sailing open at % tier', v.min_tier;
  end if;
  if new.guests > 0 and member.tier <> 'global' and not public.is_staff() then
    raise exception 'guest berths ride on Global passes';
  end if;
  if new.guests > 2 and not public.is_staff() then
    raise exception 'two guest berths per member';
  end if;
  select count(*) into taken from public.rsvps
  where voyage_id = new.voyage_id and status = 'aboard' and id <> new.id;
  if taken >= v.berths_total and not public.is_staff() then
    raise exception 'the manifest is full — join the waitlist';
  end if;
  return new;
end $$;
create trigger rsvp_guard_check
before insert or update of status, guests on public.rsvps
for each row execute function public.rsvp_guard();

-- ===== Galley & shop orders post to the member account =====
create or replace function public.charge_galley_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.total_cents > 0 then
    insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, created_by)
    values (new.profile_id, -new.total_cents, 'galley', 'Galley order', new.voyage_id, new.profile_id);
  end if;
  return new;
end $$;
create trigger on_galley_order after insert on public.galley_orders
for each row execute function public.charge_galley_order();

create or replace function public.charge_shop_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.total_cents > 0 then
    insert into public.account_ledger (profile_id, delta_cents, kind, memo, created_by)
    values (new.profile_id, -(new.total_cents - new.discount_cents), 'chandlery', 'The Chandlery', new.profile_id);
  end if;
  return new;
end $$;
create trigger on_shop_order after insert on public.shop_orders
for each row execute function public.charge_shop_order();

-- ===== Offboarding: departure writes the farewell =====
create or replace function public.handle_profile_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'departed' and old.status <> 'departed' then
    insert into public.email_outbox (to_email, template, payload)
    values (new.email, 'farewell', jsonb_build_object('name', new.full_name));
  elsif new.status = 'paused' and old.status <> 'paused' then
    insert into public.notifications (profile_id, kind, title, body)
    values (new.id, 'word', 'Weather hold on your membership.', 'Dues pause; fathoms and tier keep. Resume with a word.');
  end if;
  return new;
end $$;
create trigger on_profile_status
after update of status on public.profiles
for each row execute function public.handle_profile_status();

-- Lock down all new definer functions from RPC misuse
revoke execute on function public.enforce_member_roll() from public, anon, authenticated;
revoke execute on function public.handle_rsvp_release() from public, anon, authenticated;
revoke execute on function public.handle_voyage_status() from public, anon, authenticated;
revoke execute on function public.handle_new_application() from public, anon, authenticated;
revoke execute on function public.rsvp_guard() from public, anon, authenticated;
revoke execute on function public.charge_galley_order() from public, anon, authenticated;
revoke execute on function public.charge_shop_order() from public, anon, authenticated;
revoke execute on function public.handle_profile_status() from public, anon, authenticated;
