-- The other half, and the half that would have leaked cash.
--
-- The release refund was `charges - credits`. A pass covered by membership
-- credit has charges of $290 and cash credits of nothing, so a member who paid
-- $0 out of pocket would have been handed $290 of real account credit on
-- release — the club buying back something it gave away.
--
-- So the plan credit comes off the refund, and instead goes back where it came
-- from: the month's allowance, to be spent again. It is not cash and it must
-- never turn into cash on the way out.
--
-- IT RETURNS ONLY WITHIN ITS OWN MONTH, and only outside the release window.
-- The window rule matches the cash rule exactly — a pass forfeited inside 48
-- hours forfeits both halves, or releasing late would be free for whoever paid
-- with credit. The month rule is what a monthly credit means: an October
-- release cannot top up September, and pass_credits is keyed by period.
create or replace function public.handle_pass_release()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  nextup record; charges int; credits int; credit_due int; promoted record; v_sail record;
  plan_applied int; plan_this_period int; v_period date; outside_window boolean;
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
      /* Net of reversals: a plan credit given back on an earlier release posts a
         negative row, so this sums to what is still applied. */
      select coalesce(sum(delta_cents), 0) into plan_applied
      from public.account_ledger
      where profile_id = old.profile_id and episode_id = old.episode_id and kind = 'plan_credit';

      select starts_at, title into v_sail from public.episodes where id = old.episode_id;
      outside_window := v_sail.starts_at - now()
                        > make_interval(hours => public.club_setting('release_credit_hours'));

      -- Cash back is what was actually paid in cash.
      credit_due := charges - credits - plan_applied;
      if credit_due > 0 and outside_window then
        insert into public.account_ledger (profile_id, delta_cents, kind, memo, episode_id, created_by)
        values (old.profile_id, credit_due, 'credit', 'Pass released 48h+ out — full credit', old.episode_id, old.profile_id);
      end if;

      -- Credit back is what was paid in credit, and only this month's.
      if plan_applied > 0 and outside_window then
        v_period := date_trunc('month', (now() at time zone 'America/New_York'))::date;
        select coalesce(sum(delta_cents), 0) into plan_this_period
        from public.account_ledger
        where profile_id = old.profile_id and episode_id = old.episode_id and kind = 'plan_credit'
          and date_trunc('month', (created_at at time zone 'America/New_York'))
              = date_trunc('month', (now() at time zone 'America/New_York'));

        if plan_this_period > 0 then
          update public.pass_credits
             set spent_cents = greatest(0, spent_cents - plan_this_period)
           where profile_id = old.profile_id and period = v_period;

          /* Reversed as a row rather than by deleting the original, so the
             ledger still says what happened and the sum above stays honest. */
          insert into public.account_ledger (profile_id, delta_cents, kind, memo, episode_id, created_by)
          values (old.profile_id, -plan_this_period, 'plan_credit',
                  'Membership credit returned — ' || v_sail.title, old.episode_id, old.profile_id);
        end if;
      end if;

      delete from public.pass_addons where rsvp_id = old.id;
      -- The daybed slot goes with the pass; its money came back with the credit
      -- above (or is forfeit inside the window, as the pass is).
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
        -- The toggle, honoured. A member who said "don't take it for me" is
        -- told the water opened and keeps their place in line; the claim is
        -- theirs to make from Passes.
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
          -- Said, not swallowed: the member learns why the line moved past them.
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
