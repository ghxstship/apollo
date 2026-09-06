-- Every scheduled job in this product loops over rows and none of them
-- isolated a single row's failure. One member with a null the query did not
-- expect, one broadcast whose audience no longer resolves, one crew assignment
-- pointing at a struck episode — and the exception unwinds the whole function,
-- rolls the transaction back, and NOBODY gets their letter. The next run finds
-- the same bad row and does it again, so the job stays down until a person
-- notices.
--
-- The repo already knew this failure by name. cron_failures() was added with
-- the comment "One bad row aborts a whole run, and the next sign of it is a
-- member asking where their month went." That gave the Bridge the visibility.
-- It did not give the jobs the isolation, so the visible thing was still a
-- dead run.
--
-- Now each row is its own subtransaction: it fails alone, it says so where the
-- Bridge is already looking, and the loop carries on. The idiom is the one the
-- waitlist release has used since August — begin / exception when others /
-- continue — with the skip recorded rather than swallowed.

-- Where a skip goes. app_errors is the table the Bridge's errors panel reads
-- and the one an external tracker would be fed from, so a skipped row lands
-- beside the application's own failures rather than in a log nobody opens.
-- SECURITY DEFINER because the table takes no client writes by design.
create or replace function public.note_cron_skip(p_job text, p_row text, p_msg text, p_state text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  insert into public.app_errors (name, message, route, path, kind)
  values (coalesce(p_state, 'skip'), left(coalesce(p_msg, 'no message'), 2000), p_job, left(coalesce(p_row, ''), 200), 'cron-skip');
exception when others then
  /* Recording a skip must never be the thing that kills the run. */
  null;
end $fn$;

revoke all on function public.note_cron_skip(text, text, text, text) from public, anon, authenticated;

comment on function public.note_cron_skip(text, text, text, text) is
  'Records one row skipped by a scheduled job into app_errors, where the Bridge already reads. Never raises: a failure to record a failure must not abort the run.';

create or replace function public.run_dunning()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  s record;
  st record;
  pm record;
  sent integer := 0;
  grace integer := coalesce(public.club_setting('dues_grace_days'), 21);
  holds_on date;
begin
  /* The ladder, one lapse at a time. One member's failure is that member's:
     the rest of the ladder still goes out. */
  for s in
    select sub.id, sub.profile_id, sub.past_due_since, p.email, p.full_name, p.status as member_status
      from public.subscriptions sub
      join public.profiles p on p.id = sub.profile_id
     where sub.status = 'past_due'
       and sub.past_due_since is not null
       and p.status <> 'departed'
  loop
    begin
      holds_on := (s.past_due_since + make_interval(days => grace))::date;

      for st in
        select * from public.dunning_steps d
         where now() >= s.past_due_since + make_interval(days => d.day_offset)
           and not exists (select 1 from public.dunning_log l
                            where l.subscription_id = s.id and l.lapse_started = s.past_due_since and l.step = d.step)
         order by d.step
      loop
        insert into public.dunning_log (subscription_id, lapse_started, step)
        values (s.id, s.past_due_since, st.step);

        /* Rung one is the letter the subscriptions trigger may already have
           queued through an operator's automation. One letter, not two. */
        if st.step = 1 and exists (
          select 1 from public.email_outbox o
           where o.to_email = s.email and o.template = 'dues-failed'
             and o.created_at >= s.past_due_since - interval '1 hour'
        ) then
          continue;
        end if;

        if s.email is not null then
          insert into public.email_outbox (to_email, template, payload)
          values (s.email, st.template,
                  jsonb_build_object('name', s.full_name,
                                     'holds_on', to_char(holds_on, 'FMMonth FMDD')));
          sent := sent + 1;
        end if;
      end loop;

      /* The date the last letter named. */
      if now() >= s.past_due_since + make_interval(days => grace) and s.member_status = 'active' then
        update public.profiles
           set status = 'paused', hold_reason = 'dues', status_set_by = null
         where id = s.profile_id and status = 'active';
        insert into public.notifications (profile_id, kind, title, body)
        values (s.profile_id, 'word', 'Membership held — dues lapsed.',
                'Booking, posting and contests are closed until dues clear. Settle in the portal and the hold lifts on its own; a word to Shoreside does the same.');
      end if;
    exception when others then
      perform public.note_cron_skip('run_dunning', 'subscription ' || s.id::text, sqlerrm, sqlstate);
      continue;
    end;
  end loop;

  /* The card that is about to expire, thirty days out, once per card per
     expiry. Default cards on active memberships only — a card nobody draws
     on can expire in peace. */
  for pm in
    select m.id, m.exp_year, m.exp_month, p.email, p.full_name
      from public.payment_methods m
      join public.profiles p on p.id = m.profile_id
     where m.is_default
       and p.status = 'active'
       and p.email is not null
       and m.exp_year is not null and m.exp_month is not null
       and (make_date(m.exp_year, m.exp_month, 1) + interval '1 month' - interval '1 day')
           between now() and now() + interval '30 days'
       and not exists (select 1 from public.card_notices n
                        where n.payment_method_id = m.id and n.exp_year = m.exp_year and n.exp_month = m.exp_month)
  loop
    begin
      insert into public.card_notices (payment_method_id, exp_year, exp_month)
      values (pm.id, pm.exp_year, pm.exp_month);
      insert into public.email_outbox (to_email, template, payload)
      values (pm.email, 'card-expiring',
              jsonb_build_object('name', pm.full_name,
                                 'expires', to_char(make_date(pm.exp_year, pm.exp_month, 1), 'FMMonth YYYY')));
      sent := sent + 1;
    exception when others then
      perform public.note_cron_skip('run_dunning', 'payment_method ' || pm.id::text, sqlerrm, sqlstate);
      continue;
    end;
  end loop;

  return sent;
end $fn$;

create or replace function public.run_automation_queue()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare q record; n integer := 0;
begin
  for q in
    select qq.id, qq.automation_id, qq.profile_id, qq.episode_id, a.trigger_event
      from public.automation_queue qq join public.automations a on a.id = qq.automation_id
     where qq.done_at is null and qq.run_at <= now() and a.active
     order by qq.run_at
     limit 200
  loop
    begin
      perform public.run_automations(q.trigger_event, q.profile_id, q.episode_id, q.automation_id, true);
      update public.automation_queue set done_at = now() where id = q.id;
      n := n + 1;
    exception when others then
      perform public.note_cron_skip('run_automation_queue', 'queue row ' || q.id::text, sqlerrm, sqlstate);
      continue;
    end;
  end loop;
  /* A rule switched off while its rows waited: the rows are marked done
     rather than firing later as a surprise. */
  update public.automation_queue qq set done_at = now()
    from public.automations a where a.id = qq.automation_id and qq.done_at is null and not a.active;
  return n;
end $fn$;

create or replace function public.run_due_broadcasts()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare b record; n integer := 0;
begin
  for b in select id from public.broadcasts where status = 'queued' and send_at is not null and send_at <= now() order by send_at loop
    begin
      perform public.perform_broadcast(b.id);
      n := n + 1;
    exception when others then
      perform public.note_cron_skip('run_due_broadcasts', 'broadcast ' || b.id::text, sqlerrm, sqlstate);
      continue;
    end;
  end loop;
  return n;
end $fn$;

create or replace function public.carry_the_clock()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v record; r record; sent int := 0;
begin
  -- T-48h: the gangway-details letter and its Word.
  for v in select * from public.episodes
           where status in ('scheduled','live')
             and starts_at - interval '48 hours' <= now() and starts_at > now() loop
    for r in select rv.boarding_code, p.id pid, p.email, p.full_name, p.notification_prefs
             from public.passes rv join public.profiles p on p.id = rv.profile_id
             where rv.episode_id = v.id and rv.status = 'aboard' loop
      begin
        if r.email is not null and not exists (
          select 1 from public.email_outbox
          where to_email = r.email and template = 'gangway-details'
            and payload->>'episode_id' = v.id::text) then
          insert into public.email_outbox (to_email, template, payload)
          values (r.email, 'gangway-details',
                  jsonb_build_object('name', r.full_name, 'voyage', v.title, 'episode_id', v.id,
                                     'starts_at', v.starts_at, 'time_zone', v.time_zone, 'code', r.boarding_code,
                                     'muster', coalesce(v.muster, 'Gangway B-12'),
                                     'legs', (select jsonb_agg(jsonb_build_object('day', l.day, 'place', l.place, 'starts_at', l.starts_at) order by l.day, l.starts_at)
                                                from public.episode_legs l where l.episode_id = v.id and coalesce(l.status, '') <> 'cancelled'),
                                     'home_time_zone', (select c.time_zone from public.profiles pp join public.cities c on c.id = pp.home_city
                                                          where pp.id = r.pid and c.time_zone is not null and c.time_zone is distinct from v.time_zone)));
          sent := sent + 1;
        end if;
        if coalesce((r.notification_prefs->>'berths')::boolean, true) and not exists (
          select 1 from public.notifications
          where profile_id = r.pid and (episode_id = v.id or episode_id is null)
            and title = 'Gangway details: ' || v.title) then
          insert into public.notifications (profile_id, kind, title, body, episode_id)
          values (r.pid, 'manifest', 'Gangway details: ' || v.title,
                  'Muster ' || coalesce(v.muster, 'Gangway B-12') || '. Your code is on your member card — brightness up at the gangway.',
                  v.id);
        end if;
      exception when others then
        perform public.note_cron_skip('carry_the_clock', 'gangway-details pass for ' || r.pid::text || ' on ' || v.id::text, sqlerrm, sqlstate);
        continue;
      end;
    end loop;
  end loop;

  -- The day itself: five words, each once per sailing, always delivered.
  for v in select vv.*, vr.opens_at, vr.anchors_unlock_at
           from public.episodes vv left join public.episode_radar vr on vr.episode_id = vv.id
           where vv.status in ('scheduled','live')
             and vv.starts_at - interval '2 hours' <= now()
             and coalesce(vv.ends_at, vv.starts_at + interval '12 hours') + interval '6 hours' > now() loop
    for r in select p.id pid, coalesce(rv.standby, false) as standby from public.passes rv join public.profiles p on p.id = rv.profile_id
             where rv.episode_id = v.id and rv.status = 'aboard' loop
      begin
        if v.starts_at > now() and not exists (select 1 from public.notifications
              where profile_id = r.pid and (episode_id = v.id or episode_id is null)
                and title = 'Two hours to the gangway: ' || v.title) then
          insert into public.notifications (profile_id, kind, title, body, episode_id)
          values (r.pid, 'word', 'Two hours to the gangway: ' || v.title, case when r.standby then 'You hold a standby pass. Come to the muster at call time and wait by the gangway — you board into the first seat a no-show frees.' else 'Riviera Chic, sun up, phones down. The water is waiting.' end, v.id);
        end if;
        if v.starts_at <= now() and not exists (select 1 from public.notifications
              where profile_id = r.pid and (episode_id = v.id or episode_id is null)
                and title = 'Boarding: ' || v.title) then
          insert into public.notifications (profile_id, kind, title, body, episode_id)
          values (r.pid, 'word', 'Boarding: ' || v.title, 'The gangway is open. Muster ' || coalesce(v.muster, 'Gangway B-12') || '.', v.id);
        end if;
        if v.opens_at is not null and v.opens_at <= now() and not exists (select 1 from public.notifications
              where profile_id = r.pid and (episode_id = v.id or episode_id is null)
                and title = 'The Radar is live: ' || v.title) then
          insert into public.notifications (profile_id, kind, title, body, episode_id)
          values (r.pid, 'word', 'The Radar is live: ' || v.title, 'Fifteen minutes on the sweep. Plot your courses — it locks at half past.', v.id);
        end if;
        if v.anchors_unlock_at is not null and v.anchors_unlock_at <= now() and not exists (select 1 from public.notifications
              where profile_id = r.pid and (episode_id = v.id or episode_id is null)
                and title = 'The Captain''s Log is unsealed: ' || v.title) then
          insert into public.notifications (profile_id, kind, title, body, episode_id)
          values (r.pid, 'word', 'The Captain''s Log is unsealed: ' || v.title, 'Gold foil, your name, one day to open it. Shared Anchors surface for a day.', v.id);
        end if;
        if v.ends_at is not null and v.ends_at <= now() and not exists (select 1 from public.notifications
              where profile_id = r.pid and (episode_id = v.id or episode_id is null)
                and title = 'Docked: ' || v.title) then
          insert into public.notifications (profile_id, kind, title, body, episode_id)
          values (r.pid, 'word', 'Docked: ' || v.title, 'Lines ashore, all well. What the week kept lands in the Log.', v.id);
        end if;
      exception when others then
        perform public.note_cron_skip('carry_the_clock', 'day-of words for ' || r.pid::text || ' on ' || v.id::text, sqlerrm, sqlstate);
        continue;
      end;
    end loop;
  end loop;

  -- T-24h: the crew call, on the crew's own phone, once.
  for v in select * from public.episodes
           where status in ('scheduled','live')
             and starts_at - interval '24 hours' <= now() and starts_at > now() loop
    for r in select a.id aid, a.call_time, p.phone
             from public.crew_assignments a
             join public.crew c on c.id = a.crew_id
             join public.profiles p on p.id = c.profile_id
             where a.episode_id = v.id
               and coalesce(a.status, '') not in ('declined', 'cancelled', 'struck')
               and p.phone is not null and p.phone_verified loop
      begin
        if not exists (select 1 from public.sms_outbox s
                        where s.template = 'crew-call-time' and s.payload->>'assignment_id' = r.aid::text) then
          insert into public.sms_outbox (to_phone, template, payload)
          values (r.phone, 'crew-call-time',
                  jsonb_build_object('title', v.title, 'sailing', v.title,
                                     'muster', coalesce(v.muster, 'Gangway B-12'),
                                     'call_time', to_char(coalesce(r.call_time, v.starts_at - interval '90 minutes') at time zone coalesce(v.time_zone, 'America/New_York'), 'HH24:MI'),
                                     'assignment_id', r.aid, 'episode_id', v.id));
          sent := sent + 1;
        end if;
      exception when others then
        perform public.note_cron_skip('carry_the_clock', 'crew call ' || r.aid::text, sqlerrm, sqlstate);
        continue;
      end;
    end loop;
  end loop;

  return sent;
end $fn$;;
