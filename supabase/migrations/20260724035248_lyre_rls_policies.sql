-- voyage_capacity must be readable by anon (marketing shows berths left)
-- without exposing rsvp rows: aggregate-only, so definer semantics are intentional.
alter view public.voyage_capacity set (security_invoker = off);

alter table public.harbors enable row level security;
alter table public.profiles enable row level security;
alter table public.voyages enable row level security;
alter table public.rsvps enable row level security;
alter table public.fathoms_ledger enable row level security;
alter table public.wardroom_posts enable row level security;
alter table public.wardroom_hails enable row level security;
alter table public.wardroom_comments enable row level security;
alter table public.dispatch_posts enable row level security;
alter table public.applications enable row level security;
alter table public.notifications enable row level security;

-- Public content
create policy "harbors are public" on public.harbors for select using (true);
create policy "voyages are public" on public.voyages for select using (true);
create policy "dispatch is public" on public.dispatch_posts for select using (true);

-- Profiles: members can see the roll; owners edit themselves
create policy "members read profiles" on public.profiles
  for select to authenticated using (true);
create policy "own profile update" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- RSVPs: members see the manifest; manage only their own berth
create policy "members read manifest" on public.rsvps
  for select to authenticated using (true);
create policy "own rsvp insert" on public.rsvps
  for insert to authenticated with check (profile_id = auth.uid());
create policy "own rsvp update" on public.rsvps
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "own rsvp delete" on public.rsvps
  for delete to authenticated using (profile_id = auth.uid());

-- Fathoms: read your own ledger (writes happen in definer triggers)
create policy "own fathoms" on public.fathoms_ledger
  for select to authenticated using (profile_id = auth.uid());

-- Wardroom: members-only feed
create policy "members read wardroom" on public.wardroom_posts
  for select to authenticated using (true);
create policy "members post wardroom" on public.wardroom_posts
  for insert to authenticated with check (author_id = auth.uid());
create policy "own post delete" on public.wardroom_posts
  for delete to authenticated using (author_id = auth.uid());
create policy "members read hails" on public.wardroom_hails
  for select to authenticated using (true);
create policy "members hail" on public.wardroom_hails
  for insert to authenticated with check (profile_id = auth.uid());
create policy "unhail" on public.wardroom_hails
  for delete to authenticated using (profile_id = auth.uid());
create policy "members read comments" on public.wardroom_comments
  for select to authenticated using (true);
create policy "members comment" on public.wardroom_comments
  for insert to authenticated with check (author_id = auth.uid());
create policy "own comment delete" on public.wardroom_comments
  for delete to authenticated using (author_id = auth.uid());

-- Applications: anyone may apply; nobody reads them from the client
create policy "anyone applies" on public.applications
  for insert to anon, authenticated with check (true);

-- Word inbox: strictly personal
create policy "own notifications" on public.notifications
  for select to authenticated using (profile_id = auth.uid());
create policy "mark word read" on public.notifications
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
