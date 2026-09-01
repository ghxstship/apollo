/* Three comms defects and one broken promise, all in the same trigger family.

   1. The weather email preference silenced SMS. 20260824212353 wrote "the SMS
      channel is separate and still carries the day-of message" while nesting
      the SMS-producing notification inside the pref check. SMS is now queued
      directly by the hold branch, for every verified number, whatever the
      letter switches say — a weather hold is day-of safety traffic.
      fan_out_notification loses its SMS arm so nothing double-queues.

   2. fan_out_notification queued a push for every notification regardless of
      the member's switches. The switches now govern the push the way they
      already governed the letter: weather->weather, fathoms->fathoms,
      manifest->berths; anything else always lands (a Word is a Word).
      Cancellations ride kind 'manifest' with pref bypassed at the producer,
      so the receipt-not-a-notice rule holds: the producer inserts, fan-out
      delivers.  ...which requires the one nuance below: the cancel branch
      writes its push row itself, so a berths-off member still hears it.

   3. run_automations texted any number on file; the fan-out has required a
      VERIFIED number since 20260823022648 existed for exactly that. Aligned.

   4. "$50 - credited to the galley aboard, forfeited on no-show" was printed
      on three surfaces and implemented on none. On completion, each aboard
      pass that paid a deposit either gets it back ('Deposit returned aboard')
      when they were checked in, or a Word saying it was forfeited when they
      never crossed the gangway. One-shot by construction: completed is now a
      terminal state (a_voyage_status_moves_only_forward), and the not-exists
      belt keeps a replay honest. */

create or replace function public.fan_out_notification()
returns trigger language plpgsql security definer set search_path to 'public'
as $fn$
declare p record; wanted boolean;
begin
  select * into p from public.profiles where id = new.profile_id;
  wanted := case new.kind
    when 'weather'  then coalesce((p.notification_prefs->>'weather')::boolean,  true)
    when 'fathoms'  then coalesce((p.notification_prefs->>'fathoms')::boolean,  true)
    when 'manifest' then coalesce((p.notification_prefs->>'berths')::boolean,   true)
    else true end;
  if wanted then
    insert into public.push_outbox (profile_id, title, body, url)
    values (new.profile_id, new.title, new.body,
            case new.kind when 'manifest' then '/manifest' when 'weather' then '/manifest'
                 when 'fathoms' then '/portal' else '/inbox' end);
  end if;
  return new;
end $fn$;

create or replace function public.handle_voyage_status()
returns trigger language plpgsql security definer set search_path to 'public'
as $fn$
declare
  r record;
  award int;
  net int;
  dep int;
begin
  if new.status = 'weather_hold' and old.status <> 'weather_hold' then
    for r in select rv.profile_id, p.email, p.full_name, p.phone, p.phone_verified, p.notification_prefs
             from public.rsvps rv join public.profiles p on p.id = rv.profile_id
             where rv.voyage_id = new.id and rv.status in ('aboard','waitlist') loop
      if coalesce((r.notification_prefs->>'weather')::boolean, true) then
        insert into public.notifications (profile_id, kind, title, body)
        values (r.profile_id, 'weather', 'Weather hold: ' || new.title,
                'Held for weather. Your pass is safe and nothing more is charged until we sail. We call it by 18:00 the night before.');
        if r.email is not null then
          insert into public.email_outbox (to_email, template, payload)
          values (r.email, 'weather-hold', jsonb_build_object('name', r.full_name, 'voyage', new.title, 'starts_at', new.starts_at));
        end if;
      end if;
      -- The day-of message rides its own channel: a verified phone hears a
      -- weather hold whatever the letter switches say.
      if r.phone is not null and r.phone_verified then
        insert into public.sms_outbox (to_phone, template, payload)
        values (r.phone, 'weather-hold',
                jsonb_build_object('title', 'Weather hold: ' || new.title,
                                   'body', 'Held for weather. We call it by 18:00 the night before.',
                                   'voyage', new.title, 'sailing', new.title));
      end if;
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
      -- A cancellation is not a preference: the receipt always goes, letter
      -- and push both. fan_out now honours the berths switch, so this push is
      -- written here, past it.
      insert into public.push_outbox (profile_id, title, body, url)
      values (r.profile_id, 'Cancelled: ' || new.title, 'Your account is credited in full.', '/manifest');
      if r.email is not null then
        insert into public.email_outbox (to_email, template, payload)
        values (r.email, 'voyage-cancelled', jsonb_build_object('name', r.full_name, 'voyage', new.title));
      end if;
    end loop;
  elsif new.status = 'completed' and old.status <> 'completed' then
    for r in select rv.profile_id, rv.checked_in_at, p.notification_prefs
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
      -- The deposit promise, kept: back aboard, or forfeited by absence.
      select coalesce(-sum(delta_cents), 0) into dep
      from public.account_ledger
      where profile_id = r.profile_id and voyage_id = new.id and kind = 'deposit';
      if dep > 0 and not exists (select 1 from public.account_ledger
            where profile_id = r.profile_id and voyage_id = new.id
              and kind = 'credit' and memo like 'Deposit returned aboard%') then
        if r.checked_in_at is not null then
          insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id)
          values (r.profile_id, dep, 'credit', 'Deposit returned aboard — ' || new.title, new.id);
          insert into public.notifications (profile_id, kind, title, body)
          values (r.profile_id, 'manifest', 'Deposit returned.',
                  'You came aboard ' || new.title || ' — the deposit is back on your account.');
        else
          insert into public.notifications (profile_id, kind, title, body)
          values (r.profile_id, 'manifest', 'Deposit forfeited — no show.',
                  'The gangway never saw you for ' || new.title || '. The deposit stays with the club, as the pass said it would.');
        end if;
      end if;
    end loop;
  end if;
  return new;
end $fn$;

-- run_automations: the SMS arm now requires the number to be VERIFIED, the
-- same bar the fan-out has held since a member could no longer verify their
-- own. Rewritten in place by string surgery on the live definition so the
-- rest of the function stays exactly what production runs (the lesson of
-- 20260901004433): if the anchor text is missing, this migration refuses.
do $mig$
declare src text; patched text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'run_automations';
  if src not like '%select p.full_name, p.email, p.phone into v_member, v_email, v_phone%' then
    raise exception 'run_automations does not look like the function this patch was written for';
  end if;
  patched := replace(src,
    'select p.full_name, p.email, p.phone into v_member, v_email, v_phone',
    'select p.full_name, p.email, case when p.phone_verified then p.phone end into v_member, v_email, v_phone');
  execute patched;
end $mig$;;
