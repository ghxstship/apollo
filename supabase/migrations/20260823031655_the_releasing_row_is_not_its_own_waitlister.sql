-- handle_rsvp_release runs AFTER the row has changed, so a member moving their
-- own pass aboard -> waitlist was already sitting in the waitlist when the
-- promotion loop looked for one. It found them, put them straight back aboard,
-- and told them "a pass released to you" about their own release — while the
-- 48-hour credit posted regardless. Pass kept, money back.
create or replace function public.handle_rsvp_release()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  nextup record; charges int; credits int; credit_due int;
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
        where r.voyage_id = old.voyage_id
          and r.status = 'waitlist'
          and r.id <> old.id
          and r.profile_id <> old.profile_id
        order by r.created_at asc
      loop
        begin
          update public.rsvps set status = 'aboard' where id = nextup.id;
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
