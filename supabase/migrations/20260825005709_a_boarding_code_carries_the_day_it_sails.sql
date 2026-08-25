-- Boarding codes embed the departure as MMDD, built with to_char in the session
-- zone — UTC. Seven live codes carry a day the sailing does not depart on:
-- SYR-NIGH-0823-0034 for a sailing every surface calls AUG 22,
-- SYR-CHIC-0516-0033 for MAY 15.
--
-- Nothing breaks — codes are matched literally now, not parsed — so the cost is
-- a skipper at a gangway reading 0823 off a manifest headed AUG 22 and having to
-- decide which of the two to believe. On a dock, at night, that is not nothing.
--
-- Existing codes are NOT rewritten. A boarding code is printed on a stub, sent
-- in a letter, and held in a member's calendar; changing one out from under
-- somebody so it matches a manifest header is a worse failure than the header
-- disagreeing. New codes carry the day they sail.
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
        || '-' || to_char(v.starts_at at time zone coalesce(nullif(btrim(v.time_zone), ''), 'UTC'), 'MMDD')
        || '-' || right(coalesce(m,'0000'),4);
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
;
