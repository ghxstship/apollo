-- voyage_media had INSERT for members and ALL for staff, and nothing else.
-- A member could see their own frame and neither withdraw nor amend it: the
-- DELETE and PATCH returned 200 with an empty array, the silent no-op that
-- reads as success. For a club that photographs its members, the person who
-- sent a frame up must be able to take it down — consent is not a one-way
-- door, and it should not require finding a staff member.
drop policy if exists "the uploader withdraws their own frame" on public.voyage_media;
create policy "the uploader withdraws their own frame" on public.voyage_media
  for delete to authenticated
  using (uploaded_by = auth.uid());

drop policy if exists "the uploader amends their own frame" on public.voyage_media;
create policy "the uploader amends their own frame" on public.voyage_media
  for update to authenticated
  using (uploaded_by = auth.uid())
  with check (uploaded_by = auth.uid());

-- An UPDATE policy is row-wide; the columns need their own guard, and it has
-- to be a trigger rather than a column grant, because staff are `authenticated`
-- too and a grant would disarm the Bridge.
create or replace function public.guard_own_frame()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.is_staff() then return new; end if;
  new.id           := old.id;
  new.voyage_id    := old.voyage_id;
  new.storage_path := old.storage_path;
  new.uploaded_by  := old.uploaded_by;
  new.created_at   := old.created_at;
  new.approved     := false;
  return new;
end;
$$;

revoke execute on function public.guard_own_frame() from public, anon, authenticated;

drop trigger if exists guard_own_frame on public.voyage_media;
create trigger guard_own_frame
  before update on public.voyage_media
  for each row execute function public.guard_own_frame();
