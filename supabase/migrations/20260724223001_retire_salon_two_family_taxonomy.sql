-- Two families only: Sea Day (aboard) / Port Day (ashore); both run the
-- Voyage/Expedition/Odyssey ladder. "Salon" leaves the brand.

-- Remap former sky/overnight rows
update public.voyages set class = 'sea' where slug = 'night-passage-catalina';
update public.voyages set class = 'shore' where class = 'sky';

-- kind: sea_day | port_day (was voyage | salon)
update public.voyages set kind = case when class = 'sea' then 'sea_day' else 'port_day' end;

-- Ladder applies to both families, by duration
update public.voyages set sub_class = case
  when ends_at is null then 'expedition'
  when ends_at - starts_at < interval '4 hours' then 'voyage'
  when ends_at - starts_at <= interval '8 hours' then 'expedition'
  else 'odyssey' end;

-- Retitle/relink the salon-named events
update public.voyages set slug = 'port-night-no-9', title = 'Port Night No. IX.'
  where slug = 'salon-no-9';
update public.voyages set slug = 'chicago-founding-night', title = 'Chicago: the founding night.'
  where slug = 'chicago-founding-salon';

-- Copy sweep in content: salon(s) -> port day(s)
update public.voyages set
  blurb = replace(replace(blurb, 'salons', 'port days'), 'salon', 'port day'),
  description = replace(replace(description, 'salons', 'port days'), 'salon', 'port day');
update public.dispatch_posts set
  title = replace(replace(title, 'Salons', 'Port days'), 'salon', 'port day'),
  dek = replace(replace(dek, 'salons', 'port days'), 'salon', 'port day'),
  body = replace(replace(replace(body, 'Salons', 'Port days'), 'salons', 'port days'), 'salon', 'port day');
update public.rewards set
  name = replace(replace(name, 'salon', 'Port Day'), 'Salon', 'Port Day'),
  detail = replace(replace(detail, 'salons', 'port days'), 'salon', 'port day');
update public.crew_roles set
  title = replace(title, 'Salon lead', 'Port Day lead'),
  blurb = replace(blurb, 'salon', 'port day')
  where title like '%Salon%' or blurb like '%salon%';
update public.applications set
  interests = array_replace(interests, 'Salon', 'Port Day');

-- Knots: distance pays 10/NM; no distance pays a flat 40 (family-agnostic)
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
      award := case when new.distance_nm is not null and new.distance_nm > 0
                    then round(new.distance_nm * 10 * new.fathoms_multiplier)::int
                    else round(40 * new.fathoms_multiplier)::int end;
      if award > 0 and not exists (select 1 from public.fathoms_ledger
            where profile_id = r.profile_id and voyage_id = new.id and reason like 'Miles banked%') then
        insert into public.fathoms_ledger (profile_id, delta, reason, voyage_id)
        values (r.profile_id, award,
                case when new.distance_nm is not null and new.distance_nm > 0
                     then 'Miles banked — ' || new.distance_nm || ' NM'
                     else 'Miles banked — a day in port' end, new.id);
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

-- Application funnel: the guest visit is a Port Day now
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
    values (a.email, 'port-invite', jsonb_build_object('name', a.full_name));
  end if;
end $$;
