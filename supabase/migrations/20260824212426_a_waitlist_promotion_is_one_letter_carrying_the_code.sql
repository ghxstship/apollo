-- The second half of the pair. See the previous migration for why.
--
-- handle_rsvp_aboard holds its boarding-pass letter when the row it is
-- promoting came from the waitlist: that member is about to get a letter that
-- can say WHY a pass suddenly exists, and this one cannot. It is not being
-- silenced by another trigger — it knows a promotion is somebody else's news.
--
-- Everything else about the aboard path is untouched, including the letter for
-- an ordinary booking.
create or replace function public.handle_rsvp_aboard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v record;
  m text;
  v_first_time boolean;
  v_charged int;
  v_credited int;
  v_due int;
  v_promoted boolean;
begin
  if new.status = 'aboard' then
    select * into v from public.voyages where id = new.voyage_id;

    v_promoted := tg_op = 'UPDATE' and old.status = 'waitlist';

    if new.boarding_code is null then
      select member_no into m from public.profiles where id = new.profile_id;
      new.boarding_code := 'SYR-' || upper(left(regexp_replace(v.slug,'[^a-zA-Z]','','g'),4))
        || '-' || to_char(v.starts_at,'MMDD') || '-' || right(coalesce(m,'0000'),4);
      update public.rsvps set boarding_code = new.boarding_code where id = new.id and boarding_code is null;
    end if;

    -- Net, not existence: the release reversal leaves the original row in
    -- place, so "have they ever been awarded?" answered yes forever and a
    -- member who released and re-booked sailed for no Knots at all.
    select coalesce(sum(delta), 0) <= 0 into v_first_time
    from public.fathoms_ledger
    where profile_id = new.profile_id and voyage_id = new.voyage_id
      and reason in ('Berth confirmed','Pass confirmed','Pass released');

    if v_first_time then
      insert into public.fathoms_ledger (profile_id, delta, reason, voyage_id)
      values (new.profile_id, 25, 'Pass confirmed', new.voyage_id);
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
      v_due := public.pass_price(new.voyage_id, new.promo_code);

      select coalesce(-sum(delta_cents), 0) into v_charged
      from public.account_ledger
      where profile_id = new.profile_id and voyage_id = new.voyage_id
        and delta_cents < 0 and kind in ('berth','deposit','addon');

      select coalesce(sum(delta_cents), 0) into v_credited
      from public.account_ledger
      where profile_id = new.profile_id and voyage_id = new.voyage_id and kind = 'credit';

      if v_charged - v_credited <= 0 then
        if v_due > 0 then
          insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id, created_by)
          values (new.profile_id, -v_due, 'berth',
                  v.title || case when coalesce(btrim(new.promo_code),'') <> ''
                                  then ' — code ' || upper(btrim(new.promo_code)) else '' end,
                  v.id, new.id, new.profile_id);
        end if;
        if v.deposit_required then
          insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id, created_by)
          values (new.profile_id, -5000, 'deposit', 'Pass deposit — credited to the galley aboard', v.id, new.id, new.profile_id);
        end if;
      end if;
    end if;
  end if;
  return new;
end $function$;

-- And the release handler's letter now carries what the suppressed one used to:
-- the boarding code and the muster, read back off the row after the promotion
-- has generated them. It also honours the "Pass releases" switch, which it
-- governed for the in-app notice and not for the post.
create or replace function public.handle_rsvp_release()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  nextup record; charges int; credits int; credit_due int; promoted record;
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

      -- Credited back means given back: the extras go with the pass, or the
      -- next booking gets them for nothing.
      delete from public.rsvp_addons where rsvp_id = old.id;

      -- And a plan paying down a pass nobody holds stops paying it down.
      update public.installment_plans
         set status = 'cancelled', next_charge_at = null
       where rsvp_id = old.id and status = 'active';

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

          -- Read the code back: the promotion above generated it.
          select r.boarding_code into promoted from public.rsvps r where r.id = nextup.id;

          insert into public.email_outbox (to_email, template, payload)
          select nextup.email, 'waitlist-release',
                 jsonb_build_object('name', nextup.full_name, 'voyage', v.title, 'starts_at', v.starts_at,
                                    'code', promoted.boarding_code,
                                    'muster', coalesce(v.muster, 'Gangway B-12'))
          from public.voyages v where v.id = old.voyage_id and nextup.email is not null;
        end if;
        exit;
      end loop;
    end if;
  end if;
  return coalesce(new, old);
end
$function$;
;
