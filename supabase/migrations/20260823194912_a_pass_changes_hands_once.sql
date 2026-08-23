-- accept_pass_transfer read the offer without a lock, never re-checked that
-- the offerer still owned the pass, and never touched the other offers on it.
-- Three consequences, all reproduced:
--   * Five concurrent accepts of ONE offer all succeeded: five credits to the
--     offerer, five charges to the acceptor. A double-tap on the accept button
--     billed twice.
--   * Two offers minted on one pass could both be accepted. The offerer was
--     credited twice — `net` recomputes from their negative rows, which the
--     credit never offsets — and the first acceptor was charged for a pass the
--     second one walked away with.
--   * A stale offer stayed live after the pass had already moved on.
--
-- The row is taken under a lock, ownership is re-read at that moment, and every
-- sibling offer is voided in the same transaction.
create or replace function public.accept_pass_transfer(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare t record; v record; net int; cap int; m text; new_code text; holder uuid;
begin
  -- Take the offer, or find it already taken. FOR UPDATE serialises the
  -- concurrent accepts; the status test inside the lock is what makes the
  -- second one a no-offer rather than a second charge.
  select * into t from public.pass_transfers
   where id = p_id and status = 'offered'
   for update;
  if t.id is null then raise exception 'no offer to accept'; end if;
  if t.to_profile <> auth.uid() then raise exception 'that offer is not yours'; end if;
  if not public.is_active() then raise exception 'your membership is on hold'; end if;

  -- The pass must still belong to the person who offered it.
  select r.profile_id into holder from public.rsvps r where r.id = t.rsvp_id for update;
  if holder is null then raise exception 'that pass is gone'; end if;
  if holder <> t.from_profile then
    update public.pass_transfers set status = 'void', responded_at = now() where id = p_id;
    raise exception 'that pass has already changed hands';
  end if;

  select v2.* into v from public.rsvps r join public.voyages v2 on v2.id = r.voyage_id
   where r.id = t.rsvp_id;

  select coalesce(-sum(delta_cents), 0) into net from public.account_ledger
   where rsvp_id = t.rsvp_id and delta_cents < 0 and profile_id = t.from_profile;

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

  update public.pass_transfers set status = 'accepted', responded_at = now() where id = p_id;

  -- One pass, one hand-off. Every other offer standing on it is spent.
  update public.pass_transfers
     set status = 'void', responded_at = now()
   where rsvp_id = t.rsvp_id and id <> p_id and status = 'offered';

  insert into public.notifications (profile_id, kind, title, body)
  values (t.from_profile, 'manifest', 'Your pass changed hands.',
          'It is off your manifest and your account is squared.'),
         (t.to_profile, 'manifest', 'A pass is yours: ' || v.title,
          'Your code is ' || new_code || '. Guests are yours to name again.');
end
$$;

revoke execute on function public.accept_pass_transfer(uuid) from public, anon;
grant execute on function public.accept_pass_transfer(uuid) to authenticated;;
