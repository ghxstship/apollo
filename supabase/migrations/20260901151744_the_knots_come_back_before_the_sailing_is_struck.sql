/* Deleting a voyage with live passes leaked the booking knots. The chain:
   fathoms_ledger.voyage_id is ON DELETE SET NULL, and referential actions run
   before the rsvps CASCADE fires return_knots_with_the_pass — so by the time
   the reversal trigger summed 'Pass confirmed' rows for (member, voyage), the
   earn-rows had already been anonymised to null and the sum was zero. The e2e
   suite works around it by deleting passes before sailings and says so in its
   comments; the product's delete path had no such ordering.

   The reversal now happens where the rows still carry their tags: BEFORE
   DELETE on the voyage itself, one net reversal per member holding an aboard
   pass, mirroring return_knots_with_the_pass' arithmetic exactly. The rsvps
   cascade then finds nothing left to reverse (the reversal row zeroes the
   net), so nothing double-pays. */

create or replace function public.the_knots_leave_before_the_ship()
returns trigger language plpgsql security definer set search_path to 'public'
as $fn$
declare m record; awarded int;
begin
  for m in
    select distinct r.profile_id from public.rsvps r
    where r.voyage_id = old.id and r.status = 'aboard'
  loop
    select coalesce(sum(delta), 0) into awarded
    from public.fathoms_ledger
    where profile_id = m.profile_id and voyage_id = old.id
      and reason in ('Berth confirmed', 'Pass confirmed', 'Pass released');
    if awarded > 0 then
      insert into public.fathoms_ledger (profile_id, delta, reason, voyage_id)
      values (m.profile_id, -awarded, 'Pass released', old.id);
    end if;
  end loop;
  return old;
end $fn$;

drop trigger if exists the_knots_leave_before_the_ship on public.voyages;
create trigger the_knots_leave_before_the_ship
  before delete on public.voyages
  for each row execute function public.the_knots_leave_before_the_ship();;
