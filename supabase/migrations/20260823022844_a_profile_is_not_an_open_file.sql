-- "members read profiles" was SELECT USING (true), and RLS has no column
-- granularity — so every authenticated member could read every other member's
-- email, phone, stripe_customer_id and, worst of all, calendar_token.
--
-- calendar_token is the whole credential on /api/calendar/[token], which is
-- unauthenticated and embeds rsvps.boarding_code in every event. So the
-- boarding-code fix was walked straight around: a member who could not read
-- another member's boarding_code from the table simply read their season feed
-- instead. /card even promises "this address is yours alone".
--
-- The table closes to its owner and the Bridge. What members are meant to see
-- of each other moves to a view with an explicit column list, so a column added
-- to profiles later is private until deliberately published here. The view's
-- final shape (with the directory opt-out enforced) lands in the migration that
-- follows.
drop policy if exists "members read profiles" on public.profiles;

create policy "own profile or staff" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_staff());
