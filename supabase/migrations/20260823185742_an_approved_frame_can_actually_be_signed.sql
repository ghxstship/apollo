-- Making the bucket private closed the gallery. The only SELECT policy on
-- storage.objects for voyage-media is "owner or staff", and signing a URL
-- requires SELECT on the object — so createSignedUrls returned "you do not
-- have access to it" for anon and for every member who was not the uploader.
-- framesFor()/frameGroups() then dropped each frame with
-- `.filter(m => signed.has(m.storage_path))` and the surrounding catch
-- swallowed the rest, so /gallery and every charter frame strip rendered empty
-- rather than broken. The row said public and the file said no.
--
-- The row is the authority on what is public, so the object follows it: an
-- object is readable exactly when its voyage_media row is approved. Unapproved
-- and withdrawn frames stay owner-and-staff only, as before.
create policy "approved frames can be signed" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'voyage-media'
    and exists (
      select 1 from public.voyage_media m
      where m.storage_path = storage.objects.name
        and m.approved
    )
  );;
