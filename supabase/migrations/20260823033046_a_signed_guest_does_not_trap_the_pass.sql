-- A Global member whose guest actually signed could never release their pass.
-- rsvp_guests cascades from rsvps, but signatures.guest_id is ON DELETE RESTRICT
-- — deliberately — so the delete aborted and Postgres's raw foreign-key text was
-- shown to the member. The 48-hour credit window then ran out on someone trying
-- to give the pass back.
--
-- The signature stays untouchable. What gives is the link to the pass: a guest
-- row survives its rsvp and is simply no longer on one.
alter table public.rsvp_guests alter column rsvp_id drop not null;

alter table public.rsvp_guests
  drop constraint if exists rsvp_guests_rsvp_id_fkey;
alter table public.rsvp_guests
  add constraint rsvp_guests_rsvp_id_fkey
  foreign key (rsvp_id) references public.rsvps(id) on delete set null;

comment on column public.rsvp_guests.rsvp_id is
  'Null once the pass is released — the guest row and its signature are the record, and outlive the pass they rode on.';
