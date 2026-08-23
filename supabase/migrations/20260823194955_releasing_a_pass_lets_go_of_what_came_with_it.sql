-- Releasing a pass credited back the berth AND the add-ons, then left the
-- rsvp_addons rows attached. Rebooking re-charged only the berth, because
-- attach_addons skips anything already attached — so the add-ons came back
-- free. aboard → not_going → aboard, once per add-on per voyage, no staff
-- involved: a $57 crate and wool layer for nothing.
--
-- An installment plan on the released pass kept its own schedule. Nothing in
-- the codebase cancelled one, and draw_installments posted the next slice with
-- voyage_id NULL — invisible to both the release credit and the "already
-- charged?" check — so a cancelled $500 booking went on billing $125 a time.
--
-- What is credited back is let go of.
create or replace function public.handle_rsvp_release()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
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
end
$$;

-- A per-sailing promo code priced every sailing. check_promo() — what the UI
-- calls — refused it correctly; pass_price(), which sets the actual charge, had
-- no voyage filter, and a member holding a real JWT talks to PostgREST, not to
-- the UI. Latent only because every code seeded so far is unscoped.
create or replace function public.pass_price(p_voyage uuid, p_promo text default null)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_price int; v_kind text; v_value int;
begin
  select price_cents into v_price from public.voyages where id = p_voyage;
  if v_price is null then return 0; end if;
  if coalesce(btrim(p_promo), '') = '' then return v_price; end if;

  select kind, value into v_kind, v_value
  from public.promo_codes
  where upper(code) = upper(btrim(p_promo))
    and active
    and (expires_at is null or expires_at > now())
    and (max_uses is null or uses < max_uses)
    and (voyage_id is null or voyage_id = p_voyage);

  if v_kind is null then return v_price; end if;
  if v_kind = 'comp' then return 0; end if;
  if v_kind = 'percent' then
    return greatest(0, v_price - round(v_price * greatest(0, v_value) / 100.0)::int);
  end if;
  return greatest(0, v_price - greatest(0, v_value));
end;
$$;

-- A draw against a pass belongs to that pass's sailing, or neither the release
-- credit nor the already-charged check can see it.
create or replace function public.draw_installments()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare p record; per int; drawn int := 0;
begin
  for p in
    select ip.*, r.voyage_id
    from public.installment_plans ip
    left join public.rsvps r on r.id = ip.rsvp_id
    where ip.status = 'active'
      and ip.next_charge_at is not null
      and ip.next_charge_at <= now()
      and ip.paid_count < ip.installments
    for update of ip
  loop
    per := ceil((p.total_cents - p.down_payment_cents)::numeric
                / greatest(1, p.installments - 1))::int;

    insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id)
    values (p.profile_id, -per, 'berth',
            'Installment ' || (p.paid_count + 1) || ' of ' || p.installments,
            p.voyage_id, p.rsvp_id);

    update public.installment_plans
       set paid_count = paid_count + 1,
           next_charge_at = case when paid_count + 1 >= installments
                                 then null else now() + interval '30 days' end,
           status = case when paid_count + 1 >= installments then 'settled' else status end
     where id = p.id;

    drawn := drawn + 1;
  end loop;
  return drawn;
end;
$$;

revoke execute on function public.draw_installments() from public, anon, authenticated;;
