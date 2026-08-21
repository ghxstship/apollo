-- rsvps carried no DELETE policy for anyone. A member releasing a pass sets the
-- status rather than deleting the row, which is right — the release credit and
-- the ledger both hang off that history. But it left staff unable to remove a
-- duplicate or a row created in error, with no remedy at all.
--
-- The same gap as the application and crew queues, found the same way: a cleanup
-- that silently affected nothing.
--
-- Safe because handle_rsvp_release already reconciles the house account on
-- delete — that was fixed when the FK was found clearing rsvp_id before the
-- AFTER trigger could sum the charges.

create policy "staff remove an erroneous booking" on public.rsvps
  for delete to authenticated using (public.is_staff());

create policy "staff remove a guest" on public.rsvp_guests
  for delete to authenticated using (public.is_staff());
