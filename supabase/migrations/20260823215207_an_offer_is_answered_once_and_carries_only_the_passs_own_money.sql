-- Five faults, four of them mine from last round.
--
-- 1. Widening `net` to `rsvp_id = … or (rsvp_id is null and voyage_id = …)`
--    swept in every rsvp-less ledger row on that voyage — and galley orders are
--    exactly that shape. A member ran up $58 at the bar, handed on a COMP pass,
--    and was credited the bar tab while the acceptor was billed $58 for a pass
--    that cost nothing. `cap` did not stop it because cap is the voyage's LIST
--    price, so any comped or discounted pass leaves headroom. A pass's money is
--    the money booked against that pass.
--
-- 2. `update … set status = 'void'` immediately before `raise exception` is
--    rolled back by the exception. Both legs were dead. The status is now
--    settled where the pass actually moves or is released, not in a doomed
--    branch.
--
-- 3. The guard did not cover the primary key, so an offerer could rewrite `id`
--    on a live offer and silently invalidate the accept link.
--
-- 4. A recipient could PATCH status straight to 'accepted': the offer read
--    answered, the pass never moved, no ledger legs, responded_at null, and
--    accept_pass_transfer then said 'no offer to accept'. The record lied.
--    Answering an offer is what the RPC does; the status is not free text.
--
-- 5. The policy still had a NULL WITH CHECK, which is how the theft worked. The
--    trigger closed it, but a trigger should be the second lock, not the only
--    one.
drop policy if exists "parties update transfers" on public.pass_transfers;
create policy "parties update transfers" on public.pass_transfers
  for update to authenticated
  using (from_profile = auth.uid() or to_profile = auth.uid() or public.is_staff())
  with check (from_profile = auth.uid() or to_profile = auth.uid() or public.is_staff());

drop policy if exists "withdraw your own offer" on public.pass_transfers;
create policy "withdraw your own offer" on public.pass_transfers
  for delete to authenticated
  using ((from_profile = auth.uid() and status = 'offered') or public.is_staff());

create or replace function public.guard_pass_transfer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.is_staff() then return new; end if;

  if new.id           is distinct from old.id
     or new.rsvp_id      is distinct from old.rsvp_id
     or new.from_profile is distinct from old.from_profile
     or new.to_profile   is distinct from old.to_profile then
    raise exception 'an offer cannot be pointed at a different pass';
  end if;

  if new.status = 'offered' and old.status <> 'offered' then
    raise exception 'that offer has already been answered';
  end if;

  if new.status is distinct from old.status then
    -- Accepting is what accept_pass_transfer does, and it does more than set a
    -- word: writing the word by hand left an answered offer and an unmoved pass.
    if new.status = 'accepted'
       and coalesce(current_setting('app.accepting_pass', true), 'off') <> 'on' then
      raise exception 'a pass is taken over from your manifest, not by hand';
    end if;
    if new.status = 'cancelled' and old.from_profile <> auth.uid() then
      raise exception 'only the member who offered it can withdraw it';
    end if;
    if new.status = 'declined' and old.to_profile <> auth.uid() then
      raise exception 'that offer is not yours to answer';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.accept_pass_transfer(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare t record; v record; net int; cap int; m text; holder uuid; holder_status rsvp_status; new_code text;
begin
  select * into t from public.pass_transfers
   where id = p_id and status = 'offered'
   for update;
  if t.id is null then raise exception 'no offer to accept'; end if;
  if t.to_profile <> auth.uid() then raise exception 'that offer is not yours'; end if;
  if not public.is_active() then raise exception 'your membership is on hold'; end if;

  select r.profile_id, r.status into holder, holder_status
    from public.rsvps r where r.id = t.rsvp_id for update;
  if holder is null then raise exception 'that pass is gone'; end if;
  if holder <> t.from_profile then
    raise exception 'that pass has already changed hands';
  end if;
  if holder_status <> 'aboard' then
    raise exception 'that pass has been released — there is nothing to take over';
  end if;

  select v2.* into v from public.rsvps r join public.voyages v2 on v2.id = r.voyage_id
   where r.id = t.rsvp_id;

  -- One pass to a member on a sailing. Say so rather than letting the unique
  -- index answer in Postgres's words.
  if exists (
    select 1 from public.rsvps r
    where r.voyage_id = v.id and r.profile_id = t.to_profile and r.id <> t.rsvp_id
  ) then
    raise exception 'you already hold a pass on that sailing';
  end if;

  -- The money booked against THIS pass, charges net of credits. Nothing that
  -- merely happened on the same voyage.
  select coalesce(-sum(delta_cents), 0) into net
    from public.account_ledger
   where rsvp_id = t.rsvp_id
     and profile_id = t.from_profile
     and kind in ('berth', 'deposit', 'addon', 'credit');

  select coalesce(v.price_cents, 0)
       + (case when v.deposit_required then 5000 else 0 end)
       + coalesce((
           select sum(a.price_cents * ra.qty)
           from public.rsvp_addons ra join public.addons a on a.id = ra.addon_id
           where ra.rsvp_id = t.rsvp_id
         ), 0)
    into cap;

  net := least(greatest(net, 0), greatest(cap, 0));

  select member_no into m from public.profiles where id = t.to_profile;
  new_code := 'SYR-' || upper(left(regexp_replace(v.slug,'[^a-zA-Z]','','g'),4))
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

  perform set_config('app.accepting_pass', 'on', true);
  update public.pass_transfers set status = 'accepted', responded_at = now() where id = p_id;
  -- One pass, one hand-off: every other offer standing on it is spent. This
  -- runs on the success path, where it survives the transaction.
  update public.pass_transfers
     set status = 'void', responded_at = now()
   where rsvp_id = t.rsvp_id and id <> p_id and status = 'offered';
  perform set_config('app.accepting_pass', 'off', true);

  insert into public.notifications (profile_id, kind, title, body)
  values (t.from_profile, 'manifest', 'Your pass changed hands.',
          'It is off your manifest and your account is squared.'),
         (t.to_profile, 'manifest', 'A pass is yours: ' || v.title,
          'Your code is ' || new_code || '. Guests are yours to name again.');
end
$$;

revoke execute on function public.accept_pass_transfer(uuid) from public, anon;
grant execute on function public.accept_pass_transfer(uuid) to authenticated;;
