-- Three faults on one table, the first of them theft.
--
-- 1. `parties update transfers` is USING (from_profile = auth.uid() OR
--    to_profile = auth.uid() OR is_staff()) WITH CHECK NULL. A row-level test
--    with no WITH CHECK only asks that you were a party BEFORE the edit — so a
--    member could mint an offer to themselves, PATCH rsvp_id and from_profile
--    to point at somebody else's pass, and accept it. The pass moved, a new
--    boarding code was cut, the guests were wiped, and the victim's account
--    took the swing. accept_pass_transfer re-checked that the holder matched
--    from_profile, which is exactly what the attacker had just rewritten.
--    Any pass whose rsvp id was learnable — and every offer ever sent to you
--    exposes one — could be taken.
--
--    The same hole revived cancelled and declined offers by PATCHing the
--    status back to 'offered'.
--
-- 2. My own sibling-void from "a pass changes hands once" wrote status 'void',
--    which pass_transfers_status_check does not allow. So that leg was inert,
--    and worse: with two offers standing on one pass EVERY accept aborted on
--    the constraint and leaked the raw Postgres detail to the client. Offering
--    one pass to two people was a complete denial of hand-off. Written without
--    reading the constraint on the table I was writing to.
--
-- 3. accept_pass_transfer never checked the pass was still aboard. The release
--    credit carries no rsvp_id, so `net` — which sums only negative rows by
--    rsvp_id — could not see it: book, offer, release (credited in full), then
--    have the offer accepted, and the offerer is credited a second time out of
--    nothing. Two accounts, +$200 a cycle, no staff.

alter table public.pass_transfers drop constraint if exists pass_transfers_status_check;
alter table public.pass_transfers add constraint pass_transfers_status_check
  check (status in ('offered', 'accepted', 'declined', 'cancelled', 'void'));

create or replace function public.guard_pass_transfer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.is_staff() then return new; end if;

  -- An offer names one pass, from one member, to one member. Those are settled
  -- when it is made.
  if new.rsvp_id      is distinct from old.rsvp_id
     or new.from_profile is distinct from old.from_profile
     or new.to_profile   is distinct from old.to_profile then
    raise exception 'an offer cannot be pointed at a different pass';
  end if;

  -- An offer is answered once. Nothing comes back from an answer.
  if new.status = 'offered' and old.status <> 'offered' then
    raise exception 'that offer has already been answered';
  end if;

  -- Each party may only write their own half of the answer.
  if new.status is distinct from old.status then
    if new.status = 'cancelled' and old.from_profile <> auth.uid() then
      raise exception 'only the member who offered it can withdraw it';
    end if;
    if new.status in ('accepted', 'declined') and old.to_profile <> auth.uid() then
      raise exception 'that offer is not yours to answer';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_pass_transfer() from public, anon, authenticated;

drop trigger if exists guard_pass_transfer on public.pass_transfers;
create trigger guard_pass_transfer
  before update on public.pass_transfers
  for each row execute function public.guard_pass_transfer();

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

  -- Still theirs, and still a live pass. A released pass has already been
  -- credited back, so handing it on would credit it a second time.
  select r.profile_id, r.status into holder, holder_status
    from public.rsvps r where r.id = t.rsvp_id for update;
  if holder is null then raise exception 'that pass is gone'; end if;
  if holder <> t.from_profile then
    update public.pass_transfers set status = 'void', responded_at = now() where id = p_id;
    raise exception 'that pass has already changed hands';
  end if;
  if holder_status <> 'aboard' then
    update public.pass_transfers set status = 'void', responded_at = now() where id = p_id;
    raise exception 'that pass has been released — there is nothing to take over';
  end if;

  select v2.* into v from public.rsvps r join public.voyages v2 on v2.id = r.voyage_id
   where r.id = t.rsvp_id;

  -- The NET of what the offerer stands out of pocket on this pass, not the sum
  -- of the charges: a credit already given back has to count against it.
  select coalesce(-sum(delta_cents), 0) into net from public.account_ledger
   where profile_id = t.from_profile
     and (rsvp_id = t.rsvp_id or (rsvp_id is null and voyage_id = v.id));

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
