-- A membership hold did nothing. profiles.status ('active' | 'paused' |
-- 'departed') was read by exactly one banner on /you and by no gate anywhere:
-- not middleware, not getMember(), not a server action, not a single policy. So
-- a member on a weather hold — or one the Bridge put on hold — kept booking
-- passes, posting to the Open Deck, entering regattas, taking chairs, minting
-- invites and running up house charges.
--
-- The gate belongs in RLS, because that is the only layer every path crosses.
-- is_active() mirrors is_staff(): definer, so it reads profiles without the
-- caller needing to, and pinned search_path.
create or replace function public.is_active()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active'
  );
$$;

revoke execute on function public.is_active() from public, anon;
grant execute on function public.is_active() to authenticated;

comment on function public.is_active() is
  'True when the caller''s membership is active. Guards every act-as-a-member write; a hold is meant to hold.';

-- Acting as a member: each of these is something a held membership must not do.
-- Reads are untouched — a paused member still sees their log, their ledger and
-- what they owe, and can still settle up and resume.
alter policy "own rsvp insert"        on public.rsvps            with check (profile_id = auth.uid() and public.is_active());
alter policy "own rsvp update"        on public.rsvps            with check (profile_id = auth.uid() and public.is_active());
alter policy "members post wardroom"  on public.wardroom_posts   with check (author_id  = auth.uid() and public.is_active());
alter policy "members hail"           on public.wardroom_hails   with check (profile_id = auth.uid() and public.is_active());
alter policy "members comment"        on public.wardroom_comments with check (author_id = auth.uid() and public.is_active());
alter policy "mint own invite"        on public.invites          with check (inviter_id = auth.uid() and public.is_active());
alter policy "place shop order"       on public.shop_orders      with check (profile_id = auth.uid() and public.is_active());
alter policy "manage own crew request" on public.crew_requests   with check (profile_id = auth.uid() and public.is_active());
