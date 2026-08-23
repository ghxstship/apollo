-- Detaching a guest from a released pass keeps the row and its signature, but
-- every policy on rsvp_guests reaches the caller through rsvps — so a row with a
-- null rsvp_id became invisible to everyone including the Bridge. A record
-- nobody can read is not a record.
alter policy "host manages own guests" on public.rsvp_guests
using (
  exists (
    select 1 from public.rsvps r
    where r.id = rsvp_guests.rsvp_id
      and (r.profile_id = auth.uid() or public.is_staff())
  )
  or (rsvp_guests.rsvp_id is null and public.is_staff())
)
with check (
  exists (
    select 1 from public.rsvps r
    where r.id = rsvp_guests.rsvp_id
      and (r.profile_id = auth.uid() or public.is_staff())
  )
);
