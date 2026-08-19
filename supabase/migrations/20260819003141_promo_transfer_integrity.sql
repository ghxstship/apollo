-- 1. A discounted pass is not a comp. The aboard trigger now stands down for
--    either reason, so the checkout can post the exact discounted charge while
--    `comp` keeps meaning what it says on the roster.
create or replace function public.handle_rsvp_aboard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v record;
  m text;
begin
  if new.status = 'aboard' then
    select * into v from public.voyages where id = new.voyage_id;
    if new.boarding_code is null then
      select member_no into m from public.profiles where id = new.profile_id;
      new.boarding_code := 'LS-' || upper(left(regexp_replace(v.slug,'[^a-zA-Z]','','g'),4))
        || '-' || to_char(v.starts_at,'MMDD') || '-' || right(coalesce(m,'0000'),4);
      update public.rsvps set boarding_code = new.boarding_code where id = new.id and boarding_code is null;
    end if;
    if not exists (select 1 from public.fathoms_ledger
                   where profile_id = new.profile_id and voyage_id = new.voyage_id
                     and reason in ('Berth confirmed','Pass confirmed')) then
      insert into public.fathoms_ledger (profile_id, delta, reason, voyage_id)
      values (new.profile_id, 25, 'Pass confirmed', new.voyage_id);
      insert into public.notifications (profile_id, kind, title, body)
      values (new.profile_id, 'manifest', 'You''re aboard: ' || v.title,
              'Pass confirmed. Gangway details land 48 hours before departure.');
      -- Comped or coded: the checkout posts the exact figure itself.
      if not new.comp and new.promo_code is null then
        if v.price_cents > 0 and not exists (select 1 from public.account_ledger where rsvp_id = new.id and kind = 'berth') then
          insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id, created_by)
          values (new.profile_id, -v.price_cents, 'berth', v.title, v.id, new.id, new.profile_id);
        end if;
        if v.deposit_required and not exists (select 1 from public.account_ledger where rsvp_id = new.id and kind = 'deposit') then
          insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id, created_by)
          values (new.profile_id, -5000, 'deposit', 'Pass deposit — credited to the galley aboard', v.id, new.id, new.profile_id);
        end if;
      end if;
      insert into public.email_outbox (to_email, template, payload)
      select p.email, 'boarding-pass',
             jsonb_build_object('name', p.full_name, 'voyage', v.title, 'starts_at', v.starts_at,
                                'code', new.boarding_code, 'muster', coalesce(v.muster,'Gangway B-12'))
      from public.profiles p where p.id = new.profile_id and p.email is not null;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.handle_rsvp_aboard() from public, anon, authenticated;

-- 2. Code usage counts itself; the Bridge no longer has to reconcile by hand.
create or replace function public.count_promo_use()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.promo_code is not null and (tg_op = 'INSERT' or old.promo_code is distinct from new.promo_code) then
    update public.promo_codes set uses = uses + 1 where code = new.promo_code;
  end if;
  return new;
end $$;
create trigger on_rsvp_promo_used
after insert or update of promo_code on public.rsvps
for each row execute function public.count_promo_use();
revoke execute on function public.count_promo_use() from public, anon, authenticated;

-- 3. A handed-over pass gets its own code, and does not inherit the old
--    member's guests.
create or replace function public.accept_pass_transfer(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t record; v record; net int; m text; new_code text;
begin
  select * into t from public.pass_transfers where id = p_id and status = 'offered';
  if t.id is null then raise exception 'no offer to accept'; end if;
  if t.to_profile <> auth.uid() then raise exception 'that offer is not yours'; end if;
  select v2.* into v from public.rsvps r join public.voyages v2 on v2.id = r.voyage_id where r.id = t.rsvp_id;
  select coalesce(-sum(delta_cents), 0) into net from public.account_ledger
   where rsvp_id = t.rsvp_id and delta_cents < 0;
  select member_no into m from public.profiles where id = t.to_profile;
  new_code := 'LS-' || upper(left(regexp_replace(v.slug,'[^a-zA-Z]','','g'),4))
    || '-' || to_char(v.starts_at,'MMDD') || '-' || right(coalesce(m,'0000'),4);
  update public.rsvps
     set profile_id = t.to_profile, boarding_code = new_code,
         checked_in_at = null, checked_in_by = null, guest_names = '{}', guests = 0
   where id = t.rsvp_id;
  delete from public.rsvp_guests where rsvp_id = t.rsvp_id;
  if net > 0 then
    insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id)
    values (t.from_profile, net, 'credit', 'Pass handed to a member — ' || v.title, v.id, t.rsvp_id),
           (t.to_profile, -net, 'berth', 'Pass taken over — ' || v.title, v.id, t.rsvp_id);
  end if;
  update public.pass_transfers set status = 'accepted', responded_at = now() where id = p_id;
  insert into public.notifications (profile_id, kind, title, body)
  values (t.from_profile, 'manifest', 'Your pass changed hands.',
          'It is off your manifest and your account is squared.'),
         (t.to_profile, 'manifest', 'A pass is yours: ' || v.title,
          'Your code is ' || new_code || '. Guests are yours to name again.');
end $$;
revoke execute on function public.accept_pass_transfer(uuid) from public, anon;
grant execute on function public.accept_pass_transfer(uuid) to authenticated;
