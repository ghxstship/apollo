-- Boarding codes were looked up with ilike(), where % and _ are WILDCARDS.
-- A QR encoding `SYR-NIGH-0823-003%` matched whatever it resolved to and
-- boarded that person. A scanned value is untrusted input, and this is the one
-- place in the club where a scanned value becomes a person walking aboard.
--
-- The lookup is now upper() + eq(), which asks the real question and leaves no
-- pattern syntax in play. That makes the match DEPEND on every stored code
-- being upper-case. Today all fifty are, and the generators build them with
-- upper() — but "true when I looked" is not the same as "true", and a lookup
-- that silently stops matching would strand somebody at a gangway rather than
-- throw. So the assumption is written into the table instead of resting on my
-- having checked it once.
alter table public.rsvps
  drop constraint if exists rsvps_boarding_code_is_plain;
alter table public.rsvps
  add constraint rsvps_boarding_code_is_plain
  check (boarding_code is null or boarding_code = upper(btrim(boarding_code)));

alter table public.rsvp_guests
  drop constraint if exists rsvp_guests_boarding_code_is_plain;
alter table public.rsvp_guests
  add constraint rsvp_guests_boarding_code_is_plain
  check (boarding_code is null or boarding_code = upper(btrim(boarding_code)));
;
