-- The fleet and the approved frames are marketing, not member data. Reading
-- them should not require a service-role key on a public page.
drop policy if exists "members read fleet" on public.vessels;
create policy "the fleet is public" on public.vessels for select using (true);

drop policy if exists "members read flotilla" on public.voyage_vessels;
create policy "the flotilla is public" on public.voyage_vessels for select using (true);

drop policy if exists "members read approved media" on public.voyage_media;
create policy "approved frames are public" on public.voyage_media
  for select using (approved or uploaded_by = auth.uid() or public.is_staff());
