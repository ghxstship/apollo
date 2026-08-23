-- rsvp_guests.sign_token is a bearer credential: whoever holds it can open and
-- sign that guest's waiver. The "members read guests" policy was SELECT USING
-- (true), so every authenticated member could enumerate every guest's token and
-- sign on their behalf. Nothing needs that breadth — the manifest only reads the
-- member's own aboard passes, and /stub/[code] already refuses a stub whose rsvp
-- is not yours ("a stub belongs to its host alone"). The existing
-- "host manages own guests" ALL policy (host or staff) governs SELECT correctly
-- once the permissive one is gone.
drop policy if exists "members read guests" on public.rsvp_guests;
