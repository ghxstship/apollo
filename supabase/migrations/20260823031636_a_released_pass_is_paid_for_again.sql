-- Release, then claim again, and the sailing was free. handle_rsvp_aboard
-- wrapped EVERYTHING in one guard — "has this member ever been aboard this
-- voyage" — marked by a 'Pass confirmed' row in the knots ledger. That marker is
-- right for knots but also suppressed the berth charge, the deposit, the
-- notification and the boarding email on every later claim, while
-- handle_rsvp_release had already credited the first charge in full. Net folio
-- zero, pass in hand, repeatable per voyage.
--
-- The two concerns come apart: knots, the word and the boarding email stay once
-- per voyage; money is charged whenever nothing is outstanding on this sailing,
-- so a credited pass is paid for again and a forfeited one is not charged twice.
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
begin
  if new.status = 'aboard' then
    select * into v from public.voyages where id = new.voyage_id;

    if new.boarding_code is null then
      select member_no into m from public.profiles where id = new.profile_id;
      new.boarding_code := 'SYR-' || upper(left(regexp_replace(v.slug,'[^a-zA-Z]','','g'),4))
        || '-' || to_char(v.starts_at,'MMDD') || '-' || right(coalesce(m,'0000'),4);
      update public.rsvps set boarding_code = new.boarding_code where id = new.id and boarding_code is null;
    end if;

    v_first_time := not exists (
      select 1 from public.fathoms_ledger
      where profile_id = new.profile_id and voyage_id = new.voyage_id
        and reason in ('Berth confirmed','Pass confirmed')
    );

    if v_first_time then
      insert into public.fathoms_ledger (profile_id, delta, reason, voyage_id)
      values (new.profile_id, 25, 'Pass confirmed', new.voyage_id);
      insert into public.notifications (profile_id, kind, title, body)
      values (new.profile_id, 'manifest', 'You''re aboard: ' || v.title,
              'Pass confirmed. Gangway details land 48 hours before departure.');
      insert into public.email_outbox (to_email, template, payload)
      select p.email, 'boarding-pass',
             jsonb_build_object('name', p.full_name, 'voyage', v.title, 'starts_at', v.starts_at,
                                'code', new.boarding_code, 'muster', coalesce(v.muster,'Gangway B-12'))
      from public.profiles p where p.id = new.profile_id and p.email is not null;
    end if;

    if not new.comp and new.promo_code is null then
      select coalesce(-sum(delta_cents), 0) into v_charged
      from public.account_ledger
      where profile_id = new.profile_id and voyage_id = new.voyage_id
        and delta_cents < 0 and kind in ('berth','deposit','addon');

      select coalesce(sum(delta_cents), 0) into v_credited
      from public.account_ledger
      where profile_id = new.profile_id and voyage_id = new.voyage_id and kind = 'credit';

      if v_charged - v_credited <= 0 then
        if v.price_cents > 0 and not exists (
          select 1 from public.account_ledger where rsvp_id = new.id and kind = 'berth'
        ) then
          insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id, created_by)
          values (new.profile_id, -v.price_cents, 'berth', v.title, v.id, new.id, new.profile_id);
        end if;
        if v.deposit_required and not exists (
          select 1 from public.account_ledger where rsvp_id = new.id and kind = 'deposit'
        ) then
          insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id, created_by)
          values (new.profile_id, -5000, 'deposit', 'Pass deposit — credited to the galley aboard', v.id, new.id, new.profile_id);
        end if;
      end if;
    end if;
  end if;
  return new;
end $function$;
