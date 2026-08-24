-- THREE THINGS, all about letters that were sent when they should not have
-- been, or sent twice, or able to stop a sailing from being held.
--
-- 1. THE PREFERENCE SWITCHES DID NOT GOVERN THE EMAIL.
--    /you offers "Weather holds — called by 18:00 the night before" and
--    "Pass releases — waitlist offers, in order", saved to
--    profiles.notification_prefs. In every producer the NOTIFICATION insert sat
--    inside the pref check and the EMAIL insert sat outside it. Turning the
--    switch off silenced the in-app dot and changed nothing about the post. A
--    switch that governs one channel and is labelled as though it governs the
--    member's attention is not a preference, it is decoration.
--
--    A member who turns off weather notices will now not get the weather
--    email. That is what they asked for, and it is worth naming the trade
--    rather than quietly deciding for them: this is the honest reading of a
--    switch we chose to offer. The SMS channel is separate and still carries
--    the day-of message, which is the one /you calls out as the one that
--    "must not wait in an inbox".
--
-- 2. ONE MEMBER WITH NO EMAIL COULD BLOCK A WHOLE WEATHER HOLD.
--    This function inserted r.email with no null filter — both other producers
--    filter `p.email is not null` — and email_outbox.to_email is NOT NULL while
--    profiles.email is nullable. The insert would raise and roll the whole
--    status change back: the voyage stays 'scheduled', nobody is told anything,
--    and the operator sees a generic failure. The people with passes are the
--    ones who lose there.
--
-- 3. EVERY WAITLIST PROMOTION SENT TWO LETTERS FOR ONE EVENT.
--    handle_rsvp_release queues 'waitlist-release', then sets the row to
--    'aboard', which fires handle_rsvp_aboard and queues 'boarding-pass'. The
--    live table shows the pairs at identical created_at to the microsecond, for
--    every promotion there has ever been. Not exactly-once — exactly-twice, by
--    construction.
--
--    One letter now, and it is the release one, because it is the only one that
--    can say WHY a pass suddenly exists. It carries the boarding code and the
--    muster so nothing operational is lost, read back off the row after the
--    promotion has generated them. handle_rsvp_aboard holds its letter when the
--    row it is promoting came from the waitlist — it is not being told to stay
--    quiet by another trigger, it simply knows that a promotion is somebody
--    else's news to break.

create or replace function public.handle_voyage_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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
        if r.email is not null then
          insert into public.email_outbox (to_email, template, payload)
          values (r.email, 'weather-hold', jsonb_build_object('name', r.full_name, 'voyage', new.title, 'starts_at', new.starts_at));
        end if;
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
      -- A cancellation is not a preference. The sailing is off and the member's
      -- money has moved; that is a receipt, not a notice, and it always goes.
      if r.email is not null then
        insert into public.email_outbox (to_email, template, payload)
        values (r.email, 'voyage-cancelled', jsonb_build_object('name', r.full_name, 'voyage', new.title));
      end if;
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
end $function$;
;
