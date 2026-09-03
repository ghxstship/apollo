-- The previous migration got the release half wrong, and a test caught it
-- before anyone was charged. Writing down the arithmetic, because it is the
-- kind of thing that is obvious only once it is on the page.
--
-- Let C = charges, X = cash credits already posted, P = plan credit applied,
-- R = plan credit being returned to the allowance by this release, and A = the
-- cash credit we are about to post. The member's balance is -C + X + P, and a
-- release outside the window must leave it at zero:
--
--     -C + X + P + A - R = 0     ⇒     A = C - X - P + R
--
-- The first version dropped the + R. So when the credit WAS returned to the
-- allowance, the member got their allowance back and was still left owing the
-- credited half of a pass they no longer held: $42.50 on an $85 pass.
--
-- Both branches now fall out of the same expression:
--   R = P (same month, outside window) → A = C - X. Cash back and allowance
--       back, which is exactly what they gave up.
--   R = 0 (a later month, so the credit has lapsed) → A = C - X - P. Cash back
--       only, and the spent credit stays spent.
create or replace function public.handle_pass_release()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  nextup record; charges int; credits int; credit_due int; promoted record; v_sail record;
  plan_applied int; plan_returned int; v_period date; outside_window boolean;
begin
  if tg_op = 'DELETE' or (old.status = 'aboard' and new.status <> 'aboard') then
    if old.status = 'aboard' then
      select coalesce(-sum(delta_cents), 0) into charges
      from public.account_ledger
      where profile_id = old.profile_id and episode_id = old.episode_id
        and delta_cents < 0 and kind in ('pass','deposit','addon');
      select coalesce(sum(delta_cents), 0) into credits
      from public.account_ledger
      where profile_id = old.profile_id and episode_id = old.episode_id and kind = 'credit';
      select coalesce(sum(delta_cents), 0) into plan_applied
      from public.account_ledger
      where profile_id = old.profile_id and episode_id = old.episode_id and kind = 'plan_credit';

      select starts_at, title into v_sail from public.episodes where id = old.episode_id;
      outside_window := v_sail.starts_at - now()
                        > make_interval(hours => public.club_setting('release_credit_hours'));

      /* Decided BEFORE the cash figure, because the cash figure depends on it. */
      v_period := date_trunc('month', (now() at time zone 'America/New_York'))::date;
      plan_returned := 0;
      if plan_applied > 0 and outside_window then
        select coalesce(sum(delta_cents), 0) into plan_returned
        from public.account_ledger
        where profile_id = old.profile_id and episode_id = old.episode_id and kind = 'plan_credit'
          and date_trunc('month', (created_at at time zone 'America/New_York'))
              = date_trunc('month', (now() at time zone 'America/New_York'));
        plan_returned := greatest(plan_returned, 0);
      end if;

      credit_due := charges - credits - plan_applied + plan_returned;
      if credit_due > 0 and outside_window then
        insert into public.account_ledger (profile_id, delta_cents, kind, memo, episode_id, created_by)
        values (old.profile_id, credit_due, 'credit', 'Pass released 48h+ out — full credit', old.episode_id, old.profile_id);
      end if;

      if plan_returned > 0 then
        update public.pass_credits
           set spent_cents = greatest(0, spent_cents - plan_returned)
         where profile_id = old.profile_id and period = v_period;

        /* Reversed as a row rather than by deleting the original, so the ledger
           still says what happened and the sums above stay honest on a re-run. */
        insert into public.account_ledger (profile_id, delta_cents, kind, memo, episode_id, created_by)
        values (old.profile_id, -plan_returned, 'plan_credit',
                'Membership credit returned — ' || v_sail.title, old.episode_id, old.profile_id);
      end if;

      delete from public.pass_addons where rsvp_id = old.id;
      delete from public.episode_daybeds where rsvp_id = old.id;

      update public.installment_plans
         set status = 'cancelled', next_charge_at = null
       where rsvp_id = old.id and status = 'active';

      for nextup in
        select r.*, p.email, p.full_name, p.notification_prefs
        from public.passes r join public.profiles p on p.id = r.profile_id
        where r.episode_id = old.episode_id
          and r.status = 'waitlist'
          and r.id <> old.id
          and r.profile_id <> old.profile_id
        order by r.created_at asc
      loop
        if not coalesce(nextup.auto_claim, true)
           or v_sail.starts_at - now() <= make_interval(hours => public.club_setting('release_credit_hours')) then
          if coalesce((nextup.notification_prefs->>'berths')::boolean, true) then
            insert into public.notifications (profile_id, kind, title, body)
            select nextup.profile_id, 'manifest', 'A pass opened: ' || v.title,
                   'You asked to claim by hand. The pass is open in Passes now — first come, first aboard.'
            from public.episodes v where v.id = old.episode_id;
          end if;
          continue;
        end if;

        begin
          update public.passes set status = 'aboard' where id = nextup.id;
        exception when others then
          insert into public.notifications (profile_id, kind, title, body, episode_id)
          values (nextup.profile_id, 'manifest', 'A pass opened, and the door said no: ' || v_sail.title,
                  regexp_replace(sqlerrm, '^[^:]*:\s*', '') || ' — the line moved on; your place in it stands.', old.episode_id);
          continue;
        end;

        if coalesce((nextup.notification_prefs->>'berths')::boolean, true) then
          insert into public.notifications (profile_id, kind, title, body)
          select nextup.profile_id, 'manifest', 'A pass released to you: ' || v.title,
                 'You were first in order on the waitlist. You''re aboard — release it within 48 hours if the tide has turned.'
          from public.episodes v where v.id = old.episode_id;

          select r.boarding_code into promoted from public.passes r where r.id = nextup.id;

          insert into public.email_outbox (to_email, template, payload)
          select nextup.email, 'waitlist-release',
                 jsonb_build_object('name', nextup.full_name, 'voyage', v.title, 'starts_at', v.starts_at,
                                    'code', promoted.boarding_code,
                                    'muster', coalesce(v.muster, 'Gangway B-12'))
          from public.episodes v where v.id = old.episode_id and nextup.email is not null;
        end if;
        exit;
      end loop;
    end if;
  end if;
  return coalesce(new, old);
end $$;

revoke execute on function public.handle_pass_release() from public, anon, authenticated;;
