-- invites is keyed on (code) and nothing bounds it per member. mintInvite
-- inserts a fresh row on every call, and the INSERT policy asks only that the
-- inviter be yourself, active, and that the code be shaped right — so a member
-- could hold a hundred codes, each good for three admissions, and the club's
-- door supply would be whatever a loop felt like.
--
-- The read is NOT the defect it was reported as. /you already asks for
-- .order(created_at desc).limit(1).maybeSingle(), and PostgREST cannot raise
-- PGRST116 on a query that asked for one row. Nobody's portal is going to 500.
-- Zero members hold more than one invite today, so this closes a door before
-- anyone walks through it rather than after.
--
-- The rule is one LIVE invite, not one ever: the screen shows a single code
-- and its signatures, and a member whose code is spent should not be barred
-- from the database's side if the product later decides to hand them another.
-- What must never happen is two live codes at once.
create unique index if not exists invites_one_live_per_inviter
  on public.invites (inviter_id) where (uses < max_uses);

comment on index public.invites_one_live_per_inviter is
  'A member holds one invite that still has a signature left in it. A spent code does not block a new one; two live codes at once is what this refuses.';
