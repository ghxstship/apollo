-- Model C made a monthly credit the entire value of a paid tier, granted it by
-- cron since 2026-09-02, and never wired anything to spend it. Its own migration
-- said so: "NOTHING DRAWS ON THIS YET." A Cabin member paying $225 booked a pass
-- and was charged full freight while $290 sat unspent and cleared on the 1st.
-- That is a refund liability accruing monthly.
--
-- A NEW LEDGER KIND, and the reason is not tidiness — it is that 'credit' is
-- load-bearing on BOTH sides of the pass lifecycle and means cash there:
--
--   handle_pass_aboard guards on `charges - credits <= 0` to decide whether a
--   pass has been billed. Post the plan credit as 'credit' and a fully covered
--   pass nets to zero, the guard reads "nothing owed", and the next trigger run
--   CHARGES IT AGAIN.
--
--   handle_pass_release computes the refund as `charges - credits`. Leave the
--   plan credit out of that sum and a member who paid $0 cash for a $290 pass is
--   refunded $290 in real account credit on release.
--
-- So plan_credit is excluded from the first sum and included in the second. One
-- word, two opposite requirements, which is exactly why it could not be 'credit'.
alter table public.account_ledger drop constraint if exists account_ledger_kind_check;
alter table public.account_ledger add constraint account_ledger_kind_check
  check (kind in ('pass','deposit','addon','galley','shop','dues','credit','refund','payment','plan_credit'));

comment on constraint account_ledger_kind_check on public.account_ledger is
  'plan_credit is membership credit applied to a pass — never cash. It offsets a charge like a credit but must never be refunded as one.';

create or replace function public.handle_pass_aboard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v record;
  m text;
  v_first_time boolean;
  v_charged int;
  v_credited int;
  v_due int;
  v_promoted boolean;
  v_plan int;
  v_period date;
begin
  if new.status = 'aboard' then
    select * into v from public.episodes where id = new.episode_id;

    v_promoted := tg_op = 'UPDATE' and old.status = 'waitlist';

    if new.boarding_code is null then
      select member_no into m from public.profiles where id = new.profile_id;
      new.boarding_code := public.mint_boarding_code(new.episode_id, m);
      update public.passes set boarding_code = new.boarding_code where id = new.id and boarding_code is null;
    end if;

    -- Net, not existence: the release reversal leaves the original row in
    -- place, so "have they ever been awarded?" answered yes forever and a
    -- member who released and re-booked sailed for no Knots at all.
    select coalesce(sum(delta), 0) <= 0 into v_first_time
    from public.knots_ledger
    where profile_id = new.profile_id and episode_id = new.episode_id
      and reason = any (public.knots_booking_reasons());

    if v_first_time then
      insert into public.knots_ledger (profile_id, delta, reason, episode_id)
      values (new.profile_id, public.club_setting('knots_pass_award'), 'Pass confirmed', new.episode_id);
      insert into public.notifications (profile_id, kind, title, body)
      values (new.profile_id, 'manifest', 'You''re aboard: ' || v.title,
              'Pass confirmed. Gangway details land 48 hours before departure.');
      if not v_promoted then
        insert into public.email_outbox (to_email, template, payload)
        select p.email, 'boarding-pass',
               jsonb_build_object('name', p.full_name, 'voyage', v.title, 'starts_at', v.starts_at,
                                  'code', new.boarding_code, 'muster', coalesce(v.muster,'Gangway B-12'))
        from public.profiles p where p.id = new.profile_id and p.email is not null;
      end if;
    end if;

    -- A comp is the Bridge's word and skips the charge. Everything else is
    -- priced here, from the catalogue and the club's own code table.
    if not coalesce(new.comp, false) then
      v_due := public.pass_price(new.episode_id, new.promo_code);

      select coalesce(-sum(delta_cents), 0) into v_charged
      from public.account_ledger
      where profile_id = new.profile_id and episode_id = new.episode_id
        and delta_cents < 0 and kind in ('pass','deposit','addon');

      /* Cash credits only. A plan credit here would make a fully covered pass
         look unbilled and bill it a second time. */
      select coalesce(sum(delta_cents), 0) into v_credited
      from public.account_ledger
      where profile_id = new.profile_id and episode_id = new.episode_id and kind = 'credit';

      if v_charged - v_credited <= 0 then
        if v_due > 0 then
          insert into public.account_ledger (profile_id, delta_cents, kind, memo, episode_id, rsvp_id, created_by)
          values (new.profile_id, -v_due, 'pass',
                  v.title || case when coalesce(btrim(new.promo_code),'') <> ''
                                  then ' — code ' || upper(btrim(new.promo_code)) else '' end,
                  v.id, new.id, new.profile_id);

          /* The draw-down. FOR UPDATE because two bookings in the same second
             would otherwise both read the same remaining balance and both spend
             it — the one place this whole feature can lose money quietly. */
          v_period := date_trunc('month', (now() at time zone 'America/New_York'))::date;
          select greatest(0, granted_cents - spent_cents) into v_plan
          from public.pass_credits
          where profile_id = new.profile_id and period = v_period
          for update;

          v_plan := least(coalesce(v_plan, 0), v_due);
          if v_plan > 0 then
            update public.pass_credits
               set spent_cents = spent_cents + v_plan
             where profile_id = new.profile_id and period = v_period;

            insert into public.account_ledger (profile_id, delta_cents, kind, memo, episode_id, rsvp_id, created_by)
            values (new.profile_id, v_plan, 'plan_credit',
                    'Membership credit — ' || v.title, v.id, new.id, new.profile_id);
          end if;
        end if;
        if v.deposit_required and v.deposit_cents > 0 then
          insert into public.account_ledger (profile_id, delta_cents, kind, memo, episode_id, rsvp_id, created_by)
          values (new.profile_id, -v.deposit_cents, 'deposit', 'Pass deposit — credited to the galley aboard', v.id, new.id, new.profile_id);
        end if;
      end if;
    end if;
  end if;
  return new;
end $$;

revoke execute on function public.handle_pass_aboard() from public, anon, authenticated;;
