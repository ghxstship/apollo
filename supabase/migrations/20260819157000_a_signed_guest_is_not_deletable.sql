-- signatures.guest_id was ON DELETE SET NULL, which is wrong on reflection.
--
-- A guest signature is a record ABOUT that guest. Severing the link does not
-- tidy anything: it strands a signature whose only remaining identification is a
-- free-text name, and — because the uniqueness key is (version, profile, guest)
-- with NULLS NOT DISTINCT — a second stranded signature on the same version
-- collides with the first. Deleting one guest could therefore make deleting the
-- next one impossible, with an error from a table nobody touched.
--
-- RESTRICT states the actual rule: a guest who has signed cannot be removed,
-- because the club is holding their signature. The order is redact, then let the
-- retention purge remove the signature, after which the guest row goes freely.

alter table public.signatures
  drop constraint if exists signatures_guest_id_fkey;

alter table public.signatures
  add constraint signatures_guest_id_fkey
  foreign key (guest_id) references public.rsvp_guests (id) on delete restrict;

comment on column public.signatures.guest_id is
  'RESTRICT: a guest who has signed is retained as long as the signature is.';
